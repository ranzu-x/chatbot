import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";

// The signed-in user's own in-app notifications (top-bar bell,
// chatbot_ui/src/Components/NotificationBell.jsx). Every query is anchored on
// req.user.id — a user can only ever see or mark their own rows. Rows are
// created by POST /admin/users/bulk-notify (routes/admin.js), which also
// pushes them live via emitToUser(..., "user_notification").
const router = express.Router();
router.use("/me/notifications", authMiddleware);

const LIST_LIMIT = 30;

router.get("/me/notifications", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, body, link, read_at, created_at
       FROM user_notifications WHERE user_id = ?
       ORDER BY created_at DESC, id DESC LIMIT ?`,
      [req.user.id, LIST_LIMIT]
    );
    const [[{ unread }]] = await pool.query(
      "SELECT COUNT(*) AS unread FROM user_notifications WHERE user_id = ? AND read_at IS NULL",
      [req.user.id]
    );
    return res.json({ success: true, notifications: rows, unread: Number(unread || 0) });
  } catch (err) {
    console.error("GET /me/notifications error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/me/notifications/read-all", async (req, res) => {
  try {
    await pool.query("UPDATE user_notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL", [req.user.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error("POST /me/notifications/read-all error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/me/notifications/:id/read", async (req, res) => {
  try {
    const [result] = await pool.query(
      "UPDATE user_notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Notification not found" });
    return res.json({ success: true });
  } catch (err) {
    console.error("POST /me/notifications/:id/read error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
