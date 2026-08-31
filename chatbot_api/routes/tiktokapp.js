import express from "express";
import crypto from "crypto";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("AGENCY", "ADMIN"));

async function resolveAgencyId(req) {
  if (req.user?.agencyId) return Number(req.user.agencyId);
  const userId = req.user?.id;
  if (!userId) return 1;
  try {
    const [rows] = await pool.query("SELECT id FROM agencies WHERE owner_id = ? LIMIT 1", [userId]);
    if (rows.length) return Number(rows[0].id);
    const slug = `workspace-${userId}-${Date.now()}`;
    const [ins] = await pool.query("INSERT INTO agencies (name, slug, owner_id, is_active) VALUES ('My Workspace', ?, ?, 1)", [slug, userId]);
    return Number(ins.insertId);
  } catch (err) {
    console.error("Error resolving agencyId for TikTok:", err);
  }
  return 1;
}

// ─── GET TIKTOK APP SETTINGS ──────────────────────────────────────
router.get("/settings/tiktok-app", async (req, res) => {
  try {
    const agencyId = await resolveAgencyId(req);
    const [rows] = await pool.query("SELECT * FROM tiktok_app_settings WHERE agency_id = ?", [agencyId]);
    const settings = rows[0] || null;
    let verifyToken = settings?.verify_token;

    if (!verifyToken) {
      verifyToken = "nexa_tiktok_" + crypto.randomBytes(12).toString("hex");
    }

    return res.json({
      success: true,
      agencyId,
      settings: settings ? { ...settings, verify_token: verifyToken } : null,
      generatedVerifyToken: verifyToken,
    });
  } catch (err) {
    console.error("Error fetching tiktok-app settings:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── SAVE TIKTOK APP SETTINGS ─────────────────────────────────────
router.post("/settings/tiktok-app", async (req, res) => {
  const { clientKey, clientSecret, appName, verifyToken, redirectUri, customWebhookUrl, isActive } = req.body;
  if (!clientKey || !clientSecret || !verifyToken) {
    return res.status(400).json({ success: false, message: "Client Key (App ID), Client Secret and Verify Token are required" });
  }

  const agencyId = await resolveAgencyId(req);
  const backendBase = process.env.BACKEND_URL || process.env.PUBLIC_URL || "http://localhost:5000";
  const webhookUrl = customWebhookUrl || `${backendBase}/api/v1/webhook/tiktok/${agencyId}`;
  const defaultRedirect = redirectUri || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/tiktok/callback`;

  try {
    const [existing] = await pool.query("SELECT id FROM tiktok_app_settings WHERE agency_id = ?", [agencyId]);
    if (existing.length) {
      await pool.query(
        `UPDATE tiktok_app_settings SET
          app_name = ?, client_key = ?, client_secret = ?,
          redirect_uri = ?, webhook_url = ?, verify_token = ?,
          is_configured = 1, is_active = ?, updated_at = NOW()
        WHERE agency_id = ?`,
        [appName || 'My TikTok App', clientKey.trim(), clientSecret.trim(), defaultRedirect, webhookUrl, verifyToken, isActive ? 1 : 0, agencyId]
      );
    } else {
      await pool.query(
        `INSERT INTO tiktok_app_settings
          (agency_id, app_name, client_key, client_secret, redirect_uri, webhook_url, verify_token, is_configured, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [agencyId, appName || 'My TikTok App', clientKey.trim(), clientSecret.trim(), defaultRedirect, webhookUrl, verifyToken, isActive ? 1 : 0]
      );
    }

    return res.json({
      success: true,
      message: "TikTok Developer App settings saved successfully!",
      settings: {
        app_name: appName || 'My TikTok App',
        client_key: clientKey.trim(),
        redirect_uri: defaultRedirect,
        webhook_url: webhookUrl,
        verify_token: verifyToken,
        is_configured: 1,
        is_active: isActive ? 1 : 0,
      }
    });
  } catch (err) {
    console.error("Error saving tiktok-app settings:", err);
    return res.status(500).json({ success: false, message: "Failed to save TikTok settings: " + err.message });
  }
});

// ─── TEST TIKTOK APP CREDENTIALS ──────────────────────────────────
router.post("/settings/tiktok-app/test", async (req, res) => {
  const agencyId = await resolveAgencyId(req);
  try {
    const [rows] = await pool.query("SELECT * FROM tiktok_app_settings WHERE agency_id = ?", [agencyId]);
    const settings = rows[0];
    if (!settings || !settings.client_key || !settings.client_secret) {
      return res.status(400).json({ success: false, message: "Please save Client Key and Client Secret first." });
    }

    if (settings.client_key.length < 5 || settings.client_secret.length < 5) {
      return res.status(400).json({ success: false, message: "Invalid Client Key or Client Secret length." });
    }

    return res.json({
      success: true,
      message: `TikTok App credentials (${settings.app_name || 'TikTok App'}) are valid and ready for connection!`,
      clientKey: settings.client_key,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || "Connection test failed" });
  }
});

// ─── GET CLIENT KEY (PUBLIC/AGENCY FOR OAUTH) ─────────────────────
router.get("/settings/tiktok-app/client-key", async (req, res) => {
  const agencyId = await resolveAgencyId(req);
  try {
    const [rows] = await pool.query("SELECT client_key, redirect_uri, is_configured FROM tiktok_app_settings WHERE agency_id = ? AND is_active = 1", [agencyId]);
    if (!rows.length || !rows[0].client_key) {
      return res.json({ success: false, clientKey: null, message: "TikTok App not configured" });
    }
    return res.json({
      success: true,
      clientKey: rows[0].client_key,
      redirectUri: rows[0].redirect_uri,
      isConfigured: Boolean(rows[0].is_configured),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
