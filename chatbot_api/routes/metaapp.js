import express from "express";
import crypto from "crypto";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { resolveMetaAppSettings, resolveWhatsAppOnboardingAppId } from "../utils/appCredentials.js";
import { testMetaAppCredentials } from "../utils/metaAppHealth.js";

const router = express.Router();
// Scoped per-prefix — an unscoped router.use(mw) would run for every
// /api/v1/* request reaching this router, silently blocking every
// later-mounted router for non-AGENCY/ADMIN roles. See the identical fix +
// full explanation in routes/channels.js.
//
// These two prefixes get DIFFERENT role gates: /settings/meta-app is the
// Reseller's own Meta developer-app credentials (client_id/client_secret) —
// owner-only, same as App Integrations elsewhere. /channels/instagram/
// import-accounts is part of the "Connect Account" flow (picking which of
// the user's own Instagram accounts to connect) — USER is included here to
// match the rest of the Connect Account hub (routes/channels.js,
// Public App ID (no secret exposed) — accessible by RESELLER, ADMIN, and USER (so end users can init FB SDK)
//
// Both routes below read/write the ACTIVE row of meta_app_pool for a given
// platformGroup ('WHATSAPP' | 'MESSENGER_INSTAGRAM') rather than the old
// single-row meta_app_settings table — WhatsApp and Facebook/Instagram are
// deliberately separate app slots now (see utils/appCredentials.js). The
// `?platformGroup=` query/body param defaults to 'MESSENGER_INSTAGRAM' for
// backward compatibility with any stale frontend build during a rolling
// deploy. Managing STANDBY slots (adding backups, promoting, health status)
// lives in routes/metaapppool.js — this file keeps managing only the ACTIVE
// slot per group, matching its pre-existing single-settings-object contract.
router.get("/settings/meta-app/app-id", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), async (req, res) => {
  try {
    const agencyId = await resolveAgencyId(req);
    const platformGroup = req.query.platformGroup === "WHATSAPP" ? "WHATSAPP" : "MESSENGER_INSTAGRAM";
    // WhatsApp new-connect attempts get silently redirected to a standby app
    // when the active one is Tech-Provider-blocked for new onboarding —
    // existing integrations are untouched, only this SDK-init lookup and
    // the embedded-signup completion call (channels.js) use this variant.
    const appSettings = platformGroup === "WHATSAPP"
      ? await resolveWhatsAppOnboardingAppId(agencyId)
      : await resolveMetaAppSettings(agencyId, platformGroup);
    if (!appSettings?.app_id)
      return res.status(404).json({ success: false, message: "Meta App not configured. Go to Settings → Meta App Setup first." });
    return res.json({
      success: true,
      appId: appSettings.app_id,
      configId: appSettings.whatsapp_config_id || null,
      configIdCatalog: appSettings.whatsapp_config_id_catalog || null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.use("/settings/meta-app", authMiddleware, roleMiddleware("RESELLER", "ADMIN"));
router.use("/channels/instagram/import-accounts", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

// Helper to resolve agencyId cleanly for both AGENCY owners and ADMIN users.
// SECURITY: Only looks up agency owned by the current user — never picks up
// another user's agency row (prevents cross-tenant data leakage).
// Exported so routes/metaapppool.js can reuse it rather than duplicating it.
export async function resolveAgencyId(req) {
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

function normalizePlatformGroup(value) {
  return value === "WHATSAPP" ? "WHATSAPP" : "MESSENGER_INSTAGRAM";
}

// ─── GET META APP SETTINGS (ACTIVE slot for one platform group) ──────────
router.get("/settings/meta-app", async (req, res) => {
  try {
    const agencyId = await resolveAgencyId(req);
    const platformGroup = normalizePlatformGroup(req.query.platformGroup);
    const [rows] = await pool.query(
      "SELECT * FROM meta_app_pool WHERE agency_id = ? AND platform_group = ? AND slot_role = 'ACTIVE'",
      [agencyId, platformGroup]
    );
    const settings = rows[0] || null;
    let verifyToken = settings?.verify_token;

    // Auto-generate verify token if not yet created AND immediately persist it
    // so that Meta's webhook verification succeeds even before the full form
    // is saved (resellers copy the token and go straight to Meta Console).
    if (!verifyToken) {
      verifyToken = crypto.randomBytes(16).toString("hex");
      try {
        if (settings) {
          await pool.query(
            "UPDATE meta_app_pool SET verify_token = ? WHERE id = ?",
            [verifyToken, settings.id]
          );
        } else {
          await pool.query(
            "INSERT INTO meta_app_pool (agency_id, platform_group, slot_role, verify_token, is_configured, is_active) VALUES (?, ?, 'ACTIVE', ?, 0, 1)",
            [agencyId, platformGroup, verifyToken]
          );
        }
        console.log(`[Meta App] Auto-saved generated verify_token for agency ${agencyId} / ${platformGroup}`);
      } catch (saveErr) {
        console.error("[Meta App] Failed to auto-save verify_token:", saveErr.message);
      }
    }

    return res.json({
      success: true,
      agencyId,
      platformGroup,
      settings: settings ? { ...settings, verify_token: verifyToken } : null,
      generatedVerifyToken: verifyToken,
    });
  } catch (err) {
    console.error("Error fetching meta-app settings:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── SAVE META APP SETTINGS (ACTIVE slot for one platform group) ─────────
router.post("/settings/meta-app", async (req, res) => {
  const { appId, appSecret, systemUserToken, whatsappConfigId, whatsappConfigIdCatalog, verifyToken, appName, siteUrl, privacyUrl, tosUrl, isActive, customWebhookUrl } = req.body;
  if (!appId || !appSecret || !verifyToken)
    return res.status(400).json({ success: false, message: "App ID, App Secret and Verify Token are required" });

  const agencyId = await resolveAgencyId(req);
  const platformGroup = normalizePlatformGroup(req.body.platformGroup);
  const webhookUrl = customWebhookUrl || `${process.env.BACKEND_URL || "http://localhost:5000"}/api/v1/webhook/${agencyId}`;

  try {
    const [existing] = await pool.query(
      "SELECT id FROM meta_app_pool WHERE agency_id = ? AND platform_group = ? AND slot_role = 'ACTIVE'",
      [agencyId, platformGroup]
    );
    if (existing.length) {
      await pool.query(
        `UPDATE meta_app_pool SET app_id=?, app_secret=?, system_user_token=?, whatsapp_config_id=?, whatsapp_config_id_catalog=?, verify_token=?, webhook_url=?, is_configured=1,
         app_name=?, site_url=?, privacy_url=?, tos_url=?, is_active=? WHERE id=?`,
        [appId, appSecret, systemUserToken?.trim() || null, whatsappConfigId || null, whatsappConfigIdCatalog?.trim() || null, verifyToken, webhookUrl, appName || null, siteUrl || null, privacyUrl || null, tosUrl || null, isActive ? 1 : 0, existing[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO meta_app_pool (agency_id, platform_group, slot_role, label, app_id, app_secret, system_user_token, whatsapp_config_id, whatsapp_config_id_catalog, verify_token, webhook_url, is_configured, app_name, site_url, privacy_url, tos_url, is_active)
         VALUES (?,?,'ACTIVE','Primary',?,?,?,?,?,?,?,1,?,?,?,?,?)`,
        [agencyId, platformGroup, appId, appSecret, systemUserToken?.trim() || null, whatsappConfigId || null, whatsappConfigIdCatalog?.trim() || null, verifyToken, webhookUrl, appName || null, siteUrl || null, privacyUrl || null, tosUrl || null, isActive ? 1 : 0]
      );
    }

    // If systemUserToken was supplied, also update any placeholder 'embedded_token' in integrations
    if (systemUserToken?.trim()) {
      const platformFilter = platformGroup === "WHATSAPP" ? "platform = 'WHATSAPP'" : "platform IN ('FACEBOOK','INSTAGRAM')";
      await pool.query(
        `UPDATE integrations SET access_token = ? WHERE agency_id = ? AND ${platformFilter} AND (access_token = 'embedded_token' OR access_token IS NULL OR access_token = '')`,
        [systemUserToken.trim(), agencyId]
      );
    }

    return res.json({ success: true, message: "Meta App settings saved", webhookUrl, agencyId, platformGroup });
  } catch (err) {
    console.error("Error saving meta-app settings:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── SAVE VERIFY TOKEN ONLY (called silently by UI on token generate/regenerate) ─
// This allows Meta's webhook challenge to pass even before the full form is saved.
router.patch("/settings/meta-app/verify-token", async (req, res) => {
  const { verifyToken } = req.body;
  if (!verifyToken?.trim()) {
    return res.status(400).json({ success: false, message: "verifyToken is required" });
  }
  try {
    const agencyId = await resolveAgencyId(req);
    const platformGroup = normalizePlatformGroup(req.body.platformGroup);
    const [existing] = await pool.query(
      "SELECT id FROM meta_app_pool WHERE agency_id = ? AND platform_group = ? AND slot_role = 'ACTIVE'",
      [agencyId, platformGroup]
    );
    if (existing.length) {
      await pool.query(
        "UPDATE meta_app_pool SET verify_token = ? WHERE id = ?",
        [verifyToken.trim(), existing[0].id]
      );
    } else {
      await pool.query(
        "INSERT INTO meta_app_pool (agency_id, platform_group, slot_role, verify_token, is_configured, is_active) VALUES (?, ?, 'ACTIVE', ?, 0, 1)",
        [agencyId, platformGroup, verifyToken.trim()]
      );
    }
    console.log(`[Meta App] verify_token updated for agency ${agencyId} / ${platformGroup}`);
    return res.json({ success: true });
  } catch (err) {
    console.error("Error saving verify token:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── TEST META CONNECTION ─────────────────────────────────────────
router.post("/settings/meta-app/test", async (req, res) => {
  try {
    const agencyId = await resolveAgencyId(req);
    const platformGroup = normalizePlatformGroup(req.body.platformGroup);
    let app_id = req.body?.appId?.toString().trim();
    let app_secret = req.body?.appSecret?.toString().trim();

    if (!app_id || !app_secret) {
      const [rows] = await pool.query(
        "SELECT app_id, app_secret FROM meta_app_pool WHERE agency_id = ? AND platform_group = ? AND slot_role = 'ACTIVE'",
        [agencyId, platformGroup]
      );
      if (!rows.length) return res.status(404).json({ success: false, message: "Meta App not configured yet. Enter App ID and App Secret." });
      app_id = rows[0].app_id;
      app_secret = rows[0].app_secret;
    }

    const result = await testMetaAppCredentials(app_id, app_secret);
    if (!result.healthy) return res.status(400).json({ success: false, message: result.error?.message || "Connection failed" });
    return res.json({ success: true, message: "Meta App connection successful", appName: result.appName });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── IMPORT INSTAGRAM ACCOUNTS VIA TOKEN (USER OR PAGE TOKEN) ───────────
router.post("/channels/instagram/import-accounts", async (req, res) => {
  const { userAccessToken } = req.body;
  if (!userAccessToken) return res.status(400).json({ success: false, message: "Access token is required" });
  try {
    const pageMap = new Map();
    const igAccounts = [];
    const seenIgIds = new Set();

    const agencyId = await resolveAgencyId(req);
    let appSecret = null;
    let appId = null;
    try {
      const appSettings = await resolveMetaAppSettings(agencyId, "MESSENGER_INSTAGRAM");
      if (appSettings) {
        appId = appSettings.app_id;
        appSecret = appSettings.app_secret;
      }
    } catch (e) {
      console.error('[IG import-accounts] error fetching app settings:', e.message || e);
    }

    // 1. Upgrade user token to long-lived token (which grants permanent page tokens from /me/accounts)
    let effectiveUserToken = userAccessToken;
    if (appId && appSecret) {
      try {
        const exchangeUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${userAccessToken}`;
        const exRes = await fetch(exchangeUrl);
        const exData = await exRes.json();
        if (exData.access_token) {
          effectiveUserToken = exData.access_token;
          console.log('[IG import-accounts] Successfully upgraded to long-lived user token!');
        }
      } catch (exErr) {
        console.warn('[IG import-accounts] Token exchange warning:', exErr.message);
      }
    }

    // 2. Direct /me check (if token is a direct Page Access Token with linked IG account)
    try {
      const directMeRes = await fetch(
        `https://graph.facebook.com/v21.0/me?fields=id,name,access_token,instagram_business_account{id,name,username,profile_picture_url,followers_count},connected_instagram_account{id,name,username,profile_picture_url,followers_count}&access_token=${effectiveUserToken}`
      );
      const directMeData = await directMeRes.json();
      const directIg = directMeData.instagram_business_account || directMeData.connected_instagram_account;
      if (directIg && directIg.id) {
        seenIgIds.add(directIg.id);
        igAccounts.push({
          ...directIg,
          pageId: directMeData.id,
          pageName: directMeData.name,
          pageAccessToken: effectiveUserToken,
        });
      }
    } catch (directErr) {
      console.warn("[IG import] direct /me check warning:", directErr.message || directErr);
    }

    // 3. Fetch all pages the user manages from /me/accounts (if token is a User token)
    try {
      const pagesRes = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,category,instagram_business_account{id,name,username,profile_picture_url,followers_count},connected_instagram_account{id,name,username,profile_picture_url,followers_count}&access_token=${effectiveUserToken}`,
        { signal: AbortSignal.timeout(10000) }
      );
      const pagesData = await pagesRes.json();
      if (Array.isArray(pagesData.data)) {
        pagesData.data.forEach(p => { if (p.id) pageMap.set(p.id, p); });
      }
    } catch (e) {
      console.warn("[IG import] me/accounts fetch warning:", e.message || e);
    }

    // 4. debug_token inspection for granular_scopes target_ids (pages chosen in popup)
    const debugTokenAccess = (appId && appSecret) ? `${appId}|${appSecret}` : effectiveUserToken;
    try {
      const debugRes = await fetch(
        `https://graph.facebook.com/debug_token?input_token=${userAccessToken}&access_token=${debugTokenAccess}`,
        { signal: AbortSignal.timeout(7000) }
      );
      const debugData = await debugRes.json();
      const granularScopes = debugData.data?.granular_scopes || [];
      const targetIds = new Set();
      for (const scopeObj of granularScopes) {
        if (Array.isArray(scopeObj.target_ids)) {
          scopeObj.target_ids.forEach(id => targetIds.add(id));
        }
      }
      for (const targetId of targetIds) {
        if (!pageMap.has(targetId)) {
          try {
            const pRes = await fetch(
              `https://graph.facebook.com/v21.0/${targetId}?fields=id,name,access_token,category,instagram_business_account{id,name,username,profile_picture_url,followers_count},connected_instagram_account{id,name,username,profile_picture_url,followers_count}&access_token=${effectiveUserToken}`
            );
            const pData = await pRes.json();
            if (pData.id && !pData.error) pageMap.set(pData.id, pData);
          } catch (_) {}
        }
      }
    } catch (_) {}

    // 5. /me/businesses check for pages owned or managed via Business Manager
    try {
      const bizRes = await fetch(
        `https://graph.facebook.com/v21.0/me/businesses?fields=id,name,owned_pages{id,name,access_token,category,instagram_business_account{id,name,username,profile_picture_url,followers_count},connected_instagram_account{id,name,username,profile_picture_url,followers_count}},client_pages{id,name,access_token,category,instagram_business_account{id,name,username,profile_picture_url,followers_count},connected_instagram_account{id,name,username,profile_picture_url,followers_count}}&access_token=${effectiveUserToken}`,
        { signal: AbortSignal.timeout(7000) }
      );
      const bizData = await bizRes.json();
      if (Array.isArray(bizData.data)) {
        for (const biz of bizData.data) {
          const owned = biz.owned_pages?.data || [];
          const client = biz.client_pages?.data || [];
          [...owned, ...client].forEach(p => {
            if (p.id && !pageMap.has(p.id)) pageMap.set(p.id, p);
          });
        }
      }
    } catch (_) {}

    // 6. For each page in pageMap, extract linked IG account
    for (const page of pageMap.values()) {
      const ig = page.instagram_business_account || page.connected_instagram_account;
      if (ig && ig.id && !seenIgIds.has(ig.id)) {
        seenIgIds.add(ig.id);
        igAccounts.push({
          ...ig,
          pageId: page.id,
          pageName: page.name,
          pageAccessToken: page.access_token || effectiveUserToken,
        });
      } else if (!ig && page.access_token) {
        // Query page node directly with page's access_token
        try {
          const igRes = await fetch(
            `https://graph.facebook.com/v21.0/${page.id}?fields=id,name,instagram_business_account{id,name,username,profile_picture_url,followers_count},connected_instagram_account{id,name,username,profile_picture_url,followers_count}&access_token=${page.access_token}`,
            { signal: AbortSignal.timeout(6000) }
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

    return res.json({ success: true, accounts: igAccounts, count: igAccounts.length });
  } catch (err) {
    console.error("[IG import-accounts error]:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch Instagram accounts: " + err.message });
  }
});

export default router;
