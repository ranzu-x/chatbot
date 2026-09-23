import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { requireModule } from "../utils/entitlements.js";

const router = express.Router();

router.use("/appointment-campaigns", authMiddleware, requireModule("feature_appointments"));

// ─── GET /appointment-campaigns ─────────────────────────────────────────────
router.get("/appointment-campaigns", async (req, res) => {
  try {
    const agencyId = req.user?.agencyId;
    const [rows] = await pool.query(
      `SELECT id, agency_id, name, description, greeting_message, service_ids, staff_id, is_active, created_at, updated_at
       FROM appointment_campaigns
       WHERE agency_id = ?
       ORDER BY name ASC`,
      [agencyId]
    );
    return res.json({ success: true, campaigns: rows });
  } catch (err) {
    console.error("[GET CAMPAIGNS ERROR]", err);
    return res.status(500).json({ success: false, message: "Failed to fetch campaigns" });
  }
});

// ─── POST /appointment-campaigns ─────────────────────────────────────────────
router.post("/appointment-campaigns", async (req, res) => {
  try {
    const agencyId = req.user?.agencyId;
    const { name, description, greeting_message, service_ids, staff_id, is_active } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: "Campaign name is required" });
    }
    const [result] = await pool.query(
      `INSERT INTO appointment_campaigns (agency_id, name, description, greeting_message, service_ids, staff_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        name.trim(),
        description?.trim() || null,
        greeting_message?.trim() || null,
        service_ids ? JSON.stringify(service_ids) : null,
        staff_id ? parseInt(staff_id) : null,
        is_active !== false ? 1 : 0,
      ]
    );
    const [[created]] = await pool.query("SELECT * FROM appointment_campaigns WHERE id = ?", [result.insertId]);
    return res.status(201).json({ success: true, campaign: created });
  } catch (err) {
    console.error("[CREATE CAMPAIGN ERROR]", err);
    return res.status(500).json({ success: false, message: "Failed to create campaign" });
  }
});

// ─── PUT /appointment-campaigns/:id ──────────────────────────────────────────
router.put("/appointment-campaigns/:id", async (req, res) => {
  try {
    const agencyId = req.user?.agencyId;
    const { id } = req.params;
    const { name, description, greeting_message, service_ids, staff_id, is_active } = req.body;
    const [[existing]] = await pool.query(
      "SELECT * FROM appointment_campaigns WHERE id = ? AND agency_id = ?",
      [id, agencyId]
    );
    if (!existing) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }
    await pool.query(
      `UPDATE appointment_campaigns SET name = ?, description = ?, greeting_message = ?, service_ids = ?, staff_id = ?, is_active = ?
       WHERE id = ? AND agency_id = ?`,
      [
        name?.trim() || existing.name,
        description?.trim() ?? existing.description,
        greeting_message?.trim() ?? existing.greeting_message,
        service_ids !== undefined ? JSON.stringify(service_ids) : existing.service_ids,
        staff_id !== undefined ? (staff_id ? parseInt(staff_id) : null) : existing.staff_id,
        is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active,
        id,
        agencyId,
      ]
    );
    const [[updated]] = await pool.query("SELECT * FROM appointment_campaigns WHERE id = ?", [id]);
    return res.json({ success: true, campaign: updated });
  } catch (err) {
    console.error("[UPDATE CAMPAIGN ERROR]", err);
    return res.status(500).json({ success: false, message: "Failed to update campaign" });
  }
});

// ─── DELETE /appointment-campaigns/:id ───────────────────────────────────────
router.delete("/appointment-campaigns/:id", async (req, res) => {
  try {
    const agencyId = req.user?.agencyId;
    const { id } = req.params;
    const [[existing]] = await pool.query(
      "SELECT id FROM appointment_campaigns WHERE id = ? AND agency_id = ?",
      [id, agencyId]
    );
    if (!existing) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }
    await pool.query("DELETE FROM appointment_campaigns WHERE id = ? AND agency_id = ?", [id, agencyId]);
    return res.json({ success: true, message: "Campaign deleted" });
  } catch (err) {
    console.error("[DELETE CAMPAIGN ERROR]", err);
    return res.status(500).json({ success: false, message: "Failed to delete campaign" });
  }
});

export default router;
