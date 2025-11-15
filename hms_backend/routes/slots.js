import express from "express";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

// ✅ Create slots (regular and walk-in)
router.post("/slots", authMiddleWare, requireRole(['hospital_admin', 'doctor']), async (req, res) => {
    const { 
        doctor_id, 
        slot_date, 
        start_time, 
        end_time, 
        slot_duration = 30, 
        max_patients = 1,
        slot_type = 'regular',
        walk_in_capacity = 5
    } = req.body;
    
    const hospital_id = req.user.hospital_id;

    try {
        // Validate inputs
        if (!doctor_id || !slot_date || !start_time || !end_time) {
            return res.status(400).json({ error: "Doctor, date, start time, and end time are required" });
        }

        const start = new Date(`1970-01-01T${start_time}`);
        const end = new Date(`1970-01-01T${end_time}`);
        
        if (start >= end) {
            return res.status(400).json({ error: "End time must be after start time" });
        }

        // Generate time slots
        const slots = [];
        let currentTime = new Date(start);
        
        while (currentTime < end) {
            const slotStart = currentTime.toTimeString().slice(0, 5);
            currentTime.setMinutes(currentTime.getMinutes() + slot_duration);
            const slotEnd = currentTime.toTimeString().slice(0, 5);
            
            if (currentTime <= end) {
                slots.push([
                    doctor_id, 
                    hospital_id, 
                    slot_date, 
                    slotStart, 
                    slotEnd, 
                    slot_duration, 
                    max_patients,
                    slot_type,
                    walk_in_capacity,
                    0, // walk_in_booked
                    true // is_active
                ]);
            }
        }

        if (slots.length > 0) {
            await pool.query(
                `INSERT INTO doctor_slots 
                (doctor_id, hospital_id, slot_date, start_time, end_time, slot_duration, max_patients, slot_type, walk_in_capacity, walk_in_booked, is_active) 
                 VALUES ?`,
                [slots]
            );
        }

        res.json({ 
            success: true,
            message: `${slots.length} ${slot_type} slots created successfully`,
            slots_created: slots.length,
            slot_type: slot_type,
            max_patients_per_slot: max_patients,
            walk_in_capacity: slot_type === 'walk_in' ? walk_in_capacity : null
        });
    } catch (error) {
        console.error("Create slots error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Get available slots for scheduling
router.get("/slots/available", authMiddleWare, async (req, res) => {
    const { doctor_id, slot_date } = req.query;
    const hospital_id = req.user.hospital_id;

    try {
        const [slots] = await pool.query(
            `SELECT 
                ds.id,
                ds.doctor_id,
                ds.slot_date,
                ds.start_time,
                ds.end_time,
                ds.slot_duration,
                ds.max_patients,
                ds.booked_count,
                ds.slot_type,
                (ds.max_patients - ds.booked_count) as available_slots,
                CONCAT(u.first_name, ' ', u.last_name) as doctor_name,
                u.specialization
             FROM doctor_slots ds
             JOIN users u ON ds.doctor_id = u.id
             WHERE ds.doctor_id = ? 
                AND ds.slot_date = ? 
                AND ds.hospital_id = ?
                AND ds.is_active = true
                AND ds.slot_type = 'regular'  -- Only regular slots for scheduling
                AND ds.booked_count < ds.max_patients
                AND (ds.slot_date > CURDATE() OR (ds.slot_date = CURDATE() AND ds.start_time > CURTIME()))
             ORDER BY ds.start_time ASC`,
            [doctor_id, slot_date, hospital_id]
        );

        res.json(slots);
    } catch (error) {
        console.error("Get available slots error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Get walk-in slots for today
router.get("/slots/walk-in", authMiddleWare, async (req, res) => {
    const { doctor_id } = req.query;
    const hospital_id = req.user.hospital_id;
    const today = new Date().toISOString().split('T')[0];

    try {
        const [slots] = await pool.query(
            `SELECT 
                ds.id,
                ds.doctor_id,
                ds.slot_date,
                ds.start_time,
                ds.end_time,
                ds.walk_in_capacity,
                ds.walk_in_booked,
                (ds.walk_in_capacity - ds.walk_in_booked) as available_walk_ins,
                CONCAT(u.first_name, ' ', u.last_name) as doctor_name,
                u.specialization
             FROM doctor_slots ds
             JOIN users u ON ds.doctor_id = u.id
             WHERE ds.doctor_id = ? 
                AND ds.slot_date = ? 
                AND ds.hospital_id = ?
                AND ds.is_active = true
                AND ds.slot_type = 'walk_in'
                AND ds.walk_in_booked < ds.walk_in_capacity
                AND (ds.start_time > CURTIME() OR ds.walk_in_booked > 0)
             ORDER BY ds.start_time ASC`,
            [doctor_id, today, hospital_id]
        );

        res.json(slots);
    } catch (error) {
        console.error("Get walk-in slots error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Get doctor's schedule
router.get("/slots/doctor/:doctor_id", authMiddleWare, async (req, res) => {
    const { doctor_id } = req.params;
    const { start_date, end_date } = req.query;
    const hospital_id = req.user.hospital_id;

    try {
        const [slots] = await pool.query(
            `SELECT 
                ds.id,
                ds.slot_date,
                ds.start_time,
                ds.end_time,
                ds.slot_type,
                ds.max_patients,
                ds.booked_count,
                ds.walk_in_capacity,
                ds.walk_in_booked,
                ds.is_active,
                COUNT(CASE WHEN a.appointment_type = 'scheduled' AND a.status != 'cancelled' THEN 1 END) as scheduled_count,
                COUNT(CASE WHEN a.appointment_type = 'walk_in' AND a.status != 'cancelled' THEN 1 END) as walk_in_count
             FROM doctor_slots ds
             LEFT JOIN appointments a ON ds.id = a.slot_id AND a.status != 'cancelled'
             WHERE ds.doctor_id = ? 
                AND ds.hospital_id = ?
                AND ds.slot_date BETWEEN ? AND ?
             GROUP BY ds.id
             ORDER BY ds.slot_date, ds.start_time`,
            [doctor_id, hospital_id, start_date, end_date]
        );

        res.json(slots);
    } catch (error) {
        console.error("Get doctor slots error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;