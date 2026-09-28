import axios from "axios";

/**
 * TikTok Business Messaging API (TikTok API for Business, v1.3). Every call is
 * made with the account's access token in the `Access-Token` header and the
 * Business Account's id (`integrations.tiktok_open_id`) as `business_id`.
 * TikTok answers HTTP 200 with `code != 0` on errors — `call` turns that into
 * a thrown error with TikTok's own message.
 *
 * Endpoints (checked against the official docs + TikTok's Go SDK):
 *   POST business/message/send/                 (recipient = conversation id)
 *   GET  business/message/auto_message/get/     POST .../create/ .../update/ .../delete/ .../status/update/
 *   GET  business/message/direct_reply/get/     POST .../direct_reply/update/   (Comment-to-Message)
 */
const BASE = (process.env.TIKTOK_BUSINESS_API_BASE || "https://business-api.tiktok.com/open_api/v1.3").replace(/\/+$/, "");

export const AUTO_MESSAGE_TYPES = ["WELCOME_MESSAGE", "SUGGESTED_QUESTION", "CHAT_PROMPT"];
// Limits TikTok documents for the in-app editor (Help Center); longer text is refused by TikTok.
export const TIKTOK_LIMITS = { welcome: 250, question: 80, answer: 200 };

export async function tiktokCall(integration, method, path, data) {
  if (!integration?.access_token) throw new Error("This TikTok account has no access token — reconnect it.");
  const res = await axios({
    method,
    url: `${BASE}/${path}`,
    headers: { "Access-Token": integration.access_token, "Content-Type": "application/json" },
    ...(method === "GET" ? { params: data } : { data }),
    timeout: 15000,
    validateStatus: () => true,
  });
  const body = res.data || {};
  if (res.status >= 400 || (body.code !== undefined && Number(body.code) !== 0)) {
    const err = new Error(body.message || `TikTok answered HTTP ${res.status}`);
    err.code = "TIKTOK_API_ERROR";
    err.tiktokCode = body.code;
    throw err;
  }
  return body.data || {};
}

const businessId = (integration) => integration.tiktok_open_id;

/** The request body for business/message/send/. Buttons become a reply-button card. */
export function buildTikTokSend(integration, conversationId, { body = "", buttons = [], senderAction = null } = {}) {
  const base = { business_id: businessId(integration), recipient_type: "CONVERSATION", recipient: String(conversationId) };
  if (senderAction) return { ...base, message_type: "SENDER_ACTION", sender_action: senderAction };
  const replyButtons = (buttons || []).filter((b) => b && (b.type || "POSTBACK") !== "URL").slice(0, 3);
  if (replyButtons.length) {
    return {
      ...base,
      message_type: "TEMPLATE",
      template: {
        type: "QA_BUTTON_CARD",
        title: String(body || "Choose an option").slice(0, 200),
        buttons: replyButtons.map((b, i) => ({ type: "REPLY", title: String(b.title || `Option ${i + 1}`).slice(0, 20), id: String(b.payload || b.id || `btn_${i}`).slice(0, 256) })),
      },
    };
  }
  return { ...base, message_type: "TEXT", text: { body: String(body) } };
}

export async function sendTikTokMessage(integration, conversationId, message) {
  const data = await tiktokCall(integration, "POST", "business/message/send/", buildTikTokSend(integration, conversationId, message));
  return data?.message?.message_id || null;
}

/**
 * Normalises an incoming Business Messaging webhook event. `content` arrives
 * as a JSON string. Returns null for events that aren't a customer's message
 * (e.g. our own sends echoed back).
 */
export function parseTikTokEvent(payload = {}) {
  let content = payload.content ?? payload.data ?? {};
  if (typeof content === "string") {
    try { content = JSON.parse(content); } catch { content = { text: content }; }
  }
  const businessAccount = payload.user_openid || payload.business_id || null;
  const conversationId = content.conversation_id || payload.conversation_id || null;
  const from = content.from_user?.id || content.from || content.sender_id || content.from_user_id || null;
  const fromRole = String(content.from_user?.role || content.sender_role || "").toUpperCase();
  if (fromRole === "BUSINESS" || (from && businessAccount && String(from) === String(businessAccount))) return null;

  const type = String(content.type || content.message_type || "text").toLowerCase();
  const text = typeof content.text === "string" ? content.text : (content.text?.body || content.content || content.message || "");
  const buttonReply = content.button_reply || content.template_reply || null; // tap on a reply button
  let msgType = "TEXT";
  let body = text;
  if (type === "image") { msgType = "IMAGE"; body = text || "[Image]"; }
  else if (type === "video") { msgType = "VIDEO"; body = text || "[Video]"; }
  else if (type === "share_post") { body = text || `[Shared a TikTok post${content.share_post?.embed_url ? `: ${content.share_post.embed_url}` : ""}]`; }
  if (buttonReply) body = buttonReply.title || body;

  return {
    externalId: conversationId || from,
    conversationId,
    senderId: from,
    messageId: content.message_id || payload.message_id || null,
    msgType,
    body: body || "",
    buttonRoute: buttonReply?.id || null,
    senderName: content.from_user?.display_name || content.nickname || payload.nickname || null,
    avatar: content.from_user?.avatar_url || content.avatar_url || null,
    referral: content.referral || content.source || null,
  };
}

// ─── AUTOMATIC MESSAGES + COMMENT-TO-MESSAGE ─────────────────────────────────
export async function getAutoMessages(integration) {
  const out = {};
  for (const type of AUTO_MESSAGE_TYPES) {
    const data = await tiktokCall(integration, "GET", "business/message/auto_message/get/", { business_id: businessId(integration), auto_message_type: type });
    out[type] = { enabled: data.operation_status === "ENABLE", items: data.auto_messages || [] };
  }
  return out;
}

function autoMessageBody(type, input) {
  if (type === "WELCOME_MESSAGE") {
    const content = String(input.content || "").trim();
    if (!content) throw Object.assign(new Error("The welcome message is empty"), { status: 400 });
    if (content.length > TIKTOK_LIMITS.welcome) throw Object.assign(new Error(`The welcome message can be at most ${TIKTOK_LIMITS.welcome} characters`), { status: 400 });
    return { welcome_message: { content } };
  }
  if (type === "SUGGESTED_QUESTION") {
    const question = String(input.question || "").trim();
    const answer = String(input.answer || "").trim();
    if (!question || !answer) throw Object.assign(new Error("Enter both the question and its answer"), { status: 400 });
    if (question.length > TIKTOK_LIMITS.question) throw Object.assign(new Error(`A question can be at most ${TIKTOK_LIMITS.question} characters`), { status: 400 });
    if (answer.length > TIKTOK_LIMITS.answer) throw Object.assign(new Error(`An answer can be at most ${TIKTOK_LIMITS.answer} characters`), { status: 400 });
    return { suggested_question: { question, answer } };
  }
  if (type === "CHAT_PROMPT") {
    const title = String(input.title || "").trim();
    const content = String(input.content || "").trim();
    if (!title || !content) throw Object.assign(new Error("Enter both the prompt title and the message it sends"), { status: 400 });
    return { chat_prompt: { title, content } };
  }
  throw Object.assign(new Error("Unknown automatic message type"), { status: 400 });
}

export async function saveAutoMessage(integration, type, input, autoMessageId = null) {
  const body = { business_id: businessId(integration), auto_message_type: type, ...autoMessageBody(type, input) };
  if (autoMessageId) return tiktokCall(integration, "POST", "business/message/auto_message/update/", { ...body, auto_message_id: String(autoMessageId) });
  return tiktokCall(integration, "POST", "business/message/auto_message/create/", body);
}

export async function deleteAutoMessage(integration, type, autoMessageId) {
  if (type === "WELCOME_MESSAGE") throw Object.assign(new Error("The welcome message can be turned off, not deleted"), { status: 400 });
  return tiktokCall(integration, "POST", "business/message/auto_message/delete/", { business_id: businessId(integration), auto_message_type: type, auto_message_id: String(autoMessageId) });
}

export async function setAutoMessageStatus(integration, type, enabled) {
  return tiktokCall(integration, "POST", "business/message/auto_message/status/update/", { business_id: businessId(integration), auto_message_type: type, operation_status: enabled ? "ENABLE" : "DISABLE" });
}

export async function getCommentToMessage(integration) {
  const data = await tiktokCall(integration, "GET", "business/message/direct_reply/get/", { business_id: businessId(integration), direct_reply_type: "COMMENT_TO_MESSAGE" });
  return data.operation_status === "ENABLE";
}

export async function setCommentToMessage(integration, enabled) {
  return tiktokCall(integration, "POST", "business/message/direct_reply/update/", { business_id: businessId(integration), direct_reply_type: "COMMENT_TO_MESSAGE", operation_status: enabled ? "ENABLE" : "DISABLE" });
}
