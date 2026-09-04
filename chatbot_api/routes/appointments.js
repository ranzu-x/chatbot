import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { requireModule } from "../utils/entitlements.js";

const router = express.Router();

// ─── 1. PUBLIC CHANNEL / BOT / WEBCHAT BOOKING ENDPOINT ──────────────────────
// Used by WhatsApp bot flow nodes, Webchat widgets, and public booking page
router.post("/appointments/book-public", async (req, res) => {
  const {
    agency_id,
    slot_id,
    staff_id = null,
    service_name = "General Consultation",
    appointment_date,
    appointment_time,
    duration = 30,
    fee = 0.0,
    customer_name,
    customer_phone,
    customer_email = null,
    channel = "WHATSAPP",
    notes = null,
    booking_source = "CHATBOT",
  } = req.body;

  if (!agency_id) {
    return res.status(400).json({ success: false, message: "agency_id is required" });
  }

  if (!customer_name || !customer_phone) {
    return res.status(400).json({ success: false, message: "Customer name and phone number are required" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let finalDate = appointment_date;
    let finalTime = appointment_time;
    let targetSlotId = slot_id || null;

    // 1. If slot_id provided, verify slot availability
    if (slot_id) {
      const [slots] = await conn.query(
        "SELECT id, slot_date, start_time, max_capacity, booked_count FROM appointment_slots WHERE id = ? AND agency_id = ? AND is_active = 1 FOR UPDATE",
        [slot_id, agency_id]
      );

      if (!slots.length) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: "Selected time slot is no longer available" });
      }

      const slot = slots[0];
      if (slot.booked_count >= slot.max_capacity) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: "Selected time slot is already fully booked" });
      }

      finalDate = slot.slot_date;
      finalTime = slot.start_time;

      // Increment booked count
      await conn.query("UPDATE appointment_slots SET booked_count = booked_count + 1 WHERE id = ?", [slot.id]);
    }

    if (!finalDate || !finalTime) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Appointment date and time are required" });
    }

    // 2. Link or create contact in CRM
    let contactId = null;
    const cleanPhone = customer_phone.replace(/[^0-9+]/g, "");

    const [existingContacts] = await conn.query(
      "SELECT id FROM contacts WHERE agency_id = ? AND (phone = ? OR external_id = ?) LIMIT 1",
      [agency_id, cleanPhone, cleanPhone]
    );

    if (existingContacts.length > 0) {
      contactId = existingContacts[0].id;
    } else {
      const [newContact] = await conn.query(
        `INSERT INTO contacts (agency_id, platform, external_id, name, phone, email)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [agency_id, channel || "WHATSAPP", cleanPhone, customer_name, cleanPhone, customer_email]
      );
      contactId = newContact.insertId;
    }

    // 3. Insert Appointment
    const [result] = await conn.query(
      `INSERT INTO appointments (
        agency_id, contact_id, staff_id, slot_id,
        customer_name, customer_phone, customer_email,
        service_name, appointment_date, appointment_time,
        duration, fee, channel, status, notes, booking_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
      [
        agency_id, contactId, staff_id, targetSlotId,
        customer_name, cleanPhone, customer_email,
        service_name, finalDate, finalTime,
        duration, fee, channel, notes, booking_source
      ]
    );

    await conn.commit();

    return res.status(201).json({
      success: true,
      message: "Appointment booked successfully!",
      appointmentId: result.insertId,
      booking: {
        id: result.insertId,
        customerName: customer_name,
        date: finalDate,
        time: finalTime,
        service: service_name,
        channel,
      },
    });
  } catch (err) {
    await conn.rollback();
    console.error("[PUBLIC BOOK APPOINTMENT ERROR]", err);
    return res.status(500).json({ success: false, message: "Failed to process appointment booking" });
  } finally {
    conn.release();
  }
});

// ─── PROTECTED APPLICATION ROUTES (Requires feature_appointments module) ──────
router.use("/appointments", authMiddleware, requireModule("feature_appointments"));

// GET /api/v1/appointments/stats - Dashboard metric cards
router.get("/appointments/stats", async (req, res) => {
  try {
    const agencyId = req.user?.agencyId;
    if (!agencyId && req.user?.role !== "ADMIN") {
      return res.status(403).json({ success: false, message: "Workspace required" });
    }

    const [totalRows] = await pool.query(
      "SELECT COUNT(*) as total, SUM(CASE WHEN appointment_date = CURDATE() THEN 1 ELSE 0 END) as today, SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled, SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled FROM appointments WHERE agency_id = ?",
      [agencyId]
    );

    const stats = totalRows[0] || { total: 0, today: 0, scheduled: 0, confirmed: 0, completed: 0, cancelled: 0 };
    return res.json({ success: true, stats });
  } catch (err) {
    console.error("[APPOINTMENT STATS ERROR]", err);
    return res.status(500).json({ success: false, message: "Error fetching appointment statistics" });
  }
});

// GET /api/v1/appointments - List with filters & pagination
router.get("/appointments", async (req, res) => {
  try {
    const agencyId = req.user?.agencyId;
    if (!agencyId && req.user?.role !== "ADMIN") {
      return res.status(403).json({ success: false, message: "Workspace required" });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;

    const { search, status, channel, staffId, date, fromDate, toDate } = req.query;

    let whereSql = "WHERE a.agency_id = ?";
    const params = [agencyId];

    if (search && search.trim()) {
      whereSql += " AND (a.customer_name LIKE ? OR a.customer_phone LIKE ? OR a.service_name LIKE ?)";
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    if (status && status !== "all") {
      whereSql += " AND a.status = ?";
      params.push(status);
    }

    if (channel && channel !== "all") {
      whereSql += " AND a.channel = ?";
      params.push(channel);
    }

    if (staffId) {
      whereSql += " AND a.staff_id = ?";
      params.push(staffId);
    }

    if (date) {
      whereSql += " AND a.appointment_date = ?";
      params.push(date);
    } else if (fromDate && toDate) {
      whereSql += " AND a.appointment_date BETWEEN ? AND ?";
      params.push(fromDate, toDate);
    }

    // Count query
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM appointments a ${whereSql}`,
      params
    );
    const total = countResult[0]?.total || 0;

    // Data query
    const dataSql = `
      SELECT a.*,
             u.name AS staff_name,
             c.avatar AS contact_avatar,
             c.platform AS contact_platform
      FROM appointments a
      LEFT JOIN users u ON u.id = a.staff_id
      LEFT JOIN contacts c ON c.id = a.contact_id
      ${whereSql}
      ORDER BY a.appointment_date DESC, a.appointment_time DESC
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(dataSql, [...params, limit, offset]);

    return res.json({
      success: true,
      appointments: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (err) {
    console.error("[GET APPOINTMENTS ERROR]", err);
    return res.status(500).json({ success: false, message: "Failed to fetch appointments" });
  }
});

// POST /api/v1/appointments - Internal booking (Live Chat agent / Workspace Manager)
router.post("/appointments", async (req, res) => {
  const agencyId = req.user?.agencyId;
  if (!agencyId && req.user?.role !== "ADMIN") {
    return res.status(403).json({ success: false, message: "Workspace required" });
  }

  const {
    contact_id = null,
    staff_id = null,
    slot_id = null,
    service_name = "Consultation",
    appointment_date,
    appointment_time,
    duration = 30,
    fee = 0.0,
    payment_status = "unpaid",
    customer_name,
    customer_phone,
    customer_email = null,
    channel = "MANUAL",
    notes = null,
    status = "scheduled",
  } = req.body;

  if (!customer_name || !appointment_date || !appointment_time) {
    return res.status(400).json({ success: false, message: "Customer name, date, and time are required" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (slot_id) {
      const [slots] = await conn.query(
        "SELECT id, booked_count, max_capacity FROM appointment_slots WHERE id = ? AND agency_id = ? FOR UPDATE",
        [slot_id, agencyId]
      );
      if (slots.length && slots[0].booked_count < slots[0].max_capacity) {
        await conn.query("UPDATE appointment_slots SET booked_count = booked_count + 1 WHERE id = ?", [slot_id]);
      }
    }

    const [result] = await conn.query(
      `INSERT INTO appointments (
        agency_id, contact_id, staff_id, slot_id,
        customer_name, customer_phone, customer_email,
        service_name, appointment_date, appointment_time,
        duration, fee, payment_status, channel, status, notes, booking_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AGENT')`,
      [
        agencyId, contact_id, staff_id, slot_id,
        customer_name, customer_phone, customer_email,
        service_name, appointment_date, appointment_time,
        duration, fee, payment_status, channel, status, notes
      ]
    );

    await conn.commit();
    return res.status(201).json({
      success: true,
      message: "Appointment created successfully",
      appointmentId: result.insertId,
    });
  } catch (err) {
    await conn.rollback();
    console.error("[CREATE APPOINTMENT ERROR]", err);
    return res.status(500).json({ success: false, message: "Failed to create appointment" });
  } finally {
    conn.release();
  }
});

// PUT /api/v1/appointments/:id/status - Update status (confirm, cancel, complete)
router.put("/appointments/:id/status", async (req, res) => {
  const agencyId = req.user?.agencyId;
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ["scheduled", "confirmed", "completed", "cancelled", "no_show"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, message: `Status must be one of: ${validStatuses.join(", ")}` });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query(
      "SELECT id, slot_id, status FROM appointments WHERE id = ? AND agency_id = ? FOR UPDATE",
      [id, agencyId]
    );

    if (!existing.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    const prev = existing[0];

    // If changing to cancelled and was associated with a slot, free the slot capacity
    if (status === "cancelled" && prev.status !== "cancelled" && prev.slot_id) {
      await conn.query(
        "UPDATE appointment_slots SET booked_count = GREATEST(0, booked_count - 1) WHERE id = ?",
        [prev.slot_id]
      );
    } else if (prev.status === "cancelled" && status !== "cancelled" && prev.slot_id) {
      // Re-activating previously cancelled booking
      await conn.query(
        "UPDATE appointment_slots SET booked_count = booked_count + 1 WHERE id = ?",
        [prev.slot_id]
      );
    }

    await conn.query("UPDATE appointments SET status = ? WHERE id = ?", [status, id]);

    await conn.commit();
    return res.json({ success: true, message: `Appointment status updated to ${status}` });
  } catch (err) {
    await conn.rollback();
    console.error("[UPDATE APPOINTMENT STATUS ERROR]", err);
    return res.status(500).json({ success: false, message: "Failed to update appointment status" });
  } finally {
    conn.release();
  }
});

// DELETE /api/v1/appointments/:id - Delete an appointment
router.delete("/appointments/:id", async (req, res) => {
  const agencyId = req.user?.agencyId;
  const { id } = req.params;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query(
      "SELECT id, slot_id, status FROM appointments WHERE id = ? AND agency_id = ?",
      [id, agencyId]
    );

    if (!existing.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    const item = existing[0];
    if (item.slot_id && item.status !== "cancelled") {
      await conn.query(
        "UPDATE appointment_slots SET booked_count = GREATEST(0, booked_count - 1) WHERE id = ?",
        [item.slot_id]
      );
    }

    await conn.query("DELETE FROM appointments WHERE id = ?", [id]);

    await conn.commit();
    return res.json({ success: true, message: "Appointment deleted successfully" });
  } catch (err) {
    await conn.rollback();
    console.error("[DELETE APPOINTMENT ERROR]", err);
    return res.status(500).json({ success: false, message: "Failed to delete appointment" });
  } finally {
    conn.release();
  }
});

export default router;
