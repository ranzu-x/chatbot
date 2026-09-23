import express from "express";
import pool from "../db.js";
import { buildSearch } from "../utils/searchQuery.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { requireModule } from "../utils/entitlements.js";
import { emitToAgency } from "../utils/socket.js";

const router = express.Router();

// ─── 1. PUBLIC CHANNEL / BOT / WEBCHAT BOOKING ENDPOINT ──────────────────────
// Used by WhatsApp bot flow nodes, Webchat widgets, and public booking page
router.post("/appointments/book-public", async (req, res) => {
  const {
    agency_id,
    service_id = null,
    slot_id = null,
    staff_id = null,
    service_name,
    appointment_date,
    appointment_time,
    duration,
    fee,
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

    let finalServiceName = service_name || "General Consultation";
    let finalDuration = parseInt(duration) || 30;
    let finalFee = parseFloat(fee) || 0.0;
    let finalStaffId = staff_id || null;

    // If service_id provided, look up service details
    if (service_id) {
      const [services] = await conn.query(
        "SELECT id, name, duration_minutes, price FROM appointment_services WHERE id = ? AND agency_id = ?",
        [service_id, agency_id]
      );
      if (services.length > 0) {
        const svc = services[0];
        finalServiceName = svc.name;
        if (!duration) finalDuration = svc.duration_minutes;
        if (fee === undefined || fee === null) finalFee = svc.price;
      }
    }

    let finalDate = appointment_date;
    let finalTime = appointment_time;
    let targetSlotId = slot_id || null;

    // 1. If slot_id provided, verify slot availability
    if (slot_id) {
      const [slots] = await conn.query(
        "SELECT id, staff_id, slot_date, start_time, max_capacity, booked_count FROM appointment_slots WHERE id = ? AND agency_id = ? AND is_active = 1 FOR UPDATE",
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
      if (!finalStaffId && slot.staff_id) finalStaffId = slot.staff_id;

      // Increment booked count
      await conn.query("UPDATE appointment_slots SET booked_count = booked_count + 1 WHERE id = ?", [slot.id]);
    } else if (finalDate && finalTime) {
      // Try to find a matching slot for this date and time
      const [matchingSlots] = await conn.query(
        "SELECT id, booked_count, max_capacity FROM appointment_slots WHERE agency_id = ? AND slot_date = ? AND start_time = ? AND is_active = 1 FOR UPDATE",
        [agency_id, finalDate, finalTime]
      );
      if (matchingSlots.length > 0 && matchingSlots[0].booked_count < matchingSlots[0].max_capacity) {
        targetSlotId = matchingSlots[0].id;
        await conn.query("UPDATE appointment_slots SET booked_count = booked_count + 1 WHERE id = ?", [targetSlotId]);
      }
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
      const validPlatforms = ["WHATSAPP", "FACEBOOK", "INSTAGRAM", "TELEGRAM", "WEBCHAT", "TIKTOK"];
      const contactPlatform = validPlatforms.includes(channel) ? channel : "WEBCHAT";
      const [newContact] = await conn.query(
        `INSERT INTO contacts (agency_id, platform, external_id, name, phone, email)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [agency_id, contactPlatform, cleanPhone, customer_name, cleanPhone, customer_email]
      );
      contactId = newContact.insertId;
    }

    // 3. Insert Appointment
    const [result] = await conn.query(
      `INSERT INTO appointments (
        agency_id, service_id, contact_id, staff_id, slot_id,
        customer_name, customer_phone, customer_email,
        service_name, appointment_date, appointment_time,
        duration, fee, channel, status, notes, booking_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
      [
        agency_id, service_id || null, contactId, finalStaffId, targetSlotId,
        customer_name, cleanPhone, customer_email,
        finalServiceName, finalDate, finalTime,
        finalDuration, finalFee, channel, notes, booking_source
      ]
    );

    await conn.commit();

    // Emit real-time socket event to the agency dashboard
    try {
      emitToAgency(agency_id, "new_appointment", {
        appointmentId: result.insertId,
        customerName: customer_name,
        date: finalDate,
        time: finalTime,
        service: finalServiceName,
        channel,
      });
    } catch (e) {
      // Non-blocking socket emission
    }

    return res.status(201).json({
      success: true,
      message: "Appointment booked successfully!",
      appointmentId: result.insertId,
      booking: {
        id: result.insertId,
        customerName: customer_name,
        date: finalDate,
        time: finalTime,
        service: finalServiceName,
        duration: finalDuration,
        fee: finalFee,
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
    const agencyId = req.user?.agencyId || (req.user?.role === "ADMIN" ? req.query.agencyId : null);
    if (!agencyId && req.user?.role !== "ADMIN") {
      return res.status(403).json({ success: false, message: "Workspace required" });
    }

    let query = `SELECT COUNT(*) as total,
              SUM(CASE WHEN appointment_date = CURDATE() THEN 1 ELSE 0 END) as today,
              SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled,
              SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
              SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
              SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as no_show,
              COALESCE(SUM(CASE WHEN status IN ('confirmed', 'completed') THEN fee ELSE 0 END), 0) as total_revenue
       FROM appointments`;
    const params = [];
    if (agencyId) {
      query += " WHERE agency_id = ?";
      params.push(agencyId);
    }

    const [totalRows] = await pool.query(query, params);

    const stats = totalRows[0] || { total: 0, today: 0, scheduled: 0, confirmed: 0, completed: 0, cancelled: 0, no_show: 0, total_revenue: 0 };
    return res.json({ success: true, stats });
  } catch (err) {
    console.error("[APPOINTMENT STATS ERROR]", err);
    return res.status(500).json({ success: false, message: "Error fetching appointment statistics" });
  }
});

// GET /api/v1/appointments - List with filters & pagination
router.get("/appointments", async (req, res) => {
  try {
    const agencyId = req.user?.agencyId || (req.user?.role === "ADMIN" ? req.query.agencyId : null);
    if (!agencyId && req.user?.role !== "ADMIN") {
      return res.status(403).json({ success: false, message: "Workspace required" });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 15);
    const offset = (page - 1) * limit;

    const { search, status, channel, staffId, serviceId, date, fromDate, toDate } = req.query;

    let whereSql = "WHERE 1=1";
    const params = [];
    if (agencyId) {
      whereSql += " AND a.agency_id = ?";
      params.push(agencyId);
    }

    const searchClause = await buildSearch({
      term: search,
      fulltext: [{
        table: "appointments",
        columns: ["customer_name", "service_name"],
        expr: "a.customer_name, a.service_name",
        weight: 4,
      }],
      like: ["a.customer_name", "a.customer_phone", "a.service_name"],
      boost: { expr: "a.customer_name" },
    });
    if (searchClause.active) {
      whereSql += ` AND ${searchClause.where}`;
      params.push(...searchClause.whereParams);
    }

    if (status && status !== "all") {
      whereSql += " AND a.status = ?";
      params.push(status);
    }

    if (channel && channel !== "all") {
      whereSql += " AND a.channel = ?";
      params.push(channel);
    }

    if (staffId && staffId !== "all") {
      whereSql += " AND a.staff_id = ?";
      params.push(staffId);
    }

    if (serviceId && serviceId !== "all") {
      whereSql += " AND a.service_id = ?";
      params.push(serviceId);
    }

    if (date) {
      whereSql += " AND a.appointment_date = ?";
      params.push(date);
    } else if (fromDate && toDate) {
      whereSql += " AND a.appointment_date BETWEEN ? AND ?";
      params.push(fromDate, toDate);
    } else if (fromDate) {
      whereSql += " AND a.appointment_date >= ?";
      params.push(fromDate);
    }

    // Count query
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM appointments a ${whereSql}`,
      params
    );
    const total = countResult[0]?.total || 0;

    // Data query with service details
    const dataSql = `
      SELECT a.*,
             u.name AS staff_name,
             u.email AS staff_email,
             c.avatar AS contact_avatar,
             c.platform AS contact_platform,
             s.name AS service_catalog_name,
             s.color AS service_color,
             sl.start_time AS slot_start_time,
             sl.end_time AS slot_end_time
      FROM appointments a
      LEFT JOIN users u ON u.id = a.staff_id
      LEFT JOIN contacts c ON c.id = a.contact_id
      LEFT JOIN appointment_services s ON s.id = a.service_id
      LEFT JOIN appointment_slots sl ON sl.id = a.slot_id
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

// GET /api/v1/appointments/:id - Fetch single appointment
router.get("/appointments/:id", async (req, res) => {
  try {
    const agencyId = req.user?.agencyId;
    const { id } = req.params;

    const [rows] = await pool.query(
      `SELECT a.*,
              u.name AS staff_name,
              u.email AS staff_email,
              c.avatar AS contact_avatar,
              c.platform AS contact_platform,
              s.name AS service_catalog_name,
              s.color AS service_color,
              s.description AS service_description,
              sl.start_time AS slot_start_time,
              sl.end_time AS slot_end_time
       FROM appointments a
       LEFT JOIN users u ON u.id = a.staff_id
       LEFT JOIN contacts c ON c.id = a.contact_id
       LEFT JOIN appointment_services s ON s.id = a.service_id
       LEFT JOIN appointment_slots sl ON sl.id = a.slot_id
       WHERE a.id = ? AND a.agency_id = ?`,
      [id, agencyId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    return res.json({ success: true, appointment: rows[0] });
  } catch (err) {
    console.error("[GET SINGLE APPOINTMENT ERROR]", err);
    return res.status(500).json({ success: false, message: "Failed to fetch appointment" });
  }
});

// POST /api/v1/appointments - Internal booking (Live Chat agent / Workspace Manager)
router.post("/appointments", async (req, res) => {
  const agencyId = req.user?.agencyId;
  if (!agencyId && req.user?.role !== "ADMIN") {
    return res.status(403).json({ success: false, message: "Workspace required" });
  }

  const {
    service_id = null,
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

    const cleanSlotId = slot_id ? parseInt(slot_id) : null;
    const cleanStaffId = staff_id ? parseInt(staff_id) : null;
    const cleanServiceId = service_id ? parseInt(service_id) : null;
    const cleanContactId = contact_id ? parseInt(contact_id) : null;
    const cleanEmail = customer_email && String(customer_email).trim() ? String(customer_email).trim() : null;

    if (cleanSlotId) {
      const [slots] = await conn.query(
        "SELECT id, booked_count, max_capacity FROM appointment_slots WHERE id = ? AND agency_id = ? FOR UPDATE",
        [cleanSlotId, agencyId]
      );
      if (slots.length && slots[0].booked_count < slots[0].max_capacity) {
        await conn.query("UPDATE appointment_slots SET booked_count = booked_count + 1 WHERE id = ?", [cleanSlotId]);
      }
    }

    const [result] = await conn.query(
      `INSERT INTO appointments (
        agency_id, service_id, contact_id, staff_id, slot_id,
        customer_name, customer_phone, customer_email,
        service_name, appointment_date, appointment_time,
        duration, fee, payment_status, channel, status, notes, booking_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'AGENT')`,
      [
        agencyId, cleanServiceId, cleanContactId, cleanStaffId, cleanSlotId,
        customer_name, customer_phone, cleanEmail,
        service_name, appointment_date, appointment_time,
        parseInt(duration) || 30, parseFloat(fee) || 0, payment_status || "unpaid", channel || "MANUAL", status || "scheduled", notes || null
      ]
    );

    await conn.commit();

    try {
      emitToAgency(agencyId, "new_appointment", {
        appointmentId: result.insertId,
        customerName: customer_name,
        date: appointment_date,
        time: appointment_time,
        service: service_name,
        channel,
      });
    } catch (e) {}

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

// PUT /api/v1/appointments/:id - Full update (reschedule, change service, edit notes)
router.put("/appointments/:id", async (req, res) => {
  const agencyId = req.user?.agencyId;
  const { id } = req.params;

  const {
    customer_name,
    customer_phone,
    customer_email,
    service_id,
    service_name,
    appointment_date,
    appointment_time,
    duration,
    fee,
    payment_status,
    staff_id,
    slot_id,
    notes,
    status,
  } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.query(
      "SELECT * FROM appointments WHERE id = ? AND agency_id = ? FOR UPDATE",
      [id, agencyId]
    );

    if (!existing.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    const prev = existing[0];

    // If slot changed, adjust capacity on old and new slots
    if (slot_id !== undefined && slot_id !== prev.slot_id) {
      if (prev.slot_id && prev.status !== "cancelled") {
        await conn.query(
          "UPDATE appointment_slots SET booked_count = GREATEST(0, booked_count - 1) WHERE id = ?",
          [prev.slot_id]
        );
      }
      if (slot_id) {
        await conn.query(
          "UPDATE appointment_slots SET booked_count = booked_count + 1 WHERE id = ?",
          [slot_id]
        );
      }
    }

    const updates = [];
    const params = [];

    if (customer_name !== undefined) { updates.push("customer_name = ?"); params.push(customer_name); }
    if (customer_phone !== undefined) { updates.push("customer_phone = ?"); params.push(customer_phone); }
    if (customer_email !== undefined) { updates.push("customer_email = ?"); params.push(customer_email); }
    if (service_id !== undefined) { updates.push("service_id = ?"); params.push(service_id || null); }
    if (service_name !== undefined) { updates.push("service_name = ?"); params.push(service_name); }
    if (appointment_date !== undefined) { updates.push("appointment_date = ?"); params.push(appointment_date); }
    if (appointment_time !== undefined) { updates.push("appointment_time = ?"); params.push(appointment_time); }
    if (duration !== undefined) { updates.push("duration = ?"); params.push(parseInt(duration)); }
    if (fee !== undefined) { updates.push("fee = ?"); params.push(parseFloat(fee)); }
    if (payment_status !== undefined) { updates.push("payment_status = ?"); params.push(payment_status); }
    if (staff_id !== undefined) { updates.push("staff_id = ?"); params.push(staff_id || null); }
    if (slot_id !== undefined) { updates.push("slot_id = ?"); params.push(slot_id || null); }
    if (notes !== undefined) { updates.push("notes = ?"); params.push(notes); }
    if (status !== undefined) { updates.push("status = ?"); params.push(status); }

    if (updates.length > 0) {
      params.push(id, agencyId);
      await conn.query(`UPDATE appointments SET ${updates.join(", ")} WHERE id = ? AND agency_id = ?`, params);
    }

    await conn.commit();

    try {
      emitToAgency(agencyId, "appointment_updated", { id, status: status || prev.status });
    } catch (e) {}

    return res.json({ success: true, message: "Appointment updated successfully" });
  } catch (err) {
    await conn.rollback();
    console.error("[UPDATE APPOINTMENT ERROR]", err);
    return res.status(500).json({ success: false, message: "Failed to update appointment" });
  } finally {
    conn.release();
  }
});

// PUT /api/v1/appointments/:id/status - Update status (confirm, cancel, complete)
router.put("/appointments/:id/status", async (req, res) => {
  const agencyId = req.user?.agencyId;
  const { id } = req.params;
  const { status, cancellation_reason } = req.body;

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

    await conn.query(
      "UPDATE appointments SET status = ?, cancellation_reason = ? WHERE id = ?",
      [status, cancellation_reason || null, id]
    );

    await conn.commit();

    try {
      emitToAgency(agencyId, "appointment_updated", { id, status });
    } catch (e) {}

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

    try {
      emitToAgency(agencyId, "appointment_deleted", { id });
    } catch (e) {}

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
