/**
 * Auto Responder connections of the caller's workspace (Bot Settings → Auto
 * Responder tab; utils/autoResponders.js). Credentials go in, only masked
 * copies come out. Team members need autoresponder.create / update / delete
 * to change them (middleware/teamPermissions.js); everyone in the workspace
 * can list them (the User Input Flow builder picks one).
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import {
  PROVIDERS, providerCatalog, toClient, prepareConnection, sealCredentials,
  getOwnedAutoResponder, listProviderLists,
} from "../utils/autoResponders.js";

const router = express.Router();
router.use("/auto-responders", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

const agencyOf = (req) => req.tenant?.agencyId || req.user?.agencyId;
const cleanName = (v, fallback) => String(v || "").trim().slice(0, 120) || fallback;

router.get("/auto-responders", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM auto_responder_integrations WHERE agency_id = ? ORDER BY created_at DESC",
      [agencyOf(req)]
    );
    return res.json({ success: true, integrations: rows.map(toClient), providers: providerCatalog() });
  } catch (err) {
    console.error("GET /auto-responders error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/auto-responders", async (req, res) => {
  try {
    const { provider, name } = req.body || {};
    if (!PROVIDERS[provider]) return res.status(400).json({ success: false, message: "Choose an auto responder" });
    const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM auto_responder_integrations WHERE agency_id = ?", [agencyOf(req)]);
    if (n >= 50) return res.status(400).json({ success: false, message: "A workspace can have at most 50 auto responder connections." });
    const { credentials, settings } = await prepareConnection(provider, { ...(req.body?.credentials || {}), settings: req.body?.settings });
    const [result] = await pool.query(
      `INSERT INTO auto_responder_integrations (agency_id, provider, name, credentials, settings, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'CONNECTED', ?)`,
      [agencyOf(req), provider, cleanName(name, PROVIDERS[provider].label), sealCredentials(credentials), JSON.stringify(settings), req.user.id]
    );
    const row = await getOwnedAutoResponder(agencyOf(req), result.insertId);
    return res.status(201).json({ success: true, integration: toClient(row), message: `${PROVIDERS[provider].label} connected` });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error("POST /auto-responders error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/auto-responders/:id", async (req, res) => {
  try {
    const row = await getOwnedAutoResponder(agencyOf(req), req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Auto responder not found" });
    const input = { ...(req.body?.credentials || {}), settings: req.body?.settings };
    const { credentials, settings } = await prepareConnection(row.provider, input, row);
    await pool.query(
      `UPDATE auto_responder_integrations SET name = ?, credentials = ?, settings = ?, status = 'CONNECTED', last_error = NULL
        WHERE id = ? AND agency_id = ?`,
      [cleanName(req.body?.name, row.name), sealCredentials(credentials), JSON.stringify(settings), row.id, agencyOf(req)]
    );
    return res.json({ success: true, integration: toClient(await getOwnedAutoResponder(agencyOf(req), row.id)), message: "Saved and tested" });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error("PUT /auto-responders error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/auto-responders/:id", async (req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM auto_responder_integrations WHERE id = ? AND agency_id = ?", [req.params.id, agencyOf(req)]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Auto responder not found" });
    return res.json({ success: true, message: "Disconnected" });
  } catch (err) {
    console.error("DELETE /auto-responders error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Audiences / lists / segments to pick from (read live from the provider).
router.get("/auto-responders/:id/lists", async (req, res) => {
  try {
    const row = await getOwnedAutoResponder(agencyOf(req), req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Auto responder not found" });
    const lists = await listProviderLists(row);
    return res.json({ success: true, lists, listLabel: PROVIDERS[row.provider]?.listLabel || "List" });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error("GET /auto-responders/:id/lists error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Re-test the saved credentials (read-only on the provider's side).
router.post("/auto-responders/:id/test", async (req, res) => {
  try {
    const row = await getOwnedAutoResponder(agencyOf(req), req.params.id);
    if (!row) return res.status(404).json({ success: false, message: "Auto responder not found" });
    try {
      await listProviderLists(row);
      await pool.query("UPDATE auto_responder_integrations SET status = 'CONNECTED', last_error = NULL WHERE id = ?", [row.id]);
      return res.json({ success: true, message: "Connection works" });
    } catch (err) {
      await pool.query("UPDATE auto_responder_integrations SET status = 'ERROR', last_error = ? WHERE id = ?", [String(err.message).slice(0, 500), row.id]);
      return res.status(400).json({ success: false, message: err.message });
    }
  } catch (err) {
    console.error("POST /auto-responders/:id/test error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
