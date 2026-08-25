import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("AGENCY", "ADMIN", "AGENT"));

// ─── LIST CONTACTS ────────────────────────────────────────────────────────────
router.get("/contacts", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { search, platform, limit = 50, page = 1 } = req.query;
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

// ─── EXPORT CONTACTS AS CSV ───────────────────────────────────────────────────
router.get("/contacts/export/csv", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { platform } = req.query;

    let query = "SELECT name, platform, external_id, phone, email, created_at FROM contacts WHERE agency_id = ?";
    const params = [agencyId];

    if (platform) {
      query += " AND platform = ?";
      params.push(platform);
    }

    query += " ORDER BY created_at DESC";

    const [contacts] = await pool.query(query, params);

    // Build CSV string
    const headers = ["Name", "Platform", "External ID", "Phone", "Email", "Created At"];
    const rows = contacts.map(c => [
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${c.platform || ''}"`,
      `"${c.external_id || ''}"`,
      `"${(c.phone || '').replace(/"/g, '""')}"`,
      `"${(c.email || '').replace(/"/g, '""')}"`,
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
      "SELECT id FROM contacts WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );

    if (!existing.length) {
      return res.status(404).json({ success: false, message: "Contact not found" });
    }

    await pool.query(
      `UPDATE contacts SET name = ?, phone = ?, email = ?, avatar = ? WHERE id = ? AND agency_id = ?`,
      [name, phone || null, email || null, avatar || null, req.params.id, agencyId]
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

export default router;
