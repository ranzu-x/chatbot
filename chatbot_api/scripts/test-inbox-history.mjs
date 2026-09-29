/**
 * Inbox message history against the real DB, over HTTP (the conversations
 * router in a throw-away express app): cursor paging both ways, message
 * search, jump-to-message, another workspace's access, and the 90-day
 * retention job. Creates its own chat and removes it afterwards.
 * Run: npm run test:inbox-history
 */
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import conversationRoutes from "../routes/conversations.js";
import { pruneOldMessages } from "../utils/messageRetention.js";

const ok = (m) => console.log(`  ✔ ${m}`);
const [owners] = await pool.query(
  `SELECT a.id AS agencyId, a.owner_id AS userId FROM agencies a JOIN users u ON u.id = a.owner_id
    WHERE a.is_active = 1 AND a.account_type IN ('DIRECT_CUSTOMER','RESELLER','RESELLER_CUSTOMER') ORDER BY a.id LIMIT 2`
);
assert.equal(owners.length, 2, "needs two active workspaces with owners");
const [me, stranger] = owners;
const token = (o) => jwt.sign({ id: o.userId, role: "RESELLER", agencyId: o.agencyId }, process.env.JWT_SECRET, { expiresIn: "10m" });

const app = express();
app.use(express.json());
app.use("/api/v1", conversationRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const get = async (path, who = me) => {
  const r = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token(who)}` } });
  return { status: r.status, body: await r.json() };
};

const [integ] = await pool.query(
  "INSERT INTO integrations (agency_id, platform, name, access_token, is_active) VALUES (?, 'WHATSAPP', 'inbox-history-test', 'fake', 1)",
  [me.agencyId]
);
const [ct] = await pool.query(
  "INSERT INTO contacts (agency_id, platform, external_id, name, source) VALUES (?, 'WHATSAPP', ?, 'History Tester', 'MANUAL')",
  [me.agencyId, `hist${Date.now()}`]
);
const [cv] = await pool.query(
  "INSERT INTO conversations (agency_id, contact_id, integration_id, status, last_message_at) VALUES (?, ?, ?, 'OPEN', NOW())",
  [me.agencyId, ct.insertId, integ.insertId]
);
const convId = cv.insertId;

try {
  // 60 messages ~100 days old, 190 recent; several pairs share one second.
  const OLD = 60, NEW = 190, TOTAL = OLD + NEW;
  const values = [];
  for (let i = 0; i < TOTAL; i++) {
    const old = i < OLD;
    const secs = Math.floor(i / 2); // two messages per second
    const body = i % 25 === 0 ? `Message ${i} about my appointment 50%_off` : `Message ${i}`;
    values.push([convId, i % 2 ? "OUTBOUND" : "INBOUND", "TEXT", body, old ? 100 : 1, secs]);
  }
  for (const v of values) {
    await pool.query(
      "INSERT INTO messages (conversation_id, direction, type, body, created_at) VALUES (?, ?, ?, ?, NOW() - INTERVAL ? DAY + INTERVAL ? SECOND)",
      v
    );
  }

  // ── Initial load + paging back ────────────────────────────────────────────
  const first = await get(`/conversations/${convId}`);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.messages.length, 50);
  assert.equal(first.body.hasMoreMessages, true);
  assert.equal(first.body.retentionDays, 90);
  assert.equal(first.body.messages.at(-1).body, `Message ${TOTAL - 1}`, "newest last");
  let all = [...first.body.messages];
  let hasMore = true;
  while (hasMore) {
    const page = await get(`/conversations/${convId}/messages?before=${all[0].id}&limit=50`);
    assert.ok(page.body.messages.length <= 50);
    all = [...page.body.messages, ...all];
    hasMore = page.body.hasMore;
  }
  assert.equal(all.length, TOTAL, "every message exactly once");
  assert.equal(new Set(all.map((m) => m.id)).size, TOTAL, "no duplicates across pages (same-second siblings kept)");
  assert.deepEqual(all.map((m) => m.body), values.map((v) => v[3]), "chronological order");
  ok(`initial 50, then ${Math.ceil((TOTAL - 50) / 50)} cursor pages back → all ${TOTAL} in order, no gaps/duplicates`);

  // ── Search ────────────────────────────────────────────────────────────────
  const s = await get(`/conversations/${convId}/messages/search?q=appointment`);
  assert.equal(s.status, 200);
  const matches = values.filter((v) => v[3].includes("appointment")).length;
  assert.equal(s.body.results.length, matches);
  assert.ok(s.body.results.every((r, i, a) => i === 0 || new Date(a[i - 1].created_at) >= new Date(r.created_at)), "newest first");
  assert.equal((await get(`/conversations/${convId}/messages/search?q=${encodeURIComponent("50%_off appointment")}`)).body.results.length, matches, "all words required; % and _ are literal");
  assert.equal((await get(`/conversations/${convId}/messages/search?q=${encodeURIComponent("5%")}`)).body.results.length, 0, "% is not a wildcard");
  const paged = await get(`/conversations/${convId}/messages/search?q=appointment&limit=3`);
  assert.equal(paged.body.results.length, 3);
  assert.equal(paged.body.hasMore, true);
  const next = await get(`/conversations/${convId}/messages/search?q=appointment&limit=3&before=${paged.body.results[2].id}`);
  assert.ok(next.body.results.every((r) => !paged.body.results.some((p) => p.id === r.id)), "search pages don't repeat");
  ok(`search finds ${matches} matches newest-first, pages, treats % and _ literally`);

  // ── Jump to an old result, then page forward ──────────────────────────────
  const oldest = s.body.results.at(-1);
  const around = await get(`/conversations/${convId}/messages?around=${oldest.id}&limit=50`);
  assert.equal(around.status, 200);
  assert.ok(around.body.messages.some((m) => m.id === oldest.id), "window contains the target");
  assert.equal(around.body.targetId, oldest.id);
  assert.equal(around.body.hasNewer, true);
  let win = around.body.messages;
  let hasNewer = around.body.hasNewer;
  while (hasNewer) {
    const page = await get(`/conversations/${convId}/messages?after=${win.at(-1).id}&limit=50`);
    win = [...win, ...page.body.messages];
    hasNewer = page.body.hasNewer;
  }
  assert.equal(win.at(-1).body, `Message ${TOTAL - 1}`, "paging forward reaches the latest message");
  assert.equal(new Set(win.map((m) => m.id)).size, win.length);
  ok("jump to an old message (window around it), then page forward to the latest");

  // ── Another workspace ─────────────────────────────────────────────────────
  assert.equal((await get(`/conversations/${convId}/messages/search?q=appointment`, stranger)).status, 404);
  assert.equal((await get(`/conversations/${convId}/messages?around=${oldest.id}`, stranger)).status, 404);
  assert.equal((await get(`/conversations/${convId}/messages`, stranger)).status, 404);
  const [[foreignConv]] = await pool.query("SELECT id FROM conversations WHERE agency_id = ? LIMIT 1", [stranger.agencyId]);
  if (foreignConv) {
    // A message id from my chat, asked through the other workspace's chat, is not found.
    assert.equal((await get(`/conversations/${foreignConv.id}/messages?around=${oldest.id}`, stranger)).status, 404);
  }
  ok("another workspace gets 404 for search / history / jump; message ids don't cross chats");

  // ── Retention ─────────────────────────────────────────────────────────────
  // Scoped to this test's chat — never deletes the database's real messages.
  const r = await pruneOldMessages({ days: 90, batchSize: 25, pauseMs: 0, conversationId: convId });
  const [[left]] = await pool.query("SELECT COUNT(*) n FROM messages WHERE conversation_id = ?", [convId]);
  assert.equal(left.n, NEW, "only messages older than 90 days deleted");
  assert.equal(r.deleted, OLD);
  assert.equal(r.batches, 3, "worked in batches of 25");
  const [[flags]] = await pool.query("SELECT history_pruned_at, inbound_pruned FROM conversations WHERE id = ?", [convId]);
  assert.ok(flags.history_pruned_at);
  assert.equal(flags.inbound_pruned, 1);
  const s2 = await get(`/conversations/${convId}/messages/search?q=appointment`);
  assert.ok(s2.body.results.length < matches && !s2.body.results.some((x) => x.id === oldest.id), "deleted messages gone from search");
  const gone = await get(`/conversations/${convId}/messages?around=${oldest.id}`);
  assert.equal(gone.status, 404);
  assert.equal(gone.body.code, "MESSAGE_GONE");
  const stale = await get(`/conversations/${convId}/messages?before=${oldest.id}`);
  assert.deepEqual(stale.body.messages, [], "a deleted cursor returns nothing, not an error");
  const again = await pruneOldMessages({ days: 90, batchSize: 25, pauseMs: 0, conversationId: convId });
  assert.equal(again.deleted, 0, "re-running changes nothing");
  ok(`retention deleted ${OLD} old messages in ${r.batches} batches, flagged the chat, search/jump agree; safe to re-run`);

  const first2 = await get(`/conversations/${convId}`);
  assert.ok(first2.body.historyPrunedAt, "the Inbox is told older history was removed");
  ok("conversation payload carries historyPrunedAt");

  console.log("✅ Inbox history: all checks passed");
} finally {
  await pool.query("DELETE FROM conversations WHERE id = ?", [convId]); // cascades messages
  await pool.query("DELETE FROM contacts WHERE id = ?", [ct.insertId]);
  await pool.query("DELETE FROM integrations WHERE id = ?", [integ.insertId]);
  server.close();
  await pool.end();
  setTimeout(() => process.exit(process.exitCode || 0), 100);
}
