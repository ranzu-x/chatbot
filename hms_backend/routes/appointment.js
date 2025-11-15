import express from "express";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

// ✅ Create scheduled appointment
router.post("/appointments", authMiddleWare, requireRole(['hospital_admin', 'doctor']), async (req, res) => {
    const { doctor_id, patient_id, slot_id, reason } = req.body;
    const { hospital_id, id: user_id } = req.user;

    try {
        // Check if slot exists and is available for scheduling
        const [slotCheck] = await pool.query(
            `SELECT id, slot_date, start_time, end_time, max_patients, booked_count, slot_type
             FROM doctor_slots 
             WHERE id = ? AND doctor_id = ? AND hospital_id = ? 
             AND is_active = true 
             AND slot_type = 'regular'
             AND booked_count < max_patients`,
            [slot_id, doctor_id, hospital_id]
        );

        if (slotCheck.length === 0) {
            return res.status(400).json({ error: "Selected slot is not available for scheduling" });
        }

        const slot = slotCheck[0];

        // Start transaction
        await pool.query('START TRANSACTION');

        try {
            // Create scheduled appointment
            const [result] = await pool.query(
                `INSERT INTO appointments (hospital_id, doctor_id, patient_id, slot_id, 
                 appointment_date, appointment_time, reason, status, appointment_type)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', 'scheduled')`,
                [hospital_id, doctor_id, patient_id, slot_id, 
                 slot.slot_date, slot.start_time, reason]
            );

            // Update slot booked count
            await pool.query(
                `UPDATE doctor_slots SET booked_count = booked_count + 1 
                 WHERE id = ?`,
                [slot_id]
            );

            await pool.query('COMMIT');
            
            res.json({ 
                success: true,
                message: "Appointment scheduled successfully",
                appointment_id: result.insertId,
                appointment_date: slot.slot_date,
                appointment_time: slot.start_time,
                appointment_type: 'scheduled'
            });

        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error("Create appointment error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Create walk-in appointment
router.post("/appointments/walk-in", authMiddleWare, requireRole(['hospital_admin', 'doctor', 'receptionist']), async (req, res) => {
    const { doctor_id, patient_id, reason } = req.body;
    const { hospital_id } = req.user;
    const today = new Date().toISOString().split('T')[0];

    try {
        // Find available walk-in slot for today
        const [walkInSlots] = await pool.query(
            `SELECT id, walk_in_capacity, walk_in_booked, start_time, end_time
             FROM doctor_slots 
             WHERE doctor_id = ? 
             AND hospital_id = ?
             AND slot_date = ?
             AND slot_type = 'walk_in'
             AND is_active = true
             AND walk_in_booked < walk_in_capacity
             ORDER BY start_time ASC
             LIMIT 1`,
            [doctor_id, hospital_id, today]
        );

        if (walkInSlots.length === 0) {
            return res.status(400).json({ error: "No walk-in slots available for today" });
        }

        const slot = walkInSlots[0];
        const walkInSequence = slot.walk_in_booked + 1;
        const estimatedWaitTime = walkInSequence * 15; // 15 minutes per patient

        // Start transaction
        await pool.query('START TRANSACTION');

        try {
            // Create walk-in appointment
            const [result] = await pool.query(
                `INSERT INTO appointments (hospital_id, doctor_id, patient_id, slot_id, 
                 appointment_date, appointment_time, reason, status, appointment_type, 
                 walk_in_sequence, estimated_wait_time, check_in_time)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', 'walk_in', ?, ?, NOW())`,
                [hospital_id, doctor_id, patient_id, slot.id, 
                 today, slot.start_time, reason, walkInSequence, estimatedWaitTime]
            );

            // Update walk-in booked count
            await pool.query(
                `UPDATE doctor_slots SET walk_in_booked = walk_in_booked + 1 
                 WHERE id = ?`,
                [slot.id]
            );

            await pool.query('COMMIT');
            
            res.json({ 
                success: true,
                message: "Walk-in appointment created successfully",
                appointment_id: result.insertId,
                appointment_type: 'walk_in',
                walk_in_sequence: walkInSequence,
                estimated_wait_time: estimatedWaitTime,
                doctor_slot: `${slot.start_time} - ${slot.end_time}`
            });

        } catch (error) {
            await pool.query('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error("Create walk-in appointment error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Get walk-in queue for a slot
router.get("/appointments/walk-in/queue/:slot_id", authMiddleWare, async (req, res) => {
    const { slot_id } = req.params;
    const hospital_id = req.user.hospital_id;

    try {
        const [queue] = await pool.query(
            `SELECT 
                a.id,
                a.walk_in_sequence,
                a.estimated_wait_time,
                a.check_in_time,
                a.called_time,
                a.status,
                CONCAT(p.first_name, ' ', p.last_name) as patient_name,
                p.phone as patient_phone
             FROM appointments a
             JOIN patients p ON a.patient_id = p.id
             WHERE a.slot_id = ?
             AND a.hospital_id = ?
             AND a.appointment_type = 'walk_in'
             AND a.status IN ('scheduled', 'confirmed')
             ORDER BY a.walk_in_sequence ASC`,
            [slot_id, hospital_id]
        );

        res.json(queue);
    } catch (error) {
        console.error("Get walk-in queue error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Update appointment status (for calling walk-in patients)
router.put("/appointments/:id/status", authMiddleWare, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const hospital_id = req.user.hospital_id;

    try {
        // Get current appointment details
        const [appointment] = await pool.query(
            `SELECT appointment_type, slot_id FROM appointments 
             WHERE id = ? AND hospital_id = ?`,
            [id, hospital_id]
        );

        if (appointment.length === 0) {
            return res.status(404).json({ error: "Appointment not found" });
        }

        const appt = appointment[0];

        await pool.query(
            `UPDATE appointments SET status = ?, 
             ${status === 'confirmed' && appt.appointment_type === 'walk_in' ? 'called_time = NOW(),' : ''}
             updated_at = NOW()
             WHERE id = ?`,
            [status, id]
        );

        res.json({ 
            success: true,
            message: `Appointment ${status} successfully`,
            appointment_type: appt.appointment_type
        });

    } catch (error) {
        console.error("Update appointment status error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Cancel appointment (handles both scheduled and walk-in)
router.put("/appointments/:id/cancel", authMiddleWare, async (req, res) => {
    const { id } = req.params;
    const hospital_id = req.user.hospital_id;

    try {
        await pool.query('START TRANSACTION');

        // Get appointment details before cancellation
        const [appointment] = await pool.query(
            `SELECT slot_id, appointment_type FROM appointments 
             WHERE id = ? AND hospital_id = ?`,
            [id, hospital_id]
        );

        if (appointment.length === 0) {
            return res.status(404).json({ error: "Appointment not found" });
        }

        const appt = appointment[0];
        const slot_id = appt.slot_id;

        // Update appointment status
        await pool.query(
            `UPDATE appointments SET status = 'cancelled' WHERE id = ?`,
            [id]
        );

        // Update slot counts based on appointment type
        if (slot_id) {
            if (appt.appointment_type === 'scheduled') {
                await pool.query(
                    `UPDATE doctor_slots SET booked_count = GREATEST(0, booked_count - 1) 
                     WHERE id = ?`,
                    [slot_id]
                );
            } else if (appt.appointment_type === 'walk_in') {
                await pool.query(
                    `UPDATE doctor_slots SET walk_in_booked = GREATEST(0, walk_in_booked - 1) 
                     WHERE id = ?`,
                    [slot_id]
                );

                // Re-sequence remaining walk-ins
                await pool.query(
                    `UPDATE appointments 
                     SET walk_in_sequence = walk_in_sequence - 1,
                         estimated_wait_time = GREATEST(0, estimated_wait_time - 15)
                     WHERE slot_id = ? 
                     AND appointment_type = 'walk_in' 
                     AND status = 'scheduled'
                     AND walk_in_sequence > (
                         SELECT walk_in_sequence FROM appointments WHERE id = ?
                     )`,
                    [slot_id, id]
                );
            }
        }

        await pool.query('COMMIT');
        res.json({ 
            success: true,
            message: "Appointment cancelled successfully"
        });

    } catch (error) {
        await pool.query('ROLLBACK');
        console.error("Cancel appointment error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Enhanced get appointments with type filter
router.get("/appointments", authMiddleWare, async (req, res) => {
    const hospital_id = req.user.hospital_id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search ? `%${req.query.search}%` : "%%";
    const appointment_type = req.query.type || 'all'; // all, scheduled, walk_in
    const offset = (page - 1) * limit;

    try {
        let typeCondition = "";
        let typeParams = [];

        if (appointment_type === 'scheduled') {
            typeCondition = "AND a.appointment_type = 'scheduled'";
        } else if (appointment_type === 'walk_in') {
            typeCondition = "AND a.appointment_type = 'walk_in'";
        }

        const [rows] = await pool.query(
            `SELECT 
                a.id, 
                a.status, 
                a.reason,
                a.appointment_type,
                a.walk_in_sequence,
                a.estimated_wait_time,
                DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
                a.appointment_time, 
                a.payment_status,
                CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
                CONCAT(d.first_name, ' ', d.last_name) AS doctor_name
             FROM appointments a
             JOIN patients p ON a.patient_id = p.id
             JOIN users d ON a.doctor_id = d.id
             WHERE a.hospital_id = ?
             AND (p.first_name LIKE ? OR p.last_name LIKE ? OR d.first_name LIKE ? OR d.last_name LIKE ?)
             ${typeCondition}
             ORDER BY 
                 CASE WHEN a.appointment_type = 'walk_in' AND a.status = 'scheduled' THEN 0 ELSE 1 END,
                 a.appointment_date DESC, 
                 a.appointment_time ASC
             LIMIT ? OFFSET ?`,
            [hospital_id, search, search, search, search, ...typeParams, limit, offset]
        );

        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) AS total
             FROM appointments a
             JOIN patients p ON a.patient_id = p.id
             JOIN users d ON a.doctor_id = d.id
             WHERE a.hospital_id = ?
             AND (p.first_name LIKE ? OR p.last_name LIKE ? OR d.first_name LIKE ? OR d.last_name LIKE ?)
             ${typeCondition}`,
            [hospital_id, search, search, search, search, ...typeParams]
        );

        res.json({
            appointments: rows,
            pagination: {
                totalAppointments: total,
                totalPages: Math.ceil(total / limit),
                currentPage: page,
            },
        });
    } catch (error) {
        console.error("[Appointments] Fetch Error:", error);
        res.status(500).json({ error: error.message });
    }
});

export default router;