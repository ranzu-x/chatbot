/**
 * AI Credit Service — balances, reservations and the ledger.
 *
 * Two sources per workspace, never merged (ai_credit_wallets):
 *   PACKAGE    the plan's monthly allowance (feature_ai_tokens →
 *              maxAiTokensPerMonth; NULL / unset = unlimited). Resets with the
 *              existing monthly usage period (1st of the month, or the Super
 *              Admin's "Reset monthly usage" — agencies.usage_reset_at).
 *              A plan change during the period applies at once (new allowance,
 *              same used amount) — the same rule the old token limit had.
 *   PURCHASED  add-on credits: never expire, never reset, kept across renewals,
 *              upgrades, downgrades and plan changes; only spending or a refund
 *              lowers them.
 * Plus the Super Admin's platform pool (ai_platform_pool): every metered call
 * also draws it down; at 0 all AI stops (decided with the user).
 *
 * Every AI call: reserve() an upper-bound estimate → provider call →
 * settle() with the real usage (or release() when the call failed). Both run
 * in a DB transaction holding the wallet + pool rows FOR UPDATE, so parallel
 * calls queue on the lock and can never see the same balance twice; a settle
 * never charges more than is there (the excess is recorded as `uncovered`).
 * The CHECK constraints make a negative balance impossible even for a bug.
 * Stale holds (process died mid-call) are released by startAiCreditJobs().
 */
import pool from "../../db.js";
import { getAgencyEntitlements } from "../entitlements.js";
import { lockedJob } from "../jobLock.js";
import { cleanCreditSettings, allocate, creditsForUsage } from "./pricing.js";

export class AiCreditError extends Error {
  constructor(message, { code = "INSUFFICIENT_AI_CREDITS", status = 402, canPurchase = false, available = null, required = null } = {}) {
    super(message);
    this.name = "AiCreditError";
    this.code = code;
    this.status = status;
    this.canPurchase = canPurchase;
    this.available = available;
    this.required = required;
  }
}

// ─── Settings ────────────────────────────────────────────────────────────────
let settingsCache = { value: null, at: 0 };
export async function getCreditSettings() {
  if (settingsCache.value && Date.now() - settingsCache.at < 30_000) return settingsCache.value;
  const [[row]] = await pool.query("SELECT value FROM platform_settings WHERE setting_key = 'ai_credit_settings'");
  const raw = row ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) : {};
  settingsCache = { value: cleanCreditSettings(raw), at: Date.now() };
  return settingsCache.value;
}
export async function saveCreditSettings(input) {
  const clean = cleanCreditSettings(input);
  await pool.query(
    "INSERT INTO platform_settings (setting_key, value) VALUES ('ai_credit_settings', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
    [JSON.stringify(clean)]
  );
  settingsCache = { value: clean, at: Date.now() };
  return clean;
}

// ─── Plan context (allowance, who may buy) ───────────────────────────────────
const planCache = new Map(); // agencyId → { at, value }
export function invalidateAiCreditPlan(agencyId) { if (agencyId) planCache.delete(Number(agencyId)); else planCache.clear(); }

/** Allowance this period + account facts. Cached 30 s (entitlements are several queries). */
export async function getPlanContext(agencyId) {
  const hit = planCache.get(Number(agencyId));
  if (hit && Date.now() - hit.at < 30_000) return hit.value;
  const [[agency]] = await pool.query(
    `SELECT id, account_type, parent_agency_id,
            DATE_FORMAT(GREATEST(CAST(DATE_FORMAT(NOW(), '%Y-%m-01') AS DATETIME), COALESCE(usage_reset_at, '1970-01-01 00:00:00')), '%Y-%m-%d %H:%i:%s') AS period_start,
            DATE_FORMAT(DATE_ADD(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL 1 MONTH), '%Y-%m-%d %H:%i:%s') AS period_end
       FROM agencies WHERE id = ?`,
    [agencyId]
  );
  if (!agency) throw new AiCreditError("Workspace not found", { code: "WORKSPACE_NOT_FOUND", status: 404 });
  const ent = await getAgencyEntitlements(agencyId);
  const raw = ent?.modulesMap?.feature_ai_tokens?.limits?.maxAiTokensPerMonth;
  const allowance = raw === undefined || raw === null || raw === "" ? null : Math.max(0, Math.floor(Number(raw) || 0));
  const value = {
    agencyId: agency.id,
    accountType: agency.account_type,
    resellerId: agency.account_type === "RESELLER_CUSTOMER" ? agency.parent_agency_id : null,
    packageId: ent?.package?.id || null,
    packageName: ent?.package?.name || null,
    allowance,
    periodStart: agency.period_start,
    periodEnd: agency.period_end,
    // End users and Resellers buy from the platform; a Reseller's customers don't (decided with the user).
    canPurchase: ["DIRECT_CUSTOMER", "RESELLER"].includes(agency.account_type),
  };
  planCache.set(Number(agencyId), { at: Date.now(), value });
  return value;
}

// ─── Ledger ──────────────────────────────────────────────────────────────────
async function ledger(conn, row) {
  await conn.query(
    `INSERT INTO ai_credit_transactions (scope, agency_id, user_id, type, bucket, amount, balance_before, balance_after, source, purchase_id, usage_id, idempotency_key, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.scope || "ACCOUNT", row.agencyId ?? null, row.userId ?? null, row.type, row.bucket, row.amount, row.before ?? null, row.after ?? null,
      row.source ?? null, row.purchaseId ?? null, row.usageId ?? null, row.idempotencyKey ?? null, row.metadata ? JSON.stringify(row.metadata) : null]
  );
}

// ─── Wallet ──────────────────────────────────────────────────────────────────
const packageLeft = (w) => (w.package_allowance === null ? null : Math.max(0, Number(w.package_allowance) - Number(w.package_used)));

/**
 * Locks the workspace's wallet (creating it) and brings the package part up to
 * date: a new period resets it; a changed plan allowance applies at once.
 * Must run inside a transaction on `conn`.
 */
/**
 * SELECT … FOR UPDATE, creating the row only when it's missing. (An INSERT IGNORE
 * on an existing row takes a shared lock first; upgrading it to FOR UPDATE in
 * parallel transactions deadlocks — caught by npm run test:ai-credits.)
 */
async function selectForUpdate(conn, selectSql, insertSql, params) {
  let [[row]] = await conn.query(selectSql, params);
  if (!row) {
    await conn.query(insertSql, params);
    [[row]] = await conn.query(selectSql, params);
  }
  return row;
}

async function lockWallet(conn, agencyId, plan) {
  // Period keys are compared as SQL-formatted text ("YYYY-MM-DD HH:MM:SS"):
  // a JS Date read back from DATETIME is in the server's zone, which can differ.
  const w = await selectForUpdate(
    conn,
    "SELECT *, DATE_FORMAT(package_period_start, '%Y-%m-%d %H:%i:%s') AS period_key FROM ai_credit_wallets WHERE agency_id = ? FOR UPDATE",
    "INSERT IGNORE INTO ai_credit_wallets (agency_id) VALUES (?)",
    [agencyId]
  );
  const allowance = plan.allowance;
  if (w.period_key !== plan.periodStart) {
    const before = packageLeft(w);
    const first = !w.package_period_start;
    await conn.query("UPDATE ai_credit_wallets SET package_period_start = ?, package_allowance = ?, package_used = 0 WHERE agency_id = ?", [plan.periodStart, allowance, agencyId]);
    await ledger(conn, {
      agencyId, type: first ? "PACKAGE_CREDIT_GRANTED" : "PACKAGE_CREDIT_RESET", bucket: "PACKAGE",
      amount: allowance ?? 0, before, after: allowance, source: "package_period",
      idempotencyKey: `pkg:${agencyId}:${plan.periodStart}`,
      metadata: { packageId: plan.packageId, packageName: plan.packageName, unlimited: allowance === null, periodStart: plan.periodStart },
    }).catch((err) => { if (err.code !== "ER_DUP_ENTRY") throw err; });
    Object.assign(w, { package_period_start: plan.periodStart, period_key: plan.periodStart, package_allowance: allowance, package_used: 0 });
  } else if ((w.package_allowance === null ? null : Number(w.package_allowance)) !== allowance) {
    const before = packageLeft(w);
    await conn.query("UPDATE ai_credit_wallets SET package_allowance = ? WHERE agency_id = ?", [allowance, agencyId]);
    w.package_allowance = allowance;
    await ledger(conn, {
      agencyId, type: "PACKAGE_CREDIT_GRANTED", bucket: "PACKAGE",
      amount: allowance === null || before === null ? 0 : packageLeft(w) - before, before, after: packageLeft(w), source: "package_change",
      metadata: { packageId: plan.packageId, packageName: plan.packageName, allowance, unlimited: allowance === null },
    });
  }
  return w;
}

function availableOf(w) {
  const pkg = w.package_allowance === null
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, Number(w.package_allowance) - Number(w.package_used) - Number(w.held_package));
  const purchased = Math.max(0, Number(w.purchased_balance) - Number(w.held_purchased));
  return { PACKAGE: pkg, PURCHASED: purchased };
}

async function lockPool(conn) {
  return selectForUpdate(conn, "SELECT * FROM ai_platform_pool WHERE id = ? FOR UPDATE", "INSERT IGNORE INTO ai_platform_pool (id, balance) VALUES (?, 0)", [1]);
}

/** Runs fn(conn) in a transaction; a deadlock / lock timeout is retried (the work was rolled back). */
async function inTransaction(fn, attempts = 4) {
  for (let attempt = 1; ; attempt++) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const out = await fn(conn);
      await conn.commit();
      return out;
    } catch (err) {
      await conn.rollback().catch(() => {});
      if ((err.code === "ER_LOCK_DEADLOCK" || err.code === "ER_LOCK_WAIT_TIMEOUT") && attempt < attempts) {
        await new Promise((r) => setTimeout(r, 15 * attempt + Math.random() * 25));
        continue;
      }
      throw err;
    } finally {
      conn.release();
    }
  }
}

const fmt = (n) => Number(n).toLocaleString("en-US");

function insufficient(plan, available, required) {
  const tail = plan.canPurchase
    ? " Buy more AI credits on the AI Credits page, or wait for your plan's credits to renew."
    : plan.accountType === "RESELLER_CUSTOMER"
      ? " Ask your service provider for more AI credits."
      : "";
  return new AiCreditError(
    `Not enough AI credits: ${fmt(available)} available, this request needs up to ${fmt(required)}.${tail}`,
    { canPurchase: plan.canPurchase, available, required }
  );
}
const platformExhausted = () => new AiCreditError(
  "AI replies are temporarily unavailable — the platform's AI credits have run out. Please contact support.",
  { code: "PLATFORM_AI_CREDITS_EXHAUSTED", status: 503 }
);

// ─── Reserve / settle / release ──────────────────────────────────────────────
/**
 * Holds `credits` before an AI call. Throws AiCreditError when the workspace
 * or the platform pool can't cover it — the call must not be made then.
 * @returns {Promise<{ id, agencyId, package, purchased, platform, plan }>}
 */
export async function reserveCredits({ agencyId, credits, feature = null }) {
  const plan = await getPlanContext(agencyId);
  const settings = await getCreditSettings();
  const need = Math.max(settings.minimumCreditsPerCall, Math.ceil(Number(credits) || 0));
  return inTransaction(async (conn) => {
    const w = await lockWallet(conn, agencyId, plan);
    const avail = availableOf(w);
    const split = allocate(settings.consumptionOrder, avail, need);
    if (split.shortfall > 0) {
      const shown = w.package_allowance === null ? null : avail.PACKAGE + avail.PURCHASED;
      throw insufficient(plan, shown ?? 0, need);
    }
    const p = await lockPool(conn);
    if (Number(p.balance) - Number(p.held) < need) throw platformExhausted();
    await conn.query("UPDATE ai_credit_wallets SET held_package = held_package + ?, held_purchased = held_purchased + ? WHERE agency_id = ?", [split.PACKAGE, split.PURCHASED, agencyId]);
    await conn.query("UPDATE ai_platform_pool SET held = held + ? WHERE id = 1", [need]);
    const [ins] = await conn.query(
      "INSERT INTO ai_credit_holds (agency_id, held_package, held_purchased, held_platform, feature) VALUES (?, ?, ?, ?, ?)",
      [agencyId, split.PACKAGE, split.PURCHASED, need, feature]
    );
    return { id: ins.insertId, agencyId, package: split.PACKAGE, purchased: split.PURCHASED, platform: need, plan };
  });
}

/** Gives a hold back (the AI call failed or never ran). Safe to call twice. */
export async function releaseHold(hold) {
  if (!hold?.id) return;
  await inTransaction(async (conn) => {
    const [[h]] = await conn.query("SELECT * FROM ai_credit_holds WHERE id = ? FOR UPDATE", [hold.id]);
    if (!h) return;
    await conn.query(
      "UPDATE ai_credit_wallets SET held_package = GREATEST(0, held_package - ?), held_purchased = GREATEST(0, held_purchased - ?) WHERE agency_id = ?",
      [h.held_package, h.held_purchased, h.agency_id]
    );
    await conn.query("UPDATE ai_platform_pool SET held = GREATEST(0, held - ?) WHERE id = 1", [h.held_platform]);
    await conn.query("DELETE FROM ai_credit_holds WHERE id = ?", [h.id]);
  });
}

/**
 * Charges the real cost of a finished AI call, records the usage row and the
 * ledger, and releases the hold. `usage`: { kind, provider, model, inputTokens,
 * outputTokens, estimated, feature, capability, userId, integrationId, agentId, conversationId, resource }.
 * @returns {Promise<{ usageId, credits, uncovered }>}
 */
export async function settleCredits(hold, usage) {
  const settings = await getCreditSettings();
  const credits = creditsForUsage(settings, {
    kind: usage.kind || "chat", provider: usage.provider, model: usage.model,
    inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
  });
  const agencyId = hold.agencyId;
  const plan = hold.plan || (await getPlanContext(agencyId));
  return inTransaction(async (conn) => {
    const [[h]] = await conn.query("SELECT * FROM ai_credit_holds WHERE id = ? FOR UPDATE", [hold.id]);
    const w = await lockWallet(conn, agencyId, plan);
    const p = await lockPool(conn);
    // Release this call's own hold first, then charge the actual amount.
    if (h) {
      w.held_package = Math.max(0, Number(w.held_package) - Number(h.held_package));
      w.held_purchased = Math.max(0, Number(w.held_purchased) - Number(h.held_purchased));
      p.held = Math.max(0, Number(p.held) - Number(h.held_platform));
    }
    const split = allocate(settings.consumptionOrder, availableOf(w), credits);
    const charged = split.PACKAGE + split.PURCHASED;
    const platformCharge = Math.min(charged, Math.max(0, Number(p.balance)));
    const uncovered = credits - charged;

    const pkgBefore = packageLeft(w);
    const purBefore = Number(w.purchased_balance);
    await conn.query(
      `UPDATE ai_credit_wallets SET held_package = ?, held_purchased = ?, package_used = package_used + ?,
         purchased_balance = purchased_balance - ?, lifetime_used = lifetime_used + ? WHERE agency_id = ?`,
      [w.held_package, w.held_purchased, split.PACKAGE, split.PURCHASED, charged, agencyId]
    );
    await conn.query("UPDATE ai_platform_pool SET held = ?, balance = balance - ?, total_used = total_used + ? WHERE id = 1", [p.held, platformCharge, platformCharge]);
    if (h) await conn.query("DELETE FROM ai_credit_holds WHERE id = ?", [h.id]);

    const inTok = usage.inputTokens === null || usage.inputTokens === undefined ? null : Math.round(usage.inputTokens);
    const outTok = usage.outputTokens === null || usage.outputTokens === undefined ? null : Math.round(usage.outputTokens);
    const [u] = await conn.query(
      `INSERT INTO ai_usage (agency_id, reseller_id, package_id, user_id, resource, feature, capability, provider, model, input_tokens, output_tokens, total_tokens,
         estimated, credits, credits_package, credits_purchased, uncovered, integration_id, agent_id, conversation_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [agencyId, plan.resellerId, plan.packageId, usage.userId || null, usage.resource || "PLATFORM", usage.feature || "ai", usage.capability || null,
        usage.provider || null, usage.model || null, inTok, outTok, inTok === null && outTok === null ? null : (inTok || 0) + (outTok || 0),
        usage.estimated ? 1 : 0, charged, split.PACKAGE, split.PURCHASED, uncovered,
        usage.integrationId || null, usage.agentId || null, usage.conversationId || null]
    );
    const meta = { feature: usage.feature, provider: usage.provider, model: usage.model };
    if (split.PACKAGE) {
      await ledger(conn, { agencyId, userId: usage.userId, type: "AI_USAGE", bucket: "PACKAGE", amount: -split.PACKAGE,
        before: pkgBefore, after: pkgBefore === null ? null : pkgBefore - split.PACKAGE, source: usage.feature, usageId: u.insertId, metadata: meta });
    }
    if (split.PURCHASED) {
      await ledger(conn, { agencyId, userId: usage.userId, type: "AI_USAGE", bucket: "PURCHASED", amount: -split.PURCHASED,
        before: purBefore, after: purBefore - split.PURCHASED, source: usage.feature, usageId: u.insertId, metadata: meta });
    }
    if (platformCharge) {
      await ledger(conn, { scope: "PLATFORM", agencyId, type: "AI_USAGE", bucket: "PLATFORM", amount: -platformCharge,
        before: Number(p.balance), after: Number(p.balance) - platformCharge, source: usage.feature, usageId: u.insertId, metadata: meta });
    }
    return { usageId: u.insertId, credits: charged, uncovered };
  });
}

/** Up-front check without holding anything (fast "is AI usable at all" for inbound messages / buttons). */
export async function assertAiCreditsAvailable(agencyId, credits = 1) {
  const plan = await getPlanContext(agencyId);
  const need = Math.max(1, Math.ceil(Number(credits) || 1));
  const summary = await getCreditSummary(agencyId, { plan });
  if (!summary.unlimitedPackage && summary.available < need) throw insufficient(plan, summary.available, need);
  if (summary.platformAvailable < need) throw platformExhausted();
  return summary;
}

// ─── Balances for screens ────────────────────────────────────────────────────
export async function getCreditSummary(agencyId, { plan: known } = {}) {
  const plan = known || (await getPlanContext(agencyId));
  const w = await inTransaction((conn) => lockWallet(conn, agencyId, plan));
  const [[p]] = await pool.query("SELECT balance, held FROM ai_platform_pool WHERE id = 1");
  // Spent this period from BOTH sources (the package part alone is package_used).
  const [[used]] = await pool.query(
    "SELECT COALESCE(SUM(credits), 0) AS n FROM ai_usage WHERE agency_id = ? AND created_at >= ?",
    [agencyId, plan.periodStart]
  );
  const unlimited = w.package_allowance === null;
  const pkgRemaining = unlimited ? null : Math.max(0, Number(w.package_allowance) - Number(w.package_used) - Number(w.held_package));
  const purchased = Math.max(0, Number(w.purchased_balance) - Number(w.held_purchased));
  return {
    packageName: plan.packageName,
    unlimitedPackage: unlimited,
    packageAllowance: unlimited ? null : Number(w.package_allowance),
    packageUsed: Number(w.package_used),
    packageRemaining: pkgRemaining,
    purchasedBalance: purchased,
    available: unlimited ? null : pkgRemaining + purchased,
    usedThisPeriod: Number(used.n),
    lifetimeUsed: Number(w.lifetime_used),
    lifetimePurchased: Number(w.lifetime_purchased),
    periodStart: w.package_period_start,
    periodEnd: plan.periodEnd,
    canPurchase: plan.canPurchase,
    accountType: plan.accountType,
    platformAvailable: p ? Math.max(0, Number(p.balance) - Number(p.held)) : 0,
  };
}

// ─── Credits in: purchases, admin adjustments, refunds, platform pool ───────
/**
 * Adds a paid add-on's credits exactly once. Returns { credited: boolean }.
 * The status flip PENDING → PAID is the idempotency gate (a second webhook,
 * a refreshed return page or a replayed IPN finds it already PAID); the
 * ledger's unique idempotency key is a second guard.
 */
export async function completeAddonPurchase(purchaseId, { gatewayRef = null, chargedAmount = null } = {}) {
  return inTransaction(async (conn) => {
    const [[pu]] = await conn.query("SELECT * FROM ai_credit_purchases WHERE id = ? FOR UPDATE", [purchaseId]);
    if (!pu) return { credited: false, reason: "not_found" };
    if (pu.status !== "PENDING") return { credited: false, reason: pu.status === "PAID" ? "already_credited" : `status_${pu.status}` };
    await conn.query(
      "UPDATE ai_credit_purchases SET status = 'PAID', paid_at = NOW(), gateway_ref = COALESCE(gateway_ref, ?), charged_amount = COALESCE(?, charged_amount) WHERE id = ?",
      [gatewayRef, chargedAmount, pu.id]
    );
    const w = await selectForUpdate(conn, "SELECT purchased_balance FROM ai_credit_wallets WHERE agency_id = ? FOR UPDATE", "INSERT IGNORE INTO ai_credit_wallets (agency_id) VALUES (?)", [pu.agency_id]);
    const before = Number(w.purchased_balance);
    await conn.query(
      "UPDATE ai_credit_wallets SET purchased_balance = purchased_balance + ?, lifetime_purchased = lifetime_purchased + ? WHERE agency_id = ?",
      [pu.credits, pu.credits, pu.agency_id]
    );
    await ledger(conn, {
      agencyId: pu.agency_id, userId: pu.user_id, type: "ADDON_PURCHASE", bucket: "PURCHASED", amount: Number(pu.credits),
      before, after: before + Number(pu.credits), source: pu.provider, purchaseId: pu.id, idempotencyKey: `addon:${pu.id}`,
      metadata: { addonId: pu.addon_id, addonName: pu.addon_name, price: Number(pu.price), currency: pu.currency, gatewayRef },
    });
    return { credited: true, purchase: pu };
  });
}

/** Super Admin: add / remove credits on a workspace (never below 0). */
export async function adjustAccountCredits({ agencyId, bucket, amount, note, adminUserId }) {
  const delta = Math.trunc(Number(amount));
  if (!delta) throw new AiCreditError("Enter a non-zero amount", { code: "BAD_AMOUNT", status: 400 });
  if (!["PURCHASED", "PACKAGE"].includes(bucket)) throw new AiCreditError("Choose package or purchased credits", { code: "BAD_BUCKET", status: 400 });
  const plan = await getPlanContext(agencyId);
  return inTransaction(async (conn) => {
    const w = await lockWallet(conn, agencyId, plan);
    if (bucket === "PURCHASED") {
      const before = Number(w.purchased_balance);
      const room = before - Number(w.held_purchased);
      if (delta < 0 && -delta > room) throw new AiCreditError(`Only ${fmt(room)} purchased credits can be removed`, { code: "BAD_AMOUNT", status: 400 });
      await conn.query("UPDATE ai_credit_wallets SET purchased_balance = purchased_balance + ? WHERE agency_id = ?", [delta, agencyId]);
      await ledger(conn, { agencyId, userId: adminUserId, type: "ADMIN_ADJUSTMENT", bucket, amount: delta, before, after: before + delta, source: "admin", metadata: { note } });
      return { before, after: before + delta };
    }
    // Package: adds / removes room for this period only (package_used moves the other way).
    if (w.package_allowance === null) throw new AiCreditError("This plan's AI credits are unlimited", { code: "UNLIMITED", status: 400 });
    const before = packageLeft(w);
    const newUsed = Number(w.package_used) - delta;
    if (newUsed < 0 && delta > 0) {
      // More than the used amount: raise this period's allowance instead.
      await conn.query("UPDATE ai_credit_wallets SET package_used = 0, package_allowance = package_allowance + ? WHERE agency_id = ?", [-newUsed, agencyId]);
    } else {
      if (before + delta < 0) throw new AiCreditError(`Only ${fmt(before)} package credits are left this period`, { code: "BAD_AMOUNT", status: 400 });
      await conn.query("UPDATE ai_credit_wallets SET package_used = ? WHERE agency_id = ?", [newUsed, agencyId]);
    }
    await ledger(conn, { agencyId, userId: adminUserId, type: "ADMIN_ADJUSTMENT", bucket, amount: delta, before, after: before + delta, source: "admin", metadata: { note, periodOnly: true } });
    return { before, after: before + delta };
  });
}

/** Super Admin: marks an add-on purchase refunded and takes back its credits still unused (never below 0). */
export async function refundAddonPurchase({ purchaseId, adminUserId, note }) {
  return inTransaction(async (conn) => {
    const [[pu]] = await conn.query("SELECT * FROM ai_credit_purchases WHERE id = ? FOR UPDATE", [purchaseId]);
    if (!pu) throw new AiCreditError("Purchase not found", { code: "NOT_FOUND", status: 404 });
    if (pu.status !== "PAID") throw new AiCreditError("Only a paid purchase can be refunded", { code: "BAD_STATUS", status: 400 });
    const [[w]] = await conn.query("SELECT purchased_balance, held_purchased FROM ai_credit_wallets WHERE agency_id = ? FOR UPDATE", [pu.agency_id]);
    const before = Number(w?.purchased_balance || 0);
    const takeBack = Math.min(Number(pu.credits), Math.max(0, before - Number(w?.held_purchased || 0)));
    await conn.query("UPDATE ai_credit_wallets SET purchased_balance = purchased_balance - ? WHERE agency_id = ?", [takeBack, pu.agency_id]);
    await conn.query("UPDATE ai_credit_purchases SET status = 'REFUNDED', refunded_credits = ? WHERE id = ?", [takeBack, pu.id]);
    await ledger(conn, {
      agencyId: pu.agency_id, userId: adminUserId, type: "REFUND", bucket: "PURCHASED", amount: -takeBack,
      before, after: before - takeBack, source: "admin", purchaseId: pu.id, idempotencyKey: `refund:${pu.id}`,
      metadata: { note, purchasedCredits: Number(pu.credits), alreadySpent: Number(pu.credits) - takeBack },
    });
    return { takenBack: takeBack };
  });
}

/** Super Admin: add to (or take from) the platform pool. */
export async function adjustPlatformPool({ amount, note, adminUserId }) {
  const delta = Math.trunc(Number(amount));
  if (!delta) throw new AiCreditError("Enter a non-zero amount", { code: "BAD_AMOUNT", status: 400 });
  return inTransaction(async (conn) => {
    const p = await lockPool(conn);
    const before = Number(p.balance);
    if (before + delta < Number(p.held)) throw new AiCreditError(`The platform pool can go down to ${fmt(p.held)} at most right now`, { code: "BAD_AMOUNT", status: 400 });
    await conn.query("UPDATE ai_platform_pool SET balance = balance + ?, total_added = total_added + GREATEST(?, 0) WHERE id = 1", [delta, delta]);
    await ledger(conn, {
      scope: "PLATFORM", userId: adminUserId, type: delta > 0 ? "PLATFORM_CREDIT_ADDED" : "PLATFORM_CREDIT_REMOVED", bucket: "PLATFORM",
      amount: delta, before, after: before + delta, source: "admin", metadata: { note },
    });
    return { before, after: before + delta };
  });
}

// ─── Background: release holds left by a crashed call ────────────────────────
export async function releaseStaleHolds(maxAgeMinutes = 15) {
  const [rows] = await pool.query("SELECT id FROM ai_credit_holds WHERE created_at < NOW() - INTERVAL ? MINUTE LIMIT 500", [maxAgeMinutes]);
  for (const r of rows) await releaseHold({ id: r.id }).catch((err) => console.error("[AI credits] hold release:", err.message));
  return rows.length;
}

export function startAiCreditJobs() {
  setInterval(lockedJob("ai-credit-holds", async () => {
    try { await releaseStaleHolds(); } catch (err) { console.error("[AI credits] stale holds:", err.message); }
  }), 5 * 60_000);
}
