import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { requireModule, requireLimit } from "../utils/entitlements.js";
import { canUsePublicBooking, bookingKey, bookingUrl } from "../utils/publicBooking.js";

const router = express.Router();

// ─── PUBLIC: GET SERVICES FOR BOOKING WIDGET & BOTS ──────────────────────────
router.get("/appointment-services/public", async (req, res) => {
  try {
    const agencyId = req.query.agencyId || req.query.agency_id;
    if (!agencyId) {
      return res.status(400).json({ success: false, message: "agencyId is required" });
    }
    if (!canUsePublicBooking(req, agencyId)) {
      return res.status(404).json({ success: false, message: "Booking page not found" });
    }

    const [services] = await pool.query(
      `SELECT id, agency_id, name, description, duration_minutes, price, currency, color, is_active
       FROM appointment_services
       WHERE agency_id = ? AND is_active = 1
       ORDER BY name ASC`,
      [agencyId]
    );

    return res.json({ success: true, services });
  } catch (err) {
    console.error("[GET PUBLIC SERVICES ERROR]", err);
    return res.status(500).json({ success: false, message: "Failed to fetch services" });
  }
});

// ─── PROTECTED: AGENCY SERVICES MANAGEMENT ───────────────────────────────────
router.use("/appointment-services", authMiddleware, requireModule("feature_appointments"));

// GET /api/v1/appointment-services/booking-link — the workspace's public
// booking portal URL, with its key (utils/publicBooking.js).
router.get("/appointment-services/booking-link", (req, res) => {
  const agencyId = req.tenant?.agencyId ?? req.user?.agencyId;
  if (!agencyId) return res.status(403).json({ success: false, message: "Workspace required" });
  return res.json({ success: true, url: bookingUrl(agencyId), key: bookingKey(agencyId) });
});

// GET /api/v1/appointment-services - List all services for workspace
router.get("/appointment-services", async (req, res) => {
  try {
    const agencyId = req.user?.agencyId;
    if (!agencyId && req.user?.role !== "ADMIN") {
      return res.status(403).json({ success: false, message: "Workspace required" });
    }

    const targetAgencyId = agencyId || req.query.agencyId;
    const [services] = await pool.query(
      `SELECT s.*, 
              (SELECT COUNT(*) FROM appointments a WHERE a.service_id = s.id) as appointment_count
       FROM appointment_services s
       WHERE s.agency_id = ?
       ORDER BY s.is_active DESC, s.name ASC`,
      [targetAgencyId]
    );

    return res.json({ success: true, services });
  } catch (err) {
    console.error("[GET SERVICES ERROR]", err);
    return res.status(500).json({ success: false, message: "Failed to fetch services" });
  }
});

// POST /api/v1/appointment-services - Create new service
router.post("/appointment-services", requireLimit("max_appointment_services"), async (req, res) => {
  try {
    const agencyId = req.user?.agencyId;
    if (!agencyId && req.user?.role !== "ADMIN") {
      return res.status(403).json({ success: false, message: "Workspace required" });
    }

    const {
      name,
      description = null,
      duration_minutes = 30,
      price = 0.00,
      currency = "USD",
      color = "#6366f1",
      is_active = 1,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Service name is required" });
    }

    const [result] = await pool.query(
      `INSERT INTO appointment_services (agency_id, name, description, duration_minutes, price, currency, color, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [agencyId, name.trim(), description, parseInt(duration_minutes) || 30, parseFloat(price) || 0.0, currency, color, is_active ? 1 : 0]
    );

    const [created] = await pool.query("SELECT * FROM appointment_services WHERE id = ?", [result.insertId]);

    return res.status(201).json({
      success: true,
      message: "Service created successfully",
      service: created[0],
    });
  } catch (err) {
    console.error("[CREATE SERVICE ERROR]", err);
    return res.status(500).json({ success: false, message: "Failed to create service" });
  }
});

// PUT /api/v1/appointment-services/:id - Update service
router.put("/appointment-services/:id", async (req, res) => {
  try {
    const agencyId = req.user?.agencyId;
    const { id } = req.params;

    const [existing] = await pool.query(
      "SELECT id FROM appointment_services WHERE id = ? AND agency_id = ?",
      [id, agencyId]
    );
    if (!existing.length) {
      return res.status(404).json({ success: false, message: "Service not found" });
    }

    const {
      name,
      description,
      duration_minutes,
      price,
      currency,
      color,
      is_active,
    } = req.body;

    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push("name = ?");
      params.push(name.trim());
    }
    if (description !== undefined) {
      updates.push("description = ?");
      params.push(description);
    }
    if (duration_minutes !== undefined) {
      updates.push("duration_minutes = ?");
      params.push(parseInt(duration_minutes) || 30);
    }
    if (price !== undefined) {
      updates.push("price = ?");
      params.push(parseFloat(price) || 0.0);
    }
    if (currency !== undefined) {
      updates.push("currency = ?");
      params.push(currency);
    }
    if (color !== undefined) {
      updates.push("color = ?");
      params.push(color);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      params.push(is_active ? 1 : 0);
    }

    if (updates.length > 0) {
      params.push(id, agencyId);
      await pool.query(
        `UPDATE appointment_services SET ${updates.join(", ")} WHERE id = ? AND agency_id = ?`,
        params
      );
    }

    const [updated] = await pool.query("SELECT * FROM appointment_services WHERE id = ?", [id]);

    return res.json({
      success: true,
      message: "Service updated successfully",
      service: updated[0],
    });
  } catch (err) {
    console.error("[UPDATE SERVICE ERROR]", err);
    return res.status(500).json({ success: false, message: "Failed to update service" });
  }
});

// DELETE /api/v1/appointment-services/:id - Delete service
router.delete("/appointment-services/:id", async (req, res) => {
  try {
    const agencyId = req.user?.agencyId;
    const { id } = req.params;

    const [result] = await pool.query(
      "DELETE FROM appointment_services WHERE id = ? AND agency_id = ?",
      [id, agencyId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Service not found" });
    }

    return res.json({ success: true, message: "Service deleted successfully" });
  } catch (err) {
    console.error("[DELETE SERVICE ERROR]", err);
    return res.status(500).json({ success: false, message: "Failed to delete service" });
  }
});

export default router;
