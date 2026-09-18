import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { sendPlatformMessage } from "../utils/platformSender.js";
import { emitToAgency, emitToConversation } from "../utils/socket.js";
import { getOrgMember, integrationAccessClause } from "../utils/teamAccess.js";
import { unsubscribeContactFromSequence } from "./sequences.js";
import { requireModule, assertLimit } from "../utils/entitlements.js";
import { translateText } from "../utils/translateMessage.js";
import { buildSearch } from "../utils/searchQuery.js";

const router = express.Router();

router.use("/conversations", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), requireModule("feature_live_chat"));

// ─── GET ALL CONVERSATIONS (for inbox) ───────────────────────────────────────
router.get("/conversations", async (req, res) => {
  try {
    const { status, platform, search, labelId, assignedToId, unread, important, archived, blocked } = req.query;
    const agencyId = req.user.agencyId;
    const role = req.user.role;
    // Pagination — required at scale (see the approved Live Inbox
    // performance plan): defaults preserve a full first screen's worth
    // without ever loading an agency's entire conversation list.
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    // Date range — defaults to the last 7 days (bounds the query even if the
    // client sends nothing, per the performance mandate), server-clamped to
    // a 30-day max span regardless of what's requested, so a mistaken/huge
    // custom range client-side can never turn into an unbounded scan.
    const MAX_RANGE_DAYS = 30;
    const DEFAULT_RANGE_DAYS = 7;
    let dateTo = req.query.dateTo ? new Date(req.query.dateTo) : new Date();
    if (Number.isNaN(dateTo.getTime())) dateTo = new Date();
    let dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : new Date(dateTo.getTime() - DEFAULT_RANGE_DAYS * 86400000);
    if (Number.isNaN(dateFrom.getTime())) dateFrom = new Date(dateTo.getTime() - DEFAULT_RANGE_DAYS * 86400000);
    const maxSpanMs = MAX_RANGE_DAYS * 86400000;
    if (dateTo.getTime() - dateFrom.getTime() > maxSpanMs) {
      dateFrom = new Date(dateTo.getTime() - maxSpanMs);
    }

    let query = `
      SELECT cv.*,
             cv.last_inbound_at as lastInboundAt,
             i.platform as platform, i.platform as integrationPlatform, i.name as integrationName,
             c.name as contactName, c.phone as contactPhone, c.email as contactEmail,
             c.avatar as contactAvatar, c.platform as contactPlatform, c.external_id as contactExternalId,
             c.tags as contactTags, c.bot_paused as contactBotPaused, c.is_blocked as contactIsBlocked,
             u.name as assignedAgentName,
             m.body as lastMessageBody, m.direction as lastMessageDirection, m.created_at as lastMessageTime,
             m.status as lastMessageStatus, m.failure_stage as lastMessageFailureStage,
             m.is_read as lastMessageIsRead, m.delivered_at as lastMessageDeliveredAt
      FROM conversations cv
      JOIN contacts c ON c.id = cv.contact_id
      JOIN integrations i ON i.id = cv.integration_id
      LEFT JOIN agent_profiles ap ON ap.id = cv.assigned_to_id
      LEFT JOIN users u ON u.id = ap.user_id
      LEFT JOIN messages m ON m.id = (
        SELECT id FROM messages WHERE conversation_id = cv.id ORDER BY created_at DESC LIMIT 1
      )
      WHERE cv.agency_id = ? AND COALESCE(cv.last_message_at, cv.created_at) BETWEEN ? AND ?
    `;
    const params = [agencyId, dateFrom, dateTo];

    // Chat Access: "Assigned Chats Only" vs "All Chats" — generalized from
    // the old hardcoded role==='USER' check to any member's
    // organization_members.chat_access (per the approved SaaS hierarchy
    // plan §8), defaulting to the same legacy behavior for role='USER'
    // if no membership row exists yet (defensive, shouldn't happen post-migration).
    const orgMember = await getOrgMember(req.user.id, agencyId);
    const chatAccess = orgMember?.chat_access || (role === "USER" ? "ASSIGNED_ONLY" : "ALL");
    if (chatAccess === "ASSIGNED_ONLY") {
      const [agentProfile] = await pool.query(
        "SELECT id FROM agent_profiles WHERE user_id = ?", [req.user.id]
      );
      if (agentProfile.length) {
        query += " AND (cv.assigned_to_id = ? OR cv.assigned_to_id IS NULL)";
        params.push(agentProfile[0].id);
      }
    }

    // Channel/Bot Access: restrict to the member's allow-listed integrations,
    // if any are configured (no rows = unrestricted, sees every channel
    // their org owns — see utils/teamAccess.js).
    const { clause: accessClause, params: accessParams } = await integrationAccessClause(orgMember?.id, "cv.integration_id");
    query += accessClause;
    params.push(...accessParams);

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
    // Multi-word/prefix matching via utils/searchQuery.js. Ordering stays
    // recency-first on purpose: in an inbox you want the matched person's
    // latest thread, not the highest-scoring one.
    const searchClause = await buildSearch({
      term: search,
      fulltext: [{ table: "contacts", columns: ["name", "email"], expr: "c.name, c.email", weight: 4 }],
      like: ["c.name", "c.phone", "c.email", "i.name"],
    });
    if (searchClause.active) {
      query += ` AND ${searchClause.where}`;
      params.push(...searchClause.whereParams);
    }
    if (labelId) {
      query += " AND cv.contact_id IN (SELECT contact_id FROM contact_labels WHERE label_id = ?)";
      params.push(labelId);
    }
    if (assignedToId === "unassigned") {
      query += " AND cv.assigned_to_id IS NULL";
    } else if (assignedToId) {
      query += " AND cv.assigned_to_id = ?";
      params.push(assignedToId);
    }
    if (unread === "true" || unread === "1") {
      query += " AND cv.unread_count > 0";
    }
    if (important === "true" || important === "1") {
      query += " AND cv.is_important = 1";
    }
    if (archived === "true" || archived === "1") {
      query += " AND cv.is_archived = 1";
    } else {
      // Exclude archived conversations from active inbox views unless viewing archived
      query += " AND cv.is_archived = 0";
    }
    if (blocked === "true" || blocked === "1") {
      query += " AND c.is_blocked = 1";
    }

    // Count first (same WHERE clause, no ORDER BY/LIMIT needed) so the
    // client knows whether there's a next page without ever fetching more
    // rows than the current page needs.
    const countQuery = `SELECT COUNT(*) AS total FROM (${query.replace(/^\s*SELECT[\s\S]*?FROM/i, "SELECT cv.id FROM")}) AS filtered`;
    const [[{ total }]] = await pool.query(countQuery, params);

    query += " ORDER BY COALESCE(cv.last_message_at, cv.created_at) DESC LIMIT ? OFFSET ?";
    const [conversations] = await pool.query(query, [...params, limit, offset]);

    // Batch-fetch structured labels for every contact in this page of results
    // (avoids an N+1 query per conversation row).
    const contactIds = [...new Set(conversations.map((c) => c.contact_id))];
    if (contactIds.length) {
      const [labelRows] = await pool.query(
        `SELECT cl.contact_id, l.id, l.name, l.color
         FROM contact_labels cl
         JOIN labels l ON l.id = cl.label_id
         WHERE cl.contact_id IN (?)`,
        [contactIds]
      );
      const labelsByContact = {};
      for (const row of labelRows) {
        if (!labelsByContact[row.contact_id]) labelsByContact[row.contact_id] = [];
        labelsByContact[row.contact_id].push({ id: row.id, name: row.name, color: row.color });
      }
      for (const conv of conversations) {
        conv.contactLabels = labelsByContact[conv.contact_id] || [];
      }
    }

    return res.json({
      success: true,
      conversations,
      pagination: { total: Number(total || 0), page, limit, totalPages: Math.ceil((total || 0) / limit) || 1 },
      // Echoes the actual (server-clamped) range applied, since a requested
      // range wider than 30 days gets silently narrowed rather than rejected.
      dateRange: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
    });
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
             cv.last_inbound_at as lastInboundAt,
             i.platform as platform, i.platform as integrationPlatform, i.name as integrationName,
             c.name as contactName, c.phone as contactPhone, c.email as contactEmail,
             c.avatar as contactAvatar, c.platform as contactPlatform, c.external_id as contactExternalId,
             c.tags as contactTags, c.bot_paused as contactBotPaused, c.platform_profile as contactPlatformProfile,
             c.is_blocked as contactIsBlocked, c.blocked_reason as contactBlockedReason,
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

    // Fetch structured contact labels
    const [contactLabels] = await pool.query(
      `SELECT l.id, l.name, l.color 
       FROM labels l
       JOIN contact_labels cl ON cl.label_id = l.id
       WHERE cl.contact_id = ?
       ORDER BY l.name ASC`,
      [conversation.contact_id]
    );
    conversation.contactLabels = contactLabels;

    // Fetch messages — capped to the most recent 50 (uses the
    // messages(conversation_id, created_at) index). Older history loads
    // incrementally via GET /conversations/:id/messages?before=... on
    // scroll-up, so a long-running conversation never loads its entire
    // history in one shot.
    const [recentDesc] = await pool.query(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 51",
      [req.params.id]
    );
    const hasMoreMessages = recentDesc.length > 50;
    const messages = recentDesc.slice(0, 50).reverse();

    for (const m of messages) {
      if (m.metadata && typeof m.metadata === "string") {
        try { m.metadata = JSON.parse(m.metadata); } catch (_) {}
      }
      if (m.media_url && m.media_url.includes("lookaside.fbsbx.com")) {
        m.media_url = `/api/v1/media/whatsapp/${m.id}`;
      }
    }

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
      hasMoreMessages,
      notes: notes || [],
      activeFlow: flowSessions[0] || null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── LOAD OLDER MESSAGES (cursor pagination, scroll-up) ──────────────────────
router.get("/conversations/:id/messages", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const before = req.query.before ? parseInt(req.query.before) : null;

    const [[owned]] = await pool.query("SELECT id FROM conversations WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!owned) return res.status(404).json({ success: false, message: "Conversation not found" });

    let query = "SELECT * FROM messages WHERE conversation_id = ?";
    const params = [req.params.id];
    if (before) {
      // Cursor is the oldest message id currently loaded on the client —
      // page further back in time from its created_at.
      query += " AND created_at < (SELECT created_at FROM messages WHERE id = ?)";
      params.push(before);
    }
    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit + 1);

    const [rows] = await pool.query(query, params);
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit).reverse();

    for (const m of messages) {
      if (m.metadata && typeof m.metadata === "string") {
        try { m.metadata = JSON.parse(m.metadata); } catch (_) {}
      }
      if (m.media_url && m.media_url.includes("lookaside.fbsbx.com")) {
        m.media_url = `/api/v1/media/whatsapp/${m.id}`;
      }
    }

    return res.json({ success: true, messages, hasMore });
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
    const newStatus = agentProfileId ? 'ASSIGNED' : 'OPEN';
    await pool.query(
      "UPDATE conversations SET assigned_to_id = ?, status = ? WHERE id = ? AND agency_id = ?",
      [agentProfileId || null, newStatus, req.params.id, agencyId]
    );
    let assignedAgentName = null;
    if (agentProfileId) {
      const [[agUser]] = await pool.query(
        "SELECT u.name FROM agent_profiles ap JOIN users u ON u.id = ap.user_id WHERE ap.id = ?",
        [agentProfileId]
      );
      assignedAgentName = agUser?.name || null;
    }
    const payload = {
      conversationId: parseInt(req.params.id),
      assignedToId: agentProfileId || null,
      assignedAgentName,
      status: newStatus
    };
    emitToAgency(agencyId, "conversation_updated", payload);
    emitToConversation(req.params.id, "conversation_updated", payload);
    return res.json({ success: true, message: agentProfileId ? "Conversation assigned" : "Conversation unassigned", ...payload });
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

    if (status === "OPEN") {
      await pool.query(
        "UPDATE conversations SET status = ?, assigned_to_id = NULL WHERE id = ? AND agency_id = ?",
        [status, req.params.id, req.user.agencyId]
      );
      const payload = {
        conversationId: parseInt(req.params.id),
        status,
        assignedToId: null,
        assignedAgentName: null,
      };
      emitToAgency(req.user.agencyId, "conversation_updated", payload);
      emitToConversation(req.params.id, "conversation_updated", payload);
      return res.json({ success: true, message: "Status updated", ...payload });
    } else {
      await pool.query(
        "UPDATE conversations SET status = ? WHERE id = ? AND agency_id = ?",
        [status, req.params.id, req.user.agencyId]
      );
      const payload = {
        conversationId: parseInt(req.params.id),
        status,
      };
      emitToAgency(req.user.agencyId, "conversation_updated", payload);
      emitToConversation(req.params.id, "conversation_updated", payload);
      return res.json({ success: true, message: "Status updated", ...payload });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── MARK CONVERSATION AS READ ───────────────────────────────────────────────
router.patch("/conversations/:id/read", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query(
      "SELECT id FROM conversations WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Conversation not found" });

    await pool.query("UPDATE conversations SET unread_count = 0 WHERE id = ?", [req.params.id]);
    await pool.query("UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND direction = 'INBOUND'", [req.params.id]);

    emitToAgency(agencyId, "conversation_updated", {
      conversationId: parseInt(req.params.id),
      unread_count: 0
    });
    return res.json({ success: true, unread_count: 0 });
  } catch (err) {
    console.error("Mark read error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── MARK CONVERSATION AS UNREAD ─────────────────────────────────────────────
router.patch("/conversations/:id/unread", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query(
      "SELECT id, unread_count FROM conversations WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Conversation not found" });

    const newUnread = Math.max(1, (rows[0].unread_count || 0) + 1);
    await pool.query("UPDATE conversations SET unread_count = ? WHERE id = ?", [newUnread, req.params.id]);
    await pool.query(
      "UPDATE messages SET is_read = 0 WHERE id = (SELECT id FROM (SELECT id FROM messages WHERE conversation_id = ? AND direction = 'INBOUND' ORDER BY created_at DESC LIMIT 1) as t)",
      [req.params.id]
    );

    emitToAgency(agencyId, "conversation_updated", {
      conversationId: parseInt(req.params.id),
      unread_count: newUnread
    });
    return res.json({ success: true, unread_count: newUnread });
  } catch (err) {
    console.error("Mark unread error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── MARK CONVERSATION AS IMPORTANT (TOGGLE OR SET) ──────────────────────────
router.patch("/conversations/:id/important", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query(
      "SELECT id, is_important FROM conversations WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Conversation not found" });

    const current = Boolean(rows[0].is_important);
    const isImportant = req.body?.is_important !== undefined ? (req.body.is_important ? 1 : 0) : (current ? 0 : 1);

    await pool.query("UPDATE conversations SET is_important = ? WHERE id = ?", [isImportant, req.params.id]);
    emitToAgency(agencyId, "conversation_updated", {
      conversationId: parseInt(req.params.id),
      is_important: isImportant === 1
    });
    return res.json({ success: true, is_important: isImportant === 1 });
  } catch (err) {
    console.error("Mark important error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── MARK CONVERSATION AS ARCHIVED (TOGGLE OR SET) ───────────────────────────
router.patch("/conversations/:id/archive", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query(
      "SELECT id, is_archived FROM conversations WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Conversation not found" });

    const current = Boolean(rows[0].is_archived);
    const isArchived = req.body?.is_archived !== undefined ? (req.body.is_archived ? 1 : 0) : (current ? 0 : 1);

    await pool.query("UPDATE conversations SET is_archived = ? WHERE id = ?", [isArchived, req.params.id]);
    emitToAgency(agencyId, "conversation_updated", {
      conversationId: parseInt(req.params.id),
      is_archived: isArchived === 1
    });
    return res.json({ success: true, is_archived: isArchived === 1 });
  } catch (err) {
    console.error("Mark archive error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── BULK ASSIGN CONVERSATIONS ────────────────────────────────────────────────
router.patch("/conversations/bulk-assign", async (req, res) => {
  try {
    const { conversationIds, agentProfileId } = req.body;
    const agencyId = req.user.agencyId;
    if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
      return res.status(400).json({ success: false, message: "conversationIds array is required" });
    }
    await pool.query(
      "UPDATE conversations SET assigned_to_id = ?, status = 'ASSIGNED' WHERE id IN (?) AND agency_id = ?",
      [agentProfileId || null, conversationIds, agencyId]
    );
    for (const id of conversationIds) {
      emitToAgency(agencyId, "conversation_updated", { conversationId: Number(id), assignedToId: agentProfileId || null, status: "ASSIGNED" });
    }
    return res.json({ success: true, message: `${conversationIds.length} conversation(s) assigned` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── BULK UPDATE CONVERSATION STATUS ──────────────────────────────────────────
router.patch("/conversations/bulk-status", async (req, res) => {
  try {
    const { conversationIds, status } = req.body;
    const agencyId = req.user.agencyId;
    const validStatuses = ["OPEN", "ASSIGNED", "RESOLVED", "PENDING"];
    if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
      return res.status(400).json({ success: false, message: "conversationIds array is required" });
    }
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }
    await pool.query(
      "UPDATE conversations SET status = ? WHERE id IN (?) AND agency_id = ?",
      [status, conversationIds, agencyId]
    );
    for (const id of conversationIds) {
      emitToAgency(agencyId, "conversation_updated", { conversationId: Number(id), status });
    }
    return res.json({ success: true, message: `${conversationIds.length} conversation(s) updated` });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── SEND MESSAGE (Outbound) ──────────────────────────────────────────────────
router.post("/conversations/:id/messages", async (req, res) => {
  try {
    const { body, type = "TEXT", mediaUrl, templateId, variableValues, whatsappFlowRefId } = req.body;
    const agencyId = req.user.agencyId;

    if (!body && !mediaUrl && !templateId && !whatsappFlowRefId) {
      return res.status(400).json({ success: false, message: "Message body or media is required" });
    }

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

    // Sender attribution metadata (built up front so it's available whether the send succeeds or fails)
    let agentName = req.user?.name;
    if (!agentName && req.user?.id) {
      const [u] = await pool.query("SELECT name FROM users WHERE id = ?", [req.user.id]);
      if (u.length && u[0].name) agentName = u[0].name;
    }
    if (!agentName) agentName = req.user?.email ? req.user.email.split('@')[0] : 'Agent';

    const senderType = (req.body.senderType || 'AGENT').toUpperCase();
    const metadata = {
      senderType: senderType, // 'AGENT' or 'AI'
      senderName: req.body.senderName || agentName,
      userId: req.user?.id || req.user?.userId,
      agentName: req.body.agentName || agentName,
    };

    // Send via platform API
    let externalMsgId = null;
    const messagePayload = {
      type,
      body: body || "",
      mediaUrl: mediaUrl || null,
    };

    // Send Menu → Message Template: build Meta's `components` array from the
    // template's stored variables_json + the agent-filled values (keyed by
    // the "{{n}}" param string), so {{1}}/{{2}}/... actually get substituted
    // at send time — previously platformSender.js only ever sent name+language.
    // Only BODY-component variables are supported for now (the overwhelming
    // majority of real templates); a header/footer variable is left as-is.
    if (templateId) {
      const [[tpl]] = await pool.query("SELECT * FROM whatsapp_templates WHERE id = ? AND agency_id = ?", [templateId, agencyId]);
      if (!tpl) return res.status(404).json({ success: false, message: "Template not found" });
      let variables = [];
      try { variables = typeof tpl.variables_json === "string" ? JSON.parse(tpl.variables_json || "[]") : (tpl.variables_json || []); } catch { variables = []; }
      const components = [];
      if (variables.length) {
        components.push({
          type: "body",
          parameters: variables.map((v, idx) => ({
            type: "text",
            text: String(variableValues?.[v.param] ?? variableValues?.[idx] ?? v.sample ?? ""),
          })),
        });
      }
      messagePayload.type = "TEMPLATE";
      messagePayload.body = tpl.body_text;
      messagePayload.whatsappTemplate = { name: tpl.template_name, language: tpl.language, components };
    }

    // Send Menu → WhatsApp Flow: reference an already-Meta-published Flow by
    // flow_id (see routes/whatsappFlowRefs.js) — no Flow JSON authoring here.
    if (whatsappFlowRefId) {
      const [[flowRef]] = await pool.query("SELECT * FROM whatsapp_flow_refs WHERE id = ? AND agency_id = ?", [whatsappFlowRefId, agencyId]);
      if (!flowRef) return res.status(404).json({ success: false, message: "WhatsApp Flow reference not found" });
      // "TEXT" here, not a made-up type — messages.type's ENUM has no
      // interactive/flow value, and platformSender.js branches on the
      // presence of whatsappFlow itself, not on this field.
      messagePayload.type = "TEXT";
      messagePayload.body = body || `Please complete: ${flowRef.name}`;
      messagePayload.whatsappFlow = { flowId: flowRef.flow_id, cta: "Open" };
    }

    // ─── Message Credit Limit ───
    try {
      await assertLimit(req.user.agencyId, "max_monthly_messages", 1, req.user?.id);
    } catch (limitErr) {
      return res.status(limitErr.status || 403).json({ success: false, message: limitErr.message, code: limitErr.code });
    }

    // ─── WhatsApp 24-Hour Messaging Window Enforcement ───
    // Outside the 24-hour window from the contact's last inbound message, WhatsApp
    // strictly permits only pre-approved message templates. Free-form messages are rejected.
    const isWhatsApp = (conv.platform || "").toUpperCase() === "WHATSAPP";
    const isTemplate = Boolean(templateId || type === "TEMPLATE" || messagePayload.whatsappTemplate);

    if (isWhatsApp && !isTemplate) {
      let lastInboundTime = conv.last_inbound_at;
      if (!lastInboundTime) {
        const [inboundRows] = await pool.query(
          "SELECT MAX(created_at) AS last_inbound FROM messages WHERE conversation_id = ? AND direction = 'INBOUND'",
          [req.params.id]
        );
        lastInboundTime = inboundRows[0]?.last_inbound;
      }

      const now = Date.now();
      const lastInboundMs = lastInboundTime ? new Date(lastInboundTime).getTime() : 0;
      const windowMs = 24 * 60 * 60 * 1000;
      const isWindowExpired = !lastInboundTime || (now - lastInboundMs > windowMs);

      if (isWindowExpired) {
        return res.status(400).json({
          success: false,
          code: "WHATSAPP_24H_WINDOW_EXPIRED",
          message: "Out of 24 hours window, you can only send a message template.",
        });
      }
    }

    try {
      externalMsgId = await sendPlatformMessage(conv.platform, conv, conv.contactExternalId, messagePayload);
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

      // Persist the attempt as a FAILED message (instead of just returning an error and
      // leaving no trace in the chat) so the conversation shows exactly what was tried and
      // that it never left our server — this is what renders as the red single tick.
      let chatMessage = null;
      try {
        const [failResult] = await pool.query(
          `INSERT INTO messages (conversation_id, direction, type, body, media_url, metadata, external_msg_id, status, failure_stage, failure_reason, created_at)
           VALUES (?, 'OUTBOUND', ?, ?, ?, ?, NULL, 'FAILED', 'SEND', ?, NOW())`,
          [req.params.id, messagePayload.type, messagePayload.body || "", mediaUrl || null, JSON.stringify(metadata), friendlyMsg]
        );
        const [[savedFail]] = await pool.query("SELECT * FROM messages WHERE id = ?", [failResult.insertId]);
        chatMessage = { ...savedFail, metadata };

        emitToAgency(agencyId, "new_message", { conversationId: conv.id, message: chatMessage });
        emitToConversation(conv.id, "new_message", { conversationId: conv.id, message: chatMessage });
      } catch (persistErr) {
        console.error("Failed to persist failed-send message:", persistErr.message);
      }

      return res.status(502).json({ success: false, message: friendlyMsg, metaError, chatMessage });
    }

    const finalMediaUrl = messagePayload.finalMediaUrl || mediaUrl || null;

    // Save outbound message to DB
    const [msgResult] = await pool.query(
      `INSERT INTO messages (conversation_id, direction, type, body, media_url, metadata, external_msg_id, sent_at, created_at)
       VALUES (?, 'OUTBOUND', ?, ?, ?, ?, ?, NOW(), NOW())`,
      [req.params.id, messagePayload.type, messagePayload.body || "", finalMediaUrl, JSON.stringify(metadata), externalMsgId]
    );

    // Update conversation last_message_at
    await pool.query(
      "UPDATE conversations SET last_message_at = NOW(), status = 'ASSIGNED' WHERE id = ?",
      [req.params.id]
    );

    const [savedMsg] = await pool.query("SELECT * FROM messages WHERE id = ?", [msgResult.insertId]);
    const message = savedMsg[0];
    message.metadata = metadata;

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
    // `reason` is optional and defaults to 'MANUAL' — every pre-existing
    // caller sends no body at all, which keeps working unchanged. See
    // POST /conversations/:id/join below for the "Human Agent Takeover"
    // flow, which also pauses but additionally assigns + sets an
    // auto-resume timer; this route stays the plain pause/resume toggle.
    const reason = req.body?.reason === "HUMAN_TAKEOVER" ? "HUMAN_TAKEOVER" : "MANUAL";
    const [rows] = await pool.query(
      "SELECT id, contact_id, bot_paused FROM conversations WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );

    if (!rows.length) return res.status(404).json({ success: false, message: "Conversation not found" });

    const newPaused = rows[0].bot_paused ? 0 : 1;
    if (newPaused === 1) {
      await pool.query(
        "UPDATE conversations SET bot_paused = 1, paused_by_user_id = ?, paused_at = NOW(), pause_reason = ?, auto_resume_at = NULL WHERE id = ? AND agency_id = ?",
        [req.user.id, reason, req.params.id, agencyId]
      );
    } else {
      await pool.query(
        "UPDATE conversations SET bot_paused = 0, paused_by_user_id = NULL, paused_at = NULL, pause_reason = NULL, auto_resume_at = NULL WHERE id = ? AND agency_id = ?",
        [req.params.id, agencyId]
      );
    }
    await pool.query("UPDATE contacts SET bot_paused = ? WHERE id = ? AND agency_id = ?", [newPaused, rows[0].contact_id, agencyId]);

    // If bot was resumed and there's an active flow, or if paused, emit update
    emitToAgency(agencyId, "conversation_updated", {
      conversationId: parseInt(req.params.id),
      botPaused: newPaused === 1,
      pauseReason: newPaused === 1 ? reason : null,
    });

    return res.json({ success: true, botPaused: newPaused === 1 });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── LIVE CHAT TRANSLATOR ─────────────────────────────────────────────────────
// Per-conversation toggle + target language. Translation itself is on-demand
// (see .../messages/:messageId/translate below), not eager on every inbound
// message — cheaper on AI tokens, and matches the "See Translation" pattern
// most chat UIs already use rather than always-on background translation.
router.patch("/conversations/:id/translate", requireModule("feature_live_chat_translator"), async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { enabled, targetLang } = req.body || {};
    const [rows] = await pool.query("SELECT id FROM conversations WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Conversation not found" });

    await pool.query(
      "UPDATE conversations SET translate_enabled = ?, translate_target_lang = ? WHERE id = ? AND agency_id = ?",
      [enabled ? 1 : 0, enabled ? (targetLang || "en") : null, req.params.id, agencyId]
    );

    return res.json({ success: true, translateEnabled: Boolean(enabled), translateTargetLang: enabled ? (targetLang || "en") : null });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Server error", code: err.code });
  }
});

// Translates one message to the conversation's translate_target_lang,
// caching the result on the message row so it's only ever computed once.
router.post("/conversations/:id/messages/:messageId/translate", requireModule("feature_live_chat_translator"), async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [[conv]] = await pool.query(
      "SELECT id, translate_target_lang FROM conversations WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );
    if (!conv) return res.status(404).json({ success: false, message: "Conversation not found" });

    const targetLang = req.body?.targetLang || conv.translate_target_lang || "en";

    const [[msg]] = await pool.query(
      "SELECT id, body, translated_text, translated_lang FROM messages WHERE id = ? AND conversation_id = ?",
      [req.params.messageId, req.params.id]
    );
    if (!msg) return res.status(404).json({ success: false, message: "Message not found" });

    if (msg.translated_text && msg.translated_lang === targetLang) {
      return res.json({ success: true, translatedText: msg.translated_text, cached: true });
    }

    await assertLimit(agencyId, "max_ai_tokens_per_month", 0, req.user?.id);

    const translated = await translateText(agencyId, msg.body || "", targetLang);
    await pool.query("UPDATE messages SET translated_text = ?, translated_lang = ? WHERE id = ?", [translated, targetLang, msg.id]);

    return res.json({ success: true, translatedText: translated, cached: false });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Server error", code: err.code });
  }
});

// ─── HUMAN AGENT TAKEOVER ("Join Chat") ──────────────────────────────────────
// Pauses bot + AI (same bot_paused flags every existing check already
// enforces — flowEngine.js:174, messageProcessor.js:125, aiReplyEngine.js:106),
// records who took over and when, assigns the conversation to the caller if
// unassigned, and schedules an auto-resume per the integration's
// ai_reply_settings.auto_resume_minutes (utils/botResumeScheduler.js polls
// for it — NULL means "Never", matching the Bot settings dropdown).
router.post("/conversations/:id/join", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query(
      "SELECT cv.id, cv.contact_id, cv.integration_id, cv.assigned_to_id FROM conversations cv WHERE cv.id = ? AND cv.agency_id = ?",
      [req.params.id, agencyId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Conversation not found" });
    const conv = rows[0];

    // When someone joins, assign to whoever is joining (if they have an agent profile),
    // otherwise retain the existing assigned_to_id.
    const [[agentProfile]] = await pool.query("SELECT id FROM agent_profiles WHERE user_id = ?", [req.user.id]);
    let assignedToId = agentProfile ? agentProfile.id : conv.assigned_to_id;
    let assignedAgentName = agentProfile ? req.user.name : null;
    if (!assignedAgentName && assignedToId) {
      const [[agUser]] = await pool.query(
        "SELECT u.name FROM agent_profiles ap JOIN users u ON u.id = ap.user_id WHERE ap.id = ?",
        [assignedToId]
      );
      assignedAgentName = agUser?.name || null;
    }

    const [[settings]] = await pool.query(
      "SELECT auto_resume_minutes FROM ai_reply_settings WHERE integration_id = ?",
      [conv.integration_id]
    );
    const autoResumeMinutes = settings?.auto_resume_minutes ?? null;

    await pool.query(
      `UPDATE conversations
       SET bot_paused = 1, paused_by_user_id = ?, paused_at = NOW(), pause_reason = 'HUMAN_TAKEOVER',
           auto_resume_at = ${autoResumeMinutes ? "DATE_ADD(NOW(), INTERVAL ? MINUTE)" : "NULL"},
           assigned_to_id = ?, status = 'ASSIGNED'
       WHERE id = ? AND agency_id = ?`,
      autoResumeMinutes
        ? [req.user.id, autoResumeMinutes, assignedToId, req.params.id, agencyId]
        : [req.user.id, assignedToId, req.params.id, agencyId]
    );
    await pool.query("UPDATE contacts SET bot_paused = 1 WHERE id = ? AND agency_id = ?", [conv.contact_id, agencyId]);

    const payload = {
      conversationId: parseInt(req.params.id),
      botPaused: true,
      pauseReason: "HUMAN_TAKEOVER",
      pausedByUserId: req.user.id,
      pausedByName: req.user.name,
      assignedToId,
      assignedAgentName,
      status: "ASSIGNED",
    };
    emitToAgency(agencyId, "conversation_updated", payload);
    emitToConversation(req.params.id, "conversation_updated", payload);

    return res.json({ success: true, ...payload });
  } catch (err) {
    console.error("Join chat error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── LEAVE CHAT (resumes bot, unassigns agent and marks OPEN) ───────────────────────
router.post("/conversations/:id/leave", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query(
      `SELECT cv.id, cv.contact_id
       FROM conversations cv
       WHERE cv.id = ? AND cv.agency_id = ?`,
      [req.params.id, agencyId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Conversation not found" });

    await pool.query(
      `UPDATE conversations
       SET bot_paused = 0, paused_by_user_id = NULL, paused_at = NULL, pause_reason = NULL, auto_resume_at = NULL,
           assigned_to_id = NULL, status = 'OPEN'
       WHERE id = ? AND agency_id = ?`,
      [req.params.id, agencyId]
    );
    await pool.query("UPDATE contacts SET bot_paused = 0 WHERE id = ? AND agency_id = ?", [rows[0].contact_id, agencyId]);

    const payload = {
      conversationId: parseInt(req.params.id),
      botPaused: false,
      pauseReason: null,
      assignedToId: null,
      assignedAgentName: null,
      status: "OPEN"
    };
    emitToAgency(agencyId, "conversation_updated", payload);
    emitToConversation(req.params.id, "conversation_updated", payload);

    return res.json({ success: true, ...payload });
  } catch (err) {
    console.error("Leave chat error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── RESET USER INPUT FLOW ────────────────────────────────────────────────────
// Closes any flow session currently stuck mid-way for this conversation
// (same "COMPLETED" idiom the trigger-flow route already uses before
// starting a new session — see below) without starting a replacement flow,
// so the subscriber's next message is evaluated fresh from the top instead
// of resuming wherever they left off (e.g. stuck on a "Collect Input" node).
router.post("/conversations/:id/reset-flow", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query(
      "SELECT id FROM conversations WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Conversation not found" });

    const [result] = await pool.query(
      "UPDATE flow_sessions SET status = 'COMPLETED' WHERE conversation_id = ? AND agency_id = ? AND status = 'ACTIVE'",
      [req.params.id, agencyId]
    );

    return res.json({ success: true, reset: result.affectedRows > 0 });
  } catch (err) {
    console.error("Reset flow error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── UNSUBSCRIBE FROM SEQUENCES ──────────────────────────────────────────────
// Stops every Sequence (drip campaign) this contact is currently actively
// enrolled in — reuses the exact same unsubscribeContactFromSequence()
// routes/sequences.js already exports for the per-sequence HTTP unsubscribe
// route and the Flow Builder's "Stop Sequence" node, just applied to all of
// a contact's active enrollments at once from the Inbox subscriber panel.
router.post("/conversations/:id/unsubscribe", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query(
      "SELECT id, contact_id FROM conversations WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Conversation not found" });

    const [activeSubs] = await pool.query(
      "SELECT DISTINCT sequence_id FROM sequence_subscribers WHERE contact_id = ? AND status = 'ACTIVE'",
      [rows[0].contact_id]
    );

    let stopped = 0;
    for (const s of activeSubs) {
      const result = await unsubscribeContactFromSequence(s.sequence_id, agencyId, rows[0].contact_id);
      stopped += result.stopped || 0;
    }

    return res.json({ success: true, sequencesStopped: stopped });
  } catch (err) {
    console.error("Unsubscribe error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CLEAR CONVERSATION HISTORY ──────────────────────────────────────────────
// Deletes every message in this conversation. The conversation row itself
// (and the contact) stays intact — only its message timeline is wiped. The
// conversation-list preview (lastMessageBody/lastMessageTime, GET /conversations
// above) is derived live from `messages` via a correlated subquery, so it
// naturally goes blank; last_message_at/unread_count are reset here too so
// list ordering and the unread badge don't keep referencing deleted messages.
router.delete("/conversations/:id/messages", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query(
      "SELECT id FROM conversations WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Conversation not found" });

    const [result] = await pool.query("DELETE FROM messages WHERE conversation_id = ?", [req.params.id]);
    await pool.query(
      "UPDATE conversations SET last_message_at = NULL, unread_count = 0 WHERE id = ?",
      [req.params.id]
    );

    const payload = { conversationId: parseInt(req.params.id) };
    emitToAgency(agencyId, "conversation_history_cleared", payload);
    emitToConversation(req.params.id, "conversation_history_cleared", payload);

    return res.json({ success: true, deleted: result.affectedRows });
  } catch (err) {
    console.error("Clear history error:", err);
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
