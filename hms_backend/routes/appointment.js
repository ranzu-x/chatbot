import express from "express";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

// ✅ Create appointment with dynamic slot availability check
router.post("/appointments",authMiddleWare, requireRole(["hospital_admin", "doctor"]), async (req, res) => {
    const { doctor_id, patient_id, slot_id, appointment_time, reason } = req.body;
    const { hospital_id } = req.user;

    try {
      // 1️⃣ Get slot info + availability
      const [slots] = await pool.query(
        `SELECT 
            ds.id,
            ds.slot_date,
            ds.start_time,
            ds.max_patients,
            COUNT(a.id) AS booked_count,
            (ds.max_patients - COUNT(a.id)) AS available_slots
         FROM doctor_slots ds
         LEFT JOIN appointments a 
           ON ds.id = a.slot_id 
           AND a.status NOT IN ('cancelled','completed')
         WHERE ds.id = ? 
           AND ds.doctor_id = ? 
           AND ds.hospital_id = ?
         GROUP BY ds.id
         HAVING available_slots > 0`,
        [slot_id, doctor_id, hospital_id]
      );

      if (!slots.length) {
        return res.status(400).json({ error: "Slot not available" });
      }

      const slot = slots[0];

      // 2️⃣ Fetch doctor appointment fee
      const [[feeRow]] = await pool.query(
        `SELECT fee as consultation_fee
         FROM doctor_services 
         WHERE user_id = ? LIMIT 1`,
        [doctor_id]
      );

      if (!feeRow) {
        return res.status(400).json({ error: "Doctor fee not configured" });
      }

      const appointment_fee = feeRow.consultation_fee;

      // 3️⃣ Insert appointment (TRANSACTION SAFE)
      await pool.query("START TRANSACTION");

      const [result] = await pool.query(
        `INSERT INTO appointments (
          hospital_id,
          doctor_id,
          patient_id,
          slot_id,
          appointment_date,
          appointment_time,
          appointment_type,
          appointment_fee,
          reason,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, 'scheduled')`,
        [
          hospital_id,
          doctor_id,
          patient_id,
          slot_id,
          slot.slot_date,
          appointment_time || slot.start_time,
          appointment_fee,
          reason,
        ]
      );

      await pool.query("COMMIT");

      res.json({
        success: true,
        appointment_id: result.insertId,
        appointment_fee,
        appointment_date: slot.slot_date,
        appointment_time: appointment_time || slot.start_time,
        remaining_slots: slot.available_slots - 1,
      });

    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("[CREATE APPOINTMENT]", error);
      res.status(500).json({ error: error.message });
    }
  }
);


// ✅ Create walk-in appointment (no slots required)
router.post(
  "/appointments/walk-in",
  authMiddleWare,
  requireRole(["hospital_admin", "doctor", "receptionist"]),
  async (req, res) => {
    const { doctor_id, patient_id, reason } = req.body;
    const { hospital_id } = req.user;

    const today = new Date().toISOString().split("T")[0];
    const currentTime = new Date().toTimeString().slice(0, 5);

    try {
      // 1️⃣ Get current walk-in queue count
      const [[queueRow]] = await pool.query(
        `SELECT COUNT(*) AS queue_length
         FROM appointments
         WHERE doctor_id = ?
           AND hospital_id = ?
           AND DATE(created_at) = ?
           AND appointment_type = 'walk_in'
           AND status IN ('scheduled', 'confirmed')`,
        [doctor_id, hospital_id, today]
      );

      const queueLength = queueRow.queue_length;
      const estimatedWaitTime = (queueLength + 1) * 15;

      // 2️⃣ Fetch doctor consultation fee (SAME AS SCHEDULED)
      const [[feeRow]] = await pool.query(
        `SELECT fee AS consultation_fee
         FROM doctor_services
         WHERE user_id = ?
         LIMIT 1`,
        [doctor_id]
      );

      if (!feeRow) {
        return res.status(400).json({ error: "Doctor fee not configured" });
      }

      const appointment_fee = feeRow.consultation_fee;

      // 3️⃣ Transaction start
      await pool.query("START TRANSACTION");

      // 4️⃣ Insert walk-in appointment WITH FEE
      const [result] = await pool.query(
        `INSERT INTO appointments (
          hospital_id,
          doctor_id,
          patient_id,
          appointment_date,
          appointment_time,
          appointment_type,
          appointment_fee,
          reason,
          status,
          walk_in_sequence,
          estimated_wait_time,
          check_in_time
        ) VALUES (?, ?, ?, ?, ?, 'walk_in', ?, ?, 'scheduled', ?, ?, NOW())`,
        [
          hospital_id,
          doctor_id,
          patient_id,
          today,
          currentTime,
          appointment_fee,
          reason,
          queueLength + 1,
          estimatedWaitTime,
        ]
      );

      await pool.query("COMMIT");

      res.json({
        success: true,
        message: "Walk-in appointment created successfully",
        appointment_id: result.insertId,
        appointment_type: "walk_in",
        appointment_fee,
        walk_in_sequence: queueLength + 1,
        estimated_wait_time: estimatedWaitTime,
        current_queue_length: queueLength,
      });

    } catch (error) {
      await pool.query("ROLLBACK");
      console.error("[CREATE WALK-IN APPOINTMENT]", error);
      res.status(500).json({ error: error.message });
    }
  }
);


// ✅ Get walk-in queue for a doctor
router.get("/appointments/walk-in/queue/:doctor_id", authMiddleWare, async (req, res) => {
    const { doctor_id } = req.params;
    const hospital_id = req.user.hospital_id;
    const today = new Date().toISOString().split('T')[0];

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
                p.phone as patient_phone,
                TIMESTAMPDIFF(MINUTE, a.check_in_time, NOW()) as wait_duration_minutes
             FROM appointments a
             JOIN patients p ON a.patient_id = p.id
             WHERE a.doctor_id = ?
             AND a.hospital_id = ?
             AND DATE(a.created_at) = ?
             AND a.appointment_type = 'walk_in'
             AND a.status IN ('scheduled', 'confirmed')
             ORDER BY a.walk_in_sequence ASC`,
            [doctor_id, hospital_id, today]
        );

        res.json(queue);
    } catch (error) {
        console.error("Get walk-in queue error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Update appointment status
router.put("/appointments/:id/status", authMiddleWare, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const hospital_id = req.user.hospital_id;

    try {
        // Get current appointment details
        const [appointment] = await pool.query(
            `SELECT appointment_type FROM appointments 
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
        // Get appointment details before cancellation
        const [appointment] = await pool.query(
            `SELECT appointment_type, doctor_id, DATE(created_at) as appointment_date 
             FROM appointments 
             WHERE id = ? AND hospital_id = ?`,
            [id, hospital_id]
        );

        if (appointment.length === 0) {
            return res.status(404).json({ error: "Appointment not found" });
        }

        const appt = appointment[0];

        // Update appointment status
        await pool.query(
            `UPDATE appointments SET status = 'cancelled' WHERE id = ?`,
            [id]
        );

        // For walk-ins, update the queue sequence
        if (appt.appointment_type === 'walk_in') {
            await pool.query(
                `UPDATE appointments 
                 SET walk_in_sequence = walk_in_sequence - 1,
                     estimated_wait_time = GREATEST(0, estimated_wait_time - 15)
                 WHERE doctor_id = ? 
                 AND DATE(created_at) = ?
                 AND appointment_type = 'walk_in' 
                 AND status = 'scheduled'
                 AND walk_in_sequence > (
                     SELECT walk_in_sequence FROM appointments WHERE id = ?
                 )`,
                [appt.doctor_id, appt.appointment_date, id]
            );
        }

        res.json({ 
            success: true,
            message: "Appointment cancelled successfully"
        });

    } catch (error) {
        console.error("Cancel appointment error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Get appointments with dynamic slot availability
router.get("/appointments", authMiddleWare, async (req, res) => {
    const hospital_id = req.user.hospital_id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search ? `%${req.query.search}%` : "%%";
    const appointment_type = req.query.type || 'all';
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
                CONCAT(d.first_name, ' ', d.last_name) AS doctor_name,
                -- Dynamic slot availability for scheduled appointments
                CASE 
                    WHEN a.appointment_type = 'scheduled' AND a.slot_id IS NOT NULL THEN
                        (SELECT ds.max_patients - COUNT(a2.id) 
                         FROM doctor_slots ds
                         LEFT JOIN appointments a2 ON ds.id = a2.slot_id 
                           AND a2.status NOT IN ('cancelled', 'completed')
                         WHERE ds.id = a.slot_id
                         GROUP BY ds.id)
                    ELSE NULL
                END as slot_availability
             FROM appointments a
             JOIN patients p ON a.patient_id = p.id
             JOIN users d ON a.doctor_id = d.id
             WHERE a.hospital_id = ?
             AND (p.first_name LIKE ? OR p.last_name LIKE ? OR d.first_name LIKE ? OR d.last_name LIKE ?)
             ${typeCondition}
             ORDER BY 
                 CASE 
                     WHEN a.appointment_type = 'walk_in' AND a.status = 'scheduled' THEN 0 
                     ELSE 1 
                 END,
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

// ✅ Get available slots for a doctor (for scheduling)
router.get("/appointments/available-slots", authMiddleWare, async (req, res) => {
    const { doctor_id, date } = req.query;
    const hospital_id = req.user.hospital_id;

    try {
        const [slots] = await pool.query(
            `SELECT 
                ds.id,
                ds.slot_date,
                ds.start_time,
                ds.end_time,
                ds.slot_duration,
                ds.max_patients,
                COUNT(a.id) as booked_count,
                (ds.max_patients - COUNT(a.id)) as available_slots
             FROM doctor_slots ds
             LEFT JOIN appointments a ON ds.id = a.slot_id 
               AND a.status NOT IN ('cancelled', 'completed')
             WHERE ds.doctor_id = ? 
             AND ds.hospital_id = ?
             AND ds.slot_date = ?
             GROUP BY ds.id
             HAVING available_slots > 0
             ORDER BY ds.start_time ASC`,
            [doctor_id, hospital_id, date]
        );

        res.json(slots);
    } catch (error) {
        console.error("Get available slots error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ✅ Get List of service details for generating appointment. 
router.get("/doctor-services", authMiddleWare, async (req, res) => {

    try {
      const [services] = await pool.query(
        `SELECT 
            id,
            service_name AS name
         FROM services`
      );

      res.json(services);
    } catch (error) {
      console.error("[DOCTOR SERVICES]", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ✅ Get service fees for generating appointment. 
router.get("/doctor-fees", authMiddleWare, async (req, res) => {
  const { doctor_id, service_id } = req.query;
  const hospital_id = req.user.hospital_id;

  try {
    const [[row]] = await pool.query(
      `SELECT fee
       FROM doctor_services
       WHERE user_id = ?
         AND service_id = ?

       LIMIT 1`,
      [doctor_id, service_id]
    );

    if (!row) {
      return res.status(404).json({ error: "Fee not configured for this service" });
    }

    res.json({ fee: row.fee });
  } catch (error) {
    console.error("[DOCTOR FEES]", error);
    res.status(500).json({ error: error.message });
  }
});


// ✅ Get appointment details with patient and doctor info for generating appointment bill. 
router.get("/appointments/:id", authMiddleWare, async (req, res) => {
  const { id } = req.params;
  const hospital_id = req.user.hospital_id;

  try {
    const [rows] = await pool.query(
      `SELECT 
        a.id,
        DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date,
        a.appointment_time,
        a.status,
        a.patient_id,
        a.doctor_id,
        a.appointment_fee,
        a.payment_status,
        CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
        p.age AS patient_age,
        p.gender AS patient_gender,
        p.phone AS patient_phone,
        p.address AS patient_address,
        CONCAT(u.first_name, ' ', u.last_name) AS doctor_name,
        d.specialization AS doctor_specialization
      FROM appointments a
      LEFT JOIN patients p ON a.patient_id = p.id
      LEFT JOIN users u ON a.doctor_id = u.id
      LEFT JOIN doctor_details d ON a.doctor_id = d.user_id
      WHERE a.id = ? AND a.hospital_id = ?`,
      [id, hospital_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Appointment not found" });
    }
    res.json(rows[0]);
    console.log(rows)
  } 
  
  catch (error) {
    console.error("[APPOINTMENT DETAILS] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;