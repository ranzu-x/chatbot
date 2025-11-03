import express from "express";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";

const router = express.Router();

// ✅ Get all team members (exclude hospital_admin)
router.get("/team-members", authMiddleWare, async (req, res) => {
  try {
    const hospitalId = req.user.hospital_id;

    const [rows] = await pool.query(
      `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.age,
        u.gender,
        u.phone,
        u.email,
        r.name AS role_name
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.hospital_id = ?
        AND (r.name IS NULL OR r.name != 'hospital_admin')
      ORDER BY u.created_at DESC;
      `,
      [hospitalId]
    );

    console.log("✅ Hospital ID:", hospitalId);
    console.log(`✅ Found ${rows.length} staff members.`);

    res.json(rows);
  } catch (err) {
    console.error("❌ Error fetching team members:", err);
    res.status(500).json({ error: err.message });
  }
});


// Get all doctors

router.get("/doctors", authMiddleWare, async (req, res) => {
    try {
        const hospitalId = req.user.hospital_id;

        const [rows] = await pool.query(
            `SELECT DISTINCT u.*
             FROM users u
             JOIN user_roles ur ON u.id = ur.user_id
             JOIN roles r ON ur.role_id = r.id
             WHERE u.hospital_id = ?
               AND r.name = 'doctor'`,
            [hospitalId]
        );

        console.log("Hospital ID:", hospitalId);
        console.log("Doctors found:", rows.length);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching doctors:", err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
