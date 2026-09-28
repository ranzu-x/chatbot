/**
 * AI Agents — reusable, channel-independent AI personalities (Phase 3 of the
 * AI Reply plan: CRUD + a real end-to-end test-chat call; routing/knowledge
 * base/actions are wired in later phases but their tables already exist —
 * see migrate_ai_reply.js).
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { resolveCapability } from "../utils/aiProviders/registry.js";

function parseJsonColumn(val, fallback) {
  if (val === null || val === undefined) return fallback;
  if (typeof val !== "string") return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

const router = express.Router();

// Scoped to this router's own path prefix — see agencyPaymentGateways.js's
// comment on why a bare router.use(...) is unsafe once multiple routers
// share the same "/api/v1" mount prefix.
router.use("/ai/agents", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

function getAgencyId(req) {
  const agencyId = req.user?.agencyId;
  if (!agencyId) throw Object.assign(new Error("No agency associated with this account"), { status: 400 });
  return agencyId;
}

// ─── LIST ──────────────────────────────────────────────────────────────────
router.get("/ai/agents", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const [agents] = await pool.query(
      `SELECT id, name, description, is_active, is_default, preferred_provider, preferred_model, updated_at
       FROM ai_agents WHERE agency_id = ? ORDER BY is_default DESC, name ASC`,
      [agencyId]
    );
    if (agents.length === 0) return res.json({ success: true, agents: [] });

    // Which bots/integrations currently have each agent active — surfaced
    // as small channel dots on the Agents list card (empty until Phase 4
    // wires up per-bot activation, which is expected and fine).
    const [activeRows] = await pool.query(
      `SELECT araa.agent_id, i.id AS integration_id, i.platform, i.name
       FROM ai_reply_active_agents araa
       JOIN integrations i ON i.id = araa.integration_id
       WHERE araa.agent_id IN (?)`,
      [agents.map((a) => a.id)]
    );
    const channelsByAgent = {};
    for (const row of activeRows) {
      (channelsByAgent[row.agent_id] ||= []).push({ integrationId: row.integration_id, platform: row.platform, name: row.name });
    }

    return res.json({
      success: true,
      agents: agents.map((a) => ({ ...a, channels: channelsByAgent[a.id] || [] })),
    });
  } catch (err) {
    const status = err.status || 500;
    console.error("List AI agents error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

// ─── CREATE ────────────────────────────────────────────────────────────────
router.post("/ai/agents", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const name = (req.body?.name || "").trim();
    if (!name) return res.status(400).json({ success: false, message: "Agent name is required" });

    const [result] = await pool.query(
      `INSERT INTO ai_agents (agency_id, name, description, system_prompt, is_active, is_default)
       VALUES (?, ?, ?, ?, 1, 0)`,
      [agencyId, name, (req.body?.description || "").trim() || null, defaultSystemPrompt(name)]
    );
    const [[agent]] = await pool.query("SELECT * FROM ai_agents WHERE id = ?", [result.insertId]);
    return res.status(201).json({ success: true, agent });
  } catch (err) {
    const status = err.status || 500;
    console.error("Create AI agent error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

// ─── GET ONE ───────────────────────────────────────────────────────────────
router.get("/ai/agents/:id", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const [[agent]] = await pool.query("SELECT * FROM ai_agents WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!agent) return res.status(404).json({ success: false, message: "Agent not found" });
    return res.json({ success: true, agent });
  } catch (err) {
    const status = err.status || 500;
    console.error("Get AI agent error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

// ─── UPDATE ────────────────────────────────────────────────────────────────
router.put("/ai/agents/:id", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const { name, description, systemPrompt, isActive, isDefault, preferredProvider, preferredModel, handoffWhenUnsure, handoffMessage } = req.body || {};

    const [[existing]] = await pool.query("SELECT * FROM ai_agents WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!existing) return res.status(404).json({ success: false, message: "Agent not found" });

    if (isDefault) {
      // Exactly one default per agency — unset any other before setting this one.
      await pool.query("UPDATE ai_agents SET is_default = 0 WHERE agency_id = ? AND id != ?", [agencyId, req.params.id]);
    }

    // Plain merge-then-overwrite (not SQL COALESCE) — a field like `description`
    // is legitimately nullable/clearable, which COALESCE can't express (it can
    // only ever fall back to the OLD value on NULL, never actually clear one).
    // The editor always sends the whole form on save, so "field omitted" only
    // really happens from a partial API caller, which this still handles sanely.
    const merged = {
      name: name !== undefined ? String(name).trim() : existing.name,
      description: description !== undefined ? (String(description).trim() || null) : existing.description,
      system_prompt: systemPrompt !== undefined ? systemPrompt : existing.system_prompt,
      is_active: isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active,
      is_default: isDefault !== undefined ? (isDefault ? 1 : 0) : existing.is_default,
      preferred_provider: preferredProvider !== undefined ? (preferredProvider || null) : existing.preferred_provider,
      preferred_model: preferredModel !== undefined ? (preferredModel || null) : existing.preferred_model,
      handoff_when_unsure: handoffWhenUnsure !== undefined ? (handoffWhenUnsure ? 1 : 0) : existing.handoff_when_unsure,
      handoff_message: handoffMessage !== undefined ? (String(handoffMessage || "").trim().slice(0, 500) || null) : existing.handoff_message,
    };
    if (!merged.name) return res.status(400).json({ success: false, message: "Agent name is required" });

    await pool.query(
      `UPDATE ai_agents SET name = ?, description = ?, system_prompt = ?, is_active = ?, is_default = ?, preferred_provider = ?, preferred_model = ?,
         handoff_when_unsure = ?, handoff_message = ?
       WHERE id = ? AND agency_id = ?`,
      [merged.name, merged.description, merged.system_prompt, merged.is_active, merged.is_default, merged.preferred_provider, merged.preferred_model,
        merged.handoff_when_unsure, merged.handoff_message, req.params.id, agencyId]
    );

    const [[agent]] = await pool.query("SELECT * FROM ai_agents WHERE id = ?", [req.params.id]);
    return res.json({ success: true, agent });
  } catch (err) {
    const status = err.status || 500;
    console.error("Update AI agent error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

// ─── ANSWER REVIEW (ai_message_logs, migrate_ai_quality.js) ─────────────────
// Every AI answer with the question, the knowledge it drew on and whether it
// handed off. The owner marks answers good / bad; a corrected answer is added
// to the agent's knowledge base as a Q&A text source, so the next customer
// asking the same thing gets it right.
router.get("/ai/agents/:id/answers", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const [[agent]] = await pool.query("SELECT id FROM ai_agents WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!agent) return res.status(404).json({ success: false, message: "Agent not found" });
    const filter = String(req.query.filter || "all");
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = 25;
    const where = ["l.agency_id = ?", "l.agent_id = ?", "(l.answer IS NOT NULL OR l.handed_off = 1)"];
    const params = [agencyId, agent.id];
    if (filter === "unreviewed") where.push("l.review_rating IS NULL");
    else if (filter === "bad") where.push("l.review_rating = 'BAD'");
    else if (filter === "good") where.push("l.review_rating = 'GOOD'");
    else if (filter === "handoff") where.push("l.handed_off = 1");
    else if (filter === "no_sources") where.push("l.sources IS NULL AND l.handed_off = 0");
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM ai_message_logs l WHERE ${where.join(" AND ")}`, params);
    const [rows] = await pool.query(
      `SELECT l.id, l.conversation_id, l.question, l.answer, l.sources, l.top_score, l.handed_off, l.review_rating, l.correction, l.created_at,
              ct.name AS contact_name
       FROM ai_message_logs l
       LEFT JOIN conversations cv ON cv.id = l.conversation_id AND cv.agency_id = l.agency_id
       LEFT JOIN contacts ct ON ct.id = cv.contact_id
       WHERE ${where.map((w) => w).join(" AND ")} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    const [[stats]] = await pool.query(
      `SELECT COUNT(*) AS answered, SUM(review_rating = 'GOOD') AS good, SUM(review_rating = 'BAD') AS bad, SUM(handed_off = 1) AS handoffs,
              SUM(sources IS NULL AND handed_off = 0) AS noSources
       FROM ai_message_logs WHERE agency_id = ? AND agent_id = ? AND (answer IS NOT NULL OR handed_off = 1) AND created_at > NOW() - INTERVAL 30 DAY`,
      [agencyId, agent.id]
    );
    return res.json({
      success: true, total, page, pageSize,
      answers: rows.map((r) => ({ ...r, sources: parseJsonColumn(r.sources, []), top_score: r.top_score === null ? null : Number(r.top_score) })),
      last30Days: Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, Number(v) || 0])),
    });
  } catch (err) {
    console.error("List AI answers error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/ai/agents/:id/answers/:logId", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const [[log]] = await pool.query(
      "SELECT * FROM ai_message_logs WHERE id = ? AND agent_id = ? AND agency_id = ?",
      [req.params.logId, req.params.id, agencyId]
    );
    if (!log) return res.status(404).json({ success: false, message: "Answer not found" });
    const rating = req.body?.rating === "GOOD" || req.body?.rating === "BAD" ? req.body.rating : null;
    const correction = req.body?.correction !== undefined ? String(req.body.correction || "").trim().slice(0, 4000) : undefined;

    let correctionSourceId = log.correction_source_id;
    let indexed = null;
    if (correction !== undefined) {
      if (correction && log.question) {
        // The corrected answer becomes knowledge: one Q&A text source per reviewed answer (updated in place).
        const text = `Question: ${log.question}\nAnswer: ${correction}`;
        const title = `Corrected answer: ${String(log.question).slice(0, 80)}`;
        if (correctionSourceId) {
          await pool.query("UPDATE ai_agent_knowledge_sources SET source_ref = ?, title = ? WHERE id = ? AND agent_id = ?", [text, title, correctionSourceId, log.agent_id]);
        } else {
          const [ins] = await pool.query(
            "INSERT INTO ai_agent_knowledge_sources (agent_id, type, title, source_ref, status) VALUES (?, 'text', ?, ?, 'pending')",
            [log.agent_id, title, text]
          );
          correctionSourceId = ins.insertId;
        }
        const { indexKnowledgeSource } = await import("../utils/aiKnowledge.js");
        indexed = await indexKnowledgeSource({ sourceId: correctionSourceId, agentId: log.agent_id, agencyId, text });
      } else if (!correction && correctionSourceId) {
        await pool.query("DELETE FROM ai_knowledge_chunks WHERE source_id = ?", [correctionSourceId]);
        await pool.query("DELETE FROM ai_agent_knowledge_sources WHERE id = ? AND agent_id = ?", [correctionSourceId, log.agent_id]);
        correctionSourceId = null;
      }
    }

    await pool.query(
      `UPDATE ai_message_logs SET review_rating = ?, reviewed_by = ?, reviewed_at = NOW(), correction = ?, correction_source_id = ? WHERE id = ?`,
      [rating ?? (correction ? "BAD" : log.review_rating), req.user.id, correction !== undefined ? (correction || null) : log.correction, correctionSourceId, log.id]
    );
    return res.json({
      success: true,
      message: correction ? (indexed?.embedded === false ? "Saved — add an embeddings-capable AI provider so the agent can use it" : "Saved and added to the agent's knowledge") : "Saved",
    });
  } catch (err) {
    console.error("Review AI answer error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── DELETE ────────────────────────────────────────────────────────────────
router.delete("/ai/agents/:id", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const [result] = await pool.query("DELETE FROM ai_agents WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Agent not found" });
    return res.json({ success: true, message: "Agent deleted." });
  } catch (err) {
    const status = err.status || 500;
    console.error("Delete AI agent error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

// ─── TEST CHAT — real end-to-end call through the provider abstraction ─────
router.post("/ai/agents/:id/test-chat", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const [[agent]] = await pool.query("SELECT * FROM ai_agents WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!agent) return res.status(404).json({ success: false, message: "Agent not found" });

    const message = (req.body?.message || "").trim();
    if (!message) return res.status(400).json({ success: false, message: "Message is required" });
    const history = Array.isArray(req.body?.history) ? req.body.history.slice(-10) : [];

    const resolved = await resolveCapability(agencyId, "text_generation", agent.preferred_provider);
    if (!resolved) {
      return res.status(400).json({
        success: false,
        message: "No AI provider is connected yet — add one in Settings → AI Providers first.",
      });
    }

    const messages = [
      { role: "system", content: agent.system_prompt || `You are ${agent.name}, a helpful assistant.` },
      ...history.map((h) => ({ role: h.role === "user" ? "user" : "assistant", content: String(h.content || "") })),
      { role: "user", content: message },
    ];

    const startedAt = Date.now();
    const result = await resolved.adapter.generate({ apiKey: resolved.apiKey, model: resolved.model, messages, maxTokens: 500 });

    return res.json({
      success: true,
      reply: result.text,
      providerUsed: resolved.providerId,
      modelUsed: resolved.model,
      latencyMs: Date.now() - startedAt,
    });
  } catch (err) {
    console.error("AI agent test-chat error:", err);
    return res.status(400).json({ success: false, message: err.message || "The AI provider call failed." });
  }
});

// ─── ROUTING RULES ─────────────────────────────────────────────────────────
router.get("/ai/agents/:id/routing", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const [[owns]] = await pool.query("SELECT id FROM ai_agents WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!owns) return res.status(404).json({ success: false, message: "Agent not found" });

    const [[rule]] = await pool.query("SELECT * FROM ai_agent_routing_rules WHERE agent_id = ?", [req.params.id]);
    return res.json({
      success: true,
      routing: {
        keywords: parseJsonColumn(rule?.keywords, []),
        examplePhrases: parseJsonColumn(rule?.example_phrases, []),
        hasEmbeddings: Array.isArray(parseJsonColumn(rule?.example_embeddings, [])) && parseJsonColumn(rule?.example_embeddings, []).length > 0,
        priority: rule?.priority ?? 0,
      },
    });
  } catch (err) {
    const status = err.status || 500;
    console.error("Get AI agent routing error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

// Saves keywords/example phrases + (re-)computes and caches each example
// phrase's embedding so live routing never has to call an embeddings API
// per incoming message — only once here, at save time.
router.put("/ai/agents/:id/routing", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const [[agent]] = await pool.query("SELECT id FROM ai_agents WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!agent) return res.status(404).json({ success: false, message: "Agent not found" });

    const keywords = Array.isArray(req.body?.keywords) ? req.body.keywords.map((k) => String(k).trim()).filter(Boolean) : [];
    const examplePhrases = Array.isArray(req.body?.examplePhrases) ? req.body.examplePhrases.map((p) => String(p).trim()).filter(Boolean) : [];
    const priority = Number.isFinite(Number(req.body?.priority)) ? Number(req.body.priority) : 0;

    let exampleEmbeddings = null;
    if (examplePhrases.length > 0) {
      const resolved = await resolveCapability(agencyId, "embeddings");
      if (resolved) {
        try {
          exampleEmbeddings = await resolved.adapter.embed({ apiKey: resolved.apiKey, model: resolved.model, texts: examplePhrases });
        } catch (err) {
          console.error(`Embedding example phrases for agent ${req.params.id} failed (routing will fall back to keyword-only):`, err.message);
        }
      }
    }

    await pool.query(
      `INSERT INTO ai_agent_routing_rules (agent_id, keywords, example_phrases, example_embeddings, priority)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE keywords = VALUES(keywords), example_phrases = VALUES(example_phrases),
         example_embeddings = VALUES(example_embeddings), priority = VALUES(priority), updated_at = NOW()`,
      [req.params.id, JSON.stringify(keywords), JSON.stringify(examplePhrases), exampleEmbeddings ? JSON.stringify(exampleEmbeddings) : null, priority]
    );

    return res.json({
      success: true,
      message: exampleEmbeddings || examplePhrases.length === 0
        ? "Routing rules saved."
        : "Routing rules saved — keyword matching is active, but semantic matching needs an embeddings-capable AI provider connected (e.g. OpenAI or Gemini) in Settings → AI Providers.",
    });
  } catch (err) {
    const status = err.status || 500;
    console.error("Save AI agent routing error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

// ─── ACTIONS (allow-list) ────────────────────────────────────────────────
const VALID_ACTION_TYPES = ["add_label", "remove_label", "start_flow", "start_sequence", "stop_sequence", "assign_human"];

router.get("/ai/agents/:id/actions", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const [[owns]] = await pool.query("SELECT id FROM ai_agents WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!owns) return res.status(404).json({ success: false, message: "Agent not found" });

    const [rows] = await pool.query("SELECT * FROM ai_agent_actions WHERE agent_id = ? ORDER BY id ASC", [req.params.id]);
    return res.json({
      success: true,
      actions: rows.map((r) => ({ id: r.id, actionType: r.action_type, config: parseJsonColumn(r.config, {}), enabled: !!r.enabled })),
    });
  } catch (err) {
    const status = err.status || 500;
    console.error("List AI agent actions error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

// Full-replace save (the editor always sends the whole current list) —
// simplest way to keep add/remove/reorder/toggle all consistent in one call.
router.put("/ai/agents/:id/actions", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const [[owns]] = await pool.query("SELECT id FROM ai_agents WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!owns) return res.status(404).json({ success: false, message: "Agent not found" });

    const incoming = Array.isArray(req.body?.actions) ? req.body.actions : [];
    for (const a of incoming) {
      if (!VALID_ACTION_TYPES.includes(a.actionType)) {
        return res.status(400).json({ success: false, message: `Unknown action type "${a.actionType}"` });
      }
    }

    await pool.query("DELETE FROM ai_agent_actions WHERE agent_id = ?", [req.params.id]);
    for (const a of incoming) {
      await pool.query(
        "INSERT INTO ai_agent_actions (agent_id, action_type, config, enabled) VALUES (?, ?, ?, ?)",
        [req.params.id, a.actionType, JSON.stringify(a.config || {}), a.enabled === false ? 0 : 1]
      );
    }
    return res.json({ success: true, message: "Actions saved." });
  } catch (err) {
    const status = err.status || 500;
    console.error("Save AI agent actions error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

function defaultSystemPrompt(name) {
  return `You are ${name}, a helpful, professional customer support assistant. Be concise and friendly. If you don't know something, say so honestly rather than guessing.`;
}

export default router;
