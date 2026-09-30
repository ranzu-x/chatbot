import pool from "../db.js";
import { resolveCapability } from "./aiProviders/registry.js";
import { ProviderCallError } from "./aiProviders/errors.js";
import { assertLimit } from "./entitlements.js";

/**
 * AI help for the person answering a chat in the Inbox (never sends anything):
 *   suggestReplies  three short replies to pick from, grounded in the bot's AI
 *                   agent knowledge when it has some
 *   summarize       a few bullets: what the customer wants, what happened, what's open
 *
 * Uses the workspace's configured AI provider (same as AI Rewrite / AI
 * replies). Tokens count towards the plan's monthly AI tokens: each call is
 * logged in ai_message_logs (input_type assist_*, no agent — so it never shows
 * up in an agent's Answer Review).
 */
const HISTORY_LIMIT = 40;
const MAX_CHARS_PER_MESSAGE = 1000;

export class AssistError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

/** The chat as plain text lines (oldest first), newest HISTORY_LIMIT messages. */
export async function loadTranscript(conversationId) {
  const [rows] = await pool.query(
    `SELECT direction, type, body, media_caption, transcript, created_at,
            JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.senderType')) AS senderType
       FROM messages WHERE conversation_id = ?
      ORDER BY created_at DESC, id DESC LIMIT ?`,
    [conversationId, HISTORY_LIMIT]
  );
  return rows.reverse().map((m) => {
    const who = m.direction === "INBOUND" ? "Customer" : (m.senderType === "AGENT" ? "Team" : "Bot");
    let text = String(m.transcript || m.body || m.media_caption || "").trim();
    if (!text && m.type && m.type !== "TEXT") text = `[${String(m.type).toLowerCase()}]`;
    if (m.type === "AUDIO" && m.transcript) text = `(voice) ${m.transcript}`;
    return text ? `${who}: ${text.slice(0, MAX_CHARS_PER_MESSAGE)}` : null;
  }).filter(Boolean);
}

async function knowledgeFor(agencyId, integrationId, question) {
  if (!integrationId || !question) return null;
  const [[settings]] = await pool.query("SELECT default_agent_id FROM ai_reply_settings WHERE integration_id = ?", [integrationId]);
  if (!settings?.default_agent_id) return null;
  const [[agent]] = await pool.query("SELECT id FROM ai_agents WHERE id = ? AND agency_id = ?", [settings.default_agent_id, agencyId]).catch(() => [[null]]);
  if (!agent) return null;
  const { buildKnowledgeContext } = await import("./aiReplyEngine.js");
  return buildKnowledgeContext(agencyId, agent.id, question, null);
}

async function generate(agencyId, userId, messages, maxTokens, { feature, conversation } = {}) {
  try {
    await assertLimit(agencyId, "max_ai_tokens_per_month", 0, userId);
  } catch (err) {
    throw new AssistError(err.status || 403, err.message, err.code || "LIMIT_EXCEEDED");
  }
  const resolved = await resolveCapability(agencyId, "text_generation", null, {
    feature, userId, conversationId: conversation?.id || null, integrationId: conversation?.integration_id || null,
  });
  if (!resolved) {
    throw new AssistError(403, "The platform's AI isn't set up yet — please contact support.", "AI_NOT_CONFIGURED");
  }
  const started = Date.now();
  let result;
  try {
    result = await resolved.adapter.generate({ apiKey: resolved.apiKey, model: resolved.model, messages, maxTokens });
  } catch (err) {
    // Show the provider's own reason (out of credit, bad key, model not found…)
    // instead of a generic "didn't answer" — the person can't fix what they can't see.
    if (err instanceof ProviderCallError) {
      console.error(`[Inbox assist] ${err.providerId}: ${err.message}`);
      throw new AssistError(502, `The AI provider (${resolved.providerId || err.providerId}) refused the request: ${err.message}`, "AI_PROVIDER_ERROR");
    }
    // Not enough AI credits (utils/aiCredits) — checked before the provider was called.
    if (err?.name === "AiCreditError") throw new AssistError(err.status || 402, err.message, err.code);
    throw err;
  }
  return { text: String(result?.text || "").trim(), usage: result?.usage, resolved, latencyMs: Date.now() - started };
}

async function logUsage({ agencyId, conversation, inputType, out }) {
  const tokens = (out.usage?.inputTokens || 0) + (out.usage?.outputTokens || 0);
  await pool.query(
    `INSERT INTO ai_message_logs (agency_id, conversation_id, integration_id, agent_id, provider_used, model_used, input_type, tokens_used, latency_ms)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
    [agencyId, conversation.id, conversation.integration_id || null, out.resolved.providerId || null, out.resolved.model || null, inputType, tokens || null, out.latencyMs]
  ).catch((err) => console.error("[Inbox assist] usage log:", err.message));
}

/** Pulls the replies out of the model's answer: a JSON array/object, else one reply per line. */
export function parseSuggestions(text) {
  const raw = String(text || "").trim();
  const tryJson = (s) => { try { return JSON.parse(s); } catch { return null; } };
  let parsed = tryJson(raw);
  if (!parsed) {
    const m = raw.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
    if (m) parsed = tryJson(m[0]);
  }
  let list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.replies) ? parsed.replies : null;
  if (!list) {
    list = raw.split(/\n+/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/^"|"$/g, "").trim()).filter(Boolean);
  }
  return list
    .map((r) => String(typeof r === "string" ? r : r?.text || "").trim())
    .filter((r) => r.length > 0)
    .map((r) => r.slice(0, 1000))
    .slice(0, 3);
}

export async function suggestReplies({ agencyId, userId, conversation }) {
  const lines = await loadTranscript(conversation.id);
  if (!lines.length) throw new AssistError(400, "There are no messages to reply to yet.", "EMPTY_CHAT");
  const lastCustomer = [...lines].reverse().find((l) => l.startsWith("Customer:"))?.slice(10) || "";
  const knowledge = await knowledgeFor(agencyId, conversation.integration_id, lastCustomer);

  const system = [
    "You help a customer-support person reply to a chat. Suggest exactly 3 different replies they could send next:",
    "one short and direct, one warmer and more detailed, one that asks a helpful follow-up question.",
    "Write in the same language the customer uses. Plain chat text, no greetings unless natural, no signatures.",
    "Never invent prices, policies, dates, order details or promises that aren't in the conversation or the reference material.",
    'Answer ONLY with JSON: {"replies": ["…", "…", "…"]}',
  ].join(" ");
  const messages = [{ role: "system", content: system }];
  if (knowledge?.text) messages.push({ role: "system", content: knowledge.text });
  messages.push({ role: "user", content: `The conversation so far (oldest first):\n${lines.join("\n")}\n\nSuggest 3 replies for the Team to send next.` });

  const out = await generate(agencyId, userId, messages, 700, { feature: "inbox_suggest", conversation });
  await logUsage({ agencyId, conversation, inputType: "assist_suggest", out });
  const replies = parseSuggestions(out.text);
  if (!replies.length) throw new AssistError(502, "The AI didn't return any suggestions. Please try again.", "EMPTY_RESPONSE");
  return { replies, usedKnowledge: Boolean(knowledge?.text), sources: (knowledge?.sources || []).map((s) => ({ title: s.title, url: s.url })) };
}

export async function summarize({ agencyId, userId, conversation }) {
  const lines = await loadTranscript(conversation.id);
  if (!lines.length) throw new AssistError(400, "There are no messages to summarize yet.", "EMPTY_CHAT");
  const messages = [
    {
      role: "system",
      content: [
        "Summarize a customer-support chat for a teammate who is about to take it over.",
        "Give 3 to 6 short bullet points: what the customer wants, the key facts they gave (order numbers, dates, contact details),",
        "what has already been done or promised, what is still open, and the customer's mood if it matters.",
        "Use only what is in the chat. Write in English. Start each bullet with '- '. No title, no closing remark.",
      ].join(" "),
    },
    { role: "user", content: `The conversation (oldest first):\n${lines.join("\n")}` },
  ];
  const out = await generate(agencyId, userId, messages, 450, { feature: "inbox_summary", conversation });
  await logUsage({ agencyId, conversation, inputType: "assist_summary", out });
  if (!out.text) throw new AssistError(502, "The AI didn't return a summary. Please try again.", "EMPTY_RESPONSE");
  const bullets = out.text.split(/\n+/).map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean).slice(0, 8);
  return { bullets, messageCount: lines.length };
}
