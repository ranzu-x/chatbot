/**
 * CRM connections of the caller's workspace (Settings → App Integrations →
 * CRM; utils/crm.js). Credentials go in, only masked copies come out. Team
 * members need crm.create / update / delete to change them
 * (middleware/teamPermissions.js); everyone in the workspace can list them
 * (the Flow Builder's "Send to CRM" element picks one). Module
 * feature_crm_integrations.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requireModule } from "../utils/entitlements.js";
import {
  PROVIDERS, CRM_MODULE, SOURCE_FIELDS, providerCatalog, toClient, prepareConnection, sealCredentials,
  getOwnedConnection, listCrmFields, cleanSettings, syncConnection, connectionStats,
} from "../utils/crm.js";

const router = express.Router();
router.use("/crm", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), requireModule(CRM_MODULE));

const agencyOf = (req) => req.tenant?.agencyId || req.user?.agencyId;
const cleanName = (v, fallback) => String(v || "").trim().slice(0, 120) || fallback;
const MAX_CONNECTIONS = 10;

const sendError = (res, err, where) => {
  if (err.status) return res.status(err.status).json({ success: false, message: err.message });
  console.error(`${where} error:`, err);
  return res.status(500).json({ success: false, message: "Server error" });
};

router.get("/crm/connections", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM crm_connections WHERE agency_id = ? ORDER BY created_at DESC", [agencyOf(req)]);
    const [fields] = await pool.query(
      "SELECT field_key AS `key`, name FROM custom_field_definitions WHERE agency_id = ? AND is_active = 1 ORDER BY sort_order, name",
      [agencyOf(req)]
    );
    return res.json({
      success: true,
      connections: rows.map(toClient),
      providers: providerCatalog(),
      sourceFields: [...SOURCE_FIELDS, ...fields.map((f) => ({ id: `field.${f.key}`, label: `Custom field: ${f.name}` }))],
    });
  } catch (err) {
    return sendError(res, err, "GET /crm/connections");
  }
});

router.post("/crm/connections", async (req, res) => {
  try {
    const { provider, name } = req.body || {};
    if (!PROVIDERS[provider]) return res.status(400).json({ success: false, message: "Choose a CRM" });
    const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM crm_connections WHERE agency_id = ?", [agencyOf(req)]);
    if (n >= MAX_CONNECTIONS) return res.status(400).json({ success: false, message: `A workspace can have at most ${MAX_CONNECTIONS} CRM connections.` });
    const { credentials, settings } = await prepareConnection(provider, req.body?.credentials || {}, req.body?.settings || {});
    // sync_since = now: connecting never pushes the existing subscribers until asked ("Sync existing subscribers").
    const [result] = await pool.query(
      `INSERT INTO crm_connections (agency_id, provider, name, credentials, settings, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'CONNECTED', ?)`,
      [agencyOf(req), provider, cleanName(name, PROVIDERS[provider].label), sealCredentials(credentials), JSON.stringify(settings), req.user.id]
    );
    const row = await getOwnedConnection(agencyOf(req), result.insertId);
    return res.status(201).json({ success: true, connection: toClient(row), message: `${PROVIDERS[provider].label} connected` });
  } catch (err) {
    return sendError(res, err, "POST /crm/connections");
  }
});

// Credentials + settings. Credentials are re-tested only when sent.
router.put("/crm/connections/:id", async (req, res) => {
  try {
    const row = await getOwnedConnection(agencyOf(req), req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "CRM connection not found" });
    const settingsInput = req.body?.settings || {};
    let sealed = row.credentials;
    let settings;
    if (req.body?.credentials) {
      const prepared = await prepareConnection(row.provider, req.body.credentials, settingsInput, row);
      sealed = sealCredentials(prepared.credentials);
      settings = prepared.settings;
    } else {
      settings = cleanSettings(row.provider, settingsInput);
    }
    await pool.query(
      "UPDATE crm_connections SET name = ?, credentials = ?, settings = ? WHERE id = ? AND agency_id = ?",
      [cleanName(req.body?.name, row.name), sealed, JSON.stringify(settings), row.id, agencyOf(req)]
    );
    if (req.body?.credentials) await pool.query("UPDATE crm_connections SET status = 'CONNECTED', last_error = NULL WHERE id = ?", [row.id]);
    return res.json({ success: true, connection: toClient(await getOwnedConnection(agencyOf(req), row.id)), message: "Saved" });
  } catch (err) {
    return sendError(res, err, "PUT /crm/connections/:id");
  }
});

router.delete("/crm/connections/:id", async (req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM crm_connections WHERE id = ? AND agency_id = ?", [req.params.id, agencyOf(req)]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "CRM connection not found" });
    return res.json({ success: true, message: "Disconnected. Records already in your CRM stay there." });
  } catch (err) {
    return sendError(res, err, "DELETE /crm/connections/:id");
  }
});

// The CRM's own fields (for the mapping and the flow element), read live.
router.get("/crm/connections/:id/fields", async (req, res) => {
  try {
    const row = await getOwnedConnection(agencyOf(req), req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "CRM connection not found" });
    const object = PROVIDERS[row.provider]?.objects.some((o) => o.id === req.query.object) ? req.query.object : undefined;
    return res.json({ success: true, fields: await listCrmFields(row, object) });
  } catch (err) {
    return sendError(res, err, "GET /crm/connections/:id/fields");
  }
});

router.get("/crm/connections/:id/stats", async (req, res) => {
  try {
    const row = await getOwnedConnection(agencyOf(req), req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "CRM connection not found" });
    return res.json({ success: true, stats: await connectionStats(row) });
  } catch (err) {
    return sendError(res, err, "GET /crm/connections/:id/stats");
  }
});

// Re-test the saved credentials (read-only on the CRM's side).
router.post("/crm/connections/:id/test", async (req, res) => {
  try {
    const row = await getOwnedConnection(agencyOf(req), req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "CRM connection not found" });
    try {
      await listCrmFields(row);
      await pool.query("UPDATE crm_connections SET status = 'CONNECTED', last_error = NULL WHERE id = ?", [row.id]);
      return res.json({ success: true, message: "Connection works" });
    } catch (err) {
      await pool.query("UPDATE crm_connections SET status = 'ERROR', last_error = ? WHERE id = ?", [String(err.message).slice(0, 500), row.id]);
      return res.status(400).json({ success: false, message: err.message });
    }
  } catch (err) {
    return sendError(res, err, "POST /crm/connections/:id/test");
  }
});

// Include the subscribers who existed before connecting, then push a first batch now.
router.post("/crm/connections/:id/sync-existing", async (req, res) => {
  try {
    const row = await getOwnedConnection(agencyOf(req), req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "CRM connection not found" });
    await pool.query("UPDATE crm_connections SET sync_since = '2000-01-01 00:00:00' WHERE id = ?", [row.id]);
    const fresh = await getOwnedConnection(agencyOf(req), row.id);
    const first = await syncConnection(fresh, { limit: 25, deadline: Date.now() + 20_000 });
    return res.json({
      success: true,
      result: first,
      stats: await connectionStats(fresh),
      message: first.failed && !first.pushed
        ? "Couldn't push subscribers — see the errors below."
        : "Existing subscribers are being sent to your CRM (about 100 a minute).",
    });
  } catch (err) {
    return sendError(res, err, "POST /crm/connections/:id/sync-existing");
  }
});

export default router;
