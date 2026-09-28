/**
 * Reseller payments (utils/resellerBilling.js):
 *   customer side  — GET /customer-billing, POST /customer-billing/checkout {packageId, provider STRIPE|PAYPAL},
 *                    POST /customer-billing/confirm {sessionId} | {provider: "PAYPAL", orderId} (PayPal is captured here)
 *   reseller side  — GET /reseller/payments
 *   public         — POST /reseller-billing/stripe-webhook/:resellerId (the reseller's own Stripe
 *                    account sends checkout.session.completed here, signed with the webhook
 *                    secret the reseller saved in Payment Gateway settings)
 * Mounted early in index.js (the webhook is anonymous); every other path scopes its own auth.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import {
  customerContext, currentClientPlan, createCheckout, confirmCheckout, confirmPaypal, resellerStripe, applyPaidSession, availableProviders,
} from "../utils/resellerBilling.js";

const router = express.Router();
const agencyOf = (req) => req.tenant?.agencyId ?? req.user.agencyId;
const fail = (res, err, label) => {
  if (!err.status) console.error(`[Reseller billing] ${label}:`, err);
  return res.status(err.status || (err.type?.startsWith?.("Stripe") ? 502 : 500)).json({
    success: false,
    message: err.status ? err.message : err.type?.startsWith?.("Stripe") ? `Stripe: ${err.message}` : "Server error",
  });
};

// ─── PUBLIC: the reseller's Stripe webhook ───────────────────────────────────
router.post("/reseller-billing/stripe-webhook/:resellerId", async (req, res) => {
  const resellerId = Number(req.params.resellerId) || 0;
  const gw = await resellerStripe(resellerId).catch(() => null);
  if (!gw?.webhookSecret || !req.rawBody) return res.status(400).send("Webhook not configured");
  let event;
  try {
    event = gw.stripe.webhooks.constructEvent(req.rawBody, req.get("stripe-signature"), gw.webhookSecret);
  } catch {
    return res.status(400).send("Invalid signature");
  }
  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await applyPaidSession(resellerId, event.data.object);
    }
    return res.json({ received: true });
  } catch (err) {
    console.error("[Reseller billing] webhook:", err);
    return res.status(500).send("Error");
  }
});

// ─── CUSTOMER (the reseller's customer's owner) ─────────────────────────────
router.use(["/customer-billing", "/reseller/payments"], authMiddleware);

router.get("/customer-billing", roleMiddleware("RESELLER"), async (req, res) => {
  try {
    const { agency, resellerId } = await customerContext(agencyOf(req));
    const [plans] = await pool.query(
      `SELECT id, name, description, price, currency, billing_cycle, max_bot_accounts, max_subscribers, max_team_members, max_monthly_messages, features_summary
       FROM agency_packages WHERE agency_id = ? AND is_active = 1 ORDER BY price`,
      [resellerId]
    );
    const [[reseller]] = await pool.query("SELECT name FROM agencies WHERE id = ?", [resellerId]);
    const current = await currentClientPlan(agency.id);
    const providers = await availableProviders(resellerId);
    return res.json({
      success: true,
      providerName: reseller?.name || null,
      canPayOnline: providers.length > 0,
      paymentProviders: providers,
      plans: plans.map((p) => ({ ...p, price: Number(p.price) })),
      current: current ? {
        packageId: current.package_id, packageName: current.package_name, billingCycle: current.billing_cycle,
        periodEnd: current.current_period_end, startedAt: current.started_at,
      } : null,
    });
  } catch (err) {
    return fail(res, err, "load");
  }
});

router.post("/customer-billing/checkout", roleMiddleware("RESELLER"), async (req, res) => {
  try {
    const provider = req.body?.provider === "PAYPAL" ? "PAYPAL" : "STRIPE";
    const result = await createCheckout({ agencyId: agencyOf(req), packageId: Number(req.body?.packageId), customerEmail: req.user.email, provider });
    return res.json({ success: true, ...result });
  } catch (err) {
    return fail(res, err, "checkout");
  }
});

router.post("/customer-billing/confirm", roleMiddleware("RESELLER"), async (req, res) => {
  try {
    const result = req.body?.provider === "PAYPAL"
      ? await confirmPaypal(agencyOf(req), req.body?.orderId)
      : await confirmCheckout(agencyOf(req), req.body?.sessionId);
    if (!result.ok) return res.status(402).json({ success: false, message: "The payment isn't complete yet." });
    return res.json({ success: true, message: result.alreadyApplied ? "Your plan is active." : "Payment received — your plan is active." });
  } catch (err) {
    return fail(res, err, "confirm");
  }
});

// ─── RESELLER: payments received from its customers ─────────────────────────
router.get("/reseller/payments", roleMiddleware("RESELLER", "ADMIN"), async (req, res) => {
  try {
    const resellerId = agencyOf(req);
    const [rows] = await pool.query(
      `SELECT p.id, p.client_agency_id, a.name AS customer_name, p.package_name, p.provider, p.amount, p.currency, p.paid_at, p.period_end
       FROM agency_client_payments p JOIN agencies a ON a.id = p.client_agency_id
       WHERE p.reseller_agency_id = ? ORDER BY p.paid_at DESC LIMIT 200`,
      [resellerId]
    );
    return res.json({ success: true, payments: rows.map((r) => ({ ...r, amount: Number(r.amount) })) });
  } catch (err) {
    return fail(res, err, "payments");
  }
});

export default router;
