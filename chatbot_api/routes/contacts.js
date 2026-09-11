import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { assertLimit } from "../utils/entitlements.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

// ─── LIST CONTACTS ────────────────────────────────────────────────────────────
router.get("/contacts", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { search, platform, labelId, limit = 50, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT c.*, 
             (SELECT COUNT(*) FROM conversations WHERE contact_id = c.id) as conversationCount,
             (SELECT MAX(created_at) FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE contact_id = c.id)) as lastActivity
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

    if (search) {
      query += " AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.external_id LIKE ?)";
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    // Count total
    const countQuery = `SELECT COUNT(*) as total FROM (${query}) as sub`;
    const [[{ total }]] = await pool.query(countQuery, params);

    query += " ORDER BY c.updated_at DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const [contacts] = await pool.query(query, params);

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
      // Natural-language FULLTEXT match on name, falling back to a prefix
      // LIKE for very short queries (MySQL's FULLTEXT ignores words shorter
      // than its minimum word length, typically 3-4 chars, by default).
      if (q.length >= 3) {
        [rows] = await pool.query(
          `SELECT c.id, c.name, c.phone, c.avatar, c.platform, ${convSubquery} FROM contacts c
           WHERE c.agency_id = ? AND MATCH(c.name) AGAINST (? IN NATURAL LANGUAGE MODE)
           LIMIT ?`,
          [agencyId, q, limit]
        );
      }
      if (!rows || rows.length === 0) {
        [rows] = await pool.query(
          `SELECT c.id, c.name, c.phone, c.avatar, c.platform, ${convSubquery} FROM contacts c
           WHERE c.agency_id = ? AND c.name LIKE ?
           ORDER BY c.name ASC LIMIT ?`,
          [agencyId, `${q}%`, limit]
        );
      }
    }

    return res.json({ success: true, contacts: rows });
  } catch (err) {
    console.error("GET /contacts/search error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── EXPORT CONTACTS AS CSV ───────────────────────────────────────────────────
router.get("/contacts/export/csv", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { platform, labelId } = req.query;

    let query = `
      SELECT c.id, c.name, c.platform, c.external_id, c.phone, c.email, c.created_at,
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

    query += " ORDER BY c.created_at DESC";

    const [contacts] = await pool.query(query, params);

    // Build CSV string
    const headers = ["Name", "Platform", "External ID", "Phone", "Email", "Labels", "Created At"];
    const rows = contacts.map(c => [
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${c.platform || ''}"`,
      `"${c.external_id || ''}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`,
      `"${(c.email || '').replace(/"/g, '""')}"`,
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
