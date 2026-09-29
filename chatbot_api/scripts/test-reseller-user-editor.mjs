/**
 * The Reseller's full-page user editor API, over HTTP against the real DB:
 * GET /reseller/users/:id, and PUT with the editor's fields (plan, expiry,
 * email verification, active). Creates one customer user and deletes it.
 * Run: npm run test:reseller-user-editor
 */
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import { tenantContext } from "../middleware/tenant.js";
import resellerRoutes from "../routes/resellerCustomers.js";

const ok = (m) => console.log(`  ✔ ${m}`);
const [[reseller]] = await pool.query(
  `SELECT a.id AS agencyId, u.id AS userId, u.token_version AS tv FROM agencies a JOIN users u ON u.id = a.owner_id
    WHERE a.account_type = 'RESELLER' AND a.is_active = 1 ORDER BY a.id LIMIT 1`
);
assert.ok(reseller, "needs an active Reseller");
const [[outsider]] = await pool.query(
  `SELECT a.id AS agencyId, u.id AS userId, u.token_version AS tv FROM agencies a JOIN users u ON u.id = a.owner_id
    WHERE a.account_type = 'DIRECT_CUSTOMER' AND a.is_active = 1 ORDER BY a.id LIMIT 1`
);
// A throw-away customer plan of this reseller (removed at the end).
const [planIns] = await pool.query(
  "INSERT INTO agency_packages (agency_id, name, slug, price, currency, billing_cycle) VALUES (?, 'Editor test plan', ?, 0, 'USD', 'monthly')",
  [reseller.agencyId, `editor-test-${Date.now()}`]
);
const plan = { id: planIns.insertId, name: "Editor test plan" };

const token = (o) => jwt.sign({ id: o.userId, role: "RESELLER", agencyId: o.agencyId, tv: o.tv || 0 }, process.env.JWT_SECRET, { expiresIn: "10m" });
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(tenantContext);
app.use("/api/v1", resellerRoutes);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/v1`;
const call = async (method, path, body, who = reseller) => {
  const r = await fetch(`${base}${path}`, {
    method, headers: { Authorization: `Bearer ${token(who)}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

// Room for one more customer during the run (restored at the end): the
// reseller's plan may already be at its customer limit.
const { getAgencyEntitlements } = await import("../utils/entitlements.js");
const resellerPkgId = (await getAgencyEntitlements(reseller.agencyId, null)).package?.id;
const [[rmRow]] = resellerPkgId
  ? await pool.query("SELECT limits_json FROM package_modules WHERE package_id = ? AND module_key = 'reseller_management'", [resellerPkgId])
  : [[null]];
if (rmRow) {
  const limits = typeof rmRow.limits_json === "string" ? JSON.parse(rmRow.limits_json || "{}") : (rmRow.limits_json || {});
  if (limits.maxResellerCustomers != null) {
    await pool.query("UPDATE package_modules SET limits_json = ? WHERE package_id = ? AND module_key = 'reseller_management'",
      [JSON.stringify({ ...limits, maxResellerCustomers: Number(limits.maxResellerCustomers) + 1 }), resellerPkgId]);
  }
}

let createdUserId = null;
try {
  const email = `editor-test-${Date.now()}@example.com`;
  const created = await call("POST", "/reseller/users", { name: "Editor Test", email, password: "secret123" });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  createdUserId = created.body.user.id;
  ok("create → returns the new user's id (the page then opens its editor)");

  const got = await call("GET", `/reseller/users/${createdUserId}`);
  assert.equal(got.status, 200);
  assert.equal(got.body.user.email, email);
  assert.ok(got.body.user.email_verified_at, "a reseller-created user starts verified");
  assert.ok(got.body.user.usage, "monthly usage included");
  ok("GET /reseller/users/:id returns the editor's data");

  const patch = { phone: "+8801700000000", address: "Dhaka", emailVerified: false };
  if (plan) Object.assign(patch, { packageId: plan.id });
  let put = await call("PUT", `/reseller/users/${createdUserId}`, patch);
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.equal(put.body.user.phone, "+8801700000000");
  assert.equal(put.body.user.email_verified_at, null, "email un-verified");
  if (plan) {
    assert.equal(Number(put.body.user.subscription.package_id), plan.id);
    put = await call("PUT", `/reseller/users/${createdUserId}`, { expiryDate: "2030-01-31T23:59:59" });
    assert.equal(put.status, 200);
    assert.ok(put.body.user.subscription.current_period_end, "expiry stored on the customer's plan");
    put = await call("PUT", `/reseller/users/${createdUserId}`, { expiryDate: null });
    assert.equal(put.body.user.subscription.current_period_end, null, "expiry cleared");
    ok(`plan "${plan.name}" assigned; expiry set and cleared`);
  } else {
    const noPlan = await call("PUT", `/reseller/users/${createdUserId}`, { expiryDate: "2030-01-31T23:59:59" });
    assert.equal(noPlan.status, 400, "no plan → no expiry");
    ok("without a plan an expiry date is refused (the reseller has no plans in this DB)");
  }
  put = await call("PUT", `/reseller/users/${createdUserId}`, { emailVerified: true, isActive: false });
  assert.ok(put.body.user.email_verified_at);
  assert.equal(put.body.user.is_active, false);
  ok("email verified again; account deactivated");

  // Community flags are platform-only: a reseller's PUT ignores them.
  await call("PUT", `/reseller/users/${createdUserId}`, { canForumPost: false, canComment: false, specialCoupon: "X", discountPercent: 50 });
  const [[flags]] = await pool.query("SELECT can_forum_post, can_comment, special_coupon, discount_percent FROM users WHERE id = ?", [createdUserId]);
  assert.equal(flags.special_coupon, null);
  assert.equal(flags.discount_percent, null);
  ok("community / coupon / discount fields sent by a reseller are ignored");

  if (outsider) {
    const other = await call("GET", `/reseller/users/${createdUserId}`, null, outsider);
    assert.ok([403, 404].includes(other.status), `a non-reseller is refused (${other.status})`);
    ok(`another workspace can't open it (${other.status})`);
  }
  assert.equal((await call("GET", "/reseller/users/999999999")).status, 404);
  ok("unknown user → 404");

  const del = await call("DELETE", `/reseller/users/${createdUserId}`);
  assert.equal(del.status, 200);
  createdUserId = null;
  ok("deleted with its workspace");
  console.log("✅ Reseller user editor: all checks passed");
} finally {
  if (createdUserId) await call("DELETE", `/reseller/users/${createdUserId}`).catch(() => {});
  await pool.query("DELETE FROM agency_client_subscriptions WHERE package_id = ?", [plan.id]);
  await pool.query("DELETE FROM agency_packages WHERE id = ?", [plan.id]);
  if (rmRow) {
    await pool.query("UPDATE package_modules SET limits_json = ? WHERE package_id = ? AND module_key = 'reseller_management'",
      [typeof rmRow.limits_json === "string" ? rmRow.limits_json : JSON.stringify(rmRow.limits_json), resellerPkgId]);
  }
  server.close();
  await pool.end();
  setTimeout(() => process.exit(process.exitCode || 0), 100);
}
