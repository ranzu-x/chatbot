import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { requireModule } from "../utils/entitlements.js";
import { generateTimeSlots } from "../utils/slotGenerator.js";
import { canUsePublicBooking } from "../utils/publicBooking.js";

const router = express.Router();

// ─── PUBLIC / CHATBOT CHANNEL: GET AVAILABLE DATES ───────────────────────────
// Used by bots and web booking widgets to show which days have open slots
router.get("/slots/availability/dates", async (req, res) => {
  try {
    const agencyId = req.query.agencyId || req.query.agency_id;
    const staffId = req.query.staffId || req.query.staff_id || null;
    const fromDate = req.query.fromDate || new Date().toISOString().split("T")[0];
    const daysAhead = Math.min(60, parseInt(req.query.daysAhead) || 30);

    if (!agencyId) {
      return res.status(400).json({ success: false, message: "agencyId is required" });
    }

    if (!canUsePublicBooking(req, agencyId)) {
      return res.status(404).json({ success: false, message: "Booking page not found" });
    }

    let query = `
      SELECT slot_date, COUNT(*) as total_slots,
             SUM(max_capacity - booked_count) as total_available_capacity,
             COUNT(CASE WHEN (max_capacity - booked_count) > 0 THEN 1 END) as available_slots_count
      FROM appointment_slots
      WHERE agency_id = ?
        AND is_active = 1
        AND slot_date >= ?
        AND slot_date <= DATE_ADD(?, INTERVAL ? DAY)
        AND (max_capacity - booked_count) > 0
    `;
    const params = [agencyId, fromDate, fromDate, daysAhead];

    if (staffId) {
      query += " AND staff_id = ?";
      params.push(staffId);
    }

    query += " GROUP BY slot_date ORDER BY slot_date ASC";

    const [rows] = await pool.query(query, params);

    return res.json({ success: true, dates: rows });
  } catch (err) {
    console.error("[GET AVAILABLE DATES ERROR]", err);
    return res.status(500).json({ success: false, message: "Error fetching available dates" });
  }
});

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

    if (!canUsePublicBooking(req, agencyId)) {
      return res.status(404).json({ success: false, message: "Booking page not found" });
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

    const { staffId, date, fromDate, toDate, status } = req.query;

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
    } else if (fromDate) {
      query += " AND s.slot_date >= ?";
      params.push(fromDate);
    }

    if (status === "active") {
      query += " AND s.is_active = 1";
    } else if (status === "inactive") {
      query += " AND s.is_active = 0";
    } else if (status === "available") {
      query += " AND s.is_active = 1 AND (s.max_capacity - s.booked_count) > 0";
    } else if (status === "full") {
      query += " AND s.booked_count >= s.max_capacity";
    }

    query += " ORDER BY s.slot_date DESC, s.start_time ASC LIMIT 500";

    const [rows] = await pool.query(query, params);
    return res.json({ success: true, slots: rows });
  } catch (err) {
    console.error("[GET SLOTS]", err);
    return res.status(500).json({ success: false, message: "Failed to fetch slots" });
  }
});

// POST /api/v1/slots - Generate slots for a single day OR date range with day-of-week filters
router.post("/slots", async (req, res) => {
  try {
    const agencyId = req.user?.agencyId;
    if (!agencyId && req.user?.role !== "ADMIN") {
      return res.status(403).json({ success: false, message: "No active workspace found" });
    }

    const {
      staffId = null,
      slot_date,           // For single date
      fromDate,            // For date range
      toDate,              // For date range
      daysOfWeek = [],     // Array of 0-6 (0=Sun, 1=Mon, ..., 6=Sat) or 1-7
      start_time,
      end_time,
      slot_duration = 30,
      max_capacity = 1,
      break_start = null,
      break_end = null,
      slot_type = "regular",
    } = req.body;

    if (!start_time || !end_time) {
      return res.status(400).json({ success: false, message: "Start time and end time are required" });
    }

    // Determine target dates
    const datesToProcess = [];
    if (fromDate && toDate) {
      const current = new Date(fromDate);
      const end = new Date(toDate);
      const allowedDays = Array.isArray(daysOfWeek) && daysOfWeek.length > 0
        ? daysOfWeek.map(d => parseInt(d))
        : null;

      while (current <= end) {
        const dayNum = current.getDay(); // 0 = Sun, 1 = Mon ...
        // Also support 1-7 format (where 7=Sun or 1=Mon)
        const match = !allowedDays || allowedDays.includes(dayNum) || allowedDays.includes(dayNum === 0 ? 7 : dayNum);
        if (match) {
          datesToProcess.push(current.toISOString().split("T")[0]);
        }
        current.setDate(current.getDate() + 1);
      }
    } else if (slot_date) {
      datesToProcess.push(slot_date);
    } else {
      return res.status(400).json({ success: false, message: "Either slot_date or fromDate and toDate range are required" });
    }

    if (datesToProcess.length === 0) {
      return res.status(400).json({ success: false, message: "No valid dates found in the specified range and days" });
    }

    // Generate times
    const generated = generateTimeSlots(start_time, end_time, parseInt(slot_duration) || 30, break_start, break_end);
    if (!generated.length) {
      return res.status(400).json({ success: false, message: "No time slots could be generated with the given times and interval" });
    }

    let inserted = 0;
    for (const targetDate of datesToProcess) {
      for (const s of generated) {
        // Check duplicate slot
        const [existing] = await pool.query(
          "SELECT id FROM appointment_slots WHERE agency_id = ? AND (staff_id <=> ?) AND slot_date = ? AND start_time = ? LIMIT 1",
          [agencyId, staffId || null, targetDate, s.start_time]
        );

        if (existing.length === 0) {
          await pool.query(
            `INSERT INTO appointment_slots (agency_id, staff_id, slot_date, start_time, end_time, slot_duration, max_capacity, slot_type)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [agencyId, staffId || null, targetDate, s.start_time, s.end_time, slot_duration, max_capacity, slot_type]
          );
          inserted++;
        }
      }
    }

    return res.status(201).json({
      success: true,
      message: `Successfully generated ${inserted} slot(s) across ${datesToProcess.length} date(s).`,
      count: inserted,
      datesProcessed: datesToProcess.length,
    });
  } catch (err) {
    console.error("[CREATE SLOTS]", err);
    return res.status(500).json({ success: false, message: "Failed to generate slots" });
  }
});

// PUT /api/v1/slots/:id - Edit an individual slot
router.put("/slots/:id", async (req, res) => {
  try {
    const agencyId = req.user?.agencyId;
    const { id } = req.params;
    const { start_time, end_time, max_capacity, staff_id, slot_date, is_active } = req.body;

    const [existing] = await pool.query(
      "SELECT id, booked_count FROM appointment_slots WHERE id = ? AND agency_id = ?",
      [id, agencyId]
    );

    if (!existing.length) {
      return res.status(404).json({ success: false, message: "Slot not found" });
    }

    const currentBooked = existing[0].booked_count;
    if (max_capacity !== undefined && parseInt(max_capacity) < currentBooked) {
      return res.status(400).json({
        success: false,
        message: `Cannot reduce capacity to ${max_capacity} because this slot already has ${currentBooked} confirmed bookings.`,
      });
    }

    const updates = [];
    const params = [];

    if (start_time !== undefined) { updates.push("start_time = ?"); params.push(start_time); }
    if (end_time !== undefined) { updates.push("end_time = ?"); params.push(end_time); }
    if (max_capacity !== undefined) { updates.push("max_capacity = ?"); params.push(parseInt(max_capacity)); }
    if (staff_id !== undefined) { updates.push("staff_id = ?"); params.push(staff_id || null); }
    if (slot_date !== undefined) { updates.push("slot_date = ?"); params.push(slot_date); }
    if (is_active !== undefined) { updates.push("is_active = ?"); params.push(is_active ? 1 : 0); }

    if (updates.length > 0) {
      params.push(id, agencyId);
      await pool.query(`UPDATE appointment_slots SET ${updates.join(", ")} WHERE id = ? AND agency_id = ?`, params);
    }

    return res.json({ success: true, message: "Slot updated successfully" });
  } catch (err) {
    console.error("[EDIT SLOT]", err);
    return res.status(500).json({ success: false, message: "Failed to update slot" });
  }
});

// POST /api/v1/slots/bulk-toggle - Toggle active status for multiple slots
router.post("/slots/bulk-toggle", async (req, res) => {
  try {
    const agencyId = req.user?.agencyId;
    const { ids, is_active } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "Array of slot ids is required" });
    }

    const activeVal = is_active ? 1 : 0;
    await pool.query(
      "UPDATE appointment_slots SET is_active = ? WHERE id IN (?) AND agency_id = ?",
      [activeVal, ids, agencyId]
    );

    return res.json({ success: true, message: `Updated ${ids.length} slots` });
  } catch (err) {
    console.error("[BULK TOGGLE SLOTS]", err);
    return res.status(500).json({ success: false, message: "Failed to toggle slots" });
  }
});

// POST /api/v1/slots/bulk-delete - Delete multiple slots
router.post("/slots/bulk-delete", async (req, res) => {
  try {
    const agencyId = req.user?.agencyId;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "Array of slot ids is required" });
    }

    // Check which slots have active bookings
    const [bookedSlots] = await pool.query(
      "SELECT DISTINCT slot_id FROM appointments WHERE slot_id IN (?) AND status NOT IN ('cancelled')",
      [ids]
    );

    const bookedIds = new Set(bookedSlots.map(b => b.slot_id));
    const safeToDelete = ids.filter(id => !bookedIds.has(id));

    if (safeToDelete.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete selected slots because all of them have active appointments.",
      });
    }

    await pool.query(
      "DELETE FROM appointment_slots WHERE id IN (?) AND agency_id = ?",
      [safeToDelete, agencyId]
    );

    return res.json({
      success: true,
      message: `Deleted ${safeToDelete.length} slot(s). ${bookedIds.size > 0 ? `(${bookedIds.size} skipped due to active bookings)` : ""}`,
      deletedCount: safeToDelete.length,
      skippedCount: bookedIds.size,
    });
  } catch (err) {
    console.error("[BULK DELETE SLOTS]", err);
    return res.status(500).json({ success: false, message: "Failed to delete slots" });
  }
});

// DELETE /api/v1/slots/purge-past - Clean up past empty slots before today
router.delete("/slots/purge-past", async (req, res) => {
  try {
    const agencyId = req.user?.agencyId;
    const [result] = await pool.query(
      `DELETE FROM appointment_slots 
       WHERE agency_id = ? 
         AND slot_date < CURDATE() 
         AND id NOT IN (SELECT slot_id FROM appointments WHERE slot_id IS NOT NULL)`,
      [agencyId]
    );

    return res.json({
      success: true,
      message: `Cleaned up ${result.affectedRows} past empty slot(s).`,
      count: result.affectedRows,
    });
  } catch (err) {
    console.error("[PURGE PAST SLOTS]", err);
    return res.status(500).json({ success: false, message: "Failed to purge past slots" });
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
