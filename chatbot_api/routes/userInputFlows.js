/**
 * User Input Flows — standalone, reusable Q&A sequences.
 *
 * Unlike a regular bot Flow (routes/flows.js, one per platform/trigger), a User
 * Input Flow has no trigger of its own — it's a reusable module that a regular
 * Flow runs via a "Run User Input Flow" node, picked (or created) from that
 * node's settings. Execution is handled as a real sub-flow call in
 * utils/flowEngine.js.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("AGENCY", "ADMIN", "AGENT"));

// ── LIST ──────────────────────────────────────────────────────────
// A User Input Flow is locked to the channel it was created for (set once,
// read-only afterward) — pass ?platform=WHATSAPP to only get ones usable from
// a flow on that channel (used by the "Run User Input Flow" node's picker).
router.get("/user-input-flows", async (req, res) => {
  try {
    const { platform } = req.query;
    const conditions = ["agency_id = ?"];
    const params = [req.user.agencyId];
    if (platform && platform !== "ALL") {
      conditions.push("platform = ?");
      params.push(String(platform).toUpperCase());
    }
    const [rows] = await pool.query(
      `SELECT id, agency_id, name, platform, is_active, created_at, updated_at,
              JSON_LENGTH(nodes_json) AS nodeCount,
              (SELECT COUNT(*) FROM user_input_flow_responses r WHERE r.user_input_flow_id = user_input_flows.id) AS responseCount
       FROM user_input_flows WHERE ${conditions.join(" AND ")} ORDER BY updated_at DESC`,
      params
    );
    return res.json({ success: true, userInputFlows: rows });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ── GET ONE ───────────────────────────────────────────────────────
router.get("/user-input-flows/:id", async (req, res) => {
  try {
    const [[flow]] = await pool.query(
      "SELECT * FROM user_input_flows WHERE id = ? AND agency_id = ?",
      [req.params.id, req.user.agencyId]
    );
    if (!flow) return res.status(404).json({ success: false, message: "User Input Flow not found" });
    flow.nodes_json = JSON.parse(flow.nodes_json || "[]");
    flow.edges_json = JSON.parse(flow.edges_json || "[]");
    return res.json({ success: true, userInputFlow: flow });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ── CREATE ────────────────────────────────────────────────────────
router.post("/user-input-flows", async (req, res) => {
  const name = (req.body.name || "").trim();
  if (!name) return res.status(400).json({ success: false, message: "Name is required" });
  const platform = (req.body.platform || "WHATSAPP").toUpperCase();

  const nodes = req.body.nodesJson !== undefined ? req.body.nodesJson : req.body.nodes_json;
  const edges = req.body.edgesJson !== undefined ? req.body.edgesJson : req.body.edges_json;
  const nodesStr = typeof nodes === "string" ? nodes : JSON.stringify(nodes || []);
  const edgesStr = typeof edges === "string" ? edges : JSON.stringify(edges || []);

  try {
    const [result] = await pool.query(
      "INSERT INTO user_input_flows (agency_id, name, platform, nodes_json, edges_json) VALUES (?, ?, ?, ?, ?)",
      [req.user.agencyId, name, platform, nodesStr, edgesStr]
    );
    return res.status(201).json({ success: true, message: "User Input Flow created", userInputFlowId: result.insertId });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ── SAVE (update nodes+edges / rename) ────────────────────────────
// `platform` is intentionally NOT editable here — it's locked at creation (see
// CREATE above) so a flow on one channel can never end up calling a User Input
// Flow that was designed against a different channel's fields.
router.put("/user-input-flows/:id", async (req, res) => {
  const name = req.body.name;
  const nodes = req.body.nodesJson !== undefined ? req.body.nodesJson : req.body.nodes_json;
  const edges = req.body.edgesJson !== undefined ? req.body.edgesJson : req.body.edges_json;
  const isActive = req.body.isActive !== undefined ? req.body.isActive : (req.body.is_active !== undefined ? req.body.is_active : 1);
  const nodesStr = typeof nodes === "string" ? nodes : JSON.stringify(nodes || []);
  const edgesStr = typeof edges === "string" ? edges : JSON.stringify(edges || []);

  try {
    await pool.query(
      "UPDATE user_input_flows SET name = COALESCE(?, name), nodes_json = ?, edges_json = ?, is_active = ? WHERE id = ? AND agency_id = ?",
      [name || null, nodesStr, edgesStr, isActive, req.params.id, req.user.agencyId]
    );
    return res.json({ success: true, message: "User Input Flow saved" });
  } catch (err) { console.error("User Input Flow save error:", err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ── RESPONSES (submitted answers for this flow) ───────────────────
router.get("/user-input-flows/:id/responses", async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit) || 50));
    const offset = Math.max(0, parseInt(req.query.offset) || 0);
    const [[owned]] = await pool.query(
      "SELECT id FROM user_input_flows WHERE id = ? AND agency_id = ?",
      [req.params.id, req.user.agencyId]
    );
    if (!owned) return res.status(404).json({ success: false, message: "User Input Flow not found" });

    const [rows] = await pool.query(
      `SELECT r.id, r.contact_id, r.conversation_id, r.answers, r.created_at, c.name AS contact_name
       FROM user_input_flow_responses r
       LEFT JOIN contacts c ON c.id = r.contact_id
       WHERE r.user_input_flow_id = ?
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.params.id, limit, offset]
    );
    return res.json({ success: true, responses: rows });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ── DELETE ────────────────────────────────────────────────────────
// Blocks deletion while a "Run User Input Flow" node somewhere still references it —
// safer than silently breaking a live bot flow that calls it.
router.delete("/user-input-flows/:id", async (req, res) => {
  try {
    const [referencingFlows] = await pool.query(
      `SELECT id, name FROM flows WHERE agency_id = ? AND nodes_json LIKE ?`,
      [req.user.agencyId, `%"userInputFlowId":${req.params.id}%`]
    );
    if (referencingFlows.length) {
      return res.status(409).json({
        success: false,
        message: `Still used by ${referencingFlows.length} flow(s): ${referencingFlows.map(f => f.name).join(", ")}. Remove the "Run User Input Flow" node there first.`,
      });
    }
    await pool.query("DELETE FROM user_input_flows WHERE id = ? AND agency_id = ?", [req.params.id, req.user.agencyId]);
    return res.json({ success: true, message: "User Input Flow deleted" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

export default router;
