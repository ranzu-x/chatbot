import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { executeOutboundWebhook } from "../services/webhookExecutor.js";
import { webhookQueue } from "../services/webhookQueue.js";
import { requireModule, assertLimit } from "../utils/entitlements.js";
import { inboundFlowKey, isValidInboundFlowKey } from "../utils/webhookAuth.js";
import { toWhatsAppNumber } from "../utils/commerceEvents.js";
import { findOrCreateConversationForBroadcast } from "../utils/broadcastRunner.js";
import { processFlow } from "../utils/flowEngine.js";

const router = express.Router();

// These are workspace-configuration/diagnostic tools ("Webhooks & Zapier" —
// an "app related" menu, owner-level), not day-to-day agent work — were
// only gated by authMiddleware (any logged-in user, any role). /webhooks/inbound/:flowId
// below needs no login (external services call it) but requires the flow's
// key, which only the owner sees via /webhooks/inbound-urls.
router.use(["/queue/stats", "/queue/enqueue-test", "/webhooks/test-dispatch", "/webhooks/logs", "/webhooks/inbound-urls"], authMiddleware, roleMiddleware("RESELLER", "ADMIN"), requireModule("feature_whatsapp_webhook_workflow"));

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
// ─── INBOUND WEBHOOK URLS (owner-only; each carries its flow's key) ──────────
router.get("/webhooks/inbound-urls", async (req, res) => {
  try {
    const agencyId = req.tenant?.agencyId ?? req.user.agencyId;
    const [flows] = await pool.query("SELECT id FROM flows WHERE agency_id = ?", [agencyId]);
    const base = (process.env.BACKEND_URL || "http://localhost:5000").replace(/\/+$/, "");
    return res.json({
      success: true,
      urls: Object.fromEntries(flows.map((f) => [f.id, `${base}/api/v1/webhooks/inbound/${f.id}?key=${inboundFlowKey(f.id)}`])),
    });
  } catch (err) {
    console.error("Inbound webhook URLs error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── INBOUND WEBHOOK: START A FLOW FOR A LEAD (public, key-protected) ────────
// Zapier / Make / a website form calls this to put someone into a flow. The
// per-flow key (utils/webhookAuth.js) is required; the flow's own bot account
// decides the channel. WhatsApp: pass `phone` (with country code, or add
// `countryCode`); other channels: pass `externalId` (their chat/user id).
// Note that WhatsApp only delivers free-form flow messages to someone who
// messaged the business in the last 24 hours — for cold leads use a template.
router.post("/webhooks/inbound/:flowId", async (req, res) => {
  try {
    const flowId = Number(req.params.flowId);
    const key = req.query.key || req.get("X-Webhook-Key");
    if (!flowId || !isValidInboundFlowKey(flowId, key)) {
      return res.status(401).json({ success: false, message: "Missing or invalid webhook key" });
    }

    const [[flow]] = await pool.query("SELECT * FROM flows WHERE id = ? AND is_active = 1", [flowId]);
    if (!flow) return res.status(404).json({ success: false, message: "Flow not found or inactive" });

    const [[integration]] = await pool.query(
      "SELECT * FROM integrations WHERE id = ? AND agency_id = ? AND is_active = 1",
      [flow.integration_id, flow.agency_id]
    );
    if (!integration) return res.status(409).json({ success: false, message: "This flow has no active bot account" });

    const { phone, email, name, externalId: rawExternalId, countryCode, customVariables = {} } = req.body || {};
    const platform = integration.platform;
    const externalId = platform === "WHATSAPP" ? toWhatsAppNumber(phone, countryCode) : (rawExternalId ? String(rawExternalId).slice(0, 200) : null);
    if (!externalId) {
      return res.status(400).json({
        success: false,
        message: platform === "WHATSAPP" ? "A valid phone number with country code is required" : `externalId (the ${platform} user/chat id) is required`,
      });
    }

    const [[existing]] = await pool.query(
      "SELECT * FROM contacts WHERE agency_id = ? AND platform = ? AND external_id = ?",
      [flow.agency_id, platform, externalId]
    );
    let contact = existing;
    if (!contact) {
      try {
        await assertLimit(flow.agency_id, "max_subscribers", 1, null);
      } catch (limitErr) {
        return res.status(403).json({ success: false, message: limitErr.message, code: limitErr.code });
      }
      await pool.query(
        // source INTEGRATION: counts in subscriber gain (see migrate_subscriber_source_and_earnings.js)
        `INSERT IGNORE INTO contacts (agency_id, platform, external_id, name, phone, email, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'INTEGRATION', NOW())`,
        [flow.agency_id, platform, externalId, String(name || "").slice(0, 150) || externalId, platform === "WHATSAPP" ? externalId : (phone || null), email || null]
      );
      [[contact]] = await pool.query(
        "SELECT * FROM contacts WHERE agency_id = ? AND platform = ? AND external_id = ?",
        [flow.agency_id, platform, externalId]
      );
    }
    if (contact.is_blocked) return res.status(409).json({ success: false, message: "This subscriber is blocked" });

    const conversation = await findOrCreateConversationForBroadcast(flow.agency_id, contact.id, integration.id);

    const nodes = JSON.parse(flow.nodes_json || "[]");
    const startNode = nodes.find((n) => n.type === "start") || nodes[0];
    if (!startNode) return res.status(400).json({ success: false, message: "Flow has no start node" });

    // Same start sequence as POST /conversations/:id/trigger-flow.
    const variables = Object.fromEntries(
      Object.entries(customVariables && typeof customVariables === "object" ? customVariables : {})
        .slice(0, 50)
        .map(([k, v]) => [String(k).slice(0, 64), typeof v === "object" ? JSON.stringify(v).slice(0, 1000) : String(v).slice(0, 1000)])
    );
    await pool.query("UPDATE flow_sessions SET status = 'COMPLETED' WHERE conversation_id = ? AND status = 'ACTIVE'", [conversation.id]);
    await pool.query(
      "INSERT INTO flow_sessions (agency_id, conversation_id, flow_id, current_node_id, variables, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
      [flow.agency_id, conversation.id, flow.id, startNode.id, JSON.stringify(variables)]
    );
    await processFlow(flow.agency_id, platform, conversation, contact, "", integration);

    console.log(`[INBOUND WEBHOOK] Started flow #${flow.id} (${flow.name}) for contact #${contact.id}`);
    return res.json({
      success: true,
      message: `Flow "${flow.name}" started`,
      flowId: flow.id,
      contactId: contact.id,
      conversationId: conversation.id,
    });
  } catch (err) {
    console.error("Inbound webhook error:", err);
    return res.status(500).json({ success: false, message: "Inbound webhook processing failed" });
  }
});

export default router;
