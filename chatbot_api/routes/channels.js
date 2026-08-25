import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("AGENCY", "ADMIN"));

// ═══════════════════════════════════════════════════════════════════
//  WHATSAPP
// ═══════════════════════════════════════════════════════════════════

router.get("/channels/whatsapp", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM integrations WHERE agency_id = ? AND platform = 'WHATSAPP' ORDER BY created_at DESC",
      [req.user.agencyId]
    );
    return res.json({ success: true, accounts: rows });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.post("/channels/whatsapp", async (req, res) => {
  const { name, accessToken, verifyToken, waPhoneNumberId, waBusinessAccId } = req.body;
  if (!name || !accessToken || !waPhoneNumberId)
    return res.status(400).json({ success: false, message: "Name, access token and phone number ID are required" });
  try {
    await pool.query(
      `INSERT INTO integrations (agency_id, platform, name, access_token, verify_token, wa_phone_number_id, wa_business_acc_id)
       VALUES (?, 'WHATSAPP', ?, ?, ?, ?, ?)`,
      [req.user.agencyId, name, accessToken, verifyToken || null, waPhoneNumberId, waBusinessAccId || null]
    );
    return res.status(201).json({ success: true, message: "WhatsApp account connected" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.delete("/channels/whatsapp/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'WHATSAPP'",
      [req.params.id, req.user.agencyId]);
    return res.json({ success: true, message: "WhatsApp account removed" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ═══════════════════════════════════════════════════════════════════
//  FACEBOOK MESSENGER
// ═══════════════════════════════════════════════════════════════════

router.get("/channels/facebook", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM integrations WHERE agency_id = ? AND platform = 'FACEBOOK' ORDER BY created_at DESC",
      [req.user.agencyId]
    );
    return res.json({ success: true, pages: rows });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.post("/channels/facebook", async (req, res) => {
  const { name, accessToken, verifyToken, fbPageId, fbPageName } = req.body;
  if (!name || !accessToken || !fbPageId)
    return res.status(400).json({ success: false, message: "Name, access token and page ID are required" });

  try {
    // Try auto-exchanging for a permanent never-expiring Page Access Token
    let finalAccessToken = accessToken;
    try {
      const [appRows] = await pool.query(
        "SELECT app_id, app_secret FROM meta_app_settings WHERE agency_id = ? AND is_configured = 1 LIMIT 1",
        [req.user.agencyId]
      );
      if (appRows.length && appRows[0].app_id && appRows[0].app_secret) {
        const { app_id, app_secret } = appRows[0];
        
        // 1. Exchange token for long-lived user token
        const exchangeUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${app_id}&client_secret=${app_secret}&fb_exchange_token=${accessToken}`;
        const exRes = await fetch(exchangeUrl);
        const exData = await exRes.json();
        
        const longLivedUserToken = exData.access_token || accessToken;
        
        // 2. Fetch page accounts with long-lived user token to get the NEVER-EXPIRING page token
        const accountsUrl = `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=${longLivedUserToken}`;
        const accRes = await fetch(accountsUrl);
        const accData = await accRes.json();
        
        if (Array.isArray(accData.data)) {
          const matchedPage = accData.data.find(p => p.id === fbPageId);
          if (matchedPage?.access_token) {
            finalAccessToken = matchedPage.access_token;
            console.log(`[FB Token Exchange] Successfully upgraded to PERMANENT Page Token for ${fbPageName || fbPageId}!`);
          }
        }
      }
    } catch (exchangeErr) {
      console.warn("[FB Token Exchange Warning] Could not auto-exchange token:", exchangeErr.message);
    }

    // 1. Subscribe Page to Meta App Webhooks
    let webhookSubscribed = false;
    try {
      const subRes = await fetch(
        `https://graph.facebook.com/v21.0/${fbPageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads&access_token=${finalAccessToken}`,
        { method: "POST" }
      );
      const subData = await subRes.json();
      console.log(`[FB Page Subscribe] Page ${fbPageId} subscribe result:`, subData);
      webhookSubscribed = !!subData.success;
    } catch (subErr) {
      console.error(`[FB Page Subscribe] Error subscribing page ${fbPageId}:`, subErr.message || subErr);
    }

    // 2. Check if already exists (update or insert)
    const [existing] = await pool.query(
      "SELECT id FROM integrations WHERE agency_id = ? AND platform = 'FACEBOOK' AND fb_page_id = ?",
      [req.user.agencyId, fbPageId]
    );

    if (existing.length) {
      await pool.query(
        `UPDATE integrations SET name = ?, access_token = ?, verify_token = ?, fb_page_name = ?, is_active = 1
         WHERE id = ?`,
        [name, finalAccessToken, verifyToken || null, fbPageName || null, existing[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO integrations (agency_id, platform, name, access_token, verify_token, fb_page_id, fb_page_name, is_active)
         VALUES (?, 'FACEBOOK', ?, ?, ?, ?, ?, 1)`,
        [req.user.agencyId, name, finalAccessToken, verifyToken || null, fbPageId, fbPageName || null]
      );
    }

    return res.status(201).json({
      success: true,
      message: "Facebook page connected",
      webhookSubscribed
    });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ─── Quick Connect: Auto-exchange token & auto-import all pages permanently ───
router.post("/channels/facebook/quick-connect", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, message: "Token is required" });

  const agencyId = req.user?.agencyId || 1;

  try {
    const [settings] = await pool.query(
      "SELECT app_id, app_secret FROM meta_app_settings WHERE agency_id = ? OR is_configured = 1 LIMIT 1",
      [agencyId]
    );

    let effectiveToken = token.trim();
    if (settings.length && settings[0].app_id && settings[0].app_secret) {
      const { app_id, app_secret } = settings[0];
      try {
        const exchangeUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${app_id}&client_secret=${app_secret}&fb_exchange_token=${effectiveToken}`;
        const exRes = await fetch(exchangeUrl);
        const exData = await exRes.json();
        if (exData.access_token) {
          effectiveToken = exData.access_token;
          console.log("[Quick Connect] Upgraded to long-lived user token!");
        }
      } catch (exErr) {
        console.warn("[Quick Connect] Exchange warning:", exErr.message);
      }
    }

    // Fetch accounts
    const accRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,category&access_token=${effectiveToken}`
    );
    const accData = await accRes.json();

    let pageList = accData.data;

    if (!pageList || !Array.isArray(pageList) || pageList.length === 0) {
      // If /me/accounts is empty, check if the token is already a direct Page Access Token
      const pageTestRes = await fetch(
        `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${effectiveToken}`
      );
      const pageTestData = await pageTestRes.json();
      if (pageTestData.id && pageTestData.name) {
        pageList = [{
          id: pageTestData.id,
          name: pageTestData.name,
          access_token: effectiveToken
        }];
      } else {
        return res.status(400).json({
          success: false,
          message: accData.error?.message || "No Facebook Pages found with this token. Make sure pages_messaging and pages_show_list permissions were selected."
        });
      }
    }

    const savedPages = [];
    for (const page of pageList) {
      if (!page.id || !page.access_token) continue;

      // Subscribe to webhooks
      try {
        await fetch(
          `https://graph.facebook.com/v21.0/${page.id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads&access_token=${page.access_token}`,
          { method: "POST" }
        );
      } catch (subErr) {}

      // Save to database
      const [existing] = await pool.query(
        "SELECT id FROM integrations WHERE agency_id = ? AND platform = 'FACEBOOK' AND fb_page_id = ?",
        [agencyId, page.id]
      );

      if (existing.length) {
        await pool.query(
          "UPDATE integrations SET name = ?, access_token = ?, fb_page_name = ?, is_active = 1 WHERE id = ?",
          [page.name, page.access_token, page.name, existing[0].id]
        );
        savedPages.push({ id: existing[0].id, name: page.name, fbPageId: page.id });
      } else {
        const [ins] = await pool.query(
          "INSERT INTO integrations (agency_id, platform, name, access_token, verify_token, fb_page_id, fb_page_name, is_active) VALUES (?, 'FACEBOOK', ?, ?, ?, ?, ?, 1)",
          [agencyId, page.name, page.access_token, `fb_${page.id}`, page.id, page.name]
        );
        savedPages.push({ id: ins.insertId, name: page.name, fbPageId: page.id });
      }
    }

    return res.json({
      success: true,
      message: `Successfully connected ${savedPages.length} Facebook page(s) with permanent never-expiring access!`,
      pages: savedPages
    });
  } catch (err) {
    console.error("[Quick Connect Error]", err);
    return res.status(500).json({ success: false, message: "Server error connecting pages: " + err.message });
  }
});

// ─── Sync / Re-subscribe all Facebook Pages Webhooks ──────────────
router.post("/channels/facebook/sync-subscriptions", async (req, res) => {
  try {
    const [pages] = await pool.query(
      "SELECT * FROM integrations WHERE agency_id = ? AND platform = 'FACEBOOK' AND is_active = 1",
      [req.user.agencyId]
    );
    const results = [];
    for (const page of pages) {
      try {
        const subRes = await fetch(
          `https://graph.facebook.com/v19.0/${page.fb_page_id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads&access_token=${page.access_token}`,
          { method: "POST" }
        );
        const subData = await subRes.json();
        results.push({ id: page.id, name: page.name, pageId: page.fb_page_id, subscribed: subData.success, data: subData });
      } catch (err) {
        results.push({ id: page.id, name: page.name, error: err.message });
      }
    }
    return res.json({ success: true, results });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── Import pages from Facebook Graph API ─────────────────────────
router.post("/channels/facebook/import-pages", async (req, res) => {
  const { userAccessToken } = req.body;
  if (!userAccessToken)
    return res.status(400).json({ success: false, message: "User access token required" });
  try {
    const pageMap = new Map();

    const agencyId = req.user?.agencyId || 1;
    let appSecret = null;
    let appId = null;
    try {
      const [settings] = await pool.query(
        "SELECT app_id, app_secret FROM meta_app_settings WHERE agency_id = ? OR is_configured = 1 LIMIT 1",
        [agencyId]
      );
      if (settings.length) {
        appId = settings[0].app_id;
        appSecret = settings[0].app_secret;
      }
    } catch (e) {
      console.error('[FB import-pages] error fetching app settings:', e.message || e);
    }

    // 1. Upgrade user token to 60-day long-lived token (which yields permanent page tokens from /me/accounts)
    let effectiveUserToken = userAccessToken;
    if (appId && appSecret) {
      try {
        const exchangeUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${userAccessToken}`;
        const exRes = await fetch(exchangeUrl);
        const exData = await exRes.json();
        if (exData.access_token) {
          effectiveUserToken = exData.access_token;
          console.log('[FB import-pages] Successfully upgraded to long-lived token!');
        }
      } catch (exErr) {
        console.warn('[FB import-pages] Token exchange warning:', exErr.message);
      }
    }

    // 2. Direct /me/accounts call with effective token to get NEVER-EXPIRING page tokens
    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,category&access_token=${effectiveUserToken}`,
        { signal: AbortSignal.timeout(7000) }
      );
      const data = await response.json();
      console.log('[FB import-pages] /me/accounts response count:', data.data?.length);
      if (Array.isArray(data.data)) {
        for (const p of data.data) {
          if (p.id) pageMap.set(p.id, p);
        }
      }
    } catch (err) {
      console.error('[FB import-pages] error fetching /me/accounts:', err.message || err);
    }

    const debugTokenAccess = (appId && appSecret) ? `${appId}|${appSecret}` : userAccessToken;
    try {
      const debugRes = await fetch(
        `https://graph.facebook.com/debug_token?input_token=${userAccessToken}&access_token=${debugTokenAccess}`,
        { signal: AbortSignal.timeout(7000) }
      );
      const debugData = await debugRes.json();
      console.log('[FB import-pages] debug_token response:', JSON.stringify(debugData, null, 2));

      const granularScopes = debugData.data?.granular_scopes || [];
      const targetIds = new Set();
      for (const scopeObj of granularScopes) {
        if (Array.isArray(scopeObj.target_ids)) {
          scopeObj.target_ids.forEach(id => targetIds.add(id));
        }
      }

      // Query any specific target_id chosen in the FB popup that wasn't in /me/accounts
      for (const targetId of targetIds) {
        if (!pageMap.has(targetId)) {
          try {
            const pRes = await fetch(
              `https://graph.facebook.com/v19.0/${targetId}?fields=id,name,access_token,category&access_token=${userAccessToken}`,
              { signal: AbortSignal.timeout(5000) }
            );
            const pData = await pRes.json();
            console.log(`[FB import-pages] fetched target_id ${targetId}:`, pData);
            if (pData.id && !pData.error) {
              pageMap.set(pData.id, pData);
            }
          } catch (pe) {
            console.error(`[FB import-pages] error fetching target page ${targetId}:`, pe.message || pe);
          }
        }
      }
    } catch (de) {
      console.error('[FB import-pages] debug_token inspect error:', de.message || de);
    }

    // 3. Check /me/businesses for pages owned or managed via Business Manager
    try {
      const bizRes = await fetch(
        `https://graph.facebook.com/v19.0/me/businesses?fields=id,name,owned_pages{id,name,access_token,category},client_pages{id,name,access_token,category}&access_token=${userAccessToken}`,
        { signal: AbortSignal.timeout(7000) }
      );
      const bizData = await bizRes.json();
      console.log('[FB import-pages] /me/businesses response:', JSON.stringify(bizData, null, 2));
      if (Array.isArray(bizData.data)) {
        for (const biz of bizData.data) {
          const owned = biz.owned_pages?.data || [];
          const client = biz.client_pages?.data || [];
          [...owned, ...client].forEach(p => {
            if (p.id && !pageMap.has(p.id)) pageMap.set(p.id, p);
          });
        }
      }
    } catch (be) {
      console.error('[FB import-pages] /me/businesses error:', be.message || be);
    }

    const pages = Array.from(pageMap.values());
    console.log(`[FB import-pages] Final resolved pages count: ${pages.length}`);

    return res.json({
      success: true,
      pages,
      debug: { total: pages.length }
    });
  } catch (err) {
    console.error('[FB import-pages] fatal error:', err);
    return res.status(500).json({ success: false, message: "Failed to fetch pages" });
  }
});

router.delete("/channels/facebook/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'FACEBOOK'",
      [req.params.id, req.user.agencyId]);
    return res.json({ success: true, message: "Facebook page removed" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ═══════════════════════════════════════════════════════════════════
//  INSTAGRAM
// ═══════════════════════════════════════════════════════════════════

router.get("/channels/instagram", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM integrations WHERE agency_id = ? AND platform = 'INSTAGRAM' ORDER BY created_at DESC",
      [req.user.agencyId]
    );
    return res.json({ success: true, accounts: rows });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.post("/channels/instagram", async (req, res) => {
  const { name, accessToken, verifyToken, igAccountId, igUsername } = req.body;
  if (!name || !accessToken || !igAccountId)
    return res.status(400).json({ success: false, message: "Name, access token and account ID are required" });
  try {
    await pool.query(
      `INSERT INTO integrations (agency_id, platform, name, access_token, verify_token, ig_account_id, ig_username)
       VALUES (?, 'INSTAGRAM', ?, ?, ?, ?, ?)`,
      [req.user.agencyId, name, accessToken, verifyToken || null, igAccountId, igUsername || null]
    );
    return res.status(201).json({ success: true, message: "Instagram account connected" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.delete("/channels/instagram/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'INSTAGRAM'",
      [req.params.id, req.user.agencyId]);
    return res.json({ success: true, message: "Instagram account removed" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ═══════════════════════════════════════════════════════════════════
//  TELEGRAM
// ═══════════════════════════════════════════════════════════════════

router.get("/channels/telegram", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM telegram_bots WHERE agency_id = ? ORDER BY created_at DESC",
      [req.user.agencyId]
    );
    return res.json({ success: true, bots: rows });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.post("/channels/telegram", async (req, res) => {
  const { botToken } = req.body;
  if (!botToken) return res.status(400).json({ success: false, message: "Bot token is required" });
  try {
    // Verify token with Telegram API
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const tgData = await tgRes.json();
    if (!tgData.ok) return res.status(400).json({ success: false, message: "Invalid Telegram bot token" });

    const { first_name, username } = tgData.result;

    // Create integration record
    const [integ] = await pool.query(
      `INSERT INTO integrations (agency_id, platform, name, access_token, verify_token)
       VALUES (?, 'TELEGRAM', ?, ?, ?)`,
      [req.user.agencyId, `${first_name} (@${username})`, botToken, null]
    );

    // Save telegram bot record
    const [result] = await pool.query(
      `INSERT INTO telegram_bots (agency_id, integration_id, bot_token, bot_username, bot_name, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [req.user.agencyId, integ.insertId, botToken, username, first_name]
    );

    // Set webhook
    const webhookUrl = `${process.env.BACKEND_URL || `http://localhost:5000`}/api/v1/webhook/telegram/${req.user.agencyId}/${integ.insertId}`;
    const webhookRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
    const webhookData = await webhookRes.json();

    if (webhookData.ok) {
      await pool.query("UPDATE telegram_bots SET webhook_set = 1 WHERE id = ?", [result.insertId]);
    }

    return res.status(201).json({
      success: true,
      message: `Telegram bot @${username} connected`,
      botName: first_name,
      botUsername: username,
      webhookSet: webhookData.ok,
    });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.delete("/channels/telegram/:id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT bot_token FROM telegram_bots WHERE id = ? AND agency_id = ?",
      [req.params.id, req.user.agencyId]
    );
    if (rows.length) {
      await fetch(`https://api.telegram.org/bot${rows[0].bot_token}/deleteWebhook`).catch(() => {});
    }
    await pool.query("DELETE FROM telegram_bots WHERE id = ? AND agency_id = ?", [req.params.id, req.user.agencyId]);
    return res.json({ success: true, message: "Telegram bot removed" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ═══════════════════════════════════════════════════════════════════
//  WEBCHAT
// ═══════════════════════════════════════════════════════════════════

router.get("/channels/webchat", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM webchat_widgets WHERE agency_id = ? ORDER BY created_at DESC",
      [req.user.agencyId]
    );
    return res.json({ success: true, widgets: rows });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.post("/channels/webchat", async (req, res) => {
  const { name, primaryColor, greetingMessage, placeholderText, allowedDomains } = req.body;
  if (!name) return res.status(400).json({ success: false, message: "Widget name is required" });
  try {
    // Create integration record
    const [integ] = await pool.query(
      "INSERT INTO integrations (agency_id, platform, name, is_active) VALUES (?, 'WEBCHAT', ?, 1)",
      [req.user.agencyId, name]
    );

    const widgetKey = `wc_${req.user.agencyId}_${Date.now()}`;
    await pool.query(
      `INSERT INTO webchat_widgets (agency_id, integration_id, name, widget_key, primary_color, greeting_message, placeholder_text, allowed_domains)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.agencyId, integ.insertId, name, widgetKey,
        primaryColor || "#6366f1", greetingMessage || "Hello! How can we help you today?",
        placeholderText || "Type a message…", allowedDomains || null]
    );
    return res.status(201).json({ success: true, message: "Webchat widget created", widgetKey });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.put("/channels/webchat/:id", async (req, res) => {
  const { name, primaryColor, greetingMessage, placeholderText, allowedDomains, isActive } = req.body;
  try {
    await pool.query(
      `UPDATE webchat_widgets SET name=?, primary_color=?, greeting_message=?, placeholder_text=?, allowed_domains=?, is_active=?
       WHERE id=? AND agency_id=?`,
      [name, primaryColor, greetingMessage, placeholderText, allowedDomains, isActive ?? 1, req.params.id, req.user.agencyId]
    );
    return res.json({ success: true, message: "Widget updated" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.delete("/channels/webchat/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM webchat_widgets WHERE id = ? AND agency_id = ?", [req.params.id, req.user.agencyId]);
    return res.json({ success: true, message: "Widget deleted" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

export default router;
