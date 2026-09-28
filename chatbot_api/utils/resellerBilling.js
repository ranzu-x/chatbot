import Stripe from "stripe";
import pool from "../db.js";
import { decryptSecret } from "./cryptoVault.js";
import { periodEndFor, invalidateSubscriptionCache } from "./subscriptionStatus.js";
import { createOrder, getOrder, captureOrder, readCapture } from "./paypalClient.js";

/**
 * Reseller payments (Stripe or PayPal). A reseller's customer (RESELLER_CUSTOMER) pays one of the
 * reseller's plans (agency_packages) with Stripe Checkout created on the
 * **reseller's own Stripe account** (agency_payment_gateways, BYOK) — the money
 * goes straight to the reseller; the platform takes no fee (decided earlier).
 * One payment = one billing cycle (monthly / yearly), like platform renewals;
 * renewing the same plan before it ends extends from the current end.
 *
 * A payment is confirmed either by the customer coming back to the success
 * page (`confirmCheckout` reads the session with the reseller's key) or by the
 * reseller's Stripe webhook — whichever comes first; UNIQUE(provider,
 * provider_session_id) makes it count once.
 */
const frontendBase = () => (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");

async function gatewayRow(resellerId, provider) {
  const [[row]] = await pool.query(
    "SELECT credentials, mode FROM agency_payment_gateways WHERE agency_id = ? AND provider = ? AND is_active = 1",
    [resellerId, provider]
  );
  if (!row) return null;
  return { creds: JSON.parse(decryptSecret(row.credentials) || "{}"), mode: row.mode || "live" };
}

export async function resellerStripe(resellerId) {
  const row = await gatewayRow(resellerId, "STRIPE");
  if (!row?.creds.secretKey) return null;
  return { stripe: new Stripe(row.creds.secretKey), webhookSecret: row.creds.webhookSecret || null };
}

/** { clientId, clientSecret, mode } of the reseller's PayPal app, or null. */
export async function resellerPaypal(resellerId) {
  const row = await gatewayRow(resellerId, "PAYPAL");
  if (!row?.creds.clientId || !row.creds.clientSecret) return null;
  return { clientId: row.creds.clientId, clientSecret: row.creds.clientSecret, mode: row.mode };
}

/** Which ways this reseller's customers can pay: ['STRIPE', 'PAYPAL']. */
export async function availableProviders(resellerId) {
  const [stripe, paypal] = await Promise.all([resellerStripe(resellerId).catch(() => null), resellerPaypal(resellerId).catch(() => null)]);
  return [stripe && "STRIPE", paypal && "PAYPAL"].filter(Boolean);
}

/** The customer's workspace and its reseller, or a 4xx error. */
export async function customerContext(agencyId) {
  const [[agency]] = await pool.query("SELECT id, name, account_type, parent_agency_id FROM agencies WHERE id = ?", [agencyId]);
  if (!agency || agency.account_type !== "RESELLER_CUSTOMER" || !agency.parent_agency_id) {
    throw Object.assign(new Error("Only a reseller's customers pay through this page"), { status: 403 });
  }
  return { agency, resellerId: agency.parent_agency_id };
}

export async function currentClientPlan(clientAgencyId) {
  const [[row]] = await pool.query(
    `SELECT acs.*, ap.name AS package_name, ap.billing_cycle, ap.price, ap.currency
     FROM agency_client_subscriptions acs LEFT JOIN agency_packages ap ON ap.id = acs.package_id
     WHERE acs.client_agency_id = ? AND acs.status = 'ACTIVE' ORDER BY acs.id DESC LIMIT 1`,
    [clientAgencyId]
  );
  return row || null;
}

// PayPal carries our ids in custom_id: "rb:<resellerId>:<clientAgencyId>:<packageId>".
const paypalCustomId = (resellerId, clientId, packageId) => `rb:${resellerId}:${clientId}:${packageId}`;
function parsePaypalCustomId(v) {
  const m = /^rb:(\d+):(\d+):(\d+)$/.exec(String(v || ""));
  return m ? { resellerId: Number(m[1]), clientAgencyId: Number(m[2]), packageId: Number(m[3]) } : null;
}

export async function createCheckout({ agencyId, packageId, customerEmail, provider = "STRIPE" }) {
  const { agency, resellerId } = await customerContext(agencyId);
  const [[pkg]] = await pool.query(
    "SELECT * FROM agency_packages WHERE id = ? AND agency_id = ? AND is_active = 1",
    [packageId, resellerId]
  );
  if (!pkg) throw Object.assign(new Error("Plan not found"), { status: 404 });
  const amount = Number(pkg.price) || 0;
  if (amount <= 0 || pkg.billing_cycle === "free") throw Object.assign(new Error("This plan is free — ask your provider to assign it"), { status: 400 });

  if (provider === "PAYPAL") {
    const creds = await resellerPaypal(resellerId);
    if (!creds) throw Object.assign(new Error("Your provider hasn't set up PayPal. Please choose another way to pay."), { status: 400 });
    const [[reseller]] = await pool.query("SELECT name FROM agencies WHERE id = ?", [resellerId]);
    const order = await createOrder(creds, {
      amount, currency: pkg.currency || "USD", description: pkg.name,
      customId: paypalCustomId(resellerId, agency.id, pkg.id), referenceId: `plan-${pkg.id}`,
      // PayPal appends ?token=<order id>&PayerID=… to the return link.
      returnUrl: `${frontendBase()}/account?tab=billing&reseller_paypal=1`,
      cancelUrl: `${frontendBase()}/account?tab=billing`,
      brandName: reseller?.name,
    });
    if (!order.approveUrl) throw Object.assign(new Error("PayPal didn't return a payment link"), { status: 502 });
    return { url: order.approveUrl, orderId: order.id, provider: "PAYPAL" };
  }

  const gw = await resellerStripe(resellerId);
  if (!gw) throw Object.assign(new Error("Your provider hasn't set up online payments yet. Please contact them."), { status: 400 });
  const session = await gw.stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      price_data: {
        currency: String(pkg.currency || "USD").toLowerCase(),
        product_data: { name: pkg.name, description: pkg.description || undefined },
        unit_amount: Math.round(amount * 100),
      },
      quantity: 1,
    }],
    customer_email: customerEmail || undefined,
    success_url: `${frontendBase()}/account?tab=billing&reseller_session={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontendBase()}/account?tab=billing`,
    metadata: { resellerCheckout: "1", resellerId: String(resellerId), clientAgencyId: String(agency.id), packageId: String(pkg.id) },
  });
  return { url: session.url, sessionId: session.id, provider: "STRIPE" };
}

/**
 * Records a confirmed payment and activates the plan (idempotent through
 * UNIQUE(provider, provider_session_id)). Every caller must have read the
 * payment from the reseller's own gateway account first.
 */
export async function applyPayment({ resellerId, clientAgencyId, packageId, provider, providerRef, amount, currency, customerRef = null }) {
  const [[client]] = await pool.query("SELECT id FROM agencies WHERE id = ? AND parent_agency_id = ? AND account_type = 'RESELLER_CUSTOMER'", [clientAgencyId, resellerId]);
  const [[pkg]] = await pool.query("SELECT * FROM agency_packages WHERE id = ? AND agency_id = ?", [packageId, resellerId]);
  if (!client || !pkg) return { ok: false, reason: "customer or plan gone" };

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const current = await currentClientPlan(clientAgencyId);
    // Same plan renewed early: the new cycle starts where the old one ends.
    const from = current && Number(current.package_id) === Number(packageId) && current.current_period_end && new Date(current.current_period_end) > new Date()
      ? new Date(current.current_period_end) : new Date();
    const periodEnd = periodEndFor(pkg.billing_cycle, from);
    const [ins] = await conn.query(
      `INSERT IGNORE INTO agency_client_payments (reseller_agency_id, client_agency_id, package_id, package_name, provider, provider_session_id, amount, currency, period_end)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [resellerId, clientAgencyId, packageId, pkg.name, provider, String(providerRef), Number(amount) || 0, String(currency || pkg.currency || "USD").toUpperCase(), periodEnd]
    );
    if (!ins.affectedRows) {
      await conn.rollback();
      return { ok: true, alreadyApplied: true };
    }
    await conn.query("UPDATE agency_client_subscriptions SET status = 'CANCELLED' WHERE client_agency_id = ? AND status = 'ACTIVE'", [clientAgencyId]);
    await conn.query(
      `INSERT INTO agency_client_subscriptions (agency_id, client_agency_id, package_id, provider, provider_customer_id, status, started_at,
         current_period_start, current_period_end, notes)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', NOW(), NOW(), ?, 'Paid by the customer')`,
      [resellerId, clientAgencyId, packageId, provider, customerRef, periodEnd]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
  invalidateSubscriptionCache(clientAgencyId);
  return { ok: true };
}

/** A Stripe Checkout Session read from the reseller's own Stripe account. */
export async function applyPaidSession(resellerId, session) {
  const md = session?.metadata || {};
  if (md.resellerCheckout !== "1" || Number(md.resellerId) !== Number(resellerId)) return { ok: false, reason: "not ours" };
  if (session.payment_status !== "paid") return { ok: false, reason: "not paid" };
  return applyPayment({
    resellerId, clientAgencyId: Number(md.clientAgencyId), packageId: Number(md.packageId),
    provider: "STRIPE", providerRef: session.id, amount: (Number(session.amount_total) || 0) / 100,
    currency: session.currency, customerRef: session.customer || null,
  });
}

/** A captured PayPal order read from the reseller's own PayPal account. */
export async function applyPaypalOrder(resellerId, order, clientAgencyId) {
  const cap = readCapture(order);
  const ids = parsePaypalCustomId(cap.customId);
  if (!ids || ids.resellerId !== Number(resellerId) || ids.clientAgencyId !== Number(clientAgencyId)) return { ok: false, reason: "not ours" };
  if (!cap.paid) return { ok: false, reason: "not paid" };
  return applyPayment({
    resellerId, clientAgencyId: ids.clientAgencyId, packageId: ids.packageId,
    provider: "PAYPAL", providerRef: order.id, amount: cap.amount, currency: cap.currency,
    customerRef: order.payer?.payer_id || null,
  });
}

/** The customer came back from the gateway: read the payment with the reseller's keys and apply it. */
export async function confirmCheckout(agencyId, sessionId) {
  const { resellerId } = await customerContext(agencyId);
  const gw = await resellerStripe(resellerId);
  if (!gw) throw Object.assign(new Error("Payment settings are missing"), { status: 400 });
  const session = await gw.stripe.checkout.sessions.retrieve(String(sessionId));
  if (Number(session?.metadata?.clientAgencyId) !== Number(agencyId)) throw Object.assign(new Error("Payment not found"), { status: 404 });
  return applyPaidSession(resellerId, session);
}

export async function confirmPaypal(agencyId, orderId) {
  const { resellerId } = await customerContext(agencyId);
  const creds = await resellerPaypal(resellerId);
  if (!creds) throw Object.assign(new Error("Payment settings are missing"), { status: 400 });
  // Check it's this customer's order before capturing anything.
  const order = await getOrder(creds, String(orderId));
  const ids = parsePaypalCustomId(order?.purchase_units?.[0]?.custom_id);
  if (!ids || ids.clientAgencyId !== Number(agencyId) || ids.resellerId !== Number(resellerId)) throw Object.assign(new Error("Payment not found"), { status: 404 });
  const captured = order.status === "COMPLETED" ? order : await captureOrder(creds, order.id);
  return applyPaypalOrder(resellerId, captured, agencyId);
}

/** Dashboard earnings for a reseller, same shape as the platform's (utils/dashboardStats.js). */
export async function resellerEarnings(resellerId) {
  const [[currencyRow]] = await pool.query(
    "SELECT currency, COUNT(*) n FROM agency_client_payments WHERE reseller_agency_id = ? GROUP BY currency ORDER BY n DESC LIMIT 1",
    [resellerId]
  );
  const currency = currencyRow?.currency || "USD";
  const [[s]] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total,
            COALESCE(SUM(IF(paid_at >= DATE_FORMAT(NOW(), '%Y-%m-01'), amount, 0)), 0) AS month,
            COALESCE(SUM(IF(paid_at >= DATE_FORMAT(NOW() - INTERVAL 1 MONTH, '%Y-%m-01') AND paid_at < DATE_FORMAT(NOW(), '%Y-%m-01'), amount, 0)), 0) AS lastMonth,
            COALESCE(SUM(IF(YEAR(paid_at) = YEAR(NOW()), amount, 0)), 0) AS year,
            COALESCE(SUM(IF(YEAR(paid_at) = YEAR(NOW()) - 1 AND paid_at <= NOW() - INTERVAL 1 YEAR, amount, 0)), 0) AS lastYearToDate,
            COUNT(*) AS payments
     FROM agency_client_payments WHERE reseller_agency_id = ? AND currency = ?`,
    [resellerId, currency]
  );
  const [monthly] = await pool.query(
    `SELECT YEAR(paid_at) AS y, MONTH(paid_at) AS m, SUM(amount) AS amount FROM agency_client_payments
     WHERE reseller_agency_id = ? AND currency = ? AND paid_at >= MAKEDATE(YEAR(NOW()) - 1, 1)
     GROUP BY YEAR(paid_at), MONTH(paid_at)`,
    [resellerId, currency]
  );
  const round2 = (v) => Math.round(Number(v || 0) * 100) / 100;
  const thisYear = new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, current: 0, previous: 0 }));
  for (const r of monthly) {
    const slot = months[Number(r.m) - 1];
    if (Number(r.y) === thisYear) slot.current = round2(r.amount);
    else slot.previous = round2(r.amount);
  }
  return {
    available: true,
    currency,
    total: round2(s.total), month: round2(s.month), lastMonth: round2(s.lastMonth), year: round2(s.year),
    lastYearToDate: round2(s.lastYearToDate), payments: Number(s.payments || 0),
    yearComparison: { currentYear: thisYear, previousYear: thisYear - 1, months },
    topCountries: [],
  };
}
