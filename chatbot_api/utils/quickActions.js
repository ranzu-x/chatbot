import pool from "../db.js";
import { emitToAgency, emitToConversation } from "./socket.js";
import { getBotSettings, notifyChatHumanEmail } from "./botSettings.js";

/**
 * Quick Actions — the built-in "action bots" every bot account has
 * (Bot Manager → Bot Manager → Quick Actions, migrate_quick_actions.js).
 *
 *   NO_MATCH     sent when nothing else answered a message (no flow, rule or AI)
 *   CHAT_HUMAN   pauses the bot on the chat and puts it in the team's queue
 *   CHAT_ROBOT   resumes the bot
 *   UNSUBSCRIBE  subscription_status = UNSUBSCRIBED + running sequences stopped
 *   RESUBSCRIBE  subscription_status = SUBSCRIBED
 *
 * Each action's reply is a real flow of that bot account (flows.trigger_type
 * = 'QUICK_ACTION', edited in the Flow Builder, "reply on" = flows.is_active).
 * The defaults carry the opposite action as a button (human ⇄ robot,
 * unsubscribe ⇄ resubscribe); No match has none.
 *
 * An action runs from:
 *   - a flow button / list item / quick reply whose action is chatHuman,
 *     chatRobot, unsubscribe or resubscribe (intercepted in
 *     handleQuickActionInbound BEFORE the paused-bot checks — "Chat with
 *     robot" has to work while a person has the chat);
 *   - the Actions element (chat_human / chat_robot / unsubscribe /
 *     resubscribe; flowEngine.js), optionally followed by the action's reply;
 *   - its keywords (exact match): Chat with Human / Chat with Robot have their
 *     own, Unsubscribe / Resubscribe use the Opt-out Keywords (utils/optOut.js
 *     sends the Unsubscribe / Resubscribe reply flow when it is on).
 */

export const QUICK_ACTIONS = {
  NO_MATCH: {
    title: "No match reply",
    description: "Sent when a message isn't answered by any flow, keyword reply or AI agent.",
    message: "Sorry, I didn't quite get that. 🤔 Please choose one of the options, or type your question in a different way.",
    button: null,
  },
  CHAT_HUMAN: {
    title: "Chat with human",
    description: "Pauses the bot on this chat and hands it to your team (Inbox → Human takeover).",
    message: "👤 You're now connected to our team. A person will reply here as soon as possible.\n\nWant the bot back? Tap the button below.",
    button: { title: "🤖 Chat with bot", action: "chatRobot" },
    defaultKeywords: ["HUMAN", "AGENT", "TALK TO HUMAN"],
  },
  CHAT_ROBOT: {
    title: "Chat with robot",
    description: "Resumes the bot on this chat — flows, keyword replies and AI answer again.",
    message: "🤖 The bot is back and ready to help you.\n\nNeed a person instead? Tap the button below.",
    button: { title: "👤 Chat with human", action: "chatHuman" },
    defaultKeywords: ["BOT", "ROBOT"],
  },
  UNSUBSCRIBE: {
    title: "Unsubscribe",
    description: "Stops broadcasts and sequences for the subscriber (they can still chat with the bot).",
    message: "🔕 You're unsubscribed and won't get any more updates from us.\n\nChanged your mind? Tap the button below.",
    button: { title: "🔔 Resubscribe", action: "resubscribe" },
  },
  RESUBSCRIBE: {
    title: "Resubscribe",
    description: "Subscribes them again to broadcasts and sequences.",
    message: "🔔 Welcome back! You're subscribed to our updates again.\n\nYou can unsubscribe any time with the button below.",
    button: { title: "🔕 Unsubscribe", action: "unsubscribe" },
  },
};

export const ACTION_KEYS = Object.keys(QUICK_ACTIONS);

/** Flow-builder button actions → quick action. */
export const BUTTON_QUICK_ACTIONS = {
  chatHuman: "CHAT_HUMAN",
  chatRobot: "CHAT_ROBOT",
  unsubscribe: "UNSUBSCRIBE",
  resubscribe: "RESUBSCRIBE",
};

/** Actions element types → quick action. */
export const ACTIONS_NODE_QUICK_ACTIONS = {
  chat_human: "CHAT_HUMAN",
  chat_robot: "CHAT_ROBOT",
  unsubscribe: "UNSUBSCRIBE",
  resubscribe: "RESUBSCRIBE",
};

const KEYWORD_ACTIONS = new Set(["CHAT_HUMAN", "CHAT_ROBOT"]);

/**
 * How often the SAME subscriber may get an action's reply (Bot Settings →
 * No match reply; only NO_MATCH uses it). Tracked per bot account ×
 * subscriber in quick_action_deliveries (migrate_no_match_frequency.js);
 * the period is rolling (a day = 24 hours after the last one) and computed
 * in SQL, so app / DB clock differences don't matter.
 */
export const TRIGGER_FREQUENCIES = {
  EVERY_TIME: { label: "Every time", interval: null },
  DAILY: { label: "Once a day", interval: "1 DAY" },
  WEEKLY: { label: "Once a week", interval: "7 DAY" },
  MONTHLY: { label: "Once a month", interval: "1 MONTH" },
};
const FREQUENCY_ACTIONS = new Set(["NO_MATCH"]);

/** Pure: a valid frequency key, or null. */
export function normalizeFrequency(value) {
  const key = String(value || "").trim().toUpperCase();
  return TRIGGER_FREQUENCIES[key] ? key : null;
}

/**
 * Claims the right to send `actionKey`'s reply to this subscriber now.
 * EVERY_TIME always may. Otherwise true only when they never got it on this
 * bot, or the last time is at least one period ago — and the claim is
 * recorded in the same statement, so two messages arriving together can't
 * both send it.
 */
export async function claimQuickActionDelivery({ agencyId, integrationId, contactId, actionKey, frequency }) {
  const period = TRIGGER_FREQUENCIES[frequency]?.interval;
  if (!period) return true;
  if (!contactId) return true; // nobody to track (shouldn't happen on a real chat)
  const [ins] = await pool.query(
    `INSERT IGNORE INTO quick_action_deliveries (agency_id, integration_id, contact_id, action_key, last_sent_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [agencyId, integrationId, contactId, actionKey]
  );
  if (ins.affectedRows === 1) return true;
  // mysql2 reports matched rows as affectedRows; changedRows is the real claim.
  const [upd] = await pool.query(
    `UPDATE quick_action_deliveries SET last_sent_at = NOW()
      WHERE integration_id = ? AND contact_id = ? AND action_key = ? AND agency_id = ?
        AND last_sent_at <= NOW() - INTERVAL ${period}`,
    [integrationId, contactId, actionKey, agencyId]
  );
  return upd.changedRows === 1;
}

/**
 * Which actions a channel has. Flows don't exist for TikTok (flows.platform);
 * a website visitor never gets broadcasts or sequences, so subscribing means
 * nothing there.
 */
export function actionsForPlatform(platform) {
  const p = String(platform || "").toUpperCase();
  if (p === "TIKTOK") return [];
  if (p === "WEBCHAT") return ["NO_MATCH", "CHAT_HUMAN", "CHAT_ROBOT"];
  return [...ACTION_KEYS];
}

/** The reply flow a new (or reset) action starts with. */
export function defaultGraph(actionKey, platform) {
  const def = QUICK_ACTIONS[actionKey];
  const allowed = new Set(actionsForPlatform(platform));
  const button = def.button && allowed.has(BUTTON_QUICK_ACTIONS[def.button.action]) ? def.button : null;
  const nodes = [
    {
      id: "start_1",
      type: "start",
      position: { x: 80, y: 140 },
      data: { label: def.title, quickActionStart: true, quickAction: actionKey },
    },
    {
      id: "text_1",
      type: "text",
      position: { x: 440, y: 120 },
      data: { label: "Reply", message: def.message, buttons: button ? [{ ...button }] : [] },
    },
  ];
  const edges = [{ id: "e_start_text", source: "start_1", sourceHandle: "next-step", target: "text_1", type: "default", animated: false }];
  return { nodes, edges };
}

/* ── Keywords ─────────────────────────────────────────────────────────── */

export function splitKeywords(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[,\n]/);
  return [...new Set(list.map((k) => String(k).trim().toUpperCase()).filter((k) => k && k.length <= 40))].slice(0, 20);
}

/** Pure: the text normalised the same way opt-out keywords are (utils/optOut.js). */
export function normalizeKeywordText(text) {
  return String(text || "").trim().replace(/^[\s"'.!¡¿?]+|[\s"'.!?]+$/g, "").toUpperCase();
}

/** Pure: which keyword action (if any) a text is, given [{action_key, keywords}] rows. */
export function matchQuickActionKeyword(rows, text) {
  const word = normalizeKeywordText(text);
  if (!word || word.length > 40) return null;
  for (const row of rows || []) {
    if (!KEYWORD_ACTIONS.has(row.action_key)) continue;
    if (splitKeywords(row.keywords).includes(word)) return row.action_key;
  }
  return null;
}

/* ── Rows + reply flows ──────────────────────────────────────────────── */

async function createReplyFlow(conn, agencyId, integration, actionKey) {
  const { nodes, edges } = defaultGraph(actionKey, integration.platform);
  const [res] = await conn.query(
    `INSERT INTO flows (agency_id, integration_id, name, platform, trigger_type, nodes_json, edges_json, is_active)
     VALUES (?, ?, ?, ?, 'QUICK_ACTION', ?, ?, 1)`,
    [agencyId, integration.id, `Quick Action · ${QUICK_ACTIONS[actionKey].title}`, integration.platform,
      JSON.stringify(nodes), JSON.stringify(edges)]
  );
  return res.insertId;
}

/**
 * Makes sure the bot account has every action of its channel, each with a
 * reply flow (created with the default reply the first time, and again if
 * its flow was deleted some other way). Returns the rows.
 */
export async function ensureQuickActions(agencyId, integration) {
  const keys = actionsForPlatform(integration.platform);
  if (!keys.length) return [];
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [existing] = await conn.query(
      `SELECT qa.*, f.id AS live_flow_id FROM quick_actions qa
         LEFT JOIN flows f ON f.id = qa.flow_id AND f.agency_id = qa.agency_id AND f.integration_id = qa.integration_id
        WHERE qa.integration_id = ? AND qa.agency_id = ? FOR UPDATE`,
      [integration.id, agencyId]
    );
    const byKey = new Map(existing.map((r) => [r.action_key, r]));
    for (const key of keys) {
      const row = byKey.get(key);
      if (row && row.live_flow_id) continue;
      const flowId = await createReplyFlow(conn, agencyId, integration, key);
      if (row) {
        await conn.query("UPDATE quick_actions SET flow_id = ? WHERE id = ?", [flowId, row.id]);
      } else {
        const keywords = QUICK_ACTIONS[key].defaultKeywords ? QUICK_ACTIONS[key].defaultKeywords.join(", ") : null;
        await conn.query(
          "INSERT INTO quick_actions (agency_id, integration_id, action_key, flow_id, keywords) VALUES (?, ?, ?, ?, ?)",
          [agencyId, integration.id, key, flowId, keywords]
        );
      }
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return listQuickActions(agencyId, integration);
}

/** The bot account's actions, in display order, with their reply flow. */
export async function listQuickActions(agencyId, integration) {
  const keys = actionsForPlatform(integration.platform);
  const [rows] = await pool.query(
    `SELECT qa.action_key, qa.keywords, qa.trigger_frequency, qa.flow_id, f.is_active, f.updated_at AS flow_updated_at,
            JSON_LENGTH(f.nodes_json) AS node_count
       FROM quick_actions qa
       LEFT JOIN flows f ON f.id = qa.flow_id AND f.agency_id = qa.agency_id
      WHERE qa.integration_id = ? AND qa.agency_id = ?`,
    [integration.id, agencyId]
  );
  const byKey = new Map(rows.map((r) => [r.action_key, r]));
  return keys.filter((k) => byKey.has(k)).map((key) => {
    const r = byKey.get(key);
    return {
      action: key,
      title: QUICK_ACTIONS[key].title,
      description: QUICK_ACTIONS[key].description,
      flowId: r.flow_id,
      replyEnabled: Boolean(r.is_active),
      nodeCount: Number(r.node_count) || 0,
      updatedAt: r.flow_updated_at,
      supportsKeywords: KEYWORD_ACTIONS.has(key),
      keywords: KEYWORD_ACTIONS.has(key) ? splitKeywords(r.keywords) : [],
      supportsFrequency: FREQUENCY_ACTIONS.has(key),
      frequency: FREQUENCY_ACTIONS.has(key) ? (normalizeFrequency(r.trigger_frequency) || "EVERY_TIME") : null,
    };
  });
}

function assertKnownAction(integration, actionKey) {
  if (!actionsForPlatform(integration.platform).includes(actionKey)) {
    const err = new Error("That action isn't available for this channel.");
    err.status = 404;
    throw err;
  }
}

/** { replyEnabled?, keywords?, frequency? } for one action. */
export async function updateQuickAction(agencyId, integration, actionKey, { replyEnabled, keywords, frequency } = {}) {
  assertKnownAction(integration, actionKey);
  const [[row]] = await pool.query(
    "SELECT * FROM quick_actions WHERE integration_id = ? AND agency_id = ? AND action_key = ?",
    [integration.id, agencyId, actionKey]
  );
  if (!row) {
    const err = new Error("Quick action not found — open the Quick Actions tab again.");
    err.status = 404;
    throw err;
  }
  if (keywords !== undefined && KEYWORD_ACTIONS.has(actionKey)) {
    const list = splitKeywords(keywords);
    // A word can't mean both "human" and "robot".
    const other = actionKey === "CHAT_HUMAN" ? "CHAT_ROBOT" : "CHAT_HUMAN";
    const [[otherRow]] = await pool.query(
      "SELECT keywords FROM quick_actions WHERE integration_id = ? AND agency_id = ? AND action_key = ?",
      [integration.id, agencyId, other]
    );
    const clash = list.find((k) => splitKeywords(otherRow?.keywords).includes(k));
    if (clash) {
      const err = new Error(`"${clash}" is already a keyword of ${QUICK_ACTIONS[other].title}.`);
      err.status = 400;
      throw err;
    }
    await pool.query("UPDATE quick_actions SET keywords = ? WHERE id = ?", [list.join(", ") || null, row.id]);
  }
  if (frequency !== undefined) {
    const value = normalizeFrequency(frequency);
    if (!value || !FREQUENCY_ACTIONS.has(actionKey)) {
      const err = new Error(!value ? "Choose every time, once a day, once a week or once a month." : "This action has no frequency setting.");
      err.status = 400;
      throw err;
    }
    await pool.query("UPDATE quick_actions SET trigger_frequency = ? WHERE id = ?", [value, row.id]);
  }
  if (replyEnabled !== undefined && row.flow_id) {
    await pool.query(
      "UPDATE flows SET is_active = ? WHERE id = ? AND agency_id = ? AND trigger_type = 'QUICK_ACTION'",
      [replyEnabled ? 1 : 0, row.flow_id, agencyId]
    );
  }
  return (await listQuickActions(agencyId, integration)).find((a) => a.action === actionKey);
}

/** Puts the default reply back into the action's flow (keeps the flow id, so links stay valid). */
export async function resetQuickAction(agencyId, integration, actionKey) {
  assertKnownAction(integration, actionKey);
  await ensureQuickActions(agencyId, integration);
  const [[row]] = await pool.query(
    "SELECT flow_id FROM quick_actions WHERE integration_id = ? AND agency_id = ? AND action_key = ?",
    [integration.id, agencyId, actionKey]
  );
  const { nodes, edges } = defaultGraph(actionKey, integration.platform);
  await pool.query(
    "UPDATE flows SET nodes_json = ?, edges_json = ?, is_active = 1 WHERE id = ? AND agency_id = ? AND trigger_type = 'QUICK_ACTION'",
    [JSON.stringify(nodes), JSON.stringify(edges), row.flow_id, agencyId]
  );
  return (await listQuickActions(agencyId, integration)).find((a) => a.action === actionKey);
}

/** The action a Quick Action reply flow belongs to (flow id → key), or null. */
export async function quickActionOfFlow(agencyId, flowId) {
  const [[row]] = await pool.query(
    "SELECT action_key FROM quick_actions WHERE flow_id = ? AND agency_id = ?",
    [flowId, agencyId]
  );
  return row?.action_key || null;
}

/* ── Running an action ───────────────────────────────────────────────── */

async function loadReplyFlow(agencyId, integrationId, actionKey, { activeOnly = true } = {}) {
  const [[flow]] = await pool.query(
    `SELECT f.* FROM quick_actions qa JOIN flows f ON f.id = qa.flow_id AND f.agency_id = qa.agency_id
      WHERE qa.integration_id = ? AND qa.agency_id = ? AND qa.action_key = ? AND f.integration_id = qa.integration_id
        ${activeOnly ? "AND f.is_active = 1" : ""}`,
    [integrationId, agencyId, actionKey]
  );
  return flow || null;
}

/** The reply flow to hand over to from inside a running flow (Actions element), or null. */
export async function replyFlowFor(agencyId, integrationId, actionKey) {
  if (!integrationId) return null;
  return loadReplyFlow(agencyId, integrationId, actionKey);
}

/**
 * The state change only (no message). Returns what happened, for logs.
 * `conversation` / `contact` are the rows the caller loaded.
 */
export async function applyQuickActionEffect({ agencyId, integration, conversation, contact, actionKey }) {
  if (actionKey === "CHAT_HUMAN") {
    const integrationId = integration?.id || conversation.integration_id;
    // Bot Settings → Inbox → Chat with Human session; not set = the bot's
    // "Automatic resume after human takeover" (the behaviour before it existed).
    const { chatHumanSessionMinutes } = await getBotSettings(integrationId).catch(() => ({}));
    let minutes = Number(chatHumanSessionMinutes) || 0;
    if (!minutes) {
      const [[settings]] = await pool.query(
        "SELECT auto_resume_minutes FROM ai_reply_settings WHERE integration_id = ?",
        [integrationId]
      ).catch(() => [[null]]);
      minutes = Number(settings?.auto_resume_minutes) || 0;
    }
    await pool.query(
      `UPDATE conversations
          SET bot_paused = 1, paused_by_user_id = NULL, paused_at = NOW(), pause_reason = 'HUMAN_TAKEOVER',
              auto_resume_at = ${minutes > 0 ? "DATE_ADD(NOW(), INTERVAL ? MINUTE)" : "NULL"},
              status = IF(status = 'ASSIGNED', 'ASSIGNED', 'OPEN')
        WHERE id = ? AND agency_id = ?`,
      minutes > 0 ? [minutes, conversation.id, agencyId] : [conversation.id, agencyId]
    );
    // The bot is out of the conversation: nothing may resume a half-finished flow.
    await pool.query(
      "UPDATE flow_sessions SET status = 'COMPLETED', delay_next_run_at = NULL WHERE conversation_id = ? AND status = 'ACTIVE'",
      [conversation.id]
    );
    const payload = { conversationId: conversation.id, botPaused: true, pauseReason: "HUMAN_TAKEOVER" };
    emitToAgency(agencyId, "conversation_updated", payload);
    emitToConversation(conversation.id, "conversation_updated", payload);
    const { autoAssign } = await import("./inboxQuality.js");
    await autoAssign({ agencyId, conversationId: conversation.id, integration, trigger: "HANDOFF" }).catch(() => {});
    // Bot Settings → General → Chat with Human email. In the background: a slow
    // mail server must never delay the subscriber's reply.
    notifyChatHumanEmail({ agencyId, integration, conversation, contact }).catch(() => {});
    conversation.bot_paused = 1;
    return "paused";
  }

  if (actionKey === "CHAT_ROBOT") {
    await pool.query(
      `UPDATE conversations SET bot_paused = 0, paused_by_user_id = NULL, paused_at = NULL, pause_reason = NULL, auto_resume_at = NULL
        WHERE id = ? AND agency_id = ?`,
      [conversation.id, agencyId]
    );
    if (contact?.id) await pool.query("UPDATE contacts SET bot_paused = 0 WHERE id = ? AND agency_id = ?", [contact.id, agencyId]);
    const payload = { conversationId: conversation.id, botPaused: false, pauseReason: null };
    emitToAgency(agencyId, "conversation_updated", payload);
    emitToConversation(conversation.id, "conversation_updated", payload);
    conversation.bot_paused = 0;
    if (contact) contact.bot_paused = 0;
    return "resumed";
  }

  if (actionKey === "UNSUBSCRIBE" || actionKey === "RESUBSCRIBE") {
    if (!contact?.id) return "no-subscriber";
    const out = actionKey === "UNSUBSCRIBE";
    await pool.query(
      "UPDATE contacts SET subscription_status = ? WHERE id = ? AND agency_id = ?",
      [out ? "UNSUBSCRIBED" : "SUBSCRIBED", contact.id, agencyId]
    );
    if (out) {
      await pool.query(
        `UPDATE sequence_subscribers ss JOIN sequences s ON s.id = ss.sequence_id
            SET ss.status = 'STOPPED'
          WHERE ss.contact_id = ? AND s.agency_id = ? AND ss.status IN ('ACTIVE','PAUSED')`,
        [contact.id, agencyId]
      );
    }
    contact.subscription_status = out ? "UNSUBSCRIBED" : "SUBSCRIBED";
    emitToAgency(agencyId, "contact_updated", { contactId: contact.id, subscriptionStatus: contact.subscription_status });
    return out ? "unsubscribed" : "subscribed";
  }
  return "none";
}

/**
 * Sends the action's reply flow (if it's on). Returns true when it ran.
 * Runs even on a paused chat — that's the point of Chat with Human's own reply.
 */
export async function sendQuickActionReply({ agencyId, platform, integration, conversation, contact, actionKey }) {
  if (!integration?.id) return false;
  const flow = await loadReplyFlow(agencyId, integration.id, actionKey);
  if (!flow) return false;
  const { isWorkspaceExpired } = await import("./subscriptionStatus.js");
  if (await isWorkspaceExpired(agencyId)) return false;
  let nodes = [];
  try { nodes = JSON.parse(flow.nodes_json || "[]"); } catch { nodes = []; }
  const startNode = nodes.find((n) => n.type === "start");
  if (!startNode) return false;
  await pool.query(
    "UPDATE flow_sessions SET status = 'COMPLETED', delay_next_run_at = NULL WHERE conversation_id = ? AND status = 'ACTIVE'",
    [conversation.id]
  );
  await pool.query(
    "INSERT INTO flow_sessions (agency_id, conversation_id, flow_id, current_node_id, variables, status) VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
    [agencyId, conversation.id, flow.id, startNode.id, JSON.stringify({})]
  );
  const { processFlow } = await import("./flowEngine.js");
  await processFlow(agencyId, platform || integration.platform, conversation, contact, "", integration, "TEXT", null, null, { ignorePause: true });
  if (actionKey === "CHAT_HUMAN") {
    // A reply with a "Chat with bot" button parks a session on it; the tap is
    // routed by its own token, so the parked session must not linger.
    await pool.query(
      "UPDATE flow_sessions SET status = 'COMPLETED', delay_next_run_at = NULL WHERE conversation_id = ? AND status = 'ACTIVE'",
      [conversation.id]
    );
  }
  return true;
}

/** Effect + reply. `source` is only for the log line. */
export async function runQuickAction({ agencyId, platform, integration, conversation, contact, actionKey, source = "button" }) {
  if (!QUICK_ACTIONS[actionKey]) return false;
  if (actionKey !== "NO_MATCH") {
    // Asking for a person while already with one (or for the bot while it's on) changes nothing —
    // the message just lands in the Inbox / answers normally, no repeated confirmation.
    if (actionKey === "CHAT_HUMAN" && conversation.bot_paused && source === "keyword") return false;
    if (actionKey === "CHAT_ROBOT" && !conversation.bot_paused && !contact?.bot_paused && source === "keyword") return false;
    const result = await applyQuickActionEffect({ agencyId, integration, conversation, contact, actionKey });
    console.log(`[Quick Action] ${actionKey} (${source}) on conversation ${conversation.id}: ${result}`);
  }
  await sendQuickActionReply({ agencyId, platform, integration, conversation, contact, actionKey })
    .catch((e) => console.error(`[Quick Action] ${actionKey} reply failed:`, e.message));
  return true;
}

/**
 * Inbound hook (routes/webhook.js handleIncomingPayload, routes/webchat.js):
 * a tapped quick-action button, or a Chat with Human / Chat with Robot
 * keyword. Returns true when the message was one and has been handled.
 * Runs before the paused-bot checks on purpose.
 */
export async function handleQuickActionInbound({ agencyId, platform, integration, conversation, contact, text, buttonRoute, msgType = "TEXT" }) {
  if (!integration?.id) return false;
  const route = buttonRoute || text;
  if (route && typeof route === "string" && route.startsWith("FBTN:")) {
    const { resolveTappedButton, applyButtonSideEffects } = await import("./flowEngine.js");
    const tapped = await resolveTappedButton(agencyId, route, { requireActive: false });
    const actionKey = tapped?.button ? BUTTON_QUICK_ACTIONS[tapped.button.action] : null;
    if (!actionKey) return false;
    if (tapped.flow.integration_id && Number(tapped.flow.integration_id) !== Number(integration.id)) return false;
    await applyButtonSideEffects({ agencyId, contact, button: tapped.button, integrationId: tapped.flow.integration_id });
    return runQuickAction({ agencyId, platform, integration, conversation, contact, actionKey, source: "button" });
  }
  if (msgType !== "TEXT" || buttonRoute || !text) return false;
  const [rows] = await pool.query(
    "SELECT action_key, keywords FROM quick_actions WHERE integration_id = ? AND agency_id = ? AND keywords IS NOT NULL",
    [integration.id, agencyId]
  );
  const actionKey = matchQuickActionKeyword(rows, text);
  if (!actionKey) return false;
  return runQuickAction({ agencyId, platform, integration, conversation, contact, actionKey, source: "keyword" });
}

/**
 * Last resort after flows, keyword replies and AI: the No match reply —
 * only when it is on (its reply flow is active) and the subscriber is due
 * for it under the bot's frequency (Bot Settings → No match reply).
 */
export async function runNoMatchReply({ agencyId, platform, integration, conversation, contact }) {
  if (!integration?.id || conversation?.bot_paused || contact?.bot_paused) return false;
  const [[setting]] = await pool.query(
    `SELECT qa.trigger_frequency FROM quick_actions qa
       JOIN flows f ON f.id = qa.flow_id AND f.agency_id = qa.agency_id AND f.integration_id = qa.integration_id
      WHERE qa.integration_id = ? AND qa.agency_id = ? AND qa.action_key = 'NO_MATCH' AND f.is_active = 1`,
    [integration.id, agencyId]
  );
  if (!setting) return false; // off
  const frequency = normalizeFrequency(setting.trigger_frequency) || "EVERY_TIME";
  if (frequency !== "EVERY_TIME") {
    const { isWorkspaceExpired } = await import("./subscriptionStatus.js");
    if (await isWorkspaceExpired(agencyId)) return false; // don't use up the period on a reply that won't go out
    const contactId = contact?.id || conversation?.contact_id;
    const due = await claimQuickActionDelivery({ agencyId, integrationId: integration.id, contactId, actionKey: "NO_MATCH", frequency });
    if (!due) return false;
  }
  return sendQuickActionReply({ agencyId, platform, integration, conversation, contact, actionKey: "NO_MATCH" });
}
