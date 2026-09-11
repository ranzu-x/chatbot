/**
 * Comment Automation → Private Reply via Bot Flow.
 *
 * Meta's Graph API permits exactly ONE `private_replies` call per comment
 * (POST /{comment-id}/private_replies, text-only — confirmed against the
 * official Graph API reference). So "use a Bot Flow as the private reply,
 * capped at 2 messages" is implemented as: message 1 always goes out through
 * that one-shot private_replies mechanism (recipient.comment_id); message 2,
 * if the flow has one, is sent immediately afterward through the ordinary
 * Messenger/IG Send API (recipient.id) — no delay, no waiting on user input.
 * Meta doesn't restrict ordinary sends once a thread exists; only the
 * private-reply entry point itself is one-shot.
 *
 * Deliberately standalone rather than routed through utils/flowEngine.js's
 * processFlow(): that engine requires an existing `conversations` row
 * (flow_sessions.conversation_id is NOT NULL), which a bare comment event has
 * no reason to create, and folding a "max 2 messages, no conversation" mode
 * into the shared engine would risk normal chat-flow behavior elsewhere.
 * Only text/image nodes are honored — anything else (buttons, input
 * collection, delays, conditions) stops the walk, keeping this feature
 * exactly what it's meant to be: short and simple.
 */
import axios from "axios";
import pool from "../db.js";

const META_API_VERSION = process.env.META_API_VERSION || "v21.0";

function applyTemplate(text, senderName) {
  return (text || "")
    .replace(/\{\{name\}\}/gi, senderName || "there")
    .replace(/\{\{first_name\}\}/gi, (senderName || "").split(" ")[0] || "there");
}

function buildMessagePayload(msg) {
  if (msg.type === "image" && msg.mediaUrl) {
    return { attachment: { type: "image", payload: { url: msg.mediaUrl } } };
  }
  return { text: msg.text || "" };
}

// Walks the flow from its start node, collecting up to `maxMessages` outbound
// text/image nodes. Any other node type halts the walk.
function collectMessages(nodes, edges, maxMessages) {
  const messages = [];
  if (!Array.isArray(nodes) || !nodes.length) return messages;

  const startNode = nodes.find((n) => n.type === "start") || nodes[0];
  let currentId = (edges || []).find((e) => e.source === startNode.id)?.target || null;
  const visited = new Set();

  while (currentId && messages.length < maxMessages && !visited.has(currentId)) {
    visited.add(currentId);
    const node = nodes.find((n) => n.id === currentId);
    if (!node) break;

    if (node.type === "text") {
      const text = (node.data?.message || node.data?.text || node.data?.body || "").trim();
      if (text) messages.push({ type: "text", text });
    } else if (node.type === "image") {
      const mediaUrl = (node.data?.imageUrl || node.data?.mediaUrl || node.data?.url || "").trim();
      if (mediaUrl) messages.push({ type: "image", mediaUrl });
    } else {
      break; // buttons/input/delay/condition/etc. — stop, keep it short & simple
    }

    currentId = (edges || []).find((e) => e.source === node.id)?.target || null;
  }

  return messages;
}

/**
 * @returns {{ sent: number }}
 */
export async function runPrivateReplyFlow({ agencyId, flowId, commentId, senderId, senderName, integration }) {
  if (!flowId || !commentId || !integration?.access_token) return { sent: 0 };

  const [[flow]] = await pool.query(
    "SELECT id, nodes_json, edges_json FROM flows WHERE id = ? AND agency_id = ?",
    [flowId, agencyId]
  );
  if (!flow) {
    console.warn(`[Comment Automation] Private-reply flow ${flowId} not found for agency ${agencyId}`);
    return { sent: 0 };
  }

  let nodes = [];
  let edges = [];
  try {
    nodes = typeof flow.nodes_json === "string" ? JSON.parse(flow.nodes_json || "[]") : flow.nodes_json || [];
    edges = typeof flow.edges_json === "string" ? JSON.parse(flow.edges_json || "[]") : flow.edges_json || [];
  } catch {
    console.warn(`[Comment Automation] Could not parse nodes/edges for flow ${flowId}`);
    return { sent: 0 };
  }

  const messages = collectMessages(nodes, edges, 2).map((m) => ({
    ...m,
    text: m.text ? applyTemplate(m.text, senderName) : m.text,
  }));
  if (!messages.length) {
    console.warn(`[Comment Automation] Flow ${flowId} has no text/image message to send as a private reply`);
    return { sent: 0 };
  }

  const accessToken = integration.access_token;
  let sent = 0;

  // Message 1 — the one-shot private_replies mechanism.
  try {
    await axios.post(
      `https://graph.facebook.com/${META_API_VERSION}/me/messages`,
      { recipient: { comment_id: commentId }, message: buildMessagePayload(messages[0]) },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    sent += 1;
    console.log(`[Comment Automation] 📩 Private-reply flow message 1/${messages.length} sent (flow ${flowId}, comment ${commentId})`);
  } catch (e) {
    console.error("[Comment Automation] ❌ Private-reply flow message 1 failed:", JSON.stringify(e.response?.data || e.message, null, 2));
    return { sent };
  }

  // Message 2 (optional) — ordinary Send API, immediately after.
  if (messages[1] && senderId) {
    try {
      await axios.post(
        `https://graph.facebook.com/${META_API_VERSION}/me/messages`,
        { recipient: { id: senderId }, message: buildMessagePayload(messages[1]) },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      sent += 1;
      console.log(`[Comment Automation] 📩 Private-reply flow message 2/${messages.length} sent (flow ${flowId}, comment ${commentId})`);
    } catch (e) {
      console.error("[Comment Automation] ❌ Private-reply flow message 2 failed:", JSON.stringify(e.response?.data || e.message, null, 2));
    }
  }

  return { sent };
}

/**
 * AI-powered public comment reply. Uses a specific AI Agent's system prompt
 * (if ai_agent_id is set) layered with the rule's own promptInstruction, or
 * falls back to the agency's default AI provider directly. Falls back to
 * `fallbackText` (the rule's static auto_reply_comment, if any) on any
 * failure — an AI hiccup should never silently drop the reply.
 */
export async function generateCommentReply({ agencyId, promptInstruction, agentId, commentText, senderName, fallbackText }) {
  const { resolveCapability } = await import("./aiProviders/registry.js");

  let agent = null;
  if (agentId) {
    const [[row]] = await pool.query(
      "SELECT id, name, system_prompt, preferred_provider, preferred_model FROM ai_agents WHERE id = ? AND agency_id = ?",
      [agentId, agencyId]
    );
    agent = row || null;
  }

  const resolved = await resolveCapability(agencyId, "text_generation", agent?.preferred_provider || null);
  if (!resolved) {
    console.warn(`[Comment Automation] No AI provider configured for agency ${agencyId} — falling back to static text`);
    return fallbackText || "";
  }

  const systemParts = [
    "You are replying publicly to a comment on a social media post as the brand's page. Keep the reply short (1-2 sentences), friendly, and on-brand. Output ONLY the reply text — no preamble, no quotes.",
  ];
  if (agent?.system_prompt) systemParts.push(agent.system_prompt);
  if (promptInstruction) systemParts.push(`Instruction: ${promptInstruction}`);

  const messages = [
    { role: "system", content: systemParts.join("\n\n") },
    { role: "user", content: `Commenter "${senderName || "a customer"}" wrote: "${commentText}"\n\nWrite a public reply to this comment.` },
  ];

  try {
    const result = await resolved.adapter.generate({
      apiKey: resolved.apiKey,
      model: agent?.preferred_model || resolved.model,
      messages,
      maxTokens: 200,
    });
    const text = (result?.text || "").trim();
    return text || fallbackText || "";
  } catch (e) {
    console.error("[Comment Automation] ❌ AI comment reply generation failed:", e.message);
    return fallbackText || "";
  }
}
