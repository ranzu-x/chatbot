/**
 * Plan expiry (read-only) + checkout discounts, against the real DB.
 * Opt-in: `npm run test:billing`. Creates a throwaway account and coupons,
 * never calls a payment gateway, and deletes everything afterwards.
 */
import assert from "node:assert/strict";
import pool from "../db.js";
import { createAccount } from "../utils/accountProvisioning.js";
import { assignPackageLocally } from "../services/stripeService.js";
import { getSubscriptionState, invalidateSubscriptionCache } from "../utils/subscriptionStatus.js";
import { subscriptionGuard } from "../middleware/subscriptionGuard.js";
import { sendPlatformMessage } from "../utils/platformSender.js";
import { priceForCheckout, recordCouponRedemption } from "../utils/checkoutPricing.js";

const tag = String(Date.now()).slice(-7);
const created = { userId: null, agencyId: null, couponIds: [], packageRestore: null };
let passed = 0;
const ok = (name) => { passed += 1; console.log(`  ✔ ${name}`); };

async function guard(method, path, agencyId) {
  let status = 200;
  let nextCalled = false;
  const res = { status(s) { status = s; return this; }, json() { return this; } };
  await subscriptionGuard({ method, path, tenant: { agencyId, role: "RESELLER" } }, res, () => { nextCalled = true; });
  return nextCalled ? 200 : status;
}

async function main() {
  const { userId, agencyId } = await createAccount({ fullName: "Billing Tester", email: `billing-test-${tag}@example.test`, passwordHash: "x", businessName: `Billing Test ${tag}`, source: "test" });
  Object.assign(created, { userId, agencyId });

  // 1 ─ the free signup plan never expires
  invalidateSubscriptionCache();
  let state = await getSubscriptionState(agencyId);
  assert.equal(state.expired, false);
  const [[freeSub]] = await pool.query("SELECT expires_at FROM subscriptions WHERE agency_id = ? ORDER BY id DESC LIMIT 1", [agencyId]);
  assert.equal(freeSub.expires_at, null);
  ok("free signup plan has no end date and isn't expired");

  // 2 ─ a monthly plan ends one month later; renewing early adds a month after that
  const [[monthly]] = await pool.query("SELECT * FROM packages WHERE billing_cycle = 'monthly' AND price > 0 AND is_active = 1 ORDER BY price LIMIT 1");
  await assignPackageLocally({ agencyId, packageId: monthly.id, notes: "test" });
  const [[sub1]] = await pool.query("SELECT expires_at FROM subscriptions WHERE agency_id = ? AND status = 'ACTIVE' ORDER BY id DESC LIMIT 1", [agencyId]);
  const days1 = (new Date(sub1.expires_at) - Date.now()) / 86400000;
  assert.ok(days1 > 27 && days1 < 32, `about a month, got ${days1.toFixed(1)} days`);
  await assignPackageLocally({ agencyId, packageId: monthly.id, notes: "test renewal" });
  const [[sub2]] = await pool.query("SELECT expires_at FROM subscriptions WHERE agency_id = ? AND status = 'ACTIVE' ORDER BY id DESC LIMIT 1", [agencyId]);
  const days2 = (new Date(sub2.expires_at) - Date.now()) / 86400000;
  assert.ok(days2 > 56 && days2 < 63, `about two months, got ${days2.toFixed(1)} days`);
  ok("monthly plan ends in a month; renewing early extends from the current end");

  // 3 ─ past the end date → read-only
  await pool.query("UPDATE subscriptions SET expires_at = NOW() - INTERVAL 1 DAY WHERE agency_id = ? AND status = 'ACTIVE'", [agencyId]);
  invalidateSubscriptionCache();
  state = await getSubscriptionState(agencyId);
  assert.equal(state.expired, true);
  const [[agencyPkg]] = await pool.query("SELECT package_id FROM agencies WHERE id = ?", [agencyId]);
  assert.equal(agencyPkg.package_id, monthly.id, "not moved to the free plan");
  assert.equal(await guard("POST", "/flows", agencyId), 402);
  assert.equal(await guard("DELETE", "/contacts/1", agencyId), 402);
  assert.equal(await guard("GET", "/flows", agencyId), 200);
  assert.equal(await guard("POST", "/billing/create-checkout", agencyId), 200);
  assert.equal(await guard("POST", "/auth/logout", agencyId), 200);
  await assert.rejects(
    sendPlatformMessage("WHATSAPP", { agency_id: agencyId }, "123", { type: "TEXT", body: "x" }),
    (err) => err.code === "SUBSCRIPTION_EXPIRED"
  );
  ok("expired → keeps its plan, reads work, changes get 402, billing/sign-in still work, nothing is sent");

  // 4 ─ paying again lifts it at once
  await assignPackageLocally({ agencyId, packageId: monthly.id, notes: "test renewal after expiry" });
  state = await getSubscriptionState(agencyId);
  assert.equal(state.expired, false);
  assert.equal(await guard("POST", "/flows", agencyId), 200);
  ok("renewing after expiry → writable again immediately");

  // 5 ─ discounts
  const pkg = { ...monthly, price: 100, discount_is_active: 1, discount_percent: 20, discount_terms: "Launch offer", discount_starts_at: null, discount_ends_at: null };
  let q = await priceForCheckout({ pkg });
  assert.equal(q.finalPrice, 80);
  await pool.query("UPDATE users SET discount_percent = 30 WHERE id = ?", [userId]);
  q = await priceForCheckout({ pkg, userId, agencyId });
  assert.equal(q.finalPrice, 70, "the larger of package (20%) and personal (30%) discount — not both");
  assert.equal(q.recurring, true);
  ok("package discount applies; a larger personal discount replaces it (no stacking)");

  const [c1] = await pool.query(
    "INSERT INTO coupons (code, discount_type, amount, duration, per_customer_limit) VALUES (?, 'PERCENT', 10, 'ONCE', 1)", [`TEST${tag}`]
  );
  created.couponIds.push(c1.insertId);
  q = await priceForCheckout({ pkg, userId, agencyId, couponCode: `test${tag}` });
  assert.equal(q.finalPrice, 63, "70 minus 10%");
  assert.equal(q.coupon.code, `TEST${tag}`);
  await recordCouponRedemption({ couponId: c1.insertId, agencyId, discountAmount: 7 });
  q = await priceForCheckout({ pkg, userId, agencyId, couponCode: `TEST${tag}` });
  assert.equal(q.couponError, "You've already used this coupon.");
  q = await priceForCheckout({ pkg, couponCode: "NOPE-NOT-REAL" });
  assert.equal(q.couponError, "This coupon code isn't valid.");
  ok("coupon comes off what's left; per-customer limit and unknown codes are refused");

  const [c2] = await pool.query("INSERT INTO coupons (code, discount_type, amount) VALUES (?, 'FIXED', 500)", [`FREE${tag}`]);
  created.couponIds.push(c2.insertId);
  await pool.query("UPDATE users SET special_coupon = ?, discount_percent = NULL WHERE id = ?", [`FREE${tag}`, userId]);
  q = await priceForCheckout({ pkg, userId, agencyId });
  assert.equal(q.finalPrice, 0, "fixed amount larger than the price → free, never negative");
  assert.equal(q.coupon.code, `FREE${tag}`, "the user's special coupon is applied without typing it");
  ok("the user's special coupon applies automatically; fixed amounts never go below 0");
}

async function cleanup() {
  if (created.couponIds.length) await pool.query("DELETE FROM coupons WHERE id IN (?)", [created.couponIds]);
  if (created.agencyId) {
    await pool.query("DELETE FROM subscriptions WHERE agency_id = ? OR user_id = ?", [created.agencyId, created.userId]);
    await pool.query("DELETE FROM organization_members WHERE agency_id = ?", [created.agencyId]);
    await pool.query("UPDATE users SET home_agency_id = NULL WHERE id = ?", [created.userId]).catch(() => {});
    await pool.query("DELETE FROM agencies WHERE id = ?", [created.agencyId]);
  }
  if (created.userId) await pool.query("DELETE FROM users WHERE id = ?", [created.userId]);
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
