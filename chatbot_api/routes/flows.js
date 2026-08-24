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
             JSON_LENGTH(f.nodes_json) AS nodeCount
      FROM flows f
      LEFT JOIN bots b ON b.id = f.bot_id
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
      "SELECT * FROM flows WHERE id=? AND agency_id=?",
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
  const { name, platform, botId, triggerKeyword, triggerType, nodesJson, edgesJson } = req.body;
  if (!name || !platform) return res.status(400).json({ success: false, message: "Name and platform are required" });
  try {
    const [result] = await pool.query(
      `INSERT INTO flows (agency_id, bot_id, name, platform, trigger_keyword, trigger_type, nodes_json, edges_json)
       VALUES (?,?,?,?,?,?,?,?)`,
      [req.user.agencyId, botId || null, name, platform,
        triggerKeyword || null, triggerType || 'KEYWORD',
        JSON.stringify(nodesJson || []), JSON.stringify(edgesJson || [])]
    );
    return res.status(201).json({ success: true, message: "Flow created", flowId: result.insertId });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ── SAVE (update nodes+edges) ─────────────────────────────────────
router.put("/flows/:id", async (req, res) => {
  const { name, triggerKeyword, triggerType, botId, nodesJson, edgesJson, isActive } = req.body;
  try {
    await pool.query(
      `UPDATE flows SET name=?, trigger_keyword=?, trigger_type=?, bot_id=?,
       nodes_json=?, edges_json=?, is_active=? WHERE id=? AND agency_id=?`,
      [name, triggerKeyword || null, triggerType || 'KEYWORD', botId || null,
        JSON.stringify(nodesJson || []), JSON.stringify(edgesJson || []),
        isActive ?? 1, req.params.id, req.user.agencyId]
    );
    return res.json({ success: true, message: "Flow saved" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
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
