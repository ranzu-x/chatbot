import express from "express";
import crypto from "crypto";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { assertModuleAccess, assertLimit } from "../utils/entitlements.js";
import { buildDeepLink } from "../utils/deepLinkBuilder.js";
import { resolveMetaAppSettings, resolveWhatsAppOnboardingAppId } from "../utils/appCredentials.js";
import { looksLikeTechProviderSuspension } from "../utils/metaAppHealth.js";
import { deleteIntegrationCascade } from "../utils/integrationCascade.js";
import { countNewAccounts, assertRoomForNewAccounts } from "../utils/botAccountLimit.js";
import { registerTelegramWebhook } from "../utils/webhookAuth.js";

const router = express.Router();
// Scoped to "/channels" — an unscoped router.use(mw) here runs for EVERY
// /api/v1/* request that reaches this router in Express's middleware chain,
// not just this file's own routes, which silently blocked every router
// mounted after this one in index.js (~35 files: Subscribers, Appointments,
// Team Members, Flows, Canned Responses, and more) for any role other than
// AGENCY/ADMIN — including AGENT, even on routes that explicitly allow
// AGENT in their own role checks. See the same fix in routes/integrations.js.
//
// USER (a workspace's team member) is included here — the "Connect Account"
// nav item is available to them — but see stripSecrets() below: several of
// this file's GET endpoints do `SELECT * FROM integrations`/`telegram_bots`,
// which includes live access_token/verify_token/bot_token columns. Those
// are redacted before the response reaches a non-owner (USER) role so a
// team member can see and manage connected accounts without being able to
// read the workspace's raw API credentials off the network tab.
router.use("/channels", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

// Strips live credential fields (access_token, user_access_token,
// verify_token, bot_token) from integrations/telegram_bots rows before they
// reach a USER-role requester. RESELLER/ADMIN (workspace owners) still see
// the full row — they're the ones who configured these credentials in the
// first place. Accepts a single row or an array; always returns a shallow
// copy so callers never accidentally mutate rows still needed elsewhere
// (e.g. for an outbound Graph API call using the very token being stripped).
const SECRET_FIELDS = ["access_token", "user_access_token", "verify_token", "bot_token", "app_secret"];
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

// Bot-account limit on (re)connect: only accounts that would become a NEW row
// count against max_bot_accounts — see utils/botAccountLimit.js.

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

    // Return cached records immediately so the page loads in milliseconds!
    // If an account has never been synced before, backfill metrics asynchronously in background.
    const needsBackfill = rows.filter(
      acc => !acc.wa_last_sync_at && acc.wa_phone_number_id && acc.access_token?.startsWith('EAA') && acc.access_token.length > 20
    );
    if (needsBackfill.length > 0) {
      Promise.allSettled(
        needsBackfill.map(async (acc) => {
          try {
            const url = `https://graph.facebook.com/v21.0/${acc.wa_phone_number_id}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier,status&access_token=${acc.access_token}`;
            const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
            const d = await r.json();
            const updates = [];
            const params = [];
            if (d.display_phone_number && d.display_phone_number !== acc.wa_display_phone) {
              updates.push("wa_display_phone = ?"); params.push(d.display_phone_number);
            }
            if (d.quality_rating) {
              updates.push("wa_quality_rating = ?"); params.push(d.quality_rating.toUpperCase());
            }
            if (d.messaging_limit_tier) {
              updates.push("wa_messaging_limit = ?"); params.push(d.messaging_limit_tier.toUpperCase());
            }
            if (d.status) {
              const mm = d.status === "CONNECTED" ? "ELIGIBLE" : d.status.toUpperCase();
              updates.push("wa_mm_status = ?"); params.push(mm);
            }
            if (updates.length > 0) {
              updates.push("wa_last_sync_at = NOW()");
              params.push(acc.id);
              await pool.query(`UPDATE integrations SET ${updates.join(", ")} WHERE id = ?`, params);
            }
          } catch (_) { /* silently skip */ }
        })
      ).catch(() => {});
    }

    return res.json({ success: true, accounts: stripSecrets(rows, req) });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.post("/channels/whatsapp/:id/sync", async (req, res) => {
  try {
    const agencyId = req.agencyId || await resolveAgencyId(req);
    const [[acc]] = await pool.query(
      "SELECT * FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'WHATSAPP'",
      [req.params.id, agencyId]
    );
    if (!acc) return res.status(404).json({ success: false, message: "WhatsApp account not found" });

    let qualityRating = acc.wa_quality_rating || "GREEN";
    let messagingLimit = acc.wa_messaging_limit || "TIER_250";
    let displayPhone = acc.wa_display_phone;
    let mmStatus = acc.wa_mm_status || "ELIGIBLE";
    let isActive = acc.is_active;

    let accessToken = acc.access_token;
    if (!accessToken || !accessToken.startsWith("EAA")) {
      const appSettings = await resolveMetaAppSettings(agencyId, "WHATSAPP");
      if (appSettings?.system_user_token) {
        accessToken = appSettings.system_user_token.trim();
      }
    }

    if (acc.wa_phone_number_id && accessToken && accessToken.startsWith("EAA")) {
      try {
        const url = `https://graph.facebook.com/v21.0/${acc.wa_phone_number_id}?fields=display_phone_number,verified_name,code_verification_status,quality_rating,messaging_limit_tier,status&access_token=${accessToken}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
        const d = await r.json();
        if (d.quality_rating) qualityRating = d.quality_rating.toUpperCase();
        if (d.messaging_limit_tier) messagingLimit = d.messaging_limit_tier.toUpperCase();
        if (d.display_phone_number) displayPhone = d.display_phone_number;
        if (d.status) {
          mmStatus = d.status === "CONNECTED" ? "ELIGIBLE" : d.status.toUpperCase();
          isActive = d.status === "CONNECTED" ? 1 : isActive;
        }
      } catch (metaErr) {
        console.warn("Meta sync warning:", metaErr.message);
      }
    }

    await pool.query(
      `UPDATE integrations
       SET wa_quality_rating = ?, wa_messaging_limit = ?, wa_display_phone = COALESCE(?, wa_display_phone),
           wa_mm_status = ?, wa_last_sync_at = NOW(), is_active = ?
       WHERE id = ?`,
      [qualityRating, messagingLimit, displayPhone, mmStatus, isActive, acc.id]
    );

    const [[updated]] = await pool.query("SELECT * FROM integrations WHERE id = ?", [acc.id]);
    return res.json({
      success: true,
      message: "WhatsApp metrics synced successfully with Meta",
      account: stripSecrets([updated], req)[0]
    });
  } catch (err) {
    console.error("WhatsApp sync error:", err);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to sync" });
  }
});

// Manual Cloud API connect only asks for the WhatsApp Business Account ID +
// Access Token — everything else (the phone number, its display number, and
// a name for the integration) is resolved from Meta's own Graph API using
// those two, instead of asking the user to hunt down and paste them too.
router.post("/channels/whatsapp", async (req, res) => {
  const { accessToken: inputToken, verifyToken, waBusinessAccId, appSecret } = req.body;
  if (!waBusinessAccId)
    return res.status(400).json({ success: false, message: "WhatsApp Business Account ID is required" });
  try {
    const agencyId = req.agencyId || await resolveAgencyId(req);
    await assertModuleAccess(agencyId, "channel_whatsapp", req.user?.id);

    let accessToken = inputToken?.trim() || null;
    if (!accessToken) {
      const appSettings = await resolveMetaAppSettings(agencyId, "WHATSAPP");
      if (appSettings?.system_user_token) {
        accessToken = appSettings.system_user_token.trim();
      }
    }
    if (!accessToken) {
      return res.status(400).json({ success: false, message: "Access Token is required" });
    }

    // Resolve the real phone number (and its name) from Meta before touching
    // the DB at all — nothing gets written unless this call actually
    // succeeds and returns a real number, so a bad ID/token never produces
    // a half-connected/dummy integration row.
    const phoneRes = await fetch(
      `https://graph.facebook.com/v21.0/${waBusinessAccId}/phone_numbers?fields=id,display_phone_number,verified_name&access_token=${accessToken}`
    );
    const phoneData = await phoneRes.json();
    if (phoneData?.error) {
      return res.status(400).json({ success: false, message: phoneData.error.message || "Could not look up this WhatsApp Business Account. Check the ID and Access Token." });
    }
    const phone = phoneData?.data?.[0];
    if (!phone?.id) {
      return res.status(400).json({ success: false, message: "No phone number found on this WhatsApp Business Account." });
    }

    const name = phone.verified_name || (phone.display_phone_number ? `WhatsApp - ${phone.display_phone_number}` : `WhatsApp Account`);

    // Subscribe this WABA to the Meta App that owns the pasted access token
    // — without this, Meta never sends webhooks to ANY callback URL for
    // this number at all, regardless of what's configured in our dashboard
    // or Meta's App settings (a WABA can be left subscribed to a leftover/
    // unrelated app — e.g. a Meta-provisioned test-number default — from
    // however it was originally set up). The embedded-signup connect flow
    // already does this automatically; the manual "paste your own
    // credentials" path never did, which is the actual root cause behind
    // "connected but the number never receives anything." Best-effort: a
    // token without `whatsapp_business_management` permission can't
    // subscribe, but the connection itself is still otherwise valid.
    try {
      const subRes = await fetch(`https://graph.facebook.com/v21.0/${waBusinessAccId}/subscribed_apps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken }),
      });
      const subData = await subRes.json();
      if (subData?.error) {
        console.warn(`[WhatsApp Manual Connect] Could not subscribe WABA ${waBusinessAccId} to webhooks:`, subData.error.message);
      }
    } catch (subErr) {
      console.warn(`[WhatsApp Manual Connect] Webhook subscription request failed:`, subErr.message);
    }

    // Reconnecting the SAME phone number (e.g. after swapping the webhook/
    // access token) updates its existing integration in place instead of
    // creating a duplicate row — the widgets/flows/conversations already
    // wired to it keep working under the same integration id.
    const [[existing]] = await pool.query(
      "SELECT id FROM integrations WHERE agency_id = ? AND platform = 'WHATSAPP' AND wa_phone_number_id = ? LIMIT 1",
      [agencyId, phone.id]
    );

    // Only needed when this number's Meta app differs from the agency's
    // configured one — see verifyMetaSignature() in routes/webhook.js.
    const cleanAppSecret = appSecret?.trim() || null;
    if (cleanAppSecret && !/^[a-f0-9]{32}$/i.test(cleanAppSecret)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Meta App Secret format. The App Secret must be a 32-character hexadecimal key from Meta Developers → App Settings → Basic → App Secret (not an App ID, WABA ID, or Phone ID)."
      });
    }

    if (existing) {
      await pool.query(
        `UPDATE integrations
           SET name = ?, access_token = ?, verify_token = ?,
               app_secret = CASE WHEN ? IS NOT NULL THEN ? ELSE app_secret END,
               wa_display_phone = ?, wa_business_acc_id = ?, connection_method = 'MANUAL', is_active = 1
         WHERE id = ?`,
        [name, accessToken, verifyToken || null, cleanAppSecret, cleanAppSecret, phone.display_phone_number || null, waBusinessAccId, existing.id]
      );
      return res.json({ success: true, message: "WhatsApp account reconnected" });
    }

    await assertLimit(agencyId, "max_bot_accounts", 1, req.user?.id);
    await pool.query(
      `INSERT INTO integrations
         (agency_id, platform, name, access_token, verify_token, app_secret, wa_phone_number_id, wa_display_phone, wa_business_acc_id, with_catalog, connection_method)
       VALUES (?, 'WHATSAPP', ?, ?, ?, ?, ?, ?, ?, 0, 'MANUAL')`,
      [agencyId, name, accessToken, verifyToken || null, cleanAppSecret, phone.id, phone.display_phone_number || null, waBusinessAccId]
    );
    return res.status(201).json({ success: true, message: "WhatsApp account connected" });
  } catch (err) { console.error(err); return res.status(err.status || 500).json({ success: false, message: err.message || "Server error", code: err.code }); }
});

// ─── UPDATE WHATSAPP CREDENTIALS ─────────────────────────────────────────────
router.patch("/channels/whatsapp/:id/credentials", async (req, res) => {
  const { accessToken, appSecret } = req.body;
  const agencyId = req.agencyId || await resolveAgencyId(req);

  try {
    const [[row]] = await pool.query(
      "SELECT id, wa_phone_number_id, wa_business_acc_id FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'WHATSAPP'",
      [req.params.id, agencyId]
    );
    if (!row) return res.status(404).json({ success: false, message: "WhatsApp account not found" });

    // A replacement token has to belong to this same WhatsApp number, otherwise
    // pasting some other account's token would silently re-point the row.
    if (accessToken?.trim() && row.wa_business_acc_id) {
      await verifyWhatsAppNumber({
        accessToken: accessToken.trim(),
        wabaId: row.wa_business_acc_id,
        phoneNumberId: row.wa_phone_number_id,
      });
    }

    const cleanAppSecret = typeof appSecret === "string" ? appSecret.trim() : undefined;
    if (cleanAppSecret && !/^[a-f0-9]{32}$/i.test(cleanAppSecret)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Meta App Secret format. The App Secret must be a 32-character hexadecimal key from Meta Developers → App Settings → Basic → App Secret."
      });
    }

    const updates = [];
    const params = [];
    if (accessToken?.trim()) {
      updates.push("access_token = ?");
      params.push(accessToken.trim());
    }
    if (cleanAppSecret !== undefined) {
      updates.push("app_secret = ?");
      params.push(cleanAppSecret || null);
    }
    if (updates.length > 0) {
      params.push(req.params.id, agencyId);
      await pool.query(`UPDATE integrations SET ${updates.join(", ")} WHERE id = ? AND agency_id = ?`, params);
    }
    return res.json({ success: true, message: "WhatsApp credentials updated successfully" });
  } catch (err) {
    console.error("WhatsApp credentials update error:", err);
    return res.status(err.status || 500).json({ success: false, message: err.status ? err.message : "Server error" });
  }
});

router.delete("/channels/whatsapp/:id", async (req, res) => {
  const agencyId = req.agencyId || await resolveAgencyId(req);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await deleteIntegrationCascade(conn, req.params.id, agencyId);
    await conn.query("DELETE FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'WHATSAPP'",
      [req.params.id, agencyId]);
    await conn.commit();
    return res.json({ success: true, message: "WhatsApp account removed" });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
});

const isValidMetaToken = (t) => Boolean(t && typeof t === 'string' && t.startsWith('EAA') && t.length > 20);

// A WhatsApp account only counts as connected if Meta itself confirms that this
// token can see this phone number under this WhatsApp Business Account. Every
// route that creates or re-points a WhatsApp integration goes through this, so
// nothing made-up (a placeholder phone id, a dummy token, a number that belongs
// to somebody else's account) can ever be saved as "WhatsApp".
async function verifyWhatsAppNumber({ accessToken, wabaId, phoneNumberId }) {
  const fail = (message) => { const e = new Error(message); e.status = 400; throw e; };
  if (!isValidMetaToken(accessToken)) {
    fail("A valid Meta access token is required to connect a WhatsApp account.");
  }
  if (!wabaId || !phoneNumberId) {
    fail("Could not find a WhatsApp Business Account and phone number to connect. Complete the WhatsApp signup with Meta and try again.");
  }
  let data;
  try {
    const r = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating&access_token=${encodeURIComponent(accessToken)}`
    );
    data = await r.json();
  } catch {
    fail("Could not reach Meta to verify this WhatsApp number. Please try again.");
  }
  if (data?.error) {
    fail(`Meta rejected this WhatsApp account: ${data.error.message || "verification failed"}`);
  }
  const match = (data?.data || []).find((n) => String(n.id) === String(phoneNumberId));
  if (!match) {
    fail("This phone number is not part of that WhatsApp Business Account, so it cannot be connected.");
  }
  return match;
}

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
    // 3) valid system_user_token in meta_app_pool (WhatsApp slot)
    let accessToken = null;
    if (isValidMetaToken(bodyToken?.trim())) {
      accessToken = bodyToken.trim();
    } else if (isValidMetaToken(integration.access_token)) {
      accessToken = integration.access_token.trim();
    } else {
      const appSettings = await resolveMetaAppSettings(agencyId, "WHATSAPP");
      if (isValidMetaToken(appSettings?.system_user_token)) {
        accessToken = appSettings.system_user_token.trim();
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
        "UPDATE meta_app_pool SET system_user_token = ? WHERE agency_id = ? AND platform_group = 'WHATSAPP' AND slot_role = 'ACTIVE' AND is_configured = 1",
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
    await assertModuleAccess(agencyId, "channel_whatsapp", req.user?.id);
    await assertModuleAccess(agencyId, "feature_whatsapp_embedded_signup", req.user?.id);
    // Re-running signup for a number that is already a bot account is a
    // reconnect and never counts against the plan. When the popup told us the
    // number, check now (before any Meta call); the insert below re-checks
    // with the number Meta actually resolved.
    if (phoneNumberId) {
      await assertRoomForNewAccounts(agencyId, req.user?.id, await countNewAccounts(agencyId, "WHATSAPP", "wa_phone_number_id", [phoneNumberId]));
    }

    // 1. Fetch Meta App credentials — this agency's own if configured,
    // otherwise its parent Reseller's, otherwise the Platform's (Super
    // Admin's) app. See utils/appCredentials.js. Uses the onboarding-aware
    // resolver so this OAuth code-exchange happens against the SAME app the
    // frontend initiated the popup with (GET /settings/meta-app/app-id uses
    // the same resolver) — if the active WhatsApp app is Tech-Provider-
    // blocked for new onboarding, both sides transparently redirect to a
    // standby together. Existing WhatsApp integrations never go through
    // this path, so they're unaffected either way.
    const appSettings = await resolveWhatsAppOnboardingAppId(agencyId);

    let accessToken = isValidMetaToken(clientAccessToken) ? clientAccessToken.trim() : null;
    let appId = appSettings?.app_id || process.env.META_APP_ID;
    let appSecret = appSettings?.app_secret || process.env.META_APP_SECRET;
    let verifyToken = appSettings?.verify_token || crypto.randomBytes(16).toString("hex");

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
          // Best-effort: Meta suspending Tech Provider status blocks NEW
          // onboarding specifically while existing numbers keep working —
          // flag this app slot so the next new-connect attempt gets
          // silently redirected to a standby (resolveWhatsAppOnboardingAppId),
          // without touching any existing WhatsApp integration.
          if (appSettings?.id && looksLikeTechProviderSuspension(exData?.error)) {
            pool.query(
              "UPDATE meta_app_pool SET new_onboarding_blocked = 1, new_onboarding_blocked_reason = ?, new_onboarding_blocked_at = NOW() WHERE id = ?",
              [exData.error.message?.slice(0, 500) || "Detected Tech Provider suspension pattern", appSettings.id]
            ).catch((flagErr) => console.error("[WhatsApp Embedded] Failed to flag onboarding-blocked:", flagErr.message));
          }
        }
      } catch (exErr) {
        console.warn("Token exchange failed:", exErr.message);
      }
    }

    if (!accessToken && isValidMetaToken(appSettings?.system_user_token)) {
      accessToken = appSettings.system_user_token.trim();
    }

    // Save valid token to meta_app_pool (WhatsApp slot) for workspace reuse
    if (isValidMetaToken(accessToken)) {
      try {
        await pool.query(
          "UPDATE meta_app_pool SET system_user_token = ? WHERE agency_id = ? AND platform_group = 'WHATSAPP' AND slot_role = 'ACTIVE' AND is_configured = 1",
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

    // 2b. Meta must confirm this is a real number on a real WhatsApp Business
    // Account before we touch the database. Previously a failed lookup fell
    // through to a made-up phone id ("wa_<timestamp>"), a placeholder token and
    // a generic "WhatsApp Business" name, and saved that as a connected account.
    const verifiedNumber = await verifyWhatsAppNumber({
      accessToken,
      wabaId: effectiveWabaId,
      phoneNumberId: effectivePhoneNumberId,
    });
    if (verifiedNumber.display_phone_number) phoneDisplay = verifiedNumber.display_phone_number;
    if (verifiedNumber.verified_name) verifiedName = verifiedNumber.verified_name;

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
    const pId = effectivePhoneNumberId;

    // Same number only. It used to also match on display name, which existed to
    // paper over the invented phone ids above.
    const [existing] = await pool.query(
      "SELECT id, access_token FROM integrations WHERE agency_id = ? AND platform = 'WHATSAPP' AND wa_phone_number_id = ?",
      [agencyId, pId]
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
        [accountName, accessToken,
         verifyToken, pId, phoneDisplay || null, effectiveWabaId || null, catalogFlag, integrationId]
      );
    } else {
      // A new number: this is where it would become a new bot account.
      await assertRoomForNewAccounts(agencyId, req.user?.id, 1);
      const [ins] = await pool.query(
        `INSERT INTO integrations
           (agency_id, platform, name, access_token, verify_token,
            wa_phone_number_id, wa_display_phone, wa_business_acc_id, is_active, with_catalog, connection_method)
         VALUES (?, 'WHATSAPP', ?, ?, ?, ?, ?, ?, 1, ?, 'EMBEDDED')`,
        [agencyId, accountName, accessToken,
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
    return res.status(err.status || 500).json({ success: false, message: err.message || "Server error", code: err.code });
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
    const pages = rows.map(r => ({
      ...r,
      profile_picture_url: r.profile_picture_url || (r.fb_page_id ? `https://graph.facebook.com/v21.0/${r.fb_page_id}/picture?type=large` : null)
    }));
    return res.json({ success: true, pages: stripSecrets(pages, req) });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ─── Pre-import limit check for a multi-account selection ─────────────────
// The Facebook / Instagram import screens save each selected account with its
// own request; they call this first so a selection whose NEW accounts don't
// fit the plan is refused as a whole before anything is saved (already
// connected accounts = reconnect, never counted). 403 LIMIT_EXCEEDED /
// RESELLER_POOL_LIMIT_EXCEEDED when it doesn't fit, else { newCount }.
const IMPORT_CHECK_COLUMN = { FACEBOOK: "fb_page_id", INSTAGRAM: "ig_account_id" };
router.post("/channels/import-check", async (req, res) => {
  const platform = String(req.body?.platform || "").toUpperCase();
  const column = IMPORT_CHECK_COLUMN[platform];
  if (!column) return res.status(400).json({ success: false, message: "platform must be FACEBOOK or INSTAGRAM" });
  const ids = Array.isArray(req.body?.accountIds) ? req.body.accountIds.slice(0, 500) : [];
  try {
    const agencyId = req.agencyId || await resolveAgencyId(req);
    const newCount = await countNewAccounts(agencyId, platform, column, ids);
    await assertRoomForNewAccounts(agencyId, req.user?.id, newCount, { batch: true });
    return res.json({ success: true, newCount, reconnectCount: new Set(ids.filter(Boolean).map(String)).size - newCount });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message || "Server error", code: err.code });
  }
});

router.post("/channels/facebook", async (req, res) => {
  const { name, accessToken, userAccessToken, verifyToken, fbPageId, fbPageName, profilePictureUrl, profile_picture_url } = req.body;
  if (!name || !accessToken || !fbPageId)
    return res.status(400).json({ success: false, message: "Name, access token and page ID are required" });

  const effectivePictureUrl = profilePictureUrl || profile_picture_url || (fbPageId ? `https://graph.facebook.com/v21.0/${fbPageId}/picture?type=large` : null);

  try {
    await assertModuleAccess(req.agencyId, "channel_facebook", req.user?.id);
    // Only a Page that isn't connected yet counts against the plan (reconnect never does).
    await assertRoomForNewAccounts(req.agencyId, req.user?.id, await countNewAccounts(req.agencyId, "FACEBOOK", "fb_page_id", [fbPageId]));

    // Try auto-exchanging for a permanent never-expiring Page Access Token
    let finalAccessToken = accessToken;
    let finalUserToken = userAccessToken || null;
    try {
      const appSettings = await resolveMetaAppSettings(req.agencyId, "MESSENGER_INSTAGRAM");
      if (appSettings?.app_id && appSettings?.app_secret) {
        const { app_id, app_secret } = appSettings;

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
        `https://graph.facebook.com/v21.0/${fbPageId}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads,feed,messaging_customer_information,message_template_status_update&access_token=${finalAccessToken}`,
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
        `UPDATE integrations SET name = ?, access_token = ?, user_access_token = ?, verify_token = ?, fb_page_name = ?, profile_picture_url = COALESCE(?, profile_picture_url), is_active = 1
         WHERE id = ?`,
        [name, finalAccessToken, finalUserToken, verifyToken || null, fbPageName || null, effectivePictureUrl, existing[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO integrations (agency_id, platform, name, access_token, user_access_token, verify_token, fb_page_id, fb_page_name, profile_picture_url, is_active)
         VALUES (?, 'FACEBOOK', ?, ?, ?, ?, ?, ?, ?, 1)`,
        [req.agencyId, name, finalAccessToken, finalUserToken, verifyToken || null, fbPageId, fbPageName || null, effectivePictureUrl]
      );
    }

    return res.status(201).json({
      success: true,
      message: "Facebook page connected",
      webhookSubscribed
    });
  } catch (err) { console.error(err); return res.status(err.status || 500).json({ success: false, message: err.message || "Server error", code: err.code }); }
});

// ─── Quick Connect: Auto-exchange token & auto-import all pages permanently ───
router.post("/channels/facebook/quick-connect", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, message: "Token is required" });

  const agencyId = req.agencyId || await resolveAgencyId(req);

  try {
    await assertModuleAccess(agencyId, "channel_facebook", req.user?.id);
    // The bot-account limit is checked below, once the Pages are known —
    // only Pages not connected yet count (reconnecting never does).

    // Was "WHERE agency_id = ? OR is_configured = 1" — due to SQL operator
    // precedence that matched ANY configured agency's row, not necessarily
    // this caller's own, a real cross-tenant credential leak. Fixed via the
    // shared resolver (own app -> parent Reseller's -> Platform's).
    const appSettings = await resolveMetaAppSettings(agencyId, "MESSENGER_INSTAGRAM");

    let effectiveToken = token.trim();
    if (appSettings?.app_id && appSettings?.app_secret) {
      const { app_id, app_secret } = appSettings;
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

    // Whole batch refused (nothing saved or subscribed) if its NEW Pages don't fit the plan.
    const importable = pageList.filter((p) => p.id && p.access_token);
    await assertRoomForNewAccounts(agencyId, req.user?.id,
      await countNewAccounts(agencyId, "FACEBOOK", "fb_page_id", importable.map((p) => p.id)), { batch: true });

    const savedPages = [];
    for (const page of pageList) {
      if (!page.id || !page.access_token) continue;

      // Subscribe to webhooks
      try {
        await fetch(
          `https://graph.facebook.com/v21.0/${page.id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads,feed,messaging_customer_information,message_template_status_update&access_token=${page.access_token}`,
          { method: "POST" }
        );
      } catch (subErr) {}

      // Save to database
      const [existing] = await pool.query(
        "SELECT id FROM integrations WHERE agency_id = ? AND platform = 'FACEBOOK' AND fb_page_id = ?",
        [agencyId, page.id]
      );

      const pagePic = `https://graph.facebook.com/v21.0/${page.id}/picture?type=large`;
      if (existing.length) {
        await pool.query(
          "UPDATE integrations SET name = ?, access_token = ?, user_access_token = ?, fb_page_name = ?, profile_picture_url = COALESCE(profile_picture_url, ?), is_active = 1 WHERE id = ?",
          [page.name, page.access_token, effectiveToken, page.name, pagePic, existing[0].id]
        );
        savedPages.push({ id: existing[0].id, name: page.name, fbPageId: page.id, profile_picture_url: pagePic });
      } else {
        const [ins] = await pool.query(
          "INSERT INTO integrations (agency_id, platform, name, access_token, user_access_token, verify_token, fb_page_id, fb_page_name, profile_picture_url, is_active) VALUES (?, 'FACEBOOK', ?, ?, ?, ?, ?, ?, ?, 1)",
          [agencyId, page.name, page.access_token, effectiveToken, `fb_${page.id}`, page.id, page.name, pagePic]
        );
        savedPages.push({ id: ins.insertId, name: page.name, fbPageId: page.id, profile_picture_url: pagePic });
      }
    }

    return res.json({
      success: true,
      message: `Successfully connected ${savedPages.length} Facebook page(s) with permanent never-expiring access!`,
      pages: savedPages
    });
  } catch (err) {
    console.error("[Quick Connect Error]", err);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Server error connecting pages", code: err.code });
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
          `https://graph.facebook.com/v21.0/${page.fb_page_id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads,feed,messaging_customer_information,message_template_status_update&access_token=${page.access_token}`,
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

// ─── Utility Messaging: List Page Utility Templates ───────────────
router.get("/channels/facebook/:integrationId/utility-templates", async (req, res) => {
  const { integrationId } = req.params;
  const agencyId = req.agencyId;

  try {
    // 1. Resolve the page access token for this integration
    const [rows] = await pool.query(
      "SELECT * FROM integrations WHERE id = ? AND platform = 'FACEBOOK' AND agency_id = ? LIMIT 1",
      [integrationId, agencyId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Facebook page integration not found" });
    }

    const page = rows[0];
    const pageToken = page.access_token;
    const pageId = page.fb_page_id;

    if (!pageToken || !pageId) {
      return res.status(400).json({ success: false, message: "Page has no access token or page ID stored" });
    }

    // 2. Fetch utility message templates from Graph API
    // Message templates require the Page Access Token and the pages_utility_messaging permission
    const graphUrl = `https://graph.facebook.com/v21.0/${pageId}/message_templates?category=UTILITY&fields=name,status,language,components&access_token=${pageToken}`;
    const graphRes = await fetch(graphUrl);
    const graphData = await graphRes.json();

    if (graphData.error) {
      console.warn("[FB Utility Templates] Graph API error:", graphData.error);
      // Return graceful empty list with the error message for the UI to display
      return res.json({
        success: true,
        templates: [],
        graphError: graphData.error.message || "Could not fetch templates from Meta",
        note: "Ensure the connected page has pages_utility_messaging permission approved in your Meta App.",
      });
    }

    return res.json({
      success: true,
      templates: graphData.data || [],
      paging: graphData.paging || null,
      pageId,
      pageName: page.name,
    });
  } catch (err) {
    console.error("[FB Utility Templates Error]", err);
    return res.status(500).json({ success: false, message: "Server error fetching utility templates" });
  }
});

// ─── Utility Messaging: Send a Utility Message to a PSID ──────────
router.post("/channels/facebook/:integrationId/send-utility", async (req, res) => {
  const { integrationId } = req.params;
  const { recipientId, templateName, languageCode = "en_US", components = [] } = req.body;
  const agencyId = req.agencyId;

  if (!recipientId || !templateName) {
    return res.status(400).json({
      success: false,
      message: "recipientId (Facebook PSID) and templateName are required",
    });
  }

  try {
    // 1. Resolve integration
    const [rows] = await pool.query(
      "SELECT * FROM integrations WHERE id = ? AND platform = 'FACEBOOK' AND agency_id = ? LIMIT 1",
      [integrationId, agencyId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Facebook page integration not found" });
    }

    const page = rows[0];
    const pageToken = page.access_token;
    const pageId = page.fb_page_id;

    if (!pageToken || !pageId) {
      return res.status(400).json({ success: false, message: "Page has no access token or page ID stored" });
    }

    // 2. Send the utility template message via Messenger Send API
    // Utility messages use message_type: "UTILITY" with template payload
    const sendPayload = {
      recipient: { id: recipientId },
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "one_time_notif_req",  // or generic template depending on setup
            // For utility messaging the correct approach is using the text message with messaging_type UTILITY
          },
        },
      },
      messaging_type: "UTILITY",
    };

    // Utility messages are sent as structured template_type "generic" or as plain text UTILITY type
    // Most utility messages are plain structured text outside the 24h window
    const utilityPayload = {
      recipient: { id: recipientId },
      messaging_type: "UTILITY",
      message: {
        text: components.length > 0
          ? components.map(c => c.text || '').join('\n')
          : `Utility notification from ${page.name || page.fb_page_name}`,
      },
    };

    // If template components were provided, use template attachment format
    const finalPayload = templateName && components.length > 0 ? {
      recipient: { id: recipientId },
      messaging_type: "UTILITY",
      message: {
        attachment: {
          type: "template",
          payload: {
            template_type: "generic",
            elements: [
              {
                title: components.find(c => c.type === "HEADER")?.text || templateName,
                subtitle: components.find(c => c.type === "BODY")?.text || "",
                buttons: (components.find(c => c.type === "BUTTONS")?.buttons || []).map(b => ({
                  type: "web_url",
                  url: b.url || "#",
                  title: b.text || "View",
                })),
              },
            ],
          },
        },
      },
    } : utilityPayload;

    const sendRes = await fetch(
      `https://graph.facebook.com/v21.0/me/messages?access_token=${pageToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalPayload),
      }
    );
    const sendData = await sendRes.json();

    if (sendData.error) {
      console.error("[FB Send Utility] Graph error:", sendData.error);
      return res.status(400).json({
        success: false,
        message: sendData.error.message || "Failed to send utility message",
        code: sendData.error.code,
        fbError: sendData.error,
      });
    }

    return res.json({
      success: true,
      message: "Utility message sent successfully",
      messageId: sendData.message_id,
      recipientId: sendData.recipient_id,
    });
  } catch (err) {
    console.error("[FB Send Utility Error]", err);
    return res.status(500).json({ success: false, message: "Server error sending utility message" });
  }
});

// ─── Import pages from Facebook Graph API ─────────────────────────
router.post("/channels/facebook/import-pages", async (req, res) => {
  const { userAccessToken } = req.body;
  if (!userAccessToken)
    return res.status(400).json({ success: false, message: "User access token required" });
  try {
    const pageMap = new Map();

    const agencyId = req.agencyId || await resolveAgencyId(req);
    let appSecret = null;
    let appId = null;
    try {
      // Was "WHERE agency_id = ? OR is_configured = 1" — same cross-tenant
      // leak as Quick Connect above, fixed via the shared resolver.
      const appSettings = await resolveMetaAppSettings(agencyId, "MESSENGER_INSTAGRAM");
      if (appSettings) {
        appId = appSettings.app_id;
        appSecret = appSettings.app_secret;
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
    let accError = null;
    try {
      const response = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,category,picture{url}&access_token=${effectiveUserToken}`,
        { signal: AbortSignal.timeout(7000) }
      );
      const data = await response.json();
      console.log('[FB import-pages] /me/accounts response count:', data.data?.length);
      if (data.error) {
        accError = data.error.message;
        console.warn('[FB import-pages] /me/accounts warning with effectiveUserToken:', data.error);
        // Fallback: try direct userAccessToken if token exchange altered it
        if (effectiveUserToken !== userAccessToken) {
          try {
            const rawRes = await fetch(
              `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,category,picture{url}&access_token=${userAccessToken}`,
              { signal: AbortSignal.timeout(7000) }
            );
            const rawData = await rawRes.json();
            if (Array.isArray(rawData.data)) {
              for (const p of rawData.data) {
                if (p.id) {
                  p.profile_picture_url = p.picture?.data?.url || `https://graph.facebook.com/v21.0/${p.id}/picture?type=large`;
                  pageMap.set(p.id, p);
                }
              }
            }
          } catch (_) {}
        }
      } else if (Array.isArray(data.data)) {
        for (const p of data.data) {
          if (p.id) {
            p.profile_picture_url = p.picture?.data?.url || `https://graph.facebook.com/v21.0/${p.id}/picture?type=large`;
            pageMap.set(p.id, p);
          }
        }
      }
    } catch (err) {
      console.error('[FB import-pages] error fetching /me/accounts:', err.message || err);
    }

    let grantedScopes = [];
    const debugTokenAccess = (appId && appSecret) ? `${appId}|${appSecret}` : userAccessToken;
    try {
      const debugRes = await fetch(
        `https://graph.facebook.com/debug_token?input_token=${userAccessToken}&access_token=${debugTokenAccess}`,
        { signal: AbortSignal.timeout(7000) }
      );
      const debugData = await debugRes.json();
      console.log('[FB import-pages] debug_token response:', JSON.stringify(debugData, null, 2));

      grantedScopes = debugData.data?.scopes || [];
      const granularScopes = debugData.data?.granular_scopes || [];
      const targetIds = new Set();
      for (const scopeObj of granularScopes) {
        // Exclude WhatsApp-specific scopes which hold WABA IDs
        if (!scopeObj.scope?.startsWith("whatsapp_") && Array.isArray(scopeObj.target_ids)) {
          scopeObj.target_ids.forEach(id => targetIds.add(id));
        }
      }

      // Query any specific target_id chosen in the FB popup that wasn't in /me/accounts
      for (const targetId of targetIds) {
        if (!pageMap.has(targetId)) {
          try {
            const pRes = await fetch(
              `https://graph.facebook.com/v21.0/${targetId}?fields=id,name,access_token,category,tasks,picture{url}&access_token=${userAccessToken}`,
              { signal: AbortSignal.timeout(5000) }
            );
            const pData = await pRes.json();
            console.log(`[FB import-pages] fetched target_id ${targetId}:`, pData);
            // Must have category or access_token confirming it is a genuine Facebook Page
            if (pData.id && !pData.error && (pData.category || pData.access_token)) {
              pData.profile_picture_url = pData.picture?.data?.url || `https://graph.facebook.com/v21.0/${pData.id}/picture?type=large`;
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
        `https://graph.facebook.com/v21.0/me/businesses?fields=id,name,owned_pages{id,name,access_token,category,picture{url}},client_pages{id,name,access_token,category,picture{url}}&access_token=${userAccessToken}`,
        { signal: AbortSignal.timeout(7000) }
      );
      const bizData = await bizRes.json();
      console.log('[FB import-pages] /me/businesses response:', JSON.stringify(bizData, null, 2));
      if (Array.isArray(bizData.data)) {
        for (const biz of bizData.data) {
          const owned = biz.owned_pages?.data || [];
          const client = biz.client_pages?.data || [];
          [...owned, ...client].forEach(p => {
            if (p.id && !pageMap.has(p.id)) {
              p.profile_picture_url = p.picture?.data?.url || `https://graph.facebook.com/v21.0/${p.id}/picture?type=large`;
              pageMap.set(p.id, p);
            }
          });
        }
      }
    } catch (be) {
      console.error('[FB import-pages] /me/businesses error:', be.message || be);
    }

    // Filter to genuine Facebook Pages only (exclude WhatsApp Business Accounts / WABAs)
    const pages = Array.from(pageMap.values())
      .filter(p => {
        if (!p || !p.id || !p.name) return false;
        const lower = (p.name || "").toLowerCase();
        if (lower.includes("whatsapp business") || lower.includes("test whatsapp") || lower.includes("waba")) {
          return false;
        }
        return true;
      })
      .map(p => ({
        ...p,
        profile_picture_url: p.profile_picture_url || (p.id ? `https://graph.facebook.com/v21.0/${p.id}/picture?type=large` : null),
      }));

    let warning = null;
    if (pages.length === 0) {
      if (grantedScopes.length > 0 && !grantedScopes.includes("pages_show_list")) {
        warning = "The 'pages_show_list' permission was not granted in the Facebook dialog. Please click 'Continue with Facebook' and grant access to your Pages.";
      } else {
        warning = "No Facebook Pages found. Make sure this Facebook account manages a Page (on facebook.com/pages) and that you selected it in the login popup.";
      }
    }

    console.log(`[FB import-pages] Final resolved pages count: ${pages.length}`);

    return res.json({
      success: true,
      pages,
      warning,
      debug: { total: pages.length, grantedScopes, accError }
    });
  } catch (err) {
    console.error('[FB import-pages] fatal error:', err);
    return res.status(500).json({ success: false, message: "Failed to fetch pages" });
  }
});

router.delete("/channels/facebook/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await deleteIntegrationCascade(conn, req.params.id, req.agencyId);
    await conn.query("DELETE FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'FACEBOOK'",
      [req.params.id, req.agencyId]);
    await conn.commit();
    return res.json({ success: true, message: "Facebook page removed" });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
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

    // Auto-backfill profile_picture_url if missing for any account
    const accounts = await Promise.all(rows.map(async (acc) => {
      if (acc.profile_picture_url) return acc;
      if (acc.ig_account_id && acc.access_token) {
        try {
          const picRes = await fetch(
            `https://graph.facebook.com/v21.0/${acc.ig_account_id}?fields=profile_picture_url&access_token=${acc.access_token}`,
            { signal: AbortSignal.timeout(3000) }
          );
          const picData = await picRes.json();
          if (picData?.profile_picture_url) {
            acc.profile_picture_url = picData.profile_picture_url;
            pool.query("UPDATE integrations SET profile_picture_url = ? WHERE id = ?", [picData.profile_picture_url, acc.id]).catch(() => {});
          }
        } catch (_) {}
      }
      return acc;
    }));

    return res.json({ success: true, accounts: stripSecrets(accounts, req) });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.post("/channels/instagram", async (req, res) => {
  const { name, accessToken, verifyToken, igAccountId, igUsername, pageId, pageAccessToken, profilePictureUrl, profile_picture_url } = req.body;
  if (!name || !accessToken || !igAccountId)
    return res.status(400).json({ success: false, message: "Name, access token and account ID are required" });

  let effectivePictureUrl = profilePictureUrl || profile_picture_url || null;
  if (!effectivePictureUrl && igAccountId && (pageAccessToken || accessToken)) {
    try {
      const picRes = await fetch(
        `https://graph.facebook.com/v21.0/${igAccountId}?fields=profile_picture_url&access_token=${pageAccessToken || accessToken}`,
        { signal: AbortSignal.timeout(3500) }
      );
      const picData = await picRes.json();
      if (picData?.profile_picture_url) effectivePictureUrl = picData.profile_picture_url;
    } catch (_) {}
  }

  try {
    await assertModuleAccess(req.agencyId, "channel_instagram", req.user?.id);
    // Only an account that isn't connected yet counts against the plan (reconnect never does).
    await assertRoomForNewAccounts(req.agencyId, req.user?.id, await countNewAccounts(req.agencyId, "INSTAGRAM", "ig_account_id", [igAccountId]));

    // Check if account already exists for this agency
    const [existing] = await pool.query(
      "SELECT id FROM integrations WHERE agency_id = ? AND platform = 'INSTAGRAM' AND ig_account_id = ?",
      [req.agencyId, igAccountId]
    );

    if (existing.length > 0) {
      await pool.query(
        `UPDATE integrations 
         SET name = ?, access_token = ?, verify_token = ?, ig_username = ?, fb_page_id = COALESCE(?, fb_page_id), profile_picture_url = COALESCE(?, profile_picture_url), is_active = 1
         WHERE id = ?`,
        [name, accessToken, verifyToken || null, igUsername || null, pageId || null, effectivePictureUrl, existing[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO integrations (agency_id, platform, name, access_token, verify_token, ig_account_id, ig_username, fb_page_id, profile_picture_url, is_active)
         VALUES (?, 'INSTAGRAM', ?, ?, ?, ?, ?, ?, ?, 1)`,
        [req.agencyId, name, accessToken, verifyToken || null, igAccountId, igUsername || null, pageId || null, effectivePictureUrl]
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
    return res.status(err.status || 500).json({ success: false, message: err.message || "Server error", code: err.code });
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
    await assertModuleAccess(agencyId, "channel_instagram", req.user?.id);
    // The bot-account limit is checked below, once the accounts are known —
    // only accounts not connected yet count (reconnecting never does).
    const rawToken = userAccessToken.trim();

    // 1. Fetch Meta App Credentials to auto-upgrade to long-lived token
    let appId = null, appSecret = null;
    try {
      const appSettings = await resolveMetaAppSettings(agencyId, "MESSENGER_INSTAGRAM");
      if (appSettings?.app_id && appSettings?.app_secret) {
        appId = appSettings.app_id;
        appSecret = appSettings.app_secret;
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

    // Whole batch refused (nothing saved or subscribed) if its NEW accounts don't fit the plan.
    await assertRoomForNewAccounts(agencyId, req.user?.id,
      await countNewAccounts(agencyId, "INSTAGRAM", "ig_account_id", discoveredIgAccounts.map((a) => a.id)), { batch: true });

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
          "UPDATE integrations SET name = ?, access_token = ?, user_access_token = ?, ig_username = ?, fb_page_id = ?, profile_picture_url = COALESCE(?, profile_picture_url), is_active = 1 WHERE id = ?",
          [displayName, tokenToSave, effectiveToken, acc.username || null, acc.pageId || null, acc.profile_picture_url || null, existing[0].id]
        );
        savedAccounts.push({ id: existing[0].id, name: displayName, username: acc.username, igAccountId: acc.id, profile_picture_url: acc.profile_picture_url || null });
      } else {
        const [ins] = await pool.query(
          "INSERT INTO integrations (agency_id, platform, name, access_token, user_access_token, verify_token, ig_account_id, ig_username, fb_page_id, profile_picture_url, is_active) VALUES (?, 'INSTAGRAM', ?, ?, ?, ?, ?, ?, ?, ?, 1)",
          [agencyId, displayName, tokenToSave, effectiveToken, `ig_${acc.id}`, acc.id, acc.username || null, acc.pageId || null, acc.profile_picture_url || null]
        );
        savedAccounts.push({ id: ins.insertId, name: displayName, username: acc.username, igAccountId: acc.id, profile_picture_url: acc.profile_picture_url || null });
      }
    }

    return res.json({
      success: true,
      message: `Successfully connected ${savedAccounts.length} Instagram Professional account(s)!`,
      accounts: savedAccounts,
    });
  } catch (err) {
    console.error("[IG Quick Connect Error]", err);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Server error connecting Instagram", code: err.code });
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

    // 1. Find the Instagram account linked to each connected Page (nothing saved yet).
    const found = [];
    for (const fb of fbIntegrations) {
      const pageToken = fb.access_token;
      if (!pageToken) continue;
      try {
        const checkRes = await fetch(
          `https://graph.facebook.com/v21.0/me?fields=id,name,instagram_business_account{id,name,username,profile_picture_url,followers_count},connected_instagram_account{id,name,username,profile_picture_url,followers_count}&access_token=${pageToken}`
        );
        const checkData = await checkRes.json();
        const ig = checkData.instagram_business_account || checkData.connected_instagram_account;
        if (ig && ig.id) found.push({ fb, pageToken, checkData, ig });
      } catch (err) {
        console.warn(`[Sync IG from Page ${fb.name}] warning:`, err.message);
      }
    }

    // 2. Whole sync refused (nothing saved or subscribed) if its NEW accounts
    // don't fit the plan — already-connected ones never count.
    await assertRoomForNewAccounts(agencyId, req.user?.id,
      await countNewAccounts(agencyId, "INSTAGRAM", "ig_account_id", found.map((f) => f.ig.id)), { batch: true });

    // 3. Subscribe and save each one (reconnect = update the same row).
    for (const { fb, pageToken, checkData, ig } of found) {
      try {
        {
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
              "UPDATE integrations SET name = ?, access_token = ?, user_access_token = ?, ig_username = ?, fb_page_id = ?, profile_picture_url = COALESCE(?, profile_picture_url), is_active = 1 WHERE id = ?",
              [displayName, pageToken, fb.user_access_token || pageToken, ig.username || null, fb.fb_page_id || checkData.id, ig.profile_picture_url || null, existing[0].id]
            );
            connectedIgList.push({ id: existing[0].id, username: ig.username, name: displayName, profile_picture_url: ig.profile_picture_url || null });
          } else {
            const [ins] = await pool.query(
              "INSERT INTO integrations (agency_id, platform, name, access_token, user_access_token, verify_token, ig_account_id, ig_username, fb_page_id, profile_picture_url, is_active) VALUES (?, 'INSTAGRAM', ?, ?, ?, ?, ?, ?, ?, ?, 1)",
              [agencyId, displayName, pageToken, fb.user_access_token || pageToken, `ig_${ig.id}`, ig.id, ig.username || null, fb.fb_page_id || checkData.id, ig.profile_picture_url || null]
            );
            connectedIgList.push({ id: ins.insertId, username: ig.username, name: displayName, profile_picture_url: ig.profile_picture_url || null });
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
    if (["LIMIT_EXCEEDED", "RESELLER_POOL_LIMIT_EXCEEDED", "MODULE_DISABLED"].includes(err.code)) {
      return res.status(err.status || 403).json({ success: false, message: err.message, code: err.code });
    }
    return res.status(500).json({ success: false, message: "Failed to sync Instagram accounts: " + err.message });
  }
});

router.delete("/channels/instagram/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await deleteIntegrationCascade(conn, req.params.id, req.agencyId);
    await conn.query("DELETE FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'INSTAGRAM'",
      [req.params.id, req.agencyId]);
    await conn.commit();
    return res.json({ success: true, message: "Instagram account removed" });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
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
    return res.json({ success: true, bots: stripSecrets(rows, req) });
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
    await assertModuleAccess(req.agencyId, "channel_telegram", req.user?.id);

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

    // 1. Prevent duplicate connections across DIFFERENT agencies (Telegram webhooks can only point to 1 URL)
    const [crossAgency] = await pool.query(
      "SELECT id, agency_id FROM telegram_bots WHERE (bot_token = ? OR LOWER(bot_username) = LOWER(?)) AND agency_id != ?",
      [cleanToken, username, req.agencyId]
    );
    if (crossAgency.length > 0) {
      return res.status(400).json({
        success: false,
        message: `This Telegram bot (@${username}) is already connected to another workspace. Telegram bots can only be connected to one workspace at a time.`,
      });
    }

    // 2. Check if telegram bot already exists for THIS agency
    const [existing] = await pool.query(
      "SELECT id, integration_id FROM telegram_bots WHERE agency_id = ? AND (bot_token = ? OR LOWER(bot_username) = LOWER(?))",
      [req.agencyId, cleanToken, username]
    );

    let integrationId;
    let botRecordId;

    if (existing.length > 0) {
      // Re-connecting / updating existing bot in same agency - do not charge/check package limit
      integrationId = existing[0].integration_id;
      botRecordId = existing[0].id;

      if (integrationId) {
        const [integCheck] = await pool.query(
          "SELECT id FROM integrations WHERE id = ? AND agency_id = ?",
          [integrationId, req.agencyId]
        );
        if (integCheck.length > 0) {
          await pool.query(
            "UPDATE integrations SET name = ?, access_token = ?, is_active = 1 WHERE id = ?",
            [`${botName} (@${username})`, cleanToken, integrationId]
          );
        } else {
          const [integ] = await pool.query(
            `INSERT INTO integrations (agency_id, platform, name, access_token, verify_token)
             VALUES (?, 'TELEGRAM', ?, ?, ?)`,
            [req.agencyId, `${botName} (@${username})`, cleanToken, null]
          );
          integrationId = integ.insertId;
        }
      } else {
        const [integ] = await pool.query(
          `INSERT INTO integrations (agency_id, platform, name, access_token, verify_token)
           VALUES (?, 'TELEGRAM', ?, ?, ?)`,
          [req.agencyId, `${botName} (@${username})`, cleanToken, null]
        );
        integrationId = integ.insertId;
      }

      await pool.query(
        "UPDATE telegram_bots SET integration_id = ?, bot_token = ?, bot_username = ?, bot_name = ?, is_active = 1 WHERE id = ?",
        [integrationId, cleanToken, username, botName, botRecordId]
      );
    } else {
      // New bot connection: verify agency package account limits
      await assertLimit(req.agencyId, "max_bot_accounts", 1, req.user?.id);

      // Check if there is an orphaned integration row for this token in this agency to reuse
      const [orphans] = await pool.query(
        "SELECT id FROM integrations WHERE agency_id = ? AND platform = 'TELEGRAM' AND access_token = ?",
        [req.agencyId, cleanToken]
      );

      if (orphans.length > 0) {
        integrationId = orphans[0].id;
        await pool.query(
          "UPDATE integrations SET name = ?, is_active = 1 WHERE id = ?",
          [`${botName} (@${username})`, integrationId]
        );
      } else {
        const [integ] = await pool.query(
          `INSERT INTO integrations (agency_id, platform, name, access_token, verify_token)
           VALUES (?, 'TELEGRAM', ?, ?, ?)`,
          [req.agencyId, `${botName} (@${username})`, cleanToken, null]
        );
        integrationId = integ.insertId;
      }

      // Save telegram bot record with ON DUPLICATE safety
      const [result] = await pool.query(
        `INSERT INTO telegram_bots (agency_id, integration_id, bot_token, bot_username, bot_name, is_active)
         VALUES (?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           integration_id = VALUES(integration_id),
           bot_token = VALUES(bot_token),
           bot_username = VALUES(bot_username),
           bot_name = VALUES(bot_name),
           is_active = 1`,
        [req.agencyId, integrationId, cleanToken, username, botName]
      );
      botRecordId = result.insertId || (existing[0] && existing[0].id);
    }

    // Set webhook — with a per-bot secret Telegram echoes back on every
    // update, so the webhook route can reject forged calls (utils/webhookAuth.js).
    let webhookSet = false;
    try {
      webhookSet = await registerTelegramWebhook({ agencyId: req.agencyId, integrationId, botToken: cleanToken });
      if (webhookSet && botRecordId) {
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
    return res.status(err.status || 500).json({ success: false, message: err.message || "Server error", code: err.code });
  }
});

router.delete("/channels/telegram/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      "SELECT bot_token, integration_id FROM telegram_bots WHERE id = ? AND agency_id = ?",
      [req.params.id, req.agencyId]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Telegram bot not found" });
    }
    const { bot_token, integration_id } = rows[0];

    // Remove Telegram webhook
    if (bot_token) {
      await fetch(`https://api.telegram.org/bot${bot_token}/deleteWebhook`).catch(() => {});
    }

    await conn.beginTransaction();

    // Delete from telegram_bots
    await conn.query("DELETE FROM telegram_bots WHERE id = ? AND agency_id = ?", [req.params.id, req.agencyId]);

    // Synchronously delete corresponding integration record if present
    if (integration_id) {
      await deleteIntegrationCascade(conn, integration_id, req.agencyId);
      await conn.query("DELETE FROM integrations WHERE id = ? AND agency_id = ?", [integration_id, req.agencyId]);
    }

    await conn.commit();
    return res.json({ success: true, message: "Telegram bot removed" });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
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
    return res.json({ success: true, accounts: stripSecrets(rows, req) });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.post("/channels/tiktok", async (req, res) => {
  const { name, accessToken, verifyToken, tiktokOpenId, tiktokUsername } = req.body;
  if (!name || (!accessToken && !tiktokOpenId)) {
    return res.status(400).json({ success: false, message: "Account name and TikTok Open ID or Access Token are required" });
  }
  try {
    await assertModuleAccess(req.agencyId, "channel_tiktok", req.user?.id);
    await assertLimit(req.agencyId, "max_bot_accounts", 1, req.user?.id);

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
    return res.status(err.status || 500).json({ success: false, message: err.message || "Server error", code: err.code });
  }
});

router.delete("/channels/tiktok/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await deleteIntegrationCascade(conn, req.params.id, req.agencyId);
    await conn.query("DELETE FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'TIKTOK'",
      [req.params.id, req.agencyId]);
    await conn.commit();
    return res.json({ success: true, message: "TikTok account removed" });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
});

// ═══════════════════════════════════════════════════════════════════
//  WEBCHAT
// ═══════════════════════════════════════════════════════════════════

router.get("/channels/webchat", async (req, res) => {
  try {
    // Optional ?platform= filter (Bot Manager's Chat Widget tab passes the
    // currently selected account's platform so the list only shows widgets
    // for that channel — omitted entirely = every widget, unchanged default).
    // WEBCHAT widgets have target_platform = NULL in the schema (they don't
    // point at an external account), so "WEBCHAT" filters by widget_type
    // instead; every other platform filters by target_platform.
    const platformFilter = (req.query.platform || "").toUpperCase();
    let platformClause = "";
    const params = [req.agencyId];
    if (platformFilter === "WEBCHAT") {
      platformClause = " AND w.widget_type = 'WEBCHAT'";
    } else if (["WHATSAPP", "FACEBOOK", "TELEGRAM", "INSTAGRAM"].includes(platformFilter)) {
      platformClause = " AND w.target_platform = ?";
      params.push(platformFilter);
    }

    // For DEEPLINK widgets, `integration_id` points at an EXISTING WhatsApp/
    // Facebook/Telegram/Instagram account (not one this widget owns) — join
    // its identifying fields + computed deep link so the list can show what
    // the widget actually opens without a second round-trip per row.
    const [rows] = await pool.query(
      `SELECT w.*, i.platform AS target_integration_platform, i.name AS target_integration_name,
              i.wa_display_phone, i.fb_page_id, i.ig_username, tb.bot_username AS tg_bot_username
       FROM webchat_widgets w
       LEFT JOIN integrations i ON i.id = w.integration_id
       LEFT JOIN telegram_bots tb ON tb.integration_id = i.id
       WHERE w.agency_id = ?${platformClause}
       ORDER BY w.created_at DESC`,
      params
    );
    const widgets = rows.map((w) => ({
      ...w,
      deepLink: w.widget_type === "DEEPLINK" ? buildDeepLink(
        { platform: w.target_integration_platform, wa_display_phone: w.wa_display_phone, fb_page_id: w.fb_page_id, ig_username: w.ig_username, tg_bot_username: w.tg_bot_username },
        { prefillMessage: w.prefill_message }
      ) : null,
    }));
    return res.json({ success: true, widgets });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// Looks up the widget linked to a given reply Flow — used by the Flow
// Builder's "Widget Appearance" panel to know whether the flow currently
// being edited is a Chat Widget's reply flow (and if so, load its
// appearance fields alongside the flow's own nodes/edges).
router.get("/channels/webchat/by-flow/:flowId", async (req, res) => {
  try {
    const agencyId = req.agencyId || req.user?.agencyId;
    let [rows] = await pool.query(
      "SELECT * FROM webchat_widgets WHERE flow_id = ? AND agency_id = ? LIMIT 1",
      [req.params.flowId, agencyId]
    );
    if (!rows.length) {
      // Fallback: check if this flow belongs to a webchat integration that has an active widget
      const [[flow]] = await pool.query("SELECT * FROM flows WHERE id = ? AND agency_id = ?", [req.params.flowId, agencyId]);
      if (flow && flow.platform === "WEBCHAT" && flow.integration_id) {
        const [wRows] = await pool.query(
          "SELECT * FROM webchat_widgets WHERE integration_id = ? AND agency_id = ? LIMIT 1",
          [flow.integration_id, agencyId]
        );
        if (wRows.length) {
          await pool.query("UPDATE webchat_widgets SET flow_id = ? WHERE id = ? AND agency_id = ?", [flow.id, wRows[0].id, agencyId]);
          wRows[0].flow_id = flow.id;
          rows = wRows;
        }
      }
    }
    if (!rows.length) return res.status(404).json({ success: false, message: "No widget linked to this flow" });
    return res.json({ success: true, widget: rows[0] });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.post("/channels/webchat", async (req, res) => {
  const {
    name, primaryColor, greetingMessage, placeholderText, allowedDomains,
    flowId, logoUrl, displayName, headerBgColor, headerTextColor, prefillMessage,
    position, openOnStartup, offsetX, offsetY, buttonText, buttonBgColor, buttonTextColor, buttonSize,
    widgetType, integrationId, // DEEPLINK-only: which EXISTING account to link to
  } = req.body;
  if (!name) return res.status(400).json({ success: false, message: "Widget name is required" });

  const isDeepLink = (widgetType || "WEBCHAT").toUpperCase() === "DEEPLINK";

  try {
    let targetIntegrationId;
    let targetPlatform = null;

    if (isDeepLink) {
      // Deep-link widgets don't own a channel — they point at one the
      // agency already connected (WhatsApp/Facebook/Telegram/Instagram).
      if (!integrationId) {
        return res.status(400).json({ success: false, message: "Select which connected account this widget links to" });
      }
      const [[integ]] = await pool.query(
        "SELECT id, platform FROM integrations WHERE id = ? AND agency_id = ?",
        [integrationId, req.agencyId]
      );
      if (!integ) return res.status(404).json({ success: false, message: "Connected account not found" });
      if (!["WHATSAPP", "FACEBOOK", "TELEGRAM", "INSTAGRAM"].includes((integ.platform || "").toUpperCase())) {
        return res.status(400).json({ success: false, message: "This channel doesn't support a deep-link chat widget" });
      }
      targetIntegrationId = integ.id;
      targetPlatform = integ.platform.toUpperCase();
    } else {
      await assertModuleAccess(req.agencyId, "channel_webchat", req.user?.id);
      await assertLimit(req.agencyId, "max_bot_accounts", 1, req.user?.id);
      // WEBCHAT — unchanged: each widget gets its own dedicated integration.
      const [integ] = await pool.query(
        "INSERT INTO integrations (agency_id, platform, name, is_active) VALUES (?, 'WEBCHAT', ?, 1)",
        [req.agencyId, name]
      );
      targetIntegrationId = integ.insertId;
    }

    // Cryptographically random — not `wc_<agencyId>_<timestamp>` as before,
    // which embedded the tenant id directly and only varied by millisecond,
    // making it guessable/enumerable. This key is the sole authorization
    // handle a public embed script carries (see routes/webchat.js), so its
    // unpredictability matters even though it isn't a secret in the classic
    // sense — domain restriction (allowed_domains) is the other layer.
    const widgetKey = `wc_${crypto.randomBytes(24).toString("hex")}`;
    const [result] = await pool.query(
      `INSERT INTO webchat_widgets (
        agency_id, widget_type, target_platform, integration_id, flow_id, name, widget_key, primary_color,
        logo_url, display_name, header_bg_color, header_text_color,
        greeting_message, placeholder_text, prefill_message, allowed_domains,
        position, open_on_startup, offset_x, offset_y,
        button_text, button_bg_color, button_text_color, button_size
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.agencyId, isDeepLink ? "DEEPLINK" : "WEBCHAT", targetPlatform, targetIntegrationId,
        flowId || null, name, widgetKey,
        primaryColor || "#6366f1",
        logoUrl || null, displayName || name, headerBgColor || primaryColor || "#6366f1", headerTextColor || "#ffffff",
        greetingMessage || "Hello! How can we help you today?",
        placeholderText || "Type a message…", prefillMessage || null, allowedDomains || null,
        position || "BOTTOM_RIGHT", openOnStartup ? 1 : 0, offsetX ?? 20, offsetY ?? 20,
        buttonText || (isDeepLink ? "Chat with us" : "Chat with us"), buttonBgColor || primaryColor || "#6366f1", buttonTextColor || "#ffffff", buttonSize || "MEDIUM",
      ]
    );
    return res.status(201).json({ success: true, message: "Widget created", widgetKey, id: result.insertId, integrationId: targetIntegrationId });
  } catch (err) { console.error(err); return res.status(err.status || 500).json({ success: false, message: err.message || "Server error", code: err.code }); }
});

router.put("/channels/webchat/:id", async (req, res) => {
  const {
    name, primaryColor, greetingMessage, placeholderText, allowedDomains, isActive,
    flowId, logoUrl, displayName, headerBgColor, headerTextColor, prefillMessage,
    position, openOnStartup, offsetX, offsetY, buttonText, buttonBgColor, buttonTextColor, buttonSize,
    integrationId, // re-target which connected account this widget links to
  } = req.body;
  try {
    let newIntegrationId = integrationId || null;
    if (integrationId) {
      const [[widgetRow]] = await pool.query("SELECT widget_type FROM webchat_widgets WHERE id = ? AND agency_id = ?", [req.params.id, req.agencyId]);
      if (widgetRow?.widget_type === "DEEPLINK") {
        const [[integ]] = await pool.query("SELECT id, platform FROM integrations WHERE id = ? AND agency_id = ?", [integrationId, req.agencyId]);
        if (integ) {
          newIntegrationId = integ.id;
          await pool.query("UPDATE webchat_widgets SET target_platform = ? WHERE id = ? AND agency_id = ?", [integ.platform.toUpperCase(), req.params.id, req.agencyId]);
        }
      }
    }

    // Every field is COALESCE'd against its current value so a partial-field
    // call (e.g. the Flow Builder panel saving only appearance fields, or
    // the list page's Rename saving only `name`) never blanks out the rest —
    // same convention as routes/comments.js's campaign UPDATE.
    await pool.query(
      `UPDATE webchat_widgets SET
        name = COALESCE(?, name),
        primary_color = COALESCE(?, primary_color),
        greeting_message = COALESCE(?, greeting_message),
        placeholder_text = COALESCE(?, placeholder_text),
        allowed_domains = COALESCE(?, allowed_domains),
        is_active = COALESCE(?, is_active),
        flow_id = COALESCE(?, flow_id),
        logo_url = COALESCE(?, logo_url),
        display_name = COALESCE(?, display_name),
        header_bg_color = COALESCE(?, header_bg_color),
        header_text_color = COALESCE(?, header_text_color),
        prefill_message = COALESCE(?, prefill_message),
        position = COALESCE(?, position),
        open_on_startup = COALESCE(?, open_on_startup),
        offset_x = COALESCE(?, offset_x),
        offset_y = COALESCE(?, offset_y),
        button_text = COALESCE(?, button_text),
        button_bg_color = COALESCE(?, button_bg_color),
        button_text_color = COALESCE(?, button_text_color),
        button_size = COALESCE(?, button_size),
        integration_id = COALESCE(?, integration_id)
       WHERE id=? AND agency_id=?`,
      [
        name, primaryColor, greetingMessage, placeholderText, allowedDomains,
        isActive === undefined ? null : (isActive ? 1 : 0),
        flowId, logoUrl, displayName, headerBgColor, headerTextColor, prefillMessage,
        position, openOnStartup === undefined ? null : (openOnStartup ? 1 : 0), offsetX, offsetY,
        buttonText, buttonBgColor, buttonTextColor, buttonSize, newIntegrationId,
        req.params.id, req.agencyId,
      ]
    );
    return res.json({ success: true, message: "Widget updated" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// Was missing entirely — the frontend's channelAPI.deleteWebchat() has
// called this route since it was first added, silently 404ing every time.
router.delete("/channels/webchat/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      "SELECT integration_id, widget_type FROM webchat_widgets WHERE id = ? AND agency_id = ?",
      [req.params.id, req.agencyId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Widget not found" });

    await conn.beginTransaction();
    await conn.query("DELETE FROM webchat_widgets WHERE id = ? AND agency_id = ?", [req.params.id, req.agencyId]);
    // Only a WEBCHAT widget owns its integration (auto-created alongside it
    // in POST above) — remove that so it doesn't linger orphaned. A DEEPLINK
    // widget's integration_id points at an EXISTING WhatsApp/Facebook/
    // Telegram/Instagram account the agency still uses for real messaging —
    // deleting the widget must never touch that connection.
    if (rows[0].integration_id && rows[0].widget_type === "WEBCHAT") {
      await deleteIntegrationCascade(conn, rows[0].integration_id, req.agencyId);
      await conn.query("DELETE FROM integrations WHERE id = ? AND agency_id = ?", [rows[0].integration_id, req.agencyId]);
    }
    await conn.commit();
    return res.json({ success: true, message: "Widget deleted" });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
});

export default router;
