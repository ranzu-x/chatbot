/**
 * AI Reply Settings + Active Agents — per-bot (per-integration) activation
 * of the agency's shared Agents. Lives under Bot Manager → AI, scoped to
 * whichever bot/integration is currently selected in Bot Manager's own
 * account list.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use("/ai/reply-settings", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

function getAgencyId(req) {
  const agencyId = req.user?.agencyId;
  if (!agencyId) throw Object.assign(new Error("No agency associated with this account"), { status: 400 });
  return agencyId;
}

async function assertOwnsIntegration(agencyId, integrationId) {
  const [[row]] = await pool.query("SELECT id FROM integrations WHERE id = ? AND agency_id = ?", [integrationId, agencyId]);
  if (!row) throw Object.assign(new Error("Bot/integration not found"), { status: 404 });
}

// ─── GET settings + active agents for one bot ────────────────────────────
router.get("/ai/reply-settings/:integrationId", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    await assertOwnsIntegration(agencyId, req.params.integrationId);

    const [[settings]] = await pool.query(
      "SELECT * FROM ai_reply_settings WHERE integration_id = ?",
      [req.params.integrationId]
    );
    const [activeRows] = await pool.query(
      "SELECT agent_id FROM ai_reply_active_agents WHERE integration_id = ?",
      [req.params.integrationId]
    );

    return res.json({
      success: true,
      settings: settings || {
        integration_id: Number(req.params.integrationId),
        enabled: 0,
        trigger_mode: "FALLBACK",
        default_agent_id: null,
        confidence_threshold: 0.68,
        auto_resume_minutes: null,
      },
      activeAgentIds: activeRows.map((r) => r.agent_id),
    });
  } catch (err) {
    const status = err.status || 500;
    console.error("Get AI reply settings error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

// ─── SAVE settings for one bot ────────────────────────────────────────────
router.put("/ai/reply-settings/:integrationId", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    await assertOwnsIntegration(agencyId, req.params.integrationId);

    const { enabled, triggerMode, defaultAgentId, confidenceThreshold, autoResumeMinutes } = req.body || {};
    if (triggerMode && !["ALWAYS", "FALLBACK"].includes(triggerMode)) {
      return res.status(400).json({ success: false, message: "triggerMode must be ALWAYS or FALLBACK" });
    }

    const [[existing]] = await pool.query("SELECT * FROM ai_reply_settings WHERE integration_id = ?", [req.params.integrationId]);
    const merged = {
      enabled: enabled !== undefined ? (enabled ? 1 : 0) : (existing?.enabled ?? 0),
      trigger_mode: triggerMode || existing?.trigger_mode || "FALLBACK",
      default_agent_id: defaultAgentId !== undefined ? (defaultAgentId || null) : (existing?.default_agent_id ?? null),
      confidence_threshold: confidenceThreshold !== undefined ? Number(confidenceThreshold) : (existing?.confidence_threshold ?? 0.68),
      // Auto-resume after Human Agent Takeover (utils/botResumeScheduler.js
      // polls conversations.auto_resume_at, computed from this at join-time)
      // — NULL/0 means "Never", a positive integer is minutes.
      auto_resume_minutes: autoResumeMinutes !== undefined ? (autoResumeMinutes || null) : (existing?.auto_resume_minutes ?? null),
    };

    await pool.query(
      `INSERT INTO ai_reply_settings (integration_id, agency_id, enabled, trigger_mode, default_agent_id, confidence_threshold, auto_resume_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), trigger_mode = VALUES(trigger_mode),
         default_agent_id = VALUES(default_agent_id), confidence_threshold = VALUES(confidence_threshold),
         auto_resume_minutes = VALUES(auto_resume_minutes), updated_at = NOW()`,
      [req.params.integrationId, agencyId, merged.enabled, merged.trigger_mode, merged.default_agent_id, merged.confidence_threshold, merged.auto_resume_minutes]
    );

    return res.json({ success: true, message: "AI Reply settings saved." });
  } catch (err) {
    const status = err.status || 500;
    console.error("Save AI reply settings error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

// ─── ACTIVATE an Agent on this bot ────────────────────────────────────────
router.post("/ai/reply-settings/:integrationId/active-agents/:agentId", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    await assertOwnsIntegration(agencyId, req.params.integrationId);
    const [[agent]] = await pool.query("SELECT id FROM ai_agents WHERE id = ? AND agency_id = ?", [req.params.agentId, agencyId]);
    if (!agent) return res.status(404).json({ success: false, message: "Agent not found" });

    await pool.query(
      "INSERT IGNORE INTO ai_reply_active_agents (integration_id, agent_id) VALUES (?, ?)",
      [req.params.integrationId, req.params.agentId]
    );
    return res.json({ success: true });
  } catch (err) {
    const status = err.status || 500;
    console.error("Activate AI agent error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

// ─── DEACTIVATE an Agent on this bot ──────────────────────────────────────
router.delete("/ai/reply-settings/:integrationId/active-agents/:agentId", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    await assertOwnsIntegration(agencyId, req.params.integrationId);
    await pool.query(
      "DELETE FROM ai_reply_active_agents WHERE integration_id = ? AND agent_id = ?",
      [req.params.integrationId, req.params.agentId]
    );
    return res.json({ success: true });
  } catch (err) {
    const status = err.status || 500;
    console.error("Deactivate AI agent error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

export default router;
