/**
 * WhatsApp Calling — customers calling the business (user-initiated), end to
 * end through utils/whatsappCallEvents.js against the real DB. Opt-in:
 * `npm run test:wa-calls`. Never calls Meta (the missed-call reply is off for
 * the test number unless you turned it on); cleans up after itself.
 *
 *  1. `connect` from an unknown number → subscriber + conversation + RINGING call.
 *  2. `terminate` without an answer → MISSED, "📞 Missed WhatsApp call" in the chat.
 *  3. A second call, marked answered, → COMPLETED with the duration in the chat.
 *  4. The same `connect` delivered twice → still one call.
 */
import assert from "node:assert/strict";
import pool from "../db.js";
import { handleWhatsAppCallEvent } from "../utils/whatsappCallEvents.js";

const tag = String(Date.now()).slice(-7);
const phone = `99901${tag}`;
const created = { contactId: null, calls: [] };
let passed = 0;
const ok = (name) => { passed += 1; console.log(`  ✔ ${name}`); };

async function main() {
  const [[integration]] = await pool.query("SELECT * FROM integrations WHERE platform = 'WHATSAPP' ORDER BY id LIMIT 1");
  if (!integration) throw new Error("No WhatsApp bot account in this database to test with");
  const ctx = { agencyId: integration.agency_id, integrationId: integration.id, integration, contacts: [{ wa_id: phone, profile: { name: "Call Tester" } }] };
  console.log(`WhatsApp calls test on workspace ${ctx.agencyId}, bot account ${ctx.integrationId}\n`);

  // 1 ─ incoming connect
  const wacid1 = `wacid.TEST${tag}A`;
  const connect = { id: wacid1, from: phone, to: integration.wa_display_phone, event: "connect", direction: "USER_INITIATED", session: { sdp_type: "offer", sdp: "v=0 test" }, cta_payload: "test-button" };
  await handleWhatsAppCallEvent(connect, ctx);
  const [[call1]] = await pool.query("SELECT * FROM whatsapp_calls WHERE wacid = ?", [wacid1]);
  assert.ok(call1, "a call row is created");
  created.calls.push(call1.id);
  created.contactId = call1.contact_id;
  assert.equal(call1.direction, "USER_INITIATED");
  assert.equal(call1.status, "RINGING");
  assert.equal(call1.cta_payload, "test-button");
  assert.ok(call1.conversation_id, "the call is tied to a conversation");
  const [[contact]] = await pool.query("SELECT external_id, name FROM contacts WHERE id = ?", [call1.contact_id]);
  assert.equal(contact.external_id, phone);
  assert.equal(contact.name, "Call Tester");
  ok("customer calls from a new number → subscriber, conversation and a ringing call");

  // 4 ─ duplicate connect
  await handleWhatsAppCallEvent(connect, ctx);
  const [[{ n }]] = await pool.query("SELECT COUNT(*) n FROM whatsapp_calls WHERE wacid = ?", [wacid1]);
  assert.equal(n, 1);
  ok("the same connect webhook twice → still one call");

  // 2 ─ unanswered terminate
  await handleWhatsAppCallEvent({ id: wacid1, event: "terminate", status: "FAILED", direction: "USER_INITIATED" }, ctx);
  const [[missed]] = await pool.query("SELECT status FROM whatsapp_calls WHERE id = ?", [call1.id]);
  assert.equal(missed.status, "MISSED");
  const [[log1]] = await pool.query("SELECT body, direction FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1", [call1.conversation_id]);
  assert.equal(log1.body, "📞 Missed WhatsApp call");
  assert.equal(log1.direction, "INBOUND");
  ok("nobody answers → MISSED and a missed-call entry in the chat");

  // 3 ─ answered call
  const wacid2 = `wacid.TEST${tag}B`;
  await handleWhatsAppCallEvent({ ...connect, id: wacid2 }, ctx);
  const [[call2]] = await pool.query("SELECT * FROM whatsapp_calls WHERE wacid = ?", [wacid2]);
  created.calls.push(call2.id);
  assert.equal(call2.contact_id, call1.contact_id, "same subscriber for the second call");
  await pool.query("UPDATE whatsapp_calls SET status = 'CONNECTED', connected_at = NOW() WHERE id = ?", [call2.id]); // what POST /calls/:id/accept does
  await handleWhatsAppCallEvent({ id: wacid2, event: "terminate", status: "COMPLETED", duration: 125, direction: "USER_INITIATED" }, ctx);
  const [[done]] = await pool.query("SELECT status, duration_seconds FROM whatsapp_calls WHERE id = ?", [call2.id]);
  assert.equal(done.status, "COMPLETED");
  assert.equal(done.duration_seconds, 125);
  const [[log2]] = await pool.query("SELECT body FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1", [call2.conversation_id]);
  assert.equal(log2.body, "📞 WhatsApp call · 2:05");
  ok("answered call → COMPLETED with its duration in the chat");
}

async function cleanup() {
  if (created.contactId) {
    const [convs] = await pool.query("SELECT id FROM conversations WHERE contact_id = ?", [created.contactId]);
    await pool.query("DELETE FROM whatsapp_calls WHERE contact_id = ?", [created.contactId]);
    if (convs.length) await pool.query("DELETE FROM conversations WHERE id IN (?)", [convs.map((c) => c.id)]);
    await pool.query("DELETE FROM contacts WHERE id = ?", [created.contactId]);
  }
}

try {
  await main();
  console.log(`\n${passed} checks passed`);
} catch (err) {
  console.error("\n✖ FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await cleanup().catch((e) => console.error("cleanup:", e.message));
  await pool.end().catch(() => {});
  setTimeout(() => process.exit(process.exitCode || 0), 200);
}
