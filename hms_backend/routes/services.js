import express from "express";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";
import { requireRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.get("/services", authMiddleWare, async (req, res) => {
  try {
    const [services] = await pool.query(
      `
      SELECT id, service_name, price, description, is_active 
      FROM services 
      WHERE is_active = TRUE 
      ORDER BY service_name ASC;
      `
    );
    res.status(200).json(services);
  } catch (error) {
    console.error("❌ Error fetching services:", error);
    res.status(500).json({ message: "Server error while fetching services." });
  }
});

// Create new service
router.post("/services", authMiddleWare, requireRole(["hospital_admin"]), async (req, res) => {
  const { service_name, price, description } = req.body;
  try {
    const [result] = await pool.query(
      "INSERT INTO services (service_name, price, description, is_active) VALUES (?, ?, ?, 1)",
      [service_name, price, description]
    );
    res.status(201).json({ message: "Service created successfully", id: result.insertId });
  } catch (error) {
    console.error("❌ Error creating service:", error);
    res.status(500).json({ message: "Server error while creating service." });
  }
});

// Update service (including price)
router.put("/services/:id", authMiddleWare, requireRole(["hospital_admin"]), async (req, res) => {
  const { id } = req.params;
  const { service_name, price, description, is_active } = req.body;
  
  try {
    await pool.query(
      "UPDATE services SET service_name = ?, price = ?, description = ?, is_active = ? WHERE id = ?",
      [service_name, price, description, is_active, id]
    );
    res.json({ message: "Service updated successfully" });
  } catch (error) {
    console.error("❌ Error updating service:", error);
    res.status(500).json({ message: "Server error while updating service." });
  }
});

export default router;