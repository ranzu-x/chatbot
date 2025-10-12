import express from "express";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";

const router = express.Router();

// ✅ Get all team members (exclude hospital_admin)
router.get("/team-members", authMiddleWare, async (req, res) => {
    try {
        const hospitalId = req.user.hospital_id;

        const [rows] = await pool.query(
            `SELECT DISTINCT u.*
       FROM users u
       JOIN user_roles ur ON u.id = ur.user_id
       JOIN roles r ON ur.role_id = r.id
       WHERE u.hospital_id = ?
         AND r.name != "hospital_admin";`,
            [hospitalId]
        );

        console.log("This is the hospital Id", hospitalId);
        console.log("Team members found:", rows); // ✅ log this
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
