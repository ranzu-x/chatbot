import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { sendPlatformMessage } from "../utils/platformSender.js";
import { emitToAgency, emitToConversation } from "../utils/socket.js";

const router = express.Router();

router.use(authMiddleware, roleMiddleware("AGENCY", "ADMIN", "AGENT"));

// ─── GET ALL CONVERSATIONS (for inbox) ───────────────────────────────────────
router.get("/conversations", async (req, res) => {
  try {
    const { status, platform, search } = req.query;
    const agencyId = req.user.agencyId;
    const role = req.user.role;

    let query = `
      SELECT cv.*, 
             i.platform as platform, i.platform as integrationPlatform, i.name as integrationName,
             c.name as contactName, c.phone as contactPhone, c.email as contactEmail,
             c.avatar as contactAvatar, c.platform as contactPlatform, c.external_id as contactExternalId,
             c.tags as contactTags, c.bot_paused as contactBotPaused,
             u.name as assignedAgentName,
             m.body as lastMessageBody, m.direction as lastMessageDirection, m.created_at as lastMessageTime
      FROM conversations cv
      JOIN contacts c ON c.id = cv.contact_id
      JOIN integrations i ON i.id = cv.integration_id
      LEFT JOIN agent_profiles ap ON ap.id = cv.assigned_to_id
      LEFT JOIN users u ON u.id = ap.user_id
      LEFT JOIN messages m ON m.id = (
        SELECT id FROM messages WHERE conversation_id = cv.id ORDER BY created_at DESC LIMIT 1
      )
      WHERE cv.agency_id = ?
    `;
    const params = [agencyId];

    // If agent, only show assigned or unassigned conversations
    if (role === "AGENT") {
      const [agentProfile] = await pool.query(
        "SELECT id FROM agent_profiles WHERE user_id = ?", [req.user.id]
      );
      if (agentProfile.length) {
        query += " AND (cv.assigned_to_id = ? OR cv.assigned_to_id IS NULL)";
        params.push(agentProfile[0].id);
      }
    }

    if (status) {
      if (status.toUpperCase() === "OPEN") {
        query += " AND cv.status IN ('OPEN', 'ASSIGNED')";
      } else if (status.toUpperCase() === "RESOLVED") {
        query += " AND cv.status IN ('RESOLVED', 'CLOSED')";
      } else {
        query += " AND cv.status = ?";
        params.push(status);
      }
    }
    if (platform && platform !== "ALL") {
      query += " AND (i.platform = ? OR c.platform = ?)";
      params.push(platform, platform);
    }
    if (search) {
      query += " AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR i.name LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += " ORDER BY COALESCE(cv.last_message_at, cv.created_at) DESC";

    const [conversations] = await pool.query(query, params);
    return res.json({ success: true, conversations });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET SINGLE CONVERSATION WITH MESSAGES, NOTES & BOT STATUS ───────────────
router.get("/conversations/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query(`
      SELECT cv.*, 
             i.platform as platform, i.platform as integrationPlatform, i.name as integrationName,
             c.name as contactName, c.phone as contactPhone, c.email as contactEmail,
             c.avatar as contactAvatar, c.platform as contactPlatform, c.external_id as contactExternalId,
             c.tags as contactTags, c.bot_paused as contactBotPaused,
             u.name as assignedAgentName
      FROM conversations cv
      JOIN contacts c ON c.id = cv.contact_id
      JOIN integrations i ON i.id = cv.integration_id
      LEFT JOIN agent_profiles ap ON ap.id = cv.assigned_to_id
      LEFT JOIN users u ON u.id = ap.user_id
      WHERE cv.id = ? AND cv.agency_id = ?
    `, [req.params.id, agencyId]);

    if (!rows.length) return res.status(404).json({ success: false, message: "Conversation not found" });
    const conversation = rows[0];

    // Parse contact tags
    try {
      conversation.contactTags = typeof conversation.contactTags === "string" ? JSON.parse(conversation.contactTags || "[]") : (conversation.contactTags || []);
    } catch { conversation.contactTags = []; }

    // Fetch messages
    const [messages] = await pool.query(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
      [req.params.id]
    );

    // Fetch contact notes
    const [notes] = await pool.query(
      `SELECT n.*, u.name as userName 
       FROM contact_notes n 
       LEFT JOIN users u ON u.id = n.user_id 
       WHERE n.contact_id = ? AND n.agency_id = ? 
       ORDER BY n.created_at DESC`,
      [conversation.contact_id, agencyId]
    );

    // Fetch active flow session if any
    const [flowSessions] = await pool.query(
      `SELECT fs.*, f.name as flowName 
       FROM flow_sessions fs 
       JOIN flows f ON f.id = fs.flow_id 
       WHERE fs.conversation_id = ? AND fs.status = 'ACTIVE' 
       ORDER BY fs.updated_at DESC LIMIT 1`,
      [req.params.id]
    );

    // Mark as read
    await pool.query(
      "UPDATE conversations SET unread_count = 0 WHERE id = ?",
      [req.params.id]
    );
    await pool.query(
      "UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND direction = 'INBOUND'",
      [req.params.id]
    );

    return res.json({
      success: true,
      conversation,
      messages,
      notes: notes || [],
      activeFlow: flowSessions[0] || null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── ASSIGN CONVERSATION ──────────────────────────────────────────────────────
router.patch("/conversations/:id/assign", async (req, res) => {
  try {
    const { agentProfileId } = req.body;
    const agencyId = req.user.agencyId;
    await pool.query(
      "UPDATE conversations SET assigned_to_id = ?, status = 'ASSIGNED' WHERE id = ? AND agency_id = ?",
      [agentProfileId || null, req.params.id, agencyId]
    );
    emitToAgency(agencyId, "conversation_updated", {
      conversationId: parseInt(req.params.id),
      assignedToId: agentProfileId || null,
      status: 'ASSIGNED'
    });
    return res.json({ success: true, message: "Conversation assigned" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── UPDATE CONVERSATION STATUS ───────────────────────────────────────────────
router.patch("/conversations/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["OPEN", "ASSIGNED", "RESOLVED", "PENDING"];
    if (!validStatuses.includes(status))
      return res.status(400).json({ success: false, message: "Invalid status" });

    await pool.query(
      "UPDATE conversations SET status = ? WHERE id = ? AND agency_id = ?",
      [status, req.params.id, req.user.agencyId]
    );
    emitToAgency(req.user.agencyId, "conversation_updated", {
      conversationId: parseInt(req.params.id),
      status
    });
    return res.json({ success: true, message: "Status updated" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── SEND MESSAGE (Outbound) ──────────────────────────────────────────────────
router.post("/conversations/:id/messages", async (req, res) => {
  try {
    const { body, type = "TEXT", mediaUrl } = req.body;
    const agencyId = req.user.agencyId;

    if (!body && !mediaUrl) return res.status(400).json({ success: false, message: "Message body or media is required" });

    // Get conversation + integration details
    const [rows] = await pool.query(`
      SELECT cv.*, i.platform, i.access_token, i.wa_phone_number_id, i.fb_page_id, i.ig_account_id,
             c.external_id as contactExternalId
      FROM conversations cv
      JOIN integrations i ON i.id = cv.integration_id
      JOIN contacts c ON c.id = cv.contact_id
      WHERE cv.id = ? AND cv.agency_id = ?
    `, [req.params.id, agencyId]);

    if (!rows.length) return res.status(404).json({ success: false, message: "Conversation not found" });
    const conv = rows[0];

    // Send via platform API
    let externalMsgId = null;
    try {
      externalMsgId = await sendPlatformMessage(conv.platform, conv, conv.contactExternalId, {
        type,
        body: body || "",
        mediaUrl: mediaUrl || null,
      });
    } catch (apiErr) {
      console.error("API send failed:", apiErr.message);
      // Extract Meta's real error message if available
      const metaError = apiErr?.response?.data?.error;
      let friendlyMsg = "Failed to deliver message via platform API.";
      if (metaError) {
        if (metaError.error_subcode === 2388094 || metaError.code === 131056) {
          friendlyMsg = "WhatsApp message not delivered: 24-hour messaging window expired. Send a Template message to re-open the window.";
        } else if (metaError.code === 190 || metaError.error_subcode === 460) {
          friendlyMsg = "Invalid or expired Access Token. Go to WhatsApp Settings → Activate Number to update your token.";
        } else if (metaError.code === 100) {
          friendlyMsg = `WhatsApp API error: ${metaError.message || "Phone number not registered or not active."}`;
        } else {
          friendlyMsg = metaError.message || friendlyMsg;
        }
      }
      return res.status(502).json({ success: false, message: friendlyMsg, metaError });
    }


    // Save outbound message to DB
    const [msgResult] = await pool.query(
      `INSERT INTO messages (conversation_id, direction, type, body, media_url, external_msg_id, sent_at, created_at)
       VALUES (?, 'OUTBOUND', ?, ?, ?, ?, NOW(), NOW())`,
      [req.params.id, type, body || "", mediaUrl || null, externalMsgId]
    );

    // Update conversation last_message_at
    await pool.query(
      "UPDATE conversations SET last_message_at = NOW(), status = 'ASSIGNED' WHERE id = ?",
      [req.params.id]
    );

    const [savedMsg] = await pool.query("SELECT * FROM messages WHERE id = ?", [msgResult.insertId]);
    const message = savedMsg[0];

    // Real-time socket emissions
    emitToAgency(agencyId, "new_message", {
      conversationId: conv.id,
      message,
    });
    emitToConversation(conv.id, "new_message", {
      conversationId: conv.id,
      message,
    });

    return res.status(201).json({ success: true, message });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── TOGGLE BOT FOR CONVERSATION ─────────────────────────────────────────────
router.patch("/conversations/:id/toggle-bot", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query(
      "SELECT id, contact_id, bot_paused FROM conversations WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );

    if (!rows.length) return res.status(404).json({ success: false, message: "Conversation not found" });

    const newPaused = rows[0].bot_paused ? 0 : 1;
    await pool.query("UPDATE conversations SET bot_paused = ? WHERE id = ? AND agency_id = ?", [newPaused, req.params.id, agencyId]);
    await pool.query("UPDATE contacts SET bot_paused = ? WHERE id = ? AND agency_id = ?", [newPaused, rows[0].contact_id, agencyId]);

    // If bot was resumed and there's an active flow, or if paused, emit update
    emitToAgency(agencyId, "conversation_updated", {
      conversationId: parseInt(req.params.id),
      botPaused: newPaused === 1
    });

    return res.json({ success: true, botPaused: newPaused === 1 });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── MANUALLY TRIGGER A FLOW FOR CONVERSATION ────────────────────────────────
router.post("/conversations/:id/trigger-flow", async (req, res) => {
  try {
    const { flowId } = req.body;
    const agencyId = req.user.agencyId;
    if (!flowId) return res.status(400).json({ success: false, message: "Flow ID is required" });

    // Verify flow exists
    const [flows] = await pool.query("SELECT * FROM flows WHERE id = ? AND agency_id = ? AND is_active = 1", [flowId, agencyId]);
    if (!flows.length) return res.status(404).json({ success: false, message: "Active flow not found" });
    const flow = flows[0];

    // Verify conversation exists
    const [convs] = await pool.query(`
      SELECT cv.*, i.platform as integrationPlatform, i.access_token, i.wa_phone_number_id, i.fb_page_id, i.ig_account_id,
             c.id as contactId, c.name as contactName, c.phone as contactPhone, c.email as contactEmail, c.external_id as contactExternalId
      FROM conversations cv
      JOIN integrations i ON i.id = cv.integration_id
      JOIN contacts c ON c.id = cv.contact_id
      WHERE cv.id = ? AND cv.agency_id = ?
    `, [req.params.id, agencyId]);

    if (!convs.length) return res.status(404).json({ success: false, message: "Conversation not found" });
    const conv = convs[0];

    // Close any previous active session
    await pool.query("UPDATE flow_sessions SET status = 'COMPLETED' WHERE conversation_id = ? AND status = 'ACTIVE'", [conv.id]);

    const nodes = JSON.parse(flow.nodes_json || "[]");
    const startNode = nodes.find(n => n.type === "start") || nodes[0];
    if (!startNode) return res.status(400).json({ success: false, message: "Flow has no start node" });

    // Create active flow session
    const [sessRes] = await pool.query(
      "INSERT INTO flow_sessions (agency_id, conversation_id, flow_id, current_node_id, variables, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
      [agencyId, conv.id, flow.id, startNode.id, JSON.stringify({})]
    );

    // Unpause bot for this conversation so flow can execute
    await pool.query("UPDATE conversations SET bot_paused = 0 WHERE id = ?", [conv.id]);
    await pool.query("UPDATE contacts SET bot_paused = 0 WHERE id = ?", [conv.contactId]);

    // Import and execute processFlow directly
    const { processFlow } = await import("../utils/flowEngine.js");
    const contactObj = { id: conv.contactId, name: conv.contactName, phone: conv.contactPhone, email: conv.contactEmail, external_id: conv.contactExternalId };
    const integObj = { id: conv.integration_id, platform: conv.platform, access_token: conv.access_token, wa_phone_number_id: conv.wa_phone_number_id, fb_page_id: conv.fb_page_id, ig_account_id: conv.ig_account_id };

    await processFlow(agencyId, conv.platform, conv, contactObj, "", integObj);

    emitToAgency(agencyId, "conversation_updated", {
      conversationId: conv.id,
      botPaused: false
    });

    return res.json({ success: true, message: `Flow "${flow.name}" triggered successfully` });
  } catch (err) {
    console.error("Trigger flow error:", err);
    return res.status(500).json({ success: false, message: "Failed to trigger flow" });
  }
});

export default router;
