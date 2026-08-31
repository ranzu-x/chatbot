import express from "express";
import crypto from "crypto";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("AGENCY", "ADMIN"));

// Helper to resolve agencyId cleanly for both AGENCY owners and ADMIN users.
// SECURITY: Only looks up agency owned by the current user — never picks up
// another user's agency row (prevents cross-tenant data leakage).
async function resolveAgencyId(req) {
  if (req.user?.agencyId) return Number(req.user.agencyId);
  const userId = req.user?.id;
  if (!userId) return 1;
  try {
    // Only look for the agency this user owns
    const [rows] = await pool.query(
      "SELECT id FROM agencies WHERE owner_id = ? LIMIT 1",
      [userId]
    );
    if (rows.length) return Number(rows[0].id);

    // No agency exists yet for this owner — create one with a unique slug
    const slug = `workspace-${userId}-${Date.now()}`;
    const [ins] = await pool.query(
      "INSERT INTO agencies (name, slug, owner_id, is_active) VALUES ('My Workspace', ?, ?, 1)",
      [slug, userId]
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
  const { appId, appSecret, systemUserToken, whatsappConfigId, verifyToken, appName, siteUrl, privacyUrl, tosUrl, isActive, customWebhookUrl } = req.body;
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
        `UPDATE meta_app_settings SET app_id=?, app_secret=?, system_user_token=?, whatsapp_config_id=?, verify_token=?, webhook_url=?, is_configured=1,
         app_name=?, site_url=?, privacy_url=?, tos_url=?, is_active=? WHERE agency_id=?`,
        [appId, appSecret, systemUserToken?.trim() || null, whatsappConfigId || null, verifyToken, webhookUrl, appName || null, siteUrl || null, privacyUrl || null, tosUrl || null, isActive ? 1 : 0, agencyId]
      );
    } else {
      await pool.query(
        `INSERT INTO meta_app_settings (agency_id, app_id, app_secret, system_user_token, whatsapp_config_id, verify_token, webhook_url, is_configured, app_name, site_url, privacy_url, tos_url, is_active)
         VALUES (?,?,?,?,?,?,?,1,?,?,?,?,?)`,
        [agencyId, appId, appSecret, systemUserToken?.trim() || null, whatsappConfigId || null, verifyToken, webhookUrl, appName || null, siteUrl || null, privacyUrl || null, tosUrl || null, isActive ? 1 : 0]
      );
    }

    // If systemUserToken was supplied, also update any placeholder 'embedded_token' in integrations
    if (systemUserToken?.trim()) {
      await pool.query(
        "UPDATE integrations SET access_token = ? WHERE agency_id = ? AND (access_token = 'embedded_token' OR access_token IS NULL OR access_token = '')",
        [systemUserToken.trim(), agencyId]
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
    const testRes = await fetch(`https://graph.facebook.com/v21.0/${app_id}?access_token=${app_id}|${app_secret}`);
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
      "SELECT app_id, whatsapp_config_id FROM meta_app_settings WHERE agency_id=?", [agencyId]
    );
    if (!rows.length || !rows[0].app_id)
      return res.status(404).json({ success: false, message: "Meta App not configured. Go to Settings → Meta App Setup first." });
    return res.json({ success: true, appId: rows[0].app_id, configId: rows[0].whatsapp_config_id || null });
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
    const pageMap = new Map();

    // Step 1: get all pages the user manages from /me/accounts
    try {
      const pagesRes = await fetch(
        `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,name,username,profile_picture_url,followers_count},connected_instagram_account{id,name,username,profile_picture_url,followers_count}&access_token=${userAccessToken}`,
        { signal: AbortSignal.timeout(10000) }
      );
      const pagesData = await pagesRes.json();
      if (Array.isArray(pagesData.data)) {
        pagesData.data.forEach(p => { if (p.id) pageMap.set(p.id, p); });
      }
    } catch (e) {
      console.error("[IG import] me/accounts fetch error:", e.message || e);
    }

    // Step 2: Also check /debug_token granular scopes if me/accounts was empty
    if (pageMap.size === 0) {
      try {
        const inspectRes = await fetch(
          `https://graph.facebook.com/debug_token?input_token=${userAccessToken}&access_token=${userAccessToken}`,
          { signal: AbortSignal.timeout(6000) }
        );
        const inspectData = await inspectRes.json();
        const granular = inspectData.data?.granular_scopes || [];
        for (const scope of granular) {
          if (Array.isArray(scope.target_ids)) {
            for (const targetId of scope.target_ids) {
              if (!pageMap.has(targetId)) {
                try {
                  const pRes = await fetch(
                    `https://graph.facebook.com/v19.0/${targetId}?fields=id,name,access_token,instagram_business_account{id,name,username,profile_picture_url,followers_count},connected_instagram_account{id,name,username,profile_picture_url,followers_count}&access_token=${userAccessToken}`,
                    { signal: AbortSignal.timeout(5000) }
                  );
                  const pData = await pRes.json();
                  if (pData.id && !pData.error) {
                    pageMap.set(pData.id, pData);
                  }
                } catch (_) {}
              }
            }
          }
        }
      } catch (de) {
        console.error("[IG import] debug_token error:", de.message || de);
      }
    }

    const igAccounts = [];
    const seenIgIds = new Set();

    // Step 3: For each page, collect linked IG account
    for (const page of pageMap.values()) {
      const ig = page.instagram_business_account || page.connected_instagram_account;
      if (ig && ig.id && !seenIgIds.has(ig.id)) {
        seenIgIds.add(ig.id);
        igAccounts.push({
          ...ig,
          pageId: page.id,
          pageName: page.name,
          pageAccessToken: page.access_token || userAccessToken,
        });
      } else if (!ig && page.access_token) {
        // Direct query to page node for instagram_business_account
        try {
          const igRes = await fetch(
            `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account{id,name,username,profile_picture_url,followers_count},connected_instagram_account{id,name,username,profile_picture_url,followers_count}&access_token=${page.access_token}`,
            { signal: AbortSignal.timeout(5000) }
          );
          const igData = await igRes.json();
          const foundIg = igData.instagram_business_account || igData.connected_instagram_account;
          if (foundIg && foundIg.id && !seenIgIds.has(foundIg.id)) {
            seenIgIds.add(foundIg.id);
            igAccounts.push({
              ...foundIg,
              pageId: page.id,
              pageName: page.name,
              pageAccessToken: page.access_token,
            });
          }
        } catch (_) {}
      }
    }

    return res.json({ success: true, accounts: igAccounts });
  } catch (err) {
    console.error("[IG import-accounts error]:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch Instagram accounts" });
  }
});

export default router;
