import pool from "../db.js";
import { stripe } from "./stripeService.js";

// ─── CREATE IN-CHAT PAYMENT LINK ─────────────────────────────────────────────
export async function createChatPaymentLink({
  agencyId,
  subscriberId = null,
  flowId = null,
  nodeId = null,
  productName,
  amount,
  currency = "USD",
  customerName = null,
  customerEmail = null,
  customerPhone = null,
  channel = "WHATSAPP",
  collectAddress = false,
}) {
  if (!productName || !amount) {
    throw new Error("Product name and amount are required");
  }

  const numericAmount = Number(amount);
  const curr = (currency || "USD").toUpperCase();

  // 1. Create order record in database (PENDING)
  const [ins] = await pool.query(
    `INSERT INTO chat_orders (
      agency_id, subscriber_id, flow_id, node_id, product_name, amount,
      currency, status, customer_name, customer_email, customer_phone, channel
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`,
    [
      agencyId,
      subscriberId,
      flowId,
      nodeId,
      productName.trim(),
      numericAmount,
      curr,
      customerName,
      customerEmail,
      customerPhone,
      channel,
    ]
  );

  const orderId = ins.insertId;
  let paymentUrl = "";
  let stripeSessionId = `chat_order_${orderId}_${Date.now()}`;

  // 2. Generate Live Stripe Checkout Session or Local Simulation
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
        customer_email: customerEmail || undefined,
        shipping_address_collection: collectAddress ? { allowed_countries: ["US", "CA", "GB", "AU", "DE", "FR", "ES", "IT"] } : undefined,
        success_url: `http://localhost:5173/payments/success?order_id=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `http://localhost:5173/payments/cancel?order_id=${orderId}`,
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
      paymentUrl = `http://localhost:5173/payments/pay/${orderId}`;
    }
  } else {
    // Simulated direct payment checkout link
    paymentUrl = `http://localhost:5173/payments/pay/${orderId}`;
  }

  // Update payment_url in database
  await pool.query(
    "UPDATE chat_orders SET payment_url = ?, stripe_session_id = ? WHERE id = ?",
    [paymentUrl, stripeSessionId, orderId]
  );

  return {
    orderId,
    paymentUrl,
    productName,
    amount: numericAmount,
    currency: curr,
    buttonLabel: `💳 Pay $${numericAmount.toFixed(2)} ${curr}`,
  };
}

// ─── MARK ORDER PAID & CONFIRM ───────────────────────────────────────────────
export async function markOrderPaid(orderId, stripeSessionDetails = {}) {
  const [rows] = await pool.query("SELECT * FROM chat_orders WHERE id = ?", [orderId]);
  if (!rows.length) return null;

  const order = rows[0];
  if (order.status === "PAID") return order;

  await pool.query(
    "UPDATE chat_orders SET status = 'PAID', paid_at = NOW() WHERE id = ?",
    [orderId]
  );

  console.log(`✅ [IN-CHAT PAYMENT] Order #${orderId} (${order.product_name} - $${order.amount} ${order.currency}) marked as PAID!`);
  return {
    ...order,
    status: "PAID",
    paid_at: new Date(),
  };
}
