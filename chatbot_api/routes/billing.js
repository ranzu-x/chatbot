import express from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { stripe, createCheckoutSession, createCustomerPortalSession, assignPackageLocally, ensureStripePrice, loadPurchasablePackage, stripeDiscountsFor } from "../services/stripeService.js";
import { priceForCheckout, recordCouponRedemption } from "../utils/checkoutPricing.js";
import { invalidateSubscriptionCache } from "../utils/subscriptionStatus.js";
import { convertUsdToBdt } from "../utils/platformGateways.js";
import { consumePendingSignup } from "../services/guestSignupService.js";
import * as sslcommerz from "../services/sslcommerzService.js";
import * as aamarpay from "../services/aamarpayService.js";
import * as portwallet from "../services/portwalletService.js";
import { recordCommissionForInvoice } from "../utils/affiliateCommission.js";
import { resolveInvoiceCountry } from "../utils/country.js";

const router = express.Router();

const GATEWAY_ADAPTERS = { SSLCOMMERZ: sslcommerz, AAMARPAY: aamarpay, PORTWALLET: portwallet };
const frontendBase = () => (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
const backendBase = () => (process.env.BACKEND_URL || "http://localhost:5000").replace(/\/+$/, "");

// ─── GET PRICING PLANS ───────────────────────────────────────────────────────
router.get("/billing/plans", async (req, res) => {
  try {
    const [packages] = await pool.query(
      // Private (is_public = 0) packages are assigned by the Super Admin, never listed.
      "SELECT * FROM packages WHERE is_active = 1 AND is_public = 1 ORDER BY type ASC, price ASC"
    );

    const [modules] = await pool.query(`
      SELECT pm.package_id, pm.module_key, pm.is_enabled, m.display_name, m.module_type, m.category
      FROM package_modules pm
      JOIN modules m ON m.key = pm.module_key
      WHERE pm.is_enabled = 1
    `);

    const moduleMap = {};
    for (const pm of modules) {
      if (!moduleMap[pm.package_id]) moduleMap[pm.package_id] = [];
      moduleMap[pm.package_id].push({
        key: pm.module_key,
        displayName: pm.display_name,
        type: pm.module_type,
        category: pm.category,
      });
    }

    const plans = packages.map((p) => ({
      ...p,
      price: Number(p.price),
      enabledModules: moduleMap[p.id] || [],
    }));

    return res.json({ success: true, plans });
  } catch (err) {
    console.error("Billing plans error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── PAYMENT METHODS a buyer can use (public) ────────────────────────────────
// Stripe is always offered (without a key it runs the dev/test activation);
// the BDT gateways only when the Super Admin switched them on.
router.get("/billing/gateways", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT provider FROM platform_payment_gateways WHERE is_active = 1");
    const active = new Set(rows.map((r) => String(r.provider).toUpperCase()));
    const gateways = ["STRIPE", ...["SSLCOMMERZ", "AAMARPAY", "PORTWALLET"].filter((p) => active.has(p))];
    return res.json({ success: true, gateways, usdToBdt: await convertUsdToBdt(1) });
  } catch (err) {
    console.error("Gateways error:", err);
    return res.json({ success: true, gateways: ["STRIPE"] });
  }
});

// ─── PRICE QUOTE (pricing page, guest checkout, dashboard) ───────────────────
// What the package costs after the package discount, the buyer's personal
// discount and a coupon (utils/checkoutPricing.js). Public; a signed-in
// caller (req.tenant, from tenantContext) also gets their personal discount.
router.post("/billing/quote", async (req, res) => {
  try {
    const { packageId, couponCode, email } = req.body || {};
    const agencyId = req.tenant?.agencyId || null;
    const [[pkg]] = await pool.query(
      `SELECT * FROM packages WHERE id = ? AND is_active = 1 AND (is_public = 1 OR id = (SELECT package_id FROM agencies WHERE id = ?))`,
      [packageId, agencyId || 0]
    );
    if (!pkg) return res.status(404).json({ success: false, message: "Package not found" });
    const quote = await priceForCheckout({ pkg, userId: req.tenant?.userId || null, agencyId, email: email || null, couponCode: couponCode || null });
    return res.json({ success: true, quote: { ...quote, currency: "USD", bdtAmount: await convertUsdToBdt(quote.finalPrice) } });
  } catch (err) {
    console.error("Quote error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE CHECKOUT (signed in: upgrade, change plan or renew) ──────────────
// Stripe (card, recurring) or SSLCommerz / aamarPay / PortWallet (one
// payment per billing period — that's how those customers renew). Discounts
// and coupons apply (utils/checkoutPricing.js).
router.post("/billing/create-checkout", authMiddleware, async (req, res) => {
  try {
    const { packageId, successUrl, cancelUrl, couponCode } = req.body;
    if (!packageId) return res.status(400).json({ success: false, message: "Package ID is required" });
    const provider = String(req.body.provider || "STRIPE").toUpperCase();

    const agencyId = req.user?.agencyId;
    const userId = req.user?.id;
    const userEmail = req.user?.email;
    const userName = req.user?.name;

    if (provider === "STRIPE") {
      const result = await createCheckoutSession({ agencyId, userId, packageId, userEmail, userName, successUrl, cancelUrl, couponCode });
      return res.json({ success: true, ...result });
    }

    const adapter = GATEWAY_ADAPTERS[provider];
    if (!adapter) return res.status(400).json({ success: false, message: "Unsupported payment provider" });
    const pkg = await loadPurchasablePackage(packageId, agencyId);
    if (Number(pkg.price) === 0 || pkg.billing_cycle === "free") {
      await assignPackageLocally({ agencyId, userId, packageId, notes: `Switched to Free plan (${pkg.name})` });
      return res.json({ success: true, isFree: true, url: successUrl || "/my-account?tab=billing" });
    }
    const quote = await priceForCheckout({ pkg, userId, agencyId, email: userEmail, couponCode });
    if (quote.couponError) return res.status(400).json({ success: false, message: quote.couponError });
    if (quote.finalPrice <= 0) {
      // Fully discounted — same as the Stripe path.
      const result = await createCheckoutSession({ agencyId, userId, packageId, userEmail, userName, successUrl, cancelUrl, couponCode });
      return res.json({ success: true, ...result });
    }

    const amount = await convertUsdToBdt(quote.finalPrice);
    const referenceToken = crypto.randomBytes(24).toString("hex");
    await pool.query(
      `INSERT INTO pending_payments (reference_token, agency_id, user_id, package_id, provider, amount, currency, original_amount, discount_amount, coupon_id)
       VALUES (?, ?, ?, ?, ?, ?, 'BDT', ?, ?, ?)`,
      [referenceToken, agencyId, userId, pkg.id, provider, amount, quote.basePrice, quote.discountAmount, quote.coupon?.id || null]
    );
    const path = provider.toLowerCase();
    const result = await adapter.initiatePayment({
      amount,
      currency: "BDT",
      transactionId: referenceToken,
      successUrl: `${backendBase()}/api/v1/billing/checkout/${path}/success?ref=${referenceToken}`,
      failUrl: `${backendBase()}/api/v1/billing/checkout/${path}/fail?ref=${referenceToken}`,
      cancelUrl: `${backendBase()}/api/v1/billing/checkout/${path}/cancel?ref=${referenceToken}`,
      ipnUrl: `${backendBase()}/api/v1/billing/checkout/${path}/ipn`,
      customer: { name: userName || userEmail, email: userEmail },
    });
    return res.json({ success: true, url: result.redirectUrl });
  } catch (err) {
    console.error("Create checkout error:", err);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to initiate checkout" });
  }
});

// ─── SIGNED-IN GATEWAY CHECKOUT: browser return + trusted IPN ────────────────
for (const outcome of ["success", "fail", "cancel"]) {
  router.all(`/billing/checkout/:provider/${outcome}`, (req, res) => {
    res.redirect(`${frontendBase()}/my-account?tab=billing&payment=${outcome}`);
  });
}

/** Turns a paid pending_payments row into a subscription + invoice exactly once. */
async function consumePendingPayment(referenceToken, gatewayTxnId, amountPaid, gatewayCountry) {
  const [[row]] = await pool.query("SELECT * FROM pending_payments WHERE reference_token = ? LIMIT 1", [referenceToken]);
  if (!row) return { success: false, reason: "not_found" };
  const [lock] = await pool.query(
    "UPDATE pending_payments SET status = 'PAID', gateway_txn_id = COALESCE(gateway_txn_id, ?) WHERE id = ? AND status = 'PENDING'",
    [gatewayTxnId, row.id]
  );
  if (!lock.affectedRows) return { success: true, alreadyConsumed: true };

  await assignPackageLocally({ agencyId: row.agency_id, userId: row.user_id, packageId: row.package_id, notes: `Paid via ${row.provider}` });
  const paid = amountPaid ?? row.amount;
  const country = await resolveInvoiceCountry({ gatewayCountry, agencyId: row.agency_id, userId: row.user_id });
  const [inv] = await pool.query(
    `INSERT INTO invoices (agency_id, user_id, package_id, provider, gateway_txn_id, amount_paid, currency, country, status, discount_amount, coupon_id, paid_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PAID', ?, ?, NOW())`,
    [row.agency_id, row.user_id, row.package_id, row.provider, gatewayTxnId, paid, row.currency, country, row.discount_amount || 0, row.coupon_id]
  );
  await recordCommissionForInvoice({ agencyId: row.agency_id, invoiceId: inv.insertId, amountPaid: paid, currency: row.currency });
  const [[user]] = await pool.query("SELECT email FROM users WHERE id = ?", [row.user_id]);
  await recordCouponRedemption({ couponId: row.coupon_id, agencyId: row.agency_id, email: user?.email, invoiceId: inv.insertId, discountAmount: row.discount_amount });
  await pool.query("UPDATE pending_payments SET status = 'CONSUMED' WHERE id = ?", [row.id]);
  return { success: true };
}

router.post("/billing/checkout/:provider/ipn", async (req, res) => {
  const provider = String(req.params.provider || "").toUpperCase();
  const adapter = GATEWAY_ADAPTERS[provider];
  if (!adapter) return res.status(400).send("Unknown provider");
  try {
    const result = await adapter.verifyCallback(req.body);
    if (!result.success) {
      console.warn(`[${provider} IPN] Payment not valid for transaction ${result.transactionId}`);
      return res.status(400).send("Payment not valid");
    }
    await consumePendingPayment(result.transactionId, result.transactionId, result.amountPaid, result.country);
    return res.status(200).send("OK");
  } catch (err) {
    console.error(`[${provider} IPN] error:`, err);
    return res.status(500).send("Error");
  }
});

// ─── CREATE CUSTOMER PORTAL LINK ─────────────────────────────────────────────
router.post("/billing/customer-portal", authMiddleware, async (req, res) => {
  try {
    const { returnUrl } = req.body;
    const agencyId = req.user?.agencyId;
    const userId = req.user?.id;

    const result = await createCustomerPortalSession({
      agencyId,
      userId,
      returnUrl,
    });

    return res.json({ success: true, url: result.url });
  } catch (err) {
    console.error("Customer portal error:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to open customer portal" });
  }
});

// ─── GET INVOICES HISTORY ────────────────────────────────────────────────────
router.get("/billing/invoices", authMiddleware, async (req, res) => {
  try {
    const agencyId = req.user?.agencyId;
    const userId = req.user?.id;

    let rows = [];
    if (agencyId) {
      [rows] = await pool.query(
        "SELECT * FROM invoices WHERE agency_id = ? ORDER BY paid_at DESC LIMIT 50",
        [agencyId]
      );
    } else if (userId) {
      [rows] = await pool.query(
        "SELECT * FROM invoices WHERE user_id = ? ORDER BY paid_at DESC LIMIT 50",
        [userId]
      );
    }

    return res.json({ success: true, invoices: rows });
  } catch (err) {
    console.error("Invoices error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GUEST CHECKOUT: START (public — no login required) ─────────────────────
// Buy Now on the public Pricing page lands here: collects the buyer's
// details + payment method in one step, stores them in pending_signups, and
// redirects to the chosen gateway. The account itself is created only once
// a TRUSTED webhook/IPN confirms payment (see consumePendingSignup) — never
// from this endpoint or from the browser's success redirect below.
router.post("/billing/guest-checkout", async (req, res) => {
  try {
    const { fullName, email, businessName, password, packageId, provider, affiliateCode, couponCode } = req.body || {};
    if (!fullName || !email || !password || !packageId || !provider) {
      return res.status(400).json({ success: false, message: "fullName, email, password, packageId, and provider are required" });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const normalizedProvider = String(provider).toUpperCase();
    if (!["STRIPE", "SSLCOMMERZ", "PORTWALLET", "AAMARPAY"].includes(normalizedProvider)) {
      return res.status(400).json({ success: false, message: "Unsupported payment provider" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const [existingUser] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [normalizedEmail]);
    if (existingUser.length) {
      return res.status(400).json({ success: false, message: "An account with this email already exists. Please log in instead." });
    }

    const [[pkg]] = await pool.query("SELECT * FROM packages WHERE id = ? AND is_active = 1 AND is_public = 1 LIMIT 1", [packageId]);
    if (!pkg) return res.status(404).json({ success: false, message: "Package not found" });

    // Package discount + coupon (a guest has no personal discount yet).
    const quote = await priceForCheckout({ pkg, email: normalizedEmail, couponCode: couponCode || null });
    if (quote.couponError) return res.status(400).json({ success: false, message: quote.couponError });

    let amount = quote.finalPrice;
    let currency = "USD";
    if (normalizedProvider !== "STRIPE") {
      amount = await convertUsdToBdt(amount);
      currency = "BDT";
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const referenceToken = crypto.randomBytes(24).toString("hex");

    await pool.query(
      `INSERT INTO pending_signups
        (reference_token, full_name, email, business_name, affiliate_code, password_hash, package_id, billing_cycle, provider, amount, currency, status,
         original_amount, discount_amount, coupon_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [referenceToken, fullName, normalizedEmail, businessName || null, affiliateCode || null, passwordHash, pkg.id, pkg.billing_cycle, normalizedProvider, amount, currency,
        quote.basePrice, quote.discountAmount, quote.coupon?.id || null]
    );

    // Fully discounted (e.g. a 100% coupon) — nothing to pay.
    if (quote.finalPrice <= 0 && Number(pkg.price) > 0) {
      await consumePendingSignup(referenceToken, `coupon_${referenceToken}`, 0);
      return res.json({ success: true, isFree: true, redirectUrl: `${frontendBase()}/checkout/complete?ref=${referenceToken}&status=success` });
    }

    const providerPath = normalizedProvider.toLowerCase();
    const successUrl = `${backendBase()}/api/v1/billing/guest-checkout/${providerPath}/success?ref=${referenceToken}`;
    const failUrl = `${backendBase()}/api/v1/billing/guest-checkout/${providerPath}/fail?ref=${referenceToken}`;
    const cancelUrl = `${backendBase()}/api/v1/billing/guest-checkout/${providerPath}/cancel?ref=${referenceToken}`;
    const ipnUrl = `${backendBase()}/api/v1/billing/guest-checkout/${providerPath}/ipn`;

    // Free package — nothing to pay, activate immediately.
    if (Number(pkg.price) === 0 || pkg.billing_cycle === "free") {
      await consumePendingSignup(referenceToken, `free_${referenceToken}`, 0);
      return res.json({ success: true, isFree: true, redirectUrl: `${frontendBase()}/checkout/complete?ref=${referenceToken}&status=success` });
    }

    if (normalizedProvider === "STRIPE") {
      if (!stripe) {
        // Simulated/dev mode — same instant-activation behavior the
        // existing authenticated checkout path falls back to when
        // STRIPE_SECRET_KEY isn't configured.
        await consumePendingSignup(referenceToken, `sim_${referenceToken}`, amount);
        return res.json({ success: true, isSimulated: true, redirectUrl: `${frontendBase()}/checkout/complete?ref=${referenceToken}&status=success` });
      }
      const priceId = await ensureStripePrice(pkg);
      const discounts = await stripeDiscountsFor(quote, quote.coupon ? `Coupon ${quote.coupon.code}` : "Discount");
      const session = await stripe.checkout.sessions.create({
        customer_email: normalizedEmail,
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        ...(discounts ? { discounts } : {}),
        mode: pkg.billing_cycle === "lifetime" ? "payment" : "subscription",
        success_url: `${successUrl}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
        metadata: { referenceToken },
        subscription_data: pkg.billing_cycle === "lifetime" ? undefined : { metadata: { referenceToken } },
      });
      return res.json({ success: true, redirectUrl: session.url });
    }

    const adapter = GATEWAY_ADAPTERS[normalizedProvider];
    const result = await adapter.initiatePayment({
      amount,
      currency,
      transactionId: referenceToken,
      successUrl,
      failUrl,
      cancelUrl,
      ipnUrl,
      customer: { name: fullName, email: normalizedEmail },
    });
    return res.json({ success: true, redirectUrl: result.redirectUrl });
  } catch (err) {
    console.error("Guest checkout error:", err);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to start checkout" });
  }
});

// ─── GUEST CHECKOUT: BROWSER RETURN (status page only — never creates the
// account; the trusted IPN/webhook below is what actually does that) ────────
router.all("/billing/guest-checkout/:provider/success", (req, res) => {
  const ref = req.query.ref || req.body?.tran_id || req.body?.mer_txnid;
  return res.redirect(`${frontendBase()}/checkout/complete?ref=${ref || ""}&status=success`);
});
router.all("/billing/guest-checkout/:provider/fail", (req, res) => {
  const ref = req.query.ref || req.body?.tran_id || req.body?.mer_txnid;
  return res.redirect(`${frontendBase()}/checkout/complete?ref=${ref || ""}&status=fail`);
});
router.all("/billing/guest-checkout/:provider/cancel", (req, res) => {
  const ref = req.query.ref || req.body?.tran_id || req.body?.mer_txnid;
  return res.redirect(`${frontendBase()}/checkout/complete?ref=${ref || ""}&status=cancel`);
});

// ─── GUEST CHECKOUT: TRUSTED SERVER-TO-SERVER IPN (SSLCommerz/AamarPay/
// PortWallet) — this, not the browser redirect above, is what actually
// creates the account. Each adapter's verifyCallback re-validates against
// the gateway's own server-side API rather than trusting the POST body. ────
router.post("/billing/guest-checkout/:provider/ipn", async (req, res) => {
  const provider = String(req.params.provider || "").toUpperCase();
  const adapter = GATEWAY_ADAPTERS[provider];
  if (!adapter) return res.status(400).send("Unknown provider");

  try {
    const result = await adapter.verifyCallback(req.body);
    if (!result.success) {
      console.warn(`[${provider} IPN] Payment not valid for transaction ${result.transactionId}`);
      return res.status(400).send("Payment not valid");
    }
    await consumePendingSignup(result.transactionId, result.transactionId, result.amountPaid, result.country);
    return res.status(200).send("OK");
  } catch (err) {
    console.error(`[${provider} IPN] error:`, err);
    return res.status(500).send("Error");
  }
});

// ─── STRIPE WEBHOOK HANDLER ──────────────────────────────────────────────────
router.post("/billing/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (endpointSecret && stripe && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } else {
      // Fallback parse if no webhook secret configured in dev
      event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    }
  } catch (err) {
    console.error("Stripe webhook verification error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const eventType = event.type;
    const dataObject = event.data?.object;

    console.log(`[STRIPE WEBHOOK] Received event: ${eventType}`);

    switch (eventType) {
      case "checkout.session.completed": {
        const metadata = dataObject.metadata || {};

        // Guest checkout (no existing agency/user — see routes/billing.js's
        // /billing/guest-checkout above): the account itself gets created
        // here, from this trusted webhook, not from the browser redirect.
        if (metadata.referenceToken) {
          const amountPaid = (dataObject.amount_total || 0) / 100;
          const result = await consumePendingSignup(metadata.referenceToken, dataObject.id, amountPaid, dataObject.customer_details?.address?.country);
          if (result.success && !result.alreadyConsumed) {
            console.log(`✅ [STRIPE] Guest checkout created workspace (Agency: ${result.agencyId}, User: ${result.userId})`);
          }
          break;
        }

        // In-chat order paid by checkout link (services/chatPaymentService.js):
        // confirm in the chat and continue the flow.
        if (metadata.chatOrderId) {
          if (dataObject.payment_status === "paid") {
            const { markOrderPaid } = await import("../services/chatPaymentService.js");
            await markOrderPaid(Number(metadata.chatOrderId), { sessionId: dataObject.id });
          }
          break;
        }

        const agencyId = metadata.agencyId ? Number(metadata.agencyId) : null;
        const userId = metadata.userId ? Number(metadata.userId) : null;
        const packageId = metadata.packageId ? Number(metadata.packageId) : null;
        const customerId = dataObject.customer;
        const subscriptionId = dataObject.subscription;

        if (packageId && (agencyId || userId)) {
          await assignPackageLocally({
            agencyId,
            userId,
            packageId,
            stripeCustomerId: customerId,
            stripeSubId: subscriptionId,
            notes: `Stripe Checkout completed: Session ${dataObject.id}`,
          });

          // Record invoice
          const amountPaid = (dataObject.amount_total || 0) / 100;
          const invoiceCurrency = (dataObject.currency || "USD").toUpperCase();
          const invoiceCountry = await resolveInvoiceCountry({ gatewayCountry: dataObject.customer_details?.address?.country, agencyId, userId });
          const couponId = metadata.couponId ? Number(metadata.couponId) : null;
          const discountAmount = Number(metadata.discountAmount) || 0;
          const [invoiceResult] = await pool.query(
            `INSERT INTO invoices (
              agency_id, user_id, package_id, stripe_invoice_id, amount_paid, currency, country, status, discount_amount, coupon_id, paid_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PAID', ?, ?, NOW())`,
            [agencyId, userId, packageId, dataObject.invoice || dataObject.id, amountPaid, invoiceCurrency, invoiceCountry, discountAmount, couponId]
          );
          await recordCouponRedemption({ couponId, agencyId, email: metadata.email || null, invoiceId: invoiceResult.insertId, discountAmount });
          if (agencyId) {
            await recordCommissionForInvoice({ agencyId, invoiceId: invoiceResult.insertId, amountPaid, currency: invoiceCurrency });
          }
          console.log(`✅ [STRIPE] Upgraded workspace (Agency: ${agencyId}, User: ${userId}) to package ID: ${packageId}`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        // The Stripe subscription ended (cancelled at period end, or unpaid).
        // Decided with the user: the workspace KEEPS its plan and becomes
        // read-only (utils/subscriptionStatus.js) until it renews — it is
        // never moved to the free plan automatically.
        const customerId = dataObject.customer;
        await pool.query(
          `UPDATE subscriptions SET status = 'EXPIRED', expires_at = LEAST(COALESCE(expires_at, NOW()), NOW())
           WHERE stripe_customer_id = ? AND stripe_subscription_id = ? AND status = 'ACTIVE'`,
          [customerId, dataObject.id]
        );
        invalidateSubscriptionCache();
        console.log(`⚠️ [STRIPE] Subscription ${dataObject.id} ended for customer ${customerId} — workspace is read-only until renewed.`);
        break;
      }

      case "invoice.payment_succeeded": {
        const customerId = dataObject.customer;
        const invoicePdf = dataObject.invoice_pdf;
        const hostedInvoiceUrl = dataObject.hosted_invoice_url;
        const amountPaid = (dataObject.amount_paid || 0) / 100;
        const invoiceId = dataObject.id;

        // Lookup agency or user
        const [subRows] = await pool.query(
          "SELECT agency_id, user_id, package_id FROM subscriptions WHERE stripe_customer_id = ? ORDER BY id DESC LIMIT 1",
          [customerId]
        );

        // Each paid invoice (first payment and every renewal) moves the end date
        // to the end of the period it paid for.
        const periodEndTs = (dataObject.lines?.data || []).reduce((max, l) => Math.max(max, Number(l.period?.end) || 0), 0);
        if (periodEndTs && dataObject.subscription) {
          const periodEnd = new Date(periodEndTs * 1000);
          await pool.query(
            `UPDATE subscriptions SET status = 'ACTIVE', current_period_end = ?, expires_at = ?
             WHERE stripe_customer_id = ? AND stripe_subscription_id = ? AND status IN ('ACTIVE','EXPIRED')`,
            [periodEnd, periodEnd, customerId, dataObject.subscription]
          );
          invalidateSubscriptionCache();
        }

        if (subRows.length) {
          const { agency_id, user_id, package_id } = subRows[0];
          const renewalCurrency = (dataObject.currency || "USD").toUpperCase();
          const renewalCountry = await resolveInvoiceCountry({ gatewayCountry: dataObject.customer_address?.country, agencyId: agency_id, userId: user_id });
          await pool.query(
            `INSERT INTO invoices (
              agency_id, user_id, package_id, stripe_invoice_id, amount_paid, currency, country, status, invoice_pdf_url, hosted_invoice_url, paid_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PAID', ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
              amount_paid = VALUES(amount_paid),
              invoice_pdf_url = VALUES(invoice_pdf_url),
              hosted_invoice_url = VALUES(hosted_invoice_url)`,
            [
              agency_id,
              user_id,
              package_id,
              invoiceId,
              amountPaid,
              renewalCurrency,
              renewalCountry,
              invoicePdf,
              hostedInvoiceUrl,
            ]
          );
          if (agency_id) {
            // ON DUPLICATE KEY UPDATE doesn't reliably hand back the row's id
            // via insertId, so look it up by the (unique) stripe_invoice_id —
            // this also naturally covers both a fresh renewal and a retried
            // webhook delivery for the same invoice.
            const [[invoiceRow]] = await pool.query("SELECT id FROM invoices WHERE stripe_invoice_id = ? LIMIT 1", [invoiceId]);
            if (invoiceRow) {
              await recordCommissionForInvoice({ agencyId: agency_id, invoiceId: invoiceRow.id, amountPaid, currency: renewalCurrency });
            }
          }
        }
        break;
      }

      default:
        // Other events ignored
        break;
    }

    return res.json({ received: true });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return res.status(500).json({ error: "Webhook handling failed" });
  }
});

export default router;
