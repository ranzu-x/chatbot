import axios from "axios";
import pool from "../db.js";
import { emitToAgency } from "./socket.js";
import { parseTelegramChatId } from "./platformSender.js";

/**
 * Telegram Poll flow element ("telegramPoll"). Sends a native poll with
 * sendPoll (not anonymous, so Telegram reports who answered with a
 * `poll_answer` update), and remembers it in telegram_polls. The answer is
 * saved to the element's custom field (option texts, comma-separated for a
 * multiple-choice poll) and shown in the Inbox. The flow does not wait for it.
 */
export const POLL_LIMITS = { question: 300, option: 100, minOptions: 2, maxOptions: 12 };

export function cleanPoll(data = {}) {
  const question = String(data.question || "").trim().slice(0, POLL_LIMITS.question);
  const options = (Array.isArray(data.options) ? data.options : [])
    .map((o) => String(typeof o === "string" ? o : o?.text || "").trim().slice(0, POLL_LIMITS.option))
    .filter(Boolean)
    .slice(0, POLL_LIMITS.maxOptions);
  if (!question) throw new Error("Poll: the question is empty");
  if (options.length < POLL_LIMITS.minOptions) throw new Error("Poll: needs at least 2 options");
  return { question, options, allowMultiple: Boolean(data.allowMultiple) };
}

export async function sendTelegramPoll({ integration, externalId, poll }) {
  const target = parseTelegramChatId(externalId);
  const res = await axios.post(`https://api.telegram.org/bot${integration.access_token}/sendPoll`, {
    chat_id: target.chatId,
    ...(target.businessConnectionId ? { business_connection_id: target.businessConnectionId } : {}),
    question: poll.question,
    options: poll.options.map((text) => ({ text })),
    is_anonymous: false,
    allows_multiple_answers: poll.allowMultiple,
  }, { timeout: 10000 });
  const result = res.data?.result;
  return { messageId: result?.message_id?.toString() || null, pollId: result?.poll?.id || null };
}

export async function recordPoll({ pollId, agencyId, integrationId, conversationId, contactId, flowId, nodeId, poll, fieldId }) {
  if (!pollId) return;
  await pool.query(
    `INSERT IGNORE INTO telegram_polls (poll_id, agency_id, integration_id, conversation_id, contact_id, flow_id, node_id, question, options, field_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [pollId, agencyId, integrationId, conversationId, contactId, flowId, nodeId, poll.question, JSON.stringify(poll.options), fieldId || null]
  );
}

/** poll_answer update → store the answer (and the custom field) for that subscriber. */
export async function handlePollAnswer(integration, answer) {
  if (!answer?.poll_id) return null;
  const [[poll]] = await pool.query(
    "SELECT * FROM telegram_polls WHERE poll_id = ? AND integration_id = ? AND agency_id = ?",
    [answer.poll_id, integration.id, integration.agency_id]
  );
  if (!poll) return null;
  const options = typeof poll.options === "string" ? JSON.parse(poll.options) : poll.options;
  const chosen = (answer.option_ids || []).map((i) => options[i]).filter(Boolean);
  const text = chosen.join(", ");
  await pool.query("UPDATE telegram_polls SET answer = ?, answered_at = NOW() WHERE poll_id = ?", [text || null, poll.poll_id]);

  if (poll.field_id && poll.contact_id) {
    const [[field]] = await pool.query("SELECT id FROM custom_field_definitions WHERE id = ? AND agency_id = ?", [poll.field_id, poll.agency_id]);
    if (field) {
      if (text) {
        await pool.query(
          `INSERT INTO contact_custom_field_values (contact_id, field_id, value) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()`,
          [poll.contact_id, field.id, text]
        );
      } else {
        // An empty option list = the person retracted their vote.
        await pool.query("DELETE FROM contact_custom_field_values WHERE contact_id = ? AND field_id = ?", [poll.contact_id, field.id]);
      }
      emitToAgency(poll.agency_id, "contact_custom_field_updated", { contactId: poll.contact_id, fieldId: field.id, value: text || null });
    }
  }
  return { question: poll.question, answer: text, conversationId: poll.conversation_id };
}
