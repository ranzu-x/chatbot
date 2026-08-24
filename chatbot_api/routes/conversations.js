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
             c.name as contactName, c.phone as contactPhone, c.avatar as contactAvatar, c.platform as contactPlatform, c.external_id as contactExternalId,
             u.name as assignedAgentName,
             i.name as integrationName,
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

    if (status) { query += " AND cv.status = ?"; params.push(status); }
    if (platform) { query += " AND c.platform = ?"; params.push(platform); }
    if (search) {
      query += " AND (c.name LIKE ? OR c.phone LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    query += " ORDER BY COALESCE(cv.last_message_at, cv.created_at) DESC";

    const [conversations] = await pool.query(query, params);
    return res.json({ success: true, conversations });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET SINGLE CONVERSATION WITH MESSAGES ────────────────────────────────────
router.get("/conversations/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query(`
      SELECT cv.*, c.name as contactName, c.phone as contactPhone, c.avatar as contactAvatar,
             c.platform as contactPlatform, c.external_id as contactExternalId,
             i.name as integrationName, i.platform as integrationPlatform,
             u.name as assignedAgentName
      FROM conversations cv
      JOIN contacts c ON c.id = cv.contact_id
      JOIN integrations i ON i.id = cv.integration_id
      LEFT JOIN agent_profiles ap ON ap.id = cv.assigned_to_id
      LEFT JOIN users u ON u.id = ap.user_id
      WHERE cv.id = ? AND cv.agency_id = ?
    `, [req.params.id, agencyId]);

    if (!rows.length) return res.status(404).json({ success: false, message: "Conversation not found" });

    // Fetch messages
    const [messages] = await pool.query(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
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

    return res.json({ success: true, conversation: rows[0], messages });
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
      return res.status(502).json({ success: false, message: "Failed to deliver message via platform API" });
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

export default router;
