import express from "express";
import pool from "../db.js";
import { processFlow } from "../utils/flowEngine.js";
import {
  findOrCreateContact,
  findOrCreateConversation,
  saveMessage,
  matchBotRules,
} from "../utils/messageProcessor.js";
import { emitToAgency, emitToConversation } from "../utils/socket.js";

const router = express.Router();

// ─── INITIALIZE WEBCHAT SESSION (PUBLIC) ──────────────────────────────────────
router.post("/webchat/init", async (req, res) => {
  try {
    const { widgetKey, visitorId } = req.body;
    if (!widgetKey) {
      return res.status(400).json({ success: false, message: "Widget key is required" });
    }

    // Find webchat widget config
    const [widgets] = await pool.query(
      "SELECT * FROM webchat_widgets WHERE widget_key = ? AND is_active = 1 LIMIT 1",
      [widgetKey]
    );

    if (!widgets.length) {
      return res.status(404).json({ success: false, message: "Widget not found or inactive" });
    }
    const widget = widgets[0];
    const agencyId = widget.agency_id;
    const integrationId = widget.integration_id;

    // Load integration details
    const [integrations] = await pool.query(
      "SELECT * FROM integrations WHERE id = ? LIMIT 1",
      [integrationId]
    );
    const integration = integrations[0];

    // Generate session ID if not exists
    const sessId = visitorId || `visitor_${widgetKey}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Create or get contact
    const contact = await findOrCreateContact(
      agencyId,
      "WEBCHAT",
      sessId,
      `Webchat Visitor (${sessId.slice(-4)})`,
      null
    );

    // Create or get conversation
    const { conversation, isNew } = await findOrCreateConversation(
      agencyId,
      contact.id,
      integrationId,
      "WEBCHAT"
    );

    // If new conversation, we can optionally send the greeting message
    if (isNew && widget.greeting_message) {
      // Save welcome message as bot message
      await pool.query(
        `INSERT INTO messages (conversation_id, direction, type, body, created_at)
         VALUES (?, 'OUTBOUND', 'TEXT', ?, NOW())`,
        [conversation.id, widget.greeting_message]
      );
    }

    // Load existing messages for this conversation
    const [messages] = await pool.query(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
      [conversation.id]
    );

    return res.json({
      success: true,
      visitorId: sessId,
      conversationId: conversation.id,
      widget: {
        name: widget.name,
        primaryColor: widget.primary_color,
        greetingMessage: widget.greeting_message,
        placeholderText: widget.placeholder_text,
      },
      messages,
    });
  } catch (err) {
    console.error("Webchat init error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── SEND VISITOR MESSAGE (PUBLIC) ────────────────────────────────────────────
router.post("/webchat/message", async (req, res) => {
  try {
    const { widgetKey, visitorId, conversationId, body } = req.body;
    if (!widgetKey || !visitorId || !conversationId || !body) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // Verify widget
    const [widgets] = await pool.query(
      "SELECT * FROM webchat_widgets WHERE widget_key = ? AND is_active = 1 LIMIT 1",
      [widgetKey]
    );
    if (!widgets.length) {
      return res.status(404).json({ success: false, message: "Widget not found" });
    }
    const widget = widgets[0];
    const agencyId = widget.agency_id;
    const integrationId = widget.integration_id;

    const [integrations] = await pool.query(
      "SELECT * FROM integrations WHERE id = ? LIMIT 1",
      [integrationId]
    );
    const integration = integrations[0];

    // Verify conversation
    const [convs] = await pool.query(
      "SELECT * FROM conversations WHERE id = ? AND agency_id = ? AND status != 'RESOLVED'",
      [conversationId, agencyId]
    );
    if (!convs.length) {
      return res.status(404).json({ success: false, message: "Conversation not found or resolved" });
    }
    const conversation = convs[0];

    // Get contact
    const [contacts] = await pool.query("SELECT * FROM contacts WHERE id = ?", [conversation.contact_id]);
    const contact = contacts[0];

    // Save message
    const message = await saveMessage(conversationId, "INBOUND", "TEXT", body, null);

    // Emit sockets
    emitToAgency(agencyId, "new_message", {
      conversationId,
      message,
    });
    emitToConversation(conversationId, "new_message", {
      conversationId,
      message,
    });

    // Run Flow engine
    const flowRan = await processFlow(agencyId, "WEBCHAT", conversation, contact, body, integration);
    if (!flowRan) {
      // Run bot rules fallback
      await matchBotRules(agencyId, "WEBCHAT", conversation, contact, body, integration);
    }

    return res.json({ success: true, message });
  } catch (err) {
    console.error("Webchat message error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
