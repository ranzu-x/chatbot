import express from "express";
import axios from "axios";
import pool from "../db.js";
import { resolveMetaAppSettings, resolveTikTokAppSettings } from "../utils/appCredentials.js";
import { isValidMetaSignature } from "../utils/metaSignature.js";
import { processFlow } from "../utils/flowEngine.js";
import { runAIReply } from "../utils/aiReplyEngine.js";
import { getBusinessHoursStatus } from "../utils/businessHours.js";
import {
  findOrCreateContact,
  findOrCreateConversation,
  isDuplicateMessage,
  saveMessage,
  matchBotRules,
} from "../utils/messageProcessor.js";
import { emitToAgency, emitToConversation } from "../utils/socket.js";
import { fetchTelegramUserProfilePhoto, fetchMetaUserProfile } from "../utils/avatarFetcher.js";
import { logBotError, extractErrorMessage, logBotPausedSkip } from "../utils/botLogger.js";
import { runPrivateReplyFlow, generateCommentReply } from "../utils/commentPrivateReplyFlow.js";
import { handleAppointmentBooking } from "../utils/appointmentBookingEngine.js";
import { isCommerceButton, handleCommerceButton } from "../utils/commerceEvents.js";
import { isValidTelegramSecret, isValidTikTokSignature } from "../utils/webhookAuth.js";
import { recountBroadcastStats } from "../utils/broadcastStats.js";
import { trackMessageReceipt } from "../utils/flowStats.js";
import { extractGrowthCode, extractMetaLinkRef, handleGrowthLinkArrival } from "../utils/growthLinks.js";
import { loadRuleLinks, findRuleForPost } from "../utils/commentRulePosts.js";
import { getPublicBackendUrl, resolvePublicImageUrl } from "../utils/platformSender.js";
import { applyTemplateStatusUpdate } from "../utils/messengerUtility.js";
import { handleWhatsAppCallEvent, handleCallSettingsUpdate } from "../utils/whatsappCallEvents.js";
import { handleProfilePostback, isProfilePayload, handleTextTrigger, startFlowForConversation } from "../utils/messengerProfile.js";
import { handleOptKeywords } from "../utils/optOut.js";
import { handleQuickActionInbound, runNoMatchReply } from "../utils/quickActions.js";
import { handleTelegramGroupUpdate } from "../utils/telegramGroups.js";
import { handleCsatReply, getInboxSettings, autoAssign } from "../utils/inboxQuality.js";
import { notifyAssigneeOfInbound } from "../utils/webPush.js";
import { transcribeMessage } from "../utils/transcribe.js";
import { handleGroupMessage, handleGroupEvent } from "../utils/whatsappGroups.js";
import { describeOrder } from "../utils/whatsappCatalog.js";
import { handleMessageEchoes, handleHistory, handleStateSync } from "../utils/whatsappCoexistence.js";
import { parseMetaMessage, handleStoryEvent } from "../utils/storyReplies.js";
import { extractWhatsAppReferral, extractMetaReferral, recordAdReferral, flowForAd } from "../utils/adReferrals.js";
import { handleOptinEvent, handleMarketingChange } from "../utils/messengerMarketing.js";
import { answerPreCheckout, handleStarsPayment, orderIdFromInvoicePayload } from "../services/chatPaymentService.js";
import { upsertBusinessConnection, resolveBusinessMessage, businessExternalId } from "../utils/telegramBusiness.js";
import { resolveWhatsAppSender, attachWhatsAppIdentity, linkPhoneToContact, handleUserIdUpdate, isBsuid } from "../utils/whatsappIdentity.js";
import { META_API_VERSION } from "../utils/metaApi.js";
import { isWorkspaceExpired } from "../utils/subscriptionStatus.js";

const router = express.Router();

// Workspace ids are numeric. The generic Meta routes (/webhook/:agencyId/:integrationId)
// are declared before the platform-specific ones, so without this /webhook/tiktok/5
// was swallowed by the Meta handler (agencyId = "tiktok") and never reached TikTok's.
router.param("agencyId", (req, res, next, value) => (/^\d+$/.test(value) ? next() : next("route")));

/**
 * Verifies Meta's X-Hub-Signature-256 header — an HMAC-SHA256 of the raw
 * request body, keyed with the receiving app's secret — before trusting a
 * POST to /webhook/:agencyId(/:integrationId) as genuinely from Meta.
 * Previously nothing checked this at all: anyone who found an agency's
 * webhook URL could POST a forged payload (fake inbound messages, fake
 * delivered/read statuses, fake call events) straight into that agency's
 * conversations and automations. Mirrors the same pattern already used for
 * Stripe's webhook in routes/billing.js, just HMAC instead of Stripe's SDK.
 *
 * A MISSING header is tolerated outside production (curl/manual testing
 * during development never computes one) but a header that's PRESENT and
 * WRONG is rejected in every environment — this never accepts a forged
 * signature, it only relaxes "did you send one at all" for local dev.
 */
async function verifyMetaSignature(req) {
  const header = req.headers["x-hub-signature-256"];
  const agencyId = req.params.agencyId;

  if (!header) {
    return process.env.NODE_ENV !== "production";
  }
  if (!req.rawBody) return false;

  // An agency's Meta channels do not all have to come from the same Meta
  // app — WhatsApp and Facebook/Instagram are deliberately separate app
  // slots (meta_app_pool, platform_group WHATSAPP vs MESSENGER_INSTAGRAM —
  // see utils/appCredentials.js), and a WhatsApp number connected manually
  // via Cloud API can additionally carry its own per-integration override.
  // Meta signs each webhook with the app secret of whichever app owns that
  // subscription, and the raw body isn't parsed yet at this point, so which
  // platform (and therefore which slot) this payload belongs to isn't known
  // ahead of verification. So every secret the agency legitimately holds
  // across BOTH slots is a candidate. Matching ANY of them proves the
  // payload came from Meta signed by an app this agency owns.
  const candidates = [];

  const [waSettings, msgSettings] = await Promise.all([
    resolveMetaAppSettings(Number(agencyId), "WHATSAPP").catch(() => null),
    resolveMetaAppSettings(Number(agencyId), "MESSENGER_INSTAGRAM").catch(() => null),
  ]);
  if (waSettings?.app_secret) candidates.push(waSettings.app_secret);
  if (msgSettings?.app_secret) candidates.push(msgSettings.app_secret);
  if (process.env.META_APP_SECRET) candidates.push(process.env.META_APP_SECRET);

  try {
    const [rows] = await pool.query(
      "SELECT DISTINCT app_secret FROM integrations WHERE agency_id = ? AND app_secret IS NOT NULL AND app_secret <> ''",
      [agencyId]
    );
    for (const r of rows) candidates.push(r.app_secret);
  } catch (err) {
    console.error("[Webhook Signature] failed to load integration app secrets:", err.message);
  }

  const match = candidates.length > 0 && candidates.some((secret) => isValidMetaSignature(req.rawBody, header, secret));
  if (!match) {
    // Check if this is a WhatsApp webhook for an active connected number in this agency.
    // Like BotSailor and other WhatsApp BSP / SaaS providers, Meta's payload signature
    // validation is optional on the receiver's end when numbers are connected across
    // multiple developer apps or without a dedicated app_secret configured.
    const body = req.body;
    const isWhatsApp =
      body?.object === "whatsapp_business_account" ||
      !!body?.entry?.[0]?.changes?.[0]?.value?.messaging_product ||
      !!body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

    if (isWhatsApp) {
      let waPhoneId = null;
      let wabaId = null;
      for (const entry of (body?.entry || [])) {
        if (entry.id) wabaId = entry.id;
        for (const change of (entry?.changes || [])) {
          // Call-settings updates name the number in phone_number_settings, not metadata.
          const pid = change?.value?.metadata?.phone_number_id || change?.value?.phone_number_settings?.phone_number_id;
          if (pid) {
            waPhoneId = pid;
            break;
          }
        }
        if (waPhoneId) break;
      }

      if (waPhoneId || wabaId) {
        try {
          const [[waInteg]] = await pool.query(
            "SELECT id FROM integrations WHERE agency_id = ? AND platform = 'WHATSAPP' AND (wa_phone_number_id = ? OR wa_business_acc_id = ?) AND is_active = 1 LIMIT 1",
            [agencyId, waPhoneId || "", wabaId || ""]
          );
          if (waInteg) {
            console.log(`[Webhook Signature] Accepted WhatsApp webhook for active integration ${waInteg.id} (phone: ${waPhoneId || wabaId}, agency ${agencyId})`);
            return true;
          }
        } catch (dbErr) {
          console.error("[Webhook Signature] Error checking WhatsApp integration:", dbErr.message);
        }
      }
    }

    if (candidates.length === 0) {
      console.warn(`[Webhook Signature] No app_secret resolvable for agency ${agencyId} — rejecting signed request`);
      return false;
    }

    console.warn(
      `[Webhook Signature] Verification failed for agency ${agencyId}. Tested ${candidates.length} candidate secret(s). ` +
      `If this channel belongs to a different Meta App, ensure that app's 32-character App Secret ` +
      `(from Meta App Dashboard → App Settings → Basic → App Secret) is configured on the integration.`
    );
  }
  return match;
}

/**
 * Mirrors a message's delivered/read/failed status onto its broadcast_logs
 * row (if this message was actually a broadcast send — most aren't, so a
 * no-op UPDATE affecting 0 rows is the common case and is cheap) and keeps
 * broadcast_campaigns' delivered_count/read_count/failed_count counters in
 * sync. Called from the same status-webhook handlers that already update
 * the `messages` table for WhatsApp `statuses` events and Messenger's
 * delivery/read watermark events.
 */
async function markBroadcastLogStatus(externalMsgId, status, errorMessage = null) {
  if (!externalMsgId) return;
  try {
    const [[log]] = await pool.query(
      "SELECT id, campaign_id, status FROM broadcast_logs WHERE external_msg_id = ? LIMIT 1",
      [externalMsgId]
    );
    if (!log) return;
    // Never move a log backwards (e.g. a late "delivered" event arriving
    // after "read" already landed) — READ implies DELIVERED already happened.
    // FAILED is final, and a repeated "failed" event changes nothing.
    const rank = { PENDING: 0, HELD: 0.5, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 };
    if (log.status === "FAILED") return;
    if (status !== "FAILED" && rank[status] <= rank[log.status]) return;

    const column = status === "DELIVERED" ? "delivered_at" : status === "READ" ? "read_at" : null;
    await pool.query(
      `UPDATE broadcast_logs SET status = ?${column ? `, ${column} = NOW()` : ""}${status === "FAILED" ? ", error_message = ?" : ""} WHERE id = ?`,
      status === "FAILED" ? [status, errorMessage, log.id] : [status, log.id]
    );
    // Recount rather than +1: a message accepted and then reported failed
    // moves from Sent to Failed instead of being counted in both.
    await recountBroadcastStats(log.campaign_id);
  } catch (err) {
    console.error("[Broadcast] failed to mirror status update:", err.message);
  }
}

/**
 * WhatsApp Calling — handles the `calls` array (connect/terminate events)
 * and the call-specific entries inside the `statuses` array (RINGING/
 * ACCEPTED/REJECTED — uppercase, which is how they're distinguished from
 * ordinary lowercase message statuses sharing that same array). Emits to
 * the agency's Socket.io room so the agent's browser tab that placed the
 * call — running a real RTCPeerConnection — can react: apply the SDP
 * answer, update the call UI, or tear the connection down.
 * See routes/whatsappCalls.js for the REST side of this flow.
 */
const CALL_STATUS_VALUES = new Set(["RINGING", "ACCEPTED", "REJECTED"]);

async function handleWhatsAppCallStatus(statusObj) {
  const wacid = statusObj.id;
  const status = statusObj.status;
  if (!wacid || !CALL_STATUS_VALUES.has(status)) return false; // not a call status — let the caller fall through to message-status handling

  try {
    const [[call]] = await pool.query("SELECT * FROM whatsapp_calls WHERE wacid = ? LIMIT 1", [wacid]);
    if (!call) return true; // recognized as a call status, just not one we placed (e.g. a stale/foreign wacid) — still handled, don't fall through

    const newStatus = status === "REJECTED" ? "REJECTED" : status; // RINGING / ACCEPTED map 1:1
    await pool.query("UPDATE whatsapp_calls SET status = ? WHERE id = ?", [newStatus, call.id]);
    emitToAgency(call.agency_id, "whatsapp_call_status", { callDbId: call.id, wacid, status: newStatus });
  } catch (err) {
    console.error("[WA Calling] status webhook error:", err.message);
  }
  return true;
}


/**
 * Meta Webhook handler for WhatsApp, Facebook Messenger, and Instagram.
 * Meta sends ALL events to one webhook endpoint. We differentiate by integration.
 *
 * Webhook URL pattern: POST /api/v1/webhook/:agencyId/:integrationId
 * Verification URL:    GET  /api/v1/webhook/:agencyId/:integrationId
 */

// ─── AGENCY LEVEL WEBHOOK VERIFICATION (GET) ──────────────────────────────────
router.get("/webhook/:agencyId", async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log(`[Meta Webhook] Incoming GET verification on /webhook/${req.params.agencyId}:`, {
    mode,
    token,
    challenge,
  });

  if (mode !== "subscribe" || !token) {
    console.warn(`[Meta Webhook] Invalid request: mode=${mode}, token=${token}`);
    return res.status(400).send("Invalid mode or missing verify token");
  }

  try {
    // 1. Check meta_app_pool for this agency — WhatsApp and Messenger+
    // Instagram are separate app slots (and each can have standbys), and
    // this handshake doesn't know which slot/platform it's for yet, so
    // every verify_token the agency holds across every slot is a candidate.
    const [poolRows] = await pool.query(
      "SELECT verify_token FROM meta_app_pool WHERE agency_id = ? AND verify_token IS NOT NULL",
      [req.params.agencyId]
    );

    // 2. Check if token matches ANY verify_token in meta_app_pool (any agency —
    // covers a token pasted from the wrong agency's dashboard by mistake)
    const [allMeta] = await pool.query(
      "SELECT verify_token FROM meta_app_pool WHERE verify_token = ? LIMIT 1",
      [token]
    );

    // 3. Check if token matches ANY verify_token in integrations
    const [allInteg] = await pool.query(
      "SELECT verify_token FROM integrations WHERE verify_token = ? LIMIT 1",
      [token]
    );

    const envTokens = [
      process.env.META_WEBHOOK_VERIFY_TOKEN,
      process.env.META_VERIFY_TOKEN,
    ].filter(Boolean);

    const validTokens = [
      ...poolRows.map((r) => r.verify_token),
      allMeta[0]?.verify_token,
      allInteg[0]?.verify_token,
      ...envTokens,
    ].filter(Boolean);

    console.log(`[Meta Webhook] Received token: "${token}". Valid registered tokens:`, validTokens);

    if (validTokens.includes(token)) {
      console.log(`✅ [Meta Webhook] Verification SUCCESS for agency ${req.params.agencyId}! Returning challenge:`, challenge);
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(String(challenge));
    }

    console.warn(`❌ [Meta Webhook] Verification FAILED: token "${token}" does not match any registered token for agency ${req.params.agencyId}`);
    return res.status(403).send("Verification token mismatch");
  } catch (err) {
    console.error("Agency Webhook verification error:", err);
    return res.status(500).send("Server error during verification");
  }
});

// ─── INTEGRATION LEVEL WEBHOOK VERIFICATION (GET) ────────────────────────────
router.get("/webhook/:agencyId/:integrationId", async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log(`[Meta Webhook] Incoming GET verification on /webhook/${req.params.agencyId}/${req.params.integrationId}:`, {
    mode,
    token,
    challenge,
  });

  if (mode !== "subscribe" || !token) {
    return res.status(400).send("Invalid mode or missing verify token");
  }

  try {
    const [rows] = await pool.query(
      "SELECT verify_token FROM integrations WHERE id = ? AND agency_id = ? AND is_active = 1",
      [req.params.integrationId, req.params.agencyId]
    );

    const [poolRows] = await pool.query(
      "SELECT verify_token FROM meta_app_pool WHERE agency_id = ? AND verify_token IS NOT NULL",
      [req.params.agencyId]
    );

    const validTokens = [
      rows[0]?.verify_token,
      ...poolRows.map((r) => r.verify_token),
      process.env.META_WEBHOOK_VERIFY_TOKEN,
      process.env.META_VERIFY_TOKEN,
    ].filter(Boolean);

    if (validTokens.includes(token)) {
      console.log(`✅ [Meta Webhook] Integration verification SUCCESS! Returning challenge:`, challenge);
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(String(challenge));
    }

    console.warn(`❌ [Meta Webhook] Integration verification FAILED for integration ${req.params.integrationId}`);
    return res.status(403).send("Verification token mismatch");
  } catch (err) {
    console.error("Webhook verification error:", err);
    return res.status(500).send("Server error during verification");
  }
});

// fetchMetaUserProfile and fetchTelegramUserProfilePhoto imported from ../utils/avatarFetcher.js


// ─── RECEIVE META INCOMING MESSAGES VIA AGENCY WEBHOOK (POST) ────────────────
router.post("/webhook/:agencyId", async (req, res) => {
  const { agencyId } = req.params;
  const body = req.body;

  if (!(await verifyMetaSignature(req))) {
    console.warn(`[Webhook Signature] Rejected unsigned/invalid POST to /webhook/${agencyId}`);
    return res.status(401).send("Invalid signature");
  }

  console.log(`\n📨 [Webhook POST] /webhook/${agencyId} received:`, JSON.stringify(body, null, 2));

  // Always respond 200 immediately to Meta
  res.sendStatus(200);

  try {
    // 1. Check if WhatsApp payload
    const isWhatsApp =
      body?.object === "whatsapp_business_account" ||
      !!body?.entry?.[0]?.changes?.[0]?.value?.messaging_product ||
      !!body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

    if (isWhatsApp) {
      let waPhoneId = null;
      let wabaId = null;

      for (const entry of (body?.entry || [])) {
        if (entry.id) wabaId = entry.id;
        for (const change of (entry?.changes || [])) {
          if (change?.value?.metadata?.phone_number_id) {
            waPhoneId = change.value.metadata.phone_number_id;
            break;
          }
        }
        if (waPhoneId) break;
      }

      let integration = null;
      if (waPhoneId || wabaId) {
        const [waRows] = await pool.query(
          "SELECT * FROM integrations WHERE (wa_phone_number_id = ? OR wa_business_acc_id = ?) AND agency_id = ? AND is_active = 1 LIMIT 1",
          [waPhoneId || "", wabaId || "", agencyId]
        );
        integration = waRows[0];
      }

      if (!integration) {
        const [fallbackRows] = await pool.query(
          "SELECT * FROM integrations WHERE agency_id = ? AND platform = 'WHATSAPP' AND is_active = 1 LIMIT 1",
          [agencyId]
        );
        integration = fallbackRows[0];
      }

      if (integration) {
        console.log(`[Webhook POST] Routing to WhatsApp handler, integration=${integration.id}`);
        return handleWhatsAppPayload(body, agencyId, integration.id, integration);
      } else {
        console.warn(`[Webhook POST] ⚠️ No active WhatsApp integration found for agency ${agencyId}`);
      }
      return;
    }

    // 2. Check if Facebook / Instagram payload
    const fbEntry = body?.entry?.[0];
    const pageOrIgId = fbEntry?.id;

    if (pageOrIgId) {
      console.log(`[Webhook POST] Detected FB/IG payload, pageOrIgId=${pageOrIgId}`);
      const [fbRows] = await pool.query(
        "SELECT * FROM integrations WHERE (fb_page_id = ? OR ig_account_id = ?) AND agency_id = ? AND is_active = 1 LIMIT 1",
        [pageOrIgId, pageOrIgId, agencyId]
      );
      const integration = fbRows[0] || (await pool.query(
        "SELECT * FROM integrations WHERE agency_id = ? AND platform IN ('FACEBOOK','INSTAGRAM') AND is_active = 1 LIMIT 1",
        [agencyId]
      ))[0]?.[0];

      if (integration) {
        console.log(`[Webhook POST] Matched integration: id=${integration.id}, platform=${integration.platform}, name=${integration.name}`);
        if (integration.platform === "FACEBOOK") {
          return handleFacebookPayload(body, agencyId, integration.id, integration);
        } else if (integration.platform === "INSTAGRAM") {
          return handleInstagramPayload(body, agencyId, integration.id, integration);
        }
      } else {
        console.warn(`[Webhook POST] ⚠️ No matching integration found for pageOrIgId=${pageOrIgId}, agency=${agencyId}`);
      }
    } else {
      console.warn(`[Webhook POST] ⚠️ Could not determine payload type (no WA phone ID or FB page ID found)`);
    }
  } catch (err) {
    console.error("Agency Webhook POST processing error:", err);
  }
});

// ─── PAYLOAD HANDLERS ────────────────────────────────────────────────────────
async function handleWhatsAppPayload(body, agencyId, integrationId, integration) {
  try {
    const entries = body?.entry || [];
    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const value = change?.value;
        if (!value) continue;

        // WhatsApp Calling: connect (SDP answer) / terminate events — a
        // separate array from message statuses, only ever present on a
        // webhook carrying call activity.
        if (Array.isArray(value.calls)) {
          for (const callObj of value.calls) {
            await handleWhatsAppCallEvent(callObj, { agencyId, integrationId, integration, contacts: value.contacts });
          }
        }

        // Call settings changed (here or in WhatsApp Manager) — refresh open settings screens.
        // Coexistence (number also on the WhatsApp Business app): echoes of what the business
        // sent from the phone, past chat history, and the app's contacts (utils/whatsappCoexistence.js).
        if (change.field === "smb_message_echoes" || Array.isArray(value.message_echoes)) {
          await handleMessageEchoes(agencyId, integration, value.message_echoes || []).catch((e) => console.error("[Coexistence] echoes:", e.message));
          continue;
        }
        if (change.field === "history" || Array.isArray(value.history)) {
          await handleHistory(agencyId, integration, value.history || []).catch((e) => console.error("[Coexistence] history:", e.message));
          continue;
        }
        if (change.field === "smb_app_state_sync" || Array.isArray(value.state_sync)) {
          await handleStateSync(agencyId, integration, value.state_sync || []).catch((e) => console.error("[Coexistence] contacts:", e.message));
          continue;
        }
        // Groups API lifecycle / participants / settings / status events.
        if (String(change.field || "").startsWith("group_")) {
          await handleGroupEvent({ agencyId, integration, field: change.field, value }).catch((e) => console.error("[WA Groups] event:", e.message));
          continue;
        }
        // Business username approved / reserved / deleted (Username API) — refresh open screens.
        if (change.field === "business_username_updates") {
          emitToAgency(agencyId, "whatsapp_username_updated", { integrationId, username: value?.username || null, status: value?.status || null });
          continue;
        }
        if (change.field === "account_settings_update") {
          handleCallSettingsUpdate(agencyId, integrationId, value);
          continue;
        }

        // Handle message status updates (sent, delivered, read, failed) —
        // WhatsApp Calling's RINGING/ACCEPTED/REJECTED status also arrives
        // in this SAME array (Meta reuses it for both), distinguished by
        // being uppercase where message statuses are lowercase.
        if (Array.isArray(value.statuses)) {
          for (const statusObj of value.statuses) {
            if (await handleWhatsAppCallStatus(statusObj)) continue;

            const externalMsgId = statusObj.id;
            const status = statusObj.status; // "delivered", "read", "sent", "failed"
            if (!externalMsgId || !status) continue;

            try {
              const [[msgRow]] = await pool.query(
                `SELECT m.id, m.conversation_id, c.agency_id, c.integration_id, c.contact_id, ct.external_id AS contact_identifier
                 FROM messages m
                 JOIN conversations c ON c.id = m.conversation_id
                 JOIN contacts ct ON ct.id = c.contact_id
                 WHERE m.external_msg_id = ? LIMIT 1`,
                [externalMsgId]
              );
              if (!msgRow) continue;

              // A message held by WhatsApp's pacing was released — no longer "held".
              if (status === "sent" || status === "delivered" || status === "read") {
                await pool.query(
                  "UPDATE messages SET metadata = JSON_REMOVE(metadata, '$.heldByMeta') WHERE id = ? AND JSON_EXTRACT(metadata, '$.heldByMeta') IS NOT NULL",
                  [msgRow.id]
                ).catch(() => {});
              }
              if (status === "sent") {
                await markBroadcastLogStatus(externalMsgId, "SENT");
              } else if (status === "delivered") {
                await trackMessageReceipt(msgRow.id, "delivered"); // flow analytics — counts once
                await pool.query("UPDATE messages SET delivered_at = NOW() WHERE id = ?", [msgRow.id]);
                await markBroadcastLogStatus(externalMsgId, "DELIVERED");
                const payload = { messageId: msgRow.id, conversationId: msgRow.conversation_id, deliveredAt: new Date().toISOString() };
                // Agent Inbox UI only ever joins the `agency:` room (see utils/socket.js) — the
                // `conv:` room is for webchat widget sessions. Emit to both so either listener works.
                emitToAgency(msgRow.agency_id, "message_status_update", payload);
                emitToConversation(msgRow.conversation_id, "message_status_update", payload);
              } else if (status === "read" || status === "played") {
                // "played" (Nov 2025): a voice message was listened to — it implies read.
                const played = status === "played";
                await trackMessageReceipt(msgRow.id, "read"); // flow analytics — counts once
                await pool.query(
                  played
                    ? "UPDATE messages SET read_at = COALESCE(read_at, NOW()), is_read = 1, metadata = JSON_SET(COALESCE(metadata, JSON_OBJECT()), '$.playedAt', DATE_FORMAT(NOW(), '%Y-%m-%dT%H:%i:%s')) WHERE id = ?"
                    : "UPDATE messages SET read_at = NOW(), is_read = 1 WHERE id = ?",
                  [msgRow.id]
                );
                await markBroadcastLogStatus(externalMsgId, "READ");
                const payload = { messageId: msgRow.id, conversationId: msgRow.conversation_id, readAt: new Date().toISOString(), isRead: true, ...(played ? { played: true } : {}) };
                emitToAgency(msgRow.agency_id, "message_status_update", payload);
                emitToConversation(msgRow.conversation_id, "message_status_update", payload);
              } else if (status === "failed") {
                // Meta accepted the send request earlier (we got a wamid back) but delivery
                // ultimately failed — statusObj.errors carries the real reason (bad media
                // format, size limit, recipient issue, etc). Previously this was silently
                // dropped, so failed media sends looked like they vanished with no explanation.
                const metaError = Array.isArray(statusObj.errors) && statusObj.errors[0]
                  ? statusObj.errors[0]
                  : null;
                const errorMessage = Number(metaError?.code) === 132015
                  // Template pacing: Meta held this message, early recipients reacted badly, so it was dropped.
                  ? "[Code 132015] Not sent — WhatsApp held this template message for a quality check and dropped it after negative feedback from early recipients. The template is paused; edit it before sending again."
                  : metaError
                  ? `[Code ${metaError.code || "?"}] ${metaError.title || metaError.message || "Delivery failed"}${metaError.error_data?.details ? ` — ${metaError.error_data.details}` : ""}`
                  : "WhatsApp reported this message as failed to deliver.";

                console.error(`❌ [WhatsApp Delivery Failed] external_msg_id=${externalMsgId}:`, errorMessage);

                await pool.query(
                  "UPDATE messages SET status = 'FAILED', failure_stage = 'DELIVERY', failure_reason = ? WHERE id = ?",
                  [errorMessage, msgRow.id]
                );
                await markBroadcastLogStatus(externalMsgId, "FAILED", errorMessage);
                {
                  const payload = {
                    messageId: msgRow.id, conversationId: msgRow.conversation_id,
                    status: "FAILED", failureStage: "DELIVERY", failureReason: errorMessage,
                  };
                  emitToAgency(msgRow.agency_id, "message_status_update", payload);
                  emitToConversation(msgRow.conversation_id, "message_status_update", payload);
                }

                await logBotError({
                  agencyId: msgRow.agency_id,
                  integrationId: msgRow.integration_id,
                  platform: "WHATSAPP",
                  contactId: msgRow.contact_id,
                  contactIdentifier: msgRow.contact_identifier,
                  customMessage: errorMessage,
                  error: metaError,
                });
              }
            } catch (statusErr) {
              console.error("Failed to process WhatsApp status update:", statusErr.message);
            }
          }
        }

        // A user's business-scoped id changed (they changed phone number).
        if (Array.isArray(value.user_id_update)) {
          for (const upd of value.user_id_update) {
            await handleUserIdUpdate(agencyId, integrationId, upd).catch((e) => console.error("[WA Identity] user_id_update:", e.message));
          }
        }

        const messages = value?.messages;
        if (!messages || !Array.isArray(messages) || messages.length === 0) continue;

        // Profile per sender — keyed by phone (wa_id) and by BSUID (user_id),
        // since a user with a username arrives without a phone.
        const contactMap = {};
        if (Array.isArray(value?.contacts)) {
          for (const c of value.contacts) {
            if (c.wa_id) contactMap[c.wa_id] = c;
            if (c.user_id) contactMap[c.user_id] = c;
          }
        }

        for (const msg of messages) {
          // A WhatsApp group message → the group's feed (utils/whatsappGroups.js), never a
          // one-to-one chat: the bot must not answer a group member privately.
          if (msg.group_id) {
            await handleGroupMessage({ agencyId, integration, msg, contacts: value.contacts })
              .catch((e) => console.error("[WA Groups] inbound:", e.message));
            continue;
          }
          // Sender: phone (msg.from) when Meta shares it, always a BSUID
          // (from_user_id). utils/whatsappIdentity.js maps both to one
          // subscriber and merges duplicates.
          const profileEntry = contactMap[msg.from_user_id] || contactMap[msg.from] || (value.contacts?.length === 1 ? value.contacts[0] : null);
          const waIdentity = await resolveWhatsAppSender({
            agencyId,
            integrationId,
            phone: msg.from || profileEntry?.wa_id,
            userId: msg.from_user_id || profileEntry?.user_id,
            parentUserId: msg.from_parent_user_id || profileEntry?.parent_user_id,
            username: profileEntry?.profile?.username,
          });
          const externalId = waIdentity.externalId;
          if (!externalId) continue;
          const externalMsgId = msg.id;
          const msgType = (msg.type || "text").toUpperCase();
          let mediaUrl = null;

          let msgBody = "";
          let buttonRoute = null; // raw button/list id, checked for our own routing token (see flowEngine.js)
          if (msg.type === "text") {
            msgBody = msg.text?.body || "";
          } else if (msg.type === "button") {
            // A tap on a template's quick-reply button; the payload is ours
            // (e.g. a COD Confirm/Cancel, utils/commerceEvents.js).
            msgBody = msg.button?.text || "";
            buttonRoute = msg.button?.payload || null;
          } else if (msg.type === "interactive") {
            const type = msg.interactive?.type;
            if (type === "call_permission_reply") {
              // Not a chat message — the user's answer to a call-permission
              // request. Update our cached permission state and stop; this
              // must never reach findMatchingFlow/AI reply as if it were a
              // real inbound message.
              const reply = msg.interactive.call_permission_reply || {};
              try {
                const [[contact]] = await pool.query(
                  "SELECT id FROM contacts WHERE agency_id = ? AND platform = 'WHATSAPP' AND external_id = ? LIMIT 1",
                  [agencyId, externalId]
                );
                if (contact) {
                  const status = reply.response === "accept" ? "GRANTED" : "REJECTED";
                  const expiresAt = reply.expiration_timestamp ? new Date(Number(reply.expiration_timestamp) * 1000) : null;
                  await pool.query(
                    `INSERT INTO whatsapp_call_permissions (agency_id, contact_id, integration_id, status, is_permanent, expires_at, responded_at)
                     VALUES (?, ?, ?, ?, ?, ?, NOW())
                     ON DUPLICATE KEY UPDATE status = VALUES(status), is_permanent = VALUES(is_permanent), expires_at = VALUES(expires_at), responded_at = NOW()`,
                    [agencyId, contact.id, integrationId, status, reply.is_permanent ? 1 : 0, expiresAt]
                  );
                  emitToAgency(agencyId, "whatsapp_call_permission_update", { contactId: contact.id, status, isPermanent: Boolean(reply.is_permanent) });
                }
              } catch (permErr) {
                console.error("[WA Calling] permission reply webhook error:", permErr.message);
              }
              continue;
            }
            if (type === "button_reply") {
              msgBody = msg.interactive?.button_reply?.title || msg.interactive?.button_reply?.id || "";
              buttonRoute = msg.interactive?.button_reply?.id || null;
            } else if (type === "list_reply") {
              msgBody = msg.interactive?.list_reply?.title || msg.interactive?.list_reply?.id || "";
              buttonRoute = msg.interactive?.list_reply?.id || null;
            }
          } else if (msg.type === "image") {
            msgBody = msg.image?.caption || "";
            mediaUrl = msg.image?.link || msg.image?.url || null;
          } else if (msg.type === "video") {
            msgBody = msg.video?.caption || "";
            mediaUrl = msg.video?.link || msg.video?.url || null;
          } else if (msg.type === "audio" || msg.type === "voice") {
            msgBody = "";
            mediaUrl = msg.audio?.link || msg.audio?.url || msg.voice?.link || null;
          } else if (msg.type === "document") {
            msgBody = msg.document?.filename || "";
            mediaUrl = msg.document?.link || msg.document?.url || null;
          } else if (msg.type === "order") {
            // A cart sent from the WhatsApp catalog (utils/whatsappCatalog.js).
            msgBody = describeOrder(msg.order);
          } else if (msg.type === "sticker") {
            mediaUrl = msg.sticker?.link || msg.sticker?.url || null;
          } else if (msg.type === "location") {
            const loc = msg.location || {};
            msgBody = `📍 ${[loc.name, loc.address].filter(Boolean).join(", ") || "Location"}${loc.latitude != null ? ` (${loc.latitude}, ${loc.longitude})` : ""}`;
          } else if (msg.type === "reaction") {
            // A reaction to one of our messages — not a new message; no bot run.
            continue;
          } else if (msg.type === "contacts") {
            // A shared contact card. From the REQUEST_CONTACT_INFO button
            // (origin "contact_request") it is the user's OWN number: link it
            // so a username-only subscriber merges with their phone record.
            const shared = msg.contacts?.[0];
            const sharedPhone = shared?.phones?.[0]?.wa_id || shared?.phones?.[0]?.phone;
            const ORIGINS = ["contact_request", "request_contact_info"];
            const isOwn = ORIGINS.includes(msg.origin) || ORIGINS.includes(shared?.origin) || ORIGINS.includes(msg.contacts?.origin);
            msgBody = shared?.name?.formatted_name ? `📇 ${shared.name.formatted_name}${sharedPhone ? ` (${sharedPhone})` : ""}` : "📇 Contact";
            if (isOwn && sharedPhone && waIdentity.contactId) {
              try {
                const [[current]] = await pool.query("SELECT * FROM contacts WHERE id = ?", [waIdentity.contactId]);
                const linked = await linkPhoneToContact(agencyId, current, sharedPhone, "CONTACT_SHARED");
                if (linked) waIdentity.externalId = linked.external_id;
              } catch (linkErr) {
                console.error("[WA Identity] contact share link failed:", linkErr.message);
              }
            }
          } else {
            msgBody = msg.image?.caption || msg.video?.caption || msg.document?.filename || "";
          }

          const senderName = profileEntry?.profile?.name || profileEntry?.profile?.username || value?.contacts?.[0]?.profile?.name || externalId;

          await handleIncomingPayload({
            agencyId,
            integrationId,
            platform: "WHATSAPP",
            externalId: waIdentity.externalId,
            waIdentity: waIdentity.identity,
            adReferral: extractWhatsAppReferral(msg),
            externalMsgId,
            msgType: msgType === "INTERACTIVE" || msgType === "BUTTON" ? "TEXT" : msgType,
            msgBody,
            buttonRoute,
            mediaUrl,
            senderName,
            avatar: null,
            integration,
          });
        }
      }
    }
  } catch (err) {
    console.error("WhatsApp Webhook processing error:", err);
  }
}

// ─── HELPER: PROCESS COMMENT AUTOMATION (FB PAGE & INSTAGRAM) ────────────────
async function processCommentAutomation({ commentId, postId, senderId, senderName, commentText }, platform, agencyId, integrationId, integration) {
  try {
    if (!commentId || !commentText || !integration?.access_token) return;
    if (await isWorkspaceExpired(agencyId)) return; // expired plan → no comment replies / DMs

    console.log(`\n💬 [Comment Automation] Incoming ${platform} comment (${commentId}) on post (${postId}) from ${senderName} (${senderId}): "${commentText}"`);

    // Do not reply to our own comments
    if (senderId && (senderId === integration.fb_page_id || senderId === integration.ig_account_id)) {
      console.log(`[Comment Automation] Skipping own comment from page/account (${senderId})`);
      return;
    }

    // Find all active comment rules for this agency and platform (a SAVED
    // campaign is a reusable copy that runs on no post — never matched)
    const [rules] = await pool.query(
      `SELECT * FROM comment_automation_rules
       WHERE agency_id = ? AND (integration_id = ? OR integration_id IS NULL)
         AND platform = ? AND is_active = 1 AND post_id <> 'SAVED_CAMPAIGN'`,
      [agencyId, integrationId, platform]
    );

    if (!rules.length) {
      console.log(`[Comment Automation] No active comment automation rules found for ${platform} (agency: ${agencyId})`);
      return;
    }

    // 1. The campaign running on this post — a campaign can run on several
    // posts (comment_rule_posts), matched with the same loose post-id
    // comparison this used before.
    const specificRules = rules.filter(r => r.post_id && r.post_id !== "ALL_POSTS");
    let selectedRule = findRuleForPost(specificRules, await loadRuleLinks(specificRules.map(r => r.id)), postId, { loose: true });

    // 2. Fallback to an ALL_POSTS rule if no post-specific rule was found
    if (!selectedRule) {
      selectedRule = rules.find(r => r.post_id === "ALL_POSTS" || !r.post_id);
    }

    if (!selectedRule) {
      console.log(`[Comment Automation] No matching rule found for post ${postId} on ${platform}`);
      return;
    }

    const rule = selectedRule;
    console.log(`[Comment Automation] 🎯 Matched campaign "${rule.campaign_name}" (Rule ID: ${rule.id}) for post ${rule.post_id}`);

    const lowerComment = commentText.toLowerCase().trim();

    // 1. Check Offensive Keywords Moderation
    if (rule.offensive_keywords && rule.offensive_action !== "NONE") {
      const offensiveList = rule.offensive_keywords.split(",").map(k => k.trim().toLowerCase()).filter(Boolean);
      const isOffensive = offensiveList.some(k => lowerComment.includes(k));

      if (isOffensive) {
        console.log(`[Comment Automation] 🚨 Offensive comment detected on ${platform} (${commentId}): "${commentText}"`);
        if (rule.offensive_action === "HIDE") {
          await axios.post(
            `https://graph.facebook.com/${META_API_VERSION}/${commentId}?is_hidden=true`,
            {},
            { headers: { Authorization: `Bearer ${integration.access_token}` } }
          ).catch(e => console.warn("Hide comment warning:", e.response?.data || e.message));
        } else if (rule.offensive_action === "DELETE") {
          await axios.delete(
            `https://graph.facebook.com/${META_API_VERSION}/${commentId}`,
            { headers: { Authorization: `Bearer ${integration.access_token}` } }
          ).catch(e => console.warn("Delete comment warning:", e.response?.data || e.message));
        }

        if (rule.offensive_reply_message) {
          const privateText = rule.offensive_reply_message
            .replace(/\{\{name\}\}/gi, senderName || "there")
            .replace(/\{\{first_name\}\}/gi, (senderName || "").split(" ")[0] || "there");

          await axios.post(
            `https://graph.facebook.com/${META_API_VERSION}/me/messages`,
            { recipient: { comment_id: commentId }, message: { text: privateText } },
            { headers: { Authorization: `Bearer ${integration.access_token}` } }
          ).catch(e => console.warn("Offensive DM warning:", e.response?.data || e.message));
        }

        await pool.query("UPDATE comment_automation_rules SET total_offensive_moderated = total_offensive_moderated + 1 WHERE id = ?", [rule.id]);
        emitToAgency(agencyId, "comment_automation_updated", { ruleId: rule.id, type: "OFFENSIVE_MODERATED" });
        return; // Halt further processing
      }
    }

    // 2. Check Exclude Keywords
    if (rule.exclude_keywords) {
      const excludeList = rule.exclude_keywords.split(",").map(k => k.trim().toLowerCase()).filter(Boolean);
      if (excludeList.some(k => lowerComment.includes(k))) {
        console.log(`[Comment Automation] Comment contains excluded keyword. Skipping automation.`);
        return;
      }
    }

    // 3. Check Trigger Keywords
    const triggerType = (rule.trigger_type || "ALL").toUpperCase();
    if (triggerType === "KEYWORDS" && rule.trigger_keywords) {
      const keywords = rule.trigger_keywords.split(",").map(k => k.trim().toLowerCase()).filter(Boolean);
      let matched = false;
      if ((rule.match_type || "CONTAINS").toUpperCase() === "EXACT") {
        matched = keywords.includes(lowerComment);
      } else {
        matched = keywords.some(k => lowerComment.includes(k));
      }
      if (!matched) {
        console.log(`[Comment Automation] Comment did not match required keywords "${rule.trigger_keywords}". Skipping.`);
        return;
      }
    }

    // 4. Auto-Like Comment (tries Page token, falls back to Page Owner token)
    if (rule.enable_like_comment) {
      const tokensToTry = [integration.access_token, integration.user_access_token].filter(Boolean);
      let liked = false;
      for (const tok of tokensToTry) {
        if (liked) break;
        try {
          await axios.post(
            `https://graph.facebook.com/${META_API_VERSION}/${commentId}/likes`,
            {},
            {
              headers: { Authorization: `Bearer ${tok}` },
              params: { access_token: tok },
            }
          );
          console.log(`[Comment Automation] ❤️ Auto-liked comment (${commentId})`);
          liked = true;
        } catch (e) {
          // If permission error and another token is available, loop continues
        }
      }
      if (!liked) {
        console.warn(`[Comment Automation] Could not like comment (${commentId}) due to permissions.`);
      }
    }

    // 5. Public Comment Reply (STATIC: rotating variations; AI: generated from a
    // prompt instruction + optional AI Agent — tries Page token, falls back to
    // Page Owner token either way)
    let replyText = rule.auto_reply_comment || "";
    let variations = [];
    try {
      variations = typeof rule.comment_variations === "string" ? JSON.parse(rule.comment_variations || "[]") : rule.comment_variations || [];
    } catch { variations = []; }

    if (variations.length > 0) {
      const randomVar = variations[Math.floor(Math.random() * variations.length)];
      if (randomVar) replyText = randomVar;
    }

    if ((rule.reply_mode || "STATIC").toUpperCase() === "AI") {
      replyText = await generateCommentReply({
        agencyId,
        promptInstruction: rule.ai_prompt_instruction,
        agentId: rule.ai_agent_id,
        commentText,
        senderName,
        fallbackText: replyText,
      });
    }

    if (replyText || rule.auto_reply_media_url) {
      const formattedReply = (replyText || "")
        .replace(/\{\{name\}\}/gi, senderName || "there")
        .replace(/\{\{first_name\}\}/gi, (senderName || "").split(" ")[0] || "there");

      const tokensToTry = [integration.access_token, integration.user_access_token].filter(Boolean);
      // Meta's /comments edge accepts message + attachment_url together — an
      // image can accompany (or stand in for) the text reply. Meta downloads
      // the image itself, so an uploaded file (stored as "/uploads/…") must
      // be sent as a full public link — sending the bare path made Meta
      // refuse the whole reply, text included.
      const attachmentUrl = rule.auto_reply_media_url
        ? resolvePublicImageUrl(rule.auto_reply_media_url, await getPublicBackendUrl())
        : null;

      // Tries every token, JSON body then form params; returns Meta's last error message on failure.
      const postCommentReply = async (body) => {
        let lastError = null;
        for (const tok of tokensToTry) {
          try {
            await axios.post(`https://graph.facebook.com/${META_API_VERSION}/${commentId}/comments`, body, {
              headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
              params: { access_token: tok },
            });
            return { ok: true };
          } catch (postErr) {
            lastError = postErr.response?.data?.error?.message || postErr.message;
            try {
              await axios.post(`https://graph.facebook.com/${META_API_VERSION}/${commentId}/comments`, null, { params: { ...body, access_token: tok } });
              return { ok: true };
            } catch (postErr2) {
              lastError = postErr2.response?.data?.error?.message || postErr2.message;
            }
          }
        }
        return { ok: false, error: lastError };
      };

      let sent = await postCommentReply({ message: formattedReply, ...(attachmentUrl ? { attachment_url: attachmentUrl } : {}) });
      let sentWithoutImage = false;
      if (!sent.ok && attachmentUrl && formattedReply) {
        // The image was refused (e.g. its link isn't reachable) — still send the text reply.
        console.warn(`[Comment Automation] Reply image refused for ${commentId} (${attachmentUrl}): ${sent.error} — sending the text without it`);
        sent = await postCommentReply({ message: formattedReply });
        sentWithoutImage = sent.ok;
      }

      if (sent.ok) {
        await pool.query("UPDATE comment_automation_rules SET total_comment_replies = total_comment_replies + 1 WHERE id = ?", [rule.id]);
        console.log(`[Comment Automation] ✅ Public comment reply sent on ${platform} (${commentId})${attachmentUrl && !sentWithoutImage ? " with image" : ""}: "${formattedReply}"`);
      } else {
        console.warn(`[Comment Automation] Public reply could not be sent for (${commentId}): ${sent.error}`);
      }
    }

    // 6. Private DM Reply — TEXT (today's exact behavior) or FLOW (Bot Flow,
    // capped at 2 messages, see utils/commentPrivateReplyFlow.js)
    if ((rule.private_reply_mode || "TEXT").toUpperCase() === "FLOW" && rule.flow_id) {
      const { sent } = await runPrivateReplyFlow({
        agencyId,
        flowId: rule.flow_id,
        commentId,
        senderId,
        senderName,
        integration,
      });
      if (sent > 0) {
        await pool.query("UPDATE comment_automation_rules SET total_private_replies = total_private_replies + 1 WHERE id = ?", [rule.id]);
      }
    } else if (rule.auto_reply_private_message) {
      const formattedPrivate = rule.auto_reply_private_message
        .replace(/\{\{name\}\}/gi, senderName || "there")
        .replace(/\{\{first_name\}\}/gi, (senderName || "").split(" ")[0] || "there");

      try {
        await axios.post(
          `https://graph.facebook.com/${META_API_VERSION}/me/messages`,
          { recipient: { comment_id: commentId }, message: { text: formattedPrivate } },
          { headers: { Authorization: `Bearer ${integration.access_token}` } }
        );
        await pool.query("UPDATE comment_automation_rules SET total_private_replies = total_private_replies + 1 WHERE id = ?", [rule.id]);
        console.log(`[Comment Automation] 📩 Private DM reply sent on ${platform} to ${senderName} (${commentId})`);
      } catch (e) {
        console.error("[Comment Automation] ❌ Private DM reply failed:", JSON.stringify(e.response?.data || e.message, null, 2));
      }
    }

    emitToAgency(agencyId, "comment_automation_updated", { ruleId: rule.id, type: "REPLIED" });
  } catch (err) {
    console.error("Comment automation processor error:", err);
  }
}

async function handleFacebookPayload(body, agencyId, integrationId, integration) {
  try {
    const entries = body?.entry || [];
    for (const entry of entries) {
      // 1. Check for Feed Changes (Comments on Posts)
      const changes = entry?.changes || [];
      for (const change of changes) {
        // Marketing Messages delivery / read / click / failure (utils/messengerMarketing.js).
        if (String(change.field || "").startsWith("marketing_message")) {
          await handleMarketingChange(integration, change).catch((e) => console.error("[Marketing Messages] webhook:", e.message));
          continue;
        }
        // A Messenger Utility template was approved / rejected / paused (utils/messengerUtility.js).
        if (change.field === "message_template_status_update") {
          try {
            const updated = await applyTemplateStatusUpdate(agencyId, entry.id, change.value || {});
            for (const u of updated) {
              emitToAgency(u.agency_id, "messenger_template_update", { integrationId: u.integration_id, templateId: u.id, status: u.status, reason: u.reason });
            }
          } catch (tplErr) {
            console.error("[Messenger template status] update failed:", tplErr.message);
          }
          continue;
        }
        if (change.field === "feed") {
          const val = change.value;
          if (val && val.item === "comment" && (val.verb === "add" || val.verb === "edit")) {
            await processCommentAutomation({
              commentId: val.comment_id,
              postId: val.post_id || val.parent_id,
              senderId: val.from?.id || val.sender_id,
              senderName: val.from?.name || val.sender_name || "there",
              commentText: val.message || "",
            }, "FACEBOOK", agencyId, integrationId, integration);
          }
        }
      }

      // 2. Direct Messages
      const messaging = entry?.messaging || [];
      for (const event of messaging) {
        // Someone opted in to (or out of) Marketing Messages — keep their subscription token.
        if (event.optin?.type === "notification_messages") {
          await handleOptinEvent(integration, event).catch((e) => console.error("[Marketing Messages] opt-in:", e.message));
          continue;
        }
        // Delivery/read receipts — Messenger reports these as separate
        // `delivery`/`read` events on the same `messaging` array, not as a
        // `statuses` array like WhatsApp. `delivery` carries the specific
        // message ids delivered; `read` only carries a watermark timestamp
        // (Meta's own semantics: "every message sent at or before this time
        // has been read"), so that branch sweeps this contact's un-read
        // outbound messages up to the watermark rather than targeting one id.
        if (event.delivery) {
          const mids = Array.isArray(event.delivery.mids) ? event.delivery.mids : [];
          for (const mid of mids) {
            const [[delivered]] = await pool.query("SELECT id FROM messages WHERE external_msg_id = ? LIMIT 1", [mid]);
            if (delivered) await trackMessageReceipt(delivered.id, "delivered"); // sets delivered_at once + flow analytics
            await markBroadcastLogStatus(mid, "DELIVERED");
          }
          continue;
        }
        if (event.read?.watermark) {
          try {
            const senderId = event.sender?.id;
            const [readRows] = await pool.query(
              `SELECT m.id, m.external_msg_id FROM messages m
               JOIN conversations c ON c.id = m.conversation_id
               JOIN contacts ct ON ct.id = c.contact_id
               WHERE ct.external_id = ? AND m.direction = 'OUTBOUND' AND m.read_at IS NULL
                 AND m.created_at <= FROM_UNIXTIME(? / 1000)`,
              [senderId, event.read.watermark]
            );
            for (const r of readRows) {
              await trackMessageReceipt(r.id, "read"); // sets read_at once + flow analytics
              if (r.external_msg_id) await markBroadcastLogStatus(r.external_msg_id, "READ");
            }
          } catch (readErr) {
            console.error("[Messenger read watermark] failed:", readErr.message);
          }
          continue;
        }

        // Opened the chat from a growth link (m.me/…?ref=gl_…) in an existing
        // thread: Meta sends only a referral event (utils/growthLinks.js).
        if (!event.message && !event.postback && event.referral && extractMetaLinkRef(event)) {
          await handleLinkReferralEvent({ event, agencyId, integrationId, integration, platform: "FACEBOOK" });
          continue;
        }
        if (!event.message && !event.postback) continue;
        if (event.message?.is_echo) continue;

        const externalId = event.sender?.id;
        let externalMsgId = event.message?.mid || event.timestamp?.toString();
        let msgBody = "";
        let msgType = "TEXT";
        let mediaUrl = null;
        let buttonRoute = null; // raw postback/quick_reply payload, checked for our own routing token
        let storyEvent = null;

        if (event.postback) {
          msgBody = event.postback.title || event.postback.payload || "";
          buttonRoute = event.postback.payload || null;
        } else {
          buttonRoute = event.message?.quick_reply?.payload || null;
          // Shares (post / reel), story mentions and story replies get readable text (utils/storyReplies.js).
          const parsed = parseMetaMessage(event.message);
          msgBody = parsed.msgBody;
          msgType = parsed.msgType;
          mediaUrl = parsed.mediaUrl;
          storyEvent = parsed.storyEvent;
        }

        // Fetch real subscriber name, profile pic & system fields from Facebook Graph API
        let senderName = externalId;
        let avatar = null;
        let platformProfile = null;
        if (integration?.access_token) {
          const profile = await fetchMetaUserProfile("FACEBOOK", externalId, integration.access_token);
          if (profile.name) senderName = profile.name;
          if (profile.avatar) avatar = profile.avatar;
          platformProfile = profile.systemFields;
        }

        await handleIncomingPayload({
          agencyId,
          integrationId,
          platform: "FACEBOOK",
          externalId,
          externalMsgId,
          msgType,
          buttonRoute,
          msgBody,
          mediaUrl,
          senderName,
          avatar,
          platformProfile,
          integration,
          storyEvent,
          adReferral: extractMetaReferral(event),
          linkRef: extractMetaLinkRef(event),
        });
      }
    }
  } catch (err) {
    console.error("Facebook Webhook processing error:", err);
  }
}

/**
 * Messenger / Instagram "opened the chat from a growth link" in a thread that
 * already exists: a referral-only event, no message. Kept as a small note in
 * the Inbox and handled like an arrival (count, label, the link's flow).
 */
async function handleLinkReferralEvent({ event, agencyId, integrationId, integration, platform }) {
  const externalId = event.sender?.id;
  if (!externalId || (platform === "INSTAGRAM" && String(externalId) === String(integration?.ig_account_id))) return;
  let senderName = externalId;
  let avatar = null;
  let platformProfile = null;
  if (integration?.access_token) {
    const profile = await fetchMetaUserProfile(platform, externalId, integration.access_token);
    if (profile.name) senderName = profile.name;
    if (profile.avatar) avatar = profile.avatar;
    platformProfile = profile.systemFields;
  }
  await handleIncomingPayload({
    agencyId,
    integrationId,
    platform,
    externalId,
    externalMsgId: `ref-${platform}-${externalId}-${event.timestamp || Date.now()}`,
    msgType: "TEXT",
    buttonRoute: null,
    msgBody: "🔗 Opened the chat from a link",
    mediaUrl: null,
    senderName,
    avatar,
    platformProfile,
    integration,
    linkRef: extractMetaLinkRef(event),
    referralOnly: true,
  });
}

async function handleInstagramPayload(body, agencyId, integrationId, integration) {
  try {
    const entries = body?.entry || [];
    for (const entry of entries) {
      // 1. Check for Instagram Comments Changes
      const changes = entry?.changes || [];
      for (const change of changes) {
        if (change.field === "comments") {
          const val = change.value;
          if (val && val.id) {
            await processCommentAutomation({
              commentId: val.id,
              postId: val.media?.id,
              senderId: val.from?.id,
              senderName: val.from?.username || "there",
              commentText: val.text || "",
            }, "INSTAGRAM", agencyId, integrationId, integration);
          }
        }
      }

      // 2. Direct Messages
      const messaging = entry?.messaging || [];
      for (const event of messaging) {
        // Opened the chat from a growth link (ig.me/m/…?ref=gl_…) — a referral-only event.
        if (!event.message && !event.postback && event.referral && extractMetaLinkRef(event)) {
          await handleLinkReferralEvent({ event, agencyId, integrationId, integration, platform: "INSTAGRAM" });
          continue;
        }
        if (!event.message && !event.postback) continue;
        // Our own messages echoed back — never a customer message (the bot would answer itself).
        if (event.message?.is_echo || (event.sender?.id && String(event.sender.id) === String(integration?.ig_account_id))) continue;

        const externalId = event.sender?.id;
        let externalMsgId = event.message?.mid || event.timestamp?.toString();
        let msgBody = "";
        let msgType = "TEXT";
        let mediaUrl = null;
        let buttonRoute = null;
        let storyEvent = null;

        if (event.postback) {
          msgBody = event.postback.title || event.postback.payload || "";
          buttonRoute = event.postback.payload || null;
        } else {
          buttonRoute = event.message?.quick_reply?.payload || null;
          // Shares (post / reel), story mentions and story replies get readable text (utils/storyReplies.js).
          const parsed = parseMetaMessage(event.message);
          msgBody = parsed.msgBody;
          msgType = parsed.msgType;
          mediaUrl = parsed.mediaUrl;
          storyEvent = parsed.storyEvent;
        }

        // Fetch subscriber name, profile pic & system fields from Instagram
        let senderName = externalId;
        let avatar = null;
        let platformProfile = null;
        if (integration?.access_token) {
          const profile = await fetchMetaUserProfile("INSTAGRAM", externalId, integration.access_token);
          if (profile.name) senderName = profile.name;
          if (profile.avatar) avatar = profile.avatar;
          platformProfile = profile.systemFields;
        }

        await handleIncomingPayload({
          agencyId,
          integrationId,
          platform: "INSTAGRAM",
          externalId,
          externalMsgId,
          msgType,
          buttonRoute,
          msgBody,
          mediaUrl,
          senderName,
          avatar,
          platformProfile,
          integration,
          storyEvent,
          adReferral: extractMetaReferral(event),
          linkRef: extractMetaLinkRef(event),
        });
      }
    }
  } catch (err) {
    console.error("Instagram Webhook processing error:", err);
  }
}

// ─── RECEIVE META INCOMING MESSAGES (POST) ──────────────────────────────────
router.post("/webhook/:agencyId/:integrationId", async (req, res) => {
  const { agencyId, integrationId } = req.params;
  const body = req.body;

  if (!(await verifyMetaSignature(req))) {
    console.warn(`[Webhook Signature] Rejected unsigned/invalid POST to /webhook/${agencyId}/${integrationId}`);
    return res.status(401).send("Invalid signature");
  }

  // Always respond 200 immediately to Meta
  res.sendStatus(200);

  try {
    const [integRows] = await pool.query(
      "SELECT * FROM integrations WHERE id = ? AND agency_id = ? AND is_active = 1",
      [integrationId, agencyId]
    );
    if (!integRows.length) return;
    const integration = integRows[0];

    if (integration.platform === "WHATSAPP") {
      return handleWhatsAppPayload(body, agencyId, integrationId, integration);
    } else if (integration.platform === "FACEBOOK") {
      return handleFacebookPayload(body, agencyId, integrationId, integration);
    } else if (integration.platform === "INSTAGRAM") {
      return handleInstagramPayload(body, agencyId, integrationId, integration);
    }
  } catch (err) {
    console.error("Meta Webhook processing error:", err);
  }
});

// ─── PROCESS TELEGRAM UPDATE (SHARED BY WEBHOOK & POLLER) ────────────────────
export async function processTelegramUpdate(agencyId, integrationId, update) {
  try {
    const [integRows] = await pool.query(
      "SELECT * FROM integrations WHERE id = ? AND agency_id = ? AND is_active = 1",
      [integrationId, agencyId]
    );
    if (!integRows.length) return;
    const integration = integRows[0];

    // Group management (utils/telegramGroups.js): anything from a group or
    // supergroup — the bot joining / leaving, members, join requests, group
    // messages and captcha taps — never becomes a subscriber or an Inbox chat.
    if (await handleTelegramGroupUpdate(integration, update)) return;

    // Telegram Stars: confirm the order is still payable (Telegram waits max 10s).
    if (update.pre_checkout_query) {
      await answerPreCheckout(integration, update.pre_checkout_query);
      return;
    }
    // A vote on a Telegram Poll element (utils/telegramPolls.js) — saved to the subscriber's field.
    if (update.poll_answer) {
      const { handlePollAnswer } = await import("../utils/telegramPolls.js");
      const result = await handlePollAnswer(integration, update.poll_answer);
      if (result?.conversationId) emitToAgency(agencyId, "poll_answer", { conversationId: result.conversationId, ...result });
      return;
    }
    // Telegram Business: a Premium user connected / changed / disconnected this bot.
    if (update.business_connection) {
      await upsertBusinessConnection(integration, update.business_connection);
      return;
    }

    // A business chat (the owner's customer) is its own subscriber, "bc:<connection>:<chat>" (utils/telegramBusiness.js).
    let businessConn = null;
    if (update.business_message) {
      businessConn = await resolveBusinessMessage(integration, update.business_message);
      if (!businessConn) return;
      update.message = update.business_message;
    }

    // A customer ticked tasks on a checklist the bot sent (utils/telegramChecklists.js).
    if (update.message?.checklist_tasks_done && businessConn) {
      const { handleChecklistTasksDone } = await import("../utils/telegramChecklists.js");
      const chatId = String(update.message.chat?.id || "");
      await handleChecklistTasksDone(integration, businessExternalId(businessConn.id, chatId), update.message.checklist_tasks_done)
        .catch((e) => console.error("[Telegram checklist] update:", e.message));
      return;
    }
    if (update.message?.checklist_tasks_added) return; // tasks added by the customer — nothing to do

    // A paid (or refunded) Stars invoice — services/chatPaymentService.js confirms and continues the flow.
    if (update.message?.successful_payment) {
      await handleStarsPayment(integration, update.message);
      return;
    }
    if (update.message?.refunded_payment) {
      const orderId = orderIdFromInvoicePayload(update.message.refunded_payment.invoice_payload);
      if (orderId) {
        await pool.query(
          "UPDATE chat_orders SET status = 'REFUNDED', refunded_at = COALESCE(refunded_at, NOW()) WHERE id = ? AND agency_id = ? AND provider = 'TELEGRAM_STARS'",
          [orderId, agencyId]
        );
      }
      return;
    }

    const messageObj = update.message || update.callback_query?.message;
    if (!messageObj) return;

    const rawChatId = (messageObj.chat?.id || update.message?.from?.id || update.callback_query?.from?.id)?.toString();
    if (!rawChatId) return;
    // A button tapped in a business chat carries the connection on its message.
    const connId = businessConn?.id || update.callback_query?.message?.business_connection_id || null;
    const externalId = connId ? businessExternalId(connId, rawChatId) : rawChatId;

    const externalMsgId = (update.message?.message_id || update.callback_query?.id || `tg_${Date.now()}`)?.toString();

    let msgBody = "";
    let msgType = "TEXT";
    let mediaUrl = null;

    if (update.callback_query) {
      msgBody = update.callback_query.data || "";
      // Answer callback query so Telegram UI stops spinning
      if (integration.access_token && update.callback_query.id) {
        fetch(`https://api.telegram.org/bot${integration.access_token}/answerCallbackQuery?callback_query_id=${update.callback_query.id}`)
          .catch(() => {});
      }
    } else if (update.message) {
      msgBody = update.message.text || "";
      if (update.message.photo && update.message.photo.length > 0) {
        msgType = "IMAGE";
        msgBody = update.message.caption || "[Photo]";
      } else if (update.message.document) {
        msgType = "DOCUMENT";
        msgBody = update.message.caption || update.message.document.file_name || "[Document]";
      }
    }

    const fromObj = update.message?.from || update.callback_query?.from;
    const senderName = fromObj
      ? `${fromObj.first_name || ""} ${fromObj.last_name || ""}`.trim() || fromObj.username || externalId
      : externalId;

    let avatar = null;
    if (fromObj?.id && integration.access_token) {
      avatar = await fetchTelegramUserProfilePhoto(fromObj.id, integration.access_token);
    }

    // Telegram's own Bot API User object already carries these — no extra call needed
    // (https://core.telegram.org/bots/api#user).
    const platformProfile = fromObj ? {
      username: fromObj.username || null,
      language_code: fromObj.language_code || null,
      is_premium: fromObj.is_premium ?? null,
      // Telegram Business: this chat is with a business account's customer, answered on its behalf.
      business_account: connId ? (businessConn?.tg_user_name || true) : null,
    } : null;

    console.log(`📩 [Telegram Incoming] From: ${senderName} (${externalId}) Avatar: ${avatar ? 'Found' : 'None'} Msg: "${msgBody}"`);

    await handleIncomingPayload({
      agencyId,
      integrationId,
      platform: "TELEGRAM",
      externalId,
      externalMsgId,
      msgType,
      buttonRoute: update.callback_query?.data || null,
      msgBody,
      mediaUrl,
      senderName,
      avatar,
      platformProfile,
      integration,
    });
  } catch (err) {
    console.error("Telegram processing error:", err);
  }
}

// ─── RECEIVE TELEGRAM INCOMING MESSAGES (POST) ──────────────────────────────
router.post("/webhook/telegram/:agencyId/:integrationId", async (req, res) => {
  const agencyId = Number(req.params.agencyId);
  const integrationId = Number(req.params.integrationId);
  // Only Telegram knows the bot's webhook secret (utils/webhookAuth.js); anything
  // else is a forged update. The bot must also belong to the workspace in the URL.
  const [[bot]] = await pool.query(
    `SELECT tb.bot_token FROM telegram_bots tb JOIN integrations i ON i.id = tb.integration_id
     WHERE tb.integration_id = ? AND i.agency_id = ? AND tb.is_active = 1`,
    [integrationId, agencyId]
  );
  if (!bot || !isValidTelegramSecret(req.get("X-Telegram-Bot-Api-Secret-Token"), integrationId, bot.bot_token)) {
    console.warn(`[Webhook Signature] Rejected Telegram update without a valid secret for /webhook/telegram/${agencyId}/${integrationId}`);
    return res.status(401).send("Invalid secret");
  }
  res.sendStatus(200);
  await processTelegramUpdate(agencyId, integrationId, req.body);
});

// ─── TIKTOK WEBHOOK VERIFICATION (GET) ───────────────────────────
router.get(["/webhook/tiktok/:agencyId", "/webhook/tiktok/:agencyId/:integrationId"], async (req, res) => {
  const challenge = req.query.challenge || req.query["hub.challenge"] || req.query.echostr;
  const token = req.query.token || req.query["hub.verify_token"];
  console.log(`[TikTok Webhook] Verification on /webhook/tiktok/${req.params.agencyId}:`, { challenge, token });

  if (challenge) {
    return res.send(challenge);
  }
  return res.json({ status: "ok", message: "TikTok webhook endpoint ready" });
});

// ─── RECEIVE TIKTOK INCOMING EVENTS (POST) ───────────────────────
router.post(["/webhook/tiktok/:agencyId", "/webhook/tiktok/:agencyId/:integrationId"], async (req, res) => {
  const agencyId = Number(req.params.agencyId);
  // TikTok signs every event with the app's client secret — the workspace's
  // own TikTok app, or the reseller's / platform's it falls back to.
  const app = await resolveTikTokAppSettings(agencyId).catch(() => null);
  if (!app?.client_secret || !isValidTikTokSignature(req.rawBody, req.get("Tiktok-Signature"), app.client_secret)) {
    console.warn(`[Webhook Signature] Rejected TikTok event without a valid signature for /webhook/tiktok/${agencyId}`);
    return res.status(401).json({ status: "invalid signature" });
  }
  res.status(200).json({ status: "ok" });

  try {
    let integrationId = req.params.integrationId ? Number(req.params.integrationId) : null;

    let [integs] = [];
    if (integrationId) {
      [integs] = await pool.query("SELECT * FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'TIKTOK'", [integrationId, agencyId]);
    }
    // The event names the Business Account it belongs to (user_openid) — match that one.
    const payloadAccount = req.body?.user_openid || req.body?.business_id || null;
    if ((!integs || !integs.length) && payloadAccount) {
      [integs] = await pool.query("SELECT * FROM integrations WHERE agency_id = ? AND platform = 'TIKTOK' AND tiktok_open_id = ? AND is_active = 1 LIMIT 1", [agencyId, payloadAccount]);
    }
    if (!integs || !integs.length) {
      [integs] = await pool.query("SELECT * FROM integrations WHERE agency_id = ? AND platform = 'TIKTOK' AND is_active = 1 LIMIT 1", [agencyId]);
    }
    const integration = integs?.[0] || null;
    if (!integration) return;
    integrationId = integration.id;

    // Business Messaging event (utils/tiktokBusiness.js). The subscriber's id is the
    // TikTok conversation id — that is what a reply is addressed to.
    const { parseTikTokEvent } = await import("../utils/tiktokBusiness.js");
    const evt = parseTikTokEvent(req.body || {});
    if (!evt || !evt.externalId || (!evt.body && !evt.buttonRoute)) return;

    await handleIncomingPayload({
      agencyId,
      integrationId,
      platform: "TIKTOK",
      externalId: String(evt.externalId),
      externalMsgId: evt.messageId || `tt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      msgType: evt.msgType,
      buttonRoute: evt.buttonRoute,
      msgBody: evt.body,
      senderName: evt.senderName || "TikTok User",
      avatar: evt.avatar,
      platformProfile: { tiktok_user_id: evt.senderId || null, referral: evt.referral || null },
      integration,
    });
  } catch (err) {
    console.error("[TikTok Webhook processing error]:", err);
  }
});

/**
 * Handle incoming message payload, process flows, match bot rules, and notify socket
 */
// Message kinds a No match reply answers (a reaction, call or system event never does).
const NO_MATCH_TYPES = new Set(["TEXT", "IMAGE", "VIDEO", "AUDIO", "VOICE", "DOCUMENT", "FILE", "STICKER", "LOCATION", "CONTACTS"]);

async function handleIncomingPayload({
  agencyId,
  integrationId,
  platform,
  externalId,
  externalMsgId,
  msgType,
  msgBody,
  buttonRoute = null,
  mediaUrl,
  senderName,
  avatar = null,
  platformProfile = null,
  integration,
  waIdentity = null,
  storyEvent = null,
  adReferral = null,
  linkRef = null, // Messenger / Instagram growth link ref ("gl_<code>")
  referralOnly = false, // only "opened the chat from a link" — no customer message to answer
}) {
  try {
    // 1. Prevent duplicate messages
    const isDup = await isDuplicateMessage(externalMsgId);
    if (isDup) return;

    // 2. Find or create contact with real name, avatar & any extra "System Fields"
    // the channel's own API can tell us (see contacts.platform_profile)
    const contact = await findOrCreateContact(
      agencyId,
      platform,
      externalId,
      senderName,
      platform === "WHATSAPP" && !isBsuid(externalId) ? externalId : null,
      avatar,
      platformProfile
    );
    if (waIdentity) {
      await attachWhatsAppIdentity(agencyId, contact.id, waIdentity).catch((e) => console.error("[WA Identity] attach:", e.message));
    }

    // 2b. A blocked subscriber's messages are dropped here, before any
    // conversation is touched or reopened, any bot/AI runs, or any agent is
    // notified — see migrate_block_subscriber.js.
    if (contact.is_blocked) return;

    // 2c. A 1–5 answer to a pending rating question (utils/inboxQuality.js) is
    // filed into the resolved chat it rates — it must not open a new chat.
    if (msgType === "TEXT" && !buttonRoute) {
      const csat = await handleCsatReply({ agencyId, integrationId, contactId: contact.id, text: msgBody }).catch(() => null);
      if (csat) {
        const [[ratedConv]] = await pool.query("SELECT * FROM conversations WHERE id = ?", [csat.conversation_id]);
        if (ratedConv) {
          const saved = await saveMessage(ratedConv.id, "INBOUND", msgType, msgBody, externalMsgId, mediaUrl, { csatRating: csat.rating });
          emitToAgency(agencyId, "new_message", { conversationId: ratedConv.id, message: saved });
          const { csatThanks } = await getInboxSettings(agencyId);
          if (csatThanks) {
            const { sendMsg } = await import("../utils/flowEngine.js");
            await sendMsg(agencyId, ratedConv, csatThanks, "TEXT", integration).catch(() => {});
          }
          // The rating is the last word — the chat isn't waiting for an answer.
          await pool.query("UPDATE conversations SET awaiting_reply_since = NULL WHERE id = ?", [ratedConv.id]);
          return;
        }
      }
    }

    // 3. Find or create conversation
    const { conversation, isNew } = await findOrCreateConversation(agencyId, contact.id, integrationId, platform, contact._overLimit);
    // Automatic assignment of a new chat, when the workspace uses it (never blocks the message).
    if (isNew) autoAssign({ agencyId, conversationId: conversation.id, integration, trigger: "NEW" });

    // 4. Save incoming message with mediaUrl
    const message = await saveMessage(conversation.id, "INBOUND", msgType, msgBody, externalMsgId, mediaUrl);
    // Voice message → text in the background when "transcribe automatically" is on (utils/transcribe.js).
    if (msgType === "AUDIO") {
      getInboxSettings(agencyId)
        .then((s) => (s.autoTranscribe ? transcribeMessage(agencyId, message.id) : null))
        .catch((e) => console.warn("[Transcribe] auto:", e.message));
    }

    const socketMsg = { ...message };
    if (socketMsg.media_url && socketMsg.media_url.includes("lookaside.fbsbx.com")) {
      socketMsg.media_url = `/api/v1/media/whatsapp/${message.id}`;
    }

    // Emit socket event to notify agents of new message/conversation
    emitToAgency(agencyId, "new_message", {
      conversationId: conversation.id,
      message: socketMsg,
    });
    emitToConversation(conversation.id, "new_message", {
      conversationId: conversation.id,
      message: socketMsg,
    });
    notifyAssigneeOfInbound(conversation.id, message); // browser push, background

    if (isNew) {
      emitToAgency(agencyId, "new_conversation", {
        conversation,
      });
    }

    // Opt-out / opt-in keywords ("STOP" / "START", utils/optOut.js) — always
    // honoured, even with a paused bot or an expired plan.
    if (msgType === "TEXT" && !buttonRoute && platform !== "WEBCHAT") {
      const opted = await handleOptKeywords({ agencyId, integration, conversation, contact, text: msgBody })
        .catch((e) => { console.error("[Opt-out] error:", e.message); return false; });
      if (opted) return;
    }

    // Quick Actions (utils/quickActions.js): a tapped Chat with Human / Chat with
    // Robot / Unsubscribe / Resubscribe button, or a Chat with Human / Robot
    // keyword. Before the paused-bot checks — "Chat with bot" must work while a
    // person has the chat — and before the expired-plan gate, like opt-out.
    if (platform !== "TIKTOK") {
      const quick = await handleQuickActionInbound({ agencyId, platform, integration, conversation, contact, text: msgBody, buttonRoute, msgType })
        .catch((e) => { console.error("[Quick Action] error:", e.message); return false; });
      if (quick) return;
    }

    // Expired plan → read-only (utils/subscriptionStatus.js): the message is kept
    // and shown in the Inbox, but no bot, AI or automation answers it.
    if (await isWorkspaceExpired(agencyId)) return;

    // Click-to-chat ad (utils/adReferrals.js): record it; a flow chosen for this ad answers first.
    if (adReferral) {
      await recordAdReferral({ agencyId, integrationId, platform, contact, conversationId: conversation.id, referral: adReferral })
        .catch((e) => console.error("[Ads] record referral:", e.message));
      if (!conversation.bot_paused && !contact.bot_paused) {
        const adFlowId = await flowForAd(agencyId, integrationId, adReferral.sourceId).catch(() => null);
        if (adFlowId) {
          const [[flow]] = await pool.query("SELECT * FROM flows WHERE id = ? AND agency_id = ?", [adFlowId, agencyId]);
          if (flow) {
            const started = await startFlowForConversation({ agencyId, flow, conversation, contact, integration, platform })
              .catch((e) => { console.error("[Ads] ad flow:", e.message); return false; });
            if (started) return;
          }
        }
      }
    }

    // Growth link (utils/growthLinks.js): counted, labelled, and its flow answers first.
    const growthCode = extractGrowthCode({ platform, text: msgType === "TEXT" && !buttonRoute ? msgBody : "", metaRef: linkRef });
    if (growthCode) {
      const started = await handleGrowthLinkArrival({ agencyId, integration, platform, conversation, contact, code: growthCode })
        .catch((e) => { console.error("[Growth] link arrival:", e.message); return false; });
      if (started) return;
    }
    // Only "opened the chat from a link": nothing else should reply to it.
    if (referralOnly) return;

    // 4-. Messenger / Instagram Get Started, ice breaker or persistent-menu tap
    // (utils/messengerProfile.js). Paused bot (a person is handling the chat)
    // → the tap just shows in the Inbox.
    if ((platform === "FACEBOOK" || platform === "INSTAGRAM") && isProfilePayload(buttonRoute)) {
      if (conversation.bot_paused || contact.bot_paused) return;
      const handled = await handleProfilePostback({ agencyId, platform, integration, conversation, contact, route: buttonRoute })
        .catch((e) => { console.error("[Messenger Profile] postback error:", e.message); return true; });
      if (handled) return;
    }
    // Story mention / story reply automation (utils/storyReplies.js).
    if (storyEvent && (platform === "FACEBOOK" || platform === "INSTAGRAM") && !conversation.bot_paused && !contact.bot_paused) {
      const handled = await handleStoryEvent({ agencyId, platform, integration, conversation, contact, kind: storyEvent })
        .catch((e) => { console.error("[Stories] error:", e.message); return false; });
      if (handled) return;
    }
    // WhatsApp / Telegram: an ice breaker or "/command" arrives as plain text.
    if ((platform === "WHATSAPP" || platform === "TELEGRAM") && msgType === "TEXT" && !buttonRoute && !conversation.bot_paused && !contact.bot_paused) {
      const handled = await handleTextTrigger({ agencyId, platform, integration, conversation, contact, text: msgBody })
        .catch((e) => { console.error("[Bot Profile] text trigger error:", e.message); return false; });
      if (handled) return;
    }

    // 4a. Store automation: COD Confirm / Cancel tap (utils/commerceEvents.js).
    // Handled whatever the business hours — the customer is answering us.
    if ((platform === "WHATSAPP" || platform === "FACEBOOK") && isCommerceButton(buttonRoute)) {
      const handled = await handleCommerceButton({ agencyId, buttonRoute, contact, conversation, integration });
      if (handled) return;
    }

    // 4b. Business Hours (Bot Manager → Bot Settings → Business Hours) — a no-op
    // (bh.enabled === false) unless the bot's own schedule says so. An already
    // in-progress flow session is never affected by any of this; see the note
    // on findMatchingFlow's suppressNewTrigger in utils/flowEngine.js.
    const bh = await getBusinessHoursStatus(agencyId, integration?.id);
    const offHours = bh.enabled && !bh.withinHours;
    const allowBotNow = !offHours || bh.allowBotReplies;
    const allowAiNow = !offHours || bh.allowAiReplies;

    // Paused bot: flows, rules and AI all stay silent — record why in the Bot Error Log.
    await logBotPausedSkip({ agencyId, platform, conversation, contact, integration, contactIdentifier: externalId });

    // 4c. Interactive Appointment Booking Engine (WhatsApp & Omnichannel)
    const aptRan = allowBotNow && await handleAppointmentBooking(agencyId, platform, conversation, contact, msgBody, integration, msgType, buttonRoute);
    if (aptRan) return;

    // 5. Run Flow Execution Engine
    const flowRan = await processFlow(agencyId, platform, conversation, contact, msgBody, integration, msgType, buttonRoute, null, {
      suppressNewTrigger: offHours && !allowBotNow,
      offHoursFlowId: offHours ? bh.offHoursFlowId : null,
    });
    if (flowRan) return;

    // 6. AI Reply in "Always trigger" mode gets first refusal, ahead of
    // simple keyword Bot Rules (a no-op unless this bot's AI Reply trigger
    // mode is actually set to ALWAYS — see utils/aiReplyEngine.js).
    const aiRanEarly = allowAiNow && await runAIReply(agencyId, platform, conversation, contact, msgBody, integration, msgType, "always");
    if (aiRanEarly) return;

    // 7. Fallback: Run standard bot rules
    const ruleRan = allowBotNow && await matchBotRules(agencyId, platform, conversation, contact, msgBody, integration, msgType);
    if (ruleRan) return;

    // 8. AI Reply in "Only when nothing else matches" mode (the default) —
    // also a no-op if AI Replies aren't enabled on this bot at all.
    const aiRan = allowAiNow && await runAIReply(agencyId, platform, conversation, contact, msgBody, integration, msgType, "fallback");
    if (aiRan) return;

    // 9. Nothing answered: the bot account's No match reply (Quick Actions).
    // Not for a tapped button that simply leads nowhere, or non-message events.
    if (allowBotNow && !buttonRoute && NO_MATCH_TYPES.has(String(msgType || "TEXT").toUpperCase())) {
      await runNoMatchReply({ agencyId, platform, integration, conversation, contact })
        .catch((err) => console.error("[Quick Action] no-match reply:", err.message));
    }
  } catch (err) {
    console.error("[Webhook Incoming Payload Error]:", err);
    await logBotError({
      agencyId,
      integrationId,
      platform,
      contactIdentifier: externalId,
      error: err,
      customMessage: `Incoming message processing failed: ${extractErrorMessage(err)}`,
    });
  }
}

export default router;

