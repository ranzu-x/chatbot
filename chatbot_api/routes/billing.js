import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { stripe, createCheckoutSession, createCustomerPortalSession, assignPackageLocally } from "../services/stripeService.js";

const router = express.Router();

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
