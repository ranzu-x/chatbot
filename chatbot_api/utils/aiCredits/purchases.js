/**
 * AI credit add-on purchases, through the platform's existing payment
 * gateways (the same Stripe account and SSLCommerz / aamarPay / PortWallet
 * adapters as plan checkout — no second payment system).
 *
 * Credits are added ONLY by completeAddonPurchase() (service.js) after a
 * payment the SERVER verified: the Stripe webhook (checkout.session.completed),
 * the return page's confirm call (which re-reads the session from Stripe with
 * our key — the browser's word is never taken), or the gateway's IPN
 * (verifyCallback). Each path checks the purchase id, the gateway reference
 * and the amount; the PENDING → PAID flip makes repeats harmless.
 *
 * Who may buy: End users (DIRECT_CUSTOMER) and Resellers, owners only. A
 * Reseller's customers can't (the platform never bills them directly).
 */
import crypto from "crypto";
import pool from "../../db.js";
import { stripe, getOrCreateStripeCustomer } from "../../services/stripeService.js";
import { convertUsdToBdt } from "../platformGateways.js";
import * as sslcommerz from "../../services/sslcommerzService.js";
import * as aamarpay from "../../services/aamarpayService.js";
import * as portwallet from "../../services/portwalletService.js";
import { resolveInvoiceCountry } from "../country.js";
import { completeAddonPurchase, getPlanContext, AiCreditError } from "./service.js";

const GATEWAYS = { SSLCOMMERZ: sslcommerz, AAMARPAY: aamarpay, PORTWALLET: portwallet };
const frontendBase = () => (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
const backendBase = () => (process.env.BACKEND_URL || "http://localhost:5000").replace(/\/+$/, "");
const bad = (message, status = 400, code = "BAD_REQUEST") => new AiCreditError(message, { status, code });

// Stripe amounts are in the currency's smallest unit; these have none (Stripe's list).
const STRIPE_ZERO_DECIMAL = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
export const stripeAmount = (price, currency) =>
  Math.round(Number(price) * (STRIPE_ZERO_DECIMAL.has(String(currency).toUpperCase()) ? 1 : 100));

export async function listActiveAddons() {
  const [rows] = await pool.query(
    "SELECT id, name, description, credits, price, currency, sort_order FROM ai_credit_addons WHERE is_active = 1 AND deleted_at IS NULL ORDER BY sort_order, credits"
  );
  return rows.map((r) => ({ ...r, credits: Number(r.credits), price: Number(r.price), expiry: "NEVER" }));
}

/** Payment methods for an add-on: Stripe always; a BDT gateway when switched on and the price is in USD or BDT. */
export async function gatewaysForCurrency(currency) {
  const [rows] = await pool.query("SELECT provider FROM platform_payment_gateways WHERE is_active = 1").catch(() => [[]]);
  const active = new Set(rows.map((r) => String(r.provider).toUpperCase()));
  const bdtOk = ["USD", "BDT"].includes(String(currency).toUpperCase());
  return ["STRIPE", ...(bdtOk ? Object.keys(GATEWAYS).filter((g) => active.has(g)) : [])];
}

/**
 * Creates the pending purchase and the gateway checkout. Nothing is credited here.
 * @returns {Promise<{ url, purchaseId, simulated? }>}
 */
export async function startAddonCheckout({ agencyId, userId, userEmail, userName, addonId, provider }) {
  const plan = await getPlanContext(agencyId);
  if (!plan.canPurchase) {
    throw bad(plan.accountType === "RESELLER_CUSTOMER"
      ? "AI credits for your workspace come from your service provider — please contact them."
      : "This account can't buy AI credits.", 403, "PURCHASE_NOT_ALLOWED");
  }
  const [[addon]] = await pool.query("SELECT * FROM ai_credit_addons WHERE id = ? AND is_active = 1 AND deleted_at IS NULL", [addonId]);
  if (!addon) throw bad("That AI credit pack isn't available", 404, "ADDON_NOT_FOUND");
  const gateway = String(provider || "STRIPE").toUpperCase();
  if (!(await gatewaysForCurrency(addon.currency)).includes(gateway)) throw bad("That payment method isn't available for this pack");

  const reference = crypto.randomBytes(24).toString("hex");
  let chargedAmount = Number(addon.price);
  let chargedCurrency = String(addon.currency).toUpperCase();
  if (gateway !== "STRIPE") {
    chargedAmount = chargedCurrency === "BDT" ? chargedAmount : Number(await convertUsdToBdt(chargedAmount));
    chargedCurrency = "BDT";
  }
  const [ins] = await pool.query(
    `INSERT INTO ai_credit_purchases (agency_id, user_id, addon_id, addon_name, credits, price, currency, charged_amount, charged_currency, provider, reference_token)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [agencyId, userId || null, addon.id, addon.name, addon.credits, addon.price, addon.currency, chargedAmount, chargedCurrency, gateway, reference]
  );
  const purchaseId = ins.insertId;
  const returnUrl = `${frontendBase()}/ai-credits?ai_purchase=${purchaseId}`;

  if (gateway === "STRIPE") {
    if (!stripe) {
      // Same dev behaviour as plan checkout without a Stripe key — never in production.
      if (process.env.NODE_ENV === "production") throw bad("Card payments aren't set up on this platform yet.", 503, "PAYMENTS_NOT_CONFIGURED");
      await pool.query("UPDATE ai_credit_purchases SET provider = 'SIMULATED', gateway_ref = ? WHERE id = ?", [`sim_${reference}`, purchaseId]);
      await completeAddonPurchase(purchaseId, { gatewayRef: `sim_${reference}` });
      return { purchaseId, simulated: true, url: `${returnUrl}&status=success&simulated=1` };
    }
    const customer = await getOrCreateStripeCustomer({ agencyId, userId, email: userEmail, name: userName });
    const session = await stripe.checkout.sessions.create({
      customer,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: chargedCurrency.toLowerCase(),
          unit_amount: stripeAmount(chargedAmount, chargedCurrency),
          product_data: { name: `${addon.name} — ${Number(addon.credits).toLocaleString("en-US")} AI credits (never expire)` },
        },
      }],
      success_url: `${returnUrl}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendBase()}/ai-credits?ai_purchase_cancelled=1`,
      metadata: { kind: "ai_credit_addon", purchaseId: String(purchaseId), agencyId: String(agencyId), reference },
    });
    await pool.query("UPDATE ai_credit_purchases SET gateway_ref = ? WHERE id = ?", [session.id, purchaseId]);
    return { purchaseId, url: session.url };
  }

  const path = gateway.toLowerCase();
  const result = await GATEWAYS[gateway].initiatePayment({
    amount: chargedAmount,
    currency: "BDT",
    transactionId: reference,
    successUrl: `${backendBase()}/api/v1/ai-credits/checkout/${path}/success?ref=${reference}`,
    failUrl: `${backendBase()}/api/v1/ai-credits/checkout/${path}/fail?ref=${reference}`,
    cancelUrl: `${backendBase()}/api/v1/ai-credits/checkout/${path}/cancel?ref=${reference}`,
    ipnUrl: `${backendBase()}/api/v1/ai-credits/checkout/${path}/ipn`,
    customer: { name: userName || userEmail, email: userEmail },
  });
  return { purchaseId, url: result.redirectUrl };
}

/** Records the paid purchase as an invoice (earnings, the customer's invoice list). Once per purchase. */
async function recordInvoice(pu, gatewayRef, gatewayCountry = null) {
  if (!pu || pu.invoice_id || !["STRIPE", "SSLCOMMERZ", "AAMARPAY", "PORTWALLET"].includes(pu.provider)) return;
  const country = await resolveInvoiceCountry({ gatewayCountry, agencyId: pu.agency_id, userId: pu.user_id }).catch(() => null);
  const [inv] = await pool.query(
    `INSERT INTO invoices (agency_id, user_id, package_id, provider, gateway_txn_id, amount_paid, currency, country, status, paid_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 'PAID', NOW())`,
    [pu.agency_id, pu.user_id, pu.provider, gatewayRef, pu.charged_amount ?? pu.price, pu.charged_currency || pu.currency, country]
  );
  await pool.query("UPDATE ai_credit_purchases SET invoice_id = ? WHERE id = ? AND invoice_id IS NULL", [inv.insertId, pu.id]);
}

/** Verified Stripe session → credits. Used by the webhook and the return page. */
export async function completeFromStripeSession(session) {
  const purchaseId = Number(session?.metadata?.purchaseId);
  if (!purchaseId || session?.metadata?.kind !== "ai_credit_addon") return { credited: false, reason: "not_ours" };
  const [[pu]] = await pool.query("SELECT * FROM ai_credit_purchases WHERE id = ?", [purchaseId]);
  if (!pu) return { credited: false, reason: "not_found" };
  if (pu.gateway_ref && pu.gateway_ref !== session.id) return { credited: false, reason: "session_mismatch" };
  if (session.payment_status !== "paid") return { credited: false, reason: "not_paid" };
  if (Number(session.amount_total) !== stripeAmount(pu.charged_amount ?? pu.price, pu.charged_currency || pu.currency)) {
    console.error(`[AI credits] Stripe amount mismatch on purchase ${purchaseId}: ${session.amount_total}`);
    return { credited: false, reason: "amount_mismatch" };
  }
  const result = await completeAddonPurchase(purchaseId, { gatewayRef: session.id });
  if (result.credited) await recordInvoice({ ...pu, provider: "STRIPE" }, session.id, session.customer_details?.address?.country).catch((err) => console.error("[AI credits] invoice:", err.message));
  return result;
}

/** Return page: re-reads the session from Stripe (never trusts the browser). Only the buyer's own workspace. */
export async function confirmStripePurchase({ agencyId, purchaseId, sessionId }) {
  const [[pu]] = await pool.query("SELECT * FROM ai_credit_purchases WHERE id = ? AND agency_id = ?", [purchaseId, agencyId]);
  if (!pu) throw bad("Purchase not found", 404, "NOT_FOUND");
  if (pu.status !== "PENDING") return { status: pu.status };
  if (pu.provider !== "STRIPE" || !stripe) return { status: pu.status };
  const sid = String(sessionId || pu.gateway_ref || "");
  if (!sid || (pu.gateway_ref && sid !== pu.gateway_ref)) throw bad("That payment doesn't belong to this purchase", 400, "SESSION_MISMATCH");
  const session = await stripe.checkout.sessions.retrieve(sid);
  await completeFromStripeSession(session);
  const [[after]] = await pool.query("SELECT status FROM ai_credit_purchases WHERE id = ?", [pu.id]);
  return { status: after.status };
}

/** SSLCommerz / aamarPay / PortWallet IPN (server-to-server, verified with the gateway). */
export async function completeFromGatewayIpn(provider, body) {
  const gateway = String(provider || "").toUpperCase();
  const adapter = GATEWAYS[gateway];
  if (!adapter) return { credited: false, reason: "unknown_provider" };
  const result = await adapter.verifyCallback(body);
  if (!result?.success) return { credited: false, reason: "not_valid" };
  const [[pu]] = await pool.query("SELECT * FROM ai_credit_purchases WHERE reference_token = ? AND provider = ?", [String(result.transactionId || ""), gateway]);
  if (!pu) return { credited: false, reason: "not_found" };
  const expected = Number(pu.charged_amount ?? pu.price);
  if (result.amountPaid !== undefined && result.amountPaid !== null && Number(result.amountPaid) + 0.5 < expected) {
    console.error(`[AI credits] ${gateway} paid ${result.amountPaid} < ${expected} on purchase ${pu.id}`);
    return { credited: false, reason: "amount_mismatch" };
  }
  const done = await completeAddonPurchase(pu.id, { gatewayRef: String(result.transactionId), chargedAmount: result.amountPaid ?? null });
  if (done.credited) await recordInvoice(pu, String(result.transactionId), result.country).catch((err) => console.error("[AI credits] invoice:", err.message));
  return done;
}

/** A pending purchase the buyer abandoned (gateway cancel / fail page). Never touches a paid one. */
export async function markPurchaseCancelled(reference, status = "CANCELLED") {
  await pool.query("UPDATE ai_credit_purchases SET status = ? WHERE reference_token = ? AND status = 'PENDING'", [status, reference]);
}
