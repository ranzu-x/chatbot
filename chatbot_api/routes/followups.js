/**
 * Follow-ups — per-subscriber reminders for the Live Inbox.
 *
 * Each has a title, an optional description (stored in `note`), a due date/time,
 * an optional assignee, and can be snoozed. When one comes due the scheduler
 * (utils/followUpScheduler.js) alerts the person it is for, live in the inbox
 * with a sound. "Overdue" is computed here, not stored, so it can never go
 * stale: a row is PENDING in the DB and presented as OVERDUE to the client once
 * its due_at has passed.
 *
 * Snoozing moves due_at forward and re-arms the alert (alerted_at = NULL).
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { emitToAgency } from "../utils/socket.js";
import { isValidAssignee } from "../utils/teamAccess.js";

const router = express.Router();
router.use("/follow-ups", authMiddleware);

const MAX_TITLE = 160;
const MAX_DESCRIPTION = 2000;
const MAX_SNOOZE_MINUTES = 7 * 24 * 60; // a week

function withComputedStatus(row) {
  const isOverdue = row.status === "PENDING" && new Date(row.due_at) < new Date();
  return { ...row, status: isOverdue ? "OVERDUE" : row.status };
}

/** Trims and length-checks free text. Returns { value } or { error }. */
function cleanText(raw, { label, max, required }) {
  const value = String(raw ?? "").trim();
  if (required && !value) return { error: `${label} is required` };
  if (value.length > max) return { error: `${label} must be ${max} characters or fewer` };
  return { value };
}

function parseDate(raw) {
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

// The agent profiles that count as "me" (a person can hold more than one row).
async function myProfileIds(userId) {
  const [rows] = await pool.query("SELECT id FROM agent_profiles WHERE user_id = ?", [userId]);
  return rows.map((r) => r.id);
}

// ─── LIST (paginated, filterable) ────────────────────────────────────────────
router.get("/follow-ups", async (req, res) => {
  try {
    const agencyId = req.tenant.agencyId;
    const { contactId, conversationId, assignedToId, status, mine } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 30));
    const offset = (page - 1) * limit;

    let where = "WHERE f.agency_id = ?";
    const params = [agencyId];
    if (contactId) { where += " AND f.contact_id = ?"; params.push(contactId); }
    if (conversationId) { where += " AND f.conversation_id = ?"; params.push(conversationId); }
    if (assignedToId) { where += " AND f.assigned_to_agent_profile_id = ?"; params.push(assignedToId); }
    if (mine === "1" || mine === "true") {
      // Reminders that are for the caller: assigned to them, or unassigned and created by them.
      const profileIds = await myProfileIds(req.user.id);
      if (profileIds.length) {
        where += " AND (f.assigned_to_agent_profile_id IN (?) OR (f.assigned_to_agent_profile_id IS NULL AND f.created_by_user_id = ?))";
        params.push(profileIds, req.user.id);
      } else {
        where += " AND f.assigned_to_agent_profile_id IS NULL AND f.created_by_user_id = ?";
        params.push(req.user.id);
      }
    }
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
    const agencyId = req.tenant.agencyId;
    const { contactId, conversationId, dueAt, assignedToAgentProfileId } = req.body;

    const title = cleanText(req.body.title, { label: "Title", max: MAX_TITLE, required: true });
    if (title.error) return res.status(400).json({ success: false, message: title.error });
    const description = cleanText(req.body.note ?? req.body.description, { label: "Description", max: MAX_DESCRIPTION, required: false });
    if (description.error) return res.status(400).json({ success: false, message: description.error });
    if (!contactId || !dueAt) {
      return res.status(400).json({ success: false, message: "contactId and dueAt are required" });
    }
    const due = parseDate(dueAt);
    if (!due) return res.status(400).json({ success: false, message: "dueAt is not a valid date and time" });

    const [[contact]] = await pool.query("SELECT id FROM contacts WHERE id = ? AND agency_id = ?", [contactId, agencyId]);
    if (!contact) return res.status(404).json({ success: false, message: "Contact not found" });

    if (conversationId) {
      const [[conv]] = await pool.query("SELECT id FROM conversations WHERE id = ? AND agency_id = ? AND contact_id = ?", [conversationId, agencyId, contactId]);
      if (!conv) return res.status(404).json({ success: false, message: "Conversation not found" });
    }
    if (assignedToAgentProfileId && !(await isValidAssignee(assignedToAgentProfileId, agencyId, req.user.id))) {
      return res.status(400).json({ success: false, message: "That team member does not belong to this workspace." });
    }

    const [ins] = await pool.query(
      `INSERT INTO follow_ups (agency_id, contact_id, conversation_id, created_by_user_id, assigned_to_agent_profile_id, due_at, title, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [agencyId, contactId, conversationId || null, req.user.id, assignedToAgentProfileId || null, due, title.value, description.value || null]
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
    const agencyId = req.tenant.agencyId;
    const [[existing]] = await pool.query("SELECT * FROM follow_ups WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!existing) return res.status(404).json({ success: false, message: "Follow-up not found" });
    if (existing.status !== "PENDING") {
      return res.status(400).json({ success: false, message: "Only a pending follow-up can be edited. Reopen it first." });
    }

    const fields = []; const params = [];
    if (req.body.title !== undefined) {
      const t = cleanText(req.body.title, { label: "Title", max: MAX_TITLE, required: true });
      if (t.error) return res.status(400).json({ success: false, message: t.error });
      fields.push("title = ?"); params.push(t.value);
    }
    const rawDescription = req.body.note !== undefined ? req.body.note : req.body.description;
    if (rawDescription !== undefined) {
      const d = cleanText(rawDescription, { label: "Description", max: MAX_DESCRIPTION, required: false });
      if (d.error) return res.status(400).json({ success: false, message: d.error });
      fields.push("note = ?"); params.push(d.value || null);
    }
    if (req.body.dueAt !== undefined) {
      const due = parseDate(req.body.dueAt);
      if (!due) return res.status(400).json({ success: false, message: "dueAt is not a valid date and time" });
      fields.push("due_at = ?", "alerted_at = NULL"); params.push(due); // a new time re-arms the alert
    }
    if (req.body.assignedToAgentProfileId !== undefined) {
      const assignee = req.body.assignedToAgentProfileId || null;
      if (assignee && !(await isValidAssignee(assignee, agencyId, req.user.id))) {
        return res.status(400).json({ success: false, message: "That team member does not belong to this workspace." });
      }
      fields.push("assigned_to_agent_profile_id = ?"); params.push(assignee);
    }
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

// ─── SNOOZE ───────────────────────────────────────────────────────────────────
// Pushes the due time to "now + minutes" and re-arms the alert, so it fires again then.
router.post("/follow-ups/:id/snooze", async (req, res) => {
  try {
    const agencyId = req.tenant.agencyId;
    const minutes = Number(req.body?.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_SNOOZE_MINUTES) {
      return res.status(400).json({ success: false, message: `minutes must be a whole number between 1 and ${MAX_SNOOZE_MINUTES}` });
    }
    const [[existing]] = await pool.query("SELECT * FROM follow_ups WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!existing) return res.status(404).json({ success: false, message: "Follow-up not found" });
    if (existing.status !== "PENDING") {
      return res.status(400).json({ success: false, message: "Only a pending follow-up can be snoozed." });
    }

    const dueAt = new Date(Date.now() + minutes * 60000);
    await pool.query(
      "UPDATE follow_ups SET due_at = ?, alerted_at = NULL, snooze_count = snooze_count + 1 WHERE id = ? AND agency_id = ?",
      [dueAt, req.params.id, agencyId]
    );
    emitToAgency(agencyId, "follow_up_updated", { followUpId: Number(req.params.id), contactId: existing.contact_id, conversationId: existing.conversation_id, snoozed: true });
    return res.json({ success: true, dueAt: dueAt.toISOString(), snoozeCount: existing.snooze_count + 1 });
  } catch (err) {
    console.error("POST /follow-ups/:id/snooze error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CHANGE STATUS (Completed / Cancelled / back to Pending) ────────────────
router.patch("/follow-ups/:id/status", async (req, res) => {
  try {
    const agencyId = req.tenant.agencyId;
    const { status } = req.body;
    if (!["PENDING", "COMPLETED", "CANCELLED"].includes(status)) {
      return res.status(400).json({ success: false, message: "status must be PENDING, COMPLETED or CANCELLED" });
    }
    const [[existing]] = await pool.query("SELECT * FROM follow_ups WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!existing) return res.status(404).json({ success: false, message: "Follow-up not found" });

    // Reopening one that is already past due must not fire an alert the instant it is reopened.
    const alertedAt = status === "PENDING" ? (new Date(existing.due_at) <= new Date() ? new Date() : null) : existing.alerted_at;
    await pool.query(
      "UPDATE follow_ups SET status = ?, completed_at = ?, alerted_at = ? WHERE id = ? AND agency_id = ?",
      [status, status === "COMPLETED" ? new Date() : null, alertedAt, req.params.id, agencyId]
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
    const agencyId = req.tenant.agencyId;
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
