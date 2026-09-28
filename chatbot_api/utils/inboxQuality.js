import pool from "../db.js";
import { emitToAgency, emitToUser } from "./socket.js";
import { getAccessibleIntegrationIds, getRoleDisabledChannels } from "./teamAccess.js";

/**
 * Inbox quality (settings per workspace in `inbox_settings`, migration
 * migrate_inbox_quality.js):
 *  - SLA: conversations.awaiting_reply_since (kept by a DB trigger on
 *    messages) + a target in minutes — the Inbox shows how long each customer
 *    has been waiting and turns red past the target; `inboxMetrics` reports.
 *  - CSAT: when a chat is resolved, the customer is asked for a 1–5 rating
 *    (`sendCsatRequest`); the answer is caught before it opens a new chat
 *    (`handleCsatReply`).
 *  - Automatic assignment: round robin or least busy among the team members
 *    who can see that channel (and are online, if required) — on every new
 *    chat or only when a flow hands off (`autoAssign`).
 */

export const DEFAULT_SETTINGS = {
  slaEnabled: false,
  slaMinutes: 15,
  csatEnabled: false,
  csatQuestion: "How would you rate the help you got today? Reply with a number from 1 (poor) to 5 (excellent).",
  csatThanks: "Thank you for your feedback!",
  autoAssignMode: "OFF",
  autoAssignTrigger: "HANDOFF",
  autoAssignOnlineOnly: true,
  autoTranscribe: false,
};

export async function getInboxSettings(agencyId) {
  const [[row]] = await pool.query("SELECT * FROM inbox_settings WHERE agency_id = ?", [agencyId]);
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    slaEnabled: Boolean(row.sla_enabled),
    slaMinutes: Number(row.sla_minutes) || DEFAULT_SETTINGS.slaMinutes,
    csatEnabled: Boolean(row.csat_enabled),
    csatQuestion: row.csat_question || DEFAULT_SETTINGS.csatQuestion,
    csatThanks: row.csat_thanks ?? DEFAULT_SETTINGS.csatThanks,
    autoAssignMode: row.auto_assign_mode || "OFF",
    autoAssignTrigger: row.auto_assign_trigger || "HANDOFF",
    autoAssignOnlineOnly: Boolean(row.auto_assign_online_only),
    autoTranscribe: Boolean(row.auto_transcribe),
  };
}

export async function saveInboxSettings(agencyId, s) {
  const minutes = Math.min(10080, Math.max(1, Math.round(Number(s.slaMinutes) || 15)));
  await pool.query(
    `INSERT INTO inbox_settings (agency_id, sla_enabled, sla_minutes, csat_enabled, csat_question, csat_thanks, auto_assign_mode, auto_assign_trigger, auto_assign_online_only, auto_transcribe)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE sla_enabled = VALUES(sla_enabled), sla_minutes = VALUES(sla_minutes), csat_enabled = VALUES(csat_enabled),
       csat_question = VALUES(csat_question), csat_thanks = VALUES(csat_thanks), auto_assign_mode = VALUES(auto_assign_mode),
       auto_assign_trigger = VALUES(auto_assign_trigger), auto_assign_online_only = VALUES(auto_assign_online_only), auto_transcribe = VALUES(auto_transcribe)`,
    [
      agencyId, s.slaEnabled ? 1 : 0, minutes, s.csatEnabled ? 1 : 0,
      String(s.csatQuestion || DEFAULT_SETTINGS.csatQuestion).slice(0, 500), String(s.csatThanks ?? "").slice(0, 500),
      ["ROUND_ROBIN", "LEAST_BUSY"].includes(s.autoAssignMode) ? s.autoAssignMode : "OFF",
      s.autoAssignTrigger === "NEW" ? "NEW" : "HANDOFF",
      s.autoAssignOnlineOnly === false ? 0 : 1,
      s.autoTranscribe ? 1 : 0,
    ]
  );
}

// ─── Automatic assignment ───────────────────────────────────────────────────

/** Team members (not the owner) who may see this bot account's chats. */
async function eligibleAgents(agencyId, integration, onlineOnly) {
  const [members] = await pool.query(
    `SELECT om.id AS member_id, ap.id AS profile_id, ap.is_online, u.id AS user_id, u.name
       FROM organization_members om
       JOIN users u ON u.id = om.user_id AND u.is_active = 1
       JOIN agent_profiles ap ON ap.user_id = om.user_id
      WHERE om.agency_id = ? AND om.is_active = 1 AND om.member_kind = 'TEAM_MEMBER'
      ORDER BY ap.id`,
    [agencyId]
  );
  const out = [];
  for (const m of members) {
    if (onlineOnly && !m.is_online) continue;
    const ids = await getAccessibleIntegrationIds(m.member_id);
    if (ids !== null && !ids.map(Number).includes(Number(integration.id))) continue;
    const blocked = await getRoleDisabledChannels(m.member_id);
    if (blocked.includes(String(integration.platform || "").toUpperCase())) continue;
    out.push(m);
  }
  return out;
}

/** Pure: which agent gets the chat. */
export function pickAgent(agents, mode, { lastProfileId = null, openCounts = {} } = {}) {
  if (!agents.length) return null;
  if (mode === "LEAST_BUSY") {
    const min = Math.min(...agents.map((a) => openCounts[a.profile_id] || 0));
    const tied = agents.filter((a) => (openCounts[a.profile_id] || 0) === min);
    return pickAgent(tied, "ROUND_ROBIN", { lastProfileId });
  }
  const sorted = [...agents].sort((a, b) => a.profile_id - b.profile_id);
  return sorted.find((a) => a.profile_id > (lastProfileId || 0)) || sorted[0];
}

/**
 * Assigns an unassigned chat when the workspace's mode is on and `trigger`
 * matches (NEW = a new chat, HANDOFF = a flow asked for a person — HANDOFF
 * also runs when the trigger is NEW). Returns the assigned profile or null.
 */
export async function autoAssign({ agencyId, conversationId, integration, trigger }) {
  try {
    const settings = await getInboxSettings(agencyId);
    if (settings.autoAssignMode === "OFF") return null;
    if (trigger === "NEW" && settings.autoAssignTrigger !== "NEW") return null;
    const [[conv]] = await pool.query("SELECT id, assigned_to_id FROM conversations WHERE id = ? AND agency_id = ?", [conversationId, agencyId]);
    if (!conv || conv.assigned_to_id) return null;

    const agents = await eligibleAgents(agencyId, integration, settings.autoAssignOnlineOnly);
    if (!agents.length) return null;
    let openCounts = {};
    if (settings.autoAssignMode === "LEAST_BUSY") {
      const [rows] = await pool.query(
        `SELECT assigned_to_id AS pid, COUNT(*) AS n FROM conversations
          WHERE agency_id = ? AND status IN ('OPEN','ASSIGNED','PENDING') AND assigned_to_id IN (?) GROUP BY assigned_to_id`,
        [agencyId, agents.map((a) => a.profile_id)]
      );
      openCounts = Object.fromEntries(rows.map((r) => [r.pid, Number(r.n)]));
    }
    const [[state]] = await pool.query("SELECT last_assigned_profile_id FROM inbox_settings WHERE agency_id = ?", [agencyId]);
    const agent = pickAgent(agents, settings.autoAssignMode, { lastProfileId: state?.last_assigned_profile_id, openCounts });
    if (!agent) return null;

    const [r] = await pool.query(
      "UPDATE conversations SET assigned_to_id = ?, status = 'ASSIGNED' WHERE id = ? AND agency_id = ? AND assigned_to_id IS NULL",
      [agent.profile_id, conversationId, agencyId]
    );
    if (!r.affectedRows) return null;
    await pool.query("UPDATE inbox_settings SET last_assigned_profile_id = ? WHERE agency_id = ?", [agent.profile_id, agencyId]);
    emitToAgency(agencyId, "conversation_updated", { conversationId, assignedToId: agent.profile_id, assignedAgentName: agent.name, status: "ASSIGNED" });
    const note = { title: "New chat assigned to you", body: "A customer is waiting in the Inbox.", link: `/inbox?conv=${conversationId}` };
    await pool.query("INSERT INTO user_notifications (user_id, title, body, link) VALUES (?, ?, ?, ?)", [agent.user_id, note.title, note.body, note.link])
      .catch((e) => console.warn("[Auto-assign] notification not stored:", e.message));
    emitToUser(agent.user_id, "user_notification", note);
    return agent;
  } catch (err) {
    console.error("[Auto-assign] failed:", err.message);
    return null;
  }
}

// ─── CSAT ────────────────────────────────────────────────────────────────────

const CSAT_WINDOW_HOURS = 24;

/** Asks the customer for a 1–5 rating after the chat was resolved (once per resolve). */
export async function sendCsatRequest({ agencyId, conversationId }) {
  try {
    const settings = await getInboxSettings(agencyId);
    if (!settings.csatEnabled) return false;
    const [[conv]] = await pool.query(
      `SELECT cv.*, i.platform AS integration_platform FROM conversations cv
       JOIN integrations i ON i.id = cv.integration_id
       WHERE cv.id = ? AND cv.agency_id = ?`,
      [conversationId, agencyId]
    );
    if (!conv || conv.integration_platform === "WEBCHAT") return false;
    // Only chats a person took part in (not purely automated ones), and never twice in a row.
    const [[human]] = await pool.query(
      "SELECT COUNT(*) n FROM messages WHERE conversation_id = ? AND direction = 'OUTBOUND' AND JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.senderType')) = 'AGENT'",
      [conversationId]
    );
    if (!Number(human.n)) return false;
    const [[recent]] = await pool.query(
      "SELECT id FROM csat_requests WHERE conversation_id = ? AND sent_at > NOW() - INTERVAL 1 DAY LIMIT 1",
      [conversationId]
    );
    if (recent) return false;
    const [[integration]] = await pool.query("SELECT * FROM integrations WHERE id = ?", [conv.integration_id]);
    const { sendMsg } = await import("./flowEngine.js");
    await sendMsg(agencyId, conv, settings.csatQuestion, "TEXT", integration);
    await pool.query(
      "INSERT INTO csat_requests (agency_id, conversation_id, contact_id, integration_id, agent_profile_id) VALUES (?, ?, ?, ?, ?)",
      [agencyId, conv.id, conv.contact_id, conv.integration_id, conv.assigned_to_id || null]
    );
    return true;
  } catch (err) {
    console.error("[CSAT] request not sent:", err.message);
    return false;
  }
}

/** Pure: 1–5 from "4", "4/5", "⭐⭐⭐⭐", "4 stars"; else null. */
export function parseRating(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 20) return null;
  const stars = (t.match(/⭐|★/g) || []).length;
  if (stars >= 1 && stars <= 5 && /^[\s⭐★]+$/.test(t)) return stars;
  const m = t.match(/^([1-5])(\s*(\/\s*5|stars?|out of 5))?[.!]?$/i);
  return m ? Number(m[1]) : null;
}

/**
 * A reply to a pending rating question (same subscriber + bot account, within
 * 24 h) is recorded instead of starting a new chat. Returns the request when
 * consumed (the caller files the message into that chat), else null.
 */
export async function handleCsatReply({ agencyId, integrationId, contactId, text }) {
  const rating = parseRating(text);
  if (!rating) return null;
  const [[req]] = await pool.query(
    `SELECT * FROM csat_requests
      WHERE agency_id = ? AND contact_id = ? AND integration_id = ? AND rating IS NULL AND sent_at > NOW() - INTERVAL ? HOUR
      ORDER BY id DESC LIMIT 1`,
    [agencyId, contactId, integrationId, CSAT_WINDOW_HOURS]
  );
  if (!req) return null;
  const [r] = await pool.query("UPDATE csat_requests SET rating = ?, responded_at = NOW() WHERE id = ? AND rating IS NULL", [rating, req.id]);
  if (!r.affectedRows) return null;
  emitToAgency(agencyId, "csat_received", { conversationId: req.conversation_id, rating });
  return { ...req, rating };
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export async function inboxMetrics(agencyId, days = 30) {
  const settings = await getInboxSettings(agencyId);
  const [[agentRt]] = await pool.query(
    `SELECT COUNT(*) n, AVG(seconds) avg_s, SUM(seconds > ?) breaches
       FROM conversation_response_times WHERE agency_id = ? AND responder = 'AGENT' AND responded_at >= NOW() - INTERVAL ? DAY`,
    [settings.slaMinutes * 60, agencyId, days]
  );
  const [[allRt]] = await pool.query(
    "SELECT COUNT(*) n, AVG(seconds) avg_s FROM conversation_response_times WHERE agency_id = ? AND responded_at >= NOW() - INTERVAL ? DAY",
    [agencyId, days]
  );
  // Median of human replies (MySQL has no MEDIAN): the middle row.
  let medianAgent = null;
  if (Number(agentRt.n)) {
    const [[mid]] = await pool.query(
      `SELECT seconds FROM conversation_response_times WHERE agency_id = ? AND responder = 'AGENT' AND responded_at >= NOW() - INTERVAL ? DAY
       ORDER BY seconds LIMIT 1 OFFSET ?`,
      [agencyId, days, Math.floor((Number(agentRt.n) - 1) / 2)]
    );
    medianAgent = mid?.seconds ?? null;
  }
  const [[waiting]] = await pool.query(
    `SELECT COUNT(*) n, SUM(awaiting_reply_since < NOW() - INTERVAL ? MINUTE) overdue FROM conversations
      WHERE agency_id = ? AND awaiting_reply_since IS NOT NULL AND status IN ('OPEN','ASSIGNED','PENDING')`,
    [settings.slaMinutes, agencyId]
  );
  const [[csat]] = await pool.query(
    `SELECT COUNT(*) sent, COUNT(rating) answered, AVG(rating) avg_rating, SUM(rating >= 4) happy
       FROM csat_requests WHERE agency_id = ? AND sent_at >= NOW() - INTERVAL ? DAY`,
    [agencyId, days]
  );
  const [perAgent] = await pool.query(
    `SELECT u.id AS user_id, u.name, COUNT(*) replies, AVG(rt.seconds) avg_s, SUM(rt.seconds > ?) breaches
       FROM conversation_response_times rt JOIN users u ON u.id = rt.user_id
      WHERE rt.agency_id = ? AND rt.responder = 'AGENT' AND rt.responded_at >= NOW() - INTERVAL ? DAY
      GROUP BY u.id, u.name ORDER BY replies DESC LIMIT 50`,
    [settings.slaMinutes * 60, agencyId, days]
  );
  const [csatPerAgent] = await pool.query(
    `SELECT ap.user_id, AVG(c.rating) avg_rating, COUNT(c.rating) ratings FROM csat_requests c
       JOIN agent_profiles ap ON ap.id = c.agent_profile_id
      WHERE c.agency_id = ? AND c.sent_at >= NOW() - INTERVAL ? DAY AND c.rating IS NOT NULL GROUP BY ap.user_id`,
    [agencyId, days]
  );
  const csatMap = Object.fromEntries(csatPerAgent.map((r) => [r.user_id, r]));
  const n = (v) => (v === null || v === undefined ? null : Number(v));
  return {
    days,
    slaMinutes: settings.slaMinutes,
    firstResponse: {
      agentReplies: n(agentRt.n), agentAvgSeconds: agentRt.avg_s === null ? null : Math.round(agentRt.avg_s),
      agentMedianSeconds: medianAgent, slaBreaches: n(agentRt.breaches) || 0,
      allReplies: n(allRt.n), allAvgSeconds: allRt.avg_s === null ? null : Math.round(allRt.avg_s),
    },
    waitingNow: { total: n(waiting.n) || 0, overdue: n(waiting.overdue) || 0 },
    csat: {
      sent: n(csat.sent) || 0, answered: n(csat.answered) || 0,
      average: csat.avg_rating === null ? null : Math.round(Number(csat.avg_rating) * 10) / 10,
      satisfiedPercent: Number(csat.answered) ? Math.round((Number(csat.happy) / Number(csat.answered)) * 100) : null,
    },
    agents: perAgent.map((a) => ({
      userId: a.user_id, name: a.name, replies: n(a.replies), avgSeconds: Math.round(Number(a.avg_s) || 0), breaches: n(a.breaches) || 0,
      csat: csatMap[a.user_id] ? Math.round(Number(csatMap[a.user_id].avg_rating) * 10) / 10 : null,
      csatCount: csatMap[a.user_id] ? Number(csatMap[a.user_id].ratings) : 0,
    })),
  };
}
