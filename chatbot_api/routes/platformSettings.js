/**
 * Global (not per-agency) platform settings — the first genuine
 * platform-wide switch in this codebase. Currently just the AI-for-
 * resellers gate; the shape is a plain key/value table so more toggles can
 * be added later without a new migration each time.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();
router.use(authMiddleware);

router.get("/admin/platform-settings", requirePermission("admin.settings.manage", "admin.dashboard.view"), async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT setting_key, value, updated_at FROM platform_settings");
    const settings = {};
    for (const r of rows) {
      settings[r.setting_key] = typeof r.value === "string" ? JSON.parse(r.value) : r.value;
    }
    return res.json({ success: true, settings });
  } catch (err) {
    console.error("GET /admin/platform-settings error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/admin/platform-settings/:key", requirePermission("admin.settings.manage"), async (req, res) => {
  try {
    const { key } = req.params;
    const value = req.body?.value ?? req.body ?? {};
    await pool.query(
      "INSERT INTO platform_settings (setting_key, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
      [key, JSON.stringify(value)]
    );
    return res.json({ success: true, message: "Setting updated" });
  } catch (err) {
    console.error("PUT /admin/platform-settings/:key error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
