/**
 * Follow-ups — a reusable per-subscriber/conversation reminder system for
 * the Live Inbox sidebar (see migrate_inbox_extensions.js's `follow_ups`
 * table). "Overdue" is computed here, not stored, so it can never go stale —
 * a row is PENDING in the DB and presented as OVERDUE to the client once its
 * due_at has passed.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { emitToAgency } from "../utils/socket.js";

const router = express.Router();
router.use(authMiddleware);

function withComputedStatus(row) {
  const isOverdue = row.status === "PENDING" && new Date(row.due_at) < new Date();
  return { ...row, status: isOverdue ? "OVERDUE" : row.status };
}

// ─── LIST (paginated, filterable) ────────────────────────────────────────────
router.get("/follow-ups", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { contactId, conversationId, assignedToId, status } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    let where = "WHERE f.agency_id = ?";
    const params = [agencyId];
    if (contactId) { where += " AND f.contact_id = ?"; params.push(contactId); }
    if (conversationId) { where += " AND f.conversation_id = ?"; params.push(conversationId); }
    if (assignedToId) { where += " AND f.assigned_to_agent_profile_id = ?"; params.push(assignedToId); }
    if (status === "OVERDUE") {
      where += " AND f.status = 'PENDING' AND f.due_at < NOW()";
    } else if (status === "PENDING") {
      where += " AND f.status = 'PENDING' AND f.due_at >= NOW()";
    } else if (status === "COMPLETED" || status === "CANCELLED") {
      where += " AND f.status = ?";
      params.push(status);
    }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM follow_ups f ${where}`, params);
    const [rows] = await pool.query(
      `SELECT f.*, c.name AS contactName, c.phone AS contactPhone, u.name AS createdByName, au.name AS assignedToName
       FROM follow_ups f
       JOIN contacts c ON c.id = f.contact_id
       LEFT JOIN users u ON u.id = f.created_by_user_id
       LEFT JOIN agent_profiles ap ON ap.id = f.assigned_to_agent_profile_id
       LEFT JOIN users au ON au.id = ap.user_id
       ${where}
       ORDER BY f.due_at ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      followUps: rows.map(withComputedStatus),
      pagination: { total: Number(total || 0), page, limit, totalPages: Math.ceil((total || 0) / limit) || 1 },
    });
  } catch (err) {
    console.error("GET /follow-ups error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE ───────────────────────────────────────────────────────────────────
router.post("/follow-ups", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { contactId, conversationId, dueAt, note, assignedToAgentProfileId } = req.body;
    if (!contactId || !dueAt || !note) {
      return res.status(400).json({ success: false, message: "contactId, dueAt and note are required" });
    }
    const [[contact]] = await pool.query("SELECT id FROM contacts WHERE id = ? AND agency_id = ?", [contactId, agencyId]);
    if (!contact) return res.status(404).json({ success: false, message: "Contact not found" });

    const [ins] = await pool.query(
      `INSERT INTO follow_ups (agency_id, contact_id, conversation_id, created_by_user_id, assigned_to_agent_profile_id, due_at, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [agencyId, contactId, conversationId || null, req.user.id, assignedToAgentProfileId || null, new Date(dueAt), note]
    );
    emitToAgency(agencyId, "follow_up_updated", { followUpId: ins.insertId, contactId, conversationId: conversationId || null });
    return res.status(201).json({ success: true, followUpId: ins.insertId });
  } catch (err) {
    console.error("POST /follow-ups error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── UPDATE ───────────────────────────────────────────────────────────────────
router.put("/follow-ups/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [[existing]] = await pool.query("SELECT * FROM follow_ups WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!existing) return res.status(404).json({ success: false, message: "Follow-up not found" });

    const { dueAt, note, assignedToAgentProfileId } = req.body;
    const fields = []; const params = [];
    if (dueAt !== undefined) { fields.push("due_at = ?"); params.push(new Date(dueAt)); }
    if (note !== undefined) { fields.push("note = ?"); params.push(note); }
    if (assignedToAgentProfileId !== undefined) { fields.push("assigned_to_agent_profile_id = ?"); params.push(assignedToAgentProfileId || null); }
    if (!fields.length) return res.json({ success: true, message: "Nothing to update" });

    params.push(req.params.id, agencyId);
    await pool.query(`UPDATE follow_ups SET ${fields.join(", ")} WHERE id = ? AND agency_id = ?`, params);
    emitToAgency(agencyId, "follow_up_updated", { followUpId: Number(req.params.id), contactId: existing.contact_id, conversationId: existing.conversation_id });
    return res.json({ success: true, message: "Follow-up updated" });
  } catch (err) {
    console.error("PUT /follow-ups/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CHANGE STATUS (Completed / Cancelled / back to Pending) ────────────────
router.patch("/follow-ups/:id/status", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { status } = req.body;
    if (!["PENDING", "COMPLETED", "CANCELLED"].includes(status)) {
      return res.status(400).json({ success: false, message: "status must be PENDING, COMPLETED or CANCELLED" });
    }
    const [[existing]] = await pool.query("SELECT * FROM follow_ups WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!existing) return res.status(404).json({ success: false, message: "Follow-up not found" });

    await pool.query(
      "UPDATE follow_ups SET status = ?, completed_at = ? WHERE id = ? AND agency_id = ?",
      [status, status === "COMPLETED" ? new Date() : null, req.params.id, agencyId]
    );
    emitToAgency(agencyId, "follow_up_updated", { followUpId: Number(req.params.id), contactId: existing.contact_id, conversationId: existing.conversation_id, status });
    return res.json({ success: true, status });
  } catch (err) {
    console.error("PATCH /follow-ups/:id/status error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── DELETE ───────────────────────────────────────────────────────────────────
router.delete("/follow-ups/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [[existing]] = await pool.query("SELECT contact_id, conversation_id FROM follow_ups WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!existing) return res.status(404).json({ success: false, message: "Follow-up not found" });
    await pool.query("DELETE FROM follow_ups WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    emitToAgency(agencyId, "follow_up_updated", { followUpId: Number(req.params.id), contactId: existing.contact_id, conversationId: existing.conversation_id, deleted: true });
    return res.json({ success: true, message: "Follow-up deleted" });
  } catch (err) {
    console.error("DELETE /follow-ups/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
