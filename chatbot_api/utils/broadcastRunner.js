/**
 * The Broadcasting module's send engine.
 *
 * Audience resolution (computeAudience) and per-recipient sending
 * (executeBroadcast) for a broadcast_campaigns row. Reuses existing,
 * already-correct infrastructure rather than re-implementing it:
 *   - utils/messagingWindow.js's canSendNow() — the SAME 24h/48h window +
 *     template-required rules already used by Sequence Messages, researched
 *     against each platform's real 2026 policy (WhatsApp 24h+template,
 *     Messenger/Instagram 24h with no automated outside-window path,
 *     Telegram unrestricted, TikTok 48h + 10-message budget).
 *   - utils/flowEngine.js's sendMsg() — writes the real `messages` row with
 *     external_msg_id, so a broadcast send shows up in the normal Inbox
 *     conversation AND is picked up by the existing webhook delivered/read
 *     status handlers (routes/webhook.js) for free.
 *   - utils/messageProcessor.js's findOrCreateConversation() — broadcasts
 *     send into a real conversation per contact, not a side channel.
 *
 * Message CONTENT: for mode='WINDOW' campaigns, walks the linked flow
 * (trigger_type='BROADCAST', authored in the Flow Builder) from its start
 * node forward, sending each consecutive outbound-message node (text,
 * buttons, image, video, audio, file, quickReplies) until it hits a node
 * that needs live user input or branching (condition, collectInput, delay,
 * wait, question, webhook, handoff, payment, runUserInputFlow, ...) — this
 * mirrors the same deliberately-simple "send the first sendable stretch,
 * stop at anything interactive" scope already used for comment-automation's
 * private-reply-flow runner elsewhere in this app, rather than trying to
 * half-emulate the full flow engine for a one-shot broadcast push. A
 * recipient's reply after that is handled by whatever the workspace's
 * normal inbound flows/bot rules do — same as any other inbound message.
 * For mode='TEMPLATE' (WhatsApp "Anytime"), content is a single approved
 * whatsapp_templates row — Meta requires a pre-approved template outside
 * the 24h window, which by definition can't be an arbitrary flow.
 */
import pool from "../db.js";
import { sendMsg, replaceVariables, encodeButtonRoute, normalizeButtonType } from "./flowEngine.js";
import { canSendNow } from "./messagingWindow.js";
import { syncContactTagsJson } from "../routes/labels.js";

/**
 * Finds or creates the conversation a broadcast send goes into. Deliberately
 * NOT utils/messageProcessor.js's findOrCreateConversation() — that helper
 * is written for the inbound-webhook path and always increments
 * unread_count + touches last_inbound_at on every call, even for an
 * already-existing conversation. A broadcast send is OUTBOUND — bumping
 * "unread"/"last inbound" for a message the business just sent would show
 * a wrong unread badge and a wrong "last heard from them" time in the Inbox.
 * sendMsg() already updates last_message_at itself, so nothing else here
 * needs to touch the conversation on the existing-row path.
 */
async function findOrCreateConversationForBroadcast(agencyId, contactId, integrationId) {
  const [existing] = await pool.query(
    `SELECT * FROM conversations WHERE agency_id = ? AND contact_id = ? AND integration_id = ? AND status != 'RESOLVED' LIMIT 1`,
    [agencyId, contactId, integrationId]
  );
  if (existing.length) return existing[0];

  const [ins] = await pool.query(
    `INSERT INTO conversations (agency_id, contact_id, integration_id, status, unread_count, last_message_at, created_at)
     VALUES (?, ?, ?, 'OPEN', 0, NOW(), NOW())`,
    [agencyId, contactId, integrationId]
  );
  const [[created]] = await pool.query("SELECT * FROM conversations WHERE id = ?", [ins.insertId]);
  return created;
}

const STOP_NODE_TYPES = new Set([
  "condition", "collectInput", "delay", "wait", "question", "webhook",
  "handoff", "payment", "runUserInputFlow", "startSequenceAction",
  "stopSequenceAction", "end", "finalAnswer", "start",
]);

function formatButtons(buttons, flow, node) {
  if (!Array.isArray(buttons) || !buttons.length) return [];
  return buttons.map((btn, idx) => ({
    id: encodeButtonRoute(flow.id, node.id, idx),
    title: typeof btn === "string" ? btn : (btn.title || btn.label || `Button ${idx + 1}`),
    payload: encodeButtonRoute(flow.id, node.id, idx),
    type: normalizeButtonType(btn),
    url: typeof btn === "object" ? btn.url : null,
  }));
}

/** Converts one flow node into a sendMsg() call's (type, bodyText, extraFields) — or null if this node type isn't a sendable message (the walk stops here). */
function nodeToSendArgs(node, flow, contact) {
  const data = node.data || {};
  const vars = {};

  switch (node.type) {
    case "text":
    case "buttons": {
      const body = replaceVariables(data.message || data.text || data.body || "", vars, contact);
      const buttons = formatButtons(data.buttons, flow, node);
      if (!body && !buttons.length) return null;
      return { type: "TEXT", bodyText: body, extraFields: buttons.length ? { buttons } : {} };
    }
    case "quickReplies": {
      const body = replaceVariables(data.message || "", vars, contact);
      const replies = (data.replies || []).map((r) => (typeof r === "string" ? r : (r.title || r.label || "Option")));
      if (!body && !replies.length) return null;
      return { type: "TEXT", bodyText: body, extraFields: replies.length ? { quickReplies: replies } : {} };
    }
    case "image": {
      if (!data.mediaUrl) return null;
      return { type: "IMAGE", bodyText: replaceVariables(data.caption || "", vars, contact), extraFields: { mediaUrl: data.mediaUrl, caption: replaceVariables(data.caption || "", vars, contact), buttons: formatButtons(data.buttons, flow, node) || undefined } };
    }
    case "video":
      if (!data.mediaUrl) return null;
      return { type: "VIDEO", bodyText: "", extraFields: { mediaUrl: data.mediaUrl, caption: replaceVariables(data.caption || "", vars, contact) } };
    case "audio":
      if (!data.mediaUrl) return null;
      return { type: "AUDIO", bodyText: "", extraFields: { mediaUrl: data.mediaUrl } };
    case "file":
      if (!data.mediaUrl) return null;
      return { type: "DOCUMENT", bodyText: "", extraFields: { mediaUrl: data.mediaUrl, caption: replaceVariables(data.caption || "", vars, contact) } };
    default:
      return null;
  }
}

/** Walks a flow from its start node, collecting the leading run of sendable nodes (stops at the first branching/input/delay node, or a dead end). */
function collectSendableNodes(flow, nodes, edges) {
  const startNode = nodes.find((n) => n.type === "start");
  if (!startNode) return [];

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map();
  for (const e of edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source).push(e.target);
  }

  const sequence = [];
  let currentId = startNode.id;
  const visited = new Set();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const nextIds = outgoing.get(currentId) || [];
    if (!nextIds.length) break;
    const nextId = nextIds[0]; // broadcast walk only ever follows the first/default edge — no branching
    const nextNode = byId.get(nextId);
    if (!nextNode) break;
    if (STOP_NODE_TYPES.has(nextNode.type)) break;
    sequence.push(nextNode);
    currentId = nextId;
  }
  return sequence;
}

/**
 * Resolves the contact audience for a campaign's targeting rules.
 * include: OR'd together (label match OR explicit contact id) — empty
 * include arrays mean "no include filter" (everyone on this platform).
 * exclude: OR'd together, subtracted from the include result.
 */
export async function computeAudience(agencyId, platform, targeting = {}) {
  const {
    includeLabelIds = [],
    excludeLabelIds = [],
    includeContactIds = [],
    excludeContactIds = [],
  } = targeting;

  const params = [agencyId, platform];
  // subscription_status — a subscriber who opted out (Subscribers page) is
  // never a valid broadcast recipient regardless of label/contact targeting.
  let sql = `SELECT DISTINCT c.id, c.external_id, c.name, c.phone, c.email, c.platform FROM contacts c WHERE c.agency_id = ? AND c.platform = ? AND c.subscription_status = 'SUBSCRIBED'`;

  const includeClauses = [];
  if (includeLabelIds.length) {
    includeClauses.push(`c.id IN (SELECT contact_id FROM contact_labels WHERE label_id IN (${includeLabelIds.map(() => "?").join(",")}))`);
    params.push(...includeLabelIds);
  }
  if (includeContactIds.length) {
    includeClauses.push(`c.id IN (${includeContactIds.map(() => "?").join(",")})`);
    params.push(...includeContactIds);
  }
  if (includeClauses.length) {
    sql += ` AND (${includeClauses.join(" OR ")})`;
  }

  const excludeClauses = [];
  if (excludeLabelIds.length) {
    excludeClauses.push(`c.id IN (SELECT contact_id FROM contact_labels WHERE label_id IN (${excludeLabelIds.map(() => "?").join(",")}))`);
    params.push(...excludeLabelIds);
  }
  if (excludeContactIds.length) {
    excludeClauses.push(`c.id IN (${excludeContactIds.map(() => "?").join(",")})`);
    params.push(...excludeContactIds);
  }
  if (excludeClauses.length) {
    sql += ` AND NOT (${excludeClauses.join(" OR ")})`;
  }

  const [rows] = await pool.query(sql, params);
  return rows;
}

function parseTargeting(campaign) {
  const parseIds = (v) => {
    if (!v) return [];
    if (Array.isArray(v)) return v.map(Number);
    try { const p = JSON.parse(v); return Array.isArray(p) ? p.map(Number) : []; } catch { return []; }
  };
  return {
    includeLabelIds: parseIds(campaign.include_label_ids),
    excludeLabelIds: parseIds(campaign.exclude_label_ids),
    includeContactIds: parseIds(campaign.include_contact_ids),
    excludeContactIds: parseIds(campaign.exclude_contact_ids),
  };
}

/** Which A/B variant a given contact falls into for this campaign —
 * deterministic on contact.id so re-running a partially-sent campaign (or
 * looking the assignment up again later for stats) always gives the same
 * answer, without needing to store a random seed anywhere. Only meaningful
 * when the campaign actually has a variant_b_template_id set; callers that
 * don't check that first will just always get 'A'. */
function assignVariant(campaign, contactId) {
  if (!campaign.variant_b_template_id) return null;
  const splitPercent = campaign.ab_split_percent ?? 50;
  // A simple, fast, well-distributed hash of the contact id — no need for
  // cryptographic quality, just an even A/B split that's stable per contact.
  const hash = (Number(contactId) * 2654435761) % 100;
  return hash < splitPercent ? "A" : "B";
}

async function sendToContact(campaign, contact, flow, sendableNodes, integration, variant) {
  const conversation = await findOrCreateConversationForBroadcast(campaign.agency_id, contact.id, integration.id);

  if (campaign.mode === "TEMPLATE") {
    const templateId = variant === "B" && campaign.variant_b_template_id ? campaign.variant_b_template_id : campaign.template_id;
    const [[tpl]] = await pool.query(
      "SELECT * FROM whatsapp_templates WHERE id = ? AND agency_id = ? AND status = 'APPROVED'",
      [templateId, campaign.agency_id]
    );
    if (!tpl) throw new Error(`Linked WhatsApp Template${variant ? ` (Variant ${variant})` : ""} is missing or not approved`);

    const message = await sendMsg(campaign.agency_id, conversation, `[Template: ${tpl.template_name}]`, "TEXT", integration, {
      whatsappTemplate: { name: tpl.template_name, language: tpl.language },
      flowId: null,
      contactIdentifier: contact.external_id,
    });
    if (!message.external_msg_id) throw new Error("Template send did not return a message id — check the integration's credentials");
    return message;
  }

  // WINDOW mode
  const windowCheck = await canSendNow(campaign.platform, conversation.id, campaign.agency_id, null);
  if (!windowCheck.allowed) throw new Error(windowCheck.reason || "Outside this channel's messaging window");

  if (!sendableNodes.length) throw new Error("The linked flow has no sendable message at its start — open it in the Flow Builder and add at least one message node");

  let lastMessage = null;
  for (const node of sendableNodes) {
    const args = nodeToSendArgs(node, flow, contact);
    if (!args) continue;
    lastMessage = await sendMsg(campaign.agency_id, conversation, args.bodyText, args.type, integration, {
      ...args.extraFields,
      flowId: flow.id,
      nodeId: node.id,
      contactIdentifier: contact.external_id,
    });
  }
  if (!lastMessage) throw new Error("The linked flow has no sendable message at its start — open it in the Flow Builder and add at least one message node");
  if (!lastMessage.external_msg_id) throw new Error("Send did not return a message id — check the integration's credentials");
  return lastMessage;
}

export async function executeBroadcast(campaignId) {
  const [[campaign]] = await pool.query("SELECT * FROM broadcast_campaigns WHERE id = ?", [campaignId]);
  if (!campaign) return;

  await pool.query("UPDATE broadcast_campaigns SET status = 'PROCESSING' WHERE id = ?", [campaignId]);

  try {
    // The campaign's OWN chosen account (set at creation/configure time via
    // routes/broadcasts.js) — never "whichever active integration for this
    // platform happens to come back first". That used to be a real bug: an
    // agency with more than one WhatsApp number connected could have a
    // campaign silently send from a DIFFERENT number than the one its
    // contacts actually talk to, making every recipient look outside the
    // 24h window even on a number they'd genuinely messaged recently.
    if (!campaign.integration_id) throw new Error("This campaign has no account chosen to send from — open it and pick one");
    const [[integration]] = await pool.query(
      "SELECT * FROM integrations WHERE id = ? AND agency_id = ? AND platform = ? AND is_active = 1",
      [campaign.integration_id, campaign.agency_id, campaign.platform]
    );
    if (!integration) throw new Error(`The account this campaign sends from is no longer connected`);

    let flow = null, nodes = [], edges = [], sendableNodes = [];
    if (campaign.mode === "WINDOW") {
      if (!campaign.flow_id) throw new Error("No flow linked to this campaign — click Create to build one in the Flow Builder");
      const [[flowRow]] = await pool.query("SELECT * FROM flows WHERE id = ? AND agency_id = ?", [campaign.flow_id, campaign.agency_id]);
      if (!flowRow) throw new Error("Linked flow not found");
      flow = flowRow;
      try { nodes = JSON.parse(flow.nodes_json || "[]"); } catch { nodes = []; }
      try { edges = JSON.parse(flow.edges_json || "[]"); } catch { edges = []; }
      sendableNodes = collectSendableNodes(flow, nodes, edges);
    }

    const audience = await computeAudience(campaign.agency_id, campaign.platform, parseTargeting(campaign));

    // (Re)create PENDING logs for this run — a re-run (e.g. after a fix) only
    // touches contacts that don't already have a terminal log for this campaign.
    const [existingLogs] = await pool.query("SELECT contact_id, status FROM broadcast_logs WHERE campaign_id = ?", [campaignId]);
    const alreadyDone = new Set(existingLogs.filter((l) => l.status !== "PENDING").map((l) => l.contact_id));
    const pendingTargets = audience.filter((c) => !alreadyDone.has(c.id));

    if (!existingLogs.length) {
      const logRows = audience.map((c) => [campaignId, c.id, "PENDING", assignVariant(campaign, c.id)]);
      if (logRows.length) {
        await pool.query("INSERT INTO broadcast_logs (campaign_id, contact_id, status, variant) VALUES ?", [logRows]);
      }
    }

    await pool.query("UPDATE broadcast_campaigns SET total_targeted = ? WHERE id = ?", [audience.length, campaignId]);

    let sentCount = campaign.sent_count || 0;
    let failedCount = campaign.failed_count || 0;

    for (const contact of pendingTargets) {
      try {
        const variant = assignVariant(campaign, contact.id);
        const message = await sendToContact(campaign, contact, flow, sendableNodes, integration, variant);
        await pool.query(
          "UPDATE broadcast_logs SET status = 'SENT', external_msg_id = ?, sent_at = NOW() WHERE campaign_id = ? AND contact_id = ?",
          [message.external_msg_id, campaignId, contact.id]
        );
        sentCount++;

        if (campaign.tag_label_id) {
          try {
            await pool.query("INSERT IGNORE INTO contact_labels (contact_id, label_id) VALUES (?, ?)", [contact.id, campaign.tag_label_id]);
            await syncContactTagsJson(contact.id);
          } catch (tagErr) {
            console.warn(`[Broadcast #${campaignId}] tag-label attach failed for contact ${contact.id}:`, tagErr.message);
          }
        }
      } catch (sendErr) {
        console.error(`[Broadcast #${campaignId}] send to contact ${contact.id} failed:`, sendErr.message);
        await pool.query(
          "UPDATE broadcast_logs SET status = 'FAILED', error_message = ? WHERE campaign_id = ? AND contact_id = ?",
          [sendErr.message, campaignId, contact.id]
        );
        failedCount++;
      }

      await pool.query("UPDATE broadcast_campaigns SET sent_count = ?, failed_count = ? WHERE id = ?", [sentCount, failedCount, campaignId]);

      // Rate-limit friendly pacing — well under Telegram's 30msg/sec global cap
      // and gentle on Meta/TikTok's per-second limits too.
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    await pool.query("UPDATE broadcast_campaigns SET status = 'COMPLETED' WHERE id = ?", [campaignId]);
    console.log(`✅ Broadcast #${campaignId} "${campaign.name}" completed! Sent: ${sentCount}, Failed: ${failedCount}`);
  } catch (err) {
    console.error(`❌ Broadcast #${campaignId} execution error:`, err.message);
    await pool.query("UPDATE broadcast_campaigns SET status = 'FAILED', error_message = ? WHERE id = ?", [err.message, campaignId]);
  }
}
