import express from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { stripe, createCheckoutSession, createCustomerPortalSession, assignPackageLocally, ensureStripePrice } from "../services/stripeService.js";
import { convertUsdToBdt } from "../utils/platformGateways.js";
import { consumePendingSignup } from "../services/guestSignupService.js";
import * as sslcommerz from "../services/sslcommerzService.js";
import * as aamarpay from "../services/aamarpayService.js";
import * as portwallet from "../services/portwalletService.js";

const router = express.Router();

const GATEWAY_ADAPTERS = { SSLCOMMERZ: sslcommerz, AAMARPAY: aamarpay, PORTWALLET: portwallet };
const frontendBase = () => (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
const backendBase = () => (process.env.BACKEND_URL || "http://localhost:5000").replace(/\/+$/, "");

// ─── GET PRICING PLANS ───────────────────────────────────────────────────────
router.get("/billing/plans", async (req, res) => {
  try {
    const [packages] = await pool.query(
      "SELECT * FROM packages WHERE is_active = 1 ORDER BY type ASC, price ASC"
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

// ─── CREATE CHECKOUT SESSION ─────────────────────────────────────────────────
router.post("/billing/create-checkout", authMiddleware, async (req, res) => {
  try {
    const { packageId, successUrl, cancelUrl } = req.body;
    if (!packageId) return res.status(400).json({ success: false, message: "Package ID is required" });

    const agencyId = req.user?.agencyId;
    const userId = req.user?.id;
    const userEmail = req.user?.email;
    const userName = req.user?.name;

    const result = await createCheckoutSession({
      agencyId,
      userId,
      packageId,
      userEmail,
      userName,
      successUrl,
      cancelUrl,
    });

    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("Create checkout error:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to initiate checkout" });
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
    const { fullName, email, businessName, password, packageId, provider } = req.body || {};
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

    const [[pkg]] = await pool.query("SELECT * FROM packages WHERE id = ? AND is_active = 1 LIMIT 1", [packageId]);
    if (!pkg) return res.status(404).json({ success: false, message: "Package not found" });

    let amount = Number(pkg.price);
    let currency = "USD";
    if (normalizedProvider !== "STRIPE") {
      amount = await convertUsdToBdt(amount);
      currency = "BDT";
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const referenceToken = crypto.randomBytes(24).toString("hex");

    await pool.query(
      `INSERT INTO pending_signups
        (reference_token, full_name, email, business_name, password_hash, package_id, billing_cycle, provider, amount, currency, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [referenceToken, fullName, normalizedEmail, businessName || null, passwordHash, pkg.id, pkg.billing_cycle, normalizedProvider, amount, currency]
    );

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
      const session = await stripe.checkout.sessions.create({
        customer_email: normalizedEmail,
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
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
    await consumePendingSignup(result.transactionId, result.transactionId, result.amountPaid);
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
          const result = await consumePendingSignup(metadata.referenceToken, dataObject.id, amountPaid);
          if (result.success && !result.alreadyConsumed) {
            console.log(`✅ [STRIPE] Guest checkout created workspace (Agency: ${result.agencyId}, User: ${result.userId})`);
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
          await pool.query(
            `INSERT INTO invoices (
              agency_id, user_id, package_id, stripe_invoice_id, amount_paid, currency, status, paid_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'PAID', NOW())`,
            [agencyId, userId, packageId, dataObject.invoice || dataObject.id, amountPaid, (dataObject.currency || "USD").toUpperCase()]
          );
          console.log(`✅ [STRIPE] Upgraded workspace (Agency: ${agencyId}, User: ${userId}) to package ID: ${packageId}`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        // Downgrade to default free plan
        const customerId = dataObject.customer;
        const [defaultPkgs] = await pool.query("SELECT id, name FROM packages WHERE is_default = 1 LIMIT 1");
        const defaultPkgId = defaultPkgs[0]?.id || 1;

        await pool.query("UPDATE agencies SET package_id = ? WHERE id IN (SELECT agency_id FROM subscriptions WHERE stripe_customer_id = ?)", [defaultPkgId, customerId]);
        await pool.query("UPDATE users SET package_id = ? WHERE id IN (SELECT user_id FROM subscriptions WHERE stripe_customer_id = ?)", [defaultPkgId, customerId]);
        await pool.query("UPDATE subscriptions SET status = 'CANCELLED' WHERE stripe_customer_id = ?", [customerId]);
        console.log(`⚠️ [STRIPE] Subscription cancelled for customer ${customerId}. Downgraded to default package.`);
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

        if (subRows.length) {
          const { agency_id, user_id, package_id } = subRows[0];
          await pool.query(
            `INSERT INTO invoices (
              agency_id, user_id, package_id, stripe_invoice_id, amount_paid, currency, status, invoice_pdf_url, hosted_invoice_url, paid_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'PAID', ?, ?, NOW())
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
              (dataObject.currency || "USD").toUpperCase(),
              invoicePdf,
              hostedInvoiceUrl,
            ]
          );
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
