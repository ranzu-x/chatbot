import express from "express";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";

const router = express.Router();

// ✅ Generate bill after appointment
router.post("/bills", authMiddleWare, async (req, res) => {
  const { appointmentId, patientId, doctorId, subtotal, grandTotal, discount, paymentMode, billType } = req.body;
  const hospital_id = req.user.hospital_id;

  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    console.log("Bill data:", { appointmentId, doctorId, hospital_id, grandTotal, discount, subtotal, paymentMode, billType });

    // 1️⃣ Insert into billing table
    await conn.query(
      `INSERT INTO billing 
        (appointment_id, patient_id, doctor_id, hospital_id, grand_total, discount_amount, total_amount, payment_status, payment_method, bill_date, bill_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?, NOW(), ?)`,
      [appointmentId, patientId, doctorId, hospital_id, grandTotal, discount, subtotal, paymentMode, billType]
    );

    // 2️⃣ Update appointment only if this is a doctor bill
    if (billType === "doctor" && appointmentId) {
      const [result] = await conn.query(
        `UPDATE appointments 
         SET status = 'confirmed', payment_status = 'paid'
         WHERE id = ?`,
        [appointmentId]
      );
      console.log("Appointment updated:", result);
    }

    await conn.commit();
    res.json({ message: "Bill generated successfully and appointment confirmed." });
  } catch (error) {
    await conn.rollback();
    console.error("Error saving bill:", error);
    res.status(500).json({ error: error.message });
  } finally {
    conn.release();
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
