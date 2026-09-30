import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requireModule } from "../utils/entitlements.js";
import { findOutOfScopeRefs, describeOutOfScope, violationsForClient, stripComponentRefs, getOwnedIntegration } from "../utils/botScope.js";
import { findDeadEndOptions } from "../utils/flowDeadEnds.js";
import { getFlowAnalytics } from "../utils/flowStats.js";

const router = express.Router();
router.use("/flows", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), requireModule("feature_bot_manager"));

// ── LIST ──────────────────────────────────────────────────────────
router.get("/flows", async (req, res) => {
  try {
    const { integrationId, includeQuickActions } = req.query;
    let sql = `
      SELECT f.*, b.name AS botName,
             i.name AS integration_name, i.fb_page_name, i.wa_phone_number_id, i.ig_username,
             tb.bot_username AS tg_bot_username,
             JSON_LENGTH(f.nodes_json) AS nodeCount
      FROM flows f
      LEFT JOIN bots b ON b.id = f.bot_id
      LEFT JOIN integrations i ON i.id = f.integration_id
      LEFT JOIN telegram_bots tb ON tb.integration_id = i.id
      WHERE f.agency_id = ?
    `;
    const params = [req.user.agencyId];
    if (integrationId && integrationId !== "all") {
      sql += " AND f.integration_id = ?";
      params.push(integrationId);
    }
    // Quick Action reply flows (utils/quickActions.js) live on the Quick Actions tab,
    // not in flow lists or "go to flow" pickers.
    if (includeQuickActions !== "1") sql += " AND f.trigger_type <> 'QUICK_ACTION'";
    sql += " ORDER BY f.updated_at DESC";
    const [rows] = await pool.query(sql, params);
    return res.json({ success: true, flows: rows });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ── ANALYTICS (per step: reached, sent, delivered, read, clicks / branches) ──
router.get("/flows/:id/analytics", async (req, res) => {
  try {
    const [[flow]] = await pool.query(
      "SELECT id, name, nodes_json, edges_json, integration_id, is_active FROM flows WHERE id = ? AND agency_id = ?",
      [req.params.id, req.user.agencyId]
    );
    if (!flow) return res.status(404).json({ success: false, message: "Flow not found" });
    const nodes = JSON.parse(flow.nodes_json || "[]");
    const edges = JSON.parse(flow.edges_json || "[]");
    const startNode = nodes.find((n) => n.type === "start");
    const days = req.query.days === "all" ? 0 : Math.min(3650, Math.max(1, parseInt(req.query.days) || 30));
    const stats = await getFlowAnalytics(req.user.agencyId, flow.id, days, startNode?.id || null);
    return res.json({ success: true, flow: { id: flow.id, name: flow.name, isActive: Boolean(flow.is_active), nodes, edges }, ...stats });
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

function safeParse(v) {
  try { return typeof v === "string" ? JSON.parse(v || "[]") : (v || []); } catch { return []; }
}

// ── CREATE ────────────────────────────────────────────────────────
router.post("/flows", async (req, res) => {
  const name = req.body.name;
  const platform = req.body.platform;
  const integrationId = req.body.integrationId || req.body.integration_id || null;
  const botId = req.body.botId || req.body.bot_id || null;
  const triggerKeyword = req.body.triggerKeyword || req.body.trigger_keyword || null;
  const triggerType = req.body.triggerType || req.body.trigger_type || ((platform || '').toUpperCase() === 'WEBCHAT' ? 'CHAT_WIDGET' : 'KEYWORD');
  const nodes = req.body.nodesJson !== undefined ? req.body.nodesJson : req.body.nodes_json;
  const edges = req.body.edgesJson !== undefined ? req.body.edgesJson : req.body.edges_json;

  if (!name || !platform) return res.status(400).json({ success: false, message: "Name and platform are required" });

  const nodesStr = typeof nodes === "string" ? nodes : JSON.stringify(nodes || []);
  const edgesStr = typeof edges === "string" ? edges : JSON.stringify(edges || []);

  try {
    // The bot account must be one of THIS workspace's, and the flow may only reference
    // that bot's own Sequences / User Input Flows / Flows (utils/botScope.js).
    if (integrationId && !(await getOwnedIntegration(req.user.agencyId, integrationId))) {
      return res.status(403).json({ success: false, code: "BOT_SCOPE_VIOLATION", message: "That bot account isn't available to you." });
    }
    const badRefs = await findOutOfScopeRefs({ agencyId: req.user.agencyId, integrationId, nodes: safeParse(nodesStr) });
    if (badRefs.length) {
      return res.status(403).json({ success: false, code: "BOT_SCOPE_VIOLATION", message: describeOutOfScope(badRefs, integrationId || null), violations: violationsForClient(badRefs) });
    }
    const [result] = await pool.query(
      `INSERT INTO flows (agency_id, bot_id, integration_id, name, platform, trigger_keyword, trigger_type, nodes_json, edges_json)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [req.user.agencyId, botId, integrationId, name, platform,
        triggerKeyword, triggerType,
        nodesStr, edgesStr]
    );
    return res.status(201).json({
      success: true,
      message: "Flow created",
      flowId: result.insertId,
      id: result.insertId,
      flow: { id: result.insertId },
    });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ── SAVE (update nodes+edges) ─────────────────────────────────────
router.put("/flows/:id", async (req, res) => {
  const name = req.body.name;
  const platform = req.body.platform;
  const integrationId = req.body.integrationId !== undefined ? req.body.integrationId : req.body.integration_id;
  const triggerKeyword = req.body.triggerKeyword || req.body.trigger_keyword || null;
  // No default here — a broadcast-authoring save from the Flow Builder never
  // sends triggerType (it only edits nodes/edges), and defaulting to
  // 'KEYWORD' when it's omitted used to silently downgrade a flow's real
  // trigger_type (e.g. 'BROADCAST', set at creation so findMatchingFlow()
  // never picks it up for inbound matching) back to 'KEYWORD' on every
  // single save. COALESCE below preserves the existing value instead,
  // exactly like platform/is_active already do on this same query.
  const triggerType = req.body.triggerType || req.body.trigger_type || null;
  const botId = req.body.botId || req.body.bot_id || null;
  const nodes = req.body.nodesJson !== undefined ? req.body.nodesJson : req.body.nodes_json;
  const edges = req.body.edgesJson !== undefined ? req.body.edgesJson : req.body.edges_json;
  const isActive = req.body.isActive !== undefined ? req.body.isActive : (req.body.is_active !== undefined ? req.body.is_active : null);

  const nodesStr = typeof nodes === "string" ? nodes : JSON.stringify(nodes || []);
  const edgesStr = typeof edges === "string" ? edges : JSON.stringify(edges || []);

  try {
    const [[existing]] = await pool.query("SELECT id, integration_id, trigger_type, trigger_keyword FROM flows WHERE id=? AND agency_id=?", [req.params.id, req.user.agencyId]);
    if (!existing) return res.status(404).json({ success: false, message: "Flow not found" });
    // A Quick Action's reply flow stays one: its trigger and bot account never change.
    const isQuickAction = existing.trigger_type === "QUICK_ACTION";
    if (isQuickAction && integrationId && String(integrationId) !== String(existing.integration_id)) {
      return res.status(400).json({ success: false, code: "QUICK_ACTION_FLOW", message: "A Quick Action reply stays on its own bot account." });
    }

    // A save that doesn't mention the bot account keeps the current one (it used to
    // silently null it). A bot account can only be one of this workspace's.
    const effectiveIntegrationId = integrationId ? integrationId : existing.integration_id;
    if (integrationId && !(await getOwnedIntegration(req.user.agencyId, integrationId))) {
      return res.status(403).json({ success: false, code: "BOT_SCOPE_VIOLATION", message: "That bot account isn't available to you." });
    }
    const badRefs = await findOutOfScopeRefs({ agencyId: req.user.agencyId, integrationId: effectiveIntegrationId, nodes: safeParse(nodesStr) });
    if (badRefs.length) {
      return res.status(403).json({ success: false, code: "BOT_SCOPE_VIOLATION", message: describeOutOfScope(badRefs, effectiveIntegrationId || null), violations: violationsForClient(badRefs) });
    }
    // A button / quick reply / list item that leads nowhere can't be saved (utils/flowDeadEnds.js).
    const deadEnds = findDeadEndOptions(safeParse(nodesStr), safeParse(edgesStr));
    if (deadEnds.length) {
      return res.status(400).json({
        success: false,
        code: "DEAD_END_BUTTONS",
        message: `${deadEnds[0].message} — connect it to a next step, or choose what it should do.${deadEnds.length > 1 ? ` (${deadEnds.length - 1} more)` : ""}`,
        violations: deadEnds.map((d) => ({ nodeId: d.nodeId, itemId: d.itemId, message: d.message })),
      });
    }
    await pool.query(
      `UPDATE flows SET name=?, platform=COALESCE(?, platform), integration_id=?, trigger_keyword=?, trigger_type=COALESCE(?, trigger_type), bot_id=?,
       nodes_json=?, edges_json=?, is_active=COALESCE(?, is_active) WHERE id=? AND agency_id=?`,
      [name, platform || null, effectiveIntegrationId || null,
        isQuickAction ? existing.trigger_keyword : triggerKeyword,
        isQuickAction ? "QUICK_ACTION" : triggerType, botId,
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

// ── RENAME ────────────────────────────────────────────────────────
// Reference name only (Bot Manager list "Rename", Flow Builder header). The
// full save (PUT) rewrites nodes/edges too, so it can't be used for this.
router.patch("/flows/:id/name", async (req, res) => {
  try {
    const name = String(req.body?.name ?? "").replace(/\s+/g, " ").trim();
    if (!name) return res.status(400).json({ success: false, message: "The name can't be empty" });
    if (name.length > 200) return res.status(400).json({ success: false, message: "The name can be at most 200 characters" });
    const [result] = await pool.query("UPDATE flows SET name = ? WHERE id = ? AND agency_id = ?", [name, req.params.id, req.user.agencyId]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Flow not found" });
    return res.json({ success: true, name, message: "Renamed" });
  } catch (err) { console.error("Flow rename error:", err); return res.status(500).json({ success: false, message: "Server error" }); }
});

// ── CLONE / DUPLICATE ──────────────────────────────────────────────
router.post("/flows/:id/clone", async (req, res) => {
  try {
    const [[source]] = await pool.query(
      "SELECT * FROM flows WHERE id = ? AND agency_id = ?",
      [req.params.id, req.user.agencyId]
    );
    if (!source) return res.status(404).json({ success: false, message: "Flow not found" });

    const targetIntegrationId = req.body.targetIntegrationId !== undefined 
      ? req.body.targetIntegrationId 
      : source.integration_id;

    let targetPlatform = source.platform;
    if (targetIntegrationId) {
      const [[targetInteg]] = await pool.query(
        "SELECT id, platform, name FROM integrations WHERE id = ? AND agency_id = ?",
        [targetIntegrationId, req.user.agencyId]
      );
      if (!targetInteg) {
        return res.status(400).json({ success: false, message: "Target bot account not found" });
      }
      targetPlatform = targetInteg.platform;
    }

    const newName = req.body.name?.trim() || `${source.name} (Copy)`;

    // Copied onto a different bot account → drop every Sequence / User Input Flow / Flow
    // pointer, so the copy can never reach the original bot's components.
    const sameBot = String(targetIntegrationId || "") === String(source.integration_id || "");
    let cloneNodesJson = source.nodes_json;
    if (!sameBot) {
      cloneNodesJson = JSON.stringify(stripComponentRefs(safeParse(source.nodes_json)));
    }

    const [result] = await pool.query(
      `INSERT INTO flows (agency_id, bot_id, integration_id, name, platform, trigger_keyword, trigger_type, nodes_json, edges_json, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.agencyId,
        source.bot_id,
        targetIntegrationId,
        newName,
        targetPlatform,
        source.trigger_keyword,
        // A copy of a Quick Action reply is an ordinary flow.
        source.trigger_type === "QUICK_ACTION" ? "KEYWORD" : source.trigger_type,
        cloneNodesJson,
        source.edges_json,
        1,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Flow cloned successfully",
      flowId: result.insertId,
      flow: {
        id: result.insertId,
        name: newName,
        platform: targetPlatform,
        integration_id: targetIntegrationId,
        trigger_keyword: source.trigger_keyword,
        trigger_type: source.trigger_type === "QUICK_ACTION" ? "KEYWORD" : source.trigger_type,
        is_active: 1,
      },
    });
  } catch (err) {
    console.error("Clone flow error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ── DELETE ────────────────────────────────────────────────────────
router.delete("/flows/:id", async (req, res) => {
  try {
    const [[target]] = await pool.query("SELECT trigger_type FROM flows WHERE id=? AND agency_id=?", [req.params.id, req.user.agencyId]);
    if (target?.trigger_type === "QUICK_ACTION") {
      return res.status(409).json({ success: false, code: "QUICK_ACTION_FLOW", message: "This is a Quick Action's reply — switch its reply off or reset it on the Quick Actions tab instead." });
    }
    await pool.query("DELETE FROM flows WHERE id=? AND agency_id=?", [req.params.id, req.user.agencyId]);
    return res.json({ success: true, message: "Flow deleted" });
  } catch (err) { console.error(err); return res.status(500).json({ success: false, message: "Server error" }); }
});

export default router;
