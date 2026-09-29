/**
 * Browser push (utils/webPush.js) against the real DB over HTTP. Nothing is
 * delivered: web-push's sendNotification is replaced by a stub that records
 * calls and can answer 410 (gone). Cleans up after itself; the VAPID pair it
 * may create in web_push_keys is kept (it is the platform's pair).
 * Run: npm run test:web-push
 */
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import webpush from "web-push";
import pool from "../db.js";
import userNotificationRoutes from "../routes/userNotifications.js";
import { getVapidKeys, sendPushToUser, pushForEvent, notifyAssigneeOfInbound, cleanSubscription } from "../utils/webPush.js";

const ok = (m) => console.log(`  ✔ ${m}`);
const calls = [];
let answer = 201;
webpush.sendNotification = async (sub, payload) => {
  calls.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
  if (answer !== 201) { const e = new Error("gone"); e.statusCode = answer; throw e; }
  return { statusCode: 201 };
};

const [users] = await pool.query("SELECT u.id, u.home_agency_id FROM users u WHERE u.is_active = 1 AND u.home_agency_id IS NOT NULL ORDER BY u.id LIMIT 2");
assert.equal(users.length, 2, "needs two users");
const [me, other] = users;
const tok = (u) => jwt.sign({ id: u.id, role: "RESELLER", agencyId: u.home_agency_id }, process.env.JWT_SECRET, { expiresIn: "10m" });

const app = express();
app.use(express.json());
app.use("/api/v1", userNotificationRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = async (method, p, body, who = me) => {
  const r = await fetch(`${base}${p}`, { method, headers: { Authorization: `Bearer ${tok(who)}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};

const stamp = Date.now();
const endpoint = `https://push.example.test/send/${stamp}`;
const keys = { p256dh: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U", auth: "tBHItJI5svbpez7KI4CCXg" };
let convId = null, contactId = null, integId = null, profileCreated = false;

try {
  const k1 = await getVapidKeys();
  const r0 = await call("GET", "/me/push/key");
  assert.equal(r0.body.publicKey, k1.publicKey);
  assert.match(k1.publicKey, /^[A-Za-z0-9_-]{80,90}$/);
  ok("VAPID public key served (one platform pair)");

  assert.equal(cleanSubscription({ endpoint: "http://insecure.test/x", keys }), null);
  assert.equal(cleanSubscription({ endpoint, keys: { p256dh: "x", auth: "y" } }), null);
  let r = await call("POST", "/me/push/subscribe", { subscription: { endpoint: "javascript:alert(1)", keys } });
  assert.equal(r.status, 400);
  ok("invalid / non-https subscriptions refused");

  r = await call("POST", "/me/push/subscribe", { subscription: { endpoint, keys } });
  assert.equal(r.status, 200);
  const [[row]] = await pool.query("SELECT user_id FROM push_subscriptions WHERE endpoint = ?", [endpoint]);
  assert.equal(row.user_id, me.id);
  ok("subscription stored for the signed-in user");

  r = await call("POST", "/me/push/unsubscribe", { endpoint }, other);
  const [[still]] = await pool.query("SELECT COUNT(*) n FROM push_subscriptions WHERE endpoint = ?", [endpoint]);
  assert.equal(still.n, 1);
  ok("another user can't remove it");

  calls.length = 0;
  await pushForEvent(me.id, "follow_up_due", { id: 7, title: "Call back", contactName: "Ana", conversationId: 42 });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].payload, { title: "Follow-up: Call back", body: "With Ana", url: "/inbox?conv=42", tag: "followup-7" });
  await pushForEvent(me.id, "user_notification", { title: "X mentioned you", body: "hi", link: "https://evil.test" });
  assert.equal(calls[1].payload.url, "/inbox", "outside links never go in a push");
  await pushForEvent(me.id, "conversation_updated", {});
  assert.equal(calls.length, 2, "other events don't push");
  ok("follow-ups and in-app notifications become pushes (dashboard paths only)");

  // A new customer message in a chat assigned to me → one push, then quiet for 2 minutes.
  let [[profile]] = await pool.query("SELECT id FROM agent_profiles WHERE user_id = ? LIMIT 1", [me.id]);
  if (!profile) {
    const [p] = await pool.query("INSERT INTO agent_profiles (user_id, agency_id) VALUES (?, ?)", [me.id, me.home_agency_id]);
    profile = { id: p.insertId };
    profileCreated = true;
  }
  const [integ] = await pool.query("INSERT INTO integrations (agency_id, platform, name, is_active) VALUES (?, 'WEBCHAT', 'push-test', 1)", [me.home_agency_id]);
  integId = integ.insertId;
  const [ct] = await pool.query("INSERT INTO contacts (agency_id, platform, external_id, name, source) VALUES (?, 'WEBCHAT', ?, 'Push Tester', 'MANUAL')", [me.home_agency_id, `push-${stamp}`]);
  contactId = ct.insertId;
  const [cv] = await pool.query("INSERT INTO conversations (agency_id, contact_id, integration_id, status, assigned_to_id) VALUES (?, ?, ?, 'OPEN', ?)", [me.home_agency_id, contactId, integId, profile.id]);
  convId = cv.insertId;
  calls.length = 0;
  await notifyAssigneeOfInbound(convId, { type: "TEXT", body: "Where is my order?" });
  await notifyAssigneeOfInbound(convId, { type: "TEXT", body: "Hello??" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.title, "Push Tester");
  assert.equal(calls[0].payload.body, "Where is my order?");
  assert.equal(calls[0].payload.url, `/inbox?conv=${convId}`);
  ok("new message in my assigned chat → one push per burst");

  answer = 410;
  const res = await sendPushToUser(me.id, { title: "t" });
  assert.equal(res.removed, 1);
  const [[gone]] = await pool.query("SELECT COUNT(*) n FROM push_subscriptions WHERE endpoint = ?", [endpoint]);
  assert.equal(gone.n, 0);
  ok("a subscription the push service says is gone (410) is removed");

  console.log("✅ Browser push: all checks passed (nothing was delivered)");
} finally {
  await pool.query("DELETE FROM push_subscriptions WHERE endpoint = ?", [endpoint]);
  if (convId) await pool.query("DELETE FROM conversations WHERE id = ?", [convId]);
  if (contactId) await pool.query("DELETE FROM contacts WHERE id = ?", [contactId]);
  if (integId) await pool.query("DELETE FROM integrations WHERE id = ?", [integId]);
  if (profileCreated) await pool.query("DELETE FROM agent_profiles WHERE user_id = ?", [me.id]);
  server.close();
  await pool.end();
  setTimeout(() => process.exit(process.exitCode || 0), 100);
}
