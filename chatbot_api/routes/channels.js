import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { assertModuleAccess, assertLimit } from "../utils/entitlements.js";

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
    console.error("Error resolving agencyId in channels:", err);
  }
  return 1;
}

// Router middleware to attach resolved agencyId to req
router.use(async (req, res, next) => {
  try {
    req.agencyId = await resolveAgencyId(req);
    next();
  } catch (e) {
    req.agencyId = 1;
    next();
  }
});

// ═══════════════════════════════════════════════════════════════════
//  WHATSAPP
// ═══════════════════════════════════════════════════════════════════

router.get("/channels/whatsapp", async (req, res) => {
  try {
    const agencyId = req.agencyId || await resolveAgencyId(req);
    const [rows] = await pool.query(
      "SELECT * FROM integrations WHERE agency_id = ? AND platform = 'WHATSAPP' ORDER BY created_at DESC",
      [agencyId]
    );

    // Auto-backfill wa_display_phone for accounts that are missing it
    const backfillPromises = rows
      .filter(acc => !acc.wa_display_phone && acc.wa_phone_number_id && acc.access_token?.startsWith('EAA') && acc.access_token.length > 20)
      .map(async (acc) => {
        try {
          const url = `https://graph.facebook.com/v21.0/${acc.wa_phone_number_id}?fields=display_phone_number,verified_name&access_token=${acc.access_token}`;
          const r = await fetch(url);
          const d = await r.json();
          if (d.display_phone_number) {
            await pool.query(
              "UPDATE integrations SET wa_display_phone = ? WHERE id = ?",
              [d.display_phone_number, acc.id]
            );
            acc.wa_display_phone = d.display_phone_number;
          }
        } catch (_) { /* silently skip if fetch fails */ }
      });

    await Promise.allSettled(backfillPromises);

    return res.json({ success: true, accounts: rows });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.post("/channels/whatsapp", async (req, res) => {
  const { name, accessToken: inputToken, verifyToken, waPhoneNumberId, waBusinessAccId, waDisplayPhone } = req.body;
  if (!name || !waPhoneNumberId)
    return res.status(400).json({ success: false, message: "Account Name and WhatsApp Phone Number ID are required" });
  try {
    const agencyId = req.agencyId || await resolveAgencyId(req);
    await assertModuleAccess(agencyId, "channel_whatsapp");
    await assertLimit(agencyId, "max_bot_accounts");

    let accessToken = inputToken?.trim() || null;
    if (!accessToken) {
      const [appRows] = await pool.query(
        "SELECT system_user_token FROM meta_app_settings WHERE agency_id = ? AND is_configured = 1 LIMIT 1",
        [agencyId]
      );
      if (appRows.length && appRows[0].system_user_token) {
        accessToken = appRows[0].system_user_token.trim();
      }
    }
    if (!accessToken) {
      accessToken = "manual_placeholder";
    }
    await pool.query(
      `INSERT INTO integrations 
         (agency_id, platform, name, access_token, verify_token, wa_phone_number_id, wa_display_phone, wa_business_acc_id, with_catalog, connection_method) 
       VALUES (?, 'WHATSAPP', ?, ?, ?, ?, ?, ?, 0, 'MANUAL')`,
      [agencyId, name, accessToken, verifyToken || null, waPhoneNumberId, waDisplayPhone || null, waBusinessAccId || null]
    );
    return res.status(201).json({ success: true, message: "WhatsApp account connected" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.delete("/channels/whatsapp/:id", async (req, res) => {
  try {
    const agencyId = req.agencyId || await resolveAgencyId(req);
    await pool.query("DELETE FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'WHATSAPP'",
      [req.params.id, agencyId]);
    return res.json({ success: true, message: "WhatsApp account removed" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

const isValidMetaToken = (t) => Boolean(t && typeof t === 'string' && t.startsWith('EAA') && t.length > 20);

// ─── REGISTER WHATSAPP NUMBER VIA META CLOUD API ────────────────────────────
router.post("/channels/whatsapp/:id/register", async (req, res) => {
  const { pin, accessToken: bodyToken } = req.body;
  const agencyId = req.agencyId || await resolveAgencyId(req);

  if (!pin || !/^\d{6}$/.test(pin)) {
    return res.status(400).json({ success: false, message: "A valid 6-digit numeric PIN is required." });
  }

  try {
    const [rows] = await pool.query(
      "SELECT * FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'WHATSAPP'",
      [req.params.id, agencyId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "WhatsApp account not found" });

    const integration = rows[0];
    const phoneNumberId = integration.wa_phone_number_id;

    // Priority:
    // 1) valid token provided directly in request body
    // 2) valid stored integration.access_token
    // 3) valid system_user_token in meta_app_settings
    let accessToken = null;
    if (isValidMetaToken(bodyToken?.trim())) {
      accessToken = bodyToken.trim();
    } else if (isValidMetaToken(integration.access_token)) {
      accessToken = integration.access_token.trim();
    } else {
      const [appRows] = await pool.query(
        "SELECT system_user_token FROM meta_app_settings WHERE agency_id = ? AND is_configured = 1 LIMIT 1",
        [agencyId]
      );
      if (isValidMetaToken(appRows[0]?.system_user_token)) {
        accessToken = appRows[0].system_user_token.trim();
        await pool.query("UPDATE integrations SET access_token = ? WHERE id = ?", [accessToken, integration.id]);
      }
    }

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        message: "A valid Meta Access Token (starting with 'EAA...') is required. Please paste your token from Meta Dashboard → WhatsApp → API Setup or connect via Embedded Signup.",
        requiresToken: true
      });
    }

    // If user provided a new valid token in body, persist it
    if (isValidMetaToken(bodyToken?.trim()) && bodyToken.trim() !== integration.access_token) {
      await pool.query(
        "UPDATE integrations SET access_token = ? WHERE id = ?",
        [bodyToken.trim(), integration.id]
      );
      await pool.query(
        "UPDATE meta_app_settings SET system_user_token = ? WHERE agency_id = ? AND is_configured = 1",
        [bodyToken.trim(), agencyId]
      );
      console.log(`[WA Register] Updated and saved access_token for integration ${integration.id}`);
    }

    const regUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/register`;
    const regRes = await fetch(regUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        pin
      })
    });

    const regData = await regRes.json();
    console.log("[WA Register] Meta response:", JSON.stringify(regData));

    if (regData.error) {
      return res.status(400).json({
        success: false,
        message: regData.error.message || "Registration failed with Meta",
        error: regData.error
      });
    }

    return res.json({
      success: true,
      message: "WhatsApp phone number successfully registered and activated with Meta Cloud API!",
      data: regData
    });
  } catch (err) {
    console.error("WhatsApp registration error:", err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});


// ─── WHATSAPP EMBEDDED SIGNUP (AUTOMATED OAUTH & TOKEN EXCHANGE) ─────────────
router.post("/channels/whatsapp/embedded-signup", async (req, res) => {
  const { code, wabaId, phoneNumberId, botId, name, accessToken: clientAccessToken, phoneNumber, withCatalog } = req.body;
  const agencyId = req.agencyId || await resolveAgencyId(req);
  const catalogFlag = withCatalog ? 1 : 0;

  try {
    await assertModuleAccess(agencyId, "channel_whatsapp");
    await assertLimit(agencyId, "max_bot_accounts");

    // 1. Fetch Meta App credentials for this agency
    const [appRows] = await pool.query(
      "SELECT app_id, app_secret, system_user_token, verify_token FROM meta_app_settings WHERE agency_id = ? AND is_configured = 1 LIMIT 1",
      [agencyId]
    );

    let accessToken = isValidMetaToken(clientAccessToken) ? clientAccessToken.trim() : null;
    let appId = appRows[0]?.app_id || process.env.META_APP_ID;
    let appSecret = appRows[0]?.app_secret || process.env.META_APP_SECRET;
    let verifyToken = appRows[0]?.verify_token || "nexa_meta_verify_token";

    // 2. Exchange authorization code for permanent/long-lived access token if code provided
    if (code && appId && appSecret) {
      try {
        const exchangeUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${code}`;
        const exRes = await fetch(exchangeUrl);
        const exData = await exRes.json();
        if (isValidMetaToken(exData.access_token)) {
          accessToken = exData.access_token;
          console.log("[WhatsApp Embedded Signup] Successfully exchanged code for system token!");
        } else {
          console.warn("[WhatsApp Embedded Token Exchange] Notice:", exData);
        }
      } catch (exErr) {
        console.warn("Token exchange failed:", exErr.message);
      }
    }

    if (!accessToken && isValidMetaToken(appRows[0]?.system_user_token)) {
      accessToken = appRows[0].system_user_token.trim();
    }

    // Save valid token to meta_app_settings for workspace reuse
    if (isValidMetaToken(accessToken)) {
      try {
        await pool.query(
          "UPDATE meta_app_settings SET system_user_token = ? WHERE agency_id = ? AND is_configured = 1",
          [accessToken, agencyId]
        );
      } catch (setErr) {
        console.warn("Could not save system_user_token:", setErr.message);
      }
    }

    let effectivePhoneNumberId = phoneNumberId;
    let effectiveWabaId = wabaId;
    let phoneDisplay = phoneNumber || phoneNumberId || "WhatsApp Business";
    let verifiedName = name || null;

    // Auto-discover WABA and Phone Number ID from Meta if not supplied
    if ((!effectivePhoneNumberId || !effectiveWabaId) && isValidMetaToken(accessToken)) {
      try {
        const bRes = await fetch(`https://graph.facebook.com/v21.0/me/businesses?fields=id,name&access_token=${accessToken}`);
        const bData = await bRes.json();
        if (Array.isArray(bData.data)) {
          for (const biz of bData.data) {
            const wRes = await fetch(`https://graph.facebook.com/v21.0/${biz.id}/client_whatsapp_business_accounts?fields=id,name,phone_numbers{id,display_phone_number,verified_name}&access_token=${accessToken}`);
            const wData = await wRes.json();
            if (Array.isArray(wData.data) && wData.data.length > 0) {
              const firstWaba = wData.data[0];
              effectiveWabaId = effectiveWabaId || firstWaba.id;
              if (firstWaba.phone_numbers?.data?.length > 0) {
                const firstPhone = firstWaba.phone_numbers.data[0];
                effectivePhoneNumberId = effectivePhoneNumberId || firstPhone.id;
                if (firstPhone.display_phone_number) phoneDisplay = firstPhone.display_phone_number;
                if (firstPhone.verified_name) verifiedName = firstPhone.verified_name;
              }
              break;
            }
          }
        }
      } catch (discErr) {
        console.warn("[WhatsApp Embedded] Auto-discovery notice:", discErr.message);
      }
    }

    // 3. Fetch phone number details from Meta Graph API if valid token available
    if (effectivePhoneNumberId && isValidMetaToken(accessToken)) {
      try {
        const phoneUrl = `https://graph.facebook.com/v21.0/${effectivePhoneNumberId}?fields=display_phone_number,verified_name,code_verification_status,quality_rating&access_token=${accessToken}`;
        const pRes = await fetch(phoneUrl);
        const pData = await pRes.json();
        if (pData.display_phone_number) phoneDisplay = pData.display_phone_number;
        if (pData.verified_name) verifiedName = pData.verified_name;
      } catch (pErr) {
        console.warn("Could not fetch phone details:", pErr.message);
      }
    }

    // 4. Auto-subscribe WABA to Meta App webhooks
    if (effectiveWabaId && isValidMetaToken(accessToken)) {
      try {
        const subUrl = `https://graph.facebook.com/v21.0/${effectiveWabaId}/subscribed_apps`;
        await fetch(subUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: accessToken })
        });
        console.log(`[WhatsApp Embedded] Subscribed WABA ${effectiveWabaId} to webhooks successfully!`);
      } catch (subErr) {
        console.warn("Webhook subscription notice:", subErr.message);
      }
    }

    // 5. Auto-register phone number with Meta Cloud API to activate it
    if (effectivePhoneNumberId && isValidMetaToken(accessToken)) {
      try {
        const regUrl = `https://graph.facebook.com/v21.0/${effectivePhoneNumberId}/register`;
        const regRes = await fetch(regUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            pin: "123456"
          })
        });
        const regData = await regRes.json();
        if (regData.success) {
          console.log(`[WhatsApp Embedded] Auto-registered phone number ${effectivePhoneNumberId} successfully!`);
        } else {
          console.warn("[WhatsApp Embedded] Auto-register notice:", regData);
        }
      } catch (regErr) {
        console.warn("[WhatsApp Embedded] Auto-register notice:", regErr.message);
      }
    }

    // 6. Insert or Update in integrations table
    const accountName = verifiedName || `${phoneDisplay} (WhatsApp)`;
    const pId = effectivePhoneNumberId || `wa_${Date.now()}`;

    const [existing] = await pool.query(
      "SELECT id, access_token FROM integrations WHERE agency_id = ? AND platform = 'WHATSAPP' AND (wa_phone_number_id = ? OR name = ?)",
      [agencyId, pId, accountName]
    );

    let integrationId;
    if (existing.length) {
      integrationId = existing[0].id;
      await pool.query(
        `UPDATE integrations
           SET name = ?, access_token = ?, verify_token = ?, wa_phone_number_id = ?,
               wa_display_phone = ?, wa_business_acc_id = ?, is_active = 1, with_catalog = ?,
               connection_method = 'EMBEDDED', updated_at = NOW()
         WHERE id = ?`,
        [accountName, accessToken || existing[0].access_token || "embedded_token",
         verifyToken, pId, phoneDisplay || null, effectiveWabaId || null, catalogFlag, integrationId]
      );
    } else {
      const [ins] = await pool.query(
        `INSERT INTO integrations
           (agency_id, platform, name, access_token, verify_token,
            wa_phone_number_id, wa_display_phone, wa_business_acc_id, is_active, with_catalog, connection_method)
         VALUES (?, 'WHATSAPP', ?, ?, ?, ?, ?, ?, 1, ?, 'EMBEDDED')`,
        [agencyId, accountName, accessToken || "embedded_token",
         verifyToken, pId, phoneDisplay || null, effectiveWabaId || null, catalogFlag]
      );
      integrationId = ins.insertId;
    }

    return res.status(201).json({
      success: true,
      message: "WhatsApp Business Account connected and activated successfully!",
      integration: {
        id: integrationId,
        name: accountName,
        phoneDisplay,
        phoneNumberId: pId,
        wabaId: effectiveWabaId,

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
      [req.agencyId]
    );
    return res.json({ success: true, pages: rows });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.post("/channels/facebook", async (req, res) => {
  const { name, accessToken, userAccessToken, verifyToken, fbPageId, fbPageName } = req.body;
  if (!name || !accessToken || !fbPageId)
    return res.status(400).json({ success: false, message: "Name, access token and page ID are required" });

  try {
    await assertModuleAccess(req.agencyId, "channel_facebook");
    await assertLimit(req.agencyId, "max_bot_accounts");

    // Try auto-exchanging for a permanent never-expiring Page Access Token
    let finalAccessToken = accessToken;
    let finalUserToken = userAccessToken || null;
    try {
      const [appRows] = await pool.query(
        "SELECT app_id, app_secret FROM meta_app_settings WHERE agency_id = ? AND is_configured = 1 LIMIT 1",
        [req.agencyId]
      );
      if (appRows.length && appRows[0].app_id && appRows[0].app_secret) {
        const { app_id, app_secret } = appRows[0];
        
        // 1. Exchange token for long-lived user token
        const exchangeUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${app_id}&client_secret=${app_secret}&fb_exchange_token=${userAccessToken || accessToken}`;
        const exRes = await fetch(exchangeUrl);
        const exData = await exRes.json();
        
        const longLivedUserToken = exData.access_token || userAccessToken || accessToken;
        finalUserToken = longLivedUserToken;
        
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
        `https://graph.facebook.com/v21.0/${fbPageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads,feed&access_token=${finalAccessToken}`,
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
      [req.agencyId, fbPageId]
    );

    if (existing.length) {
      await pool.query(
        `UPDATE integrations SET name = ?, access_token = ?, user_access_token = ?, verify_token = ?, fb_page_name = ?, is_active = 1
         WHERE id = ?`,
        [name, finalAccessToken, finalUserToken, verifyToken || null, fbPageName || null, existing[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO integrations (agency_id, platform, name, access_token, user_access_token, verify_token, fb_page_id, fb_page_name, is_active)
         VALUES (?, 'FACEBOOK', ?, ?, ?, ?, ?, ?, 1)`,
        [req.agencyId, name, finalAccessToken, finalUserToken, verifyToken || null, fbPageId, fbPageName || null]
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
    await assertModuleAccess(agencyId, "channel_facebook");
    await assertLimit(agencyId, "max_bot_accounts");

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
          `https://graph.facebook.com/v21.0/${page.id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads,feed&access_token=${page.access_token}`,
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
          "UPDATE integrations SET name = ?, access_token = ?, user_access_token = ?, fb_page_name = ?, is_active = 1 WHERE id = ?",
          [page.name, page.access_token, effectiveToken, page.name, existing[0].id]
        );
        savedPages.push({ id: existing[0].id, name: page.name, fbPageId: page.id });
      } else {
        const [ins] = await pool.query(
          "INSERT INTO integrations (agency_id, platform, name, access_token, user_access_token, verify_token, fb_page_id, fb_page_name, is_active) VALUES (?, 'FACEBOOK', ?, ?, ?, ?, ?, ?, 1)",
          [agencyId, page.name, page.access_token, effectiveToken, `fb_${page.id}`, page.id, page.name]
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
      [req.agencyId]
    );
    const results = [];
    for (const page of pages) {
      try {
        const subRes = await fetch(
          `https://graph.facebook.com/v21.0/${page.fb_page_id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads,feed&access_token=${page.access_token}`,
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
      [req.params.id, req.agencyId]);
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
      [req.agencyId]
    );
    return res.json({ success: true, accounts: rows });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.post("/channels/instagram", async (req, res) => {
  const { name, accessToken, verifyToken, igAccountId, igUsername, pageId, pageAccessToken } = req.body;
  if (!name || !accessToken || !igAccountId)
    return res.status(400).json({ success: false, message: "Name, access token and account ID are required" });
  try {
    await assertModuleAccess(req.agencyId, "channel_instagram");
    await assertLimit(req.agencyId, "max_bot_accounts");

    // Check if account already exists for this agency
    const [existing] = await pool.query(
      "SELECT id FROM integrations WHERE agency_id = ? AND platform = 'INSTAGRAM' AND ig_account_id = ?",
      [req.agencyId, igAccountId]
    );

    if (existing.length > 0) {
      await pool.query(
        `UPDATE integrations 
         SET name = ?, access_token = ?, verify_token = ?, ig_username = ?, fb_page_id = COALESCE(?, fb_page_id), is_active = 1
         WHERE id = ?`,
        [name, accessToken, verifyToken || null, igUsername || null, pageId || null, existing[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO integrations (agency_id, platform, name, access_token, verify_token, ig_account_id, ig_username, fb_page_id)
         VALUES (?, 'INSTAGRAM', ?, ?, ?, ?, ?, ?)`,
        [req.agencyId, name, accessToken, verifyToken || null, igAccountId, igUsername || null, pageId || null]
      );
    }

    // Auto-subscribe the connected Page to Instagram webhooks
    const tokenToUse = pageAccessToken || accessToken;
    if (pageId && tokenToUse) {
      try {
        await fetch(`https://graph.facebook.com/v21.0/${pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_optins,message_reactions,message_reads,standby,comments,feed&access_token=${tokenToUse}`, {
          method: 'POST',
        });
      } catch (subErr) {
        console.error('[IG subscribed_apps error]:', subErr);
      }
    }

    return res.status(201).json({ success: true, message: "Instagram account connected successfully" });
  } catch (err) {
    console.error("[Instagram connect error]:", err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

// ─── Instagram 1-Click Permanent Token Connect ─────────────────────────────
router.post("/channels/instagram/quick-connect", async (req, res) => {
  const { userAccessToken } = req.body;
  const agencyId = req.agencyId || req.user?.agencyId;

  if (!userAccessToken?.trim()) {
    return res.status(400).json({ success: false, message: "Access token is required" });
  }

  try {
    await assertModuleAccess(agencyId, "channel_instagram");
    const rawToken = userAccessToken.trim();

    // 1. Fetch Meta App Credentials to auto-upgrade to long-lived token
    let appId = null, appSecret = null;
    try {
      const [appRows] = await pool.query(
        "SELECT app_id, app_secret FROM meta_app_settings WHERE agency_id = ? AND is_configured = 1 LIMIT 1",
        [agencyId]
      );
      if (appRows.length && appRows[0].app_id && appRows[0].app_secret) {
        appId = appRows[0].app_id;
        appSecret = appRows[0].app_secret;
      }
    } catch (_) {}

    let effectiveToken = rawToken;
    if (appId && appSecret) {
      try {
        const exchangeRes = await fetch(
          `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${rawToken}`
        );
        const exchangeData = await exchangeRes.json();
        if (exchangeData.access_token) {
          effectiveToken = exchangeData.access_token;
        }
      } catch (e) {}
    }

    const discoveredIgAccounts = [];
    const seenIds = new Set();

    // 2. Direct /me check (if token is a Page Token with linked IG account)
    try {
      const meRes = await fetch(
        `https://graph.facebook.com/v21.0/me?fields=id,name,access_token,instagram_business_account{id,name,username,profile_picture_url,followers_count},connected_instagram_account{id,name,username,profile_picture_url,followers_count}&access_token=${effectiveToken}`
      );
      const meData = await meRes.json();
      const ig = meData.instagram_business_account || meData.connected_instagram_account;
      if (ig && ig.id) {
        seenIds.add(ig.id);
        discoveredIgAccounts.push({
          ...ig,
          pageId: meData.id,
          pageName: meData.name,
          pageAccessToken: effectiveToken,
        });
      }
    } catch (_) {}

    // 3. /me/accounts check (if token is a User Token managing multiple pages)
    try {
      const accRes = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,name,username,profile_picture_url,followers_count},connected_instagram_account{id,name,username,profile_picture_url,followers_count}&access_token=${effectiveToken}`
      );
      const accData = await accRes.json();
      if (Array.isArray(accData.data)) {
        for (const page of accData.data) {
          const ig = page.instagram_business_account || page.connected_instagram_account;
          if (ig && ig.id && !seenIds.has(ig.id)) {
            seenIds.add(ig.id);
            discoveredIgAccounts.push({
              ...ig,
              pageId: page.id,
              pageName: page.name,
              pageAccessToken: page.access_token || effectiveToken,
            });
          }
        }
      }
    } catch (_) {}

    if (!discoveredIgAccounts.length) {
      return res.status(400).json({
        success: false,
        message: "No Instagram Business or Creator accounts found with this token. Make sure your Instagram account is switched to Professional/Business and linked to your Facebook Page.",
      });
    }

    const savedAccounts = [];

    // 4. Save and auto-subscribe all discovered accounts
    for (const acc of discoveredIgAccounts) {
      const displayName = acc.name || `@${acc.username}` || "Instagram Account";
      const tokenToSave = acc.pageAccessToken || effectiveToken;

      // Subscribe Page to Instagram webhooks
      if (acc.pageId && tokenToSave) {
        try {
          await fetch(
            `https://graph.facebook.com/v21.0/${acc.pageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_optins,message_reactions,message_reads,standby,comments,feed&access_token=${tokenToSave}`,
            { method: "POST" }
          );
        } catch (_) {}
      }

      const [existing] = await pool.query(
        "SELECT id FROM integrations WHERE agency_id = ? AND platform = 'INSTAGRAM' AND ig_account_id = ?",
        [agencyId, acc.id]
      );

      if (existing.length) {
        await pool.query(
          "UPDATE integrations SET name = ?, access_token = ?, user_access_token = ?, ig_username = ?, fb_page_id = ?, is_active = 1 WHERE id = ?",
          [displayName, tokenToSave, effectiveToken, acc.username || null, acc.pageId || null, existing[0].id]
        );
        savedAccounts.push({ id: existing[0].id, name: displayName, username: acc.username, igAccountId: acc.id });
      } else {
        const [ins] = await pool.query(
          "INSERT INTO integrations (agency_id, platform, name, access_token, user_access_token, verify_token, ig_account_id, ig_username, fb_page_id, is_active) VALUES (?, 'INSTAGRAM', ?, ?, ?, ?, ?, ?, ?, 1)",
          [agencyId, displayName, tokenToSave, effectiveToken, `ig_${acc.id}`, acc.id, acc.username || null, acc.pageId || null]
        );
        savedAccounts.push({ id: ins.insertId, name: displayName, username: acc.username, igAccountId: acc.id });
      }
    }

    return res.json({
      success: true,
      message: `Successfully connected ${savedAccounts.length} Instagram Professional account(s)!`,
      accounts: savedAccounts,
    });
  } catch (err) {
    console.error("[IG Quick Connect Error]", err);
    return res.status(500).json({ success: false, message: "Server error connecting Instagram: " + err.message });
  }
});

// ─── Auto-Sync Linked Instagram Accounts from Existing Facebook Pages ──────
router.post("/channels/instagram/sync-from-facebook", async (req, res) => {
  const agencyId = req.agencyId || req.user?.agencyId;
  try {
    const [fbIntegrations] = await pool.query(
      "SELECT * FROM integrations WHERE agency_id = ? AND platform = 'FACEBOOK' AND is_active = 1",
      [agencyId]
    );

    if (!fbIntegrations.length) {
      return res.status(400).json({ success: false, message: "No active Facebook Pages found. Connect a Facebook Page first." });
    }

    const connectedIgList = [];

    for (const fb of fbIntegrations) {
      const pageToken = fb.access_token;
      if (!pageToken) continue;

      try {
        const checkRes = await fetch(
          `https://graph.facebook.com/v21.0/me?fields=id,name,instagram_business_account{id,name,username,profile_picture_url,followers_count},connected_instagram_account{id,name,username,profile_picture_url,followers_count}&access_token=${pageToken}`
        );
        const checkData = await checkRes.json();
        const ig = checkData.instagram_business_account || checkData.connected_instagram_account;

        if (ig && ig.id) {
          const displayName = ig.name || `@${ig.username}` || `${fb.name} Instagram`;

          // Subscribe Page to Instagram webhooks
          try {
            await fetch(
              `https://graph.facebook.com/v21.0/${fb.fb_page_id || checkData.id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_optins,message_reactions,message_reads,standby,comments,feed&access_token=${pageToken}`,
              { method: "POST" }
            );
          } catch (_) {}

          const [existing] = await pool.query(
            "SELECT id FROM integrations WHERE agency_id = ? AND platform = 'INSTAGRAM' AND ig_account_id = ?",
            [agencyId, ig.id]
          );

          if (existing.length) {
            await pool.query(
              "UPDATE integrations SET name = ?, access_token = ?, user_access_token = ?, ig_username = ?, fb_page_id = ?, is_active = 1 WHERE id = ?",
              [displayName, pageToken, fb.user_access_token || pageToken, ig.username || null, fb.fb_page_id || checkData.id, existing[0].id]
            );
            connectedIgList.push({ id: existing[0].id, username: ig.username, name: displayName });
          } else {
            const [ins] = await pool.query(
              "INSERT INTO integrations (agency_id, platform, name, access_token, user_access_token, verify_token, ig_account_id, ig_username, fb_page_id, is_active) VALUES (?, 'INSTAGRAM', ?, ?, ?, ?, ?, ?, ?, 1)",
              [agencyId, displayName, pageToken, fb.user_access_token || pageToken, `ig_${ig.id}`, ig.id, ig.username || null, fb.fb_page_id || checkData.id]
            );
            connectedIgList.push({ id: ins.insertId, username: ig.username, name: displayName });
          }
        }
      } catch (err) {
        console.warn(`[Sync IG from Page ${fb.name}] warning:`, err.message);
      }
    }

    if (!connectedIgList.length) {
      return res.status(400).json({
        success: false,
        message: "No linked Instagram Business accounts found on your connected Facebook Pages. Please ensure your Instagram account is linked to your Facebook Page in Facebook Page Settings → Linked Accounts.",
      });
    }

    return res.json({
      success: true,
      message: `Successfully synced and connected ${connectedIgList.length} Instagram account(s)!`,
      accounts: connectedIgList,
    });
  } catch (err) {
    console.error("[Sync IG error]", err);
    return res.status(500).json({ success: false, message: "Failed to sync Instagram accounts: " + err.message });
  }
});

router.delete("/channels/instagram/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'INSTAGRAM'",
      [req.params.id, req.agencyId]);
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
      [req.agencyId]
    );
    return res.json({ success: true, bots: rows });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.post("/channels/telegram", async (req, res) => {
  const { botToken } = req.body;
  if (!botToken || !String(botToken).trim()) {
    return res.status(400).json({ success: false, message: "Bot token is required" });
  }

  // Clean token: trim and remove optional "bot" prefix if pasted
  let cleanToken = String(botToken).trim();
  if (cleanToken.toLowerCase().startsWith("bot") && cleanToken.includes(":")) {
    cleanToken = cleanToken.slice(3).trim();
  }

  try {
    await assertModuleAccess(req.agencyId, "channel_telegram");
    await assertLimit(req.agencyId, "max_bot_accounts");

    // Verify token with Telegram API
    let tgData;
    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`, {
        signal: AbortSignal.timeout(10000),
      });
      tgData = await tgRes.json();
    } catch (fetchErr) {
      console.error("[Telegram] getMe network error:", fetchErr);
      return res.status(400).json({
        success: false,
        message: `Could not reach Telegram API: ${fetchErr.message || "Network error"}. Please check your internet connection.`,
      });
    }

    if (!tgData || !tgData.ok) {
      console.error("[Telegram] getMe invalid response:", tgData);
      const desc = tgData?.description || "Invalid Telegram bot token. Please verify token from @BotFather.";
      return res.status(400).json({ success: false, message: desc });
    }

    const { first_name, username } = tgData.result;
    const botName = first_name || username || "Telegram Bot";

    // Check if telegram bot already exists for this agency
    const [existing] = await pool.query(
      "SELECT id, integration_id FROM telegram_bots WHERE agency_id = ? AND bot_username = ?",
      [req.agencyId, username]
    );

    let integrationId;
    let botRecordId;

    if (existing.length > 0) {
      integrationId = existing[0].integration_id;
      botRecordId = existing[0].id;
      await pool.query(
        "UPDATE integrations SET name = ?, access_token = ?, is_active = 1 WHERE id = ?",
        [`${botName} (@${username})`, cleanToken, integrationId]
      );
      await pool.query(
        "UPDATE telegram_bots SET bot_token = ?, bot_name = ?, is_active = 1 WHERE id = ?",
        [cleanToken, botName, botRecordId]
      );
    } else {
      // Create integration record
      const [integ] = await pool.query(
        `INSERT INTO integrations (agency_id, platform, name, access_token, verify_token)
         VALUES (?, 'TELEGRAM', ?, ?, ?)`,
        [req.agencyId, `${botName} (@${username})`, cleanToken, null]
      );
      integrationId = integ.insertId;

      // Save telegram bot record
      const [result] = await pool.query(
        `INSERT INTO telegram_bots (agency_id, integration_id, bot_token, bot_username, bot_name, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [req.agencyId, integrationId, cleanToken, username, botName]
      );
      botRecordId = result.insertId;
    }

    // Set webhook
    const backendBase = process.env.BACKEND_URL || process.env.PUBLIC_URL || `http://localhost:5000`;
    const webhookUrl = `${backendBase}/api/v1/webhook/telegram/${req.agencyId}/${integrationId}`;
    
    let webhookSet = false;
    try {
      const webhookRes = await fetch(`https://api.telegram.org/bot${cleanToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`, {
        signal: AbortSignal.timeout(10000),
      });
      const webhookData = await webhookRes.json();
      webhookSet = Boolean(webhookData.ok);
      if (webhookSet) {
        await pool.query("UPDATE telegram_bots SET webhook_set = 1 WHERE id = ?", [botRecordId]);
      }
    } catch (whErr) {
      console.error("[Telegram] setWebhook error:", whErr);
    }

    return res.status(201).json({
      success: true,
      message: `Telegram bot @${username} connected successfully`,
      botName,
      botUsername: username,
      webhookSet,
    });
  } catch (err) {
    console.error("[Telegram connect error]:", err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

router.delete("/channels/telegram/:id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT bot_token FROM telegram_bots WHERE id = ? AND agency_id = ?",
      [req.params.id, req.agencyId]
    );
    if (rows.length) {
      await fetch(`https://api.telegram.org/bot${rows[0].bot_token}/deleteWebhook`).catch(() => {});
    }
    await pool.query("DELETE FROM telegram_bots WHERE id = ? AND agency_id = ?", [req.params.id, req.agencyId]);
    return res.json({ success: true, message: "Telegram bot removed" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ═══════════════════════════════════════════════════════════════════
//  TIKTOK
// ═══════════════════════════════════════════════════════════════════

router.get("/channels/tiktok", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM integrations WHERE agency_id = ? AND platform = 'TIKTOK' ORDER BY created_at DESC",
      [req.agencyId]
    );
    return res.json({ success: true, accounts: rows });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.post("/channels/tiktok", async (req, res) => {
  const { name, accessToken, verifyToken, tiktokOpenId, tiktokUsername } = req.body;
  if (!name || (!accessToken && !tiktokOpenId)) {
    return res.status(400).json({ success: false, message: "Account name and TikTok Open ID or Access Token are required" });
  }
  try {
    await assertModuleAccess(req.agencyId, "channel_tiktok");
    await assertLimit(req.agencyId, "max_bot_accounts");

    const [existing] = await pool.query(
      "SELECT id FROM integrations WHERE agency_id = ? AND platform = 'TIKTOK' AND (tiktok_open_id = ? OR (tiktok_username = ? AND tiktok_username IS NOT NULL))",
      [req.agencyId, tiktokOpenId || name, tiktokUsername || name]
    );

    if (existing.length > 0) {
      await pool.query(
        `UPDATE integrations
         SET name = ?, access_token = ?, verify_token = ?, tiktok_open_id = ?, tiktok_username = ?, is_active = 1
         WHERE id = ?`,
        [name, accessToken || null, verifyToken || null, tiktokOpenId || null, tiktokUsername || null, existing[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO integrations (agency_id, platform, name, access_token, verify_token, tiktok_open_id, tiktok_username)
         VALUES (?, 'TIKTOK', ?, ?, ?, ?, ?)`,
        [req.agencyId, name, accessToken || null, verifyToken || null, tiktokOpenId || null, tiktokUsername || null]
      );
    }

    return res.status(201).json({ success: true, message: "TikTok account connected successfully" });
  } catch (err) {
    console.error("[TikTok connect error]:", err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

router.delete("/channels/tiktok/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'TIKTOK'",
      [req.params.id, req.agencyId]);
    return res.json({ success: true, message: "TikTok account removed" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ═══════════════════════════════════════════════════════════════════
//  WEBCHAT
// ═══════════════════════════════════════════════════════════════════

router.get("/channels/webchat", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM webchat_widgets WHERE agency_id = ? ORDER BY created_at DESC",
      [req.agencyId]
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
      [req.agencyId, name]
    );

    const widgetKey = `wc_${req.agencyId}_${Date.now()}`;
    await pool.query(
      `INSERT INTO webchat_widgets (agency_id, integration_id, name, widget_key, primary_color, greeting_message, placeholder_text, allowed_domains)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.agencyId, integ.insertId, name, widgetKey,
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
      [name, primaryColor, greetingMessage, placeholderText, allowedDomains, isActive ?? 1, req.params.id, req.agencyId]
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
      [req.agencyId]
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
        req.agencyId,
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
        req.agencyId,
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
      [req.params.id, req.agencyId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Rule not found" });
    const newStatus = rows[0].is_active ? 0 : 1;
    await pool.query(
      "UPDATE fb_comment_rules SET is_active = ? WHERE id = ? AND agency_id = ?",
      [newStatus, req.params.id, req.agencyId]
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
      [req.params.id, req.agencyId]
    );
    return res.json({ success: true, message: "Comment campaign deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
