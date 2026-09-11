import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { resolveMetaAppSettings } from "../utils/appCredentials.js";

const router = express.Router();

// Scoped to this router's own path — an unscoped router.use(mw) here would
// run for EVERY /api/v1/* request that reaches this router in Express's
// middleware chain (not just this file's own routes), silently blocking
// every router mounted after it in index.js for any role other than
// AGENCY/ADMIN. Confirmed this exact bug in routes/channels.js (fixed
// alongside this one) — was blocking AGENT from ~35 unrelated routers'
// worth of endpoints (Subscribers, Appointments, Team Members, Flows,
// Canned Responses, etc.), even ones that explicitly allow AGENT in their
// own role checks.
//
// USER is included here too — ConnectAccountsPage.jsx's hub view is backed
// by GET /integrations (this is the "Connect Account" listing team members
// now have nav access to, mirrored in routes/channels.js). See
// stripSecrets() below: raw access_token/verify_token columns are redacted
// out of the response for a USER-role requester before it goes out.
router.use("/integrations", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

// Same redaction as routes/channels.js's stripSecrets() — kept as a
// separate small copy rather than a shared import so this file's role gate
// can evolve independently without silently changing channels.js's
// behavior (and vice versa).
const SECRET_FIELDS = ["access_token", "user_access_token", "verify_token", "bot_token"];
function stripSecrets(rowOrRows, req) {
  if (req.user?.role !== "USER") return rowOrRows;
  const redact = (row) => {
    if (!row || typeof row !== "object") return row;
    const copy = { ...row };
    for (const field of SECRET_FIELDS) {
      if (field in copy) copy[field] = undefined;
    }
    return copy;
  };
  return Array.isArray(rowOrRows) ? rowOrRows.map(redact) : redact(rowOrRows);
}

// ─── GET ALL INTEGRATIONS ─────────────────────────────────────────────────────
router.get("/integrations", async (req, res) => {
  try {
    const [integrations] = await pool.query(
      `SELECT i.*, tb.bot_username AS tg_bot_username
       FROM integrations i
       LEFT JOIN telegram_bots tb ON tb.integration_id = i.id
       WHERE i.agency_id = ?
       ORDER BY i.created_at DESC`,
      [req.user.agencyId]
    );

    // Auto-backfill wa_display_phone for WhatsApp accounts missing it
    const waAccountsMissingPhone = integrations.filter(
      (i) => i.platform === 'WHATSAPP' && !i.wa_display_phone && i.wa_phone_number_id
    );

    if (waAccountsMissingPhone.length > 0) {
      // Get agency-level system token as fallback
      let systemToken = null;
      try {
        const appSettings = await resolveMetaAppSettings(req.user.agencyId);
        if (appSettings?.system_user_token?.startsWith('EAA')) {
          systemToken = appSettings.system_user_token;
        }
      } catch (_) {}

      await Promise.allSettled(waAccountsMissingPhone.map(async (acc) => {
        try {
          // Use the integration's own token if valid, else fall back to system token
          const token = (acc.access_token?.startsWith('EAA') && acc.access_token.length > 20)
            ? acc.access_token
            : systemToken;
          if (!token) return;

          const url = `https://graph.facebook.com/v21.0/${acc.wa_phone_number_id}?fields=display_phone_number,verified_name&access_token=${token}`;
          const r = await fetch(url);
          const d = await r.json();
          if (d.display_phone_number) {
            await pool.query(
              "UPDATE integrations SET wa_display_phone = ? WHERE id = ?",
              [d.display_phone_number, acc.id]
            );
            acc.wa_display_phone = d.display_phone_number;
          }
        } catch (_) { /* silently skip */ }
      }));
    }

    return res.json({ success: true, integrations: stripSecrets(integrations, req) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE INTEGRATION ───────────────────────────────────────────────────────
router.post("/integrations", async (req, res) => {
  const {
    platform, name, accessToken, verifyToken,
    waPhoneNumberId, waBusinessAccId,
    fbPageId, fbPageName,
    igAccountId, igUsername,
  } = req.body;

  if (!platform || !name || !accessToken)
    return res.status(400).json({ success: false, message: "Platform, name, and access token are required" });

  try {
    await pool.query(
      `INSERT INTO integrations 
       (agency_id, platform, name, access_token, verify_token, wa_phone_number_id, wa_business_acc_id, fb_page_id, fb_page_name, ig_account_id, ig_username)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.agencyId, platform, name, accessToken, verifyToken || null,
        waPhoneNumberId || null, waBusinessAccId || null,
        fbPageId || null, fbPageName || null,
        igAccountId || null, igUsername || null,
      ]
    );
    return res.status(201).json({ success: true, message: "Integration created successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── UPDATE INTEGRATION ───────────────────────────────────────────────────────
router.put("/integrations/:id", async (req, res) => {
  const {
    name, accessToken, verifyToken,
    waPhoneNumberId, waBusinessAccId,
    fbPageId, fbPageName,
    igAccountId, igUsername, isActive,
  } = req.body;

  try {
    const [check] = await pool.query(
      "SELECT id FROM integrations WHERE id = ? AND agency_id = ?",
      [req.params.id, req.user.agencyId]
    );
    if (!check.length) return res.status(404).json({ success: false, message: "Integration not found" });

    await pool.query(
      `UPDATE integrations SET name=?, access_token=?, verify_token=?, wa_phone_number_id=?, 
       wa_business_acc_id=?, fb_page_id=?, fb_page_name=?, ig_account_id=?, ig_username=?, is_active=?
       WHERE id = ? AND agency_id = ?`,
      [
        name, accessToken, verifyToken,
        waPhoneNumberId, waBusinessAccId,
        fbPageId, fbPageName,
        igAccountId, igUsername,
        isActive ?? true,
        req.params.id, req.user.agencyId,
      ]
    );
    return res.json({ success: true, message: "Integration updated" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── DELETE INTEGRATION ───────────────────────────────────────────────────────
router.delete("/integrations/:id", async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM integrations WHERE id = ? AND agency_id = ?",
      [req.params.id, req.user.agencyId]
    );
    return res.json({ success: true, message: "Integration deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
