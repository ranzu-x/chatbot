import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { broadcastAgentAlert } from "../services/notificationService.js";

const router = express.Router();
router.use(authMiddleware);

// ─── GET NOTIFICATION SETTINGS ───────────────────────────────────────────────
router.get("/notifications/settings", async (req, res) => {
  try {
    const userId = req.user.id;
    const agencyId = req.user.agencyId || 1;

    const [rows] = await pool.query(
      "SELECT * FROM user_notification_settings WHERE user_id = ? LIMIT 1",
      [userId]
    );

    if (!rows.length) {
      // Default settings
      return res.json({
        success: true,
        settings: {
          soundEnabled: true,
          pushEnabled: true,
          notifyNewMessage: true,
          notifyHandover: true,
        },
      });
    }

    const s = rows[0];
    return res.json({
      success: true,
      settings: {
        soundEnabled: Boolean(s.sound_enabled),
        pushEnabled: Boolean(s.push_enabled),
        notifyNewMessage: Boolean(s.notify_new_message),
        notifyHandover: Boolean(s.notify_handover),
      },
    });
  } catch (err) {
    console.error("Get notification settings error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── UPDATE NOTIFICATION SETTINGS ───────────────────────────────────────────
router.put("/notifications/settings", async (req, res) => {
  try {
    const userId = req.user.id;
    const agencyId = req.user.agencyId || 1;
    const { soundEnabled = true, pushEnabled = true, notifyNewMessage = true, notifyHandover = true } = req.body;

    await pool.query(
      `INSERT INTO user_notification_settings (
        user_id, agency_id, sound_enabled, push_enabled, notify_new_message, notify_handover
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        sound_enabled = VALUES(sound_enabled),
        push_enabled = VALUES(push_enabled),
        notify_new_message = VALUES(notify_new_message),
        notify_handover = VALUES(notify_handover)`,
      [
        userId,
        agencyId,
        soundEnabled ? 1 : 0,
        pushEnabled ? 1 : 0,
        notifyNewMessage ? 1 : 0,
        notifyHandover ? 1 : 0,
      ]
    );

    return res.json({ success: true, message: "Notification preferences saved!" });
  } catch (err) {
    console.error("Update notification settings error:", err);
    return res.status(500).json({ success: false, message: "Failed to save settings" });
  }
});

// ─── SAVE WEBPUSH SUBSCRIPTION ───────────────────────────────────────────────
router.post("/notifications/subscribe", async (req, res) => {
  try {
    const userId = req.user.id;
    const agencyId = req.user.agencyId || 1;
    const { endpoint, keys, userAgent } = req.body;

    if (!endpoint) return res.status(400).json({ success: false, message: "Endpoint required" });

    await pool.query(
      `INSERT INTO push_subscriptions (user_id, agency_id, endpoint, p256dh_key, auth_key, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, agencyId, endpoint, keys?.p256dh || null, keys?.auth || null, userAgent || null]
    );

    return res.json({ success: true, message: "Push subscription saved" });
  } catch (err) {
    console.error("Save push subscription error:", err);
    return res.status(500).json({ success: false, message: "Subscription failed" });
  }
});

// ─── TEST NOTIFICATION ALERT ────────────────────────────────────────────────
router.post("/notifications/test-alert", async (req, res) => {
  try {
    const agencyId = req.user.agencyId || 1;
    const { eventType = "NEW_MESSAGE" } = req.body;

    const titles = {
      NEW_MESSAGE: "New Customer Message",
      HANDOVER_REQUEST: "🚨 Human Agent Takeover Requested",
      ORDER_PAID: "💰 In-Chat Order Payment Received ($49.99)",
    };

    const bodies = {
      NEW_MESSAGE: "Alex: 'Hi, I need help choosing a subscription plan.'",
      HANDOVER_REQUEST: "Customer requested live assistance in WhatsApp chat #104.",
      ORDER_PAID: "Customer completed checkout for VIP Consultation.",
    };

    await broadcastAgentAlert({
      agencyId,
      title: titles[eventType] || "Test Notification",
      body: bodies[eventType] || "This is a live test alert.",
      eventType,
      channel: "WHATSAPP",
    });

    return res.json({ success: true, message: "Test alert dispatched!" });
  } catch (err) {
    console.error("Test alert error:", err);
    return res.status(500).json({ success: false, message: "Failed to dispatch test alert" });
  }
});

export default router;
