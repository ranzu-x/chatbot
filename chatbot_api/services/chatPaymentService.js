import crypto from "crypto";
import axios from "axios";
import pool from "../db.js";
import { stripe } from "./stripeService.js";

/**
 * In-chat orders (flow element "In-Chat Payment", chat_orders).
 *
 * - TELEGRAM_STARS: on Telegram the element sends a native invoice paid in
 *   Telegram Stars (currency XTR, no payment provider needed — the Stars go to
 *   the bot's own balance). Telegram asks us to confirm (pre_checkout_query)
 *   and then reports successful_payment with a charge id used for refunds.
 * - STRIPE: every other channel gets a checkout link.
 *
 * When an order is paid the customer gets the element's confirmation message
 * in the same chat and the flow continues from the element's next step
 * (continueAfterPayment).
 */
const frontendBase = () => (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
const INVOICE_PAYLOAD_PREFIX = "CO:";

export function starsInvoicePayload(orderId) {
  return `${INVOICE_PAYLOAD_PREFIX}${orderId}`;
}

export function orderIdFromInvoicePayload(payload) {
  const m = /^CO:(\d+)$/.exec(String(payload || ""));
  return m ? Number(m[1]) : null;
}

// ─── CREATE ORDER ────────────────────────────────────────────────────────────
export async function createChatPaymentLink({
  agencyId,
  subscriberId = null,
  conversationId = null,
  integrationId = null,
  flowId = null,
  nodeId = null,
  nextNodeId = null,
  productName,
  amount,
  currency = "USD",
  customerName = null,
  customerEmail = null,
  customerPhone = null,
  channel = "WHATSAPP",
  collectAddress = false,
  successMessage = null,
  provider = "STRIPE",
  // Appointment booking (utils/appointmentBookingEngine.js): the held slot a
  // payment-required booking is waiting on, or the pay-later appointment.
  appointmentHoldId = null,
  appointmentId = null,
  // Minutes until the checkout must stop accepting payment (the slot hold's end).
  expiresInMinutes = null,
}) {
  if (!productName || !amount) {
    throw new Error("Product name and amount are required");
  }

  const isStars = provider === "TELEGRAM_STARS";
  const numericAmount = isStars ? Math.round(Number(amount)) : Number(amount);
  if (!(numericAmount > 0)) throw new Error("The amount must be greater than 0");
  if (isStars && numericAmount > 100000) throw new Error("A Telegram Stars price can be at most 100,000 Stars");
  const curr = isStars ? "XTR" : (currency || "USD").toUpperCase();

  // Random per-order token that goes in the checkout link. The checkout page
  // and its public API routes require it; without it the sequential order id
  // alone would let anyone read or pay other workspaces' orders.
  const accessToken = crypto.randomBytes(16).toString("hex");

  const [ins] = await pool.query(
    `INSERT INTO chat_orders (
      agency_id, subscriber_id, conversation_id, integration_id, flow_id, node_id, next_node_id, product_name, amount,
      currency, provider, status, customer_name, customer_email, customer_phone, channel, access_token, success_message,
      appointment_hold_id, appointment_id, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?,
      IF(? IS NULL, NULL, NOW() + INTERVAL ? MINUTE))`,
    [
      agencyId, subscriberId, conversationId, integrationId, flowId, nodeId, nextNodeId,
      productName.trim(), numericAmount, curr, isStars ? "TELEGRAM_STARS" : "STRIPE",
      customerName, customerEmail, customerPhone, channel, accessToken, successMessage || null,
      appointmentHoldId, appointmentId, expiresInMinutes, Number(expiresInMinutes) || 0,
    ]
  );

  const orderId = ins.insertId;
  if (isStars) {
    return { orderId, provider: "TELEGRAM_STARS", productName, amount: numericAmount, currency: "XTR", buttonLabel: `Pay ⭐${numericAmount}` };
  }

  let paymentUrl = `${frontendBase()}/payments/pay/${orderId}?t=${accessToken}`;
  let stripeSessionId = `chat_order_${orderId}_${Date.now()}`;

  if (stripe) {
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: curr.toLowerCase(),
              product_data: {
                name: productName,
                description: `In-chat order #${orderId} via ${channel}`,
              },
              unit_amount: Math.round(numericAmount * 100), // cents
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        // Stripe accepts 30 min – 24 h; callers keep their hold at least 30 min.
        expires_at: expiresInMinutes
          ? Math.floor(Date.now() / 1000) + Math.min(86000, Math.max(1805, Math.round(Number(expiresInMinutes) * 60)))
          : undefined,
        customer_email: customerEmail || undefined,
        shipping_address_collection: collectAddress ? { allowed_countries: ["US", "CA", "GB", "AU", "DE", "FR", "ES", "IT"] } : undefined,
        success_url: `${frontendBase()}/payments/success?order_id=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendBase()}/payments/cancel?order_id=${orderId}`,
        metadata: {
          chatOrderId: String(orderId),
          agencyId: String(agencyId),
          subscriberId: String(subscriberId || ""),
          productName,
          amount: String(numericAmount),
          channel,
        },
      });

      paymentUrl = session.url;
      stripeSessionId = session.id;
    } catch (stripeErr) {
      console.error("Stripe chat payment session error:", stripeErr);
    }
  }

  await pool.query(
    "UPDATE chat_orders SET payment_url = ?, stripe_session_id = ? WHERE id = ?",
    [paymentUrl, stripeSessionId, orderId]
  );

  return {
    orderId,
    provider: "STRIPE",
    paymentUrl,
    productName,
    amount: numericAmount,
    currency: curr,
    buttonLabel: `💳 Pay ${numericAmount.toFixed(2)} ${curr}`,
  };
}

// ─── TELEGRAM STARS ──────────────────────────────────────────────────────────
/** Telegram's sendInvoice fields for a Stars order (exactly one price, empty provider token). */
export function buildStarsInvoice(order, { description, photoUrl } = {}) {
  const invoice = {
    title: String(order.product_name).slice(0, 32),
    description: String(description || order.product_name).slice(0, 255),
    payload: starsInvoicePayload(order.id),
    currency: "XTR",
    prices: [{ label: String(order.product_name).slice(0, 32), amount: Math.round(Number(order.amount)) }],
  };
  if (photoUrl && /^https:\/\//.test(photoUrl)) invoice.photo_url = photoUrl;
  return invoice;
}

/**
 * pre_checkout_query: Telegram waits (max 10s) for us to confirm the order is
 * still payable. Returns { ok, error }.
 */
export async function checkStarsPreCheckout(integration, query) {
  const orderId = orderIdFromInvoicePayload(query?.invoice_payload);
  if (!orderId) return { ok: false, error: "This order is no longer available." };
  const [[order]] = await pool.query(
    "SELECT * FROM chat_orders WHERE id = ? AND agency_id = ? AND provider = 'TELEGRAM_STARS'",
    [orderId, integration.agency_id]
  );
  if (!order || (order.integration_id && Number(order.integration_id) !== Number(integration.id))) {
    return { ok: false, error: "This order is no longer available." };
  }
  if (order.status !== "PENDING") return { ok: false, error: "This order has already been paid." };
  if (query.currency !== "XTR" || Number(query.total_amount) !== Math.round(Number(order.amount))) {
    return { ok: false, error: "The price of this order has changed. Please ask for a new invoice." };
  }
  return { ok: true, order };
}

export async function answerPreCheckout(integration, query) {
  const check = await checkStarsPreCheckout(integration, query).catch((err) => {
    console.error("[Telegram Stars] pre-checkout check failed:", err.message);
    return { ok: false, error: "Something went wrong. Please try again." };
  });
  await axios.post(`https://api.telegram.org/bot${integration.access_token}/answerPreCheckoutQuery`, {
    pre_checkout_query_id: query.id,
    ok: check.ok,
    ...(check.ok ? {} : { error_message: check.error }),
  }, { timeout: 8000 }).catch((err) => console.error("[Telegram Stars] answerPreCheckoutQuery:", err.response?.data || err.message));
  return check;
}

/** successful_payment in a message: marks the order paid (once) and continues. */
export async function handleStarsPayment(integration, message) {
  const sp = message?.successful_payment;
  const orderId = orderIdFromInvoicePayload(sp?.invoice_payload);
  if (!orderId || sp.currency !== "XTR") return null;
  const [[order]] = await pool.query(
    "SELECT * FROM chat_orders WHERE id = ? AND agency_id = ? AND provider = 'TELEGRAM_STARS'",
    [orderId, integration.agency_id]
  );
  if (!order) return null;
  await pool.query(
    "UPDATE chat_orders SET telegram_charge_id = ?, telegram_user_id = ? WHERE id = ? AND telegram_charge_id IS NULL",
    [sp.telegram_payment_charge_id, message.from?.id || null, orderId]
  );
  return markOrderPaid(orderId);
}

/** Owner-initiated refund of a paid Stars order (refundStarPayment). */
export async function refundStarsOrder(agencyId, orderId) {
  const [[order]] = await pool.query(
    "SELECT * FROM chat_orders WHERE id = ? AND agency_id = ?",
    [orderId, agencyId]
  );
  if (!order) return { status: 404, message: "Order not found" };
  if (order.provider !== "TELEGRAM_STARS") return { status: 400, message: "Only Telegram Stars orders can be refunded here. Refund card payments from your Stripe dashboard." };
  if (order.status !== "PAID" || !order.telegram_charge_id) return { status: 400, message: "Only a paid order can be refunded." };
  const [[integration]] = await pool.query("SELECT * FROM integrations WHERE id = ? AND agency_id = ?", [order.integration_id, agencyId]);
  if (!integration?.access_token) return { status: 400, message: "The Telegram bot of this order is no longer connected." };
  try {
    await axios.post(`https://api.telegram.org/bot${integration.access_token}/refundStarPayment`, {
      user_id: Number(order.telegram_user_id),
      telegram_payment_charge_id: order.telegram_charge_id,
    }, { timeout: 10000 });
  } catch (err) {
    const msg = err.response?.data?.description || err.message;
    await pool.query("UPDATE chat_orders SET refund_error = ? WHERE id = ?", [String(msg).slice(0, 500), orderId]);
    return { status: 502, message: `Telegram refused the refund: ${msg}` };
  }
  await pool.query("UPDATE chat_orders SET status = 'REFUNDED', refunded_at = NOW(), refund_error = NULL WHERE id = ?", [orderId]);
  return { status: 200, message: `Refunded ⭐${Math.round(Number(order.amount))} to the customer.` };
}

// ─── MARK ORDER PAID & CONFIRM ───────────────────────────────────────────────
export async function markOrderPaid(orderId, stripeSessionDetails = {}) {
  const [rows] = await pool.query("SELECT * FROM chat_orders WHERE id = ?", [orderId]);
  if (!rows.length) return null;

  const order = rows[0];
  // A Stripe webhook must name this order's own checkout session.
  if (stripeSessionDetails.sessionId && order.stripe_session_id && stripeSessionDetails.sessionId !== order.stripe_session_id) {
    console.warn(`[IN-CHAT PAYMENT] Session mismatch for order #${orderId}; ignored.`);
    return null;
  }
  // Money verified by the provider's signed webhook is never ignored: an order
  // our side already expired/cancelled (e.g. an appointment hold that ran out
  // seconds before Stripe reported the payment) still becomes PAID.
  const verified = Boolean(stripeSessionDetails.sessionId);
  const payable = order.status === "PENDING" || (verified && ["EXPIRED", "CANCELLED", "FAILED"].includes(order.status));
  if (!payable) return order;

  // Only the request that actually flips the order to PAID continues the chat (no double confirmation).
  const [upd] = await pool.query(
    "UPDATE chat_orders SET status = 'PAID', paid_at = NOW() WHERE id = ? AND status = ?",
    [orderId, order.status]
  );
  if (!upd.affectedRows) return { ...order, status: "PAID" };

  console.log(`✅ [IN-CHAT PAYMENT] Order #${orderId} (${order.product_name} - ${order.amount} ${order.currency}) marked as PAID`);
  const paid = { ...order, status: "PAID", paid_at: new Date() };
  continueAfterPayment(paid).catch((err) => console.error(`[IN-CHAT PAYMENT] Follow-up for order #${orderId} failed:`, err.message));
  return paid;
}

/**
 * A checkout that will not be paid: Stripe reported it expired / failed, or it
 * was cancelled. Only a PENDING order changes. Appointment orders free their
 * held slot (utils/appointmentBookingEngine.js).
 */
export async function markOrderUnpaid(orderId, status, stripeSessionDetails = {}) {
  if (!["EXPIRED", "FAILED", "CANCELLED"].includes(status)) throw new Error(`Bad order status ${status}`);
  const [[order]] = await pool.query("SELECT * FROM chat_orders WHERE id = ?", [orderId]);
  if (!order) return null;
  if (stripeSessionDetails.sessionId && order.stripe_session_id && stripeSessionDetails.sessionId !== order.stripe_session_id) return null;
  const [upd] = await pool.query("UPDATE chat_orders SET status = ? WHERE id = ? AND status = 'PENDING'", [status, orderId]);
  if (!upd.affectedRows) return order;
  if (order.appointment_hold_id || order.appointment_id) {
    const { handleAppointmentOrderUnpaid } = await import("../utils/appointmentBookingEngine.js");
    await handleAppointmentOrderUnpaid(order, status).catch((err) =>
      console.error(`[IN-CHAT PAYMENT] Appointment follow-up for order #${orderId} failed:`, err.message)
    );
  }
  return { ...order, status };
}

/** Sends the element's confirmation message and continues the flow from its next step. */
export async function continueAfterPayment(order) {
  // Appointment fee: the booking engine confirms the appointment itself.
  if (order.appointment_hold_id || order.appointment_id) {
    const { handleAppointmentOrderPaid } = await import("../utils/appointmentBookingEngine.js");
    return handleAppointmentOrderPaid(order);
  }
  if (!order.conversation_id) return;
  const [[conversation]] = await pool.query("SELECT * FROM conversations WHERE id = ? AND agency_id = ?", [order.conversation_id, order.agency_id]);
  if (!conversation) return;
  const [[contact]] = await pool.query("SELECT * FROM contacts WHERE id = ?", [conversation.contact_id]);
  const [[integration]] = conversation.integration_id
    ? await pool.query("SELECT * FROM integrations WHERE id = ?", [conversation.integration_id])
    : [[null]];
  // Loaded lazily: flowEngine imports this module too.
  const { sendMsg, processFlow, replaceVariables } = await import("../utils/flowEngine.js");

  if (order.success_message) {
    if (contact) {
      const { attachContactFields } = await import("../utils/contactFields.js");
      await attachContactFields(order.agency_id, contact);
    }
    const text = replaceVariables(order.success_message, { order_id: String(order.id), product: order.product_name }, contact);
    await sendMsg(order.agency_id, conversation, text, "TEXT", integration, { flowId: order.flow_id, nodeId: order.node_id });
  }
  if (order.flow_id && order.next_node_id && contact) {
    const [[flow]] = await pool.query("SELECT id FROM flows WHERE id = ? AND agency_id = ? AND is_active = 1", [order.flow_id, order.agency_id]);
    if (!flow) return;
    const [ins] = await pool.query(
      "INSERT INTO flow_sessions (agency_id, conversation_id, flow_id, current_node_id, variables, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
      [order.agency_id, conversation.id, flow.id, order.next_node_id, JSON.stringify({ order_id: String(order.id) })]
    );
    const [[session]] = await pool.query("SELECT * FROM flow_sessions WHERE id = ?", [ins.insertId]);
    const platform = integration?.platform || contact.platform;
    await processFlow(order.agency_id, platform, conversation, contact, "", integration, "TEXT", null, {
      session,
      skipDelayForNodeId: null,
    });
  }
}
