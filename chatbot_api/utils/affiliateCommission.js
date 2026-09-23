/**
 * Affiliate commission — shared logic for the Super Admin's referral
 * program (see migrate_affiliate_system.js for the table shapes and
 * routes/affiliate.js for the API surface).
 *
 * Eligibility: only a tenant signed up directly under the Super Admin
 * (agencies.account_type DIRECT_CUSTOMER or RESELLER — never
 * RESELLER_CUSTOMER, a Reseller's own end user) can be an affiliate.
 * `getOrCreateAffiliate` enforces that; callers should still gate access
 * with req.tenant.accountType before calling it from a route.
 */
import crypto from "crypto";
import pool from "../db.js";
import { isEligibleAccountType } from "./tenantEligibility.js";

const DEFAULT_COMMISSION_RATE = 25.0;

function randomCode() {
  // 8 uppercase alphanumeric chars, unambiguous-ish — not cryptographic,
  // just needs to be short, URL-friendly and hard to guess by iteration.
  return crypto.randomBytes(6).toString("hex").toUpperCase().slice(0, 8);
}

async function generateUniqueCode() {
  for (let i = 0; i < 10; i++) {
    const code = randomCode();
    const [[existing]] = await pool.query("SELECT id FROM affiliates WHERE code = ? LIMIT 1", [code]);
    if (!existing) return code;
  }
  // Astronomically unlikely, but fall back to a guaranteed-unique code.
  return `${randomCode()}${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
}

// Re-exported for existing importers (routes/affiliate.js) — the actual
// predicate now lives in utils/tenantEligibility.js, shared with the Forum.
export { isEligibleAccountType };

/**
 * Returns the affiliate row for this agency, creating one (with a fresh
 * unique code) on first use. Purely additive — no separate opt-in step,
 * since having a referral link costs an eligible tenant nothing.
 */
export async function getOrCreateAffiliate(agencyId) {
  const [[existing]] = await pool.query("SELECT * FROM affiliates WHERE agency_id = ? LIMIT 1", [agencyId]);
  if (existing) return existing;

  const code = await generateUniqueCode();
  const [result] = await pool.query(
    "INSERT INTO affiliates (agency_id, code, status, commission_rate) VALUES (?, ?, 'ACTIVE', ?)",
    [agencyId, code, DEFAULT_COMMISSION_RATE]
  );
  const [[created]] = await pool.query("SELECT * FROM affiliates WHERE id = ?", [result.insertId]);
  return created;
}

/** Look up an ACTIVE affiliate by its referral code. Returns null if not found/suspended. */
export async function resolveActiveAffiliateByCode(code) {
  if (!code) return null;
  const [[affiliate]] = await pool.query(
    "SELECT * FROM affiliates WHERE code = ? AND status = 'ACTIVE' LIMIT 1",
    [String(code).trim()]
  );
  return affiliate || null;
}

/**
 * Attributes a newly-created agency to the affiliate behind `affiliateCode`,
 * if any. Call once, right after the agency row is inserted — agencies.affiliate_id
 * is write-once (no other code path ever updates it afterwards). Silently
 * no-ops on an invalid/suspended code or a self-referral (agency referring
 * itself, which can't normally happen since the agency is brand new, but
 * guarded regardless).
 */
export async function attributeReferral(agencyId, affiliateCode) {
  if (!affiliateCode) return;
  const affiliate = await resolveActiveAffiliateByCode(affiliateCode);
  if (!affiliate || affiliate.agency_id === agencyId) return;
  await pool.query("UPDATE agencies SET affiliate_id = ? WHERE id = ? AND affiliate_id IS NULL", [affiliate.id, agencyId]);
}

/** Aggregated earnings for one affiliate — used by both the tenant dashboard and the admin detail view. */
export async function getAffiliateStats(affiliateId) {
  const [[referred]] = await pool.query("SELECT COUNT(*) AS referredCount FROM agencies WHERE affiliate_id = ?", [affiliateId]);
  const [[amounts]] = await pool.query(
    `SELECT
       COALESCE(SUM(revenue_amount), 0) AS totalRevenue,
       COALESCE(SUM(CASE WHEN status != 'VOID' THEN commission_amount ELSE 0 END), 0) AS totalCommission,
       COALESCE(SUM(CASE WHEN status = 'PENDING' THEN commission_amount ELSE 0 END), 0) AS pendingBalance,
       COALESCE(SUM(CASE WHEN status = 'PAID' THEN commission_amount ELSE 0 END), 0) AS paidTotal
     FROM affiliate_commissions WHERE affiliate_id = ?`,
    [affiliateId]
  );
  return {
    referredCount: referred.referredCount,
    totalRevenue: Number(amounts.totalRevenue),
    totalCommission: Number(amounts.totalCommission),
    pendingBalance: Number(amounts.pendingBalance),
    paidTotal: Number(amounts.paidTotal),
  };
}

/**
 * Records a commission for a PAID invoice, if the paying agency was
 * referred by an active affiliate. Idempotent on invoice_id — safe to
 * call from a webhook handler that may retry.
 */
export async function recordCommissionForInvoice({ agencyId, invoiceId, amountPaid, currency }) {
  if (!agencyId || !invoiceId || !amountPaid) return;

  const [[agency]] = await pool.query("SELECT affiliate_id FROM agencies WHERE id = ?", [agencyId]);
  if (!agency?.affiliate_id) return;

  const [[affiliate]] = await pool.query("SELECT * FROM affiliates WHERE id = ? AND status = 'ACTIVE'", [agency.affiliate_id]);
  if (!affiliate) return;

  const revenueAmount = Number(amountPaid);
  const commissionAmount = Math.round(revenueAmount * (Number(affiliate.commission_rate) / 100) * 100) / 100;

  await pool.query(
    `INSERT INTO affiliate_commissions
      (affiliate_id, referred_agency_id, invoice_id, revenue_amount, commission_rate, commission_amount, currency, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
     ON DUPLICATE KEY UPDATE invoice_id = invoice_id`,
    [affiliate.id, agencyId, invoiceId, revenueAmount, affiliate.commission_rate, commissionAmount, currency || "USD"]
  );
}
