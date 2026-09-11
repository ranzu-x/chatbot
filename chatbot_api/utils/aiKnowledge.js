/**
 * Knowledge base chunking + indexing + retrieval for AI Agents. Naive
 * fixed-size chunking (breaking on a nearby space, not mid-word) — no
 * external vector database, matching this codebase's "plain MySQL, no new
 * infra" pattern (see the plan): each chunk's embedding is stored as a JSON
 * float array and ranked with cosine similarity in application code at
 * query time, which is instant at the scale a single Agent's knowledge base
 * realistically reaches.
 */
import pool from "../db.js";
import { resolveCapability } from "./aiProviders/registry.js";
import { cosineSimilarity } from "./aiRouting.js";

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const EMBED_BATCH_SIZE = 20;

export function chunkText(text, { chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP } = {}) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + chunkSize, clean.length);
    if (end < clean.length) {
      // Prefer breaking on a space so a chunk doesn't end mid-word.
      const lastSpace = clean.lastIndexOf(" ", end);
      if (lastSpace > start + chunkSize * 0.5) end = lastSpace;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1); // always make forward progress
  }
  return chunks;
}

/**
 * Chunks `text`, embeds each chunk (batched) if an embeddings-capable
 * provider is configured, and (re-)stores them against `sourceId`. Safe to
 * call again on the same source (e.g. "re-index") — clears old chunks first.
 */
export async function indexKnowledgeSource({ sourceId, agentId, agencyId, text }) {
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    await pool.query(
      "UPDATE ai_agent_knowledge_sources SET status = 'error', error_message = ? WHERE id = ?",
      ["No extractable text content", sourceId]
    );
    return { chunkCount: 0, embedded: false };
  }

  await pool.query("DELETE FROM ai_knowledge_chunks WHERE source_id = ?", [sourceId]);

  let embeddings = null;
  const resolved = await resolveCapability(agencyId, "embeddings");
  if (resolved) {
    try {
      embeddings = [];
      for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
        const vectors = await resolved.adapter.embed({ apiKey: resolved.apiKey, model: resolved.model, texts: batch });
        embeddings.push(...vectors);
      }
    } catch (err) {
      console.error(`[AI Knowledge] Embedding source ${sourceId} failed:`, err.message);
      embeddings = null;
    }
  }

  for (let i = 0; i < chunks.length; i++) {
    await pool.query(
      "INSERT INTO ai_knowledge_chunks (source_id, agent_id, content, embedding, token_count) VALUES (?, ?, ?, ?, ?)",
      [sourceId, agentId, chunks[i], embeddings ? JSON.stringify(embeddings[i]) : null, Math.ceil(chunks[i].length / 4)]
    );
  }

  const status = embeddings ? "indexed" : "error";
  const errorMessage = embeddings
    ? null
    : "Chunked, but no embeddings-capable AI provider is connected — connect OpenAI or Gemini in Settings → AI Providers, then re-index this source.";
  await pool.query(
    "UPDATE ai_agent_knowledge_sources SET status = ?, error_message = ?, last_indexed_at = NOW() WHERE id = ?",
    [status, errorMessage, sourceId]
  );

  return { chunkCount: chunks.length, embedded: !!embeddings };
}

/**
 * Top-N most relevant chunks for a given query embedding, restricted to one
 * Agent's own knowledge base. Chunks that were never successfully embedded
 * (no provider was connected at index time) are silently excluded rather
 * than skewing results with a meaningless zero-vector comparison.
 */
export async function retrieveRelevantChunks(agentId, queryEmbedding, topN = 4, minScore = 0.3) {
  const [chunks] = await pool.query(
    "SELECT id, source_id, content, embedding FROM ai_knowledge_chunks WHERE agent_id = ? AND embedding IS NOT NULL",
    [agentId]
  );
  if (chunks.length === 0) return [];

  const scored = chunks.map((c) => {
    let embedding;
    try { embedding = typeof c.embedding === "string" ? JSON.parse(c.embedding) : c.embedding; } catch { embedding = null; }
    return { id: c.id, sourceId: c.source_id, content: c.content, score: embedding ? cosineSimilarity(queryEmbedding, embedding) : 0 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN).filter((c) => c.score >= minScore);
}
