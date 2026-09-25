/**
 * Cross-tenant isolation: proves that one reseller (and that reseller's
 * customers) can never see or change another reseller's data through the real
 * API.
 *
 * It builds two resellers, R1 and R2, with one customer each (C1, C2), puts a
 * uniquely-marked row in EVERY table that carries an agency_id, then attacks
 * every real route from each tenant using the other tenants' ids and query
 * parameters. A leak is a response containing another tenant's marker, or a
 * request that changes any seeded table.
 *
 * Talks to the real database, so it is opt-in:  npm run test:tenant
 * (that wrapper sets TENANT_ISOLATION=1). It cleans up everything it creates.
 */
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import pool from "../db.js";
import {
  buildApp, listen, enumerateRoutes, createTenants, cleanupTenants, seedAll, scan, markerFor, findBackgroundNoise,
} from "./helpers/tenantIsolation.js";

const enabled = process.env.TENANT_ISOLATION === "1";

test("cross-tenant isolation", { skip: !enabled && "set TENANT_ISOLATION=1 (npm run test:tenant)", timeout: 30 * 60 * 1000 }, async (t) => {
  const { app, routers } = await buildApp();
  const { server, port } = await listen(app);
  const routes = enumerateRoutes(routers);
  const tenants = await createTenants();
  const api = async (who, method, path, body) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/v1${path}`, {
      method,
      headers: { authorization: `Bearer ${who.token}`, "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };

  try {
    const info = await seedAll(tenants);
    const seededTables = Object.keys(tenants.R1.seeded).filter((k) => !k.startsWith("__failed") && !["agencies", "users", "team_users"].includes(k));
    const failedTables = Object.keys(tenants.R1.seeded).filter((k) => k.startsWith("__failed"));
    console.log(`\nroutes under test: ${routes.length}   tables seeded per tenant: ${seededTables.length}   tables that could not be seeded: ${failedTables.length}`);
    if (failedTables.length) console.log("  not seeded:", failedTables.map((k) => k.replace("__failed:", "")).join(", "));
    assert.ok(seededTables.length > 20, "seeding should cover most tenant tables");

    // ── 1. The reseller User Manager API ─────────────────────────────────────
    await t.test("reseller users API: each reseller sees and can touch only their own users", async () => {
      const r1 = await api(tenants.R1, "GET", "/reseller/users");
      const r2 = await api(tenants.R2, "GET", "/reseller/users");
      assert.equal(r1.status, 200);
      assert.deepEqual(r1.json.users.map((u) => u.id), [tenants.C1.userId]);
      assert.deepEqual(r2.json.users.map((u) => u.id), [tenants.C2.userId]);

      const other = tenants.C2.userId;
      assert.equal((await api(tenants.R1, "PUT", `/reseller/users/${other}`, { name: "hijack" })).status, 404);
      assert.equal((await api(tenants.R1, "PATCH", `/reseller/users/${other}/toggle`)).status, 404);
      assert.equal((await api(tenants.R1, "DELETE", `/reseller/users/${other}`)).status, 404);
      const [[still]] = await pool.query("SELECT name, is_active FROM users WHERE id = ?", [other]);
      assert.notEqual(still.name, "hijack");
      assert.equal(still.is_active, 1);

      const cust = tenants.C2.agencyId;
      assert.equal((await api(tenants.R1, "PATCH", `/reseller/customers/${cust}/toggle`)).status, 404);
      assert.equal((await api(tenants.R1, "PATCH", `/reseller/customers/${cust}/package`, { agencyPackageId: 1 })).status, 404);
    });

    await t.test("a customer is not a reseller and cannot use reseller routes", async () => {
      assert.equal((await api(tenants.C1, "GET", "/reseller/users")).status, 403);
      assert.equal((await api(tenants.C1, "POST", "/reseller/users", { name: "x", email: "iso-x@example.invalid", password: "secret1" })).status, 403);
    });

    await t.test("email checks do not reveal other resellers' users", async () => {
      const dupOther = await api(tenants.R1, "POST", "/reseller/users", { name: "Dup", email: tenants.C2.email, password: "secret1" });
      const dupOwn = await api(tenants.R1, "POST", "/reseller/users", { name: "Dup", email: tenants.C1.email, password: "secret1" });
      assert.equal(dupOther.status, 400);
      assert.equal(dupOther.json.message, dupOwn.json.message, "same message whether the address is theirs or someone else's");
      assert.ok(!/already/i.test(dupOther.json.message), "message must not say the address is in use");
    });

    await t.test("a deactivated workspace is locked out immediately", async () => {
      await pool.query("UPDATE agencies SET is_active = 0 WHERE id = ?", [tenants.C1.agencyId]);
      const { invalidateTenantCache } = await import("../middleware/tenant.js");
      invalidateTenantCache();
      const res = await api(tenants.C1, "GET", "/conversations");
      await pool.query("UPDATE agencies SET is_active = 1 WHERE id = ?", [tenants.C1.agencyId]);
      invalidateTenantCache();
      assert.equal(res.status, 403);
    });

    await t.test("a token pointing at a workspace the user does not belong to is refused", async () => {
      const jwt = (await import("jsonwebtoken")).default;
      const forged = jwt.sign(
        { id: tenants.R1.userId, role: "RESELLER", agencyId: tenants.R2.agencyId, accountType: "RESELLER" },
        process.env.JWT_SECRET, { expiresIn: "5m" }
      );
      const res = await api({ token: forged }, "GET", "/conversations");
      assert.equal(res.status, 403);
    });

    // ── 1b. Converted routes still work for their own workspace ──────────────
    await t.test("canned responses: full CRUD works inside one workspace, and only there", async () => {
      const made = await api(tenants.R1, "POST", "/canned-responses", { title: "Hello", body: "Hi there", shortcut: "/Greeting" });
      assert.equal(made.status, 201);
      assert.equal(made.json.cannedResponse.shortcut, "greeting");
      const id = made.json.cannedResponse.id;

      const listOwn = await api(tenants.R1, "GET", "/canned-responses");
      assert.ok(listOwn.json.cannedResponses.some((c) => c.id === id));
      const listOther = await api(tenants.R2, "GET", "/canned-responses");
      assert.ok(!listOther.json.cannedResponses.some((c) => c.id === id));

      const edited = await api(tenants.R1, "PUT", `/canned-responses/${id}`, { title: "Hello 2", body: "Hi again", shortcut: "" });
      assert.equal(edited.status, 200);
      assert.equal(edited.json.cannedResponse.title, "Hello 2");
      assert.equal((await api(tenants.R2, "PUT", `/canned-responses/${id}`, { title: "x", body: "x" })).status, 404);

      await api(tenants.R2, "DELETE", `/canned-responses/${id}`); // someone else's id: silently nothing
      assert.equal((await api(tenants.R1, "GET", "/canned-responses")).json.cannedResponses.some((c) => c.id === id), true);
      await api(tenants.R1, "DELETE", `/canned-responses/${id}`);
      assert.equal((await api(tenants.R1, "GET", "/canned-responses")).json.cannedResponses.some((c) => c.id === id), false);
    });

    await t.test("tenantDb refuses global tables and unknown columns, and forces the workspace", async () => {
      const { tenantDb } = await import("../utils/tenantDb.js");
      const db1 = tenantDb(tenants.R1.agencyId);
      await assert.rejects(() => db1.list("packages"), /not a workspace-owned table/);
      await assert.rejects(() => db1.list("users"), /not a workspace-owned table/);
      await assert.rejects(() => db1.list("quick_replies", { where: { nope: 1 } }), /no column/);
      await assert.rejects(() => db1.list("quick_replies; DROP TABLE users"), /not a workspace-owned table/);
      await assert.throws(() => tenantDb({}), /no workspace/);
      // A supplied agency_id is ignored: the row lands in the caller's workspace.
      const id = await db1.insert("quick_replies", { title: "t", body: "b", agency_id: tenants.R2.agencyId });
      assert.equal((await db1.getOwned("quick_replies", id)).agency_id, tenants.R1.agencyId);
      assert.equal(await tenantDb(tenants.R2.agencyId).getOwned("quick_replies", id), null);
      assert.equal(await tenantDb(tenants.R2.agencyId).updateOwned("quick_replies", id, { title: "x" }), 0);
      assert.equal(await tenantDb(tenants.R2.agencyId).deleteOwned("quick_replies", id), 0);
      assert.equal(await db1.deleteOwned("quick_replies", id), 1);
    });

    await t.test("chat orders and bot rules cannot be reached without ownership", async () => {
      const R2 = tenants.R2;
      const order = R2.seeded.chat_orders;
      const bot = R2.seeded.bots;
      const [[o]] = await pool.query("SELECT access_token FROM chat_orders WHERE id = ?", [order]);
      // Public checkout routes: no token -> not found; wrong token -> not found; right token -> ok.
      assert.equal((await api(tenants.R1, "GET", `/payments/order/${order}`)).status, 404);
      assert.equal((await api(tenants.R1, "GET", `/payments/order/${order}?t=${"0".repeat(32)}`)).status, 404);
      assert.equal((await api(tenants.R1, "POST", `/payments/order/${order}/simulate-pay`, {})).status, 404);
      const legit = await api(tenants.R1, "GET", `/payments/order/${order}?t=${o.access_token}`);
      assert.equal(legit.status, 200);
      assert.equal(legit.json.order.access_token, undefined, "the token itself is never sent back");
      // Bot rules belong to the bot's workspace.
      assert.equal((await api(tenants.R1, "GET", `/bots/${bot}/rules`)).status, 404);
      assert.equal((await api(tenants.R1, "POST", `/bots/${bot}/rules`, { triggerKeyword: "x", replyMessage: "y" })).status, 404);
      assert.equal((await api(tenants.R1, "DELETE", `/bots/${bot}/rules/${R2.seeded.bot_rules}`)).status, 404);
      assert.equal((await api(tenants.R2, "GET", `/bots/${bot}/rules`)).status, 200);
    });

    await t.test("the public landing-widgets list only exposes the platform's own widgets", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/webchat/landing-widgets`);
      const body = await res.text();
      for (const tn of tenants.all) assert.ok(!body.includes(markerFor(tn.agencyId)), `${tn.label}'s widget must not be listed`);
    });

    await t.test("sign-up: any address gets its own new workspace; only a verified reseller address makes a reseller customer", async () => {
      const post = (domain, email) => fetch(`http://127.0.0.1:${port}/api/v1/auth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Signup Probe", email, password: "secret12", domain }),
      }).then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }));
      const stamp = Date.now();
      const emailA = `iso-test-signup-a-${stamp}@example.invalid`;
      const emailB = `iso-test-signup-b-${stamp}@example.invalid`;
      const emailC = `iso-test-signup-c-${stamp}@example.invalid`;
      const tenantIds = tenants.all.map((tn) => tn.agencyId);
      const accountOf = async (email) => {
        const [[row]] = await pool.query(
          "SELECT u.id AS userId, a.id AS agencyId, a.account_type, a.parent_agency_id FROM users u JOIN agencies a ON a.owner_id = u.id WHERE u.email = ?", [email]);
        return row;
      };
      try {
        // Registration is open on every address (decided): an unrecognised one
        // creates a brand-new independent End User workspace — never a seat in
        // (or a child of) any existing tenant.
        const tenantInfo = await (await fetch(`http://127.0.0.1:${port}/api/v1/auth/tenant?domain=nobody-knows-this.example.test`)).json();
        assert.equal(tenantInfo.agency.allowUserRegistration, true);
        const open = await post("nobody-knows-this.example.test", emailA);
        assert.equal(open.status, 201, `unrecognised address should allow sign-up (got ${open.status})`);
        const a = await accountOf(emailA);
        assert.equal(a.account_type, "DIRECT_CUSTOMER");
        assert.equal(a.parent_agency_id, null);
        assert.ok(!tenantIds.includes(a.agencyId), "must get a new workspace, not an existing tenant's");
        const [[seats]] = await pool.query("SELECT COUNT(*) n FROM organization_members WHERE user_id = ? AND agency_id IN (?)", [a.userId, tenantIds]);
        assert.equal(seats.n, 0, "must not become a member of any existing tenant");

        // An unverified reseller domain is unrecognised: own workspace, NOT that reseller's customer.
        await pool.query("UPDATE agencies SET custom_domain = 'iso-r1.example.test', domain_verified = 0 WHERE id = ?", [tenants.R1.agencyId]);
        assert.equal((await post("iso-r1.example.test", emailC)).status, 201);
        const c = await accountOf(emailC);
        assert.equal(c.account_type, "DIRECT_CUSTOMER");
        assert.equal(c.parent_agency_id, null, "an unverified reseller domain must not attach sign-ups to that reseller");

        // Verified: the person becomes a new customer of THAT reseller.
        await pool.query("UPDATE agencies SET domain_verified = 1 WHERE id = ?", [tenants.R1.agencyId]);
        const ok = await post("iso-r1.example.test", emailB);
        assert.ok([200, 201].includes(ok.status), `verified reseller domain should allow sign-up (got ${ok.status})`);
        const b = await accountOf(emailB);
        assert.equal(b.account_type, "RESELLER_CUSTOMER");
        assert.equal(b.parent_agency_id, tenants.R1.agencyId);
      } finally {
        await pool.query("UPDATE agencies SET custom_domain = NULL, domain_verified = 0 WHERE id = ?", [tenants.R1.agencyId]);
        for (const email of [emailA, emailB, emailC]) {
          const [[u]] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
          if (!u) continue;
          const [[ag]] = await pool.query("SELECT id FROM agencies WHERE owner_id = ?", [u.id]);
          if (ag) {
            await pool.query("DELETE FROM conversations WHERE agency_id = ?", [ag.id]);
            await pool.query("DELETE FROM organization_members WHERE agency_id = ?", [ag.id]);
            await pool.query("DELETE FROM agencies WHERE id = ?", [ag.id]);
          }
          await pool.query("DELETE FROM email_verification_tokens WHERE user_id = ?", [u.id]).catch(() => {});
          await pool.query("DELETE FROM users WHERE id = ?", [u.id]);
        }
      }
    });

    // ── 1c. Follow-up reminders ──────────────────────────────────────────────
    await t.test("follow-ups: title/description/time are validated and scoped to the workspace", async () => {
      const R1 = tenants.R1, R2 = tenants.R2;
      const contactId = R1.seeded.contacts;
      const inHour = new Date(Date.now() + 3600000).toISOString();
      const good = await api(R1, "POST", "/follow-ups", { contactId, title: "Call back", note: "Ask about the quote", dueAt: inHour });
      assert.equal(good.status, 201);
      const id = good.json.followUpId;

      const bad = (body, expected) => api(R1, "POST", "/follow-ups", { contactId, dueAt: inHour, ...body }).then((r) => assert.equal(r.status, expected, JSON.stringify(body)));
      await bad({ title: "" }, 400);
      await bad({ title: "   " }, 400);
      await bad({ title: "x".repeat(161) }, 400);
      await bad({ title: "ok", note: "y".repeat(2001) }, 400);
      await bad({ title: "ok", dueAt: "not a date" }, 400);
      assert.equal((await api(R1, "POST", "/follow-ups", { contactId, title: "no time" })).status, 400);
      assert.equal((await api(R1, "POST", "/follow-ups", { contactId, title: "ok", dueAt: inHour })).status, 201, "description is optional");
      // Someone else's contact / conversation / team member cannot be referenced.
      assert.equal((await api(R1, "POST", "/follow-ups", { contactId: R2.seeded.contacts, title: "x", dueAt: inHour })).status, 404);
      assert.equal((await api(R1, "POST", "/follow-ups", { contactId, conversationId: R2.seeded.conversations, title: "x", dueAt: inHour })).status, 404);
      const [[r2profile]] = await pool.query("SELECT id FROM agent_profiles WHERE user_id = ?", [R2.teamUserId]);
      assert.equal((await api(R1, "POST", "/follow-ups", { contactId, title: "x", dueAt: inHour, assignedToAgentProfileId: r2profile.id })).status, 400);

      const list = await api(R1, "GET", `/follow-ups?contactId=${contactId}`);
      const row = list.json.followUps.find((f) => f.id === id);
      assert.equal(row.title, "Call back");
      assert.equal(row.note, "Ask about the quote");
      assert.equal(row.snooze_count, 0);
      assert.ok(!(await api(R2, "GET", "/follow-ups")).json.followUps.some((f) => f.id === id));

      assert.equal((await api(R1, "PUT", `/follow-ups/${id}`, { title: "Call back today" })).status, 200);
      assert.equal((await api(R1, "PUT", `/follow-ups/${id}`, { title: "" })).status, 400);
      assert.equal((await api(R2, "PUT", `/follow-ups/${id}`, { title: "hijack" })).status, 404);
      await pool.query("DELETE FROM follow_ups WHERE agency_id = ? AND contact_id = ? AND title IN ('Call back today','ok')", [R1.agencyId, contactId]);
    });

    await t.test("follow-ups: snooze validates, moves the due time, re-arms the alert, and is workspace-scoped", async () => {
      const R1 = tenants.R1, R2 = tenants.R2;
      const contactId = R1.seeded.contacts;
      const past = new Date(Date.now() - 60000).toISOString();
      const id = (await api(R1, "POST", "/follow-ups", { contactId, title: "Snooze me", dueAt: past })).json.followUpId;
      await pool.query("UPDATE follow_ups SET alerted_at = NOW() WHERE id = ?", [id]); // as if it had already fired

      for (const minutes of [0, -5, 1.5, "abc", null, 7 * 24 * 60 + 1]) {
        assert.equal((await api(R1, "POST", `/follow-ups/${id}/snooze`, { minutes })).status, 400, `minutes=${minutes}`);
      }
      assert.equal((await api(R2, "POST", `/follow-ups/${id}/snooze`, { minutes: 10 })).status, 404);

      const before = Date.now();
      const ok = await api(R1, "POST", `/follow-ups/${id}/snooze`, { minutes: 120 });
      assert.equal(ok.status, 200);
      assert.equal(ok.json.snoozeCount, 1);
      const [[row]] = await pool.query("SELECT due_at, alerted_at, snooze_count FROM follow_ups WHERE id = ?", [id]);
      const dueMs = new Date(row.due_at).getTime();
      assert.ok(Math.abs(dueMs - (before + 120 * 60000)) < 10000, "due time is about two hours out");
      assert.equal(row.alerted_at, null, "the alert is re-armed");
      assert.equal(row.snooze_count, 1);

      // A finished one cannot be snoozed or edited until reopened.
      await api(R1, "PATCH", `/follow-ups/${id}/status`, { status: "COMPLETED" });
      assert.equal((await api(R1, "POST", `/follow-ups/${id}/snooze`, { minutes: 10 })).status, 400);
      assert.equal((await api(R1, "PUT", `/follow-ups/${id}`, { title: "x" })).status, 400);
      await pool.query("DELETE FROM follow_ups WHERE id = ?", [id]);
    });

    await t.test("follow-up scheduler: fires once per due time, to the right person, and again after a snooze", async () => {
      const { processDueFollowUps } = await import("../utils/followUpScheduler.js");
      const R1 = tenants.R1;
      const contactId = R1.seeded.contacts;
      const past = new Date(Date.now() - 60000).toISOString();
      const events = [];
      const emit = (userId, event, data) => events.push({ userId, event, data });
      const mine = (title) => events.filter((e) => e.data.title === title);

      const [[teamProfile]] = await pool.query("SELECT id FROM agent_profiles WHERE user_id = ?", [R1.teamUserId]);
      const idSelf = (await api(R1, "POST", "/follow-ups", { contactId, title: "iso-self", note: "d1", dueAt: past })).json.followUpId;
      const idTeam = (await api(R1, "POST", "/follow-ups", { contactId, title: "iso-team", dueAt: past, assignedToAgentProfileId: teamProfile.id })).json.followUpId;
      const idFuture = (await api(R1, "POST", "/follow-ups", { contactId, title: "iso-future", dueAt: new Date(Date.now() + 3600000).toISOString() })).json.followUpId;

      await processDueFollowUps({ emit });
      await processDueFollowUps({ emit }); // a second tick must not repeat
      assert.equal(mine("iso-self").length, 1, "fires exactly once");
      assert.equal(mine("iso-self")[0].userId, R1.userId, "unassigned goes to its creator");
      assert.equal(mine("iso-self")[0].event, "follow_up_due");
      assert.equal(mine("iso-self")[0].data.description, "d1");
      assert.equal(mine("iso-team").length, 1);
      assert.equal(mine("iso-team")[0].userId, R1.teamUserId, "assigned goes to the assignee");
      assert.equal(mine("iso-future").length, 0, "not due yet");

      // Snooze re-arms it: once the new time passes it fires again.
      assert.equal((await api(R1, "POST", `/follow-ups/${idSelf}/snooze`, { minutes: 5 })).status, 200);
      await processDueFollowUps({ emit });
      assert.equal(mine("iso-self").length, 1, "not again before the snoozed time");
      await pool.query("UPDATE follow_ups SET due_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?", [idSelf]);
      await processDueFollowUps({ emit });
      assert.equal(mine("iso-self").length, 2, "fires again after the snooze elapses");
      assert.equal(mine("iso-self")[1].data.snoozeCount, 1);

      // A finished or deleted one never fires.
      const idDone = (await api(R1, "POST", "/follow-ups", { contactId, title: "iso-done", dueAt: past })).json.followUpId;
      await api(R1, "PATCH", `/follow-ups/${idDone}/status`, { status: "COMPLETED" });
      await processDueFollowUps({ emit });
      assert.equal(mine("iso-done").length, 0);

      // The "for me" list backing the inbox bell: overdue + mine only.
      const bell = await api(R1, "GET", "/follow-ups?mine=1&status=OVERDUE");
      const titles = bell.json.followUps.map((f) => f.title);
      assert.ok(titles.includes("iso-self"));
      assert.ok(!titles.includes("iso-team"), "assigned to someone else");
      assert.ok(!titles.includes("iso-future"));
      assert.ok(!titles.includes("iso-done"));
      await pool.query("DELETE FROM follow_ups WHERE id IN (?)", [[idSelf, idTeam, idFuture, idDone]]);
    });

    // ── 1d. Real-time connections are verified, not claimed ──────────────────
    await t.test("sockets: workspace rooms need a verified login; webchat rooms need proof of the visitor", async () => {
      const { authenticateSocket, canJoinWebchat } = await import("../utils/socket.js");
      const jwt = (await import("jsonwebtoken")).default;
      const R1 = tenants.R1, R2 = tenants.R2;

      // What the old code trusted: a claimed workspace with no token.
      assert.equal(await authenticateSocket({ auth: { agencyId: R2.agencyId, userId: R2.userId, role: "ADMIN" }, headers: {} }), null);
      assert.equal(await authenticateSocket({ auth: { token: "garbage" }, headers: {} }), null);
      const ok = await authenticateSocket({ auth: { token: R1.token }, headers: {} });
      assert.deepEqual({ userId: ok.userId, agencyId: ok.agencyId }, { userId: R1.userId, agencyId: R1.agencyId });
      // The same token in the httpOnly cookie the REST API uses.
      const viaCookie = await authenticateSocket({ auth: {}, headers: { cookie: `other=1; token=${encodeURIComponent(R1.token)}` } });
      assert.equal(viaCookie.agencyId, R1.agencyId);
      // A valid signature for a workspace the user does not belong to.
      const wrongWorkspace = jwt.sign({ id: R1.userId, role: "RESELLER", agencyId: R2.agencyId }, process.env.JWT_SECRET, { expiresIn: "5m" });
      assert.equal(await authenticateSocket({ auth: { token: wrongWorkspace }, headers: {} }), null);

      // Webchat: wire one seeded conversation up as a real visitor's chat.
      const visitor = `iso-visitor-${Date.now()}`;
      await pool.query("UPDATE contacts SET platform = 'WEBCHAT', external_id = ? WHERE id = ?", [visitor, R1.seeded.contacts]);
      await pool.query("UPDATE integrations SET platform = 'WEBCHAT' WHERE id = ?", [R1.seeded.integrations]);
      await pool.query("UPDATE webchat_widgets SET integration_id = ?, widget_key = ? WHERE id = ?", [R1.seeded.integrations, `wc_iso_${visitor}`, R1.seeded.webchat_widgets]);
      const good = { widgetId: `wc_iso_${visitor}`, sessionId: visitor, conversationId: R1.seeded.conversations };
      assert.equal(await canJoinWebchat(good), true);
      assert.equal(await canJoinWebchat({ ...good, sessionId: "someone-else" }), false, "wrong visitor id");
      assert.equal(await canJoinWebchat({ ...good, widgetId: "wc_not_this_widget" }), false, "wrong widget");
      assert.equal(await canJoinWebchat({ ...good, conversationId: R2.seeded.conversations }), false, "someone else's conversation");
      assert.equal(await canJoinWebchat({ ...good, conversationId: Number(good.conversationId) + 100000 }), false, "guessed id");
      assert.equal(await canJoinWebchat({}), false);
    });

    // ── 2. Attack every route ────────────────────────────────────────────────
    // Background schedulers on this database touch the seeded rows by themselves; find out which
    // tables so a scheduler's write is never blamed on a request. (TENANT_TEST_FAST=1 skips the ~100s wait.)
    const noisy = process.env.TENANT_TEST_FAST === "1"
      ? new Set()
      : await findBackgroundNoise(info, tenants);
    console.log(`  tables that change on their own (excluded from the row-modified check): ${[...noisy].join(", ") || "none"}`);
    const crossReseller = [];
    const sameTree = [];
    for (const attacker of tenants.all) {
      const treeOf = (x) => x.resellerId ?? x.agencyId; // a reseller and its customers form one tree
      const foreign = tenants.all.filter((x) => treeOf(x) !== treeOf(attacker));
      const family = tenants.all.filter((x) => treeOf(x) === treeOf(attacker) && x.agencyId !== attacker.agencyId);
      const strict = await scan({ port, routes, attacker, victims: foreign, tenants, info, ignoreTables: noisy });
      crossReseller.push(...strict.findings);
      if (attacker === tenants.R1 && process.env.SHOW_SKIPPED) console.log("SKIPPED:\n  " + strict.stats.skipped.join("\n  "));
      const familyScan = await scan({ port, routes, attacker, victims: family, tenants, info, ignoreTables: noisy });
      sameTree.push(...familyScan.findings.filter((f) => !f.path.startsWith("/reseller/")));
      console.log(`  ${attacker.label}: ${strict.stats.requests + familyScan.stats.requests} requests, cross-reseller findings ${strict.findings.length}, same-tree findings ${familyScan.findings.length}, id-routes attacked ${strict.stats.paramRoutesHit}, id-routes skipped (no matching seeded table) ${strict.stats.paramRoutesSkipped}`);
    }

    const summarize = (list) => {
      const seen = new Map();
      for (const f of list) {
        const key = `${f.kind} ${f.method} ${f.path}`;
        if (!seen.has(key)) seen.set(key, { ...f, count: 0, attackers: new Set() });
        const e = seen.get(key); e.count++; e.attackers.add(`${f.attacker}->${f.victim}`);
      }
      return [...seen.values()];
    };
    const cr = summarize(crossReseller);
    if (cr.length) {
      console.log(`\nCROSS-RESELLER LEAKS (${cr.length} distinct routes):`);
      for (const f of cr) console.log(`  [${f.kind}] ${f.method} ${f.path}  (${f.file})  status ${f.status}  ${f.evidence || ""}  via ${[...f.attackers].join(", ")}`);
    }
    const st = summarize(sameTree);
    if (st.length) {
      console.log(`\nsame-tree exposure, informational (${st.length} distinct routes):`);
      for (const f of st) console.log(`  [${f.kind}] ${f.method} ${f.path}  (${f.file})  ${f.evidence || ""}`);
    }
    assert.equal(cr.length, 0, `${cr.length} route(s) leak or modify another reseller's data`);
  } finally {
    server.close();
    const left = await cleanupTenants(tenants);
    console.log("cleanup leftovers:", JSON.stringify(left));
    await pool.end();
  }
});
