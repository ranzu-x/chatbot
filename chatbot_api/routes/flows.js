import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("AGENCY", "ADMIN", "AGENT"));

// ── LIST ──────────────────────────────────────────────────────────
router.get("/flows", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT f.*, b.name AS botName,
             i.name AS integration_name, i.fb_page_name, i.wa_phone_number_id, i.ig_username,
             tb.bot_username AS tg_bot_username,
             JSON_LENGTH(f.nodes_json) AS nodeCount
      FROM flows f
      LEFT JOIN bots b ON b.id = f.bot_id
      LEFT JOIN integrations i ON i.id = f.integration_id
      LEFT JOIN telegram_bots tb ON tb.integration_id = i.id
      WHERE f.agency_id = ?
      ORDER BY f.updated_at DESC
    `, [req.user.agencyId]);
    return res.json({ success: true, flows: rows });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ── GET ONE ───────────────────────────────────────────────────────
router.get("/flows/:id", async (req, res) => {
  try {
    const [[flow]] = await pool.query(
      `SELECT f.*,
              i.name AS integration_name, i.fb_page_name, i.wa_phone_number_id, i.ig_username, i.platform AS integration_platform,
              tb.bot_username AS tg_bot_username
       FROM flows f
       LEFT JOIN integrations i ON i.id = f.integration_id
       LEFT JOIN telegram_bots tb ON tb.integration_id = i.id
       WHERE f.id=? AND f.agency_id=?`,
      [req.params.id, req.user.agencyId]
    );
    if (!flow) return res.status(404).json({ success: false, message: "Flow not found" });
    flow.nodes_json = JSON.parse(flow.nodes_json || "[]");
    flow.edges_json = JSON.parse(flow.edges_json || "[]");
    return res.json({ success: true, flow });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ── CREATE ────────────────────────────────────────────────────────
router.post("/flows", async (req, res) => {
  const name = req.body.name;
  const platform = req.body.platform;
  const integrationId = req.body.integrationId || req.body.integration_id || null;
  const botId = req.body.botId || req.body.bot_id || null;
  const triggerKeyword = req.body.triggerKeyword || req.body.trigger_keyword || null;
  const triggerType = req.body.triggerType || req.body.trigger_type || 'KEYWORD';
  const nodes = req.body.nodesJson !== undefined ? req.body.nodesJson : req.body.nodes_json;
  const edges = req.body.edgesJson !== undefined ? req.body.edgesJson : req.body.edges_json;

  if (!name || !platform) return res.status(400).json({ success: false, message: "Name and platform are required" });

  const nodesStr = typeof nodes === "string" ? nodes : JSON.stringify(nodes || []);
  const edgesStr = typeof edges === "string" ? edges : JSON.stringify(edges || []);

  try {
    const [result] = await pool.query(
      `INSERT INTO flows (agency_id, bot_id, integration_id, name, platform, trigger_keyword, trigger_type, nodes_json, edges_json)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.user.agencyId, botId, integrationId, name, platform,
        triggerKeyword, triggerType,
        nodesStr, edgesStr]
    );
    return res.status(201).json({ success: true, message: "Flow created", flowId: result.insertId });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ── SAVE (update nodes+edges) ─────────────────────────────────────
router.put("/flows/:id", async (req, res) => {
  const name = req.body.name;
  const platform = req.body.platform;
  const integrationId = req.body.integrationId !== undefined ? req.body.integrationId : req.body.integration_id;
  const triggerKeyword = req.body.triggerKeyword || req.body.trigger_keyword || null;
  const triggerType = req.body.triggerType || req.body.trigger_type || 'KEYWORD';
  const botId = req.body.botId || req.body.bot_id || null;
  const nodes = req.body.nodesJson !== undefined ? req.body.nodesJson : req.body.nodes_json;
  const edges = req.body.edgesJson !== undefined ? req.body.edgesJson : req.body.edges_json;
  const isActive = req.body.isActive !== undefined ? req.body.isActive : (req.body.is_active !== undefined ? req.body.is_active : 1);

  const nodesStr = typeof nodes === "string" ? nodes : JSON.stringify(nodes || []);
  const edgesStr = typeof edges === "string" ? edges : JSON.stringify(edges || []);

  try {
    await pool.query(
      `UPDATE flows SET name=?, platform=COALESCE(?, platform), integration_id=?, trigger_keyword=?, trigger_type=?, bot_id=?,
       nodes_json=?, edges_json=?, is_active=? WHERE id=? AND agency_id=?`,
      [name, platform || null, integrationId || null, triggerKeyword, triggerType, botId,
        nodesStr, edgesStr,
        isActive, req.params.id, req.user.agencyId]
    );
    return res.json({ success: true, message: "Flow saved" });
  } catch (err) { console.error("Flow save error:", err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ── TOGGLE ────────────────────────────────────────────────────────
router.patch("/flows/:id/toggle", async (req, res) => {
  try {
    const [[flow]] = await pool.query("SELECT is_active FROM flows WHERE id=? AND agency_id=?", [req.params.id, req.user.agencyId]);
    if (!flow) return res.status(404).json({ success: false, message: "Flow not found" });
    await pool.query("UPDATE flows SET is_active=? WHERE id=?", [!flow.is_active, req.params.id]);
    return res.json({ success: true, isActive: !flow.is_active });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ── DELETE ────────────────────────────────────────────────────────
router.delete("/flows/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM flows WHERE id=? AND agency_id=?", [req.params.id, req.user.agencyId]);
    return res.json({ success: true, message: "Flow deleted" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

export default router;
