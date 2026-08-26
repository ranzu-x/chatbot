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

// ─── WHATSAPP EMBEDDED SIGNUP (AUTOMATED OAUTH & TOKEN EXCHANGE) ─────────────
router.post("/channels/whatsapp/embedded-signup", async (req, res) => {
  const { code, wabaId, phoneNumberId, botId, name, accessToken: clientAccessToken, phoneNumber } = req.body;
  const agencyId = req.user.agencyId;

  try {
    // 1. Fetch Meta App credentials for this agency
    const [appRows] = await pool.query(
      "SELECT app_id, app_secret, verify_token FROM meta_app_settings WHERE agency_id = ? AND is_configured = 1 LIMIT 1",
      [agencyId]
    );

    let accessToken = clientAccessToken || null;
    let appId = appRows[0]?.app_id || process.env.META_APP_ID;
    let appSecret = appRows[0]?.app_secret || process.env.META_APP_SECRET;
    let verifyToken = appRows[0]?.verify_token || "nexa_meta_verify_token";

    // 2. Exchange authorization code for permanent/long-lived access token if code provided
    if (code && appId && appSecret) {
      try {
        const exchangeUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${code}`;
        const exRes = await fetch(exchangeUrl);
        const exData = await exRes.json();
        if (exData.access_token) {
          accessToken = exData.access_token;
          console.log("[WhatsApp Embedded Signup] Successfully exchanged code for system token!");
        } else {
          console.warn("[WhatsApp Embedded Token Exchange] Warning:", exData);
        }
      } catch (exErr) {
        console.warn("Token exchange failed:", exErr.message);
      }
    }

    // 3. Fetch phone number details from Meta Graph API if token available
    let phoneDisplay = phoneNumber || phoneNumberId || "WhatsApp Business";
    let verifiedName = name || null;

    if (phoneNumberId && accessToken) {
      try {
        const phoneUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}?fields=display_phone_number,verified_name,code_verification_status,quality_rating&access_token=${accessToken}`;
        const pRes = await fetch(phoneUrl);
        const pData = await pRes.json();
        if (pData.display_phone_number) phoneDisplay = pData.display_phone_number;
        if (pData.verified_name) verifiedName = pData.verified_name;
      } catch (pErr) {
        console.warn("Could not fetch phone details:", pErr.message);
      }
    }

    // 4. Auto-subscribe WABA to Meta App webhooks
    if (wabaId && accessToken) {
      try {
        const subUrl = `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`;
        await fetch(subUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: accessToken })
        });
        console.log(`[WhatsApp Embedded] Subscribed WABA ${wabaId} to webhooks successfully!`);
      } catch (subErr) {
        console.warn("Webhook subscription notice:", subErr.message);
      }
    }

    // 5. Insert or Update in integrations table
    const accountName = verifiedName || `${phoneDisplay} (WhatsApp)`;
    const pId = phoneNumberId || `wa_${Date.now()}`;

    const [existing] = await pool.query(
      "SELECT id FROM integrations WHERE agency_id = ? AND platform = 'WHATSAPP' AND (wa_phone_number_id = ? OR name = ?)",
      [agencyId, pId, accountName]
    );

    let integrationId;
    if (existing.length) {
      integrationId = existing[0].id;
      await pool.query(
        `UPDATE integrations SET name = ?, access_token = ?, verify_token = ?, wa_phone_number_id = ?, wa_business_acc_id = ?, is_active = 1, updated_at = NOW()
         WHERE id = ?`,
        [accountName, accessToken || existing[0].access_token || "embedded_token", verifyToken, pId, wabaId || null, integrationId]
      );
    } else {
      const [ins] = await pool.query(
        `INSERT INTO integrations (agency_id, platform, name, access_token, verify_token, wa_phone_number_id, wa_business_acc_id, is_active)
         VALUES (?, 'WHATSAPP', ?, ?, ?, ?, ?, 1)`,
        [agencyId, accountName, accessToken || "embedded_token", verifyToken, pId, wabaId || null]
      );
      integrationId = ins.insertId;
    }

    return res.status(201).json({
      success: true,
      message: "WhatsApp Business Account connected via Embedded Signup successfully!",
      integration: {
        id: integrationId,
        name: accountName,
        phoneDisplay,
        phoneNumberId: pId,
        wabaId,
      }
    });
  } catch (err) {
    console.error("WhatsApp Embedded Signup error:", err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

// ─── DISCOVER USER WHATSAPP ACCOUNTS (FROM USER ACCESS TOKEN) ─────────────
router.post("/channels/whatsapp/discover-accounts", async (req, res) => {
  const { userAccessToken } = req.body;
  if (!userAccessToken) return res.status(400).json({ success: false, message: "User access token required" });

  try {
    const discovered = [];

    // 1. Fetch user's businesses
    const bRes = await fetch(`https://graph.facebook.com/v21.0/me/businesses?fields=id,name&access_token=${userAccessToken}`);
    const bData = await bRes.json();

    if (Array.isArray(bData.data)) {
      for (const biz of bData.data) {
        try {
          const wRes = await fetch(`https://graph.facebook.com/v21.0/${biz.id}/client_whatsapp_business_accounts?fields=id,name,phone_numbers{id,display_phone_number,verified_name,quality_rating}&access_token=${userAccessToken}`);
          const wData = await wRes.json();
          if (Array.isArray(wData.data)) {
            for (const waba of wData.data) {
              const numbers = waba.phone_numbers?.data || [];
              if (numbers.length > 0) {
                for (const num of numbers) {
                  discovered.push({
                    wabaId: waba.id,
                    wabaName: waba.name || biz.name,
                    phoneNumberId: num.id,
                    displayPhoneNumber: num.display_phone_number,
                    verifiedName: num.verified_name || `${biz.name} WhatsApp`,
                    qualityRating: num.quality_rating,
                  });
                }
              } else {
                discovered.push({
                  wabaId: waba.id,
                  wabaName: waba.name || biz.name,
                  phoneNumberId: null,
                  displayPhoneNumber: 'Pending Number Setup',
                  verifiedName: waba.name || biz.name,
                });
              }
            }
          }
        } catch (wErr) {
          console.warn("WABA fetch notice:", wErr.message);
        }
      }
    }

    // 2. Also check if user has direct phone number debug access
    return res.json({ success: true, accounts: discovered });
  } catch (err) {
    console.error("Discover WhatsApp accounts error:", err);
    return res.status(500).json({ success: false, message: "Failed to discover WhatsApp accounts" });
  }
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

// ═══════════════════════════════════════════════════════════════════
//  FACEBOOK COMMENT AUTOMATION RULES
// ═══════════════════════════════════════════════════════════════════

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fb_comment_rules (
      id INT AUTO_INCREMENT PRIMARY KEY,
      agency_id INT NOT NULL,
      integration_id INT,
      campaign_name VARCHAR(255) NOT NULL,
      post_id VARCHAR(255) DEFAULT 'ALL_POSTS',
      trigger_type ENUM('ALL', 'KEYWORDS') DEFAULT 'ALL',
      trigger_keywords TEXT,
      auto_reply_comment TEXT,
      auto_reply_private_message TEXT,
      enable_like_comment TINYINT(1) DEFAULT 1,
      enable_hide_comment TINYINT(1) DEFAULT 0,
      is_active TINYINT(1) DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
} catch (e) {
  console.warn("fb_comment_rules table check:", e.message);
}

// GET all comment rules
router.get("/channels/facebook/comment-rules", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, i.name as page_name, i.fb_page_id 
       FROM fb_comment_rules r 
       LEFT JOIN integrations i ON i.id = r.integration_id 
       WHERE r.agency_id = ? 
       ORDER BY r.created_at DESC`,
      [req.user.agencyId]
    );
    return res.json({ success: true, rules: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// CREATE comment rule
router.post("/channels/facebook/comment-rules", async (req, res) => {
  const {
    campaignName,
    integrationId,
    postId,
    triggerType,
    triggerKeywords,
    autoReplyComment,
    autoReplyPrivateMessage,
    enableLikeComment,
    enableHideComment,
  } = req.body;

  if (!campaignName || (!autoReplyComment && !autoReplyPrivateMessage)) {
    return res.status(400).json({
      success: false,
      message: "Campaign name and at least one auto-reply message are required",
    });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO fb_comment_rules (
        agency_id, integration_id, campaign_name, post_id, trigger_type,
        trigger_keywords, auto_reply_comment, auto_reply_private_message,
        enable_like_comment, enable_hide_comment, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
      [
        req.user.agencyId,
        integrationId || null,
        campaignName,
        postId || "ALL_POSTS",
        triggerType || "ALL",
        triggerKeywords || null,
        autoReplyComment || null,
        autoReplyPrivateMessage || null,
        enableLikeComment ? 1 : 0,
        enableHideComment ? 1 : 0,
      ]
    );
    return res.status(201).json({ success: true, message: "Comment campaign created", id: result.insertId });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// UPDATE comment rule
router.put("/channels/facebook/comment-rules/:id", async (req, res) => {
  const {
    campaignName,
    integrationId,
    postId,
    triggerType,
    triggerKeywords,
    autoReplyComment,
    autoReplyPrivateMessage,
    enableLikeComment,
    enableHideComment,
  } = req.body;

  try {
    await pool.query(
      `UPDATE fb_comment_rules SET
        campaign_name = ?, integration_id = ?, post_id = ?, trigger_type = ?,
        trigger_keywords = ?, auto_reply_comment = ?, auto_reply_private_message = ?,
        enable_like_comment = ?, enable_hide_comment = ?
       WHERE id = ? AND agency_id = ?`,
      [
        campaignName,
        integrationId || null,
        postId || "ALL_POSTS",
        triggerType || "ALL",
        triggerKeywords || null,
        autoReplyComment || null,
        autoReplyPrivateMessage || null,
        enableLikeComment ? 1 : 0,
        enableHideComment ? 1 : 0,
        req.params.id,
        req.user.agencyId,
      ]
    );
    return res.json({ success: true, message: "Comment campaign updated" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// TOGGLE comment rule
router.patch("/channels/facebook/comment-rules/:id/toggle", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT is_active FROM fb_comment_rules WHERE id = ? AND agency_id = ?",
      [req.params.id, req.user.agencyId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Rule not found" });
    const newStatus = rows[0].is_active ? 0 : 1;
    await pool.query(
      "UPDATE fb_comment_rules SET is_active = ? WHERE id = ? AND agency_id = ?",
      [newStatus, req.params.id, req.user.agencyId]
    );
    return res.json({ success: true, isActive: newStatus === 1 });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE comment rule
router.delete("/channels/facebook/comment-rules/:id", async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM fb_comment_rules WHERE id = ? AND agency_id = ?",
      [req.params.id, req.user.agencyId]
    );
    return res.json({ success: true, message: "Comment campaign deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
