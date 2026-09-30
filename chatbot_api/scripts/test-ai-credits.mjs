/**
 * AI Credits against the real DB (npm run test:ai-credits). Never calls an AI
 * provider or a payment gateway. Borrows one workspace and its plan's AI
 * limit, and restores everything it touched: the plan limit, the workspace's
 * wallet / ledger / usage / purchases, and the platform pool's numbers.
 *
 * Checks: allowance, reservation, 20 parallel requests on a small balance
 * (never negative, never over-spent), idempotent add-on crediting,
 * package-first consumption, a period reset keeping purchased credits, a plan
 * change, refund, and the platform pool at 0.
 *
 * Usage: node scripts/test-ai-credits.mjs [agencyId=195]
 */
import "dotenv/config";
import assert from "node:assert/strict";
import pool from "../db.js";
import {
  reserveCredits, settleCredits, releaseHold, getCreditSummary, completeAddonPurchase,
  refundAddonPurchase, invalidateAiCreditPlan, adjustAccountCredits,
} from "../utils/aiCredits/service.js";

const agencyId = Number(process.argv[2] || 195);
const ok = (msg) => console.log(`  ✓ ${msg}`);

const [[agency]] = await pool.query("SELECT id, name, account_type FROM agencies WHERE id = ?", [agencyId]);
if (!agency) { console.error(`No workspace ${agencyId}`); process.exit(1); }
const { getAgencyEntitlements } = await import("../utils/entitlements.js");
const ent = await getAgencyEntitlements(agencyId);
const packageId = ent?.package?.id;
if (!packageId) { console.error("That workspace resolves to no real package — pick another one"); process.exit(1); }

// ── Snapshot what we will change ──
const [[pm]] = await pool.query("SELECT * FROM package_modules WHERE package_id = ? AND module_key = 'feature_ai_tokens'", [packageId]);
const [[poolBefore]] = await pool.query("SELECT * FROM ai_platform_pool WHERE id = 1");
const [[{ maxLedger }]] = await pool.query("SELECT COALESCE(MAX(id), 0) AS maxLedger FROM ai_credit_transactions");
const [[{ maxUsage }]] = await pool.query("SELECT COALESCE(MAX(id), 0) AS maxUsage FROM ai_usage");
const [[walletBefore]] = await pool.query("SELECT * FROM ai_credit_wallets WHERE agency_id = ?", [agencyId]);
const purchaseIds = [];

const setAllowance = async (n) => {
  await pool.query(
    `INSERT INTO package_modules (package_id, module_key, is_enabled, limits_json) VALUES (?, 'feature_ai_tokens', 1, ?)
     ON DUPLICATE KEY UPDATE limits_json = VALUES(limits_json)`,
    [packageId, JSON.stringify({ maxAiTokensPerMonth: n })]
  );
  invalidateAiCreditPlan(agencyId);
};
const usage = (credits) => ({ kind: "chat", provider: "test", model: "test", inputTokens: credits, outputTokens: 0, feature: "test" });

let failed = false;
try {
  console.log(`AI credits on workspace ${agency.id} (${agency.name}, package ${packageId})`);
  await pool.query("DELETE FROM ai_credit_wallets WHERE agency_id = ?", [agencyId]);
  await setAllowance(1000);

  let s = await getCreditSummary(agencyId);
  assert.equal(s.packageAllowance, 1000); assert.equal(s.available, 1000); assert.equal(s.purchasedBalance, 0);
  ok("package allowance comes from the plan (1,000)");

  const h1 = await reserveCredits({ agencyId, credits: 600 });
  await assert.rejects(reserveCredits({ agencyId, credits: 600 }), (e) => e.code === "INSUFFICIENT_AI_CREDITS");
  await releaseHold(h1);
  s = await getCreditSummary(agencyId);
  assert.equal(s.available, 1000);
  ok("a reservation blocks a second one that doesn't fit; release gives it back");

  // ── 20 parallel requests, 100 each, on 1,000 ──
  const results = await Promise.allSettled(Array.from({ length: 20 }, async () => {
    const h = await reserveCredits({ agencyId, credits: 100 });
    await new Promise((r) => setTimeout(r, 20));
    return settleCredits(h, usage(100));
  }));
  const won = results.filter((r) => r.status === "fulfilled").length;
  const reasons = [...new Set(results.filter((r) => r.status === "rejected").map((r) => r.reason?.code || r.reason?.message))];
  assert.equal(won, 10, `expected exactly 10 winners, got ${won} (${reasons.join(", ")})`);
  assert.ok(results.filter((r) => r.status === "rejected").every((r) => r.reason?.code === "INSUFFICIENT_AI_CREDITS"));
  s = await getCreditSummary(agencyId);
  assert.equal(s.packageUsed, 1000); assert.equal(s.available, 0);
  const [[w0]] = await pool.query("SELECT * FROM ai_credit_wallets WHERE agency_id = ?", [agencyId]);
  assert.equal(Number(w0.held_package), 0); assert.equal(Number(w0.held_purchased), 0);
  ok("20 parallel requests on 1,000 credits: exactly 10 ran, balance 0, nothing held, never negative");

  // ── Add-on purchase, delivered twice ──
  const [ins] = await pool.query(
    `INSERT INTO ai_credit_purchases (agency_id, addon_name, credits, price, currency, provider, reference_token)
     VALUES (?, 'TEST pack', 5000, 1.00, 'USD', 'STRIPE', ?)`,
    [agencyId, `test_${Date.now()}_${Math.random().toString(16).slice(2)}`.padEnd(48, "0").slice(0, 48)]
  );
  purchaseIds.push(ins.insertId);
  const c1 = await completeAddonPurchase(ins.insertId, { gatewayRef: `test_${ins.insertId}` });
  const c2 = await completeAddonPurchase(ins.insertId, { gatewayRef: `test_${ins.insertId}` });
  assert.equal(c1.credited, true); assert.equal(c2.credited, false);
  const [[{ grants }]] = await pool.query("SELECT COUNT(*) AS grants FROM ai_credit_transactions WHERE purchase_id = ? AND type = 'ADDON_PURCHASE'", [ins.insertId]);
  assert.equal(Number(grants), 1);
  s = await getCreditSummary(agencyId);
  assert.equal(s.purchasedBalance, 5000);
  ok("a payment confirmed twice credits once (5,000 purchased)");

  // ── Package first, then purchased ──
  await setAllowance(1500); // +500 package room this period
  let h = await reserveCredits({ agencyId, credits: 700 });
  const r1 = await settleCredits(h, usage(700));
  const [[u1]] = await pool.query("SELECT credits_package, credits_purchased FROM ai_usage WHERE id = ?", [r1.usageId]);
  assert.equal(Number(u1.credits_package), 500); assert.equal(Number(u1.credits_purchased), 200);
  s = await getCreditSummary(agencyId);
  assert.equal(s.packageRemaining, 0); assert.equal(s.purchasedBalance, 4800);
  ok("plan change applies at once; package credits are spent before purchased ones (500 + 200)");

  // ── New period: package resets, purchased untouched ──
  await pool.query("UPDATE ai_credit_wallets SET package_period_start = '2000-01-01 00:00:00' WHERE agency_id = ?", [agencyId]);
  s = await getCreditSummary(agencyId);
  assert.equal(s.packageUsed, 0); assert.equal(s.packageRemaining, 1500); assert.equal(s.purchasedBalance, 4800);
  s = await getCreditSummary(agencyId);
  assert.equal(s.packageRemaining, 1500);
  ok("a new period resets package credits only — purchased credits stay (4,800); re-reading doesn't reset again");

  // ── Unlimited plan never touches purchased credits ──
  await pool.query("UPDATE package_modules SET limits_json = '{}' WHERE package_id = ? AND module_key = 'feature_ai_tokens'", [packageId]);
  invalidateAiCreditPlan(agencyId);
  h = await reserveCredits({ agencyId, credits: 300 });
  await settleCredits(h, usage(300));
  s = await getCreditSummary(agencyId);
  assert.equal(s.unlimitedPackage, true); assert.equal(s.purchasedBalance, 4800);
  ok("an unlimited plan uses no purchased credits");
  await setAllowance(1500);

  // ── Admin adjustment can't go negative ──
  await assert.rejects(adjustAccountCredits({ agencyId, bucket: "PURCHASED", amount: -999999, note: "test" }), (e) => e.code === "BAD_AMOUNT");
  await adjustAccountCredits({ agencyId, bucket: "PURCHASED", amount: 100, note: "test" });
  s = await getCreditSummary(agencyId);
  assert.equal(s.purchasedBalance, 4900);
  ok("admin adjustments are ledgered and can't make a balance negative");

  // ── Refund takes back only what's unused ──
  const ref = await refundAddonPurchase({ purchaseId: ins.insertId, note: "test" });
  assert.equal(ref.takenBack, 4900);
  s = await getCreditSummary(agencyId);
  assert.equal(s.purchasedBalance, 0);
  ok("refund takes back the unused purchased credits (never below 0)");

  // ── Platform pool at 0 blocks ──
  await pool.query("UPDATE ai_platform_pool SET held = balance WHERE id = 1");
  await assert.rejects(reserveCredits({ agencyId, credits: 10 }), (e) => e.code === "PLATFORM_AI_CREDITS_EXHAUSTED");
  await pool.query("UPDATE ai_platform_pool SET held = ? WHERE id = 1", [poolBefore.held]);
  ok("an empty platform pool blocks AI for everyone");

  // ── Ledger adds up for the purchased bucket ──
  const [[{ sum }]] = await pool.query(
    "SELECT COALESCE(SUM(amount), 0) AS sum FROM ai_credit_transactions WHERE agency_id = ? AND bucket = 'PURCHASED' AND id > ?", [agencyId, maxLedger]
  );
  assert.equal(Number(sum), 0);
  ok("the purchased-credit ledger sums to the balance (0)");
  console.log("All AI credit checks passed.");
} catch (err) {
  failed = true;
  console.error("✗", err);
} finally {
  // ── Restore ──
  if (pm) await pool.query("UPDATE package_modules SET is_enabled = ?, limits_json = ? WHERE package_id = ? AND module_key = 'feature_ai_tokens'", [pm.is_enabled, JSON.stringify(pm.limits_json ?? {}), packageId]);
  else await pool.query("DELETE FROM package_modules WHERE package_id = ? AND module_key = 'feature_ai_tokens'", [packageId]);
  invalidateAiCreditPlan(agencyId);
  const [[{ used }]] = await pool.query("SELECT COALESCE(SUM(-amount), 0) AS used FROM ai_credit_transactions WHERE scope = 'PLATFORM' AND type = 'AI_USAGE' AND id > ? AND agency_id = ?", [maxLedger, agencyId]);
  await pool.query("UPDATE ai_platform_pool SET balance = balance + ?, total_used = total_used - ?, held = ? WHERE id = 1", [used, used, poolBefore.held]);
  await pool.query("DELETE FROM ai_credit_transactions WHERE id > ? AND agency_id = ?", [maxLedger, agencyId]);
  await pool.query("DELETE FROM ai_usage WHERE id > ? AND agency_id = ?", [maxUsage, agencyId]);
  await pool.query("DELETE FROM ai_credit_holds WHERE agency_id = ?", [agencyId]);
  if (purchaseIds.length) await pool.query("DELETE FROM ai_credit_purchases WHERE id IN (?)", [purchaseIds]);
  await pool.query("DELETE FROM ai_credit_wallets WHERE agency_id = ?", [agencyId]);
  if (walletBefore) {
    const cols = Object.keys(walletBefore);
    await pool.query(`INSERT INTO ai_credit_wallets (${cols.join(",")}) VALUES (?)`, [cols.map((c) => walletBefore[c])]);
  }
  const [[poolAfter]] = await pool.query("SELECT balance, total_used, held FROM ai_platform_pool WHERE id = 1");
  assert.equal(Number(poolAfter.balance), Number(poolBefore.balance), "platform pool restored");
  console.log("Restored the plan limit, the workspace's credits and the platform pool.");
  await pool.end();
  process.exit(failed ? 1 : 0);
}
