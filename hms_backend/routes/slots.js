// routes/slots.js
import express from "express";
import pool from "../db.js";
import cron from "node-cron";
import { authMiddleWare } from "../middleware/authmiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";
import generateSlots from "../utility/generateSlots.js";


const router = express.Router();

// Create doctor slot
router.post("/slots", authMiddleWare, requireRole(["hospital_admin", "doctor"]), async (req, res) => {
try {
    const {
      doctor_id,
      slot_date,
      start_time,
      end_time,
      slot_duration,
      max_patients,
      break_start,
      break_end
    } = req.body;

    const hospital_id = req.user.hospital_id; 

    if (!doctor_id || !slot_date || !start_time || !end_time) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Generate time slots
    const slots = generateSlots(start_time, end_time, slot_duration, break_start, break_end);

    if (!slots.length) {
      return res.status(400).json({ error: "No slots generated" });
    }

    // Insert each slot
    const values = slots.map(s => [
      doctor_id,
      hospital_id, // assuming hospital_id from middleware
      slot_date,
      s.start_time,
      s.end_time,
      slot_duration,
      max_patients
    ]);

    const query = `
      INSERT INTO doctor_slots 
      (doctor_id, hospital_id, slot_date, start_time, end_time, slot_duration, max_patients)
      VALUES ?
    `;

    await pool.query(query, [values]);

    res.json({
      message: `${slots.length} slots created successfully`,
      slots_created: slots.length
    });
  } catch (error) {
    console.error("Slot creation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all slots for a doctor with dynamic availability calculation
router.get("/slots", authMiddleWare, async (req, res) => {
  try {
    const { doctor_id, date } = req.query;
    const hospitalId = req.user.hospital_id;

    let query = `
      SELECT 
        ds.id, ds.slot_date, ds.start_time, ds.end_time, 
        ds.slot_duration, ds.max_patients,
        COALESCE(COUNT(a.id), 0) as booked_appointments,
        (ds.max_patients - COALESCE(COUNT(a.id), 0)) as available_slots,
        CASE 
          WHEN (ds.max_patients - COALESCE(COUNT(a.id), 0)) > 0 THEN 'available'
          ELSE 'full'
        END as availability_status
      FROM doctor_slots ds
      LEFT JOIN appointments a ON ds.id = a.slot_id 
        AND a.status NOT IN ('cancelled', 'completed')
      WHERE ds.hospital_id = ?
    `;
    
    let params = [hospitalId];

    if (doctor_id) {
      query += ` AND ds.doctor_id = ?`;
      params.push(doctor_id);
    }

    if (date) {
      query += ` AND ds.slot_date = ?`;
      params.push(date);
    }

    query += ` GROUP BY ds.id ORDER BY ds.slot_date, ds.start_time`;

    const [slots] = await pool.query(query, params);

    res.json(slots);
  } catch (error) {
    console.error("Error fetching slots:", error);
    res.status(500).json({ error: "Failed to fetch slots" });
  }
});

// Get available slots for booking
router.get("/slots/available", authMiddleWare, async (req, res) => {
  try {
    const { doctor_id, date } = req.query;
    const hospitalId = req.user.hospital_id;

    if (!doctor_id || !date) {
      return res.status(400).json({ error: "Doctor ID and date are required" });
    }

    const [slots] = await pool.query(
      `SELECT 
        ds.id, ds.slot_date, ds.start_time, ds.end_time, 
        ds.slot_duration, ds.max_patients,
        COALESCE(COUNT(a.id), 0) as booked_appointments,
        (ds.max_patients - COALESCE(COUNT(a.id), 0)) as available_slots
       FROM doctor_slots ds
       LEFT JOIN appointments a ON ds.id = a.slot_id 
         AND a.status NOT IN ('cancelled', 'completed')
       WHERE ds.doctor_id = ? AND ds.slot_date = ? AND ds.hospital_id = ?
       GROUP BY ds.id
       HAVING available_slots > 0
       ORDER BY ds.start_time`,
      [doctor_id, date, hospitalId]
    );

    res.json(slots);
  } catch (error) {
    console.error("Error fetching available slots:", error);
    res.status(500).json({ error: "Failed to fetch available slots" });
  }
});

// Check specific slot availability
router.get("/slots/:id/availability", authMiddleWare, async (req, res) => {
  try {
    const slotId = req.params.id;
    const hospitalId = req.user.hospital_id;

    const [slotData] = await pool.query(
      `SELECT 
        ds.id, ds.slot_date, ds.start_time, ds.end_time,
        ds.max_patients,
        COALESCE(COUNT(a.id), 0) as booked_count,
        (ds.max_patients - COALESCE(COUNT(a.id), 0)) as available_slots
       FROM doctor_slots ds
       LEFT JOIN appointments a ON ds.id = a.slot_id 
         AND a.status NOT IN ('cancelled', 'completed')
       WHERE ds.id = ? AND ds.hospital_id = ?
       GROUP BY ds.id`,
      [slotId, hospitalId]
    );

    if (slotData.length === 0) {
      return res.status(404).json({ error: "Slot not found" });
    }

    const slot = slotData[0];
    const isAvailable = slot.available_slots > 0;
    
    res.json({
      available: isAvailable,
      available_slots: slot.available_slots,
      max_patients: slot.max_patients,
      booked_count: slot.booked_count,
      slot_date: slot.slot_date,
      time_range: `${slot.start_time} - ${slot.end_time}`,
      message: isAvailable 
        ? `${slot.available_slots} slot(s) available` 
        : 'Fully booked'
    });

  } catch (error) {
    console.error("Error checking slot availability:", error);
    res.status(500).json({ error: "Failed to check slot availability" });
  }
});

// Update slot (modify time or capacity)
router.put("/slots/:id", authMiddleWare, async (req, res) => {
  try {
    const slotId = req.params.id;
    const hospitalId = req.user.hospital_id;
    const { start_time, end_time, max_patients, slot_duration } = req.body;

    // Check if slot exists and belongs to hospital
    const [existingSlot] = await pool.query(
      `SELECT id FROM doctor_slots WHERE id = ? AND hospital_id = ?`,
      [slotId, hospitalId]
    );

    if (existingSlot.length === 0) {
      return res.status(404).json({ error: "Slot not found" });
    }

    // Check if modifying capacity would conflict with existing appointments
    if (max_patients) {
      const [appointmentCount] = await pool.query(
        `SELECT COUNT(*) as count FROM appointments 
         WHERE slot_id = ? AND status NOT IN ('cancelled', 'completed')`,
        [slotId]
      );

      if (appointmentCount[0].count > max_patients) {
        return res.status(400).json({ 
          error: `Cannot reduce capacity below ${appointmentCount[0].count} (existing appointments)` 
        });
      }
    }

    // Build dynamic update query
    const updates = [];
    const params = [];

    if (start_time) { updates.push('start_time = ?'); params.push(start_time); }
    if (end_time) { updates.push('end_time = ?'); params.push(end_time); }
    if (max_patients) { updates.push('max_patients = ?'); params.push(max_patients); }
    if (slot_duration) { updates.push('slot_duration = ?'); params.push(slot_duration); }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    params.push(slotId, hospitalId);

    const [result] = await pool.query(
      `UPDATE doctor_slots SET ${updates.join(', ')} 
       WHERE id = ? AND hospital_id = ?`,
      params
    );

    res.json({ message: "Slot updated successfully" });

  } catch (error) {
    console.error("Error updating slot:", error);
    res.status(500).json({ error: "Failed to update slot" });
  }
});

// Delete slot (only if no active appointments)
router.delete("/slots/:id", authMiddleWare, requireRole(["hospital_admin", "doctor"]), async (req, res) => {
  try {
    const slotId = req.params.id;
    const hospitalId = req.user.hospital_id;

    // Check for active appointments
    const [activeAppointments] = await pool.query(
      `SELECT COUNT(*) as count FROM appointments 
       WHERE slot_id = ? AND status NOT IN ('cancelled', 'completed')`,
      [slotId]
    );

    if (activeAppointments[0].count > 0) {
      return res.status(400).json({ 
        error: `Cannot delete slot with ${activeAppointments[0].count} active appointment(s)` 
      });
    }

    const [result] = await pool.query(
      `DELETE FROM doctor_slots WHERE id = ? AND hospital_id = ?`,
      [slotId, hospitalId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Slot not found" });
    }

    res.json({ message: "Slot deleted successfully" });

  } catch (error) {
    console.error("Error deleting slot:", error);
    res.status(500).json({ error: "Failed to delete slot" });
  }
});

// Cron to delete past slots

cron.schedule("0 1 * * *", async () => {
  // Runs every night at 2 AM
  await pool.query(`
    DELETE FROM doctor_slots
    WHERE slot_date < CURDATE()
  `);
  console.log("⏳ Auto-cleaned old slots");
});


export default router;