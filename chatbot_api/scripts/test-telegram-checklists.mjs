/**
 * Telegram checklists against the real DB (no Telegram call): ticking and
 * unticking tasks updates the done set and the custom field; ticking all
 * marks it complete. Throw-away rows, removed afterwards.
 * Run: npm run test:telegram-checklists
 */
import assert from "node:assert/strict";
import pool from "../db.js";
import { cleanChecklist, recordChecklist, handleChecklistTasksDone } from "../utils/telegramChecklists.js";

const [[agency]] = await pool.query("SELECT id FROM agencies WHERE account_type = 'DIRECT_CUSTOMER' ORDER BY id LIMIT 1");
const stamp = Date.now();
const [ins] = await pool.query("INSERT INTO integrations (agency_id, platform, name, access_token, is_active) VALUES (?, 'TELEGRAM', 'cl-test', '0:x', 1)", [agency.id]);
const integration = { id: ins.insertId, agency_id: agency.id };
const chat = `bc:conn${stamp}:555`;
const [c] = await pool.query("INSERT INTO contacts (agency_id, platform, external_id, name, source) VALUES (?, 'TELEGRAM', ?, 'CL', 'MANUAL')", [agency.id, chat]);
const [f] = await pool.query("INSERT INTO custom_field_definitions (agency_id, name, field_key, field_type) VALUES (?, ?, ?, 'TEXT')", [agency.id, `Done ${stamp}`, `done_${stamp}`]);
try {
  await recordChecklist({ agencyId: agency.id, integrationId: integration.id, chatExternalId: chat, messageId: "77", contactId: c.insertId, checklist: cleanChecklist({ title: "Onboarding", tasks: ["Pay", "Upload", "Book"] }), fieldId: f.insertId });
  let s = await handleChecklistTasksDone(integration, chat, { checklist_message: { message_id: 77 }, marked_as_done_task_ids: [1, 3] });
  assert.deepEqual([s.done, s.total, s.complete], [2, 3, false]);
  let [[v]] = await pool.query("SELECT value FROM contact_custom_field_values WHERE contact_id = ? AND field_id = ?", [c.insertId, f.insertId]);
  assert.equal(v.value, "Pay, Book");
  s = await handleChecklistTasksDone(integration, chat, { checklist_message: { message_id: 77 }, marked_as_done_task_ids: [2], marked_as_not_done_task_ids: [3] });
  [[v]] = await pool.query("SELECT value FROM contact_custom_field_values WHERE contact_id = ? AND field_id = ?", [c.insertId, f.insertId]);
  assert.equal(v.value, "Pay, Upload");
  s = await handleChecklistTasksDone(integration, chat, { checklist_message: { message_id: 77 }, marked_as_done_task_ids: [3] });
  assert.equal(s.complete, true);
  assert.equal(await handleChecklistTasksDone(integration, "bc:other:1", { checklist_message: { message_id: 77 } }), null, "another chat's ticks never apply");
  console.log("✅ Telegram checklists: all checks passed");
} finally {
  await pool.query("DELETE FROM contact_custom_field_values WHERE field_id = ?", [f.insertId]);
  await pool.query("DELETE FROM custom_field_definitions WHERE id = ?", [f.insertId]);
  await pool.query("DELETE FROM contacts WHERE id = ?", [c.insertId]);
  await pool.query("DELETE FROM integrations WHERE id = ?", [integration.id]);
  await pool.end();
}
