import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { emitToAgency } from "../utils/socket.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

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
    const { title, body, shortcut } = req.body;

    if (!title || !body) {
      return res.status(400).json({ success: false, message: "Title and body are required" });
    }

    // Shortcut is optional (e.g. "greeting" for a "/greeting" match in the
    // composer) — strip a leading slash if the agent typed one, normalize
    // to lowercase so matching is case-insensitive.
    const normalizedShortcut = shortcut ? shortcut.trim().replace(/^\//, "").toLowerCase() || null : null;

    const [result] = await pool.query(
      "INSERT INTO quick_replies (agency_id, title, shortcut, body, created_at) VALUES (?, ?, ?, ?, NOW())",
      [agencyId, title, normalizedShortcut, body]
    );

    const [saved] = await pool.query("SELECT * FROM quick_replies WHERE id = ?", [result.insertId]);
    emitToAgency(agencyId, "canned_response_updated", { reason: "created" });
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
    const { title, body, shortcut } = req.body;

    const [existing] = await pool.query(
      "SELECT id FROM quick_replies WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );

    if (!existing.length) {
      return res.status(404).json({ success: false, message: "Canned response not found" });
    }

    const normalizedShortcut = shortcut ? shortcut.trim().replace(/^\//, "").toLowerCase() || null : null;

    await pool.query(
      "UPDATE quick_replies SET title = ?, shortcut = ?, body = ? WHERE id = ? AND agency_id = ?",
      [title, normalizedShortcut, body, req.params.id, agencyId]
    );

    const [updated] = await pool.query("SELECT * FROM quick_replies WHERE id = ?", [req.params.id]);
    emitToAgency(agencyId, "canned_response_updated", { reason: "updated" });
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
    emitToAgency(agencyId, "canned_response_updated", { reason: "deleted" });
    return res.json({ success: true, message: "Canned response deleted" });
  } catch (err) {
    console.error("Delete canned response error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
