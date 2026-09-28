import pool from "../db.js";

/**
 * Per-channel "can we send an automated message to this contact right now"
 * evaluator — used by utils/sequenceRunner.js before every scheduled
 * Sequence step send. Rules researched against each platform's own 2026
 * policy docs (see the Sequence Messages plan for sources/reasoning):
 *
 *  - WhatsApp: 24h customer-service window from the contact's last inbound
 *    message. Outside it, only a pre-approved Template (routes/templates.js /
 *    the `whatsapp_templates` table) can go out.
 *  - Messenger / Instagram: 24h window. The automated message tags
 *    (ACCOUNT_UPDATE, POST_PURCHASE_UPDATE, CONFIRMED_EVENT_UPDATE) were
 *    removed on 27 Apr 2026. Messenger's replacement is the Utility template
 *    (utils/messengerUtility.js, element type `messengerTemplate`) — always
 *    allowed. Instagram has nothing automated outside the window. HUMAN_AGENT
 *    (7 days) is for a person in the Inbox only, never automation, so it is
 *    not considered here.
 *  - Telegram / Webchat: no messaging-window concept at all.
 *  - TikTok: 48h window AND a hard cap of 10 consecutive outbound messages
 *    since the contact's last inbound one — a budget, not a template system.
 *
 * Returns { allowed: boolean, reason?: string, useTemplate?: {name, language} }.
 * `useTemplate` is only ever set for the WhatsApp-outside-window case, and
 * only when the linked template needs no dynamic variables — see the note in
 * platformSender.js's `whatsappTemplate` handling.
 */
export async function canSendNow(platform, conversationId, agencyId, node) {
  const p = (platform || "").toUpperCase();

  if (p === "TELEGRAM" || p === "WEBCHAT") {
    return { allowed: true };
  }

  const [lastInboundRows] = await pool.query(
    `SELECT MAX(created_at) AS last_inbound FROM messages WHERE conversation_id = ? AND direction = 'INBOUND'`,
    [conversationId]
  );
  const lastInboundAt = lastInboundRows[0]?.last_inbound ? new Date(lastInboundRows[0].last_inbound) : null;
  const hoursSinceInbound = lastInboundAt ? (Date.now() - lastInboundAt.getTime()) / 3_600_000 : Infinity;

  if (p === "WHATSAPP") {
    if (hoursSinceInbound <= 24) return { allowed: true };
    // A Message Template element IS an approved template — always allowed.
    if (node?.type === "whatsappTemplate") return { allowed: true };

    const templateId = node?.data?.whatsappTemplateId;
    if (!templateId) {
      return { allowed: false, reason: "Outside the 24-hour window and no WhatsApp Template selected for this step" };
    }
    const [tplRows] = await pool.query(
      `SELECT * FROM whatsapp_templates WHERE id = ? AND agency_id = ? AND status = 'APPROVED'`,
      [templateId, agencyId]
    );
    if (!tplRows.length) {
      return { allowed: false, reason: "Linked WhatsApp Template is missing or not approved" };
    }
    return { allowed: true, useTemplate: { name: tplRows[0].template_name, language: tplRows[0].language } };
  }

  if (p === "FACEBOOK" || p === "INSTAGRAM") {
    if (hoursSinceInbound <= 24) return { allowed: true };
    // A Utility Template element IS the outside-window message for Messenger.
    if (p === "FACEBOOK" && node?.type === "messengerTemplate") return { allowed: true };
    return {
      allowed: false,
      reason: p === "FACEBOOK"
        ? "Outside Messenger's 24-hour window — only a Utility Template element can be sent now"
        : "Outside Instagram's 24-hour window — Instagram has no automated message for this",
    };
  }

  if (p === "TIKTOK") {
    if (hoursSinceInbound > 48) {
      return { allowed: false, reason: "Outside TikTok's 48-hour messaging window" };
    }
    const [sentSinceRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM messages WHERE conversation_id = ? AND direction = 'OUTBOUND' AND created_at > ?`,
      [conversationId, lastInboundAt || new Date(0)]
    );
    if ((sentSinceRows[0]?.cnt || 0) >= 10) {
      return { allowed: false, reason: "TikTok's 10-message budget since the subscriber's last reply is used up" };
    }
    return { allowed: true };
  }

  return { allowed: true };
}
