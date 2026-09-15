/**
 * Contact Lists — a group you built (an import batch, a hand-picked audience
 * for one campaign), deliberately separate from the Labels system (which
 * marks what a subscriber IS, e.g. "VIP"). Same many-to-many shape as
 * labels/contact_labels, mirrored route-for-route from routes/labels.js.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { emitToAgency } from "../utils/socket.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

// ─── LIST ALL CONTACT LISTS FOR AGENCY ───────────────────────────────────────
router.get("/contact-lists", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [lists] = await pool.query(
      `SELECT l.*, COUNT(m.contact_id) AS memberCount
       FROM contact_lists l
       LEFT JOIN contact_list_members m ON m.list_id = l.id
       WHERE l.agency_id = ?
       GROUP BY l.id
       ORDER BY l.name ASC`,
      [agencyId]
    );
    return res.json({ success: true, lists });
  } catch (err) {
    console.error("List contact lists error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE A LIST ────────────────────────────────────────────────────────────
router.post("/contact-lists", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { name, description = "" } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "List name is required" });
    }
    const cleanName = name.trim();

    const [existing] = await pool.query(
      "SELECT id FROM contact_lists WHERE agency_id = ? AND LOWER(name) = LOWER(?)",
      [agencyId, cleanName]
    );
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: "A list with this name already exists" });
    }

    const [result] = await pool.query(
      "INSERT INTO contact_lists (agency_id, name, description) VALUES (?, ?, ?)",
      [agencyId, cleanName, description?.trim() || null]
    );
    const [created] = await pool.query("SELECT * FROM contact_lists WHERE id = ?", [result.insertId]);
    return res.status(201).json({ success: true, message: "List created", list: { ...created[0], memberCount: 0 } });
  } catch (err) {
    console.error("Create contact list error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── UPDATE A LIST ────────────────────────────────────────────────────────────
router.put("/contact-lists/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { name, description } = req.body;

    const [[existing]] = await pool.query(
      "SELECT * FROM contact_lists WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );
    if (!existing) return res.status(404).json({ success: false, message: "List not found" });

    const newName = name !== undefined && name.trim() ? name.trim() : existing.name;
    if (newName.toLowerCase() !== existing.name.toLowerCase()) {
      const [dupe] = await pool.query(
        "SELECT id FROM contact_lists WHERE agency_id = ? AND LOWER(name) = LOWER(?) AND id != ?",
        [agencyId, newName, req.params.id]
      );
      if (dupe.length > 0) return res.status(400).json({ success: false, message: "Another list already has this name" });
    }

    await pool.query(
      "UPDATE contact_lists SET name = ?, description = ? WHERE id = ? AND agency_id = ?",
      [newName, description !== undefined ? (description?.trim() || null) : existing.description, req.params.id, agencyId]
    );

    const [[updated]] = await pool.query(
      `SELECT l.*, COUNT(m.contact_id) AS memberCount FROM contact_lists l
       LEFT JOIN contact_list_members m ON m.list_id = l.id WHERE l.id = ? GROUP BY l.id`,
      [req.params.id]
    );
    return res.json({ success: true, message: "List updated", list: updated });
  } catch (err) {
    console.error("Update contact list error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── DELETE A LIST ────────────────────────────────────────────────────────────
router.delete("/contact-lists/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [result] = await pool.query("DELETE FROM contact_lists WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "List not found" });
    // contact_list_members rows cascade via FK — nothing else to clean up.
    return res.json({ success: true, message: "List deleted" });
  } catch (err) {
    console.error("Delete contact list error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── BULK ADD CONTACTS TO A LIST ──────────────────────────────────────────────
router.post("/contacts/bulk-list-add", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { contactIds, listId } = req.body;
    if (!Array.isArray(contactIds) || contactIds.length === 0 || !listId) {
      return res.status(400).json({ success: false, message: "contactIds array and listId are required" });
    }

    const [[list]] = await pool.query("SELECT id FROM contact_lists WHERE id = ? AND agency_id = ?", [listId, agencyId]);
    if (!list) return res.status(404).json({ success: false, message: "List not found" });

    const [validContacts] = await pool.query("SELECT id FROM contacts WHERE id IN (?) AND agency_id = ?", [contactIds, agencyId]);
    for (const c of validContacts) {
      await pool.query("INSERT IGNORE INTO contact_list_members (list_id, contact_id) VALUES (?, ?)", [listId, c.id]);
    }

    emitToAgency(agencyId, "contacts_bulk_listed", { contactIds: validContacts.map((c) => c.id), listId: Number(listId) });
    return res.json({ success: true, message: `Added ${validContacts.length} subscriber(s) to the list`, updatedCount: validContacts.length });
  } catch (err) {
    console.error("Bulk list add error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── BULK REMOVE CONTACTS FROM A LIST ─────────────────────────────────────────
router.post("/contacts/bulk-list-remove", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { contactIds, listId } = req.body;
    if (!Array.isArray(contactIds) || contactIds.length === 0 || !listId) {
      return res.status(400).json({ success: false, message: "contactIds array and listId are required" });
    }

    const [[list]] = await pool.query("SELECT id FROM contact_lists WHERE id = ? AND agency_id = ?", [listId, agencyId]);
    if (!list) return res.status(404).json({ success: false, message: "List not found" });

    const [result] = await pool.query("DELETE FROM contact_list_members WHERE list_id = ? AND contact_id IN (?)", [listId, contactIds]);

    emitToAgency(agencyId, "contacts_bulk_listed", { contactIds, listId: Number(listId), removed: true });
    return res.json({ success: true, message: `Removed ${result.affectedRows} subscriber(s) from the list`, updatedCount: result.affectedRows });
  } catch (err) {
    console.error("Bulk list remove error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
