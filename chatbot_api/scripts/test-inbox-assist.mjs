/**
 * Inbox AI assist (suggested replies / summary) against the real DB over HTTP,
 * up to the AI provider — no provider is called (that would spend the
 * workspace's API credits): the test workspace has no provider configured, so
 * the endpoints must answer AI_NOT_CONFIGURED. Also checks the transcript sent
 * to the model and that another workspace can't use a chat.
 * Run: npm run test:inbox-assist
 */
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import conversationRoutes from "../routes/conversations.js";
import { loadTranscript } from "../utils/inboxAssist.js";
import { assertModuleAccess } from "../utils/entitlements.js";

const ok = (m) => console.log(`  ✔ ${m}`);
const [cands] = await pool.query(
  `SELECT a.id, a.owner_id FROM agencies a WHERE a.is_active = 1 AND a.account_type IN ('DIRECT_CUSTOMER','RESELLER','RESELLER_CUSTOMER')
     AND NOT EXISTS (SELECT 1 FROM ai_providers p WHERE p.agency_id = a.id AND p.enabled = 1) ORDER BY a.id`
);
let me = null;
for (const c of cands) {
  const okMods = await assertModuleAccess(c.id, "feature_ai_assistant").then(() => true, () => false)
    && await assertModuleAccess(c.id, "feature_live_chat").then(() => true, () => false);
  if (okMods) { me = c; break; }
}
assert.ok(me, "needs a workspace with Live Chat + AI Assistant and no AI provider");
const other = cands.find((c) => c.id !== me.id) || (await pool.query("SELECT id, owner_id FROM agencies WHERE id <> ? LIMIT 1", [me.id]))[0][0];
const tok = (a) => jwt.sign({ id: a.owner_id, role: "RESELLER", agencyId: a.id }, process.env.JWT_SECRET, { expiresIn: "10m" });

const [integ] = await pool.query("INSERT INTO integrations (agency_id, platform, name, access_token, is_active) VALUES (?, 'WEBCHAT', 'assist-test', NULL, 1)", [me.id]);
const [ct] = await pool.query("INSERT INTO contacts (agency_id, platform, external_id, name, source) VALUES (?, 'WEBCHAT', ?, 'Assist Tester', 'MANUAL')", [me.id, `assist-${Date.now()}`]);
const [cv] = await pool.query("INSERT INTO conversations (agency_id, contact_id, integration_id, status, last_message_at) VALUES (?, ?, ?, 'OPEN', NOW())", [me.id, ct.insertId, integ.insertId]);
const convId = cv.insertId;

const app = express();
app.use(express.json());
app.use("/api/v1", conversationRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const post = async (p, who = me) => {
  const r = await fetch(`${base}${p}`, { method: "POST", headers: { Authorization: `Bearer ${tok(who)}` } });
  return { status: r.status, body: await r.json() };
};

try {
  let r = await post(`/conversations/${convId}/ai/suggest-replies`);
  assert.equal(r.status, 400);
  assert.equal(r.body.code, "EMPTY_CHAT");
  ok("empty chat → nothing to suggest");

  const rows = [
    ["INBOUND", "TEXT", "Hi, where is my order #1042?", null, null],
    ["OUTBOUND", "TEXT", "Let me check that for you.", null, { senderType: "AGENT" }],
    ["INBOUND", "AUDIO", "", "It was supposed to arrive Monday", null],
    ["OUTBOUND", "TEXT", "Thanks! Our bot says it's in transit.", null, { senderType: "BOT" }],
  ];
  for (const [dir, type, body, transcript, meta] of rows) {
    await pool.query(
      "INSERT INTO messages (conversation_id, direction, type, body, transcript, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())",
      [convId, dir, type, body, transcript, meta ? JSON.stringify(meta) : null]
    );
  }
  const lines = await loadTranscript(convId);
  assert.deepEqual(lines, [
    "Customer: Hi, where is my order #1042?",
    "Team: Let me check that for you.",
    "Customer: (voice) It was supposed to arrive Monday",
    "Bot: Thanks! Our bot says it's in transit.",
  ]);
  ok("transcript sent to the AI: who said what, voice notes as their transcript");

  r = await post(`/conversations/${convId}/ai/suggest-replies`);
  assert.equal(r.status, 403);
  assert.equal(r.body.code, "AI_NOT_CONFIGURED");
  r = await post(`/conversations/${convId}/ai/summary`);
  assert.equal(r.body.code, "AI_NOT_CONFIGURED");
  ok("no AI provider → clear 'connect a provider' answer, nothing spent");

  r = await post(`/conversations/${convId}/ai/summary`, other);
  assert.ok([403, 404].includes(r.status), `another workspace is refused (${r.status})`);
  ok(`another workspace can't use this chat (${r.status})`);

  console.log("✅ Inbox AI assist: all checks passed (the provider call itself was not made)");
} finally {
  await pool.query("DELETE FROM conversations WHERE id = ?", [convId]);
  await pool.query("DELETE FROM contacts WHERE id = ?", [ct.insertId]);
  await pool.query("DELETE FROM integrations WHERE id = ?", [integ.insertId]);
  server.close();
  await pool.end();
  setTimeout(() => process.exit(process.exitCode || 0), 100);
}
