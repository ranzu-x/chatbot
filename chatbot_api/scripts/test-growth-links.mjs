/**
 * Growth tools (chat links + QR codes) against the real DB, over HTTP where it
 * matters. A throw-away WhatsApp bot with a fake token (the flow's message send
 * to Meta just fails and is logged). Removes everything it creates.
 * Run: npm run test:growth-links
 */
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import growthRoutes from "../routes/growthLinks.js";
import { extractGrowthCode, extractMetaLinkRef, chatUrl, handleGrowthLinkArrival } from "../utils/growthLinks.js";
import { assertModuleAccess } from "../utils/entitlements.js";

const ok = (m) => console.log(`  ✔ ${m}`);

// ── Pure parts ──
assert.equal(extractGrowthCode({ platform: "TELEGRAM", text: "/start gl_ABCD2345" }), "ABCD2345");
assert.equal(extractGrowthCode({ platform: "TELEGRAM", text: "/start@MyBot gl_abcd2345" }), "ABCD2345");
assert.equal(extractGrowthCode({ platform: "TELEGRAM", text: "/start" }), null);
assert.equal(extractGrowthCode({ platform: "WHATSAPP", text: "Hi! I'd like to know more. (ref K7QM2PZX)" }), "K7QM2PZX");
assert.equal(extractGrowthCode({ platform: "WHATSAPP", text: "what is (ref K7QM2PZX) this" }), null, "only at the end of the pre-filled text");
assert.equal(extractGrowthCode({ platform: "FACEBOOK", metaRef: "gl_ZZZZ9999" }), "ZZZZ9999");
assert.equal(extractMetaLinkRef({ referral: { ref: "gl_ZZZZ9999", source: "SHORTLINK", type: "OPEN_THREAD" } }), "gl_ZZZZ9999");
assert.equal(extractMetaLinkRef({ referral: { ref: "gl_ZZZZ9999", source: "ADS", ad_id: "1" } }), null, "an ad's referral is not a growth link");
assert.equal(extractMetaLinkRef({ postback: { referral: { ref: "other" } } }), null);
assert.equal(chatUrl({ code: "AB12CD34" }, { platform: "FACEBOOK", fb_page_id: "123" }), "https://m.me/123?ref=gl_AB12CD34");
assert.equal(chatUrl({ code: "AB12CD34" }, { platform: "INSTAGRAM", ig_username: "shop" }), "https://ig.me/m/shop?ref=gl_AB12CD34");
assert.equal(chatUrl({ code: "AB12CD34" }, { platform: "TELEGRAM", tg_bot_username: "ShopBot" }), "https://t.me/ShopBot?start=gl_AB12CD34");
assert.match(chatUrl({ code: "AB12CD34", prefill_text: "Hello" }, { platform: "WHATSAPP", wa_display_phone: "+880 1700-000000" }), /^https:\/\/wa\.me\/8801700000000\?text=Hello%20\(ref%20AB12CD34\)$/);
ok("link codes read from Telegram /start, WhatsApp text, Messenger / Instagram referrals; chat URLs per channel");

// ── Real DB + HTTP ──
const [candidates] = await pool.query(
  "SELECT a.id, a.owner_id FROM agencies a WHERE a.is_active = 1 AND a.account_type IN ('DIRECT_CUSTOMER','RESELLER','RESELLER_CUSTOMER') ORDER BY a.id"
);
let agency = null;
for (const c of candidates) if (await assertModuleAccess(c.id, "feature_bot_manager").then(() => true, () => false)) { agency = c; break; }
assert.ok(agency, "needs a workspace with the Bot Manager module");
const agencyId = agency.id;
const token = jwt.sign({ id: agency.owner_id, role: "RESELLER", agencyId }, process.env.JWT_SECRET, { expiresIn: "10m" });

const [integ] = await pool.query(
  "INSERT INTO integrations (agency_id, platform, name, access_token, wa_display_phone, is_active) VALUES (?, 'WHATSAPP', 'growth-test', 'fake', '+8801700000001', 1)",
  [agencyId]
);
const integrationId = integ.insertId;
const [[integration]] = await pool.query("SELECT * FROM integrations WHERE id = ?", [integrationId]);
const [fl] = await pool.query(
  "INSERT INTO flows (agency_id, integration_id, name, trigger_type, nodes_json, edges_json, is_active) VALUES (?, ?, 'growth-test', 'KEYWORD', ?, ?, 1)",
  [agencyId, integrationId, JSON.stringify([{ id: "start", type: "start", data: {} }, { id: "hi", type: "text", data: { message: "Welcome via link" } }]), JSON.stringify([{ id: "e", source: "start", target: "hi" }])]
);
const flowId = fl.insertId;
const [lb] = await pool.query("INSERT INTO labels (agency_id, name, color) VALUES (?, 'growth-test-label', '#2563eb')", [agencyId]);
const labelId = lb.insertId;
const [[otherFlowRow]] = await pool.query("SELECT id FROM flows WHERE agency_id = ? AND (integration_id <> ? OR integration_id IS NULL) LIMIT 1", [agencyId, integrationId]);

const app = express();
app.use(express.json());
app.use("/api/v1", growthRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = async (method, p, body) => {
  const r = await fetch(`${base}${p}`, { method, redirect: "manual", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get("content-type") || "";
  return { status: r.status, headers: r.headers, body: ct.includes("json") ? await r.json() : null, raw: ct.includes("image") ? Buffer.from(await r.arrayBuffer()) : null };
};

let contactId = null;
let conversationId = null;
try {
  if (otherFlowRow) {
    const wrong = await call("POST", "/growth-links", { integrationId, name: "x", flowId: otherFlowRow.id });
    assert.equal(wrong.status, 400, "a flow of another bot account is refused (bot scope)");
  }
  const created = await call("POST", "/growth-links", { integrationId, name: "Shop window QR", flowId, labelId, prefillText: "Hi from the shop!" });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const link = created.body.link;
  assert.match(link.code, /^[A-Z2-9]{8}$/);
  assert.match(link.chatUrl, /^https:\/\/wa\.me\/8801700000001\?text=Hi%20from%20the%20shop!%20\(ref%20/);
  ok("link created (bot-scoped flow, label, WhatsApp pre-filled text)");

  const png = await call("GET", `/growth-links/${link.id}/qr`);
  assert.equal(png.status, 200);
  assert.equal(png.raw.subarray(1, 4).toString(), "PNG");
  const svg = await fetch(`${base}/growth-links/${link.id}/qr?format=svg`, { headers: { Authorization: `Bearer ${token}` } });
  assert.match(await svg.text(), /<svg/);
  ok("QR code as PNG and SVG");

  const go = await fetch(`${base}/go/${link.code}`, { redirect: "manual" });
  assert.equal(go.status, 302);
  assert.equal(go.headers.get("location"), link.chatUrl);
  await fetch(`${base}/go/${link.code.toLowerCase()}`, { redirect: "manual" });
  assert.equal((await fetch(`${base}/go/NOPE0000`, { redirect: "manual" })).status, 404);
  let [[row]] = await pool.query("SELECT clicks FROM growth_links WHERE id = ?", [link.id]);
  assert.equal(row.clicks, 2);
  ok("public /go/<code> redirects to the chat and counts each click; unknown code → 404");

  // Someone arrives with the code in their first WhatsApp message.
  const [c] = await pool.query("INSERT INTO contacts (agency_id, platform, external_id, name, source) VALUES (?, 'WHATSAPP', ?, 'Growth Tester', 'INCOMING')", [agencyId, `88017${Date.now() % 100000000}`]);
  contactId = c.insertId;
  const [cv] = await pool.query("INSERT INTO conversations (agency_id, contact_id, integration_id, status) VALUES (?, ?, ?, 'OPEN')", [agencyId, contactId, integrationId]);
  conversationId = cv.insertId;
  const [[conversation]] = await pool.query("SELECT * FROM conversations WHERE id = ?", [conversationId]);
  const [[contact]] = await pool.query("SELECT * FROM contacts WHERE id = ?", [contactId]);
  const code = extractGrowthCode({ platform: "WHATSAPP", text: `Hi from the shop! (ref ${link.code})` });
  const started = await handleGrowthLinkArrival({ agencyId, integration, platform: "WHATSAPP", conversation, contact, code });
  assert.equal(started, true, "the link's flow was started");
  [[row]] = await pool.query("SELECT starts, new_subscribers FROM growth_links WHERE id = ?", [link.id]);
  assert.equal(row.starts, 1);
  assert.equal(row.new_subscribers, 1, "a just-created subscriber counts as new");
  const [[labelled]] = await pool.query("SELECT 1 x FROM contact_labels WHERE contact_id = ? AND label_id = ?", [contactId, labelId]);
  assert.ok(labelled, "label added");
  const [[sess]] = await pool.query("SELECT flow_id FROM flow_sessions WHERE conversation_id = ? ORDER BY id DESC LIMIT 1", [conversationId]);
  assert.equal(sess.flow_id, flowId);
  ok("arrival through the link: counted, labelled, the link's flow started");

  const off = await call("PUT", `/growth-links/${link.id}`, { isActive: false });
  assert.equal(off.body.link.isActive, false);
  assert.equal((await fetch(`${base}/go/${link.code}`, { redirect: "manual" })).status, 404, "a switched-off link stops redirecting");
  assert.equal(await handleGrowthLinkArrival({ agencyId, integration, platform: "WHATSAPP", conversation, contact, code }), false);
  ok("switched off: no redirect, no flow");

  const [[other]] = await pool.query("SELECT a.id, a.owner_id FROM agencies a WHERE a.id <> ? AND a.owner_id IS NOT NULL ORDER BY a.id LIMIT 1", [agencyId]);
  const otherToken = jwt.sign({ id: other.owner_id, role: "RESELLER", agencyId: other.id }, process.env.JWT_SECRET, { expiresIn: "10m" });
  const foreign = await fetch(`${base}/growth-links/${link.id}/qr`, { headers: { Authorization: `Bearer ${otherToken}` } });
  assert.ok([403, 404].includes(foreign.status), `another workspace can't reach the link (${foreign.status})`);
  ok("another workspace can't read, change or download it");

  assert.equal((await call("DELETE", `/growth-links/${link.id}`)).status, 200);
  console.log("✅ Growth tools: all checks passed");
} finally {
  await pool.query("DELETE FROM growth_links WHERE integration_id = ?", [integrationId]);
  if (conversationId) await pool.query("DELETE FROM conversations WHERE id = ?", [conversationId]);
  if (contactId) await pool.query("DELETE FROM contacts WHERE id = ?", [contactId]);
  await pool.query("DELETE FROM labels WHERE id = ?", [labelId]);
  await pool.query("DELETE FROM flows WHERE id = ?", [flowId]);
  // The flow's send to Meta fails with the fake token and is written to the Bot Error Log.
  await pool.query("DELETE FROM bot_error_logs WHERE integration_id = ?", [integrationId]);
  await pool.query("DELETE FROM integrations WHERE id = ?", [integrationId]);
  server.close();
  await pool.end();
  setTimeout(() => process.exit(process.exitCode || 0), 100);
}
