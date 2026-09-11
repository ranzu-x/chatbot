/**
 * AI Agent Knowledge Base — Text / URL / File (PDF, DOCX, TXT) / Google
 * Sheet / Image sources. Google Sheet reuses the existing Google Sheets
 * OAuth connection (utils/googleSheets.js) already used for User Input Flow
 * exports; Image is indexed via a vision-capable provider's description of
 * the picture (images aren't text-embeddable directly — the description is
 * what actually gets chunked and searched).
 */
import express from "express";
import axios from "axios";
import multer from "multer";
import path from "path";
import fs from "fs";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { indexKnowledgeSource } from "../utils/aiKnowledge.js";
import { extractTextFromFile } from "../utils/fileTextExtractor.js";
import { readSheetValues } from "../utils/googleSheets.js";
import { resolveCapability } from "../utils/aiProviders/registry.js";

const router = express.Router();
router.use("/ai/agents", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

function getAgencyId(req) {
  const agencyId = req.user?.agencyId;
  if (!agencyId) throw Object.assign(new Error("No agency associated with this account"), { status: 400 });
  return agencyId;
}

async function assertOwnsAgent(agencyId, agentId) {
  const [[row]] = await pool.query("SELECT id FROM ai_agents WHERE id = ? AND agency_id = ?", [agentId, agencyId]);
  if (!row) throw Object.assign(new Error("Agent not found"), { status: 404 });
}

const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `aiknowledge-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /pdf|docx|doc|txt/.test(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error("Only PDF, DOCX, and TXT files are supported"), ok);
  },
});

const uploadImage = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `aiknowledge-img-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /jpe?g|png|webp|gif/.test(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error("Only JPG, PNG, WEBP, and GIF images are supported"), ok);
  },
});

/** A vision-capable provider's factual description of an image — this text is what actually gets chunked/embedded/searched. */
async function describeImage(agencyId, buffer, mimeType) {
  const resolved = await resolveCapability(agencyId, "vision");
  if (!resolved) {
    throw Object.assign(new Error("No vision-capable AI provider connected — connect OpenAI or Gemini in Settings → AI Providers."), { status: 400 });
  }
  const result = await resolved.adapter.generate({
    apiKey: resolved.apiKey,
    model: resolved.model,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Describe this image factually and thoroughly — every piece of text, number, price, or label visible in it, and what it depicts. This description will be used as searchable knowledge base content, not shown to anyone directly, so be complete rather than concise." },
        { type: "image", mimeType, base64: buffer.toString("base64") },
      ],
    }],
    maxTokens: 500,
  });
  return result.text;
}

export function stripHtml(html) {
  return String(html)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Renders a sheet's rows as readable prose — "Header1: val1, Header2: val2" per row — far better indexable text than a raw CSV dump. */
export function sheetValuesToText(rows) {
  if (!rows || rows.length === 0) return "";
  const [header, ...body] = rows;
  return body
    .map((row) => header.map((h, i) => `${h}: ${row[i] ?? ""}`).join(", "))
    .join("\n");
}

// ─── LIST sources for an Agent ────────────────────────────────────────────
router.get("/ai/agents/:id/knowledge", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    await assertOwnsAgent(agencyId, req.params.id);
    const [sources] = await pool.query(
      `SELECT s.*, (SELECT COUNT(*) FROM ai_knowledge_chunks c WHERE c.source_id = s.id) AS chunk_count
       FROM ai_agent_knowledge_sources s WHERE s.agent_id = ? ORDER BY s.created_at DESC`,
      [req.params.id]
    );
    return res.json({ success: true, sources });
  } catch (err) {
    const status = err.status || 500;
    console.error("List AI knowledge sources error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

// ─── ADD text source ──────────────────────────────────────────────────────
router.post("/ai/agents/:id/knowledge/text", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    await assertOwnsAgent(agencyId, req.params.id);
    const title = (req.body?.title || "").trim();
    const content = (req.body?.content || "").trim();
    if (!title || !content) return res.status(400).json({ success: false, message: "Title and content are required" });

    const [ins] = await pool.query(
      "INSERT INTO ai_agent_knowledge_sources (agent_id, type, title, source_ref, status) VALUES (?, 'text', ?, ?, 'pending')",
      [req.params.id, title, content]
    );
    const result = await indexKnowledgeSource({ sourceId: ins.insertId, agentId: req.params.id, agencyId, text: content });
    return res.status(201).json({ success: true, sourceId: ins.insertId, ...result });
  } catch (err) {
    const status = err.status || 500;
    console.error("Add AI knowledge text error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

// ─── ADD URL source (scrape + index) ──────────────────────────────────────
router.post("/ai/agents/:id/knowledge/url", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    await assertOwnsAgent(agencyId, req.params.id);
    const url = (req.body?.url || "").trim();
    if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ success: false, message: "A valid URL is required" });

    let pageText = "";
    try {
      const resp = await axios.get(url, { headers: { "User-Agent": "Mozilla/5.0 (AI Knowledge Indexer)" }, timeout: 15000 });
      pageText = stripHtml(resp.data);
    } catch (fetchErr) {
      return res.status(400).json({ success: false, message: `Failed to fetch that URL: ${fetchErr.message}` });
    }
    if (pageText.length < 50) return res.status(400).json({ success: false, message: "That page contained too little text to index." });

    const [ins] = await pool.query(
      "INSERT INTO ai_agent_knowledge_sources (agent_id, type, title, source_ref, status) VALUES (?, 'url', ?, ?, 'pending')",
      [req.params.id, req.body?.title || url.replace(/^https?:\/\//, ""), url]
    );
    const result = await indexKnowledgeSource({ sourceId: ins.insertId, agentId: req.params.id, agencyId, text: pageText });
    return res.status(201).json({ success: true, sourceId: ins.insertId, ...result });
  } catch (err) {
    const status = err.status || 500;
    console.error("Add AI knowledge URL error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

// ─── ADD file source (PDF/DOCX/TXT) ───────────────────────────────────────
router.post("/ai/agents/:id/knowledge/file", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    await assertOwnsAgent(agencyId, req.params.id);
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

    const buffer = fs.readFileSync(req.file.path);
    const text = (await extractTextFromFile(buffer, req.file.mimetype, req.file.originalname)).trim();
    if (text.length < 20) return res.status(400).json({ success: false, message: "Could not extract readable text from that file." });

    const [ins] = await pool.query(
      "INSERT INTO ai_agent_knowledge_sources (agent_id, type, title, source_ref, status) VALUES (?, 'file', ?, ?, 'pending')",
      [req.params.id, req.file.originalname, `/uploads/${req.file.filename}`]
    );
    const result = await indexKnowledgeSource({ sourceId: ins.insertId, agentId: req.params.id, agencyId, text });
    return res.status(201).json({ success: true, sourceId: ins.insertId, ...result });
  } catch (err) {
    const status = err.status || 500;
    console.error("Add AI knowledge file error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error extracting that file" : err.message });
  }
});

// ─── ADD image source (vision-described, then indexed as text) ───────────
router.post("/ai/agents/:id/knowledge/image", (req, res, next) => {
  uploadImage.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    await assertOwnsAgent(agencyId, req.params.id);
    if (!req.file) return res.status(400).json({ success: false, message: "No image uploaded" });

    const [ins] = await pool.query(
      "INSERT INTO ai_agent_knowledge_sources (agent_id, type, title, source_ref, status) VALUES (?, 'image', ?, ?, 'pending')",
      [req.params.id, req.body?.title || req.file.originalname, `/uploads/${req.file.filename}`]
    );

    try {
      const buffer = fs.readFileSync(req.file.path);
      const description = await describeImage(agencyId, buffer, req.file.mimetype);
      const result = await indexKnowledgeSource({ sourceId: ins.insertId, agentId: req.params.id, agencyId, text: description });
      return res.status(201).json({ success: true, sourceId: ins.insertId, ...result });
    } catch (describeErr) {
      await pool.query(
        "UPDATE ai_agent_knowledge_sources SET status = 'error', error_message = ? WHERE id = ?",
        [describeErr.message.slice(0, 500), ins.insertId]
      );
      return res.status(describeErr.status || 400).json({ success: false, sourceId: ins.insertId, message: describeErr.message });
    }
  } catch (err) {
    const status = err.status || 500;
    console.error("Add AI knowledge image error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

// ─── ADD Google Sheet source ──────────────────────────────────────────────
router.post("/ai/agents/:id/knowledge/google-sheet", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    await assertOwnsAgent(agencyId, req.params.id);
    const { spreadsheetId, sheetName, title } = req.body || {};
    if (!spreadsheetId || !sheetName) return res.status(400).json({ success: false, message: "spreadsheetId and sheetName are required" });

    let sheetText;
    try {
      const rows = await readSheetValues(agencyId, spreadsheetId, sheetName);
      sheetText = sheetValuesToText(rows);
    } catch (readErr) {
      return res.status(400).json({ success: false, message: `Failed to read that sheet: ${readErr.message}` });
    }
    if (sheetText.length < 20) return res.status(400).json({ success: false, message: "That sheet/tab had no readable rows to index." });

    const [ins] = await pool.query(
      "INSERT INTO ai_agent_knowledge_sources (agent_id, type, title, source_ref, status) VALUES (?, 'google_sheet', ?, ?, 'pending')",
      [req.params.id, title || sheetName, JSON.stringify({ spreadsheetId, sheetName })]
    );
    const result = await indexKnowledgeSource({ sourceId: ins.insertId, agentId: req.params.id, agencyId, text: sheetText });
    return res.status(201).json({ success: true, sourceId: ins.insertId, ...result });
  } catch (err) {
    const status = err.status || 500;
    console.error("Add AI knowledge Google Sheet error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

// ─── RE-INDEX an existing source (e.g. after connecting an embeddings provider) ──
router.post("/ai/agents/:id/knowledge/:sourceId/reindex", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    await assertOwnsAgent(agencyId, req.params.id);
    const [[source]] = await pool.query("SELECT * FROM ai_agent_knowledge_sources WHERE id = ? AND agent_id = ?", [req.params.sourceId, req.params.id]);
    if (!source) return res.status(404).json({ success: false, message: "Knowledge source not found" });

    let text = source.source_ref;
    if (source.type === "file") {
      const localPath = path.join(process.cwd(), source.source_ref.replace(/^\//, ""));
      if (fs.existsSync(localPath)) {
        text = await extractTextFromFile(fs.readFileSync(localPath), "", source.title);
      } else {
        text = "";
      }
    } else if (source.type === "url") {
      const resp = await axios.get(source.source_ref, { headers: { "User-Agent": "Mozilla/5.0 (AI Knowledge Indexer)" }, timeout: 15000 });
      text = stripHtml(resp.data);
    } else if (source.type === "google_sheet") {
      const { spreadsheetId, sheetName } = JSON.parse(source.source_ref);
      const rows = await readSheetValues(agencyId, spreadsheetId, sheetName);
      text = sheetValuesToText(rows);
    } else if (source.type === "image") {
      const localPath = path.join(process.cwd(), source.source_ref.replace(/^\//, ""));
      if (!fs.existsSync(localPath)) return res.status(400).json({ success: false, message: "The original image file is missing — re-upload it instead." });
      text = await describeImage(agencyId, fs.readFileSync(localPath), "image/jpeg");
    }

    const result = await indexKnowledgeSource({ sourceId: source.id, agentId: req.params.id, agencyId, text });
    return res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    console.error("Re-index AI knowledge source error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

// ─── DELETE a source ───────────────────────────────────────────────────────
router.delete("/ai/agents/:id/knowledge/:sourceId", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    await assertOwnsAgent(agencyId, req.params.id);
    const [result] = await pool.query("DELETE FROM ai_agent_knowledge_sources WHERE id = ? AND agent_id = ?", [req.params.sourceId, req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Knowledge source not found" });
    return res.json({ success: true, message: "Removed." });
  } catch (err) {
    const status = err.status || 500;
    console.error("Delete AI knowledge source error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

export default router;
