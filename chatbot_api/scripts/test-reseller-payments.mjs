/**
 * Reseller payments against the real DB, without calling Stripe: a paid
 * session activates the reseller's plan for the customer once, extends on an
 * early renewal, feeds the reseller's earnings, and an ended cycle makes the
 * customer read-only. Uses an existing reseller + customer; everything it
 * creates is removed and the customer's original plan is restored.
 * Run: npm run test:reseller-payments
 */
import assert from "node:assert/strict";
import pool from "../db.js";
import { applyPaidSession, applyPaypalOrder, resellerEarnings, currentClientPlan } from "../utils/resellerBilling.js";
import { getSubscriptionState, invalidateSubscriptionCache } from "../utils/subscriptionStatus.js";

const [[pair]] = await pool.query("SELECT id AS clientId, parent_agency_id AS resellerId FROM agencies WHERE account_type = 'RESELLER_CUSTOMER' AND parent_agency_id IS NOT NULL LIMIT 1");
if (!pair) {
  console.log("No reseller customer in this database — nothing to test.");
  process.exit(0);
}
const { clientId, resellerId } = pair;
const [originalSubs] = await pool.query("SELECT id, status FROM agency_client_subscriptions WHERE client_agency_id = ?", [clientId]);
const [pkgIns] = await pool.query(
  "INSERT INTO agency_packages (agency_id, name, slug, price, currency, billing_cycle, is_active) VALUES (?, 'Test monthly', ?, 19.00, 'USD', 'monthly', 1)",
  [resellerId, `test-monthly-${Date.now()}`]
);
const packageId = pkgIns.insertId;
const sessions = [`cs_test_${Date.now()}_1`, `cs_test_${Date.now()}_2`];
const session = (id) => ({
  id, payment_status: "paid", amount_total: 1900, currency: "usd", customer: "cus_test",
  metadata: { resellerCheckout: "1", resellerId: String(resellerId), clientAgencyId: String(clientId), packageId: String(packageId) },
});

try {
  const before = await resellerEarnings(resellerId);

  assert.equal((await applyPaidSession(resellerId, session(sessions[0]))).ok, true);
  const plan1 = await currentClientPlan(clientId);
  assert.equal(Number(plan1.package_id), packageId);
  const end1 = new Date(plan1.current_period_end);
  assert.ok(end1 > new Date(Date.now() + 25 * 86400e3), "about a month ahead");

  // The same session again (webhook + return page) counts once.
  assert.equal((await applyPaidSession(resellerId, session(sessions[0]))).alreadyApplied, true);
  // Another reseller's id never applies it.
  assert.equal((await applyPaidSession(resellerId + 100000, session(sessions[1]))).ok, false);
  // Unpaid never applies.
  assert.equal((await applyPaidSession(resellerId, { ...session(sessions[1]), payment_status: "unpaid" })).ok, false);

  // Early renewal extends from the current end.
  await applyPaidSession(resellerId, session(sessions[1]));
  const end2 = new Date((await currentClientPlan(clientId)).current_period_end);
  assert.ok(end2 > new Date(end1.getTime() + 25 * 86400e3), "renewal adds a cycle on top");

  // PayPal: a captured order for this customer activates too; someone else's / uncaptured never.
  const ppOrder = (id, status = "COMPLETED", customer = clientId) => ({
    id, status, payer: { payer_id: "PAYER1" },
    purchase_units: [{ custom_id: `rb:${resellerId}:${customer}:${packageId}`, payments: { captures: [{ id: "CAP1", status: "COMPLETED", amount: { value: "19.00", currency_code: "USD" } }] } }],
  });
  assert.equal((await applyPaypalOrder(resellerId, ppOrder(`PP${sessions[0]}`, "APPROVED"), clientId)).ok, false);
  assert.equal((await applyPaypalOrder(resellerId, ppOrder(`PP${sessions[0]}`, "COMPLETED", clientId + 1), clientId)).ok, false);
  assert.equal((await applyPaypalOrder(resellerId, ppOrder(`PP${sessions[0]}`), clientId)).ok, true);
  assert.equal((await applyPaypalOrder(resellerId, ppOrder(`PP${sessions[0]}`), clientId)).alreadyApplied, true);
  const [[ppPlan]] = await pool.query("SELECT provider FROM agency_client_subscriptions WHERE client_agency_id = ? AND status = 'ACTIVE'", [clientId]);
  assert.equal(ppPlan.provider, "PAYPAL");

  const after = await resellerEarnings(resellerId);
  assert.equal(after.payments - (before.currency === "USD" ? before.payments : 0), 3);

  // A cycle that has ended → read-only.
  await pool.query("UPDATE agency_client_subscriptions SET current_period_end = NOW() - INTERVAL 1 HOUR WHERE client_agency_id = ? AND status = 'ACTIVE'", [clientId]);
  invalidateSubscriptionCache(clientId);
  const state = await getSubscriptionState(clientId);
  assert.equal(state.expired, true);
  assert.equal(state.source, "RESELLER_PLAN");
  console.log("✅ Reseller payments: all checks passed");
} finally {
  await pool.query("DELETE FROM agency_client_payments WHERE provider_session_id IN (?)", [[...sessions, `PP${sessions[0]}`]]);
  await pool.query("DELETE FROM agency_client_subscriptions WHERE client_agency_id = ? AND package_id = ?", [clientId, packageId]);
  for (const s of originalSubs) await pool.query("UPDATE agency_client_subscriptions SET status = ? WHERE id = ?", [s.status, s.id]);
  await pool.query("DELETE FROM agency_packages WHERE id = ?", [packageId]);
  invalidateSubscriptionCache(clientId);
  await pool.end();
}
