/**
 * Consumes a pending_signups row once a payment gateway's TRUSTED webhook/
 * IPN confirms a successful payment — the single place a guest-checkout
 * account actually gets created. Never call this from a browser
 * success-redirect handler; those only ever show a status page (see
 * routes/billing.js's guest-checkout success/fail/cancel endpoints).
 */
import pool from "../db.js";
import { createAccount } from "../utils/accountProvisioning.js";
import { assignPackageLocally } from "./stripeService.js";
import { sendWelcomeEmail } from "../utils/emailNotifications.js";
import { sendVerificationEmail } from "../utils/emailVerification.js";
import { recordCommissionForInvoice } from "../utils/affiliateCommission.js";

export async function consumePendingSignup(referenceToken, gatewayTxnId, amountPaid) {
  const [[row]] = await pool.query("SELECT * FROM pending_signups WHERE reference_token = ? LIMIT 1", [referenceToken]);
  if (!row) return { success: false, reason: "not_found" };

  if (row.status === "CONSUMED") {
    return { success: true, alreadyConsumed: true, agencyId: row.created_agency_id, userId: row.created_user_id };
  }

  // Idempotency guard: only the caller that flips PENDING -> PAID proceeds
  // with account creation — gateways routinely retry webhook delivery, and
  // this must never create two accounts for one purchase.
  const [lockResult] = await pool.query(
    "UPDATE pending_signups SET status = 'PAID', gateway_txn_id = COALESCE(gateway_txn_id, ?) WHERE id = ? AND status = 'PENDING'",
    [gatewayTxnId, row.id]
  );

  if (!lockResult.affectedRows) {
    const [[fresh]] = await pool.query("SELECT * FROM pending_signups WHERE id = ?", [row.id]);
    if (fresh?.status === "CONSUMED") {
      return { success: true, alreadyConsumed: true, agencyId: fresh.created_agency_id, userId: fresh.created_user_id };
    }
    // Already PAID (a concurrent webhook won the race) but not yet
    // CONSUMED — let that other call finish; report success without
    // duplicating account creation.
    return { success: true, inProgress: true };
  }

  const { userId, agencyId, agencyName } = await createAccount({
    fullName: row.full_name,
    email: row.email,
    passwordHash: row.password_hash,
    businessName: row.business_name,
    affiliateCode: row.affiliate_code,
  });

  await assignPackageLocally({ agencyId, packageId: row.package_id, notes: `Guest checkout via ${row.provider}` });

  const finalAmountPaid = amountPaid ?? row.amount;
  const [invoiceResult] = await pool.query(
    `INSERT INTO invoices (agency_id, package_id, provider, gateway_txn_id, amount_paid, currency, status, paid_at)
     VALUES (?, ?, ?, ?, ?, ?, 'PAID', NOW())`,
    [agencyId, row.package_id, row.provider, gatewayTxnId, finalAmountPaid, row.currency]
  );
  await recordCommissionForInvoice({
    agencyId,
    invoiceId: invoiceResult.insertId,
    amountPaid: finalAmountPaid,
    currency: row.currency,
  });

  await pool.query(
    "UPDATE pending_signups SET status = 'CONSUMED', created_agency_id = ?, created_user_id = ? WHERE id = ?",
    [agencyId, userId, row.id]
  );

  const loginUrl = `${(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "")}/login`;
  sendWelcomeEmail({ to: row.email, name: row.full_name, agencyName, loginUrl }).catch(() => {});
  // The buyer typed this address at checkout without proving they own it —
  // same verification as a normal signup (non-blocking; soft-enforced).
  sendVerificationEmail({ userId, to: row.email, name: row.full_name }).catch(() => {});

  return { success: true, agencyId, userId, agencyName };
}
