import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { executeOutboundWebhook } from "../services/webhookExecutor.js";
import { webhookQueue } from "../services/webhookQueue.js";

const router = express.Router();

// ─── GET WEBHOOK QUEUE & BACKGROUND WORKER STATS ────────────────────────────
router.get("/queue/stats", authMiddleware, async (req, res) => {
  try {
    const stats = webhookQueue.getStats();
    return res.json({ success: true, stats });
  } catch (err) {
    console.error("Get queue stats error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── ENQUEUE TEST EVENT (HIGH-THROUGHPUT SIMULATION) ────────────────────────
router.post("/queue/enqueue-test", authMiddleware, async (req, res) => {
  try {
    const agencyId = req.user?.agencyId || 1;
    const { count = 10 } = req.body;
    const jobIds = [];

    for (let i = 0; i < count; i++) {
      const jobId = webhookQueue.enqueue({
        agencyId,
        platform: "WHATSAPP",
        rawPayload: {
          senderName: `Customer #${100 + i}`,
          message: `Simulated high-throughput inbound message #${i + 1}`,
        },
      });
      jobIds.push(jobId);
    }

    return res.json({
      success: true,
      message: `Enqueued ${count} webhook events into background worker queue!`,
      jobIds,
      currentStats: webhookQueue.getStats(),
    });
  } catch (err) {
    console.error("Enqueue test error:", err);
    return res.status(500).json({ success: false, message: "Failed to enqueue" });
  }
});

// ─── TEST WEBHOOK DISPATCH (FROM FLOW BUILDER UI) ────────────────────────────
router.post("/webhooks/test-dispatch", authMiddleware, async (req, res) => {
  try {
    const { url, method = "POST", customHeaders, payloadMode, customPayload, sampleSubscriber } = req.body;

    if (!url) return res.status(400).json({ success: false, message: "Webhook URL is required" });

    const agencyId = req.user?.agencyId || 1;

    const result = await executeOutboundWebhook({
      agencyId,
      url,
      method,
      customHeaders: customHeaders || {},
      payloadMode: payloadMode || "ALL_VARIABLES",
      customPayload,
      subscriber: sampleSubscriber || {
        id: 999,
        name: "Test Customer",
        email: "customer@example.com",
        phone: "+1234567890",
        platform: "WHATSAPP",
        tags: ["VIP", "Lead"],
        customFields: { interested_product: "Enterprise Plan" },
      },
    });

    return res.json({ success: true, result });
  } catch (err) {
    console.error("Test webhook error:", err);
    return res.status(500).json({ success: false, message: err.message || "Webhook test failed" });
  }
});

// ─── GET RECENT WEBHOOK LOGS ─────────────────────────────────────────────────
router.get("/webhooks/logs", authMiddleware, async (req, res) => {
  try {
    const agencyId = req.user?.agencyId || 1;
    const [logs] = await pool.query(
      `SELECT fwl.*, b.name as flow_name
       FROM flow_webhook_logs fwl
       LEFT JOIN bots b ON b.id = fwl.flow_id
       WHERE fwl.agency_id = ?
       ORDER BY fwl.created_at DESC
       LIMIT 50`,
      [agencyId]
    );

    return res.json({ success: true, logs });
  } catch (err) {
    console.error("Get webhook logs error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── INBOUND WEBHOOK TRIGGER (ZAPIER / MAKE / SHOPIFY -> TRIGGER FLOW) ───────
router.post("/webhooks/inbound/:flowId", async (req, res) => {
  try {
    const { flowId } = req.params;
    const { phone, email, name, channel = "WHATSAPP", customVariables = {} } = req.body;

    const [flows] = await pool.query("SELECT * FROM bots WHERE id = ? LIMIT 1", [flowId]);
    if (!flows.length) {
      return res.status(404).json({ success: false, message: "Bot Flow not found" });
    }

    const flow = flows[0];

    // Find or create subscriber contact
    let contactId = null;
    if (phone || email) {
      const [existing] = await pool.query(
        "SELECT id FROM contacts WHERE agency_id = ? AND (phone = ? OR email = ?) LIMIT 1",
        [flow.agency_id, phone || "nonexistent", email || "nonexistent"]
      );

      if (existing.length) {
        contactId = existing[0].id;
      } else {
        const [ins] = await pool.query(
          "INSERT INTO contacts (agency_id, name, phone, email, platform, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
          [flow.agency_id, name || "Web/Zapier Lead", phone || null, email || null, channel]
        );
        contactId = ins.insertId;
      }
    }

    console.log(`[INBOUND WEBHOOK] Triggered Flow #${flowId} (${flow.name}) for contact #${contactId}`);

    return res.json({
      success: true,
      message: `Flow "${flow.name}" triggered successfully for recipient!`,
      flowId: Number(flowId),
      contactId,
    });
  } catch (err) {
    console.error("Inbound webhook error:", err);
    return res.status(500).json({ success: false, message: "Inbound webhook processing failed" });
  }
});

export default router;
