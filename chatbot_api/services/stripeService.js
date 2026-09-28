import Stripe from "stripe";
import { periodEndFor, invalidateSubscriptionCache } from "../utils/subscriptionStatus.js";
import { priceForCheckout, recordCouponRedemption } from "../utils/checkoutPricing.js";
import pool from "../db.js";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
export const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

// ─── GET OR CREATE STRIPE CUSTOMER ───────────────────────────────────────────
export async function getOrCreateStripeCustomer({ agencyId, userId, email, name }) {
  if (!stripe) return `sim_cust_${agencyId || userId || Date.now()}`;

  // Check if we already have a stripe_customer_id
  let existingCustId = null;
  if (agencyId) {
    const [subs] = await pool.query("SELECT stripe_customer_id FROM subscriptions WHERE agency_id = ? AND stripe_customer_id IS NOT NULL LIMIT 1", [agencyId]);
    if (subs.length && subs[0].stripe_customer_id) existingCustId = subs[0].stripe_customer_id;
  } else if (userId) {
    const [subs] = await pool.query("SELECT stripe_customer_id FROM subscriptions WHERE user_id = ? AND stripe_customer_id IS NOT NULL LIMIT 1", [userId]);
    if (subs.length && subs[0].stripe_customer_id) existingCustId = subs[0].stripe_customer_id;
  }

  if (existingCustId) return existingCustId;

  // Create new customer in Stripe
  const customer = await stripe.customers.create({
    email,
    name: name || `Workspace ${agencyId || userId}`,
    metadata: {
      agencyId: String(agencyId || ""),
      userId: String(userId || ""),
    },
  });

  return customer.id;
}

// ─── ENSURE STRIPE PRODUCT & PRICE EXISTS ────────────────────────────────────
export async function ensureStripePrice(pkg) {
  if (!stripe) return "sim_price_free";

  if (pkg.stripe_price_id) {
    return pkg.stripe_price_id;
  }

  // Auto-create product in Stripe
  const product = await stripe.products.create({
    name: `Nexa Chatbot — ${pkg.name}`,
    description: pkg.description || `Subscription package for ${pkg.type}`,
    metadata: {
      packageId: String(pkg.id),
      type: pkg.type,
    },
  });

  let interval = "month";
  let intervalCount = 1;
  if (pkg.billing_cycle === "yearly") interval = "year";
  else if (pkg.billing_cycle === "quarterly") intervalCount = 3; // Stripe has no native "quarterly" interval — month x3

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: Math.round(Number(pkg.price) * 100), // in cents
    currency: "usd",
    recurring: pkg.billing_cycle === "lifetime" || pkg.billing_cycle === "free" ? undefined : { interval, interval_count: intervalCount },
    metadata: {
      packageId: String(pkg.id),
    },
  });

  // Save back to database
  await pool.query("UPDATE packages SET stripe_product_id = ?, stripe_price_id = ? WHERE id = ?", [
    product.id,
    price.id,
    pkg.id,
  ]);

  return price.id;
}

// ─── CREATE STRIPE CHECKOUT SESSION ──────────────────────────────────────────
/**
 * A package a signed-in customer may buy: any public, active package — or
 * their workspace's CURRENT package even when private (Super-Admin-assigned
 * plans must be renewable too, or an expired private plan could never be paid).
 */
export async function loadPurchasablePackage(packageId, agencyId) {
  const [[pkg]] = await pool.query(
    `SELECT p.* FROM packages p
     WHERE p.id = ? AND p.is_active = 1
       AND (p.is_public = 1 OR p.id = (SELECT package_id FROM agencies WHERE id = ?))`,
    [packageId, agencyId || 0]
  );
  if (!pkg) {
    const err = new Error("Package not found");
    err.status = 404;
    throw err;
  }
  return pkg;
}

/** The checkout's discount as a single-use Stripe coupon (amount off, USD). */
export async function stripeDiscountsFor(quote, label) {
  if (!stripe || !quote?.discountAmount || quote.discountAmount <= 0) return undefined;
  const coupon = await stripe.coupons.create({
    amount_off: Math.round(quote.discountAmount * 100),
    currency: "usd",
    duration: quote.recurring ? "forever" : "once",
    max_redemptions: 1,
    name: String(label || "Discount").slice(0, 40),
  });
  return [{ coupon: coupon.id }];
}

export async function createCheckoutSession({ agencyId, userId, packageId, userEmail, userName, successUrl, cancelUrl, couponCode = null }) {
  const pkg = await loadPurchasablePackage(packageId, agencyId);
  const quote = await priceForCheckout({ pkg, userId, agencyId, email: userEmail, couponCode });
  if (quote.couponError) {
    const err = new Error(quote.couponError);
    err.status = 400;
    throw err;
  }

  // Free package ($0) → assigned at once, no payment.
  if (Number(pkg.price) === 0 || pkg.billing_cycle === "free") {
    await assignPackageLocally({ agencyId, userId, packageId, notes: `Switched to Free plan (${pkg.name})` });
    return { isFree: true, url: successUrl || "/agency/plan" };
  }

  // Fully discounted (e.g. a 100% coupon) → one billing period, no payment.
  if (quote.finalPrice <= 0) {
    await assignPackageLocally({ agencyId, userId, packageId, notes: `${pkg.name} — fully discounted${quote.coupon ? ` (coupon ${quote.coupon.code})` : ""}` });
    const [inv] = await pool.query(
      `INSERT INTO invoices (agency_id, user_id, package_id, amount_paid, currency, status, discount_amount, coupon_id, paid_at)
       VALUES (?, ?, ?, 0, 'USD', 'PAID', ?, ?, NOW())`,
      [agencyId || null, userId || null, packageId, quote.discountAmount, quote.coupon?.id || null]
    );
    await recordCouponRedemption({ couponId: quote.coupon?.id, agencyId, email: userEmail, invoiceId: inv.insertId, discountAmount: quote.discountAmount });
    return { isFree: true, url: successUrl || "/agency/plan" };
  }

  // Simulated mode if no Stripe API Key configured
  if (!stripe) {
    // Instant test activation for sandbox dev
    await assignPackageLocally({
      agencyId,
      userId,
      packageId,
      stripeCustomerId: `mock_cust_${Date.now()}`,
      stripeSubId: `mock_sub_${Date.now()}`,
      notes: `Activated in Dev/Test Mode (${pkg.name})`,
    });
    await recordCouponRedemption({ couponId: quote.coupon?.id, agencyId, email: userEmail, discountAmount: quote.discountAmount });
    return { isSimulated: true, url: `${successUrl || "/agency/plan"}?status=success&simulated=true` };
  }

  // Live Stripe Checkout
  const stripeCustomerId = await getOrCreateStripeCustomer({ agencyId, userId, email: userEmail, name: userName });
  const priceId = await ensureStripePrice(pkg);
  const discounts = await stripeDiscountsFor(quote, quote.coupon ? `Coupon ${quote.coupon.code}` : "Discount");

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    payment_method_types: ["card"],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    ...(discounts ? { discounts } : {}),
    mode: pkg.billing_cycle === "lifetime" ? "payment" : "subscription",
    success_url: `${successUrl || "http://localhost:5173/billing/success"}?session_id={CHECKOUT_SESSION_ID}&pkg_id=${packageId}`,
    cancel_url: cancelUrl || "http://localhost:5173/agency/plan",
    metadata: {
      agencyId: String(agencyId || ""),
      userId: String(userId || ""),
      packageId: String(packageId),
      packageName: pkg.name,
      couponId: quote.coupon ? String(quote.coupon.id) : "",
      discountAmount: String(quote.discountAmount || 0),
      email: userEmail || "",
    },
    subscription_data: pkg.billing_cycle === "lifetime" ? undefined : {
      metadata: {
        agencyId: String(agencyId || ""),
        userId: String(userId || ""),
        packageId: String(packageId),
      },
    },
  });

  return { sessionId: session.id, url: session.url };
}

// ─── CREATE STRIPE CUSTOMER PORTAL SESSION ───────────────────────────────────
export async function createCustomerPortalSession({ agencyId, userId, returnUrl }) {
  if (!stripe) {
    throw new Error("Stripe Customer Portal requires STRIPE_SECRET_KEY configured in .env");
  }

  let stripeCustomerId = null;
  if (agencyId) {
    const [subs] = await pool.query("SELECT stripe_customer_id FROM subscriptions WHERE agency_id = ? AND stripe_customer_id IS NOT NULL LIMIT 1", [agencyId]);
    if (subs.length) stripeCustomerId = subs[0].stripe_customer_id;
  } else if (userId) {
    const [subs] = await pool.query("SELECT stripe_customer_id FROM subscriptions WHERE user_id = ? AND stripe_customer_id IS NOT NULL LIMIT 1", [userId]);
    if (subs.length) stripeCustomerId = subs[0].stripe_customer_id;
  }

  if (!stripeCustomerId) {
    throw new Error("No active Stripe customer found for this workspace. Please subscribe to a plan first.");
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl || "http://localhost:5173/agency/plan",
  });

  return { url: portalSession.url };
}

// ─── HELPER: ASSIGN PACKAGE & SYNC SUBSCRIPTIONS ─────────────────────────────
export async function assignPackageLocally({
  agencyId,
  userId,
  packageId,
  stripeCustomerId = null,
  stripeSubId = null,
  stripePriceId = null,
  notes = null,
  periodEnd, // Date | null — default: one billing cycle (null for free / lifetime)
}) {
  const [pkgRows] = await pool.query("SELECT * FROM packages WHERE id = ?", [packageId]);
  if (!pkgRows.length) return;
  const pkg = pkgRows[0];

  // Buying the same plan again before it ends (a renewal) adds a full cycle
  // after the current end date — paid days are never lost.
  const endFor = async (column, id) => {
    if (periodEnd !== undefined) return periodEnd;
    const [[current]] = await pool.query(
      `SELECT package_id, COALESCE(expires_at, current_period_end) AS ends_at FROM subscriptions
       WHERE ${column} = ? AND status = 'ACTIVE' ORDER BY id DESC LIMIT 1`,
      [id]
    );
    const from = current && Number(current.package_id) === Number(packageId) && current.ends_at && new Date(current.ends_at) > new Date()
      ? new Date(current.ends_at)
      : new Date();
    return periodEndFor(pkg.billing_cycle, from);
  };

  const insert = async (column, id) => {
    const end = await endFor(column, id);
    await pool.query(`UPDATE subscriptions SET status = 'CANCELLED' WHERE ${column} = ? AND status = 'ACTIVE'`, [id]);
    await pool.query(
      `INSERT INTO subscriptions (
        ${column}, package_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, status, started_at,
        current_period_start, current_period_end, expires_at, notes
      ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', NOW(), NOW(), ?, ?, ?)`,
      [id, packageId, stripeCustomerId, stripeSubId, stripePriceId, end, end, notes || `Subscribed to ${pkg.name}`]
    );
  };

  if (agencyId) {
    await pool.query("UPDATE agencies SET package_id = ? WHERE id = ?", [packageId, agencyId]);
    await insert("agency_id", agencyId);
  }
  if (userId) {
    await pool.query("UPDATE users SET package_id = ? WHERE id = ?", [packageId, userId]);
    await insert("user_id", userId);
  }
  invalidateSubscriptionCache(); // the workspace may have just left read-only mode
  // A Reseller package makes the workspace a Reseller; a Reseller never goes back (utils/accountTypeRules.js).
  const { applyPackageAccountType } = await import("../utils/accountTypeRules.js");
  return applyPackageAccountType({ agencyId, userId: agencyId ? null : userId, packageId });
}
