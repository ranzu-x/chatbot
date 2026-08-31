import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { createChatPaymentLink, markOrderPaid } from "../services/chatPaymentService.js";

const router = express.Router();

// ─── GET ORDER DETAILS (PUBLIC FOR CHECKOUT PAGE) ────────────────────────────
router.get("/payments/order/:orderId", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT co.*, a.name as agency_name, a.custom_branding
       FROM chat_orders co
       JOIN agencies a ON a.id = co.agency_id
       WHERE co.id = ? LIMIT 1`,
      [req.params.orderId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const order = rows[0];
    let branding = {};
    try {
      branding = typeof order.custom_branding === "string" ? JSON.parse(order.custom_branding || "{}") : order.custom_branding || {};
    } catch {
      branding = {};
    }

    return res.json({
      success: true,
      order: {
        ...order,
        amount: Number(order.amount),
        customBranding: branding,
      },
    });
  } catch (err) {
    console.error("Get order details error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── SIMULATE PAY (FOR DEV / SANDBOX CHECKOUT) ──────────────────────────────
router.post("/payments/order/:orderId/simulate-pay", async (req, res) => {
  try {
    const updated = await markOrderPaid(req.params.orderId);
    if (!updated) return res.status(404).json({ success: false, message: "Order not found" });
    return res.json({ success: true, message: "Payment processed successfully!", order: updated });
  } catch (err) {
    console.error("Simulate pay error:", err);
    return res.status(500).json({ success: false, message: "Payment simulation failed" });
  }
});

// ─── CREATE IN-CHAT PAYMENT LINK ─────────────────────────────────────────────
router.post("/payments/create-link", authMiddleware, async (req, res) => {
  try {
    const agencyId = req.user?.agencyId || 1;
    const {
      productName,
      amount,
      currency = "USD",
      subscriberId,
      flowId,
      nodeId,
      customerName,
      customerEmail,
      customerPhone,
      channel = "WHATSAPP",
      collectAddress = false,
    } = req.body;

    if (!productName || !amount) {
      return res.status(400).json({ success: false, message: "Product name and amount are required" });
    }

    const result = await createChatPaymentLink({
      agencyId,
      subscriberId,
      flowId,
      nodeId,
      productName,
      amount,
      currency,
      customerName,
      customerEmail,
      customerPhone,
      channel,
      collectAddress,
    });

    return res.status(201).json({ success: true, ...result });
  } catch (err) {
    console.error("Create payment link error:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to create payment link" });
  }
});

// ─── GET RECENT IN-CHAT ORDERS & REVENUE STATS ───────────────────────────────
router.get("/payments/orders", authMiddleware, async (req, res) => {
  try {
    const agencyId = req.user?.agencyId || 1;

    const [orders] = await pool.query(
      `SELECT co.*, b.name as flow_name
       FROM chat_orders co
       LEFT JOIN bots b ON b.id = co.flow_id
       WHERE co.agency_id = ?
       ORDER BY co.created_at DESC
       LIMIT 100`,
      [agencyId]
    );

    // Calculate Summary Metrics
    let totalRevenue = 0;
    let paidOrdersCount = 0;
    let pendingOrdersCount = 0;

    for (const o of orders) {
      if (o.status === "PAID") {
        totalRevenue += Number(o.amount);
        paidOrdersCount++;
      } else if (o.status === "PENDING") {
        pendingOrdersCount++;
      }
    }

    return res.json({
      success: true,
      orders,
      metrics: {
        totalRevenue: Number(totalRevenue.toFixed(2)),
        totalOrders: orders.length,
        paidOrdersCount,
        pendingOrdersCount,
      },
    });
  } catch (err) {
    console.error("Get chat orders error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
