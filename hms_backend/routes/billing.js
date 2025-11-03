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



// ✅ Get all bills with pagination + search
router.get("/bills", authMiddleWare, async (req, res) => {
  const hospital_id = req.user.hospital_id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const search = req.query.search ? `%${req.query.search}%` : "%";
  const offset = (page - 1) * limit;

  try {
    // ✅ Count total
    const [[{ count }]] = await pool.query(
      `SELECT COUNT(*) AS count
       FROM billing b
       LEFT JOIN patients p ON b.patient_id = p.id
       WHERE b.hospital_id = ?
       AND (p.first_name LIKE ? OR p.last_name LIKE ? OR b.payment_status LIKE ?)`,
      [hospital_id, search, search, search]
    );

    // ✅ Fetch paginated data
    const [rows] = await pool.query(
      `SELECT 
        b.*, 
        CONCAT(p.first_name, ' ', p.last_name) AS patient_name,
        CONCAT(u.first_name, ' ', u.last_name) AS doctor_name
      FROM billing b
      LEFT JOIN patients p ON b.patient_id = p.id
      LEFT JOIN users u ON b.doctor_id = u.id
      WHERE b.hospital_id = ?
      AND (p.first_name LIKE ? OR p.last_name LIKE ? OR b.payment_status LIKE ?)
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?`,
      [hospital_id, search, search, search, limit, offset]
    );

    res.json({
      bills: rows,
      pagination: {
        totalBills: count,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
      },
    });
  } catch (error) {
    console.error("Billing fetch error:", error);
    res.status(500).json({ error: "Failed to load billing data" });
  }
});
export default router;
