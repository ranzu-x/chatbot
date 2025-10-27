import express from "express";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = express.Router();



// ✅ Create new appointment
router.post("/appointments", authMiddleWare, requireRole(['hospital_admin']), async (req, res) => {
    const {doctor_id, patient_id, appointment_date, appointment_time, reason} = req.body;
    const {hospital_id, id: user_id} = req.user;

    console.log(hospital_id, user_id);

    try {

        await pool.query(
            `INSERT INTO appointments (hospital_id, doctor_id, patient_id, appointment_date, appointment_time, reason, status)
            VALUES (?,?,?,?,?,?, 'scheduled')`,
            [hospital_id, doctor_id, patient_id, appointment_date, appointment_time, reason]
        );

        res.json({message: "Appointment created successfully"});
    }
    catch (error) {
      console.error("Create appointment DB error:", error);
        res.status(500).json({error: error.message});
    }
});


// ✅ Get all appointments for hospital
router.get("/appointments", authMiddleWare, async (req, res) => {
  const hospital_id = req.user.hospital_id;

  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.status, a.reason, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS appointment_date, a.appointment_time, a.payment_status,
              CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
              CONCAT(d.first_name, ' ', d.last_name) AS doctor_name
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       JOIN users d ON a.doctor_id = d.id
       WHERE a.hospital_id = ?
       ORDER BY a.appointment_date DESC, a.appointment_time ASC`,
      [hospital_id]
    );

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});


// ✅ Update appointment status
router.put("/appointments/:id/status", authMiddleWare, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    await pool.query(`UPDATE appointments SET status = ? WHERE id = ?`, [status, id]);
    res.status(200).json({ message: "Status updated" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ Get appointment details with patient and doctor info
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
        u.specialization AS doctor_specialization
      FROM appointments a
      LEFT JOIN patients p ON a.patient_id = p.id
      LEFT JOIN users u ON a.doctor_id = u.id
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