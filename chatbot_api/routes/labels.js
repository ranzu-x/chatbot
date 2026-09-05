import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { emitToAgency } from "../utils/socket.js";

const router = express.Router();
router.use(authMiddleware);

/**
 * Helper: Sync contact_labels back to contacts.tags JSON column
 */
async function syncContactTagsJson(contactId) {
  try {
    const [rows] = await pool.query(
      `SELECT l.name 
       FROM labels l
       JOIN contact_labels cl ON cl.label_id = l.id
       WHERE cl.contact_id = ?`,
      [contactId]
    );
    const tagNames = rows.map((r) => r.name);
    await pool.query("UPDATE contacts SET tags = ? WHERE id = ?", [
      JSON.stringify(tagNames),
      contactId,
    ]);
  } catch (err) {
    console.error("Failed to sync contact tags JSON:", err);
  }
}

// ─── 1. LIST ALL UNIFIED LABELS FOR AGENCY ──────────────────────────────────
router.get("/labels", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [labels] = await pool.query(
      `SELECT l.id, l.agency_id, l.name, l.color, l.created_at,
              COUNT(cl.contact_id) AS subscriberCount
       FROM labels l
       LEFT JOIN contact_labels cl ON cl.label_id = l.id
       WHERE l.agency_id = ?
       GROUP BY l.id
       ORDER BY l.name ASC`,
      [agencyId]
    );

    return res.json({ success: true, labels });
  } catch (err) {
    console.error("List labels error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── 2. CREATE A NEW UNIFIED LABEL ──────────────────────────────────────────
router.post("/labels", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { name, color = "#2563eb" } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Label name is required" });
    }

    const cleanName = name.trim();

    // Check duplicate
    const [existing] = await pool.query(
      "SELECT id FROM labels WHERE agency_id = ? AND LOWER(name) = LOWER(?)",
      [agencyId, cleanName]
    );
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: "A label with this name already exists" });
    }

    const [result] = await pool.query(
      "INSERT INTO labels (agency_id, name, color) VALUES (?, ?, ?)",
      [agencyId, cleanName, color]
    );

    const [newLabel] = await pool.query("SELECT * FROM labels WHERE id = ?", [result.insertId]);

    return res.status(201).json({
      success: true,
      message: "Label created",
      label: { ...newLabel[0], subscriberCount: 0 },
    });
  } catch (err) {
    console.error("Create label error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── 3. UPDATE AN EXISTING LABEL ────────────────────────────────────────────
router.put("/labels/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { id } = req.params;
    const { name, color } = req.body;

    const [existing] = await pool.query(
      "SELECT * FROM labels WHERE id = ? AND agency_id = ?",
      [id, agencyId]
    );
    if (!existing.length) {
      return res.status(404).json({ success: false, message: "Label not found" });
    }

    const newName = name !== undefined && name.trim() ? name.trim() : existing[0].name;
    const newColor = color !== undefined && color.trim() ? color.trim() : existing[0].color;

    // Check duplicate if renaming
    if (newName.toLowerCase() !== existing[0].name.toLowerCase()) {
      const [dupe] = await pool.query(
        "SELECT id FROM labels WHERE agency_id = ? AND LOWER(name) = LOWER(?) AND id != ?",
        [agencyId, newName, id]
      );
      if (dupe.length > 0) {
        return res.status(400).json({ success: false, message: "Another label already has this name" });
      }
    }

    await pool.query(
      "UPDATE labels SET name = ?, color = ? WHERE id = ? AND agency_id = ?",
      [newName, newColor, id, agencyId]
    );

    const [updated] = await pool.query(
      `SELECT l.id, l.agency_id, l.name, l.color, l.created_at,
              COUNT(cl.contact_id) AS subscriberCount
       FROM labels l
       LEFT JOIN contact_labels cl ON cl.label_id = l.id
       WHERE l.id = ?
       GROUP BY l.id`,
      [id]
    );

    return res.json({ success: true, message: "Label updated", label: updated[0] });
  } catch (err) {
    console.error("Update label error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── 4. DELETE A LABEL ──────────────────────────────────────────────────────
router.delete("/labels/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { id } = req.params;

    const [existing] = await pool.query(
      "SELECT * FROM labels WHERE id = ? AND agency_id = ?",
      [id, agencyId]
    );
    if (!existing.length) {
      return res.status(404).json({ success: false, message: "Label not found" });
    }

    // Detach from all contacts
    const [attachedContacts] = await pool.query(
      "SELECT contact_id FROM contact_labels WHERE label_id = ?",
      [id]
    );
    await pool.query("DELETE FROM contact_labels WHERE label_id = ?", [id]);
    await pool.query("DELETE FROM labels WHERE id = ? AND agency_id = ?", [id, agencyId]);

    // Resync tags JSON for affected contacts
    for (const c of attachedContacts) {
      syncContactTagsJson(c.contact_id);
    }

    emitToAgency(agencyId, "contacts_bulk_labeled", {
      contactIds: attachedContacts.map((c) => c.contact_id),
      labelId: Number(id),
      removed: true,
    });

    return res.json({ success: true, message: "Label deleted successfully" });
  } catch (err) {
    console.error("Delete label error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── 5. ATTACH LABEL TO CONTACT ─────────────────────────────────────────────
router.post("/contacts/:id/labels", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const contactId = req.params.id;
    const { labelId, name, color = "#2563eb" } = req.body;

    // Verify contact belongs to agency
    const [contacts] = await pool.query(
      "SELECT id FROM contacts WHERE id = ? AND agency_id = ?",
      [contactId, agencyId]
    );
    if (!contacts.length) {
      return res.status(404).json({ success: false, message: "Contact not found" });
    }

    let targetLabelId = labelId;

    // If labelId not provided but name is, find or create
    if (!targetLabelId && name && name.trim()) {
      const cleanName = name.trim();
      const [existing] = await pool.query(
        "SELECT id FROM labels WHERE agency_id = ? AND LOWER(name) = LOWER(?)",
        [agencyId, cleanName]
      );
      if (existing.length > 0) {
        targetLabelId = existing[0].id;
      } else {
        const [inserted] = await pool.query(
          "INSERT INTO labels (agency_id, name, color) VALUES (?, ?, ?)",
          [agencyId, cleanName, color]
        );
        targetLabelId = inserted.insertId;
      }
    }

    if (!targetLabelId) {
      return res.status(400).json({ success: false, message: "Label ID or name required" });
    }

    // Attach to contact
    await pool.query(
      "INSERT IGNORE INTO contact_labels (contact_id, label_id) VALUES (?, ?)",
      [contactId, targetLabelId]
    );

    await syncContactTagsJson(contactId);

    // Return updated labels for contact
    const [contactLabels] = await pool.query(
      `SELECT l.id, l.name, l.color
       FROM labels l
       JOIN contact_labels cl ON cl.label_id = l.id
       WHERE cl.contact_id = ?
       ORDER BY l.name ASC`,
      [contactId]
    );

    emitToAgency(agencyId, "contact_labels_updated", { contactId: Number(contactId), labels: contactLabels });
    return res.json({ success: true, message: "Label attached", labels: contactLabels });
  } catch (err) {
    console.error("Attach label error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── 6. DETACH LABEL FROM CONTACT ───────────────────────────────────────────
router.delete("/contacts/:id/labels/:labelId", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const contactId = req.params.id;
    const labelId = req.params.labelId;

    // Verify contact belongs to agency
    const [contacts] = await pool.query(
      "SELECT id FROM contacts WHERE id = ? AND agency_id = ?",
      [contactId, agencyId]
    );
    if (!contacts.length) {
      return res.status(404).json({ success: false, message: "Contact not found" });
    }

    await pool.query(
      "DELETE FROM contact_labels WHERE contact_id = ? AND label_id = ?",
      [contactId, labelId]
    );

    await syncContactTagsJson(contactId);

    // Return updated labels for contact
    const [contactLabels] = await pool.query(
      `SELECT l.id, l.name, l.color
       FROM labels l
       JOIN contact_labels cl ON cl.label_id = l.id
       WHERE cl.contact_id = ?
       ORDER BY l.name ASC`,
      [contactId]
    );

    emitToAgency(agencyId, "contact_labels_updated", { contactId: Number(contactId), labels: contactLabels });
    return res.json({ success: true, message: "Label removed", labels: contactLabels });
  } catch (err) {
    console.error("Detach label error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── 7. BULK ATTACH LABEL TO MULTIPLE CONTACTS ──────────────────────────────
router.post("/contacts/bulk-labels", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { contactIds, labelId } = req.body;

    if (!Array.isArray(contactIds) || contactIds.length === 0 || !labelId) {
      return res.status(400).json({ success: false, message: "contactIds array and labelId are required" });
    }

    // Verify label belongs to agency
    const [label] = await pool.query(
      "SELECT id FROM labels WHERE id = ? AND agency_id = ?",
      [labelId, agencyId]
    );
    if (!label.length) {
      return res.status(404).json({ success: false, message: "Label not found" });
    }

    // Attach to all valid contacts
    const [validContacts] = await pool.query(
      "SELECT id FROM contacts WHERE id IN (?) AND agency_id = ?",
      [contactIds, agencyId]
    );

    for (const c of validContacts) {
      await pool.query(
        "INSERT IGNORE INTO contact_labels (contact_id, label_id) VALUES (?, ?)",
        [c.id, labelId]
      );
      syncContactTagsJson(c.id);
    }

    emitToAgency(agencyId, "contacts_bulk_labeled", {
      contactIds: validContacts.map((c) => c.id),
      labelId: Number(labelId),
    });

    return res.json({
      success: true,
      message: `Label attached to ${validContacts.length} subscribers`,
      updatedCount: validContacts.length,
    });
  } catch (err) {
    console.error("Bulk label error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
