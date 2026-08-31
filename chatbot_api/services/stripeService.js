import Stripe from "stripe";
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
  if (pkg.billing_cycle === "yearly") interval = "year";

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: Math.round(Number(pkg.price) * 100), // in cents
    currency: "usd",
    recurring: pkg.billing_cycle === "lifetime" || pkg.billing_cycle === "free" ? undefined : { interval },
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
export async function createCheckoutSession({ agencyId, userId, packageId, userEmail, userName, successUrl, cancelUrl }) {
  const [pkgRows] = await pool.query("SELECT * FROM packages WHERE id = ?", [packageId]);
  if (!pkgRows.length) throw new Error("Package not found");

  const pkg = pkgRows[0];

  // If free package ($0), instantly assign without Stripe redirect
  if (Number(pkg.price) === 0 || pkg.billing_cycle === "free") {
    await assignPackageLocally({ agencyId, userId, packageId, notes: `Switched to Free plan (${pkg.name})` });
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
    return { isSimulated: true, url: `${successUrl || "/agency/plan"}?status=success&simulated=true` };
  }

  // Live Stripe Checkout
  const stripeCustomerId = await getOrCreateStripeCustomer({ agencyId, userId, email: userEmail, name: userName });
  const priceId = await ensureStripePrice(pkg);

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    payment_method_types: ["card"],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: pkg.billing_cycle === "lifetime" ? "payment" : "subscription",
    success_url: `${successUrl || "http://localhost:5173/billing/success"}?session_id={CHECKOUT_SESSION_ID}&pkg_id=${packageId}`,
    cancel_url: cancelUrl || "http://localhost:5173/agency/plan",
    metadata: {
      agencyId: String(agencyId || ""),
      userId: String(userId || ""),
      packageId: String(packageId),
      packageName: pkg.name,
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
}) {
  const [pkgRows] = await pool.query("SELECT * FROM packages WHERE id = ?", [packageId]);
  if (!pkgRows.length) return;
  const pkg = pkgRows[0];

  if (agencyId) {
    await pool.query("UPDATE agencies SET package_id = ? WHERE id = ?", [packageId, agencyId]);
    await pool.query("UPDATE subscriptions SET status = 'CANCELLED' WHERE agency_id = ? AND status = 'ACTIVE'", [agencyId]);
    await pool.query(
      `INSERT INTO subscriptions (
        agency_id, package_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, status, started_at, notes
      ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', NOW(), ?)`,
      [agencyId, packageId, stripeCustomerId, stripeSubId, stripePriceId, notes || `Subscribed to ${pkg.name}`]
    );
  }

  if (userId) {
    await pool.query("UPDATE users SET package_id = ? WHERE id = ?", [packageId, userId]);
    await pool.query("UPDATE subscriptions SET status = 'CANCELLED' WHERE user_id = ? AND status = 'ACTIVE'", [userId]);
    await pool.query(
      `INSERT INTO subscriptions (
        user_id, package_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, status, started_at, notes
      ) VALUES (?, ?, ?, ?, ?, 'ACTIVE', NOW(), ?)`,
      [userId, packageId, stripeCustomerId, stripeSubId, stripePriceId, notes || `Subscribed to ${pkg.name}`]
    );
  }
}
