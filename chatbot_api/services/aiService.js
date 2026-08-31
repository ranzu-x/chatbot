import axios from "axios";
import pool from "../db.js";

// ─── 1. CHUNK & INDEX KNOWLEDGE CONTENT ──────────────────────────────────────
export async function indexKnowledgeSource(sourceId, agencyId, contentText) {
  if (!contentText || !contentText.trim()) return 0;

  // Clear existing chunks for this source
  await pool.query("DELETE FROM knowledge_chunks WHERE source_id = ?", [sourceId]);

  const cleanText = contentText.replace(/\r\n/g, "\n").trim();
  const chunkSize = 500;
  const chunkOverlap = 100;
  const chunks = [];

  let start = 0;
  while (start < cleanText.length) {
    let end = start + chunkSize;
    if (end >= cleanText.length) {
      chunks.push(cleanText.slice(start).trim());
      break;
    }

    // Try to break on sentence or newline boundary
    let breakPoint = cleanText.lastIndexOf("\n", end);
    if (breakPoint <= start) {
      breakPoint = cleanText.lastIndexOf(". ", end);
    }
    if (breakPoint <= start) {
      breakPoint = cleanText.lastIndexOf(" ", end);
    }
    if (breakPoint <= start) {
      breakPoint = end;
    }

    const chunk = cleanText.slice(start, breakPoint).trim();
    if (chunk) chunks.push(chunk);
    start = breakPoint - chunkOverlap;
    if (start < 0 || start >= cleanText.length) start = breakPoint;
  }

  // Insert chunks into database
  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    const keywords = extractKeywords(chunkText);
    await pool.query(
      "INSERT INTO knowledge_chunks (source_id, agency_id, chunk_index, chunk_text, embedding_keywords) VALUES (?, ?, ?, ?, ?)",
      [sourceId, agencyId, i, chunkText, JSON.stringify(keywords)]
    );
  }

  // Update total chunks count in knowledge_sources
  await pool.query(
    "UPDATE knowledge_sources SET total_chunks = ?, status = 'READY' WHERE id = ?",
    [chunks.length, sourceId]
  );

  return chunks.length;
}

// Simple keyword extractor for fast semantic ranking
function extractKeywords(text) {
  const stopwords = new Set([
    "the", "is", "at", "which", "on", "and", "a", "an", "in", "to", "for", "of", "or", "by", "with",
    "from", "as", "it", "that", "this", "be", "are", "was", "were", "we", "you", "they", "our", "your"
  ]);
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopwords.has(w));
  return Array.from(new Set(words));
}

// ─── 2. RETRIEVE RELEVANT KNOWLEDGE CHUNKS (RAG) ─────────────────────────────
export async function retrieveRelevantChunks(agencyId, query, topK = 4) {
  const queryWords = extractKeywords(query);
  if (queryWords.length === 0) {
    const [randomChunks] = await pool.query(
      `SELECT kc.*, ks.title as source_title, ks.source_type
       FROM knowledge_chunks kc
       JOIN knowledge_sources ks ON ks.id = kc.source_id
       WHERE kc.agency_id = ? AND ks.status = 'READY'
       LIMIT ?`,
      [agencyId, topK]
    );
    return randomChunks.map((c) => ({ ...c, score: 1.0 }));
  }

  const [allChunks] = await pool.query(
    `SELECT kc.*, ks.title as source_title, ks.source_type
     FROM knowledge_chunks kc
     JOIN knowledge_sources ks ON ks.id = kc.source_id
     WHERE kc.agency_id = ? AND ks.status = 'READY'`,
    [agencyId]
  );

  const scored = allChunks.map((chunk) => {
    let score = 0;
    const chunkLower = chunk.chunk_text.toLowerCase();
    
    // Direct phrase match boost
    if (chunkLower.includes(query.toLowerCase())) {
      score += 15;
    }

    // Keyword match scoring
    for (const kw of queryWords) {
      if (chunkLower.includes(kw)) {
        score += 3;
      }
    }

    return {
      ...chunk,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.filter((c) => c.score > 0).slice(0, topK);
}

// ─── 3. GENERATE AI RESPONSE (MULTI-MODEL OR CONTEXT SYNTHESIZER) ───────────
export async function generateAIResponse({ agencyId, userQuery, subscriberId = null, channel = "WEBCHAT", conversationHistory = [] }) {
  // 1. Fetch AI Agent Settings for this agency
  const [agents] = await pool.query("SELECT * FROM ai_agents WHERE agency_id = ? LIMIT 1", [agencyId]);
  if (!agents.length || !agents[0].is_active) {
    return { reply: null, isHandover: false, sourcesUsed: [] };
  }

  const agent = agents[0];

  // 2. Check for Human Handover Intent
  const handoverKeywords = (agent.human_handover_keywords || "")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);

  const queryLower = userQuery.toLowerCase();
  const isHandover = handoverKeywords.some((hw) => queryLower.includes(hw));

  if (isHandover) {
    const handoverReply = agent.handover_message || "I will connect you with a live human representative right away. Please hold on a moment.";
    await pool.query(
      "INSERT INTO ai_chat_logs (agency_id, subscriber_id, channel, user_query, ai_response, handover_triggered) VALUES (?, ?, ?, ?, ?, 1)",
      [agencyId, subscriberId, channel, userQuery, handoverReply]
    );
    return {
      reply: handoverReply,
      isHandover: true,
      sourcesUsed: [],
    };
  }

  // 3. Retrieve Context from Knowledge Base
  const relevantChunks = await retrieveRelevantChunks(agencyId, userQuery, 4);
  const contextText = relevantChunks.map((c, i) => `[Source ${i + 1}: ${c.source_title}]\n${c.chunk_text}`).join("\n\n");

  const sourcesUsed = relevantChunks.map((c) => ({
    sourceId: c.source_id,
    title: c.source_title,
    type: c.source_type,
    score: c.score,
    snippet: c.chunk_text.slice(0, 140) + "...",
  }));

  // 4. Construct System Prompt & Messages
  const systemInstruction = `${agent.system_prompt}

BUSINESS KNOWLEDGE BASE CONTEXT:
${contextText ? contextText : "No specific knowledge base documents matched. Provide general assistance or offer human support."}

IMPORTANT GUIDELINES:
- Answer the customer's question directly, clearly, and concisely.
- Ground your answer in the provided knowledge base context whenever possible.
- If unsure or the info is missing, politely say you do not have that specific detail and offer to connect them with a human agent.`;

  let aiReply = "";

  // 5. Try OpenAI / Gemini if configured, else Context Synthesizer
  const openAIKey = agent.api_key || process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (agent.provider === "OPENAI" && openAIKey) {
    try {
      const messages = [
        { role: "system", content: systemInstruction },
        ...conversationHistory.slice(-4).map((m) => ({ role: m.role || "user", content: m.text || m.content })),
        { role: "user", content: userQuery },
      ];

      const res = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: agent.model_name || "gpt-4o-mini",
          messages,
          temperature: Number(agent.temperature) || 0.7,
          max_tokens: 500,
        },
        {
          headers: {
            Authorization: `Bearer ${openAIKey}`,
            "Content-Type": "application/json",
          },
          timeout: 20000,
        }
      );
      aiReply = res.data?.choices?.[0]?.message?.content?.trim() || "";
    } catch (err) {
      console.error("OpenAI API call error:", err.response?.data || err.message);
    }
  } else if (agent.provider === "GEMINI" && geminiKey) {
    try {
      const geminiModel = agent.model_name || "gemini-1.5-flash";
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`,
        {
          contents: [
            {
              parts: [{ text: `${systemInstruction}\n\nCustomer: ${userQuery}` }],
            },
          ],
        },
        { timeout: 20000 }
      );
      aiReply = res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    } catch (err) {
      console.error("Gemini API call error:", err.response?.data || err.message);
    }
  }

  // 6. Intelligent Context-Aware Synthesizer (Zero external API dependencies fallback)
  if (!aiReply) {
    if (relevantChunks.length > 0) {
      const topChunk = relevantChunks[0].chunk_text;
      aiReply = `Based on our information: ${topChunk}\n\nLet me know if you need any further details or if you would like me to connect you with a team member!`;
    } else {
      aiReply = `Thank you for reaching out! I'm here to help. Could you please clarify your question, or type "human" if you'd like to speak with a representative?`;
    }
  }

  // 7. Log AI Chat Interaction
  await pool.query(
    "INSERT INTO ai_chat_logs (agency_id, subscriber_id, channel, user_query, ai_response, sources_used, handover_triggered) VALUES (?, ?, ?, ?, ?, ?, 0)",
    [agencyId, subscriberId, channel, userQuery, aiReply, JSON.stringify(sourcesUsed)]
  );

  return {
    reply: aiReply,
    isHandover: false,
    sourcesUsed,
  };
}
