import express from "express";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";

const router = express.Router();

// ✅ Get all patients
router.get("/medicines", authMiddleWare, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM medicines");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;