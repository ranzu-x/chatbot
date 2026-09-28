import pool from "../db.js";
import { emitToAgency, emitToConversation } from "./socket.js";
import { findOrCreateContact, findOrCreateConversation, saveMessage } from "./messageProcessor.js";
import { resolveWhatsAppSender, attachWhatsAppIdentity, isBsuid } from "./whatsappIdentity.js";
import { sendPlatformMessage } from "./platformSender.js";
import { isWorkspaceExpired } from "./subscriptionStatus.js";

/**
 * WhatsApp Calling webhooks (field `calls`) — both directions.
 *
 * Business-initiated (the Inbox's Call button, routes/whatsappCalls.js):
 * `connect` carries Meta's SDP answer, `terminate` ends it.
 *
 * User-initiated (a customer taps the call icon / a call button / a
 * wa.me/call link): `connect` carries the customer's SDP offer. We create the
 * subscriber + conversation if needed, store a RINGING call and ring every
 * agent of the workspace (`whatsapp_incoming_call`). The first agent to
 * answer claims it (routes/whatsappCalls.js POST /calls/:id/accept). Meta
 * gives about 30–60 seconds before it gives up and sends `terminate`.
 *
 * A call — answered or not — opens/refreshes the 24-hour customer service
 * window (Meta's calling pricing docs), so it is logged in the conversation
 * as an INBOUND entry when it ends ("📞 Missed call" / "📞 Call · 3:12").
 */

function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function logCallInConversation(call, { direction, body }) {
  if (!call.conversation_id) return;
  const message = await saveMessage(call.conversation_id, direction, "TEXT", body, null, null, {
    callLog: true, callId: call.id, callDirection: call.direction, callStatus: call.status,
    senderType: direction === "OUTBOUND" ? "AGENT" : undefined,
  });
  if (direction === "INBOUND") {
    await pool.query(
      "UPDATE conversations SET last_message_at = NOW(), last_inbound_at = NOW(), unread_count = unread_count + 1, status = IF(status = 'RESOLVED', 'OPEN', status) WHERE id = ?",
      [call.conversation_id]
    );
  } else {
    await pool.query("UPDATE conversations SET last_message_at = NOW() WHERE id = ?", [call.conversation_id]);
  }
  emitToAgency(call.agency_id, "new_message", { conversationId: call.conversation_id, message });
  emitToConversation(call.conversation_id, "new_message", { conversationId: call.conversation_id, message });
}

async function sendMissedCallReply(call) {
  try {
    const [[prefs]] = await pool.query("SELECT * FROM whatsapp_call_prefs WHERE integration_id = ?", [call.integration_id]);
    const text = prefs?.missed_call_reply_enabled ? String(prefs.missed_call_reply || "").trim() : "";
    if (!text || !call.conversation_id) return;
    const [[row]] = await pool.query(
      `SELECT i.*, c.external_id AS contact_external_id FROM integrations i
       JOIN contacts c ON c.id = ? WHERE i.id = ? AND i.agency_id = ?`,
      [call.contact_id, call.integration_id, call.agency_id]
    );
    if (!row) return;
    const externalMsgId = await sendPlatformMessage("WHATSAPP", row, row.contact_external_id, { type: "TEXT", body: text });
    const message = await saveMessage(call.conversation_id, "OUTBOUND", "TEXT", text, externalMsgId, null, { senderType: "BOT", senderName: "Missed call reply" });
    emitToAgency(call.agency_id, "new_message", { conversationId: call.conversation_id, message });
    emitToConversation(call.conversation_id, "new_message", { conversationId: call.conversation_id, message });
  } catch (err) {
    console.error("[WA Calling] missed-call reply failed:", err.response?.data || err.message);
  }
}

async function handleIncomingConnect(callObj, ctx) {
  const { agencyId, integrationId, integration, contacts } = ctx;
  const [[already]] = await pool.query("SELECT id FROM whatsapp_calls WHERE wacid = ? LIMIT 1", [callObj.id]);
  if (already) return;

  const profile = (contacts || []).find((c) => (callObj.from && c.wa_id === callObj.from) || (callObj.from_user_id && c.user_id === callObj.from_user_id)) || contacts?.[0];
  const identity = await resolveWhatsAppSender({
    agencyId,
    integrationId,
    phone: callObj.from,
    userId: callObj.from_user_id || profile?.user_id,
    parentUserId: callObj.from_parent_user_id,
    username: profile?.profile?.username,
  });
  if (!identity.externalId) return;
  const name = profile?.profile?.name || profile?.profile?.username || identity.externalId;
  const contact = await findOrCreateContact(agencyId, "WHATSAPP", identity.externalId, name, isBsuid(identity.externalId) ? null : identity.externalId);
  await attachWhatsAppIdentity(agencyId, contact.id, identity.identity).catch(() => {});
  if (contact.is_blocked) {
    console.log(`[WA Calling] Ignoring call from blocked subscriber ${contact.id}`);
    return;
  }
  const { conversation } = await findOrCreateConversation(agencyId, contact.id, integrationId, "WHATSAPP", contact._overLimit);

  const [ins] = await pool.query(
    `INSERT INTO whatsapp_calls (agency_id, integration_id, conversation_id, contact_id, caller_number, wacid, direction, status,
                                 sdp_offer, cta_payload, deeplink_payload)
     VALUES (?, ?, ?, ?, ?, ?, 'USER_INITIATED', 'RINGING', ?, ?, ?)`,
    [
      agencyId, integrationId, conversation.id, contact.id, callObj.from || null, callObj.id,
      callObj.session?.sdp || null,
      callObj.cta_payload ? String(callObj.cta_payload).slice(0, 512) : null,
      callObj.deeplink_payload ? String(callObj.deeplink_payload).slice(0, 512) : null,
    ]
  );
  if (await isWorkspaceExpired(agencyId)) return; // expired plan: no ringing, the call ends as missed
  emitToAgency(agencyId, "whatsapp_incoming_call", {
    callDbId: ins.insertId,
    wacid: callObj.id,
    contactId: contact.id,
    contactName: contact.name || name,
    conversationId: conversation.id,
    integrationId,
    integrationName: integration?.name || null,
    payload: callObj.cta_payload || callObj.deeplink_payload || null,
  });
}

/** One entry of a webhook's `calls` array. */
export async function handleWhatsAppCallEvent(callObj, ctx = {}) {
  const wacid = callObj?.id;
  const event = callObj?.event; // "connect" | "terminate"
  if (!wacid || !event) return;
  try {
    const [[call]] = await pool.query("SELECT * FROM whatsapp_calls WHERE wacid = ? LIMIT 1", [wacid]);

    if (event === "connect") {
      if (!call && (callObj.direction === "USER_INITIATED" || callObj.session?.sdp_type === "offer")) {
        if (ctx.agencyId && ctx.integrationId) await handleIncomingConnect(callObj, ctx);
        return;
      }
      if (!call) return;
      const sdpAnswer = callObj.session?.sdp;
      if (!sdpAnswer || call.direction !== "BUSINESS_INITIATED") return;
      await pool.query("UPDATE whatsapp_calls SET status = 'CONNECTED', sdp_answer = ?, connected_at = NOW() WHERE id = ?", [sdpAnswer, call.id]);
      emitToAgency(call.agency_id, "whatsapp_call_answer", { callDbId: call.id, wacid, sdpAnswer });
      return;
    }

    if (event === "terminate" && call) {
      const wasAnswered = Boolean(call.connected_at) || ["CONNECTED", "ACCEPTED"].includes(call.status) || Number(callObj.duration) > 0;
      const metaStatus = String(callObj.status || "").toUpperCase(); // "COMPLETED" | "FAILED"
      let finalStatus;
      if (call.direction === "USER_INITIATED") finalStatus = wasAnswered ? "COMPLETED" : (call.status === "REJECTED" ? "REJECTED" : "MISSED");
      else finalStatus = metaStatus === "COMPLETED" ? "COMPLETED" : (call.status === "REJECTED" ? "REJECTED" : "FAILED");
      const duration = typeof callObj.duration === "number" ? callObj.duration : (call.duration_seconds ?? null);
      const reason = callObj.errors?.[0]?.message || callObj.errors?.message || null;
      await pool.query(
        "UPDATE whatsapp_calls SET status = ?, duration_seconds = ?, ended_at = COALESCE(ended_at, NOW()), end_reason = COALESCE(?, end_reason) WHERE id = ?",
        [finalStatus, duration, reason, call.id]
      );
      const updated = { ...call, status: finalStatus, duration_seconds: duration };
      emitToAgency(call.agency_id, "whatsapp_call_terminated", { callDbId: call.id, wacid, status: finalStatus, duration });

      if (call.direction === "USER_INITIATED") {
        await logCallInConversation(updated, {
          direction: "INBOUND",
          body: finalStatus === "COMPLETED" ? `📞 WhatsApp call · ${fmtDuration(duration)}` : "📞 Missed WhatsApp call",
        });
        if (finalStatus === "MISSED") await sendMissedCallReply(updated);
      } else {
        await logCallInConversation(updated, {
          direction: "OUTBOUND",
          body: finalStatus === "COMPLETED" ? `📞 Outgoing WhatsApp call · ${fmtDuration(duration)}` : "📞 Outgoing WhatsApp call — not answered",
        });
      }
    }
  } catch (err) {
    console.error("[WA Calling] call event webhook error:", err.message);
  }
}

/** `account_settings_update` with phone_number_settings — someone changed call settings (maybe in WhatsApp Manager). */
export function handleCallSettingsUpdate(agencyId, integrationId, value) {
  if (value?.type !== "phone_number_settings" || !value.phone_number_settings?.calling) return;
  emitToAgency(agencyId, "whatsapp_call_settings_updated", { integrationId, calling: value.phone_number_settings.calling });
}
