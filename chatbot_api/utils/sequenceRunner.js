import pool from "../db.js";
import { sendMsg, normalizeListMenuData } from "./flowEngine.js";
import { resolveNextNodeId } from "./flowGraph.js";
import { canSendNow } from "./messagingWindow.js";
import { logBotError } from "./botLogger.js";

/**
 * Sequence Messages runner — walks a Sequence's own node/edge canvas
 * (sequences.nodes_json/edges_json, authored the same way a Flow is) on a
 * schedule, one content node at a time, per enrolled subscriber. Sequences
 * are strictly one-way broadcasts (see the Sequence Messages plan) — no
 * branching, no waiting for a reply — so unlike flowEngine.js's processFlow
 * this never resumes on an inbound message, only on a timer.
 *
 * Rewritten from the original drip-sequence prototype: this version adds
 * optimistic locking (the original had none — a real gap even before adding
 * anything), routes sends through flowEngine's shared sendMsg so Sequence
 * messages show up in the Inbox timeline (the original bypassed it), and
 * respects each channel's real messaging-window rules via
 * utils/messagingWindow.js instead of sending unconditionally.
 */

const PRESET_MINUTES = {
  immediate: 0,
  "5m": 5, "10m": 10, "15m": 15, "30m": 30,
  "1h": 60, "2h": 120, "3h": 180, "4h": 240, "5h": 300, "6h": 360, "7h": 420,
  "8h": 480, "9h": 540, "10h": 600, "11h": 660, "12h": 720, "13h": 780,
  "14h": 840, "15h": 900, "16h": 960, "17h": 1020, "18h": 1080, "19h": 1140,
  "20h": 1200, "21h": 1260, "22h": 1320, "23h": 1380,
};

function resolveWaitMinutes(data) {
  if (data?.preset === "custom") {
    const val = Number(data.customValue) || 0;
    return Math.max(0, data.customUnit === "hours" ? val * 60 : val);
  }
  return PRESET_MINUTES[data?.preset] ?? 0;
}

function replaceVars(text, contact) {
  return (text || "")
    .replace(/\{\{name\}\}/gi, contact?.name || "Customer")
    .replace(/\{\{phone\}\}/gi, contact?.phone || "");
}

/** Finds or creates the conversation a Sequence step's send should attach to
 * (deliberately NOT flowEngine's findOrCreateConversation — that bumps
 * unread_count, which is meant for a genuine inbound message, not a
 * bot-initiated outbound one). */
async function getOrCreateConversation(agencyId, contactId, integrationId) {
  const [existing] = await pool.query(
    "SELECT * FROM conversations WHERE agency_id = ? AND contact_id = ? AND integration_id = ? LIMIT 1",
    [agencyId, contactId, integrationId]
  );
  if (existing.length) return existing[0];

  const [inserted] = await pool.query(
    `INSERT INTO conversations (agency_id, contact_id, integration_id, status, unread_count, last_message_at, created_at)
     VALUES (?, ?, ?, 'OPEN', 0, NOW(), NOW())`,
    [agencyId, contactId, integrationId]
  );
  const [rows] = await pool.query("SELECT * FROM conversations WHERE id = ?", [inserted.insertId]);
  return rows[0];
}

async function logDelivery(subscriberId, nodeId, status, detail) {
  await pool.query(
    "INSERT INTO sequence_subscriber_log (subscriber_id, node_id, status, detail, created_at) VALUES (?, ?, ?, ?, NOW())",
    [subscriberId, nodeId, status, detail ? String(detail).slice(0, 255) : null]
  );
}

async function markComplete(subscriberId) {
  await pool.query("UPDATE sequence_subscribers SET status = 'COMPLETED' WHERE id = ?", [subscriberId]);
}

/** Sends one content node's message — mirrors the shape of the equivalent
 * cases in flowEngine.js's processFlow switch, restricted to the node types
 * SEQUENCE_PALETTE actually offers (text/image/video/audio/file/buttons/
 * quickReplies/listMenu/carousel). `useTemplate` (from canSendNow) means the
 * contact is outside the WhatsApp window — in that case ONLY the approved
 * template goes out, replacing the node's own configured content entirely
 * (this is a real WhatsApp constraint, not a design choice: an unapproved
 * free-form message can't be sent outside the window regardless of content). */
async function sendSequenceContent(node, contact, agencyId, conversation, integration, useTemplate) {
  const flowIdForLogs = null; // sequences have no `flow_id` — logBotError's flowId field is optional
  const common = { flowId: flowIdForLogs, nodeId: node.id, contactIdentifier: contact?.external_id || contact?.phone || null };

  if (useTemplate) {
    await sendMsg(agencyId, conversation, "", "TEXT", integration, { ...common, whatsappTemplate: useTemplate });
    return;
  }

  const data = node.data || {};
  switch (node.type) {
    case "image":
      await sendMsg(agencyId, conversation, replaceVars(data.caption, contact), "IMAGE", integration, {
        ...common, mediaUrl: data.imageUrl || data.mediaUrl, caption: replaceVars(data.caption, contact),
      });
      return;
    case "video":
      await sendMsg(agencyId, conversation, replaceVars(data.caption, contact), "VIDEO", integration, {
        ...common, mediaUrl: data.mediaUrl, caption: replaceVars(data.caption, contact),
      });
      return;
    case "audio":
      await sendMsg(agencyId, conversation, "", "AUDIO", integration, { ...common, mediaUrl: data.mediaUrl });
      return;
    case "file":
      await sendMsg(agencyId, conversation, "", "FILE", integration, { ...common, mediaUrl: data.mediaUrl, filename: data.filename });
      return;
    case "buttons": {
      const formatted = (data.buttons || []).map((btn, idx) => ({
        id: `seq-btn-${idx}`,
        title: btn.title || btn.label || `Option ${idx + 1}`,
        url: (btn.action || btn.type) === "url" ? btn.url : undefined,
        payload: btn.title || btn.label || `Option ${idx + 1}`,
        type: (btn.action || btn.type) === "url" ? "URL" : ((btn.action || btn.type) === "phone" ? "PHONE" : "POSTBACK"),
      }));
      await sendMsg(agencyId, conversation, replaceVars(data.message, contact), "TEXT", integration, { ...common, buttons: formatted.length ? formatted : undefined });
      return;
    }
    case "quickReplies": {
      const formatted = (data.replies || []).map((r, idx) => {
        const title = typeof r === "string" ? r : (r.title || r.label || `Option ${idx + 1}`);
        return { title, payload: title };
      });
      await sendMsg(agencyId, conversation, replaceVars(data.message, contact), "TEXT", integration, { ...common, quickReplies: formatted.length ? formatted : undefined });
      return;
    }
    case "listMenu": {
      const lists = normalizeListMenuData(data);
      const textBody = replaceVars(data.message || data.text, contact);
      for (let li = 0; li < lists.length; li++) {
        const list = lists[li];
        const items = (list.items || [])
          .filter((it) => (typeof it === "string" ? it : it?.title || "").trim())
          .map((it, idx) => ({
            id: `seq-item-${idx}`,
            title: typeof it === "string" ? it : (it.title || `Item ${idx + 1}`),
            description: typeof it === "object" ? (it.description || "") : "",
          }));
        if (items.length === 0) continue;
        await sendMsg(agencyId, conversation, li === 0 ? textBody : (list.title || "More options:"), "TEXT", integration, {
          ...common, listMenu: { buttonText: list.buttonText || "Options", title: list.title || "Menu", items },
        });
      }
      return;
    }
    case "carousel": {
      const cards = data.cards || [];
      await sendMsg(agencyId, conversation, "Options", "TEXT", integration, {
        ...common,
        carousel: cards.map((c) => ({
          title: replaceVars(c.title, contact), subtitle: replaceVars(c.subtitle, contact),
          imageUrl: c.imageUrl || "", buttons: c.buttons || [],
        })),
      });
      return;
    }
    case "text":
    default:
      await sendMsg(agencyId, conversation, replaceVars(data.message || data.text, contact), "TEXT", integration, common);
      return;
  }
}

/** Claims a due subscriber via optimistic locking (compare-and-swap on the
 * exact next_run_at value read in the poll query) so two overlapping ticks —
 * either a slow tick still running when the next 60s timer fires, or a
 * future multi-instance deployment — can never both process the same
 * subscriber. The original runner had no such guard at all.
 *
 * next_run_at is NOT NULL on this table, so the claim marker is a far-future
 * placeholder rather than NULL — every exit path in processSubscriber below
 * either moves status off ACTIVE (markComplete) or overwrites next_run_at
 * with a real value, so nothing is ever left stuck on the placeholder. */
async function claimSubscriber(sub) {
  const [result] = await pool.query(
    "UPDATE sequence_subscribers SET next_run_at = DATE_ADD(NOW(), INTERVAL 1 DAY) WHERE id = ? AND status = 'ACTIVE' AND next_run_at = ?",
    [sub.id, sub.next_run_at]
  );
  return result.affectedRows === 1;
}

async function processSubscriber(sub) {
  const [seqRows] = await pool.query("SELECT * FROM sequences WHERE id = ?", [sub.sequence_id]);
  const sequence = seqRows[0];
  if (!sequence || !sequence.is_active) { await markComplete(sub.id); return; }

  let nodes = [];
  let edges = [];
  try {
    nodes = JSON.parse(sequence.nodes_json || "[]");
    edges = JSON.parse(sequence.edges_json || "[]");
  } catch { /* malformed — treated as empty below, completes the enrollment */ }

  let currentNodeId = sub.current_node_id;
  if (!currentNodeId) {
    const startNode = nodes.find((n) => n.type === "start");
    currentNodeId = startNode ? resolveNextNodeId(edges, startNode.id) : null;
  }
  if (!currentNodeId) { await markComplete(sub.id); return; }

  let node = nodes.find((n) => n.id === currentNodeId);

  // A real bug, not just a defensive edge case: the very first hop after
  // Start (current_node_id starts NULL, resolved fresh above) lands directly
  // on whatever Start's edge points to — which is a Wait node in the very
  // common "Start -> Wait -> first message" shape. That Wait's delay was
  // being silently skipped entirely (treated as a no-op routing node to jump
  // past), sending the first message instantly instead of after the
  // configured wait. Honor it exactly like the after-send Wait handling
  // further below: compute the delay, reschedule, and stop here for this
  // poll — don't fall through to sending anything this tick. This also
  // correctly handles two Wait nodes chained back-to-back (each poll
  // advances one hop, so the delays apply sequentially).
  if (node && node.type === "wait") {
    const delayMinutes = resolveWaitMinutes(node.data);
    const afterWaitId = resolveNextNodeId(edges, node.id);
    if (!afterWaitId) { await markComplete(sub.id); return; }
    await pool.query(
      "UPDATE sequence_subscribers SET current_node_id = ?, next_run_at = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?",
      [afterWaitId, delayMinutes, sub.id]
    );
    return;
  }
  if (!node) { await markComplete(sub.id); return; }

  const [contactRows] = await pool.query("SELECT * FROM contacts WHERE id = ? AND agency_id = ?", [sub.contact_id, sequence.agency_id]);
  const contact = contactRows[0];
  if (!contact) { await markComplete(sub.id); return; }

  // Resolve via the contact's own most-recently-active conversation on this
  // platform FIRST, not "any active integration for this platform" — an
  // agency can have multiple active integrations on the same channel (e.g.
  // two WhatsApp numbers), and a contact only ever really has one they've
  // been talking to. Picking an arbitrary one (the original bug here) could
  // resolve a completely different, long-dormant conversation and compute
  // the messaging-window check against ITS stale history instead of the
  // real one — reporting "outside the 24h window" even seconds after the
  // contact actually messaged in, because it was checking the wrong thread.
  const [existingConvRows] = await pool.query(
    `SELECT c.* FROM conversations c
     JOIN integrations i ON i.id = c.integration_id
     WHERE c.agency_id = ? AND c.contact_id = ? AND i.platform = ? AND i.is_active = 1
     ORDER BY c.last_message_at DESC LIMIT 1`,
    [sequence.agency_id, contact.id, sequence.platform]
  );
  let conversation = existingConvRows[0] || null;
  let integration = null;

  if (conversation) {
    const [integRows] = await pool.query("SELECT * FROM integrations WHERE id = ?", [conversation.integration_id]);
    integration = integRows[0] || null;
  } else {
    // No conversation history at all on this platform (e.g. bulk-enrolled via
    // the API with no prior contact) — fall back to any active integration,
    // same as before, since there's no "which one did they actually use" to go on.
    const [integrationRows] = await pool.query(
      "SELECT * FROM integrations WHERE agency_id = ? AND platform = ? AND is_active = 1 LIMIT 1",
      [sequence.agency_id, sequence.platform]
    );
    integration = integrationRows[0] || null;
  }

  if (!integration) {
    // conversations.integration_id is NOT NULL — every channel, including
    // WEBCHAT (the widget itself is backed by a real integrations row in this
    // codebase, same as any other channel), needs one to attach a conversation to.
    await logBotError({
      agencyId: sequence.agency_id, contactId: contact.id, contactIdentifier: contact.external_id || contact.phone || null,
      customMessage: `Sequence "${sequence.name}" delivery failed: no active ${sequence.platform} channel account found.`,
    });
    // Re-check in an hour rather than retry-storming every poll — the agency
    // may reconnect the channel later.
    await pool.query("UPDATE sequence_subscribers SET current_node_id = ?, next_run_at = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?", [currentNodeId, sub.id]);
    return;
  }

  if (!conversation) {
    conversation = await getOrCreateConversation(sequence.agency_id, contact.id, integration.id);
  }
  const windowCheck = await canSendNow(sequence.platform, conversation.id, sequence.agency_id, node);

  if (!windowCheck.allowed) {
    await logDelivery(sub.id, node.id, "SKIPPED_WINDOW", windowCheck.reason);
    await pool.query("UPDATE sequence_subscribers SET current_node_id = ?, next_run_at = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE id = ?", [currentNodeId, sub.id]);
    return;
  }

  try {
    await sendSequenceContent(node, contact, sequence.agency_id, conversation, integration, windowCheck.useTemplate);
    await logDelivery(sub.id, node.id, "SENT", null);
  } catch (err) {
    console.error(`[Sequence Runner] Send failed for subscriber #${sub.id}, node ${node.id}:`, err.message);
    await logDelivery(sub.id, node.id, "FAILED", err.message);
  }

  // Advance to whatever comes after this content node.
  const afterId = resolveNextNodeId(edges, node.id);
  if (!afterId) { await markComplete(sub.id); return; }

  const afterNode = nodes.find((n) => n.id === afterId);
  if (afterNode?.type === "wait") {
    const delayMinutes = resolveWaitMinutes(afterNode.data);
    const afterWaitId = resolveNextNodeId(edges, afterNode.id);
    if (!afterWaitId) { await markComplete(sub.id); return; }
    await pool.query(
      "UPDATE sequence_subscribers SET current_node_id = ?, next_run_at = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?",
      [afterWaitId, delayMinutes, sub.id]
    );
  } else {
    // Two content nodes wired back-to-back with no wait in between — treat as
    // "send the next one on the next poll" rather than looping unboundedly
    // within one tick, keeping each tick's work bounded and predictable.
    await pool.query("UPDATE sequence_subscribers SET current_node_id = ?, next_run_at = NOW() WHERE id = ?", [afterId, sub.id]);
  }
}

export async function processDueSequenceSteps() {
  try {
    const [dueSubscribers] = await pool.query(
      `SELECT ss.* FROM sequence_subscribers ss
       JOIN sequences s ON s.id = ss.sequence_id
       WHERE ss.status = 'ACTIVE' AND ss.next_run_at IS NOT NULL AND ss.next_run_at <= NOW() AND s.is_active = 1
       LIMIT 50`
    );

    for (const sub of dueSubscribers) {
      try {
        const claimed = await claimSubscriber(sub);
        if (!claimed) continue; // another tick/instance already grabbed this one
        await processSubscriber(sub);
      } catch (subErr) {
        console.error(`[Sequence Runner] Error processing subscriber #${sub.id}:`, subErr.message);
      }
    }
  } catch (err) {
    console.error("[Sequence Runner] Poll error:", err.message);
  }
}

/** Start 60-second interval background timer for Sequence Messages. */
export function startSequenceScheduler() {
  console.log("⏱️  Sequence Messages scheduler started (runs every 60 seconds)");
  setInterval(processDueSequenceSteps, 60000);
}
