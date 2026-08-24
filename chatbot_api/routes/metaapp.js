import express from "express";
import crypto from "crypto";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("AGENCY", "ADMIN"));

// Helper to resolve agencyId cleanly for both AGENCY owners and ADMIN users
async function resolveAgencyId(req) {
  if (req.user?.agencyId) return Number(req.user.agencyId);
  try {
    const [rows] = await pool.query(
      "SELECT id FROM agencies WHERE owner_id = ? OR is_active = 1 ORDER BY id ASC LIMIT 1",
      [req.user?.id || 0]
    );
    if (rows.length) return Number(rows[0].id);

    // If no agency exists yet, auto-create default agency for owner
    const [ins] = await pool.query(
      "INSERT INTO agencies (name, slug, owner_id, is_active) VALUES ('Main Workspace', 'main-workspace', ?, 1)",
      [req.user?.id || 1]
    );
    return Number(ins.insertId);
  } catch (err) {
    console.error("Error resolving agencyId:", err);
  }
  return 1;
}

// ─── GET META APP SETTINGS ────────────────────────────────────────
router.get("/settings/meta-app", async (req, res) => {
  try {
    const agencyId = await resolveAgencyId(req);
    const [rows] = await pool.query(
      "SELECT * FROM meta_app_settings WHERE agency_id = ?", [agencyId]
    );
    const settings = rows[0] || null;
    let verifyToken = settings?.verify_token;

    // Auto-generate verify token if not yet created
    if (!verifyToken) {
      verifyToken = "nexa_meta_" + crypto.randomBytes(12).toString("hex");
    }

    return res.json({
      success: true,
      agencyId,
      settings: settings ? { ...settings, verify_token: verifyToken } : null,
      generatedVerifyToken: verifyToken,
    });
  } catch (err) {
    console.error("Error fetching meta-app settings:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── SAVE META APP SETTINGS ───────────────────────────────────────
router.post("/settings/meta-app", async (req, res) => {
  const { appId, appSecret, verifyToken, appName, siteUrl, privacyUrl, tosUrl, isActive, customWebhookUrl } = req.body;
  if (!appId || !appSecret || !verifyToken)
    return res.status(400).json({ success: false, message: "App ID, App Secret and Verify Token are required" });

  const agencyId = await resolveAgencyId(req);
  const webhookUrl = customWebhookUrl || `${process.env.BACKEND_URL || "http://localhost:5000"}/api/v1/webhook/${agencyId}`;

  try {
    const [existing] = await pool.query(
      "SELECT id FROM meta_app_settings WHERE agency_id=?", [agencyId]
    );
    if (existing.length) {
      await pool.query(
        `UPDATE meta_app_settings SET app_id=?, app_secret=?, verify_token=?, webhook_url=?, is_configured=1,
         app_name=?, site_url=?, privacy_url=?, tos_url=?, is_active=? WHERE agency_id=?`,
        [appId, appSecret, verifyToken, webhookUrl, appName || null, siteUrl || null, privacyUrl || null, tosUrl || null, isActive ? 1 : 0, agencyId]
      );
    } else {
      await pool.query(
        `INSERT INTO meta_app_settings (agency_id, app_id, app_secret, verify_token, webhook_url, is_configured, app_name, site_url, privacy_url, tos_url, is_active)
         VALUES (?,?,?,?,?,1,?,?,?,?,?)`,
        [agencyId, appId, appSecret, verifyToken, webhookUrl, appName || null, siteUrl || null, privacyUrl || null, tosUrl || null, isActive ? 1 : 0]
      );
    }
    return res.json({ success: true, message: "Meta App settings saved", webhookUrl, agencyId });
  } catch (err) {
    console.error("Error saving meta-app settings:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── TEST META CONNECTION ─────────────────────────────────────────
router.post("/settings/meta-app/test", async (req, res) => {
  try {
    const agencyId = await resolveAgencyId(req);
    const [rows] = await pool.query(
      "SELECT app_id, app_secret FROM meta_app_settings WHERE agency_id=?", [agencyId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Meta App not configured yet" });

    const { app_id, app_secret } = rows[0];
    const testRes = await fetch(`https://graph.facebook.com/v19.0/${app_id}?access_token=${app_id}|${app_secret}`);
    const testData = await testRes.json();

    if (testData.error) return res.status(400).json({ success: false, message: testData.error.message });
    return res.json({ success: true, message: "Meta App connection successful", appName: testData.name });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET PUBLIC APP ID (safe to expose — no secret) ──────────────
router.get("/settings/meta-app/app-id", async (req, res) => {
  try {
    const agencyId = await resolveAgencyId(req);
    const [rows] = await pool.query(
      "SELECT app_id FROM meta_app_settings WHERE agency_id=?", [agencyId]
    );
    if (!rows.length || !rows[0].app_id)
      return res.status(404).json({ success: false, message: "Meta App not configured. Go to Settings → Meta App Setup first." });
    return res.json({ success: true, appId: rows[0].app_id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── IMPORT INSTAGRAM ACCOUNTS VIA USER TOKEN ─────────────────────
// Fetches all FB Pages the user manages, then checks each for a linked IG Business account
router.post("/channels/instagram/import-accounts", async (req, res) => {
  const { userAccessToken } = req.body;
  if (!userAccessToken) return res.status(400).json({ success: false, message: "User access token required" });
  try {
    // Step 1: get all pages the user manages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token&access_token=${userAccessToken}`
    );
    const pagesData = await pagesRes.json();
    if (pagesData.error) return res.status(400).json({ success: false, message: pagesData.error.message });

    const pages = pagesData.data || [];
    const igAccounts = [];

    // Step 2: for each page, check for a connected IG Business account
    await Promise.all(pages.map(async (page) => {
      try {
        const igRes = await fetch(
          `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account{id,name,username,profile_picture_url,followers_count}&access_token=${page.access_token}`
        );
        const igData = await igRes.json();
        if (igData.instagram_business_account) {
          igAccounts.push({
            ...igData.instagram_business_account,
            pageId: page.id,
            pageName: page.name,
            pageAccessToken: page.access_token,
          });
        }
      } catch { /* page has no IG account, skip */ }
    }));

    return res.json({ success: true, accounts: igAccounts });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

export default router;
