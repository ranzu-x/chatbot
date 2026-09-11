/**
 * Hybrid Agent routing: fast keyword/phrase matching first (free, instant),
 * a single embeddings call as a tiebreaker only when nothing matches
 * confidently, falling back to the bot's Default Agent. The expensive
 * chat-completion model is never called here — only for the final reply
 * (utils/aiReplyEngine.js).
 */
import pool from "../db.js";
import { resolveCapability } from "./aiProviders/registry.js";

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function parseJsonColumn(val, fallback) {
  if (val === null || val === undefined) return fallback;
  if (typeof val !== "string") return val; // mysql2 sometimes already parses JSON columns
  try { return JSON.parse(val); } catch { return fallback; }
}

/** Case-insensitive "does the message contain this keyword/phrase" check. */
function keywordMatches(messageLower, keywords) {
  return (keywords || []).some((kw) => kw && messageLower.includes(String(kw).toLowerCase().trim()));
}

/**
 * @param {object} params
 * @param {number} params.agencyId
 * @param {Array<{id:number,is_default:number}>} params.agents - active agents eligible for this bot
 * @param {Map<number,object>} params.rulesByAgentId - agent_id -> ai_agent_routing_rules row
 * @param {string} params.message
 * @param {number} params.confidenceThreshold
 * @returns {Promise<{ agentId: number|null, method: 'keyword'|'embedding'|'default', score: number|null }>}
 */
export async function routeMessage({ agencyId, agents, rulesByAgentId, message, confidenceThreshold }) {
  const messageLower = (message || "").toLowerCase().trim();

  // 1. Keyword match — highest-priority rule wins; free, no AI call.
  const withRules = agents
    .map((a) => ({ agent: a, rule: rulesByAgentId.get(a.id) }))
    .filter((x) => x.rule)
    .sort((x, y) => (y.rule.priority || 0) - (x.rule.priority || 0));

  if (messageLower) {
    for (const { agent, rule } of withRules) {
      const keywords = parseJsonColumn(rule.keywords, []);
      if (keywordMatches(messageLower, keywords)) {
        return { agentId: agent.id, method: "keyword", score: 1 };
      }
    }
  }

  // 2. Semantic tiebreak — only if at least one agent has cached example
  // embeddings AND an embeddings-capable provider is actually configured.
  const candidatesWithEmbeddings = withRules.filter((x) => {
    const emb = parseJsonColumn(x.rule.example_embeddings, []);
    return Array.isArray(emb) && emb.length > 0;
  });

  if (messageLower && candidatesWithEmbeddings.length > 0) {
    const resolved = await resolveCapability(agencyId, "embeddings");
    if (resolved) {
      try {
        const [messageEmbedding] = await resolved.adapter.embed({ apiKey: resolved.apiKey, model: resolved.model, texts: [message] });
        let best = { agentId: null, score: -1 };
        for (const { agent, rule } of candidatesWithEmbeddings) {
          const phraseEmbeddings = parseJsonColumn(rule.example_embeddings, []);
          const maxScore = Math.max(...phraseEmbeddings.map((e) => cosineSimilarity(messageEmbedding, e)));
          if (maxScore > best.score) best = { agentId: agent.id, score: maxScore };
        }
        if (best.agentId && best.score >= (confidenceThreshold ?? 0.68)) {
          // Hand the already-computed message embedding back to the caller
          // (utils/aiReplyEngine.js) so knowledge-base retrieval can reuse
          // it instead of paying for a second embeddings call.
          return { agentId: best.agentId, method: "embedding", score: best.score, messageEmbedding };
        }
      } catch (err) {
        console.error("[AI Routing] Embedding tiebreak failed, falling back to default:", err.message);
      }
    }
  }

  // 3. Default Agent for this bot, or the agency's own default Agent.
  const defaultAgent = agents.find((a) => a.is_default);
  return { agentId: defaultAgent ? defaultAgent.id : null, method: "default", score: null };
}

/**
 * Loads everything routeMessage() needs for one integration in one shot:
 * the active-on-this-bot agents and their routing rules.
 */
export async function loadRoutingContext(agencyId, integrationId) {
  const [agents] = await pool.query(
    `SELECT a.* FROM ai_agents a
     JOIN ai_reply_active_agents araa ON araa.agent_id = a.id
     WHERE araa.integration_id = ? AND a.agency_id = ? AND a.is_active = 1`,
    [integrationId, agencyId]
  );
  if (agents.length === 0) return { agents: [], rulesByAgentId: new Map() };

  const [rules] = await pool.query(
    `SELECT * FROM ai_agent_routing_rules WHERE agent_id IN (?)`,
    [agents.map((a) => a.id)]
  );
  const rulesByAgentId = new Map(rules.map((r) => [r.agent_id, r]));
  return { agents, rulesByAgentId };
}
