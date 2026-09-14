/**
 * Support Desk — standalone ticketing module. See migrate_support_desk.js
 * for the schema/permission notes; this router is deliberately kept
 * separate from every other route file (no shared code with routes/
 * conversations.js's Live Inbox) since the Support Desk is its own portal,
 * not connected to the main dashboard.
 *
 * Ticket routing ("which agency's team handles this ticket"):
 *   - requester's agency.account_type = 'RESELLER_CUSTOMER' -> their own
 *     Reseller (agencies.parent_agency_id) — Platform never sees it.
 *   - requester's agency.account_type = 'DIRECT_CUSTOMER' or 'RESELLER'
 *     -> the one agencies row with account_type='PLATFORM'.
 * A PLATFORM-type agency's own users never open tickets (they ARE the
 * top-level support desk), so resolveHelpdeskAgencyId() is never called
 * for them — enforced by the POST /tickets guard below.
 */
import express from "express";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requirePermission, loadOrgMember } from "../middleware/permissionMiddleware.js";
import pool from "../db.js";
import { emitToAgency, emitToTicket } from "../utils/socket.js";

const router = express.Router();

router.use(authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

const requireDeskView = requirePermission("support_desk.view", "support_desk.manage", "admin.support_desk.view", "admin.support_desk.manage");
const requireDeskManage = requirePermission("support_desk.manage", "admin.support_desk.manage");

// ─── Helpers ────────────────────────────────────────────────────────────

async function getAgency(agencyId) {
  const [[a]] = await pool.query("SELECT id, account_type, parent_agency_id, name FROM agencies WHERE id = ?", [agencyId]);
  return a || null;
}

async function resolveHelpdeskAgencyId(requesterAgency) {
  if (requesterAgency.account_type === "RESELLER_CUSTOMER") {
    return requesterAgency.parent_agency_id;
  }
  const [[platform]] = await pool.query("SELECT id FROM agencies WHERE account_type = 'PLATFORM' LIMIT 1");
  return platform ? platform.id : null;
}

// Does the caller currently hold support-desk staff access over their OWN
// agency's helpdesk (i.e. can they see the Queue at all)? Checked via the
// real organization_members/role_permissions system — no permission means
// no staff access, matching every other module in this app.
async function callerDeskAccess(req) {
  const member = await loadOrgMember(req);
  if (!member) return { canView: false, canManage: false };
  const [rows] = await pool.query("SELECT permission_key FROM role_permissions WHERE role_id = ?", [member.role_id]);
  const keys = new Set(rows.map((r) => r.permission_key));
  const canManage = keys.has("support_desk.manage") || keys.has("admin.support_desk.manage");
  const canView = canManage || keys.has("support_desk.view") || keys.has("admin.support_desk.view");
  return { canView, canManage };
}

function ticketNumber(id) {
  return `TKT-${String(id).padStart(6, "0")}`;
}

async function logActivity(ticketId, actorUserId, eventType, fromValue, toValue) {
  await pool.query(
    "INSERT INTO support_ticket_activity (ticket_id, actor_user_id, event_type, from_value, to_value) VALUES (?,?,?,?,?)",
    [ticketId, actorUserId || null, eventType, fromValue ?? null, toValue ?? null]
  );
}

async function loadTicketOr404(req, res, { forStaff = false } = {}) {
  const id = Number(req.params.id);
  const [[ticket]] = await pool.query("SELECT * FROM support_tickets WHERE id = ?", [id]);
  if (!ticket) {
    res.status(404).json({ success: false, message: "Ticket not found" });
    return null;
  }
  const isRequester = ticket.requester_user_id === req.user.id;
  const isStaff = ticket.helpdesk_agency_id === req.user.agencyId;
  if (forStaff) {
    if (!isStaff) {
      res.status(403).json({ success: false, message: "Forbidden: not this ticket's helpdesk" });
      return null;
    }
    return ticket;
  }
  if (!isRequester && !isStaff) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return null;
  }
  return ticket;
}

// ─── Bootstrap ──────────────────────────────────────────────────────────

router.get("/support-desk/bootstrap", async (req, res) => {
  try {
    const agency = await getAgency(req.user.agencyId);
    if (!agency) return res.status(400).json({ success: false, message: "No workspace found for this account" });

    let helpdeskAgencyId = null;
    let canRequest = true;
    if (agency.account_type === "PLATFORM") {
      canRequest = false; // Platform IS the top-level helpdesk, it doesn't file tickets to anyone
    } else {
      helpdeskAgencyId = await resolveHelpdeskAgencyId(agency);
    }

    const access = await callerDeskAccess(req);

    const [departments] = helpdeskAgencyId
      ? await pool.query("SELECT id, name FROM support_departments WHERE agency_id = ? ORDER BY sort_order, name", [helpdeskAgencyId])
      : [[]];

    res.json({
      success: true,
      agencyId: req.user.agencyId,
      accountType: agency.account_type,
      canRequest,
      helpdeskAgencyId,
      canView: access.canView,
      canManage: access.canManage,
      departments,
    });
  } catch (err) {
    console.error("GET /support-desk/bootstrap error:", err);
    res.status(500).json({ success: false, message: "Failed to load support desk" });
  }
});

// ─── Requester: create & view own tickets ──────────────────────────────

router.post("/support-desk/tickets", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const agency = await getAgency(req.user.agencyId);
    if (!agency || agency.account_type === "PLATFORM") {
      return res.status(400).json({ success: false, message: "Your account can't open a support ticket" });
    }
    const { subject, departmentId, priority, body, attachments } = req.body;
    if (!subject?.trim() || !body?.trim()) {
      return res.status(400).json({ success: false, message: "Subject and message are required" });
    }
    const helpdeskAgencyId = await resolveHelpdeskAgencyId(agency);
    if (!helpdeskAgencyId) {
      return res.status(500).json({ success: false, message: "Could not determine which support desk handles this account" });
    }

    await conn.beginTransaction();
    const [ins] = await conn.query(
      `INSERT INTO support_tickets
        (helpdesk_agency_id, requester_user_id, requester_agency_id, department_id, subject, priority, status, last_reply_by, last_activity_at)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 'REQUESTER', NOW())`,
      [helpdeskAgencyId, req.user.id, req.user.agencyId, departmentId || null, subject.trim(), priority || "NORMAL"]
    );
    const ticketId = ins.insertId;
    await conn.query("UPDATE support_tickets SET ticket_number = ? WHERE id = ?", [ticketNumber(ticketId), ticketId]);

    const [msgIns] = await conn.query(
      "INSERT INTO support_ticket_messages (ticket_id, sender_user_id, sender_type, body) VALUES (?, ?, 'REQUESTER', ?)",
      [ticketId, req.user.id, body.trim()]
    );
    const messageId = msgIns.insertId;

    if (Array.isArray(attachments)) {
      for (const a of attachments) {
        if (!a?.url) continue;
        await conn.query(
          "INSERT INTO support_ticket_attachments (ticket_id, message_id, url, filename, mime_type, size, uploaded_by) VALUES (?,?,?,?,?,?,?)",
          [ticketId, messageId, a.url, a.filename || "attachment", a.mimeType || null, a.size || null, req.user.id]
        );
      }
    }

    await conn.commit();

    emitToAgency(helpdeskAgencyId, "support_ticket:new", { ticketId, ticketNumber: ticketNumber(ticketId), subject: subject.trim(), requesterName: req.user.name, priority: priority || "NORMAL" });

    res.status(201).json({ success: true, ticketId, ticketNumber: ticketNumber(ticketId) });
  } catch (err) {
    await conn.rollback();
    console.error("POST /support-desk/tickets error:", err);
    res.status(500).json({ success: false, message: "Failed to create ticket" });
  } finally {
    conn.release();
  }
});

router.get("/support-desk/my-tickets", async (req, res) => {
  try {
    const { status } = req.query;
    const params = [req.user.id];
    let where = "requester_user_id = ?";
    if (status) { where += " AND status = ?"; params.push(status); }
    const [rows] = await pool.query(
      `SELECT t.*, d.name AS department_name
       FROM support_tickets t LEFT JOIN support_departments d ON d.id = t.department_id
       WHERE ${where} ORDER BY t.last_activity_at DESC, t.created_at DESC`,
      params
    );
    res.json({ success: true, tickets: rows });
  } catch (err) {
    console.error("GET /support-desk/my-tickets error:", err);
    res.status(500).json({ success: false, message: "Failed to load your tickets" });
  }
});

// ─── Staff: queue, stats, agents (registered BEFORE /tickets/:id so
// "queue"/"stats"/"agents" never get swallowed as an :id param) ────────

router.get("/support-desk/queue", requireDeskView, async (req, res) => {
  try {
    const { status, priority, departmentId, assignedTo, search, page = 1, pageSize = 25 } = req.query;
    const params = [req.user.agencyId];
    let where = "t.helpdesk_agency_id = ?";
    if (status) { where += " AND t.status = ?"; params.push(status); }
    if (priority) { where += " AND t.priority = ?"; params.push(priority); }
    if (departmentId) { where += " AND t.department_id = ?"; params.push(departmentId); }
    if (assignedTo === "unassigned") { where += " AND t.assigned_to IS NULL"; }
    else if (assignedTo) { where += " AND t.assigned_to = ?"; params.push(assignedTo); }
    if (search) { where += " AND (t.subject LIKE ? OR t.ticket_number LIKE ? OR u.name LIKE ?)"; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    const limit = Math.min(Number(pageSize) || 25, 100);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;

    const [rows] = await pool.query(
      `SELECT t.*, d.name AS department_name, u.name AS requester_name, u.email AS requester_email,
              ra.name AS requester_agency_name, au.name AS assigned_to_name
       FROM support_tickets t
       LEFT JOIN support_departments d ON d.id = t.department_id
       LEFT JOIN users u ON u.id = t.requester_user_id
       LEFT JOIN agencies ra ON ra.id = t.requester_agency_id
       LEFT JOIN users au ON au.id = t.assigned_to
       WHERE ${where}
       ORDER BY t.last_activity_at DESC, t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM support_tickets t LEFT JOIN users u ON u.id = t.requester_user_id WHERE ${where}`,
      params
    );
    res.json({ success: true, tickets: rows, total, page: Number(page), pageSize: limit });
  } catch (err) {
    console.error("GET /support-desk/queue error:", err);
    res.status(500).json({ success: false, message: "Failed to load queue" });
  }
});

router.get("/support-desk/stats", requireDeskView, async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [[byStatus]] = await pool.query(
      `SELECT
         SUM(status='PENDING') AS pending, SUM(status='ANSWERED') AS answered,
         SUM(status='ON_HOLD') AS on_hold, SUM(status='SOLVED') AS solved,
         SUM(status='CLOSED') AS closed, COUNT(*) AS total
       FROM support_tickets WHERE helpdesk_agency_id = ?`,
      [agencyId]
    );
    const [[avg]] = await pool.query(
      `SELECT
         AVG(TIMESTAMPDIFF(MINUTE, created_at, solved_at)) AS avg_resolution_minutes,
         AVG(rating) AS avg_rating, COUNT(rating) AS rating_count
       FROM support_tickets WHERE helpdesk_agency_id = ? AND solved_at IS NOT NULL`,
      [agencyId]
    );
    const [byDept] = await pool.query(
      `SELECT d.name, COUNT(t.id) AS count FROM support_tickets t
       LEFT JOIN support_departments d ON d.id = t.department_id
       WHERE t.helpdesk_agency_id = ? GROUP BY d.id, d.name`,
      [agencyId]
    );
    res.json({ success: true, byStatus, avgResolutionMinutes: avg.avg_resolution_minutes, avgRating: avg.avg_rating, ratingCount: avg.rating_count, byDepartment: byDept });
  } catch (err) {
    console.error("GET /support-desk/stats error:", err);
    res.status(500).json({ success: false, message: "Failed to load stats" });
  }
});

router.get("/support-desk/agents", requireDeskView, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
       JOIN role_permissions rp ON rp.role_id = om.role_id
       WHERE om.agency_id = ? AND om.is_active = 1
         AND rp.permission_key IN ('support_desk.view','support_desk.manage','admin.support_desk.view','admin.support_desk.manage')
       GROUP BY u.id, u.name, u.email
       ORDER BY u.name`,
      [req.user.agencyId]
    );
    res.json({ success: true, agents: rows });
  } catch (err) {
    console.error("GET /support-desk/agents error:", err);
    res.status(500).json({ success: false, message: "Failed to load agents" });
  }
});

// ─── Departments (staff, manage-gated for writes) ──────────────────────

router.get("/support-desk/departments", requireDeskView, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM support_departments WHERE agency_id = ? ORDER BY sort_order, name", [req.user.agencyId]);
    res.json({ success: true, departments: rows });
  } catch (err) {
    console.error("GET /support-desk/departments error:", err);
    res.status(500).json({ success: false, message: "Failed to load departments" });
  }
});

router.post("/support-desk/departments", requireDeskManage, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: "Name is required" });
    const [ins] = await pool.query(
      "INSERT INTO support_departments (agency_id, name, description) VALUES (?,?,?)",
      [req.user.agencyId, name.trim(), description || null]
    );
    res.status(201).json({ success: true, id: ins.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "A department with this name already exists" });
    console.error("POST /support-desk/departments error:", err);
    res.status(500).json({ success: false, message: "Failed to create department" });
  }
});

router.put("/support-desk/departments/:id", requireDeskManage, async (req, res) => {
  try {
    const { name, description, sortOrder } = req.body;
    const [result] = await pool.query(
      "UPDATE support_departments SET name = COALESCE(?, name), description = ?, sort_order = COALESCE(?, sort_order) WHERE id = ? AND agency_id = ?",
      [name?.trim() || null, description ?? null, sortOrder ?? null, req.params.id, req.user.agencyId]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Department not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("PUT /support-desk/departments/:id error:", err);
    res.status(500).json({ success: false, message: "Failed to update department" });
  }
});

router.delete("/support-desk/departments/:id", requireDeskManage, async (req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM support_departments WHERE id = ? AND agency_id = ?", [req.params.id, req.user.agencyId]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Department not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /support-desk/departments/:id error:", err);
    res.status(500).json({ success: false, message: "Failed to delete department" });
  }
});

// ─── Canned responses (staff, manage-gated for writes) ─────────────────

router.get("/support-desk/canned-responses", requireDeskView, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM support_canned_responses WHERE agency_id = ? ORDER BY title", [req.user.agencyId]);
    res.json({ success: true, cannedResponses: rows });
  } catch (err) {
    console.error("GET /support-desk/canned-responses error:", err);
    res.status(500).json({ success: false, message: "Failed to load canned responses" });
  }
});

router.post("/support-desk/canned-responses", requireDeskManage, async (req, res) => {
  try {
    const { title, body } = req.body;
    if (!title?.trim() || !body?.trim()) return res.status(400).json({ success: false, message: "Title and body are required" });
    const [ins] = await pool.query(
      "INSERT INTO support_canned_responses (agency_id, title, body, created_by) VALUES (?,?,?,?)",
      [req.user.agencyId, title.trim(), body.trim(), req.user.id]
    );
    res.status(201).json({ success: true, id: ins.insertId });
  } catch (err) {
    console.error("POST /support-desk/canned-responses error:", err);
    res.status(500).json({ success: false, message: "Failed to create canned response" });
  }
});

router.put("/support-desk/canned-responses/:id", requireDeskManage, async (req, res) => {
  try {
    const { title, body } = req.body;
    const [result] = await pool.query(
      "UPDATE support_canned_responses SET title = COALESCE(?, title), body = COALESCE(?, body) WHERE id = ? AND agency_id = ?",
      [title?.trim() || null, body?.trim() || null, req.params.id, req.user.agencyId]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Canned response not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("PUT /support-desk/canned-responses/:id error:", err);
    res.status(500).json({ success: false, message: "Failed to update canned response" });
  }
});

router.delete("/support-desk/canned-responses/:id", requireDeskManage, async (req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM support_canned_responses WHERE id = ? AND agency_id = ?", [req.params.id, req.user.agencyId]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Canned response not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /support-desk/canned-responses/:id error:", err);
    res.status(500).json({ success: false, message: "Failed to delete canned response" });
  }
});

// ─── Single ticket (view, reply, transitions) ──────────────────────────

router.get("/support-desk/tickets/:id", async (req, res) => {
  try {
    const ticket = await loadTicketOr404(req, res);
    if (!ticket) return;
    const isStaffViewer = ticket.helpdesk_agency_id === req.user.agencyId;
    const access = isStaffViewer ? await callerDeskAccess(req) : { canView: false, canManage: false };
    const includeInternal = isStaffViewer && (access.canView || access.canManage);

    const [messages] = await pool.query(
      `SELECT m.*, u.name AS sender_name
       FROM support_ticket_messages m JOIN users u ON u.id = m.sender_user_id
       WHERE m.ticket_id = ? ${includeInternal ? "" : "AND m.is_internal_note = 0"}
       ORDER BY m.created_at ASC`,
      [ticket.id]
    );
    const [attachments] = await pool.query("SELECT * FROM support_ticket_attachments WHERE ticket_id = ?", [ticket.id]);
    const [activity] = await pool.query(
      `SELECT a.*, u.name AS actor_name FROM support_ticket_activity a LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE a.ticket_id = ? ORDER BY a.created_at ASC`,
      [ticket.id]
    );
    const [[requester]] = await pool.query("SELECT id, name, email FROM users WHERE id = ?", [ticket.requester_user_id]);
    const [[department]] = ticket.department_id
      ? await pool.query("SELECT id, name FROM support_departments WHERE id = ?", [ticket.department_id])
      : [[null]];

    res.json({
      success: true,
      ticket: { ...ticket, ticket_number: ticket.ticket_number || ticketNumber(ticket.id) },
      requester,
      department,
      messages: messages.map((m) => ({ ...m, attachments: attachments.filter((a) => a.message_id === m.id) })),
      activity,
      isStaffViewer,
      canManage: access.canManage,
    });
  } catch (err) {
    console.error("GET /support-desk/tickets/:id error:", err);
    res.status(500).json({ success: false, message: "Failed to load ticket" });
  }
});

router.post("/support-desk/tickets/:id/messages", async (req, res) => {
  try {
    const ticket = await loadTicketOr404(req, res);
    if (!ticket) return;
    const { body, attachments, isInternalNote } = req.body;
    if (!body?.trim()) return res.status(400).json({ success: false, message: "Message is required" });

    const isRequester = ticket.requester_user_id === req.user.id;
    const isStaff = ticket.helpdesk_agency_id === req.user.agencyId;
    let senderType, internalNote = false;

    if (isRequester) {
      if (ticket.status === "CLOSED") {
        return res.status(400).json({ success: false, message: "This ticket is closed — reopen it first to reply" });
      }
      senderType = "REQUESTER";
    } else if (isStaff) {
      const access = await callerDeskAccess(req);
      if (!access.canManage) return res.status(403).json({ success: false, message: "Forbidden: requires support_desk.manage" });
      senderType = "AGENT";
      internalNote = !!isInternalNote;
    } else {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const [msgIns] = await pool.query(
      "INSERT INTO support_ticket_messages (ticket_id, sender_user_id, sender_type, body, is_internal_note) VALUES (?,?,?,?,?)",
      [ticket.id, req.user.id, senderType, body.trim(), internalNote ? 1 : 0]
    );
    const messageId = msgIns.insertId;

    if (Array.isArray(attachments)) {
      for (const a of attachments) {
        if (!a?.url) continue;
        await pool.query(
          "INSERT INTO support_ticket_attachments (ticket_id, message_id, url, filename, mime_type, size, uploaded_by) VALUES (?,?,?,?,?,?,?)",
          [ticket.id, messageId, a.url, a.filename || "attachment", a.mimeType || null, a.size || null, req.user.id]
        );
      }
    }

    // Internal notes don't change the customer-visible status/last_reply_by.
    let newStatus = ticket.status;
    if (!internalNote) {
      if (senderType === "REQUESTER" && ["ANSWERED", "ON_HOLD", "SOLVED"].includes(ticket.status)) newStatus = "PENDING";
      if (senderType === "AGENT" && ["PENDING", "ON_HOLD"].includes(ticket.status)) newStatus = "ANSWERED";
      await pool.query(
        "UPDATE support_tickets SET status = ?, last_reply_by = ?, last_activity_at = NOW() WHERE id = ?",
        [newStatus, senderType, ticket.id]
      );
      if (newStatus !== ticket.status) await logActivity(ticket.id, req.user.id, "STATUS_CHANGED", ticket.status, newStatus);
    } else {
      await pool.query("UPDATE support_tickets SET last_activity_at = NOW() WHERE id = ?", [ticket.id]);
    }

    const payload = { ticketId: ticket.id, messageId, senderType, isInternalNote: internalNote, body: body.trim(), senderName: req.user.name };
    if (!internalNote) {
      emitToTicket(ticket.id, "support_ticket:message", payload);
      emitToAgency(ticket.helpdesk_agency_id, "support_ticket:updated", { ticketId: ticket.id, status: newStatus });
      emitToAgency(ticket.requester_agency_id, "support_ticket:updated", { ticketId: ticket.id, status: newStatus });
    } else {
      emitToAgency(ticket.helpdesk_agency_id, "support_ticket:internal_note", payload);
    }

    res.status(201).json({ success: true, messageId, status: newStatus });
  } catch (err) {
    console.error("POST /support-desk/tickets/:id/messages error:", err);
    res.status(500).json({ success: false, message: "Failed to send reply" });
  }
});

router.post("/support-desk/tickets/:id/reopen", async (req, res) => {
  try {
    const ticket = await loadTicketOr404(req, res);
    if (!ticket) return;
    if (ticket.requester_user_id !== req.user.id) return res.status(403).json({ success: false, message: "Only the requester can reopen this ticket" });
    if (!["CLOSED", "SOLVED"].includes(ticket.status)) return res.status(400).json({ success: false, message: "Ticket is not closed or solved" });
    await pool.query("UPDATE support_tickets SET status='PENDING', closed_at=NULL, last_activity_at=NOW() WHERE id=?", [ticket.id]);
    await logActivity(ticket.id, req.user.id, "REOPENED", ticket.status, "PENDING");
    emitToAgency(ticket.helpdesk_agency_id, "support_ticket:updated", { ticketId: ticket.id, status: "PENDING" });
    res.json({ success: true });
  } catch (err) {
    console.error("POST /support-desk/tickets/:id/reopen error:", err);
    res.status(500).json({ success: false, message: "Failed to reopen ticket" });
  }
});

router.post("/support-desk/tickets/:id/rate", async (req, res) => {
  try {
    const ticket = await loadTicketOr404(req, res);
    if (!ticket) return;
    if (ticket.requester_user_id !== req.user.id) return res.status(403).json({ success: false, message: "Only the requester can rate this ticket" });
    if (!["SOLVED", "CLOSED"].includes(ticket.status)) return res.status(400).json({ success: false, message: "Ticket must be solved or closed to rate" });
    const rating = Number(req.body.rating);
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ success: false, message: "Rating must be 1-5" });
    await pool.query("UPDATE support_tickets SET rating = ?, rating_comment = ? WHERE id = ?", [rating, req.body.comment || null, ticket.id]);
    emitToAgency(ticket.helpdesk_agency_id, "support_ticket:updated", { ticketId: ticket.id });
    res.json({ success: true });
  } catch (err) {
    console.error("POST /support-desk/tickets/:id/rate error:", err);
    res.status(500).json({ success: false, message: "Failed to submit rating" });
  }
});

router.patch("/support-desk/tickets/:id/status", requireDeskManage, async (req, res) => {
  try {
    const ticket = await loadTicketOr404(req, res, { forStaff: true });
    if (!ticket) return;
    const { status } = req.body;
    if (!["PENDING", "ANSWERED", "ON_HOLD", "SOLVED", "CLOSED"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }
    const extra = [];
    const params = [status];
    if (status === "SOLVED" && ticket.status !== "SOLVED") { extra.push("solved_at = NOW()"); }
    if (status === "CLOSED" && ticket.status !== "CLOSED") { extra.push("closed_at = NOW()"); }
    await pool.query(
      `UPDATE support_tickets SET status = ?, last_activity_at = NOW()${extra.length ? ", " + extra.join(", ") : ""} WHERE id = ?`,
      [...params, ticket.id]
    );
    await logActivity(ticket.id, req.user.id, "STATUS_CHANGED", ticket.status, status);
    emitToTicket(ticket.id, "support_ticket:updated", { ticketId: ticket.id, status });
    emitToAgency(ticket.helpdesk_agency_id, "support_ticket:updated", { ticketId: ticket.id, status });
    emitToAgency(ticket.requester_agency_id, "support_ticket:updated", { ticketId: ticket.id, status });
    res.json({ success: true });
  } catch (err) {
    console.error("PATCH /support-desk/tickets/:id/status error:", err);
    res.status(500).json({ success: false, message: "Failed to update status" });
  }
});

router.patch("/support-desk/tickets/:id/priority", requireDeskManage, async (req, res) => {
  try {
    const ticket = await loadTicketOr404(req, res, { forStaff: true });
    if (!ticket) return;
    const { priority } = req.body;
    if (!["LOW", "NORMAL", "HIGH", "URGENT"].includes(priority)) return res.status(400).json({ success: false, message: "Invalid priority" });
    await pool.query("UPDATE support_tickets SET priority = ?, last_activity_at = NOW() WHERE id = ?", [priority, ticket.id]);
    await logActivity(ticket.id, req.user.id, "PRIORITY_CHANGED", ticket.priority, priority);
    emitToTicket(ticket.id, "support_ticket:updated", { ticketId: ticket.id, priority });
    res.json({ success: true });
  } catch (err) {
    console.error("PATCH /support-desk/tickets/:id/priority error:", err);
    res.status(500).json({ success: false, message: "Failed to update priority" });
  }
});

router.patch("/support-desk/tickets/:id/department", requireDeskManage, async (req, res) => {
  try {
    const ticket = await loadTicketOr404(req, res, { forStaff: true });
    if (!ticket) return;
    const { departmentId } = req.body;
    await pool.query("UPDATE support_tickets SET department_id = ?, last_activity_at = NOW() WHERE id = ?", [departmentId || null, ticket.id]);
    await logActivity(ticket.id, req.user.id, "DEPARTMENT_CHANGED", String(ticket.department_id ?? ""), String(departmentId ?? ""));
    emitToTicket(ticket.id, "support_ticket:updated", { ticketId: ticket.id, departmentId });
    res.json({ success: true });
  } catch (err) {
    console.error("PATCH /support-desk/tickets/:id/department error:", err);
    res.status(500).json({ success: false, message: "Failed to update department" });
  }
});

router.patch("/support-desk/tickets/:id/assign", requireDeskManage, async (req, res) => {
  try {
    const ticket = await loadTicketOr404(req, res, { forStaff: true });
    if (!ticket) return;
    const { assignedTo } = req.body;
    if (assignedTo) {
      const [[member]] = await pool.query("SELECT id FROM organization_members WHERE user_id = ? AND agency_id = ? AND is_active = 1", [assignedTo, req.user.agencyId]);
      if (!member) return res.status(400).json({ success: false, message: "That user isn't a member of this workspace" });
    }
    await pool.query("UPDATE support_tickets SET assigned_to = ?, last_activity_at = NOW() WHERE id = ?", [assignedTo || null, ticket.id]);
    await logActivity(ticket.id, req.user.id, "ASSIGNED", String(ticket.assigned_to ?? ""), String(assignedTo ?? ""));
    emitToTicket(ticket.id, "support_ticket:updated", { ticketId: ticket.id, assignedTo });
    emitToAgency(ticket.helpdesk_agency_id, "support_ticket:updated", { ticketId: ticket.id });
    res.json({ success: true });
  } catch (err) {
    console.error("PATCH /support-desk/tickets/:id/assign error:", err);
    res.status(500).json({ success: false, message: "Failed to assign ticket" });
  }
});

export default router;
