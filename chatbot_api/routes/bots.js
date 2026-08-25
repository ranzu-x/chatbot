import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("AGENCY", "ADMIN", "AGENT"));

// ─── GET ALL BOTS ─────────────────────────────────────────────────
router.get("/bots", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.*, i.name as integrationName, i.wa_phone_number_id, i.fb_page_name, i.ig_username,
             (SELECT COUNT(*) FROM bot_rules WHERE bot_id = b.id) as rulesCount,
             COUNT(c.id) as totalConversations
      FROM bots b
      LEFT JOIN integrations i ON i.id = b.integration_id
      LEFT JOIN conversations c ON c.integration_id = b.integration_id
      WHERE b.agency_id = ?
      GROUP BY b.id
      ORDER BY b.created_at DESC
    `, [req.user.agencyId]);
    return res.json({ success: true, bots: rows });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ─── GET SINGLE BOT WITH RULES ────────────────────────────────────
router.get("/bots/:id", async (req, res) => {
  try {
    const [bots] = await pool.query(
      "SELECT b.*, i.name as integrationName FROM bots b LEFT JOIN integrations i ON i.id = b.integration_id WHERE b.id = ? AND b.agency_id = ?",
      [req.params.id, req.user.agencyId]
    );
    if (!bots.length) return res.status(404).json({ success: false, message: "Bot not found" });
    const [rules] = await pool.query(
      "SELECT * FROM bot_rules WHERE bot_id = ? ORDER BY sort_order ASC", [req.params.id]
    );
    return res.json({ success: true, bot: bots[0], rules });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ─── CREATE BOT ───────────────────────────────────────────────────
router.post("/bots", async (req, res) => {
  const { name, platform, integrationId, welcomeMessage, awayMessage, collectEmail, collectPhone } = req.body;
  if (!name || !platform) return res.status(400).json({ success: false, message: "Name and platform are required" });
  try {
    const [result] = await pool.query(
      `INSERT INTO bots (agency_id, integration_id, name, platform, welcome_message, away_message, collect_email, collect_phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.agencyId, integrationId || null, name, platform,
        welcomeMessage || null, awayMessage || null,
        collectEmail ? 1 : 0, collectPhone ? 1 : 0]
    );
    return res.status(201).json({ success: true, message: "Bot created", botId: result.insertId });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ─── UPDATE BOT ───────────────────────────────────────────────────
router.put("/bots/:id", async (req, res) => {
  const { name, integrationId, welcomeMessage, awayMessage, collectEmail, collectPhone, isActive } = req.body;
  try {
    await pool.query(
      `UPDATE bots SET name=?, integration_id=?, welcome_message=?, away_message=?, collect_email=?, collect_phone=?, is_active=?
       WHERE id=? AND agency_id=?`,
      [name, integrationId || null, welcomeMessage || null, awayMessage || null,
        collectEmail ? 1 : 0, collectPhone ? 1 : 0, isActive ?? 1,
        req.params.id, req.user.agencyId]
    );
    return res.json({ success: true, message: "Bot updated" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ─── TOGGLE BOT ACTIVE ────────────────────────────────────────────
router.patch("/bots/:id/toggle", async (req, res) => {
  try {
    const [[bot]] = await pool.query("SELECT is_active FROM bots WHERE id=? AND agency_id=?", [req.params.id, req.user.agencyId]);
    if (!bot) return res.status(404).json({ success: false, message: "Bot not found" });
    const newStatus = !bot.is_active;
    await pool.query("UPDATE bots SET is_active=? WHERE id=?", [newStatus, req.params.id]);
    return res.json({ success: true, isActive: newStatus });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ─── DELETE BOT ───────────────────────────────────────────────────
router.delete("/bots/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM bots WHERE id=? AND agency_id=?", [req.params.id, req.user.agencyId]);
    return res.json({ success: true, message: "Bot deleted" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ─── BOT RULES ───────────────────────────────────────────────────
router.get("/bots/:id/rules", async (req, res) => {
  try {
    const [rules] = await pool.query("SELECT * FROM bot_rules WHERE bot_id=? ORDER BY sort_order ASC", [req.params.id]);
    return res.json({ success: true, rules });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.post("/bots/:id/rules", async (req, res) => {
  const { triggerKeyword, replyMessage, isExactMatch } = req.body;
  if (!triggerKeyword || !replyMessage)
    return res.status(400).json({ success: false, message: "Keyword and reply message are required" });
  try {
    const [[count]] = await pool.query("SELECT COUNT(*) as c FROM bot_rules WHERE bot_id=?", [req.params.id]);
    await pool.query(
      "INSERT INTO bot_rules (bot_id, trigger_keyword, reply_message, is_exact_match, sort_order) VALUES (?,?,?,?,?)",
      [req.params.id, triggerKeyword, replyMessage, isExactMatch ? 1 : 0, count.c]
    );
    return res.status(201).json({ success: true, message: "Rule added" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

router.delete("/bots/:botId/rules/:ruleId", async (req, res) => {
  try {
    await pool.query("DELETE FROM bot_rules WHERE id=?", [req.params.ruleId]);
    return res.json({ success: true, message: "Rule deleted" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

export default router;
