import axios from "axios";
import pool from "../db.js";
import { GRAPH_URL } from "./metaApi.js";
import { emitToAgency } from "./socket.js";
import { findOrCreateContact, saveMessage, isDuplicateMessage } from "./messageProcessor.js";
import { findOrCreateConversationForBroadcast } from "./broadcastRunner.js";
import { resolveWhatsAppSender } from "./whatsappIdentity.js";

/**
 * Coexistence: a number that stays on the WhatsApp Business app while also
 * connected here (Embedded Signup "WhatsApp Business app" onboarding).
 *  - right after onboarding, Meta must be asked (within 24 h) to share the
 *    app's contacts and chat history: POST /<PHONE_NUMBER_ID>/smb_app_data
 *    with sync_type smb_app_state_sync and history.
 *  - webhooks: `history` (past chats, up to 180 days, in phases),
 *    `smb_app_state_sync` (contacts added / changed / removed in the app),
 *    `smb_message_echoes` (what the business sends from the phone app) —
 *    all filed into the normal subscribers and conversations, never
 *    triggering bots or reopening chats.
 * Throughput on a coexistence number is fixed at 20 messages / second.
 */

export async function requestCoexistenceSync(integration) {
  const results = {};
  for (const syncType of ["smb_app_state_sync", "history"]) {
    try {
      await axios.post(`${GRAPH_URL}/${integration.wa_phone_number_id}/smb_app_data`,
        { messaging_product: "whatsapp", sync_type: syncType },
        { headers: { Authorization: `Bearer ${integration.access_token}`, "Content-Type": "application/json" } });
      results[syncType] = "requested";
    } catch (e) {
      results[syncType] = e.response?.data?.error?.message || e.message;
    }
  }
  await pool.query("UPDATE integrations SET wa_history_sync_requested_at = NOW() WHERE id = ?", [integration.id]);
  return results;
}

function bodyOf(m) {
  const type = String(m.type || "text");
  if (type === "text") return m.text?.body || "";
  if (type === "media_placeholder") return "[media]";
  const obj = m[type] || {};
  return obj.caption || obj.filename || obj.body || `[${type}]`;
}
const typeOf = (m) => ({ image: "IMAGE", video: "VIDEO", audio: "AUDIO", document: "DOCUMENT" }[m.type] || "TEXT");

async function contactAndConversation(agencyId, integration, customerPhone, name = null) {
  const who = await resolveWhatsAppSender({ agencyId, integrationId: integration.id, phone: customerPhone });
  if (!who.externalId) return null;
  const contact = await findOrCreateContact(agencyId, "WHATSAPP", who.externalId, name || who.externalId, who.externalId);
  const conversation = await findOrCreateConversationForBroadcast(agencyId, contact.id, integration.id);
  return { contact, conversation };
}

/** smb_message_echoes: a message the business sent from the WhatsApp Business app. */
export async function handleMessageEchoes(agencyId, integration, echoes = []) {
  for (const e of echoes) {
    if (!e?.to || !e.id || ["revoke", "edit"].includes(e.type)) continue;
    if (await isDuplicateMessage(e.id)) continue;
    const pair = await contactAndConversation(agencyId, integration, e.to);
    if (!pair) continue;
    const message = await saveMessage(pair.conversation.id, "OUTBOUND", typeOf(e), bodyOf(e), e.id, null, {
      senderType: "AGENT", senderName: "WhatsApp Business app", source: "WA_BUSINESS_APP",
    });
    await pool.query("UPDATE conversations SET last_message_at = NOW() WHERE id = ?", [pair.conversation.id]);
    emitToAgency(agencyId, "new_message", { conversationId: pair.conversation.id, message });
  }
}

/** history: past chats from the phone app, filed with their real times. */
export async function handleHistory(agencyId, integration, history = []) {
  let imported = 0;
  for (const chunk of history) {
    if (chunk?.errors?.length) {
      emitToAgency(agencyId, "whatsapp_history_sync", { integrationId: integration.id, error: chunk.errors[0].message || chunk.errors[0].title });
      continue;
    }
    for (const thread of chunk?.threads || []) {
      const customer = String(thread.id || "");
      if (!customer) continue;
      const pair = await contactAndConversation(agencyId, integration, customer);
      if (!pair) continue;
      let lastAt = null;
      let lastInboundAt = null;
      for (const m of thread.messages || []) {
        if (!m?.id || await isDuplicateMessage(m.id)) continue;
        const inbound = String(m.from || "") === customer;
        const at = new Date(Number(m.timestamp) * 1000 || Date.now());
        await pool.query(
          `INSERT INTO messages (conversation_id, direction, type, body, metadata, external_msg_id, is_read, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
          [pair.conversation.id, inbound ? "INBOUND" : "OUTBOUND", typeOf(m), bodyOf(m),
            JSON.stringify({ source: "WA_BUSINESS_APP_HISTORY", ...(inbound ? {} : { senderType: "AGENT", senderName: "WhatsApp Business app" }) }),
            m.id, at]
        );
        imported += 1;
        if (!lastAt || at > lastAt) lastAt = at;
        if (inbound && (!lastInboundAt || at > lastInboundAt)) lastInboundAt = at;
      }
      if (lastAt) {
        // Past chats are history, not customers waiting now.
        await pool.query(
          `UPDATE conversations SET last_message_at = GREATEST(COALESCE(last_message_at, ?), ?),
                  last_inbound_at = CASE WHEN ? IS NULL THEN last_inbound_at ELSE GREATEST(COALESCE(last_inbound_at, ?), ?) END,
                  awaiting_reply_since = NULL
            WHERE id = ?`,
          [lastAt, lastAt, lastInboundAt, lastInboundAt, lastInboundAt, pair.conversation.id]
        );
      }
    }
    emitToAgency(agencyId, "whatsapp_history_sync", { integrationId: integration.id, phase: chunk?.metadata?.phase, progress: chunk?.metadata?.progress });
  }
  return imported;
}

/** smb_app_state_sync: contacts saved in the phone app. */
export async function handleStateSync(agencyId, integration, items = []) {
  for (const item of items) {
    const c = item?.contact;
    const phone = String(c?.phone_number || "").replace(/[^0-9]/g, "");
    if (!phone || item.action === "remove") continue;
    const name = c.full_name || c.first_name || null;
    const who = await resolveWhatsAppSender({ agencyId, integrationId: integration.id, phone });
    const contact = await findOrCreateContact(agencyId, "WHATSAPP", who.externalId || phone, name || phone, phone);
    if (name && (!contact.name || contact.name === phone)) {
      await pool.query("UPDATE contacts SET name = ? WHERE id = ?", [name, contact.id]);
    }
  }
}
