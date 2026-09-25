/**
 * End-to-end check of the Broadcasting workflow against the REAL database
 * (opt-in, like test:tenant): mounts routes/broadcasts.js on a throwaway
 * server, signs a login token for an existing workspace owner, and walks
 * every path — create (auto-connected message), account-scoped templates,
 * audience counts vs. SQL, sending modes + the Message Template element,
 * server-side readiness, the audience confirmation gate, schedule /
 * reschedule / cancel. It NEVER sends a message (nothing is confirmed for an
 * instant send, and the scheduler isn't running) and deletes every row it
 * created, even on failure.
 *
 * Run: npm run test:broadcast -- <windowIntegrationId> <templateIntegrationId> <templateId>
 *   windowIntegrationId   a WhatsApp account whose broadcasts are tested in "Inside 24 hours" mode
 *   templateIntegrationId a WhatsApp account that owns <templateId> (an APPROVED template)
 */
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import assert from "node:assert/strict";
import pool from "../db.js";
import broadcastRoutes from "../routes/broadcasts.js";

const [windowIntegrationId, templateIntegrationId, templateId] = process.argv.slice(2).map(Number);
if (!windowIntegrationId || !templateIntegrationId || !templateId) {
  console.error("Usage: npm run test:broadcast -- <windowIntegrationId> <templateIntegrationId> <templateId>");
  process.exit(2);
}

const created = { campaigns: [], flows: [] };
let server;
let passed = 0;

async function step(name, fn) {
  await fn();
  passed++;
  console.log(`  ✔ ${name}`);
}

async function main() {
  const [[winInteg]] = await pool.query("SELECT * FROM integrations WHERE id = ? AND platform = 'WHATSAPP'", [windowIntegrationId]);
  const [[tplInteg]] = await pool.query("SELECT * FROM integrations WHERE id = ? AND platform = 'WHATSAPP'", [templateIntegrationId]);
  assert.ok(winInteg && tplInteg, "both integrations must exist and be WhatsApp");
  assert.equal(winInteg.agency_id, tplInteg.agency_id, "both integrations must be in the same workspace");
  const agencyId = winInteg.agency_id;
  const [[tpl]] = await pool.query("SELECT * FROM whatsapp_templates WHERE id = ? AND integration_id = ? AND status = 'APPROVED'", [templateId, templateIntegrationId]);
  assert.ok(tpl, "templateId must be an APPROVED template of templateIntegrationId");
  const [[owner]] = await pool.query(
    "SELECT u.id, u.role, u.token_version FROM users u JOIN organization_members om ON om.user_id = u.id WHERE om.agency_id = ? AND u.role <> 'USER' AND u.is_active = 1 LIMIT 1",
    [agencyId]
  );
  assert.ok(owner, "the workspace needs an active owner");

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/v1", broadcastRoutes);
  server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const token = jwt.sign({ id: owner.id, agencyId, role: owner.role, tv: owner.token_version || 0 }, process.env.JWT_SECRET, { expiresIn: "10m" });
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, data: await res.json() };
  };
  const eligibleSql = (integrationId, extra = "", params = []) => pool.query(
    `SELECT COUNT(DISTINCT c.id) AS n FROM contacts c WHERE c.agency_id = ? AND c.platform = 'WHATSAPP' AND c.subscription_status = 'SUBSCRIBED'
       AND COALESCE(c.is_blocked, 0) = 0 AND EXISTS (SELECT 1 FROM conversations cv WHERE cv.contact_id = c.id AND cv.integration_id = ?) ${extra}`,
    [agencyId, integrationId, ...params]
  ).then(([[r]]) => Number(r.n));

  console.log(`Broadcast workflow test — workspace #${agencyId}, window account #${windowIntegrationId}, template account #${templateIntegrationId}`);

  // ── Create (Inside 24 hours by default, message auto-connected) ──
  let camp, flowId;
  await step("create: flow gets the chosen account and a connected Send Message element", async () => {
    const r = await call("POST", "/broadcasts/start-with-flow", { name: "ZZ broadcast test", platform: "WHATSAPP", integrationId: windowIntegrationId });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    created.campaigns.push(r.data.campaignId);
    created.flows.push(r.data.flowId);
    flowId = r.data.flowId;
    const [[flow]] = await pool.query("SELECT * FROM flows WHERE id = ?", [flowId]);
    assert.equal(flow.integration_id, windowIntegrationId);
    const nodes = JSON.parse(flow.nodes_json);
    const edges = JSON.parse(flow.edges_json);
    const msg = nodes.find((n) => n.type === "messageBlock");
    assert.ok(msg, "a Send Message element exists");
    assert.ok(edges.some((e) => e.source === "start_1" && e.target === msg.id), "it is connected to the Broadcast element");
    [[camp]] = await pool.query("SELECT * FROM broadcast_campaigns WHERE id = ?", [r.data.campaignId]);
    assert.equal(camp.integration_id, windowIntegrationId);
    assert.equal(camp.status, "DRAFT");
  });

  await step("form-data: templates are only the chosen account's own", async () => {
    const r = await call("GET", `/broadcasts/form-data?platform=WHATSAPP&integrationId=${windowIntegrationId}`);
    const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM whatsapp_templates WHERE integration_id = ? AND status = 'APPROVED'", [windowIntegrationId]);
    assert.equal(r.data.templates.length, Number(n));
    assert.ok(r.data.largeAudienceThreshold > 0);
  });

  // ── Audience ──
  await step("audience: no filter = the account's eligible subscribers (matches SQL), flagged noFilter", async () => {
    const r = await call("POST", "/broadcasts/audience-preview", { campaignId: camp.id });
    assert.equal(r.data.count, await eligibleSql(windowIntegrationId));
    assert.equal(r.data.noFilter, true);
  });
  const [labels] = await pool.query(
    `SELECT cl.label_id AS id, COUNT(*) AS n FROM contact_labels cl JOIN contacts c ON c.id = cl.contact_id
     WHERE c.agency_id = ? GROUP BY cl.label_id ORDER BY n DESC LIMIT 2`, [agencyId]);
  if (labels.length) {
    await step("audience: include one label (matches SQL)", async () => {
      const r = await call("POST", "/broadcasts/audience-preview", { campaignId: camp.id, includeLabelIds: [labels[0].id] });
      assert.equal(r.data.count, await eligibleSql(windowIntegrationId, "AND c.id IN (SELECT contact_id FROM contact_labels WHERE label_id = ?)", [labels[0].id]));
      assert.equal(r.data.noFilter, false);
    });
  }
  if (labels.length > 1) {
    await step("audience: include two labels, exclude one (matches SQL)", async () => {
      const [a, b] = labels.map((l) => l.id);
      const r = await call("POST", "/broadcasts/audience-preview", { campaignId: camp.id, includeLabelIds: [a, b], excludeLabelIds: [b] });
      assert.equal(r.data.count, await eligibleSql(windowIntegrationId,
        "AND c.id IN (SELECT contact_id FROM contact_labels WHERE label_id IN (?, ?)) AND c.id NOT IN (SELECT contact_id FROM contact_labels WHERE label_id = ?)", [a, b, b]));
    });
  }

  // ── Readiness (server side) ──
  await step("inside 24 hours: an empty message is refused by the server", async () => {
    const r = await call("PUT", `/broadcasts/${camp.id}`, { mode: "WINDOW" });
    assert.equal(r.status, 200);
    assert.match(r.data.readyErrors[0] || "", /Add a message/);
    const s = await call("POST", `/broadcasts/${camp.id}/send`, {});
    assert.equal(s.status, 400);
    assert.equal(s.data.code, "BROADCAST_NOT_READY");
  });

  await step("inside 24 hours: with a message it is ready, but an unfiltered send needs confirmation (409)", async () => {
    const nodes = [
      { id: "start_1", type: "start", position: { x: 0, y: 0 }, data: { trigger_type: "broadcast" } },
      { id: "message_1", type: "messageBlock", position: { x: 380, y: 0 }, data: { items: [{ id: "it1", type: "buttons", data: { message: "Hello {{contact.name}}", buttons: [] } }] } },
    ];
    await pool.query("UPDATE flows SET nodes_json = ? WHERE id = ?", [JSON.stringify(nodes), flowId]);
    const r = await call("PUT", `/broadcasts/${camp.id}`, {});
    assert.deepEqual(r.data.readyErrors, []);
    const s = await call("POST", `/broadcasts/${camp.id}/send`, {});
    assert.equal(s.status, 409);
    assert.equal(s.data.code, "AUDIENCE_CONFIRMATION_REQUIRED");
    assert.equal(s.data.noFilter, true);
    const [[still]] = await pool.query("SELECT status FROM broadcast_campaigns WHERE id = ?", [camp.id]);
    assert.equal(still.status, "DRAFT", "nothing was sent");
  });

  await step("anytime: needs a Message Template element right after the Broadcast element", async () => {
    const r = await call("PUT", `/broadcasts/${camp.id}`, { mode: "TEMPLATE" });
    assert.match(r.data.readyErrors[0] || "", /Message Template element/);
  });

  await step("anytime: another account's template is refused (bot scope)", async () => {
    if (windowIntegrationId === templateIntegrationId) return;
    const nodes = [
      { id: "start_1", type: "start", position: { x: 0, y: 0 }, data: { trigger_type: "broadcast" } },
      { id: "tpl_1", type: "whatsappTemplate", position: { x: 380, y: 0 }, data: { templateId, params: {} } },
    ];
    await pool.query("UPDATE flows SET nodes_json = ?, edges_json = ? WHERE id = ?", [JSON.stringify(nodes), JSON.stringify([{ id: "e1", source: "start_1", sourceHandle: "next-step", target: "tpl_1" }]), flowId]);
    const r = await call("PUT", `/broadcasts/${camp.id}`, {});
    assert.match(r.data.readyErrors[0] || "", /approved template of this WhatsApp account/);
  });

  // ── Template account: Message Template element, schedule / reschedule / cancel ──
  let tcamp, tflow;
  await step("anytime: the account's own template in the element is ready to send", async () => {
    const r = await call("POST", "/broadcasts/start-with-flow", { name: "ZZ template broadcast test", platform: "WHATSAPP", integrationId: templateIntegrationId });
    created.campaigns.push(r.data.campaignId);
    created.flows.push(r.data.flowId);
    tflow = r.data.flowId;
    const params = { header: {}, body: {}, buttons: {} };
    for (const m of String(tpl.body_text || "").matchAll(/{{\s*([A-Za-z0-9_]+)\s*}}/g)) params.body[m[1]] = "{{contact.name}}";
    for (const m of String(tpl.header_type === "TEXT" ? tpl.header_text : "").matchAll(/{{\s*([A-Za-z0-9_]+)\s*}}/g)) params.header[m[1]] = "x";
    (typeof tpl.buttons_json === "string" ? JSON.parse(tpl.buttons_json || "[]") : (tpl.buttons_json || [])).forEach((b, i) => { if (String(b.type).toUpperCase() === "URL" && /{{\s*1\s*}}/.test(b.url || "")) params.buttons[i] = "x"; });
    const nodes = [
      { id: "start_1", type: "start", position: { x: 0, y: 0 }, data: { trigger_type: "broadcast" } },
      { id: "tpl_1", type: "whatsappTemplate", position: { x: 380, y: 0 }, data: { templateId, params } },
    ];
    await pool.query("UPDATE flows SET nodes_json = ?, edges_json = ? WHERE id = ?", [JSON.stringify(nodes), JSON.stringify([{ id: "e1", source: "start_1", sourceHandle: "next-step", target: "tpl_1" }]), tflow]);
    const u = await call("PUT", `/broadcasts/${r.data.campaignId}`, { mode: "TEMPLATE" });
    assert.deepEqual(u.data.readyErrors, [], JSON.stringify(u.data));
    [[tcamp]] = await pool.query("SELECT * FROM broadcast_campaigns WHERE id = ?", [r.data.campaignId]);
    assert.equal(tcamp.mode, "TEMPLATE");
  });

  if (!(await eligibleSql(templateIntegrationId))) {
    console.log("  – skipped schedule tests: the template account has no eligible subscribers");
  } else {
    const when1 = new Date(Date.now() + 2 * 24 * 3600 * 1000);
    const when2 = new Date(Date.now() + 3 * 24 * 3600 * 1000);
    await step("schedule: a past time is refused", async () => {
      const r = await call("POST", `/broadcasts/${tcamp.id}/schedule`, { scheduledAt: new Date(Date.now() - 3600e3).toISOString(), confirmAudience: true });
      assert.equal(r.status, 400);
    });
    await step("schedule: unconfirmed no-filter audience is refused (409), confirmed is scheduled", async () => {
      const r1 = await call("POST", `/broadcasts/${tcamp.id}/schedule`, { scheduledAt: when1.toISOString() });
      assert.equal(r1.status, 409);
      const r2 = await call("POST", `/broadcasts/${tcamp.id}/schedule`, { scheduledAt: when1.toISOString(), confirmAudience: true });
      assert.equal(r2.status, 200, JSON.stringify(r2.data));
      const [[c]] = await pool.query("SELECT status, scheduled_at FROM broadcast_campaigns WHERE id = ?", [tcamp.id]);
      assert.equal(c.status, "SCHEDULED");
    });
    await step("reschedule: same campaign row, new time, no duplicate", async () => {
      const r = await call("POST", `/broadcasts/${tcamp.id}/schedule`, { scheduledAt: when2.toISOString(), confirmAudience: true });
      assert.equal(r.data.rescheduled, true);
      const [rows] = await pool.query("SELECT id, status, scheduled_at FROM broadcast_campaigns WHERE flow_id = ?", [tflow]);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].status, "SCHEDULED");
      assert.ok(Math.abs(new Date(rows[0].scheduled_at).getTime() - when2.getTime()) < 2000, "time moved to the new one");
    });
    await step("editing the audience of a scheduled campaign keeps its time", async () => {
      const before = (await pool.query("SELECT scheduled_at FROM broadcast_campaigns WHERE id = ?", [tcamp.id]))[0][0].scheduled_at;
      await call("PUT", `/broadcasts/${tcamp.id}`, { includeLabelIds: [] });
      const [[c]] = await pool.query("SELECT status, scheduled_at FROM broadcast_campaigns WHERE id = ?", [tcamp.id]);
      assert.equal(c.status, "SCHEDULED");
      assert.equal(new Date(c.scheduled_at).getTime(), new Date(before).getTime());
    });
    await step("cancel: back to draft", async () => {
      const r = await call("POST", `/broadcasts/${tcamp.id}/cancel`, {});
      assert.equal(r.status, 200);
      const [[c]] = await pool.query("SELECT status FROM broadcast_campaigns WHERE id = ?", [tcamp.id]);
      assert.equal(c.status, "DRAFT");
    });
  }

  await step("no message was sent by this test", async () => {
    const [[{ n }]] = await pool.query(`SELECT COUNT(*) AS n FROM broadcast_logs WHERE campaign_id IN (${created.campaigns.map(() => "?").join(",")})`, created.campaigns);
    assert.equal(Number(n), 0);
  });

  console.log(`\n${passed} checks passed.`);
}

main()
  .catch((err) => {
    console.error(`\n✖ FAILED after ${passed} passing check(s):`, err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (created.campaigns.length) await pool.query(`DELETE FROM broadcast_logs WHERE campaign_id IN (${created.campaigns.map(() => "?").join(",")})`, created.campaigns).catch(() => {});
    if (created.campaigns.length) await pool.query(`DELETE FROM broadcast_campaigns WHERE id IN (${created.campaigns.map(() => "?").join(",")})`, created.campaigns).catch(() => {});
    if (created.flows.length) await pool.query(`DELETE FROM flows WHERE id IN (${created.flows.map(() => "?").join(",")})`, created.flows).catch(() => {});
    console.log("Cleaned up test campaigns and flows.");
    server?.close();
    await pool.end();
  });
