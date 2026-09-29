/**
 * A Reseller package's limits, against the real DB:
 * - "Subscribers" (packages.max_subscribers) is ONE total for the reseller and
 *   all of its customers together;
 * - every other limit is a cap for each account on its own — a customer never
 *   gets more than the reseller's package, even on an "unlimited" customer plan.
 * Temporarily changes the reseller's package (and its customer's plan) and
 * restores them; creates nothing. Run: npm run test:reseller-limits
 */
import assert from "node:assert/strict";
import pool from "../db.js";
import { assertLimit, getAgencyEntitlements } from "../utils/entitlements.js";

const [rows] = await pool.query(
  `SELECT r.id AS resellerId, MIN(c.id) AS customerId
     FROM agencies r JOIN agencies c ON c.parent_agency_id = r.id AND c.account_type = 'RESELLER_CUSTOMER'
    WHERE r.account_type = 'RESELLER' GROUP BY r.id`
);
let target = null;
for (const r of rows) {
  const ent = await getAgencyEntitlements(r.resellerId, null);
  if (ent.package?.id) { target = { ...r, packageId: ent.package.id }; break; }
}
assert.ok(target, "needs a Reseller with at least one customer");

const [[pkg]] = await pool.query("SELECT max_subscribers, max_team_members, max_bot_accounts FROM packages WHERE id = ?", [target.packageId]);
// The customer's own plan from its reseller, if any — restored at the end.
const [[customerPlan]] = await pool.query(
  `SELECT p.id, p.max_team_members FROM agency_client_subscriptions acs JOIN agency_packages p ON p.id = acs.package_id
    WHERE acs.client_agency_id = ? AND acs.status = 'ACTIVE' ORDER BY acs.id DESC LIMIT 1`,
  [target.customerId]
);
const setLimit = (max) => pool.query("UPDATE packages SET max_subscribers = ? WHERE id = ?", [max, target.packageId]);
const tryAdd = (agencyId, n = 1) => assertLimit(agencyId, "max_subscribers", n, null).then(() => "ok", (e) => e.code);

try {
  const [[{ n: used }]] = await pool.query(
    `SELECT COUNT(*) n FROM contacts WHERE agency_id = ?
        OR agency_id IN (SELECT id FROM agencies WHERE parent_agency_id = ? AND account_type = 'RESELLER_CUSTOMER')`,
    [target.resellerId, target.resellerId]
  );
  console.log(`Reseller #${target.resellerId} (package #${target.packageId}): ${used} subscribers for it and its customers together`);

  await setLimit(used);
  assert.notEqual(await tryAdd(target.customerId), "ok", "at the limit → a customer is refused");
  assert.notEqual(await tryAdd(target.resellerId), "ok", "at the limit → the reseller itself is refused");
  console.log("  ✔ limit reached → neither a customer nor the reseller can add a subscriber");

  await setLimit(used + 2);
  assert.equal(await tryAdd(target.customerId, 1), "ok", "room left → a customer may add");
  assert.equal(await tryAdd(target.resellerId, 1), "ok", "room left → the reseller may add");
  assert.equal(await tryAdd(target.customerId, 3), "RESELLER_POOL_LIMIT_EXCEEDED", "a batch larger than the room left → refused");
  console.log("  ✔ room left → allowed; a batch that doesn't fit → refused");

  await setLimit(null);
  assert.equal(await tryAdd(target.customerId), "ok", "blank = unlimited");
  console.log("  ✔ blank = unlimited");

  // Every other limit: a per-account cap for the reseller and each customer.
  await pool.query("UPDATE packages SET max_team_members = 10, max_bot_accounts = 10 WHERE id = ?", [target.packageId]);
  const cust = await getAgencyEntitlements(target.customerId, null);
  const res = await getAgencyEntitlements(target.resellerId, null);
  assert.equal(res.limits.maxTeamMembers, 10);
  assert.equal(cust.limits.maxTeamMembers, customerPlan?.max_team_members != null ? Math.min(10, customerPlan.max_team_members) : 10,
    "customer gets the reseller's per-account cap (or its own plan when that's lower)");
  assert.equal(cust.limits.maxBotAccounts <= 10, true, "customer can't connect more accounts than the reseller's package allows");
  if (customerPlan) {
    await pool.query("UPDATE agency_packages SET max_team_members = NULL WHERE id = ?", [customerPlan.id]);
    assert.equal((await getAgencyEntitlements(target.customerId, null)).limits.maxTeamMembers, 10, "an 'unlimited' customer plan is still capped at the reseller's 10");
    await pool.query("UPDATE agency_packages SET max_team_members = 3 WHERE id = ?", [customerPlan.id]);
    assert.equal((await getAgencyEntitlements(target.customerId, null)).limits.maxTeamMembers, 3, "a lower customer plan wins");
  }
  // Not pooled any more: the reseller's own team doesn't eat into customers' allowance.
  const teamPool = await assertLimit(target.customerId, "max_team_members", 1, null).then(() => "ok", (e) => e.code);
  assert.notEqual(teamPool, "RESELLER_POOL_LIMIT_EXCEEDED", "team members aren't a shared total");
  console.log("  ✔ other limits (team members, accounts): the reseller's number applies to each customer on its own; 'unlimited' plans are capped by it");

  console.log("✅ Reseller subscriber limit: all checks passed");
} finally {
  await pool.query(
    "UPDATE packages SET max_subscribers = ?, max_team_members = ?, max_bot_accounts = ? WHERE id = ?",
    [pkg.max_subscribers, pkg.max_team_members, pkg.max_bot_accounts, target.packageId]
  );
  if (customerPlan) await pool.query("UPDATE agency_packages SET max_team_members = ? WHERE id = ?", [customerPlan.max_team_members, customerPlan.id]);
  await pool.end();
}
