import express from "express";
import pool from "../db.js";
import { processFlow } from "../utils/flowEngine.js";
import {
  findOrCreateContact,
  findOrCreateConversation,
  isDuplicateMessage,
  saveMessage,
  matchBotRules,
} from "../utils/messageProcessor.js";
import { emitToAgency, emitToConversation } from "../utils/socket.js";

const router = express.Router();

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

  try {
    // Check in meta_app_settings first
    const [metaRows] = await pool.query(
      "SELECT verify_token FROM meta_app_settings WHERE agency_id = ? AND is_active = 1",
      [req.params.agencyId]
    );

    let expectedToken = metaRows[0]?.verify_token;

    // Fallback: check integrations for this agency
    if (!expectedToken) {
      const [integRows] = await pool.query(
        "SELECT verify_token FROM integrations WHERE agency_id = ? AND is_active = 1 LIMIT 1",
        [req.params.agencyId]
      );
      expectedToken = integRows[0]?.verify_token;
    }

    if (mode === "subscribe" && token && expectedToken && token === expectedToken) {
      console.log("✅ Meta Agency Webhook verified for agency:", req.params.agencyId);
      return res.status(200).send(challenge);
    }

    // Also accept if mode is subscribe and token matches global env or query
    if (mode === "subscribe" && token && token === process.env.META_VERIFY_TOKEN) {
      console.log("✅ Meta Agency Webhook verified via global token for agency:", req.params.agencyId);
      return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
  } catch (err) {
    console.error("Agency Webhook verification error:", err);
    return res.sendStatus(500);
  }
});

// ─── INTEGRATION LEVEL WEBHOOK VERIFICATION (GET) ────────────────────────────
router.get("/webhook/:agencyId/:integrationId", async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  try {
    const [rows] = await pool.query(
      "SELECT verify_token FROM integrations WHERE id = ? AND agency_id = ? AND is_active = 1",
      [req.params.integrationId, req.params.agencyId]
    );

    if (!rows.length) return res.sendStatus(404);

    if (mode === "subscribe" && token === rows[0].verify_token) {
      console.log("✅ Webhook verified for integration:", req.params.integrationId);
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  } catch (err) {
    console.error("Webhook verification error:", err);
    return res.sendStatus(500);
  }
});

// ─── RECEIVE META INCOMING MESSAGES VIA AGENCY WEBHOOK (POST) ────────────────
router.post("/webhook/:agencyId", async (req, res) => {
  const { agencyId } = req.params;
  const body = req.body;

  // Always respond 200 immediately to Meta
  res.sendStatus(200);

  try {
    // 1. Check if WhatsApp payload
    const waEntry = body?.entry?.[0]?.changes?.[0]?.value;
    const waPhoneId = waEntry?.metadata?.phone_number_id;

    if (waPhoneId) {
      const [waRows] = await pool.query(
        "SELECT * FROM integrations WHERE (wa_phone_number_id = ? OR wa_business_acc_id = ?) AND agency_id = ? AND is_active = 1 LIMIT 1",
        [waPhoneId, waPhoneId, agencyId]
      );
      const integration = waRows[0] || (await pool.query(
        "SELECT * FROM integrations WHERE agency_id = ? AND platform = 'WHATSAPP' AND is_active = 1 LIMIT 1",
        [agencyId]
      ))[0]?.[0];

      if (integration) {
        return handleWhatsAppPayload(body, agencyId, integration.id, integration);
      }
    }

    // 2. Check if Facebook / Instagram payload
    const fbEntry = body?.entry?.[0];
    const pageOrIgId = fbEntry?.id;

    if (pageOrIgId) {
      const [fbRows] = await pool.query(
        "SELECT * FROM integrations WHERE (fb_page_id = ? OR ig_account_id = ?) AND agency_id = ? AND is_active = 1 LIMIT 1",
        [pageOrIgId, pageOrIgId, agencyId]
      );
      const integration = fbRows[0] || (await pool.query(
        "SELECT * FROM integrations WHERE agency_id = ? AND platform IN ('FACEBOOK','INSTAGRAM') AND is_active = 1 LIMIT 1",
        [agencyId]
      ))[0]?.[0];

      if (integration) {
        if (integration.platform === "FACEBOOK") {
          return handleFacebookPayload(body, agencyId, integration.id, integration);
        } else if (integration.platform === "INSTAGRAM") {
          return handleInstagramPayload(body, agencyId, integration.id, integration);
        }
      }
    }
  } catch (err) {
    console.error("Agency Webhook POST processing error:", err);
  }
});

// ─── RECEIVE META INCOMING MESSAGES (POST) ──────────────────────────────────
router.post("/webhook/:agencyId/:integrationId", async (req, res) => {
  const { agencyId, integrationId } = req.params;
  const body = req.body;

  // Always respond 200 immediately to Meta
  res.sendStatus(200);

  try {
    const [integRows] = await pool.query(
      "SELECT * FROM integrations WHERE id = ? AND agency_id = ? AND is_active = 1",
      [integrationId, agencyId]
    );
    if (!integRows.length) return;
    const integration = integRows[0];

// ─── PAYLOAD HANDLERS ────────────────────────────────────────────────────────
async function handleWhatsAppPayload(body, agencyId, integrationId, integration) {
  try {
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages || messages.length === 0) return;

    for (const msg of messages) {
      const externalId = msg.from; // sender's WA phone number
      const externalMsgId = msg.id;
      const msgType = (msg.type || "text").toUpperCase();

      let msgBody = "";
      if (msg.type === "text") {
        msgBody = msg.text?.body || "";
      } else if (msg.type === "button") {
        msgBody = msg.button?.text || "";
      } else if (msg.type === "interactive") {
        const type = msg.interactive?.type;
        if (type === "button_reply") {
          msgBody = msg.interactive?.button_reply?.title || "";
        } else if (type === "list_reply") {
          msgBody = msg.interactive?.list_reply?.title || "";
        }
      } else {
        msgBody = msg.image?.caption || msg.video?.caption || msg.document?.filename || (msg.audio ? "[Audio]" : "[Media]");
      }

      const senderName = value?.contacts?.[0]?.profile?.name || externalId;

      await handleIncomingPayload({
        agencyId,
        integrationId,
        platform: "WHATSAPP",
        externalId,
        externalMsgId,
        msgType: msgType === "INTERACTIVE" || msgType === "BUTTON" ? "TEXT" : msgType,
        msgBody,
        senderName,
        integration,
      });
    }
  } catch (err) {
    console.error("WhatsApp Webhook processing error:", err);
  }
}

async function handleFacebookPayload(body, agencyId, integrationId, integration) {
  try {
    const entries = body?.entry || [];
    for (const entry of entries) {
      const messaging = entry?.messaging || [];
      for (const event of messaging) {
        if (!event.message && !event.postback) continue;

        const externalId = event.sender?.id;
        let externalMsgId = event.message?.mid || event.timestamp?.toString();
        let msgBody = "";
        let msgType = "TEXT";

        if (event.postback) {
          msgBody = event.postback.title || event.postback.payload || "";
        } else {
          msgBody = event.message?.text || "[Attachment]";
          msgType = event.message?.attachments ? "IMAGE" : "TEXT";
        }

        await handleIncomingPayload({
          agencyId,
          integrationId,
          platform: "FACEBOOK",
          externalId,
          externalMsgId,
          msgType,
          msgBody,
          senderName: externalId,
          integration,
        });
      }
    }
  } catch (err) {
    console.error("Facebook Webhook processing error:", err);
  }
}

async function handleInstagramPayload(body, agencyId, integrationId, integration) {
  try {
    const entries = body?.entry || [];
    for (const entry of entries) {
      const messaging = entry?.messaging || [];
      for (const event of messaging) {
        if (!event.message && !event.postback) continue;

        const externalId = event.sender?.id;
        let externalMsgId = event.message?.mid || event.timestamp?.toString();
        let msgBody = "";
        let msgType = "TEXT";

        if (event.postback) {
          msgBody = event.postback.title || event.postback.payload || "";
        } else {
          msgBody = event.message?.text || "[Attachment]";
          msgType = event.message?.attachments ? "IMAGE" : "TEXT";
        }

        await handleIncomingPayload({
          agencyId,
          integrationId,
          platform: "INSTAGRAM",
          externalId,
          externalMsgId,
          msgType,
          msgBody,
          senderName: externalId,
          integration,
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
      await handleWhatsAppPayload(body, agencyId, integrationId, integration);
    } else if (integration.platform === "FACEBOOK") {
      await handleFacebookPayload(body, agencyId, integrationId, integration);
    } else if (integration.platform === "INSTAGRAM") {
      await handleInstagramPayload(body, agencyId, integrationId, integration);
    }
  } catch (err) {
    console.error("Meta Webhook processing error:", err);
  }
});

// ─── RECEIVE TELEGRAM INCOMING MESSAGES (POST) ──────────────────────────────
router.post("/webhook/telegram/:agencyId/:integrationId", async (req, res) => {
  const { agencyId, integrationId } = req.params;
  const update = req.body;

  // Always respond 200 immediately to Telegram
  res.sendStatus(200);

  try {
    const [integRows] = await pool.query(
      "SELECT * FROM integrations WHERE id = ? AND agency_id = ? AND is_active = 1",
      [integrationId, agencyId]
    );
    if (!integRows.length) return;
    const integration = integRows[0];

    const messageObj = update.message || update.callback_query?.message;
    if (!messageObj) return;

    const externalId = messageObj.chat?.id?.toString();
    const externalMsgId = (update.message?.message_id || update.callback_query?.id)?.toString();
    
    let msgBody = "";
    let msgType = "TEXT";

    if (update.callback_query) {
      msgBody = update.callback_query.data || "";
    } else {
      msgBody = update.message?.text || "";
      if (update.message?.photo) {
        msgType = "IMAGE";
        msgBody = update.message.caption || "[Photo]";
      }
    }

    const senderName = update.message?.from?.first_name || update.callback_query?.from?.first_name || externalId;

    await handleIncomingPayload({
      agencyId,
      integrationId,
      platform: "TELEGRAM",
      externalId,
      externalMsgId,
      msgType,
      msgBody,
      senderName,
      integration,
    });
  } catch (err) {
    console.error("Telegram Webhook processing error:", err);
  }
});

/**
 * Handle incoming message payload, process flows, match bot rules, and notify socket
 */
async function handleIncomingPayload({
  agencyId,
  integrationId,
  platform,
  externalId,
  externalMsgId,
  msgType,
  msgBody,
  senderName,
  integration,
}) {
  // 1. Prevent duplicate messages
  const isDup = await isDuplicateMessage(externalMsgId);
  if (isDup) return;

  // 2. Find or create contact
  const contact = await findOrCreateContact(agencyId, platform, externalId, senderName, platform === "WHATSAPP" ? externalId : null);

  // 3. Find or create conversation
  const { conversation, isNew } = await findOrCreateConversation(agencyId, contact.id, integrationId, platform);

  // 4. Save incoming message
  const message = await saveMessage(conversation.id, "INBOUND", msgType, msgBody, externalMsgId);

  // Emit socket event to notify agents of new message/conversation
  emitToAgency(agencyId, "new_message", {
    conversationId: conversation.id,
    message,
  });
  emitToConversation(conversation.id, "new_message", {
    conversationId: conversation.id,
    message,
  });

  if (isNew) {
    emitToAgency(agencyId, "new_conversation", {
      conversation,
    });
  }

  // 5. Run Flow Execution Engine
  const flowRan = await processFlow(agencyId, platform, conversation, contact, msgBody, integration);
  if (flowRan) return;

  // 6. Fallback: Run standard bot rules
  await matchBotRules(agencyId, platform, conversation, contact, msgBody, integration);
}

export default router;
