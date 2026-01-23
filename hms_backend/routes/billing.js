import express from "express";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";

const router = express.Router();

// ✅ Generate bill after appointment
router.post("/bills", authMiddleWare, async (req, res) => {
  const conn = await pool.getConnection();
  await conn.beginTransaction();

  try {
    const {
      appointment_id,
      patient_id,
      doctor_id,
      bill_type,
      subtotal,
      discount_amount,
      tax_amount,
      grand_total,
      paid_amount,
      payment_method,
      payment_status,
      remarks,
      items
    } = req.body;

    const hospital_id = req.user.hospital_id;
    const created_by = req.user.id;

    // 1️⃣ Check if bill already exists for this appointment
    const [existingBill] = await conn.query(
      `SELECT id FROM billing
       WHERE hospital_id = ? AND appointment_id = ?
       LIMIT 1`,
      [hospital_id, appointment_id]
    );

    let billing_id;

    if (existingBill.length > 0) {
      // ================= UPDATE BILL =================
      billing_id = existingBill[0].id;

      await conn.query(
        `UPDATE billing SET
          patient_id = ?,
          doctor_id = ?,
          bill_type = ?,
          total_amount = ?,
          discount_amount = ?,
          tax_amount = ?,
          grand_total = ?,
          paid_amount = ?,
          payment_status = ?,
          payment_method = ?,
          remarks = ?
        WHERE id = ?`,
        [
          patient_id,
          doctor_id,
          bill_type,
          subtotal,
          discount_amount,
          tax_amount,
          grand_total,
          paid_amount,
          payment_status,
          payment_method,
          remarks,
          billing_id
        ]
      );

      // Remove old items
      await conn.query(
        `DELETE FROM billing_items WHERE billing_id = ?`,
        [billing_id]
      );

    } else {
  // ================= INSERT BILL =================
  const [billResult] = await conn.query(
    `INSERT INTO billing
    (hospital_id, patient_id, doctor_id, appointment_id, bill_type, bill_date,
     total_amount, discount_amount, tax_amount, grand_total,
     paid_amount, payment_status, payment_method, remarks, created_by)
    VALUES (?, ?, ?, ?, ?, CURDATE(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      hospital_id,
      patient_id,
      doctor_id,
      appointment_id,
      bill_type,
      subtotal,
      discount_amount,
      tax_amount,
      grand_total,
      paid_amount,
      payment_status,
      payment_method,
      remarks,
      created_by
    ]
  );

  billing_id = billResult.insertId;

  // 🔐 Generate invoice number ONCE
  const invoice_no = `INV-${String(billing_id).padStart(6, "0")}`;

  await conn.query(
    `UPDATE billing SET invoice_no = ? WHERE id = ?`,
    [invoice_no, billing_id]
  );
}

    // 2️⃣ Insert billing items (fresh)
    for (const item of items) {
      await conn.query(
        `INSERT INTO billing_items
        (billing_id, service_name, quantity, unit_price, total_price)
        VALUES (?, ?, ?, ?, ?)`,
        [
          billing_id,
          item.service_name,
          item.quantity,
          item.unit_price,
          item.total
        ]
      );
    }

    // 3️⃣ Update appointment payment status
    if (appointment_id) {
      await conn.query(
        `UPDATE appointments
         SET payment_status = ?
         WHERE id = ?`,
        [payment_status, appointment_id]
      );
    }

    await conn.commit();

    res.json({
      message: existingBill.length ? "Bill updated successfully" : "Bill created successfully",
      billing_id
    });

  } catch (err) {
    await conn.rollback();
    console.error("Billing error:", err);
    res.status(500).json({ message: "Billing failed" });
  } finally {
    conn.release();
  }
});



// ✅ Invoice print data
router.get("/bills/:id", authMiddleWare, async (req, res) => {
  const billId = req.params.id;
  const hospital_id = req.user.hospital_id;

  const [[bill]] = await pool.query(
    `SELECT 
      b.*,
      CONCAT(p.first_name,' ',p.last_name) AS patient_name,
      p.phone,
      CONCAT(u.first_name,' ',u.last_name) AS doctor_name
     FROM billing b
     LEFT JOIN patients p ON b.patient_id = p.id
     LEFT JOIN users u ON b.doctor_id = u.id
     WHERE b.id = ? AND b.hospital_id = ?`,
    [billId, hospital_id]
  );

  const [items] = await pool.query(
    `SELECT * FROM billing_items WHERE billing_id = ?`,
    [billId]
  );

  res.json({
    bill,
    items,
    invoice_no: `INV-${new Date(bill.bill_date).getFullYear()}-${String(bill.id).padStart(6, "0")}`,
  });
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
