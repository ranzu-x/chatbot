import express from "express";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";

const router = express.Router();

// ✅ Generate bill after appointment
router.post("/bills", authMiddleWare, async (req, res) => {
  const { appointment_id, doctor_fee, discount, payment_method } = req.body;
  const hospital_id = req.user.hospital_id;
  const total = doctor_fee - (discount || 0);

  try {
    await pool.query(
      `INSERT INTO billing (appointment_id, hospital_id, doctor_fee, discount, total_amount, payment_status, payment_method, payment_date)
       VALUES (?, ?, ?, ?, ?, 'paid', ?, NOW())`,
      [appointment_id, hospital_id, doctor_fee, discount, total, payment_method]
    );
    res.json({ message: "Bill generated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ Get all bills for hospital
router.get("/bills", authMiddleWare, async (req, res) => {
  const hospital_id = req.user.hospital_id;

  try {
    const [rows] = await pool.query(
      `SELECT 
        b.*, 
        CONCAT(p.first_name, ' ', p.last_name) AS patient_name
      FROM billing b
      LEFT JOIN patients p ON b.patient_id = p.id
      WHERE b.hospital_id = ?
      ORDER BY b.created_at DESC`,
      [hospital_id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
