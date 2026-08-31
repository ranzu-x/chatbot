import express from "express";
import axios from "axios";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { indexKnowledgeSource, generateAIResponse } from "../services/aiService.js";

const router = express.Router();
router.use(authMiddleware);

// Helper to resolve agencyId cleanly
function getAgencyId(req) {
  return req.user?.agencyId || 1;
}

// ─── GET AI AGENT SETTINGS & STATS ───────────────────────────────────────────
router.get("/ai/agent", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const [rows] = await pool.query("SELECT * FROM ai_agents WHERE agency_id = ? LIMIT 1", [agencyId]);

    let agent = rows[0];
    if (!agent) {
      // Create default
      const defaultPrompt = `You are a helpful and polite AI Customer Support Assistant for our business.
Assist customers accurately using our Knowledge Base. If unsure, offer to connect them with a human agent.`;
      const [ins] = await pool.query(
        `INSERT INTO ai_agents (agency_id, name, system_prompt, provider, model_name, temperature, is_active, fallback_enabled)
         VALUES (?, 'Nexa AI Assistant', ?, 'OPENAI', 'gpt-4o-mini', 0.70, 1, 1)`,
        [agencyId, defaultPrompt]
      );
      const [newRows] = await pool.query("SELECT * FROM ai_agents WHERE id = ?", [ins.insertId]);
      agent = newRows[0];
    }

    // Stats
    const [[{ totalSources }]] = await pool.query("SELECT COUNT(*) as totalSources FROM knowledge_sources WHERE agency_id = ?", [agencyId]);
    const [[{ totalChunks }]] = await pool.query("SELECT COUNT(*) as totalChunks FROM knowledge_chunks WHERE agency_id = ?", [agencyId]);
    const [[{ totalQueries }]] = await pool.query("SELECT COUNT(*) as totalQueries FROM ai_chat_logs WHERE agency_id = ?", [agencyId]);

    return res.json({
      success: true,
      agent: {
        ...agent,
        temperature: Number(agent.temperature),
        isActive: Boolean(agent.is_active),
        fallbackEnabled: Boolean(agent.fallback_enabled),
      },
      stats: {
        totalSources: Number(totalSources || 0),
        totalChunks: Number(totalChunks || 0),
        totalQueries: Number(totalQueries || 0),
      },
    });
  } catch (err) {
    console.error("Get AI agent error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── UPDATE AI AGENT SETTINGS ────────────────────────────────────────────────
router.put("/ai/agent", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const {
      name,
      systemPrompt,
      provider = "OPENAI",
      modelName = "gpt-4o-mini",
      apiKey,
      temperature = 0.7,
      isActive = true,
      fallbackEnabled = true,
      humanHandoverKeywords,
      handoverMessage,
    } = req.body;

    await pool.query(
      `INSERT INTO ai_agents (
        agency_id, name, system_prompt, provider, model_name, api_key,
        temperature, is_active, fallback_enabled, human_handover_keywords, handover_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        system_prompt = VALUES(system_prompt),
        provider = VALUES(provider),
        model_name = VALUES(model_name),
        api_key = VALUES(api_key),
        temperature = VALUES(temperature),
        is_active = VALUES(is_active),
        fallback_enabled = VALUES(fallback_enabled),
        human_handover_keywords = VALUES(human_handover_keywords),
        handover_message = VALUES(handover_message)`,
      [
        agencyId,
        name || "Nexa AI Assistant",
        systemPrompt || "You are a helpful AI customer assistant.",
        provider,
        modelName,
        apiKey || null,
        Number(temperature),
        isActive ? 1 : 0,
        fallbackEnabled ? 1 : 0,
        humanHandoverKeywords || "human, agent, representative",
        handoverMessage || "I will connect you with a live human representative right away.",
      ]
    );

    return res.json({ success: true, message: "AI Agent settings updated successfully!" });
  } catch (err) {
    console.error("Update AI agent error:", err);
    return res.status(500).json({ success: false, message: "Failed to update AI Agent" });
  }
});

// ─── GET KNOWLEDGE SOURCES ───────────────────────────────────────────────────
router.get("/ai/knowledge", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const [sources] = await pool.query(
      "SELECT * FROM knowledge_sources WHERE agency_id = ? ORDER BY created_at DESC",
      [agencyId]
    );
    return res.json({ success: true, sources });
  } catch (err) {
    console.error("Get knowledge error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── ADD TEXT DOCUMENT TO KNOWLEDGE BASE ─────────────────────────────────────
router.post("/ai/knowledge/text", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const { title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ success: false, message: "Title and content text are required" });
    }

    const [ins] = await pool.query(
      "INSERT INTO knowledge_sources (agency_id, source_type, title, content_text, status) VALUES (?, 'TEXT', ?, ?, 'INDEXING')",
      [agencyId, title.trim(), content.trim()]
    );

    const sourceId = ins.insertId;
    const totalChunks = await indexKnowledgeSource(sourceId, agencyId, content.trim());

    return res.status(201).json({
      success: true,
      message: `Document "${title}" indexed successfully into ${totalChunks} chunks!`,
      sourceId,
      totalChunks,
    });
  } catch (err) {
    console.error("Add text knowledge error:", err);
    return res.status(500).json({ success: false, message: "Failed to add text knowledge" });
  }
});

// ─── ADD FAQ PAIR TO KNOWLEDGE BASE ──────────────────────────────────────────
router.post("/ai/knowledge/faq", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const { question, answer } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ success: false, message: "Question and answer are required" });
    }

    const formattedContent = `Question: ${question.trim()}\nAnswer: ${answer.trim()}`;
    const [ins] = await pool.query(
      "INSERT INTO knowledge_sources (agency_id, source_type, title, content_text, status) VALUES (?, 'FAQ', ?, ?, 'INDEXING')",
      [agencyId, question.trim(), formattedContent]
    );

    const sourceId = ins.insertId;
    const totalChunks = await indexKnowledgeSource(sourceId, agencyId, formattedContent);

    return res.status(201).json({
      success: true,
      message: "FAQ indexed successfully!",
      sourceId,
      totalChunks,
    });
  } catch (err) {
    console.error("Add FAQ knowledge error:", err);
    return res.status(500).json({ success: false, message: "Failed to add FAQ" });
  }
});

// ─── SCRAPE & INDEX WEBSITE URL ──────────────────────────────────────────────
router.post("/ai/knowledge/url", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const { url, title } = req.body;

    if (!url) return res.status(400).json({ success: false, message: "Website URL is required" });

    // Fetch webpage HTML
    let webpageText = "";
    try {
      const resp = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0 (NexaBot AI Knowledge Indexer)" },
        timeout: 15000,
      });
      // Strip HTML tags & scripts
      webpageText = resp.data
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    } catch (fetchErr) {
      return res.status(400).json({
        success: false,
        message: `Failed to fetch webpage content: ${fetchErr.message}`,
      });
    }

    if (webpageText.length < 50) {
      return res.status(400).json({ success: false, message: "Webpage contained too little text content to index." });
    }

    const docTitle = title || url.replace(/^https?:\/\//, "");

    const [ins] = await pool.query(
      "INSERT INTO knowledge_sources (agency_id, source_type, title, source_url, content_text, status) VALUES (?, 'URL', ?, ?, ?, 'INDEXING')",
      [agencyId, docTitle, url, webpageText]
    );

    const sourceId = ins.insertId;
    const totalChunks = await indexKnowledgeSource(sourceId, agencyId, webpageText);

    return res.status(201).json({
      success: true,
      message: `Website "${url}" scraped and indexed into ${totalChunks} chunks!`,
      sourceId,
      totalChunks,
    });
  } catch (err) {
    console.error("Scrape URL knowledge error:", err);
    return res.status(500).json({ success: false, message: "Failed to scrape and index URL" });
  }
});

// ─── DELETE KNOWLEDGE SOURCE ─────────────────────────────────────────────────
router.delete("/ai/knowledge/:id", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    await pool.query("DELETE FROM knowledge_sources WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    return res.json({ success: true, message: "Knowledge source deleted successfully" });
  } catch (err) {
    console.error("Delete knowledge error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete knowledge source" });
  }
});

// ─── INTERACTIVE TEST CHAT (PLAYGROUND) ──────────────────────────────────────
router.post("/ai/test-chat", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const { query, conversationHistory = [] } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ success: false, message: "Query message is required" });
    }

    const result = await generateAIResponse({
      agencyId,
      userQuery: query.trim(),
      channel: "TEST_PLAYGROUND",
      conversationHistory,
    });

    return res.json({
      success: true,
      reply: result.reply,
      isHandover: result.isHandover,
      sourcesUsed: result.sourcesUsed,
    });
  } catch (err) {
    console.error("Test AI chat error:", err);
    return res.status(500).json({ success: false, message: "AI generation failed" });
  }
});

export default router;
