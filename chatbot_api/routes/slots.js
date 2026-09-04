import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { requireModule } from "../utils/entitlements.js";
import { generateTimeSlots } from "../utils/slotGenerator.js";

const router = express.Router();

// ─── PUBLIC / CHATBOT CHANNEL: GET AVAILABLE SLOTS ───────────────────────────
// Accessible by WhatsApp bots, Webchat, flow nodes, and direct booking links
router.get("/slots/availability", async (req, res) => {
  try {
    const agencyId = req.query.agencyId || req.query.agency_id;
    const staffId = req.query.staffId || req.query.staff_id || null;
    const date = req.query.date; // YYYY-MM-DD

    if (!agencyId) {
      return res.status(400).json({ success: false, message: "agencyId is required" });
    }

    let query = `
      SELECT s.id, s.agency_id, s.staff_id, s.slot_date, s.start_time, s.end_time,
             s.slot_duration, s.max_capacity, s.booked_count,
             (s.max_capacity - s.booked_count) AS available_slots,
             u.name as staff_name
      FROM appointment_slots s
      LEFT JOIN users u ON u.id = s.staff_id
      WHERE s.agency_id = ?
        AND s.is_active = 1
        AND (s.max_capacity - s.booked_count) > 0
    `;
    const params = [agencyId];

    if (date) {
      query += " AND s.slot_date = ?";
      params.push(date);
    } else {
      query += " AND s.slot_date >= CURDATE()";
    }

    if (staffId) {
      query += " AND s.staff_id = ?";
      params.push(staffId);
    }

    query += " ORDER BY s.slot_date ASC, s.start_time ASC LIMIT 100";

    const [slots] = await pool.query(query, params);

    return res.json({ success: true, slots });
  } catch (err) {
    console.error("[GET SLOTS AVAILABILITY]", err);
    return res.status(500).json({ success: false, message: "Error fetching slot availability" });
  }
});

// ─── PROTECTED AGENCY ROUTES ──────────────────────────────────────────────────
router.use("/slots", authMiddleware, requireModule("feature_appointments"));

// GET /api/v1/slots - List all slots for the workspace
router.get("/slots", async (req, res) => {
  try {
    const agencyId = req.user?.agencyId || (req.user?.role === "ADMIN" && req.query.agencyId) || null;
    if (!agencyId && req.user?.role !== "ADMIN") {
      return res.status(403).json({ success: false, message: "No active workspace found" });
    }

    const { staffId, date, fromDate, toDate } = req.query;

    let query = `
      SELECT s.*, u.name AS staff_name, u.email AS staff_email,
             (s.max_capacity - s.booked_count) AS available_capacity
      FROM appointment_slots s
      LEFT JOIN users u ON u.id = s.staff_id
      WHERE 1=1
    `;
    const params = [];

    if (agencyId) {
      query += " AND s.agency_id = ?";
      params.push(agencyId);
    }

    if (staffId) {
      query += " AND s.staff_id = ?";
      params.push(staffId);
    }

    if (date) {
      query += " AND s.slot_date = ?";
      params.push(date);
    } else if (fromDate && toDate) {
      query += " AND s.slot_date BETWEEN ? AND ?";
      params.push(fromDate, toDate);
    }

    query += " ORDER BY s.slot_date DESC, s.start_time ASC";

    const [rows] = await pool.query(query, params);
    return res.json({ success: true, slots: rows });
  } catch (err) {
    console.error("[GET SLOTS]", err);
    return res.status(500).json({ success: false, message: "Failed to fetch slots" });
  }
});

// POST /api/v1/slots - Bulk generate slots for a day
router.post("/slots", async (req, res) => {
  try {
    const agencyId = req.user?.agencyId;
    if (!agencyId && req.user?.role !== "ADMIN") {
      return res.status(403).json({ success: false, message: "No active workspace found" });
    }

    const {
      staffId = null,
      slot_date,
      start_time,
      end_time,
      slot_duration = 30,
      max_capacity = 1,
      break_start = null,
      break_end = null,
      slot_type = "regular",
    } = req.body;

    if (!slot_date || !start_time || !end_time) {
      return res.status(400).json({ success: false, message: "Date, start time, and end time are required" });
    }

    // Generate times
    const generated = generateTimeSlots(start_time, end_time, parseInt(slot_duration) || 30, break_start, break_end);

    if (!generated.length) {
      return res.status(400).json({ success: false, message: "No slots could be generated with the given times" });
    }

    let inserted = 0;
    for (const s of generated) {
      // Check duplicate slot
      const [existing] = await pool.query(
        "SELECT id FROM appointment_slots WHERE agency_id = ? AND (staff_id <=> ?) AND slot_date = ? AND start_time = ? LIMIT 1",
        [agencyId, staffId, slot_date, s.start_time]
      );

      if (existing.length === 0) {
        await pool.query(
          `INSERT INTO appointment_slots (agency_id, staff_id, slot_date, start_time, end_time, slot_duration, max_capacity, slot_type)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [agencyId, staffId, slot_date, s.start_time, s.end_time, slot_duration, max_capacity, slot_type]
        );
        inserted++;
      }
    }

    return res.status(201).json({
      success: true,
      message: `Successfully generated ${inserted} slot(s) for ${slot_date}.`,
      count: inserted,
    });
  } catch (err) {
    console.error("[CREATE SLOTS]", err);
    return res.status(500).json({ success: false, message: "Failed to generate slots" });
  }
});

// DELETE /api/v1/slots/:id - Delete a single slot
router.delete("/slots/:id", async (req, res) => {
  try {
    const agencyId = req.user?.agencyId;
    const { id } = req.params;

    // Only delete if no active booked appointments
    const [booked] = await pool.query(
      "SELECT id FROM appointments WHERE slot_id = ? AND status NOT IN ('cancelled')",
      [id]
    );

    if (booked.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete this slot because it already has active bookings. Please cancel the bookings first.",
      });
    }

    let deleteQuery = "DELETE FROM appointment_slots WHERE id = ?";
    const params = [id];
    if (agencyId) {
      deleteQuery += " AND agency_id = ?";
      params.push(agencyId);
    }

    const [result] = await pool.query(deleteQuery, params);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Slot not found" });
    }

    return res.json({ success: true, message: "Slot deleted successfully" });
  } catch (err) {
    console.error("[DELETE SLOT]", err);
    return res.status(500).json({ success: false, message: "Failed to delete slot" });
  }
});

// PUT /api/v1/slots/:id/toggle - Activate/deactivate slot
router.put("/slots/:id/toggle", async (req, res) => {
  try {
    const agencyId = req.user?.agencyId;
    const { id } = req.params;

    let query = "UPDATE appointment_slots SET is_active = NOT is_active WHERE id = ?";
    const params = [id];
    if (agencyId) {
      query += " AND agency_id = ?";
      params.push(agencyId);
    }

    await pool.query(query, params);
    return res.json({ success: true, message: "Slot status toggled" });
  } catch (err) {
    console.error("[TOGGLE SLOT]", err);
    return res.status(500).json({ success: false, message: "Failed to toggle slot" });
  }
});

export default router;
