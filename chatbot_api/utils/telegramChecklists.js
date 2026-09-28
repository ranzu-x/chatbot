import axios from "axios";
import pool from "../db.js";
import { emitToAgency } from "./socket.js";
import { parseTelegramChatId } from "./platformSender.js";

/**
 * Telegram Checklist flow element ("telegramChecklist"). Telegram only lets a
 * bot send an interactive checklist on behalf of a connected **business
 * account** (sendChecklist needs business_connection_id), so in a Telegram
 * Business chat (external id "bc:<connection>:<chat>", utils/telegramBusiness.js)
 * the customer gets a real checklist they can tick; in a normal bot chat the
 * same tasks go out as a plain "☐" list.
 *
 * Ticks arrive as a `checklist_tasks_done` service message; the done tasks are
 * saved (telegram_checklists.done_task_ids) and, when the element names one,
 * written to a custom field as a comma-separated list.
 */
export const CHECKLIST_LIMITS = { title: 255, task: 100, maxTasks: 30 };

export function cleanChecklist(data = {}) {
  const title = String(data.title || "").trim().slice(0, CHECKLIST_LIMITS.title);
  if (!title) throw new Error("Checklist: the title is empty");
  const tasks = (Array.isArray(data.tasks) ? data.tasks : [])
    .map((t) => String(typeof t === "string" ? t : t?.text || "").trim().slice(0, CHECKLIST_LIMITS.task))
    .filter(Boolean)
    .slice(0, CHECKLIST_LIMITS.maxTasks)
    .map((text, i) => ({ id: i + 1, text }));
  if (!tasks.length) throw new Error("Checklist: add at least one task");
  return {
    title,
    tasks,
    others_can_mark_tasks_as_done: data.othersCanMarkDone !== false,
    others_can_add_tasks: Boolean(data.othersCanAdd),
  };
}

export function checklistAsText(checklist) {
  return [`📋 ${checklist.title}`, ...checklist.tasks.map((t) => `☐ ${t.text}`)].join("\n");
}

/** Sends the interactive checklist; only possible in a business chat. */
export async function sendTelegramChecklist({ integration, externalId, checklist }) {
  const target = parseTelegramChatId(externalId);
  if (!target.businessConnectionId) throw new Error("Interactive checklists work only in Telegram Business chats");
  const res = await axios.post(`https://api.telegram.org/bot${integration.access_token}/sendChecklist`, {
    business_connection_id: target.businessConnectionId,
    chat_id: target.chatId,
    checklist,
  }, { timeout: 10000 });
  return res.data?.result?.message_id?.toString() || null;
}

export async function recordChecklist({ agencyId, integrationId, chatExternalId, messageId, conversationId, contactId, flowId, nodeId, checklist, fieldId }) {
  if (!messageId) return;
  await pool.query(
    `INSERT IGNORE INTO telegram_checklists (agency_id, integration_id, chat_external_id, message_id, conversation_id, contact_id, flow_id, node_id, title, tasks, field_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [agencyId, integrationId, String(chatExternalId), String(messageId), conversationId || null, contactId || null, flowId || null, nodeId || null,
      checklist.title, JSON.stringify(checklist.tasks), fieldId || null]
  );
}

/**
 * `checklist_tasks_done` service message → update the done set. `externalId`
 * is the business chat's subscriber id. Returns the new state or null.
 */
export async function handleChecklistTasksDone(integration, externalId, done) {
  const msgId = done?.checklist_message?.message_id;
  if (!msgId) return null;
  const [[row]] = await pool.query(
    "SELECT * FROM telegram_checklists WHERE integration_id = ? AND chat_external_id = ? AND message_id = ?",
    [integration.id, String(externalId), String(msgId)]
  );
  if (!row) return null;
  const parse = (v, d) => { try { return typeof v === "string" ? JSON.parse(v) : v || d; } catch { return d; } };
  const tasks = parse(row.tasks, []);
  const doneSet = new Set(parse(row.done_task_ids, []).map(Number));
  for (const id of done.marked_as_done_task_ids || []) doneSet.add(Number(id));
  for (const id of done.marked_as_not_done_task_ids || []) doneSet.delete(Number(id));
  const doneIds = tasks.map((t) => t.id).filter((id) => doneSet.has(id));
  const complete = doneIds.length === tasks.length && tasks.length > 0;
  await pool.query(
    "UPDATE telegram_checklists SET done_task_ids = ?, completed_at = IF(?, COALESCE(completed_at, NOW()), NULL) WHERE id = ?",
    [JSON.stringify(doneIds), complete ? 1 : 0, row.id]
  );
  const doneText = tasks.filter((t) => doneSet.has(t.id)).map((t) => t.text).join(", ");
  if (row.field_id && row.contact_id) {
    const [[field]] = await pool.query("SELECT id FROM custom_field_definitions WHERE id = ? AND agency_id = ?", [row.field_id, row.agency_id]);
    if (field) {
      if (doneText) {
        await pool.query(
          `INSERT INTO contact_custom_field_values (contact_id, field_id, value) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()`,
          [row.contact_id, field.id, doneText]
        );
      } else {
        await pool.query("DELETE FROM contact_custom_field_values WHERE contact_id = ? AND field_id = ?", [row.contact_id, field.id]);
      }
      emitToAgency(row.agency_id, "contact_custom_field_updated", { contactId: row.contact_id, fieldId: field.id, value: doneText || null });
    }
  }
  const state = { checklistId: row.id, conversationId: row.conversation_id, done: doneIds.length, total: tasks.length, complete };
  emitToAgency(row.agency_id, "telegram_checklist_update", state);
  return state;
}
