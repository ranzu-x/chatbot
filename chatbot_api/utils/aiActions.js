/**
 * An Agent's "Actions" are an explicit allow-list (ai_agent_actions) — each
 * row is a FULLY configured action (e.g. "add the VIP label", not just "add
 * some label the model picks") built at setup time by whoever configured
 * the Agent, never by the model. The model only ever decides WHETHER to
 * call one of the tools it was offered; it can never invent a target
 * (a label/flow/sequence id) that wasn't already baked into that row, and
 * it can never call an action that isn't in `tools` at all (validated by
 * `byName` lookup in utils/aiReplyEngine.js — an unrecognized tool-call name
 * is simply ignored, never executed). This is what keeps an AI Agent from
 * bypassing whatever permissions its actions were configured with.
 *
 * Each action_type maps 1:1 onto an existing primitive already used
 * elsewhere in the app (button taps, Flow Builder nodes) — reused here
 * rather than reimplemented.
 */
import pool from "../db.js";
import { applyLabelToContact, syncContactTagsJson } from "../routes/labels.js";
import { enrollContactsInSequence, unsubscribeContactFromSequence } from "../routes/sequences.js";

async function describeAction(a) {
  switch (a.action_type) {
    case "add_label":
    case "remove_label": {
      const [[label]] = await pool.query("SELECT name FROM labels WHERE id = ?", [a.config?.labelId]);
      return `${a.action_type === "add_label" ? "Tag the contact with" : "Remove the"} label "${label?.name || "?"}"${a.action_type === "remove_label" ? " from the contact" : ""}`;
    }
    case "start_flow": {
      const [[flow]] = await pool.query("SELECT name FROM flows WHERE id = ?", [a.config?.flowId]);
      return `Send the contact into the "${flow?.name || "?"}" flow`;
    }
    case "start_sequence": {
      const [[seq]] = await pool.query("SELECT name FROM sequences WHERE id = ?", [a.config?.sequenceId]);
      return `Enroll the contact in the "${seq?.name || "?"}" sequence`;
    }
    case "stop_sequence": {
      const [[seq]] = await pool.query("SELECT name FROM sequences WHERE id = ?", [a.config?.sequenceId]);
      return `Stop the contact's enrollment in the "${seq?.name || "?"}" sequence`;
    }
    case "assign_human":
      return "Hand this conversation off to a human team member";
    default:
      return a.action_type;
  }
}

/**
 * Builds the `tools` array to pass to a provider's generate() call, plus a
 * name->row lookup used afterwards to validate + execute whatever the model
 * actually decided to call.
 */
export async function buildToolsForAgent(agentId) {
  const [rows] = await pool.query("SELECT * FROM ai_agent_actions WHERE agent_id = ? AND enabled = 1", [agentId]);
  const parsed = rows.map((r) => ({ ...r, config: typeof r.config === "string" ? JSON.parse(r.config || "{}") : (r.config || {}) }));

  const tools = [];
  const byName = new Map();
  for (const a of parsed) {
    const name = `action_${a.id}`;
    const description = await describeAction(a);
    tools.push({ type: "function", function: { name, description: `${description}. Call this only when it's genuinely appropriate for what the contact just said.`, parameters: { type: "object", properties: {} } } });
    byName.set(name, a);
  }
  return { tools, byName };
}

// BOT SCOPE (utils/botScope.js): an AI action may only start flows / sequences of the SAME bot
// account the conversation is on — never another bot's.
async function conversationIntegrationId(conversation, agencyId) {
  if (conversation?.integration_id) return conversation.integration_id;
  if (!conversation?.id) return null;
  const [[row]] = await pool.query("SELECT integration_id FROM conversations WHERE id = ? AND agency_id = ?", [conversation.id, agencyId]);
  return row?.integration_id ?? null;
}

/** Runs one already-validated (in the agent's own allow-list) action row. */
export async function executeAction(actionRow, { agencyId, contact, conversation }) {
  const config = actionRow.config || {};
  switch (actionRow.action_type) {
    case "add_label":
      if (config.labelId && contact?.id) await applyLabelToContact(agencyId, contact.id, config.labelId);
      return;
    case "remove_label":
      if (config.labelId && contact?.id) {
        await pool.query("DELETE FROM contact_labels WHERE contact_id = ? AND label_id = ?", [contact.id, config.labelId]);
        await syncContactTagsJson(contact.id);
      }
      return;
    case "start_flow": {
      if (!config.flowId || !conversation?.id) return;
      const [[targetFlow]] = await pool.query(
        "SELECT * FROM flows WHERE id = ? AND agency_id = ? AND integration_id = ? AND is_active = 1",
        [config.flowId, agencyId, await conversationIntegrationId(conversation, agencyId)]
      );
      if (!targetFlow) return;
      const nodes = JSON.parse(targetFlow.nodes_json || "[]");
      const startNode = nodes.find((n) => n.type === "start");
      if (!startNode) return;
      await pool.query("UPDATE flow_sessions SET status = 'COMPLETED' WHERE conversation_id = ? AND status = 'ACTIVE'", [conversation.id]);
      await pool.query(
        "INSERT INTO flow_sessions (agency_id, conversation_id, flow_id, current_node_id, variables, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
        [agencyId, conversation.id, targetFlow.id, startNode.id, JSON.stringify({})]
      );
      return;
    }
    case "start_sequence":
      if (config.sequenceId && contact?.id) await enrollContactsInSequence(config.sequenceId, agencyId, { contactId: contact.id, enrolledVia: "ai-agent", integrationId: await conversationIntegrationId(conversation, agencyId) });
      return;
    case "stop_sequence":
      if (config.sequenceId && contact?.id) await unsubscribeContactFromSequence(config.sequenceId, agencyId, contact.id, { integrationId: await conversationIntegrationId(conversation, agencyId) });
      return;
    case "assign_human":
      if (conversation?.id) await pool.query("UPDATE conversations SET status = 'OPEN', assigned_to_id = NULL WHERE id = ?", [conversation.id]);
      return;
    default:
      return;
  }
}
