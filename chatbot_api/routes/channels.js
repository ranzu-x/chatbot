import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("AGENCY", "ADMIN"));

// ═══════════════════════════════════════════════════════════════════
//  WHATSAPP
// ═══════════════════════════════════════════════════════════════════

router.get("/channels/whatsapp", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM integrations WHERE agency_id = ? AND platform = 'WHATSAPP' ORDER BY created_at DESC",
      [req.user.agencyId]
    );
    return res.json({ success: true, accounts: rows });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.post("/channels/whatsapp", async (req, res) => {
  const { name, accessToken, verifyToken, waPhoneNumberId, waBusinessAccId } = req.body;
  if (!name || !accessToken || !waPhoneNumberId)
    return res.status(400).json({ success: false, message: "Name, access token and phone number ID are required" });
  try {
    await pool.query(
      `INSERT INTO integrations (agency_id, platform, name, access_token, verify_token, wa_phone_number_id, wa_business_acc_id)
       VALUES (?, 'WHATSAPP', ?, ?, ?, ?, ?)`,
      [req.user.agencyId, name, accessToken, verifyToken || null, waPhoneNumberId, waBusinessAccId || null]
    );
    return res.status(201).json({ success: true, message: "WhatsApp account connected" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.delete("/channels/whatsapp/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'WHATSAPP'",
      [req.params.id, req.user.agencyId]);
    return res.json({ success: true, message: "WhatsApp account removed" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ═══════════════════════════════════════════════════════════════════
//  FACEBOOK MESSENGER
// ═══════════════════════════════════════════════════════════════════

router.get("/channels/facebook", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM integrations WHERE agency_id = ? AND platform = 'FACEBOOK' ORDER BY created_at DESC",
      [req.user.agencyId]
    );
    return res.json({ success: true, pages: rows });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.post("/channels/facebook", async (req, res) => {
  const { name, accessToken, verifyToken, fbPageId, fbPageName } = req.body;
  if (!name || !accessToken || !fbPageId)
    return res.status(400).json({ success: false, message: "Name, access token and page ID are required" });
  try {
    await pool.query(
      `INSERT INTO integrations (agency_id, platform, name, access_token, verify_token, fb_page_id, fb_page_name)
       VALUES (?, 'FACEBOOK', ?, ?, ?, ?, ?)`,
      [req.user.agencyId, name, accessToken, verifyToken || null, fbPageId, fbPageName || null]
    );
    return res.status(201).json({ success: true, message: "Facebook page connected" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ─── Import pages from Facebook Graph API ─────────────────────────
router.post("/channels/facebook/import-pages", async (req, res) => {
  const { userAccessToken } = req.body;
  if (!userAccessToken)
    return res.status(400).json({ success: false, message: "User access token required" });
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${userAccessToken}`
    );
    const data = await response.json();
    if (data.error) return res.status(400).json({ success: false, message: data.error.message });
    return res.json({ success: true, pages: data.data || [] });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Failed to fetch pages" }); }
});

router.delete("/channels/facebook/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'FACEBOOK'",
      [req.params.id, req.user.agencyId]);
    return res.json({ success: true, message: "Facebook page removed" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ═══════════════════════════════════════════════════════════════════
//  INSTAGRAM
// ═══════════════════════════════════════════════════════════════════

router.get("/channels/instagram", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM integrations WHERE agency_id = ? AND platform = 'INSTAGRAM' ORDER BY created_at DESC",
      [req.user.agencyId]
    );
    return res.json({ success: true, accounts: rows });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.post("/channels/instagram", async (req, res) => {
  const { name, accessToken, verifyToken, igAccountId, igUsername } = req.body;
  if (!name || !accessToken || !igAccountId)
    return res.status(400).json({ success: false, message: "Name, access token and account ID are required" });
  try {
    await pool.query(
      `INSERT INTO integrations (agency_id, platform, name, access_token, verify_token, ig_account_id, ig_username)
       VALUES (?, 'INSTAGRAM', ?, ?, ?, ?, ?)`,
      [req.user.agencyId, name, accessToken, verifyToken || null, igAccountId, igUsername || null]
    );
    return res.status(201).json({ success: true, message: "Instagram account connected" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.delete("/channels/instagram/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'INSTAGRAM'",
      [req.params.id, req.user.agencyId]);
    return res.json({ success: true, message: "Instagram account removed" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ═══════════════════════════════════════════════════════════════════
//  TELEGRAM
// ═══════════════════════════════════════════════════════════════════

router.get("/channels/telegram", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM telegram_bots WHERE agency_id = ? ORDER BY created_at DESC",
      [req.user.agencyId]
    );
    return res.json({ success: true, bots: rows });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.post("/channels/telegram", async (req, res) => {
  const { botToken } = req.body;
  if (!botToken) return res.status(400).json({ success: false, message: "Bot token is required" });
  try {
    // Verify token with Telegram API
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const tgData = await tgRes.json();
    if (!tgData.ok) return res.status(400).json({ success: false, message: "Invalid Telegram bot token" });

    const { first_name, username } = tgData.result;

    // Create integration record
    const [integ] = await pool.query(
      `INSERT INTO integrations (agency_id, platform, name, access_token, verify_token)
       VALUES (?, 'TELEGRAM', ?, ?, ?)`,
      [req.user.agencyId, `${first_name} (@${username})`, botToken, null]
    );

    // Save telegram bot record
    const [result] = await pool.query(
      `INSERT INTO telegram_bots (agency_id, integration_id, bot_token, bot_username, bot_name, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [req.user.agencyId, integ.insertId, botToken, username, first_name]
    );

    // Set webhook
    const webhookUrl = `${process.env.BACKEND_URL || `http://localhost:5000`}/api/v1/webhook/telegram/${req.user.agencyId}/${integ.insertId}`;
    const webhookRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
    const webhookData = await webhookRes.json();

    if (webhookData.ok) {
      await pool.query("UPDATE telegram_bots SET webhook_set = 1 WHERE id = ?", [result.insertId]);
    }

    return res.status(201).json({
      success: true,
      message: `Telegram bot @${username} connected`,
      botName: first_name,
      botUsername: username,
      webhookSet: webhookData.ok,
    });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.delete("/channels/telegram/:id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT bot_token FROM telegram_bots WHERE id = ? AND agency_id = ?",
      [req.params.id, req.user.agencyId]
    );
    if (rows.length) {
      await fetch(`https://api.telegram.org/bot${rows[0].bot_token}/deleteWebhook`).catch(() => {});
    }
    await pool.query("DELETE FROM telegram_bots WHERE id = ? AND agency_id = ?", [req.params.id, req.user.agencyId]);
    return res.json({ success: true, message: "Telegram bot removed" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ═══════════════════════════════════════════════════════════════════
//  WEBCHAT
// ═══════════════════════════════════════════════════════════════════

router.get("/channels/webchat", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM webchat_widgets WHERE agency_id = ? ORDER BY created_at DESC",
      [req.user.agencyId]
    );
    return res.json({ success: true, widgets: rows });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.post("/channels/webchat", async (req, res) => {
  const { name, primaryColor, greetingMessage, placeholderText, allowedDomains } = req.body;
  if (!name) return res.status(400).json({ success: false, message: "Widget name is required" });
  try {
    // Create integration record
    const [integ] = await pool.query(
      "INSERT INTO integrations (agency_id, platform, name, is_active) VALUES (?, 'WEBCHAT', ?, 1)",
      [req.user.agencyId, name]
    );

    const widgetKey = `wc_${req.user.agencyId}_${Date.now()}`;
    await pool.query(
      `INSERT INTO webchat_widgets (agency_id, integration_id, name, widget_key, primary_color, greeting_message, placeholder_text, allowed_domains)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.agencyId, integ.insertId, name, widgetKey,
        primaryColor || "#6366f1", greetingMessage || "Hello! How can we help you today?",
        placeholderText || "Type a message…", allowedDomains || null]
    );
    return res.status(201).json({ success: true, message: "Webchat widget created", widgetKey });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.put("/channels/webchat/:id", async (req, res) => {
  const { name, primaryColor, greetingMessage, placeholderText, allowedDomains, isActive } = req.body;
  try {
    await pool.query(
      `UPDATE webchat_widgets SET name=?, primary_color=?, greeting_message=?, placeholder_text=?, allowed_domains=?, is_active=?
       WHERE id=? AND agency_id=?`,
      [name, primaryColor, greetingMessage, placeholderText, allowedDomains, isActive ?? 1, req.params.id, req.user.agencyId]
    );
    return res.json({ success: true, message: "Widget updated" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.delete("/channels/webchat/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM webchat_widgets WHERE id = ? AND agency_id = ?", [req.params.id, req.user.agencyId]);
    return res.json({ success: true, message: "Widget deleted" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

export default router;
