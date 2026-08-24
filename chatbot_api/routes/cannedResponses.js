import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("AGENCY", "ADMIN", "AGENT"));

// ─── LIST CANNED RESPONSES ───────────────────────────────────────────────────
router.get("/canned-responses", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query(
      "SELECT * FROM quick_replies WHERE agency_id = ? ORDER BY title ASC",
      [agencyId]
    );
    return res.json({ success: true, cannedResponses: rows });
  } catch (err) {
    console.error("List canned responses error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE CANNED RESPONSE ──────────────────────────────────────────────────
router.post("/canned-responses", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { title, body } = req.body;

    if (!title || !body) {
      return res.status(400).json({ success: false, message: "Title and body are required" });
    }

    const [result] = await pool.query(
      "INSERT INTO quick_replies (agency_id, title, body, created_at) VALUES (?, ?, ?, NOW())",
      [agencyId, title, body]
    );

    const [saved] = await pool.query("SELECT * FROM quick_replies WHERE id = ?", [result.insertId]);
    return res.status(201).json({ success: true, cannedResponse: saved[0] });
  } catch (err) {
    console.error("Create canned response error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── UPDATE CANNED RESPONSE ──────────────────────────────────────────────────
router.put("/canned-responses/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { title, body } = req.body;

    const [existing] = await pool.query(
      "SELECT id FROM quick_replies WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );

    if (!existing.length) {
      return res.status(404).json({ success: false, message: "Canned response not found" });
    }

    await pool.query(
      "UPDATE quick_replies SET title = ?, body = ? WHERE id = ? AND agency_id = ?",
      [title, body, req.params.id, agencyId]
    );

    const [updated] = await pool.query("SELECT * FROM quick_replies WHERE id = ?", [req.params.id]);
    return res.json({ success: true, cannedResponse: updated[0] });
  } catch (err) {
    console.error("Update canned response error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── DELETE CANNED RESPONSE ──────────────────────────────────────────────────
router.delete("/canned-responses/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    await pool.query("DELETE FROM quick_replies WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    return res.json({ success: true, message: "Canned response deleted" });
  } catch (err) {
    console.error("Delete canned response error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
