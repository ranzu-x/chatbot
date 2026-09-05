/**
 * Custom Fields — agency-defined subscriber data.
 *
 * Definitions are agency-scoped (managed once, e.g. from a Settings page or the
 * Inbox drawer itself); values are per-contact. Separate from the labels/tags
 * system and from the read-only flow-variable display already in the Inbox.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { emitToAgency } from "../utils/socket.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("AGENCY", "ADMIN", "AGENT"));

function slugify(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90) || "field";
}

// ─── LIST FIELD DEFINITIONS FOR THIS AGENCY ──────────────────────────────────
router.get("/custom-fields", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [fields] = await pool.query(
      `SELECT * FROM custom_field_definitions WHERE agency_id = ? AND is_active = 1 ORDER BY sort_order ASC, id ASC`,
      [agencyId]
    );
    for (const f of fields) {
      if (typeof f.options === "string") {
        try { f.options = JSON.parse(f.options); } catch { f.options = []; }
      }
    }
    return res.json({ success: true, fields });
  } catch (err) {
    console.error("List custom fields error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE A FIELD DEFINITION ────────────────────────────────────────────────
router.post("/custom-fields", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { name, fieldType = "TEXT", options = [] } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Field name is required" });
    }
    const validTypes = ["TEXT", "NUMBER", "DATE", "SELECT"];
    const type = validTypes.includes(fieldType) ? fieldType : "TEXT";
    const fieldKey = slugify(name);

    const [existing] = await pool.query(
      "SELECT id FROM custom_field_definitions WHERE agency_id = ? AND field_key = ?",
      [agencyId, fieldKey]
    );
    if (existing.length) {
      return res.status(400).json({ success: false, message: "A field with this name already exists" });
    }

    const [[{ maxSort }]] = await pool.query(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS maxSort FROM custom_field_definitions WHERE agency_id = ?",
      [agencyId]
    );

    const [result] = await pool.query(
      `INSERT INTO custom_field_definitions (agency_id, name, field_key, field_type, options, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [agencyId, name.trim(), fieldKey, type, type === "SELECT" ? JSON.stringify(options) : null, maxSort]
    );

    const [[field]] = await pool.query("SELECT * FROM custom_field_definitions WHERE id = ?", [result.insertId]);
    if (typeof field.options === "string") {
      try { field.options = JSON.parse(field.options); } catch { field.options = []; }
    }

    emitToAgency(agencyId, "custom_fields_updated", { reason: "created", field });
    return res.status(201).json({ success: true, message: "Custom field created", field });
  } catch (err) {
    console.error("Create custom field error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── UPDATE A FIELD DEFINITION ─────────────────────────────────────────────────
router.put("/custom-fields/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { name, options } = req.body;

    const [[existing]] = await pool.query(
      "SELECT * FROM custom_field_definitions WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );
    if (!existing) return res.status(404).json({ success: false, message: "Custom field not found" });

    const newName = name !== undefined && name.trim() ? name.trim() : existing.name;
    await pool.query(
      "UPDATE custom_field_definitions SET name = ?, options = ? WHERE id = ? AND agency_id = ?",
      [newName, options !== undefined ? JSON.stringify(options) : existing.options, req.params.id, agencyId]
    );

    const [[field]] = await pool.query("SELECT * FROM custom_field_definitions WHERE id = ?", [req.params.id]);
    if (typeof field.options === "string") {
      try { field.options = JSON.parse(field.options); } catch { field.options = []; }
    }
    emitToAgency(agencyId, "custom_fields_updated", { reason: "updated", field });
    return res.json({ success: true, message: "Custom field updated", field });
  } catch (err) {
    console.error("Update custom field error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── DELETE (DEACTIVATE) A FIELD DEFINITION ───────────────────────────────────
router.delete("/custom-fields/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [result] = await pool.query(
      "UPDATE custom_field_definitions SET is_active = 0 WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Custom field not found" });

    emitToAgency(agencyId, "custom_fields_updated", { reason: "deleted", fieldId: Number(req.params.id) });
    return res.json({ success: true, message: "Custom field removed" });
  } catch (err) {
    console.error("Delete custom field error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET A CONTACT'S CUSTOM FIELD VALUES (all definitions + values merged) ────
router.get("/contacts/:id/custom-fields", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const contactId = req.params.id;

    const [contact] = await pool.query("SELECT id FROM contacts WHERE id = ? AND agency_id = ?", [contactId, agencyId]);
    if (!contact.length) return res.status(404).json({ success: false, message: "Contact not found" });

    const [rows] = await pool.query(
      `SELECT d.id AS field_id, d.name, d.field_key, d.field_type, d.options, d.sort_order,
              v.value
       FROM custom_field_definitions d
       LEFT JOIN contact_custom_field_values v ON v.field_id = d.id AND v.contact_id = ?
       WHERE d.agency_id = ? AND d.is_active = 1
       ORDER BY d.sort_order ASC, d.id ASC`,
      [contactId, agencyId]
    );
    for (const r of rows) {
      if (typeof r.options === "string") {
        try { r.options = JSON.parse(r.options); } catch { r.options = []; }
      }
    }

    return res.json({ success: true, fields: rows });
  } catch (err) {
    console.error("Get contact custom fields error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── SET (UPSERT) ONE CUSTOM FIELD VALUE FOR A CONTACT ───────────────────────
router.put("/contacts/:id/custom-fields/:fieldId", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const contactId = req.params.id;
    const { fieldId } = req.params;
    const { value } = req.body;

    const [contact] = await pool.query("SELECT id FROM contacts WHERE id = ? AND agency_id = ?", [contactId, agencyId]);
    if (!contact.length) return res.status(404).json({ success: false, message: "Contact not found" });

    const [field] = await pool.query(
      "SELECT id FROM custom_field_definitions WHERE id = ? AND agency_id = ?",
      [fieldId, agencyId]
    );
    if (!field.length) return res.status(404).json({ success: false, message: "Custom field not found" });

    await pool.query(
      `INSERT INTO contact_custom_field_values (contact_id, field_id, value)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()`,
      [contactId, fieldId, value === undefined || value === null ? null : String(value)]
    );

    emitToAgency(agencyId, "contact_custom_field_updated", {
      contactId: Number(contactId), fieldId: Number(fieldId), value: value ?? null,
    });

    return res.json({ success: true, message: "Custom field value saved" });
  } catch (err) {
    console.error("Set contact custom field error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
