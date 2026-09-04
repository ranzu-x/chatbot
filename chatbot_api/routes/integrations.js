import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.use(authMiddleware, roleMiddleware("AGENCY", "ADMIN"));

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
        const [appRows] = await pool.query(
          "SELECT system_user_token FROM meta_app_settings WHERE agency_id = ? AND is_configured = 1 LIMIT 1",
          [req.user.agencyId]
        );
        if (appRows[0]?.system_user_token?.startsWith('EAA')) {
          systemToken = appRows[0].system_user_token;
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

    return res.json({ success: true, integrations });
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
