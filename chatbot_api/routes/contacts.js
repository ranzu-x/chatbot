import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { assertLimit } from "../utils/entitlements.js";
import { buildSearch } from "../utils/searchQuery.js";
import { emitToAgency } from "../utils/socket.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

// ─── SUBSCRIBER STATS (for the page's stat cards) ─────────────────────────────
// Real counts, not the placeholder percentages the page used to compute
// client-side (e.g. `Math.round(total * 0.94)` for "retained"). Scoped by the
// same platform filter the page is currently showing, so "Total" always
// matches what's actually in the table.
router.get("/contacts/stats", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { platform } = req.query;
    const platformClause = platform ? " AND platform = ?" : "";
    const platformParams = platform ? [platform] : [];

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM contacts WHERE agency_id = ?${platformClause}`,
      [agencyId, ...platformParams]
    );
    const [[{ retained }]] = await pool.query(
      `SELECT COUNT(*) as retained FROM contacts c WHERE c.agency_id = ?${platformClause} AND EXISTS (
         SELECT 1 FROM conversations cv JOIN messages m ON m.conversation_id = cv.id
         WHERE cv.contact_id = c.id AND m.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       )`,
      [agencyId, ...platformParams]
    );
    const [[{ unsubscribed }]] = await pool.query(
      `SELECT COUNT(*) as unsubscribed FROM contacts WHERE agency_id = ?${platformClause} AND subscription_status = 'UNSUBSCRIBED'`,
      [agencyId, ...platformParams]
    );
    const [[{ inSequence }]] = await pool.query(
      `SELECT COUNT(DISTINCT ss.contact_id) as inSequence FROM sequence_subscribers ss
       JOIN sequences s ON s.id = ss.sequence_id
       JOIN contacts c ON c.id = ss.contact_id
       WHERE s.agency_id = ? AND ss.status = 'ACTIVE'${platform ? " AND c.platform = ?" : ""}`,
      [agencyId, ...platformParams]
    );

    return res.json({ success: true, stats: { total, retained, unsubscribed, inSequence } });
  } catch (err) {
    console.error("Contact stats error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── LIST CONTACTS ────────────────────────────────────────────────────────────
router.get("/contacts", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { search, platform, labelId, listId, integrationId, status, retained, limit = 50, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // RETAINED = had any message activity in the last 30 days — the same
    // "engaged audience" definition the page's stat cards use. Computed, not
    // stored, so it's never stale.
    const retainedExpr = `EXISTS (
      SELECT 1 FROM conversations cv JOIN messages m ON m.conversation_id = cv.id
      WHERE cv.contact_id = c.id AND m.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    )`;

    // WHERE clause built once and reused for both the count and the page
    // query — the count only needs `c`, so it skips the per-row correlated
    // subqueries (conversationCount/lastActivity/accountLabel) entirely
    // rather than computing them just to throw them away, which matters once
    // an agency has a large subscriber table.
    let where = " WHERE c.agency_id = ?";
    const params = [agencyId];

    if (platform) {
      where += " AND c.platform = ?";
      params.push(platform);
    }
    if (labelId) {
      where += " AND c.id IN (SELECT contact_id FROM contact_labels WHERE label_id = ?)";
      params.push(labelId);
    }
    if (listId) {
      where += " AND c.id IN (SELECT contact_id FROM contact_list_members WHERE list_id = ?)";
      params.push(listId);
    }
    if (integrationId) {
      where += " AND EXISTS (SELECT 1 FROM conversations cv3 WHERE cv3.contact_id = c.id AND cv3.integration_id = ?)";
      params.push(integrationId);
    }
    if (status === "SUBSCRIBED" || status === "UNSUBSCRIBED") {
      where += " AND c.subscription_status = ?";
      params.push(status);
    }
    if (retained === "RETAINED") {
      where += ` AND ${retainedExpr}`;
    } else if (retained === "NOT_RETAINED") {
      where += ` AND NOT ${retainedExpr}`;
    }
    // Ranked, multi-word search (see utils/searchQuery.js) — matches on any
    // combination of name/email/phone/external id and orders best-match first
    // rather than by last-updated.
    const searchClause = await buildSearch({
      term: search,
      fulltext: [{ table: "contacts", columns: ["name", "email"], expr: "c.name, c.email", weight: 4 }],
      like: ["c.name", "c.phone", "c.email", "c.external_id"],
      boost: { expr: "c.name" },
    });
    if (searchClause.active) {
      where += ` AND ${searchClause.where}`;
      params.push(...searchClause.whereParams);
    }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM contacts c${where}`, params);

    const query = `
      SELECT c.*,
             (SELECT COUNT(*) FROM conversations WHERE contact_id = c.id) as conversationCount,
             (SELECT MAX(created_at) FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE contact_id = c.id)) as lastActivity,
             (SELECT i.wa_display_phone FROM conversations cv2 JOIN integrations i ON i.id = cv2.integration_id
              WHERE cv2.contact_id = c.id ORDER BY cv2.last_message_at DESC LIMIT 1) as accountLabel,
             ${retainedExpr} as retained
             ${searchClause.active ? `, ${searchClause.relevance} AS _relevance` : ""}
      FROM contacts c${where}
      ORDER BY ${searchClause.active ? "_relevance DESC, " : ""}c.updated_at DESC LIMIT ? OFFSET ?`;
    const pageParams = searchClause.active
      ? [...searchClause.relevanceParams, ...params, parseInt(limit), parseInt(offset)]
      : [...params, parseInt(limit), parseInt(offset)];

    const [contacts] = await pool.query(query, pageParams);
    for (const c of contacts) c.retained = !!c.retained;

    // Fetch and attach structured labels for all contacts
    if (contacts.length > 0) {
      const contactIds = contacts.map((c) => c.id);
      const [labelRows] = await pool.query(
        `SELECT cl.contact_id, l.id as label_id, l.name, l.color
         FROM contact_labels cl
         JOIN labels l ON l.id = cl.label_id
         WHERE cl.contact_id IN (?)
         ORDER BY l.name ASC`,
        [contactIds]
      );
      const labelsMap = {};
      for (const row of labelRows) {
        if (!labelsMap[row.contact_id]) labelsMap[row.contact_id] = [];
        labelsMap[row.contact_id].push({
          id: row.label_id,
          name: row.name,
          color: row.color,
        });
      }
      for (const c of contacts) {
        c.labels = labelsMap[c.id] || [];
      }
    }

    return res.json({
      success: true,
      contacts,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)) || 1,
      },
    });
  } catch (err) {
    console.error("List contacts error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── FAST SUBSCRIBER SEARCH (name / phone) ───────────────────────────────────
// Designed for very large per-agency subscriber counts — see
// migrate_inbox_extensions.js's FULLTEXT(name) + (agency_id, phone) indexes.
// Deliberately NOT the same as the Live Inbox conversation list's client-side
// text filter: this searches EVERY subscriber the agency has, including ones
// with no open conversation yet, and returns only the minimal fields a
// search-result row needs (never the full contact record).
router.get("/contacts/search", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const q = (req.query.q || "").trim();
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit) || 10));
    if (!q) return res.json({ success: true, contacts: [] });

    // Phone search: prefix/substring match on the indexed (agency_id, phone)
    // column — cheap even at scale since it's a plain equality-prefixed range
    // scan, not a leading-wildcard LIKE across the whole table.
    const isPhoneLike = /^[+\d][\d\s-]*$/.test(q);

    // Most-recent conversation id per matched contact (if any) so a search
    // result can jump straight into the Live Inbox thread — a cheap
    // correlated subquery since it only ever runs over the already-limited
    // result set (<=20 rows), never over the whole contacts table.
    const convSubquery = `(SELECT cv.id FROM conversations cv WHERE cv.contact_id = c.id ORDER BY cv.last_message_at DESC LIMIT 1) AS conversationId`;

    let rows;
    if (isPhoneLike) {
      [rows] = await pool.query(
        `SELECT c.id, c.name, c.phone, c.avatar, c.platform, ${convSubquery} FROM contacts c
         WHERE c.agency_id = ? AND c.phone LIKE ?
         ORDER BY c.name ASC LIMIT ?`,
        [agencyId, `${q}%`, limit]
      );
    } else {
      // Ranked match across name + email. Previously this was a single
      // NATURAL LANGUAGE match with no ordering, so results came back in
      // whatever order the index produced and a two-word query ("john dhaka")
      // matched rows containing either word.
      const searchClause = await buildSearch({
        term: q,
        fulltext: [{ table: "contacts", columns: ["name", "email"], expr: "c.name, c.email", weight: 4 }],
        like: ["c.name", "c.email"],
        boost: { expr: "c.name" },
      });
      if (searchClause.active) {
        [rows] = await pool.query(
          `SELECT c.id, c.name, c.phone, c.avatar, c.platform, ${convSubquery},
                  ${searchClause.relevance} AS _relevance
             FROM contacts c
            WHERE c.agency_id = ? AND ${searchClause.where}
            ORDER BY _relevance DESC, c.name ASC LIMIT ?`,
          [...searchClause.relevanceParams, agencyId, ...searchClause.whereParams, limit]
        );
      }
    }

    return res.json({ success: true, contacts: rows || [] });
  } catch (err) {
    console.error("GET /contacts/search error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── EXPORT CONTACTS AS CSV ───────────────────────────────────────────────────
router.get("/contacts/export/csv", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { platform, labelId, listId, status } = req.query;

    let query = `
      SELECT c.id, c.name, c.platform, c.external_id, c.phone, c.email, c.created_at, c.subscription_status,
             (SELECT GROUP_CONCAT(l.name SEPARATOR '; ')
              FROM contact_labels cl
              JOIN labels l ON l.id = cl.label_id
              WHERE cl.contact_id = c.id) as labelNames
      FROM contacts c
      WHERE c.agency_id = ?
    `;
    const params = [agencyId];

    if (platform) {
      query += " AND c.platform = ?";
      params.push(platform);
    }

    if (labelId) {
      query += " AND c.id IN (SELECT contact_id FROM contact_labels WHERE label_id = ?)";
      params.push(labelId);
    }

    if (listId) {
      query += " AND c.id IN (SELECT contact_id FROM contact_list_members WHERE list_id = ?)";
      params.push(listId);
    }

    if (status === "SUBSCRIBED" || status === "UNSUBSCRIBED") {
      query += " AND c.subscription_status = ?";
      params.push(status);
    }

    query += " ORDER BY c.created_at DESC";

    const [contacts] = await pool.query(query, params);

    // Build CSV string
    const headers = ["Name", "Platform", "External ID", "Phone", "Email", "Status", "Labels", "Created At"];
    const rows = contacts.map(c => [
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${c.platform || ''}"`,
      `"${c.external_id || ''}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`,
      `"${(c.email || '').replace(/"/g, '""')}"`,
      `"${c.subscription_status || 'SUBSCRIBED'}"`,
      `"${(c.labelNames || '').replace(/"/g, '""')}"`,
      `"${c.created_at ? new Date(c.created_at).toISOString() : ''}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=contacts_${new Date().toISOString().slice(0,10)}.csv`);
    return res.send(csvContent);
  } catch (err) {
    console.error("Export contacts error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET SINGLE CONTACT ───────────────────────────────────────────────────────
router.get("/contacts/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query(
      "SELECT * FROM contacts WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Contact not found" });
    }

    const contact = rows[0];

    // Fetch associated conversations
    const [conversations] = await pool.query(
      `SELECT cv.*, i.name as integrationName,
              (SELECT body FROM messages WHERE conversation_id = cv.id ORDER BY created_at DESC LIMIT 1) as lastMessageBody
       FROM conversations cv
       LEFT JOIN integrations i ON i.id = cv.integration_id
       WHERE cv.contact_id = ? AND cv.agency_id = ?
       ORDER BY cv.updated_at DESC`,
      [contact.id, agencyId]
    );

    return res.json({ success: true, contact, conversations });
  } catch (err) {
    console.error("Get contact error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── FORM RESPONSES (completed User Input Flow submissions) ──────────────────
// Surfaced in the Inbox's right-side subscriber panel — a subscriber's full
// answer set from each completed Q&A run, not just whichever individual
// answers happened to also be mapped to a Custom Field.
router.get("/contacts/:id/form-responses", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [[owned]] = await pool.query(
      "SELECT id FROM contacts WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );
    if (!owned) return res.status(404).json({ success: false, message: "Contact not found" });

    const [rows] = await pool.query(
      `SELECT r.id, r.user_input_flow_id, r.answers, r.created_at, u.name AS user_input_flow_name
       FROM user_input_flow_responses r
       JOIN user_input_flows u ON u.id = r.user_input_flow_id
       WHERE r.contact_id = ? AND r.agency_id = ?
       ORDER BY r.created_at DESC`,
      [req.params.id, agencyId]
    );
    return res.json({ success: true, responses: rows });
  } catch (err) {
    console.error("Get form responses error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/contacts/:id/sequences", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [[owned]] = await pool.query(
      "SELECT id FROM contacts WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );
    if (!owned) return res.status(404).json({ success: false, message: "Contact not found" });

    const [rows] = await pool.query(
      `SELECT ss.id, ss.status, ss.current_node_id, ss.next_run_at, ss.subscribed_at,
              s.id AS sequence_id, s.name AS sequence_name, s.platform
       FROM sequence_subscribers ss
       JOIN sequences s ON s.id = ss.sequence_id
       WHERE ss.contact_id = ? AND s.agency_id = ?
       ORDER BY ss.subscribed_at DESC`,
      [req.params.id, agencyId]
    );
    return res.json({ success: true, sequences: rows });
  } catch (err) {
    console.error("Get contact sequences error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE CONTACT ───────────────────────────────────────────────────────────
router.post("/contacts", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { name, platform = "WHATSAPP", externalId, phone, email } = req.body;

    if (!name || !externalId) {
      return res.status(400).json({ success: false, message: "Name and external ID (or phone) are required" });
    }

    // Check duplicate
    const [existing] = await pool.query(
      "SELECT id FROM contacts WHERE agency_id = ? AND platform = ? AND external_id = ?",
      [agencyId, platform, externalId]
    );

    if (existing.length) {
      return res.status(400).json({ success: false, message: "Contact with this platform ID already exists" });
    }

    // max_subscribers was previously defined in every package but never
    // actually enforced anywhere — closing that gap here (also covers the
    // reseller shared-usage-pool tier via utils/entitlements.js's assertLimit).
    if (req.user.role !== "ADMIN") {
      try {
        await assertLimit(agencyId, "max_subscribers", 1, req.user.id);
      } catch (limitErr) {
        return res.status(limitErr.status || 403).json({ success: false, message: limitErr.message || "Subscriber limit reached for your current plan.", code: limitErr.code || "LIMIT_EXCEEDED" });
      }
    }

    const [result] = await pool.query(
      `INSERT INTO contacts (agency_id, platform, external_id, name, phone, email, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [agencyId, platform, externalId, name, phone || null, email || null]
    );

    const [newContact] = await pool.query("SELECT * FROM contacts WHERE id = ?", [result.insertId]);

    return res.status(201).json({ success: true, message: "Contact created", contact: newContact[0] });
  } catch (err) {
    console.error("Create contact error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── UPDATE CONTACT ───────────────────────────────────────────────────────────
router.put("/contacts/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { name, phone, email, avatar } = req.body;

    const [existing] = await pool.query(
      "SELECT * FROM contacts WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );

    if (!existing.length) {
      return res.status(404).json({ success: false, message: "Contact not found" });
    }

    const current = existing[0];
    const newName = name !== undefined ? name : current.name;
    const newPhone = phone !== undefined ? phone : current.phone;
    const newEmail = email !== undefined ? email : current.email;
    const newAvatar = avatar !== undefined ? avatar : current.avatar;

    await pool.query(
      `UPDATE contacts SET name = ?, phone = ?, email = ?, avatar = ? WHERE id = ? AND agency_id = ?`,
      [newName, newPhone, newEmail, newAvatar, req.params.id, agencyId]
    );

    const [updated] = await pool.query("SELECT * FROM contacts WHERE id = ?", [req.params.id]);

    return res.json({ success: true, message: "Contact updated", contact: updated[0] });
  } catch (err) {
    console.error("Update contact error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── SUBSCRIPTION STATUS (opt-in / opt-out) ───────────────────────────────────
// The one real "is this person still reachable" flag — nothing previously
// recorded it, so broadcasts/sequences had no way to skip someone who'd
// opted out. Toggled from the subscriber row or the detail drawer.
router.patch("/contacts/:id/subscription", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { status } = req.body;
    if (status !== "SUBSCRIBED" && status !== "UNSUBSCRIBED") {
      return res.status(400).json({ success: false, message: "status must be SUBSCRIBED or UNSUBSCRIBED" });
    }
    const [result] = await pool.query(
      "UPDATE contacts SET subscription_status = ? WHERE id = ? AND agency_id = ?",
      [status, req.params.id, agencyId]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Contact not found" });
    return res.json({ success: true, subscriptionStatus: status });
  } catch (err) {
    console.error("Update subscription status error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── BLOCK / UNBLOCK A SUBSCRIBER ──────────────────────────────────────────────
// Distinct from subscription_status above: unsubscribing opts a contact out
// of proactive broadcasts/sequences but they can still message in normally.
// Blocking is a moderation action — their inbound messages are dropped
// entirely before any conversation/bot/AI processing runs (see
// routes/webhook.js's handleIncomingPayload and routes/webchat.js's
// POST /webchat/message). "A way to reopen" is just /unblock, below.
router.patch("/contacts/:id/block", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { reason } = req.body || {};
    const [result] = await pool.query(
      "UPDATE contacts SET is_blocked = 1, blocked_at = NOW(), blocked_reason = ?, blocked_by = ? WHERE id = ? AND agency_id = ?",
      [reason?.trim() || null, req.user.id, req.params.id, agencyId]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Contact not found" });
    emitToAgency(agencyId, "contact_updated", { contactId: Number(req.params.id), isBlocked: true });
    return res.json({ success: true, isBlocked: true });
  } catch (err) {
    console.error("Block contact error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.patch("/contacts/:id/unblock", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [result] = await pool.query(
      "UPDATE contacts SET is_blocked = 0, blocked_at = NULL, blocked_reason = NULL, blocked_by = NULL WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Contact not found" });
    emitToAgency(agencyId, "contact_updated", { contactId: Number(req.params.id), isBlocked: false });
    return res.json({ success: true, isBlocked: false });
  } catch (err) {
    console.error("Unblock contact error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/** Deletes one contact's conversations (and, via ON DELETE CASCADE, their
 * messages) plus its contact_labels rows (contact_labels has no FK, so
 * nothing cascades it automatically) before removing the contact itself.
 * Every other dependent table (contact_notes, contact_custom_field_values,
 * sequence_subscribers, contact_list_members, broadcast/campaign logs,
 * whatsapp_calls*) is already ON DELETE CASCADE; appointments.contact_id is
 * ON DELETE SET NULL. Runs on one connection so a failure partway through
 * rolls back instead of leaving a contact half-deleted. */
export async function deleteContactCascade(conn, contactId, agencyId) {
  await conn.query("DELETE FROM conversations WHERE contact_id = ? AND agency_id = ?", [contactId, agencyId]);
  await conn.query("DELETE FROM contact_labels WHERE contact_id = ?", [contactId]);
  const [result] = await conn.query("DELETE FROM contacts WHERE id = ? AND agency_id = ?", [contactId, agencyId]);
  return result.affectedRows > 0;
}

// ─── DELETE CONTACT ───────────────────────────────────────────────────────────
router.delete("/contacts/:id", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const deleted = await deleteContactCascade(conn, req.params.id, req.user.agencyId);
    if (!deleted) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: "Contact not found" });
    }
    await conn.commit();
    emitToAgency(req.user.agencyId, "contact_deleted", { contactId: Number(req.params.id) });
    return res.json({ success: true, message: "Subscriber deleted" });
  } catch (err) {
    await conn.rollback();
    console.error("Delete contact error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
});

// ─── BULK DELETE CONTACTS ─────────────────────────────────────────────────────
router.post("/contacts/bulk-delete", async (req, res) => {
  const { contactIds } = req.body;
  if (!Array.isArray(contactIds) || contactIds.length === 0) {
    return res.status(400).json({ success: false, message: "contactIds array is required" });
  }
  const agencyId = req.user.agencyId;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let deletedCount = 0;
    const deletedIds = [];
    for (const id of contactIds) {
      if (await deleteContactCascade(conn, id, agencyId)) { deletedCount++; deletedIds.push(Number(id)); }
    }
    await conn.commit();
    if (deletedIds.length) emitToAgency(agencyId, "contacts_bulk_deleted", { contactIds: deletedIds });
    return res.json({ success: true, message: `Deleted ${deletedCount} subscriber(s)`, deletedCount });
  } catch (err) {
    await conn.rollback();
    console.error("Bulk delete contacts error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
});

// ─── BULK ENROLL CONTACTS INTO A SEQUENCE ─────────────────────────────────────
router.post("/contacts/bulk-sequence", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { contactIds, sequenceId } = req.body;
    if (!Array.isArray(contactIds) || contactIds.length === 0 || !sequenceId) {
      return res.status(400).json({ success: false, message: "contactIds array and sequenceId are required" });
    }

    const [[sequence]] = await pool.query("SELECT id, platform FROM sequences WHERE id = ? AND agency_id = ?", [sequenceId, agencyId]);
    if (!sequence) return res.status(404).json({ success: false, message: "Sequence not found" });

    const { enrollContactsInSequence } = await import("./sequences.js");
    const [contacts] = await pool.query("SELECT id, platform FROM contacts WHERE id IN (?) AND agency_id = ?", [contactIds, agencyId]);

    let enrolled = 0;
    let skippedWrongPlatform = 0;
    for (const c of contacts) {
      // A sequence's node canvas is built for one specific channel — enrolling
      // a contact from a different platform would try to send that channel's
      // buttons/lists to a contact who can't receive them, so it's skipped
      // rather than silently mismatched (same rule the create-sequence UI
      // already states: "it can only enroll contacts on that same channel").
      if (c.platform !== sequence.platform) { skippedWrongPlatform++; continue; }
      const result = await enrollContactsInSequence(sequenceId, agencyId, { contactId: c.id, enrolledVia: "BULK_ACTION" });
      enrolled += result.enrolled || 0;
    }

    return res.json({
      success: true,
      message: `Enrolled ${enrolled} subscriber(s)${skippedWrongPlatform ? `, skipped ${skippedWrongPlatform} on a different channel` : ""}`,
      enrolled,
      skippedWrongPlatform,
    });
  } catch (err) {
    console.error("Bulk sequence enroll error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── IMPORT CONTACTS (WhatsApp phone numbers / Telegram chat IDs) ────────────
// Deliberately restricted to WhatsApp and Telegram — the only two channels
// where a "cold" identifier (a phone number a business already has consent
// for, or a Telegram chat_id from a subscriber who has already started a
// chat elsewhere) is enough to message someone. Facebook Messenger and
// Instagram only ever hand out a PSID/IGSID once a user messages the Page
// first (Meta Messenger Platform policy — no way to mint one from an
// imported identifier), and Webchat contacts only exist for the lifetime of
// an actual widget session, so neither can be "pre-created" here.
router.post("/contacts/import", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { platform, rows } = req.body;

    if (platform !== "WHATSAPP" && platform !== "TELEGRAM") {
      return res.status(400).json({ success: false, message: "Import is only available for WhatsApp and Telegram." });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: "No rows to import" });
    }
    if (rows.length > 5000) {
      return res.status(400).json({ success: false, message: "Import is limited to 5000 rows at a time — split the file and try again." });
    }

    let created = 0, updated = 0, skipped = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const externalId = (platform === "WHATSAPP" ? row.phone : row.chatId || row.externalId || "")?.toString().trim();
      const name = (row.name || "").toString().trim() || externalId;
      const phone = platform === "WHATSAPP" ? externalId : (row.phone || "").toString().trim() || null;
      const email = (row.email || "").toString().trim() || null;

      if (!externalId) {
        skipped++;
        errors.push({ row: i + 2, reason: platform === "WHATSAPP" ? "Missing phone number" : "Missing Telegram Chat ID" });
        continue;
      }

      const [existing] = await pool.query(
        "SELECT id FROM contacts WHERE agency_id = ? AND platform = ? AND external_id = ?",
        [agencyId, platform, externalId]
      );

      if (existing.length) {
        await pool.query(
          "UPDATE contacts SET name = COALESCE(NULLIF(?, ''), name), phone = COALESCE(?, phone), email = COALESCE(?, email) WHERE id = ?",
          [name, phone, email, existing[0].id]
        );
        updated++;
        continue;
      }

      if (req.user.role !== "ADMIN") {
        try {
          await assertLimit(agencyId, "max_subscribers", 1, req.user.id);
        } catch (limitErr) {
          errors.push({ row: i + 2, reason: limitErr.message || "Subscriber limit reached for your current plan." });
          skipped += rows.length - i; // stop here — every remaining row would hit the same limit
          break;
        }
      }

      await pool.query(
        `INSERT INTO contacts (agency_id, platform, external_id, name, phone, email, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [agencyId, platform, externalId, name, phone, email]
      );
      created++;
    }

    return res.json({ success: true, created, updated, skipped, errors: errors.slice(0, 20) });
  } catch (err) {
    console.error("Import contacts error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── TAGS MANAGEMENT ─────────────────────────────────────────────────────────
router.post("/contacts/:id/tags", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { tag } = req.body;
    if (!tag || !tag.trim()) return res.status(400).json({ success: false, message: "Tag is required" });

    const cleanTag = tag.trim();
    const [rows] = await pool.query("SELECT tags FROM contacts WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Contact not found" });

    let currentTags = [];
    try {
      currentTags = typeof rows[0].tags === "string" ? JSON.parse(rows[0].tags || "[]") : (rows[0].tags || []);
    } catch { currentTags = []; }

    if (!currentTags.includes(cleanTag)) {
      currentTags.push(cleanTag);
      await pool.query("UPDATE contacts SET tags = ? WHERE id = ? AND agency_id = ?", [JSON.stringify(currentTags), req.params.id, agencyId]);
    }

    return res.json({ success: true, tags: currentTags });
  } catch (err) {
    console.error("Add tag error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/contacts/:id/tags/:tag", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const tagToRemove = decodeURIComponent(req.params.tag).trim();

    const [rows] = await pool.query("SELECT tags FROM contacts WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Contact not found" });

    let currentTags = [];
    try {
      currentTags = typeof rows[0].tags === "string" ? JSON.parse(rows[0].tags || "[]") : (rows[0].tags || []);
    } catch { currentTags = []; }

    currentTags = currentTags.filter(t => t.toLowerCase() !== tagToRemove.toLowerCase());
    await pool.query("UPDATE contacts SET tags = ? WHERE id = ? AND agency_id = ?", [JSON.stringify(currentTags), req.params.id, agencyId]);

    return res.json({ success: true, tags: currentTags });
  } catch (err) {
    console.error("Remove tag error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── NOTES MANAGEMENT ────────────────────────────────────────────────────────
router.get("/contacts/:id/notes", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [notes] = await pool.query(
      `SELECT n.*, u.name as userName
       FROM contact_notes n
       LEFT JOIN users u ON u.id = n.user_id
       WHERE n.contact_id = ? AND n.agency_id = ?
       ORDER BY n.created_at DESC`,
      [req.params.id, agencyId]
    );
    return res.json({ success: true, notes });
  } catch (err) {
    console.error("Get notes error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/contacts/:id/notes", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { note } = req.body;
    if (!note || !note.trim()) return res.status(400).json({ success: false, message: "Note content is required" });

    const authorName = req.user.name || "Agent";
    const [result] = await pool.query(
      "INSERT INTO contact_notes (agency_id, contact_id, user_id, author_name, note) VALUES (?, ?, ?, ?, ?)",
      [agencyId, req.params.id, req.user.id || null, authorName, note.trim()]
    );

    const [created] = await pool.query("SELECT * FROM contact_notes WHERE id = ?", [result.insertId]);
    return res.status(201).json({ success: true, note: created[0] });
  } catch (err) {
    console.error("Add note error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/contacts/:id/notes/:noteId", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    await pool.query("DELETE FROM contact_notes WHERE id = ? AND contact_id = ? AND agency_id = ?", [req.params.noteId, req.params.id, agencyId]);
    return res.json({ success: true, message: "Note deleted" });
  } catch (err) {
    console.error("Delete note error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── TOGGLE BOT PAUSE ─────────────────────────────────────────────────────────
router.patch("/contacts/:id/toggle-bot", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query("SELECT bot_paused FROM contacts WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Contact not found" });

    const newPaused = rows[0].bot_paused ? 0 : 1;
    await pool.query("UPDATE contacts SET bot_paused = ? WHERE id = ? AND agency_id = ?", [newPaused, req.params.id, agencyId]);
    // Also update any open conversation for this contact
    await pool.query("UPDATE conversations SET bot_paused = ? WHERE contact_id = ? AND agency_id = ?", [newPaused, req.params.id, agencyId]);

    return res.json({ success: true, botPaused: newPaused === 1 });
  } catch (err) {
    console.error("Toggle bot error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── SYNC SUBSCRIBER AVATARS ──────────────────────────────────────────────
router.post("/contacts/sync-avatars", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { syncAllSubscribersAvatars } = await import("../utils/avatarFetcher.js");
    const result = await syncAllSubscribersAvatars(agencyId);
    return res.json({ success: true, updated: result.updatedCount });
  } catch (err) {
    console.error("Sync avatars error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
