import express from "express";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";

const router = express.Router();

// Middleware to check if user is a super admin
const superAdminOnly = (req, res, next) => {
  const roles = req.user.roles || [];
  if (roles.some(role => role.toLowerCase() === 'super_admin')) {
    next();
  } else {
    res.status(403).json({ message: "Access denied. Super Admin role required." });
  }
};

// GET all hospitals
router.get("/superadmin/hospitals", authMiddleWare, superAdminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, hospital_name, hospital_code, email, phone, status, subscription_plan, expiry_date, created_at 
      FROM hospitals 
      ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching hospitals" });
  }
});

// UPDATE hospital subscription
router.put("/superadmin/hospitals/:id/subscription", authMiddleWare, superAdminOnly, async (req, res) => {
  const { id } = req.params;
  const { plan, expiryDate } = req.body;
  try {
    await pool.query(
      "UPDATE hospitals SET subscription_plan = ?, expiry_date = ? WHERE id = ?",
      [plan, expiryDate, id]
    );
    res.json({ message: "Subscription updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating subscription" });
  }
});

// UPDATE hospital status (Active/Suspended)
router.put("/superadmin/hospitals/:id/status", authMiddleWare, superAdminOnly, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  try {
    await pool.query(
      "UPDATE hospitals SET status = ? WHERE id = ?",
      [status, id]
    );
    res.json({ message: `Hospital ${status} successfully` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error updating hospital status" });
  }
});

export default router;
