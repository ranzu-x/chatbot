import axios from "axios";
import pool from "../db.js";
import { GRAPH_URL } from "./metaApi.js";
import { emitToAgency } from "./socket.js";

/**
 * WhatsApp Groups API (Oct 2025; needs an Official Business Account and the
 * webhook fields group_lifecycle_update / group_participants_update /
 * group_settings_update / group_status_update). Groups are invite-link only:
 * people join by tapping the link. Local mirror: whatsapp_groups +
 * whatsapp_group_messages (migrate_whatsapp_groups.js).
 *
 * Group messages carry `group_id` in the webhook and are handled HERE, never
 * as a one-to-one chat (webhook.js skips them before the normal pipeline) —
 * otherwise the bot would answer a group member privately.
 */

const H = (integration) => ({ Authorization: `Bearer ${integration.access_token}`, "Content-Type": "application/json" });
export const metaError = (e) => e.response?.data?.error?.error_user_msg || e.response?.data?.error?.message || e.message;
const err400 = (m) => { const e = new Error(m); e.status = 400; return e; };

export async function createGroup(integration, { subject, description, joinApprovalMode }) {
  const s = String(subject || "").trim();
  if (!s) throw err400("Give the group a name");
  if (s.length > 128) throw err400("The name can be at most 128 characters");
  const d = String(description || "").trim();
  if (d.length > 2048) throw err400("The description can be at most 2048 characters");
  const mode = joinApprovalMode === "approval_required" ? "approval_required" : "auto_approve";
  const { data } = await axios.post(`${GRAPH_URL}/${integration.wa_phone_number_id}/groups`,
    { messaging_product: "whatsapp", subject: s, ...(d ? { description: d } : {}), join_approval_mode: mode },
    { headers: H(integration) });
  const [ins] = await pool.query(
    `INSERT INTO whatsapp_groups (agency_id, integration_id, group_id, subject, description, invite_link, join_approval_mode)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE subject = VALUES(subject), description = VALUES(description), invite_link = VALUES(invite_link), deleted_at = NULL`,
    [integration.agency_id, integration.id, data.id, s, d || null, data.invite_link || null, mode]
  );
  return { id: ins.insertId, groupId: data.id, inviteLink: data.invite_link || null };
}

/** Pulls the number's active groups from Meta into the local list. */
export async function syncGroups(integration) {
  let url = `${GRAPH_URL}/${integration.wa_phone_number_id}/groups`;
  let params = { limit: 200 };
  const seen = [];
  for (let page = 0; page < 10 && url; page += 1) {
    const { data } = await axios.get(url, { params, headers: H(integration) });
    for (const g of data?.data?.groups || []) {
      seen.push(g.id);
      await pool.query(
        `INSERT INTO whatsapp_groups (agency_id, integration_id, group_id, subject) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE subject = VALUES(subject), deleted_at = NULL`,
        [integration.agency_id, integration.id, g.id, String(g.subject || "Group").slice(0, 128)]
      );
    }
    url = data?.paging?.next || null;
    params = undefined;
  }
  if (seen.length) {
    await pool.query("UPDATE whatsapp_groups SET deleted_at = NOW() WHERE integration_id = ? AND deleted_at IS NULL AND group_id NOT IN (?)", [integration.id, seen]);
  } else {
    await pool.query("UPDATE whatsapp_groups SET deleted_at = NOW() WHERE integration_id = ? AND deleted_at IS NULL", [integration.id]);
  }
}

export async function getGroupDetail(integration, groupRow) {
  const fields = "subject,description,participants,join_approval_mode,suspended,creation_timestamp,total_participant_count";
  const [{ data: info }, link, requests] = await Promise.all([
    axios.get(`${GRAPH_URL}/${groupRow.group_id}`, { params: { fields }, headers: H(integration) }),
    axios.get(`${GRAPH_URL}/${groupRow.group_id}/invite_link`, { headers: H(integration) }).then((r) => r.data?.invite_link || null).catch(() => groupRow.invite_link),
    axios.get(`${GRAPH_URL}/${groupRow.group_id}/join_requests`, { headers: H(integration) }).then((r) => r.data?.data || []).catch(() => []),
  ]);
  await pool.query(
    "UPDATE whatsapp_groups SET subject = ?, description = ?, invite_link = ?, join_approval_mode = ?, participant_count = ?, suspended = ? WHERE id = ?",
    [String(info.subject || groupRow.subject).slice(0, 128), info.description || null, link, info.join_approval_mode || null,
      Number(info.total_participant_count) || 0, info.suspended ? 1 : 0, groupRow.id]
  );
  return {
    subject: info.subject, description: info.description || "", inviteLink: link,
    joinApprovalMode: info.join_approval_mode, suspended: Boolean(info.suspended),
    participantCount: Number(info.total_participant_count) || 0,
    participants: (info.participants || []).map((p) => p.wa_id || p.user_id).filter(Boolean),
    joinRequests: requests.map((r) => ({ id: r.join_request_id, waId: r.wa_id, at: r.creation_timestamp })),
  };
}

export async function resetInviteLink(integration, groupRow) {
  const { data } = await axios.post(`${GRAPH_URL}/${groupRow.group_id}/invite_link`, { messaging_product: "whatsapp" }, { headers: H(integration) });
  await pool.query("UPDATE whatsapp_groups SET invite_link = ? WHERE id = ?", [data.invite_link || null, groupRow.id]);
  return data.invite_link || null;
}

export async function deleteGroup(integration, groupRow) {
  await axios.delete(`${GRAPH_URL}/${groupRow.group_id}`, { headers: H(integration) });
  await pool.query("UPDATE whatsapp_groups SET deleted_at = NOW() WHERE id = ?", [groupRow.id]);
}

export async function removeParticipants(integration, groupRow, users) {
  const list = (users || []).map(String).filter(Boolean).slice(0, 8);
  if (!list.length) throw err400("Pick who to remove");
  await axios.delete(`${GRAPH_URL}/${groupRow.group_id}/participants`, {
    headers: H(integration), data: { messaging_product: "whatsapp", participants: list.map((user) => ({ user })) },
  });
}

export async function answerJoinRequests(integration, groupRow, ids, approve) {
  const list = (ids || []).map(String).filter(Boolean);
  if (!list.length) throw err400("Pick a join request");
  const { data } = await axios({
    method: approve ? "post" : "delete",
    url: `${GRAPH_URL}/${groupRow.group_id}/join_requests`,
    headers: H(integration),
    data: { messaging_product: "whatsapp", join_requests: list },
  });
  return data;
}

export async function sendGroupText(integration, groupRow, text, userId) {
  const body = String(text || "").trim();
  if (!body) throw err400("Write a message");
  const { data } = await axios.post(`${GRAPH_URL}/${integration.wa_phone_number_id}/messages`,
    { messaging_product: "whatsapp", recipient_type: "group", to: groupRow.group_id, type: "text", text: { body: body.slice(0, 4096) } },
    { headers: H(integration) });
  const wamid = data?.messages?.[0]?.id || null;
  const [ins] = await pool.query(
    "INSERT INTO whatsapp_group_messages (agency_id, group_row_id, direction, type, body, wamid, sent_by) VALUES (?, ?, 'OUTBOUND', 'TEXT', ?, ?, ?)",
    [groupRow.agency_id, groupRow.id, body, wamid, userId || null]
  );
  const message = { id: ins.insertId, direction: "OUTBOUND", type: "TEXT", body, created_at: new Date() };
  emitToAgency(groupRow.agency_id, "wa_group_message", { groupId: groupRow.id, message });
  return message;
}

/** Inbound webhook message with `group_id` → the group's feed. Returns true when it was a group message. */
export async function handleGroupMessage({ agencyId, integration, msg, contacts }) {
  const groupId = msg?.group_id;
  if (!groupId) return false;
  const [[groupRow]] = await pool.query("SELECT * FROM whatsapp_groups WHERE integration_id = ? AND group_id = ?", [integration.id, groupId]);
  let row = groupRow;
  if (!row) {
    const [ins] = await pool.query(
      "INSERT INTO whatsapp_groups (agency_id, integration_id, group_id, subject) VALUES (?, ?, ?, 'Group') ON DUPLICATE KEY UPDATE deleted_at = NULL",
      [agencyId, integration.id, groupId]
    );
    row = { id: ins.insertId, agency_id: agencyId };
  }
  const sender = msg.from || msg.from_user_id || null;
  const profile = (contacts || []).find((c) => c.wa_id === msg.from || c.user_id === msg.from_user_id);
  const type = String(msg.type || "text").toUpperCase();
  const body = msg.text?.body || msg.image?.caption || msg.video?.caption || msg.document?.filename || (type === "TEXT" ? "" : `[${type.toLowerCase()}]`);
  try {
    const [ins] = await pool.query(
      "INSERT INTO whatsapp_group_messages (agency_id, group_row_id, direction, sender_id, sender_name, type, body, wamid) VALUES (?, ?, 'INBOUND', ?, ?, ?, ?, ?)",
      [agencyId, row.id, sender, profile?.profile?.name || null, type.slice(0, 20), body, msg.id || null]
    );
    emitToAgency(agencyId, "wa_group_message", {
      groupId: row.id,
      message: { id: ins.insertId, direction: "INBOUND", sender_id: sender, sender_name: profile?.profile?.name || null, type, body, created_at: new Date() },
    });
  } catch (e) {
    if (e.code !== "ER_DUP_ENTRY") throw e; // a retried webhook
  }
  return true;
}

/** group_lifecycle_update / group_participants_update / group_settings_update / group_status_update. */
export async function handleGroupEvent({ agencyId, integration, field, value }) {
  const groupId = value?.group_id || value?.groups?.[0]?.group_id || value?.id;
  if (!groupId) return;
  if (field === "group_lifecycle_update" && /delete/i.test(JSON.stringify(value))) {
    await pool.query("UPDATE whatsapp_groups SET deleted_at = NOW() WHERE integration_id = ? AND group_id = ?", [integration.id, groupId]);
  }
  emitToAgency(agencyId, "wa_group_updated", { integrationId: integration.id, groupId, field });
}
