import pool from "../db.js";
import { emitToAgency } from "./socket.js";
import { lockedJob } from "./jobLock.js";
import {
  DEFAULT_SETTINGS, parseGroupSettings, cleanGroupSettings, renderTemplate, stripHtml, fullName, mentionHtml, escapeHtml,
  disallowedLinks, isForwarded, findBannedWord, parseDuration, describeMinutes, parseCommand, matchAutoReply,
  MUTED_PERMISSIONS, LIFTED_PERMISSIONS, cleanPermissions,
} from "./telegramGroupRules.js";

/**
 * Telegram group management (Bot Manager → Group Management, migrate_telegram_groups.js).
 *
 * A Telegram bot account can be added to any number of groups / supergroups.
 * Telegram tells us about it with `my_chat_member` (the bot's own status),
 * `chat_member` (anyone else's — only delivered when listed in allowed_updates
 * and the bot is an admin), `chat_join_request`, and the group's messages
 * (all of them only when the bot is an admin or privacy mode is off —
 * otherwise just commands, replies to the bot and service messages).
 * handleTelegramGroupUpdate() takes every group update out of the one-to-one
 * pipeline in routes/webhook.js: a group is never a subscriber or an Inbox chat.
 *
 * What runs in a group (settings in telegram_groups.settings, telegramGroupRules.js):
 * welcome / goodbye, clean join/leave service messages, captcha for new members
 * (muted until they tap a button, removed or kept muted after the timeout),
 * join requests (manual from the dashboard, or approved automatically), link /
 * forward / banned-word / flood / channel-sender / foreign-bot protection with a
 * warnings ladder, admin commands (/warn /mute /ban …), /rules, /report and
 * keyword auto-replies. Admins (and anonymous admins) are never moderated.
 *
 * Bot API reference (checked against Bot API 10.3): restrictChatMember and
 * setChatPermissions work in supergroups only; banChatMember's until_date only
 * in supergroups; deleteMessage only for messages under 48 h; the bot needs
 * can_restrict_members / can_delete_messages / can_invite_users /
 * can_pin_messages / can_change_info for the matching actions.
 */

export const TELEGRAM_ANONYMOUS_ADMIN_ID = 1087968824; // @GroupAnonymousBot
const ADMIN_CACHE_MINUTES = 10;
const IN_CHAT = new Set(["creator", "administrator", "member"]);
const floodWindows = new Map(); // `${groupId}:${userId}` → [timestamps] — per instance, by design

const isGroupChat = (chat) => chat?.type === "group" || chat?.type === "supergroup";
const botIdOf = (integration) => Number(String(integration?.access_token || "").split(":")[0]) || null;
const isInChat = (member) => IN_CHAT.has(member?.status) || (member?.status === "restricted" && member?.is_member);

/* ── Bot API client ───────────────────────────────────────────────────── */

const FRIENDLY_ERRORS = [
  [/not enough rights|CHAT_ADMIN_REQUIRED|need administrator rights|have no rights/i, "The bot doesn't have the admin right this needs in the group. Make it an admin with that permission in Telegram."],
  [/available only for supergroups|supergroup/i, "This only works in supergroups. Telegram turns a group into a supergroup when you make it public or change admin rights."],
  [/user is an administrator|can't remove chat owner|can't restrict self|USER_ADMIN_INVALID/i, "Group admins can't be restricted, removed or banned by the bot."],
  [/bot was kicked|bot is not a member|chat not found/i, "The bot isn't in this group any more."],
  [/message to delete not found|message can't be deleted/i, "That message can't be deleted (it's gone, or older than 48 hours)."],
  [/PARTICIPANT_ID_INVALID|user not found|USER_ID_INVALID/i, "Telegram doesn't know that person in this group."],
  [/HIDE_REQUESTER_MISSING|USER_ALREADY_PARTICIPANT/i, "That join request is already handled."],
];

export function friendlyTelegramError(description) {
  const d = String(description || "");
  const hit = FRIENDLY_ERRORS.find(([re]) => re.test(d));
  return hit ? hit[1] : (d ? `Telegram: ${d.replace(/^Bad Request:\s*/i, "")}` : "Telegram didn't answer. Try again.");
}

export async function tgCall(token, method, params = {}) {
  let data = {};
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(15000),
    });
    data = await res.json().catch(() => ({}));
  } catch (err) {
    const e = new Error("Couldn't reach Telegram. Try again in a moment.");
    e.status = 502;
    e.cause = err;
    throw e;
  }
  if (!data.ok) {
    const err = new Error(friendlyTelegramError(data.description));
    err.status = 400;
    err.telegram = { code: data.error_code, description: data.description };
    err.migrateTo = data.parameters?.migrate_to_chat_id || null;
    throw err;
  }
  return data.result;
}

/** Sends HTML; if Telegram can't parse it, sends the same text plain. */
async function sendHtml(token, chatId, html, extra = {}) {
  try {
    return await tgCall(token, "sendMessage", { chat_id: chatId, text: html, parse_mode: "HTML", link_preview_options: { is_disabled: true }, ...extra });
  } catch (err) {
    if (/can't parse entities/i.test(err.telegram?.description || "")) {
      return tgCall(token, "sendMessage", { chat_id: chatId, text: stripHtml(html), link_preview_options: { is_disabled: true }, ...extra });
    }
    throw err;
  }
}

const urlKeyboard = (buttons) => (buttons?.length
  ? { reply_markup: { inline_keyboard: buttons.map((b) => [{ text: b.text, url: b.url }]) } }
  : {});

/* ── Rows ─────────────────────────────────────────────────────────────── */

function hydrate(row) {
  if (!row) return null;
  const parse = (v, d) => {
    if (v === null || v === undefined) return d;
    if (typeof v !== "string") return v;
    try { return JSON.parse(v); } catch { return d; }
  };
  return {
    ...row,
    settings: parseGroupSettings(row.settings),
    bot_rights: parse(row.bot_rights, null),
    admins: parse(row.admins, []),
    default_permissions: parse(row.default_permissions, null),
  };
}

async function groupByChat(integration, chatId) {
  const [[row]] = await pool.query("SELECT * FROM telegram_groups WHERE integration_id = ? AND chat_id = ?", [integration.id, chatId]);
  return hydrate(row);
}

export async function loadGroup(agencyId, groupId) {
  const [[row]] = await pool.query("SELECT * FROM telegram_groups WHERE id = ? AND agency_id = ?", [groupId, agencyId]);
  return hydrate(row);
}

/** Finds or creates the group's row from a Chat object (the bot may have been added before this existed). */
async function ensureGroup(integration, chat) {
  await pool.query(
    `INSERT INTO telegram_groups (agency_id, integration_id, chat_id, type, title, username, is_forum, settings, last_activity_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE type = VALUES(type), title = VALUES(title), username = VALUES(username),
       is_forum = VALUES(is_forum), last_activity_at = NOW()`,
    [integration.agency_id, integration.id, chat.id, chat.type, String(chat.title || "").slice(0, 255),
      chat.username || null, chat.is_forum ? 1 : 0, JSON.stringify(DEFAULT_SETTINGS)]
  );
  return groupByChat(integration, chat.id);
}

async function bumpStat(groupId, field, n = 1) {
  if (!["messages", "joins", "leaves", "actions"].includes(field)) return;
  await pool.query(
    `INSERT INTO telegram_group_stats (group_id, day, ${field}) VALUES (?, CURDATE(), ?)
     ON DUPLICATE KEY UPDATE ${field} = ${field} + VALUES(${field})`,
    [groupId, n]
  ).catch(() => {});
}

export async function logGroup(group, action, { user = null, actor = null, detail = null } = {}) {
  try {
    const [res] = await pool.query(
      "INSERT INTO telegram_group_logs (agency_id, group_id, action, tg_user_id, user_name, actor, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [group.agency_id, group.id, action, user?.id || null, user ? fullName(user).slice(0, 255) : null,
        actor ? String(actor).slice(0, 255) : null, detail ? String(detail).slice(0, 500) : null]
    );
    if (["WARN", "MUTE", "KICK", "BAN", "DELETE", "CAPTCHA_FAILED"].includes(action)) bumpStat(group.id, "actions");
    emitToAgency(group.agency_id, "tg_group_activity", { groupId: group.id, action, logId: res.insertId });
  } catch (err) {
    console.error("[TG Groups] log:", err.message);
  }
}

async function upsertMember(group, user, patch = {}) {
  await pool.query(
    `INSERT INTO telegram_group_members (agency_id, group_id, tg_user_id, first_name, last_name, username, is_bot, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE first_name = VALUES(first_name), last_name = VALUES(last_name), username = VALUES(username)`,
    [group.agency_id, group.id, user.id, (user.first_name || "").slice(0, 255), (user.last_name || "").slice(0, 255) || null,
      user.username || null, user.is_bot ? 1 : 0, patch.status || "member"]
  );
  const [[row]] = await pool.query("SELECT * FROM telegram_group_members WHERE group_id = ? AND tg_user_id = ?", [group.id, user.id]);
  return row;
}

const memberUser = (m) => ({ id: Number(m.tg_user_id), first_name: m.first_name, last_name: m.last_name, username: m.username, is_bot: Boolean(m.is_bot) });

/* ── Admins ───────────────────────────────────────────────────────────── */

async function syncAdmins(integration, group) {
  const admins = await tgCall(integration.access_token, "getChatAdministrators", { chat_id: group.chat_id });
  const list = admins.map((a) => ({
    id: a.user.id, name: fullName(a.user), username: a.user.username || null, isBot: Boolean(a.user.is_bot),
    status: a.status, isAnonymous: Boolean(a.is_anonymous), customTitle: a.custom_title || null,
  }));
  await pool.query("UPDATE telegram_groups SET admins = ?, admins_synced_at = NOW() WHERE id = ?", [JSON.stringify(list), group.id]);
  group.admins = list;
  group.admins_synced_at = new Date();
  return list;
}

async function isAdmin(integration, group, userId) {
  if (!userId) return false;
  if (Number(userId) === TELEGRAM_ANONYMOUS_ADMIN_ID) return true;
  const stale = !group.admins_synced_at || (Date.now() - new Date(group.admins_synced_at).getTime()) > ADMIN_CACHE_MINUTES * 60000;
  if (stale) await syncAdmins(integration, group).catch(() => {});
  return (group.admins || []).some((a) => Number(a.id) === Number(userId));
}

/* ── Update entry point ───────────────────────────────────────────────── */

/**
 * Takes every group update out of the one-to-one pipeline. Returns true when
 * the update was a group one (handled or deliberately ignored).
 */
export async function handleTelegramGroupUpdate(integration, update) {
  try {
    if (update.my_chat_member) {
      if (!isGroupChat(update.my_chat_member.chat)) return update.my_chat_member.chat?.type === "channel";
      await onBotMembership(integration, update.my_chat_member);
      return true;
    }
    if (update.chat_member) {
      if (isGroupChat(update.chat_member.chat)) await onMemberUpdate(integration, update.chat_member);
      return true;
    }
    if (update.chat_join_request) {
      if (isGroupChat(update.chat_join_request.chat)) await onJoinRequest(integration, update.chat_join_request);
      return true;
    }
    const msg = update.message || update.edited_message;
    if (msg && isGroupChat(msg.chat)) {
      await onGroupMessage(integration, msg, { edited: Boolean(update.edited_message) });
      return true;
    }
    const cq = update.callback_query;
    if (cq?.message && isGroupChat(cq.message.chat)) {
      await onGroupCallback(integration, cq);
      return true;
    }
    if (update.channel_post || update.edited_channel_post || update.message_reaction || update.message_reaction_count) return true;
  } catch (err) {
    console.error("[TG Groups] update error:", err.message);
    return true;
  }
  return false;
}

async function automationAllowed(agencyId) {
  const { isWorkspaceExpired } = await import("./subscriptionStatus.js");
  if (await isWorkspaceExpired(agencyId)) return false;
  try {
    const { assertModuleAccess } = await import("./entitlements.js");
    await assertModuleAccess(agencyId, "feature_telegram_group_manager");
    return true;
  } catch {
    return false;
  }
}

/* ── The bot joined / left / was promoted ─────────────────────────────── */

async function onBotMembership(integration, cmu) {
  const status = cmu.new_chat_member?.status;
  const oldStatus = cmu.old_chat_member?.status;
  const group = await ensureGroup(integration, cmu.chat);
  const by = cmu.from;
  if (!isInChat(cmu.new_chat_member)) {
    await pool.query("UPDATE telegram_groups SET bot_status = ?, left_at = NOW() WHERE id = ?", [status || "left", group.id]);
    await logGroup(group, "BOT_REMOVED", { actor: by ? fullName(by) : null });
  } else {
    const rights = status === "administrator" ? cmu.new_chat_member : null;
    const wasIn = isInChat(cmu.old_chat_member);
    await pool.query(
      `UPDATE telegram_groups SET bot_status = ?, bot_rights = ?, left_at = NULL
         ${wasIn ? "" : ", joined_at = NOW(), added_by_tg_id = ?, added_by_name = ?"}
       WHERE id = ?`,
      wasIn
        ? [status, rights ? JSON.stringify(rights) : null, group.id]
        : [status, rights ? JSON.stringify(rights) : null, by?.id || null, by ? fullName(by).slice(0, 255) : null, group.id]
    );
    const action = !wasIn ? "BOT_ADDED" : (status === "administrator" && oldStatus !== "administrator" ? "BOT_PROMOTED"
      : (status !== "administrator" && oldStatus === "administrator" ? "BOT_DEMOTED" : "BOT_RIGHTS_CHANGED"));
    await logGroup(group, action, { actor: by ? fullName(by) : null });
    refreshGroup(integration, group).catch((e) => console.warn("[TG Groups] refresh after join:", e.message));
  }
  emitToAgency(integration.agency_id, "tg_group_update", { groupId: group.id, integrationId: integration.id });
}

/* ── Someone joined / left / changed status ───────────────────────────── */

async function onMemberUpdate(integration, cmu) {
  const group = await ensureGroup(integration, cmu.chat);
  const user = cmu.new_chat_member?.user;
  if (!user || Number(user.id) === botIdOf(integration)) return;
  const wasIn = isInChat(cmu.old_chat_member);
  const nowIn = isInChat(cmu.new_chat_member);
  const newStatus = cmu.new_chat_member.status;

  if (["administrator", "creator"].includes(newStatus) || ["administrator", "creator"].includes(cmu.old_chat_member?.status)) {
    await pool.query("UPDATE telegram_groups SET admins_synced_at = NULL WHERE id = ?", [group.id]);
    group.admins_synced_at = null;
  }

  if (!wasIn && nowIn) {
    await onJoin(integration, group, user, {
      addedBy: cmu.from && Number(cmu.from.id) !== Number(user.id) ? cmu.from : null,
      inviteLink: cmu.invite_link?.invite_link || null,
      viaJoinRequest: Boolean(cmu.via_join_request) || Boolean(cmu.invite_link?.creates_join_request),
    });
  } else if (wasIn && !nowIn) {
    await onLeave(integration, group, user, { removedBy: newStatus === "kicked" && cmu.from && Number(cmu.from.id) !== Number(user.id) ? cmu.from : null, banned: newStatus === "kicked" });
  } else if (nowIn) {
    const until = newStatus === "restricted" && cmu.new_chat_member.can_send_messages === false ? Number(cmu.new_chat_member.until_date) || 0 : null;
    await upsertMember(group, user);
    await pool.query(
      `UPDATE telegram_group_members SET status = ?, muted_until = ${until === null ? "NULL" : until === 0 ? "'2099-12-31 00:00:00'" : "FROM_UNIXTIME(?)"}
        WHERE group_id = ? AND tg_user_id = ?`,
      until && until > 0 ? [newStatus, until, group.id, user.id] : [newStatus, group.id, user.id]
    );
  } else {
    await upsertMember(group, user);
    await pool.query("UPDATE telegram_group_members SET status = ? WHERE group_id = ? AND tg_user_id = ?", [newStatus, group.id, user.id]);
  }
}

/**
 * Marks the member as joined; returns false when this join was already
 * handled (chat_member and the "X joined" service message both report it).
 */
async function registerJoin(group, user) {
  const [ins] = await pool.query(
    `INSERT IGNORE INTO telegram_group_members (agency_id, group_id, tg_user_id, first_name, last_name, username, is_bot, status, joined_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'member', NOW())`,
    [group.agency_id, group.id, user.id, (user.first_name || "").slice(0, 255), (user.last_name || "").slice(0, 255) || null, user.username || null, user.is_bot ? 1 : 0]
  );
  if (ins.affectedRows === 1) return true;
  const [upd] = await pool.query(
    `UPDATE telegram_group_members SET status = 'member', joined_at = NOW(), left_at = NULL, warnings = 0,
            first_name = ?, last_name = ?, username = ?
      WHERE group_id = ? AND tg_user_id = ?
        AND NOT (status IN ('member','restricted','administrator','creator') AND joined_at > NOW() - INTERVAL 2 MINUTE)`,
    [(user.first_name || "").slice(0, 255), (user.last_name || "").slice(0, 255) || null, user.username || null, group.id, user.id]
  );
  return upd.affectedRows === 1;
}

async function onJoin(integration, group, user, { addedBy = null, inviteLink = null, viaJoinRequest = false } = {}) {
  if (!(await registerJoin(group, user))) return;
  bumpStat(group.id, "joins");
  const how = viaJoinRequest ? "approved join request" : inviteLink ? "invite link" : addedBy ? `added by ${fullName(addedBy)}` : null;
  await logGroup(group, "JOIN", { user, detail: how });
  if (inviteLink) {
    await pool.query("UPDATE telegram_group_invite_links SET joins = joins + 1 WHERE group_id = ? AND invite_link = ?", [group.id, inviteLink]).catch(() => {});
  }
  await pool.query(
    "UPDATE telegram_group_join_requests SET status = 'APPROVED', decided_at = COALESCE(decided_at, NOW()) WHERE group_id = ? AND tg_user_id = ? AND status = 'PENDING'",
    [group.id, user.id]
  ).catch(() => {});
  emitToAgency(group.agency_id, "tg_group_update", { groupId: group.id, integrationId: integration.id });

  if (!(await automationAllowed(group.agency_id))) return;
  const s = group.settings;
  const token = integration.access_token;

  if (user.is_bot) {
    if (s.blockBots.enabled && !(addedBy && await isAdmin(integration, group, addedBy.id))) {
      try {
        await kickUser(token, group.chat_id, user.id);
        await logGroup(group, "KICK", { user, actor: "Bot", detail: "Bots may only be added by admins" });
      } catch (err) {
        await logGroup(group, "ERROR", { user, detail: `Couldn't remove the bot: ${err.message}` });
      }
    }
    return;
  }

  const addedByAdmin = addedBy ? await isAdmin(integration, group, addedBy.id) : false;
  if (s.captcha.enabled && !addedByAdmin && !viaJoinRequest) {
    await startCaptcha(integration, group, user);
    return;
  }
  await sendWelcome(integration, group, user);
}

async function onLeave(integration, group, user, { removedBy = null, banned = false } = {}) {
  const [[member]] = await pool.query("SELECT * FROM telegram_group_members WHERE group_id = ? AND tg_user_id = ?", [group.id, user.id]);
  await upsertMember(group, user);
  const [upd] = await pool.query(
    `UPDATE telegram_group_members SET status = ?, left_at = NOW(), captcha_pending = 0, captcha_deadline = NULL
      WHERE group_id = ? AND tg_user_id = ? AND (left_at IS NULL OR left_at < NOW() - INTERVAL 2 MINUTE OR status <> ?)`,
    [banned ? "kicked" : "left", group.id, user.id, banned ? "kicked" : "left"]
  );
  if (upd.affectedRows === 0) return; // already handled (chat_member + service message)
  bumpStat(group.id, "leaves");
  await logGroup(group, "LEAVE", { user, actor: removedBy ? fullName(removedBy) : null, detail: banned ? "removed" : null });
  if (member?.captcha_pending && member.captcha_message_id) {
    tgCall(integration.access_token, "deleteMessage", { chat_id: group.chat_id, message_id: member.captcha_message_id }).catch(() => {});
  }
  emitToAgency(group.agency_id, "tg_group_update", { groupId: group.id, integrationId: integration.id });
  if (!banned && group.settings.goodbye.enabled && await automationAllowed(group.agency_id)) {
    const html = renderTemplate(group.settings.goodbye.text, { user, group });
    if (html.trim()) {
      const sent = await sendHtml(integration.access_token, group.chat_id, html).catch(() => null);
      if (sent && group.settings.notices.deleteAfterSeconds) scheduleDeletion(group.id, sent.message_id, group.settings.notices.deleteAfterSeconds);
    }
  }
}

/* ── Welcome + captcha ────────────────────────────────────────────────── */

async function sendWelcome(integration, group, user) {
  const w = group.settings.welcome;
  if (!w.enabled || !String(w.text || "").trim()) return;
  const token = integration.access_token;
  if (w.deletePrevious && group.last_welcome_message_id) {
    tgCall(token, "deleteMessage", { chat_id: group.chat_id, message_id: group.last_welcome_message_id }).catch(() => {});
  }
  try {
    const sent = await sendHtml(token, group.chat_id, renderTemplate(w.text, { user, group }), urlKeyboard(w.buttons));
    await pool.query("UPDATE telegram_groups SET last_welcome_message_id = ? WHERE id = ?", [sent.message_id, group.id]);
    group.last_welcome_message_id = sent.message_id;
    if (w.deleteAfterMinutes > 0) await scheduleDeletion(group.id, sent.message_id, w.deleteAfterMinutes * 60);
  } catch (err) {
    await logGroup(group, "ERROR", { user, detail: `Welcome not sent: ${err.message}` });
  }
}

const captchaData = (memberId) => `TGC:${memberId}`;

async function startCaptcha(integration, group, user) {
  const c = group.settings.captcha;
  const token = integration.access_token;
  const [[member]] = await pool.query("SELECT id FROM telegram_group_members WHERE group_id = ? AND tg_user_id = ?", [group.id, user.id]);
  if (!member) return;
  try {
    await tgCall(token, "restrictChatMember", { chat_id: group.chat_id, user_id: user.id, permissions: MUTED_PERMISSIONS, use_independent_chat_permissions: true });
  } catch (err) {
    // No restrict right / basic group: their messages are still deleted until they verify.
    await logGroup(group, "ERROR", { user, detail: `Couldn't mute for captcha (their messages are deleted instead): ${err.message}` });
  }
  let messageId = null;
  try {
    const html = renderTemplate(c.text, { user, group, extra: { minutes: String(c.timeoutMinutes) } });
    const sent = await sendHtml(token, group.chat_id, html, {
      reply_markup: { inline_keyboard: [[{ text: c.buttonText, callback_data: captchaData(member.id), style: "success" }]] },
    });
    messageId = sent.message_id;
  } catch (err) {
    await logGroup(group, "ERROR", { user, detail: `Captcha message not sent: ${err.message}` });
  }
  await pool.query(
    `UPDATE telegram_group_members SET captcha_pending = 1, captcha_deadline = DATE_ADD(NOW(), INTERVAL ? MINUTE),
            captcha_message_id = ?, status = 'restricted' WHERE id = ?`,
    [c.timeoutMinutes, messageId, member.id]
  );
  await logGroup(group, "CAPTCHA_SENT", { user });
}

async function onGroupCallback(integration, cq) {
  const token = integration.access_token;
  const answer = (text, alert = false) => tgCall(token, "answerCallbackQuery", { callback_query_id: cq.id, text, show_alert: alert }).catch(() => {});
  const m = /^TGC:(\d+)$/.exec(cq.data || "");
  if (!m) return answer("");
  const group = await groupByChat(integration, cq.message.chat.id);
  if (!group) return answer("");
  const [[member]] = await pool.query("SELECT * FROM telegram_group_members WHERE id = ? AND group_id = ?", [m[1], group.id]);
  if (!member || Number(member.tg_user_id) !== Number(cq.from.id)) return answer("This button is for the new member only.", true);
  if (!member.captcha_pending) return answer("You're already verified. 👍");

  const [claim] = await pool.query("UPDATE telegram_group_members SET captcha_pending = 0, captcha_deadline = NULL, status = 'member' WHERE id = ? AND captcha_pending = 1", [member.id]);
  if (claim.affectedRows !== 1) return answer("You're already verified. 👍");
  await tgCall(token, "restrictChatMember", { chat_id: group.chat_id, user_id: cq.from.id, permissions: LIFTED_PERMISSIONS, use_independent_chat_permissions: true }).catch(() => {});
  if (member.captcha_message_id) tgCall(token, "deleteMessage", { chat_id: group.chat_id, message_id: member.captcha_message_id }).catch(() => {});
  await answer("✅ Thanks — you can post now!");
  await logGroup(group, "CAPTCHA_PASSED", { user: cq.from });
  await sendWelcome(integration, group, cq.from);
}

/* ── Join requests ────────────────────────────────────────────────────── */

async function onJoinRequest(integration, req) {
  const group = await ensureGroup(integration, req.chat);
  const user = req.from;
  await pool.query(
    `INSERT INTO telegram_group_join_requests (agency_id, group_id, tg_user_id, user_chat_id, name, username, bio, invite_link_name, status, requested_at, decided_at, decided_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', FROM_UNIXTIME(?), NULL, NULL)
     ON DUPLICATE KEY UPDATE user_chat_id = VALUES(user_chat_id), name = VALUES(name), username = VALUES(username), bio = VALUES(bio),
       invite_link_name = VALUES(invite_link_name), status = 'PENDING', requested_at = VALUES(requested_at), decided_at = NULL, decided_by_user_id = NULL`,
    [group.agency_id, group.id, user.id, req.user_chat_id || null, fullName(user).slice(0, 255), user.username || null,
      req.bio ? String(req.bio).slice(0, 255) : null, req.invite_link?.name || null, Number(req.date) || Math.floor(Date.now() / 1000)]
  );
  await logGroup(group, "JOIN_REQUEST", { user, detail: req.invite_link?.name ? `via "${req.invite_link.name}"` : null });
  const token = integration.access_token;
  const allowed = await automationAllowed(group.agency_id);
  const auto = allowed && group.settings.joinRequests.mode === "AUTO_APPROVE";

  // Bot API 10.1: a bot assigned to process join requests gets a query it must answer within 10 s.
  if (req.query_id) {
    await tgCall(token, "answerChatJoinRequestQuery", { chat_join_request_query_id: req.query_id, result: auto ? "approve" : "queue" })
      .catch((e) => console.warn("[TG Groups] answerChatJoinRequestQuery:", e.message));
    if (auto) await markRequest(group, user.id, "APPROVED", null);
  } else if (auto) {
    try {
      await tgCall(token, "approveChatJoinRequest", { chat_id: group.chat_id, user_id: user.id });
      await markRequest(group, user.id, "APPROVED", null);
      await logGroup(group, "JOIN_APPROVED", { user, actor: "Bot (automatic)" });
    } catch (err) {
      await logGroup(group, "ERROR", { user, detail: `Couldn't approve automatically: ${err.message}` });
    }
  }
  const dm = group.settings.joinRequests.dmText;
  if (allowed && !auto && dm && req.user_chat_id) {
    // user_chat_id is usable for 5 minutes, until the request is handled.
    await sendHtml(token, req.user_chat_id, renderTemplate(dm, { user, group })).catch(() => {});
  }
  emitToAgency(group.agency_id, "tg_group_join_request", { groupId: group.id, integrationId: integration.id });
}

async function markRequest(group, tgUserId, status, userId) {
  await pool.query(
    "UPDATE telegram_group_join_requests SET status = ?, decided_at = NOW(), decided_by_user_id = ? WHERE group_id = ? AND tg_user_id = ?",
    [status, userId, group.id, tgUserId]
  );
}

/* ── Messages ─────────────────────────────────────────────────────────── */

async function onGroupMessage(integration, msg, { edited = false } = {}) {
  const token = integration.access_token;

  // Basic group upgraded to a supergroup: the chat id changes.
  if (msg.migrate_to_chat_id) {
    await moveChatId(integration, msg.chat.id, msg.migrate_to_chat_id);
    return;
  }
  if (msg.migrate_from_chat_id) {
    await moveChatId(integration, msg.migrate_from_chat_id, msg.chat.id);
  }

  const group = await ensureGroup(integration, msg.chat);
  if (group.left_at) {
    // We're getting its messages, so the bot is back in (e.g. my_chat_member was missed).
    await pool.query("UPDATE telegram_groups SET left_at = NULL, bot_status = IF(bot_status IN ('left','kicked'), 'member', bot_status) WHERE id = ?", [group.id]);
  }
  const s = group.settings;

  // Service messages.
  if (Array.isArray(msg.new_chat_members)) {
    for (const u of msg.new_chat_members) {
      if (Number(u.id) === botIdOf(integration)) continue;
      await onJoin(integration, group, u, { addedBy: msg.from && Number(msg.from.id) !== Number(u.id) ? msg.from : null });
    }
    if (s.cleanService.joins) tgCall(token, "deleteMessage", { chat_id: group.chat_id, message_id: msg.message_id }).catch(() => {});
    return;
  }
  if (msg.left_chat_member) {
    if (Number(msg.left_chat_member.id) !== botIdOf(integration)) {
      await onLeave(integration, group, msg.left_chat_member, { removedBy: msg.from && Number(msg.from.id) !== Number(msg.left_chat_member.id) ? msg.from : null });
    }
    if (s.cleanService.leaves) tgCall(token, "deleteMessage", { chat_id: group.chat_id, message_id: msg.message_id }).catch(() => {});
    return;
  }
  if (msg.new_chat_title) {
    await pool.query("UPDATE telegram_groups SET title = ? WHERE id = ?", [String(msg.new_chat_title).slice(0, 255), group.id]);
    return;
  }
  if (msg.pinned_message || msg.new_chat_photo || msg.delete_chat_photo || msg.group_chat_created || msg.supergroup_chat_created) return;

  const from = msg.from;
  if (!from) return;
  const botId = botIdOf(integration);
  if (Number(from.id) === botId) return;

  // A linked channel's auto-forward, or an admin posting as the group, is never moderated.
  const anonymousAdmin = msg.sender_chat && Number(msg.sender_chat.id) === Number(msg.chat.id);
  const exempt = anonymousAdmin || msg.is_automatic_forward || await isAdmin(integration, group, from.id);

  let member = null;
  if (!msg.sender_chat) {
    member = await upsertMember(group, from);
    if (!edited) {
      await pool.query("UPDATE telegram_group_members SET messages_count = messages_count + 1, last_message_at = NOW() WHERE id = ?", [member.id]);
      bumpStat(group.id, "messages");
    }
  }

  if (!(await automationAllowed(group.agency_id))) return;

  const text = msg.text ?? msg.caption ?? "";
  const cmd = !edited && msg.text ? parseCommand(msg.text) : null;
  if (cmd && (!cmd.botName || cmd.botName === String(await botUsername(integration)).toLowerCase())) {
    const handled = await runCommand(integration, group, msg, cmd, { isAdminSender: exempt && !msg.is_automatic_forward });
    if (handled) return;
  }

  if (!exempt) {
    const ctx = { integration, group, msg, member, user: from };
    if (member?.captcha_pending) {
      await deleteMsg(ctx);
      return;
    }
    if (s.blockChannelSenders.enabled && msg.sender_chat?.type === "channel") {
      await deleteMsg(ctx);
      await logGroup(group, "DELETE", { actor: "Bot", detail: `Posted as the channel "${msg.sender_chat.title || msg.sender_chat.id}"` });
      return;
    }
    if (member && !edited && s.antiFlood.enabled && isFlooding(group.id, from.id, s.antiFlood)) {
      await applyPenalty(ctx, s.antiFlood.action, "is sending messages too fast", { muteMinutes: s.antiFlood.muteMinutes });
      return;
    }
    if (member && s.antiForward.enabled && isForwarded(msg)) {
      await applyPenalty(ctx, s.antiForward.action, "forwarded messages aren't allowed here");
      return;
    }
    if (member && s.antiLink.enabled && disallowedLinks(msg, s.antiLink.allowDomains).length) {
      await applyPenalty(ctx, s.antiLink.action, "links aren't allowed here");
      return;
    }
    const word = member && s.bannedWords.enabled ? findBannedWord(msg, s.bannedWords.words) : null;
    if (word) {
      await applyPenalty(ctx, s.bannedWords.action, "that word isn't allowed here", { detail: `Banned word "${word}"` });
      return;
    }
  }

  if (!edited && text && s.autoReplies.length) {
    const hit = matchAutoReply(s.autoReplies, text);
    if (hit) {
      await sendHtml(token, group.chat_id, renderTemplate(hit.reply, { user: from, group }), { reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true } })
        .catch((e) => console.warn("[TG Groups] auto reply:", e.message));
    }
  }
}

async function moveChatId(integration, oldId, newId) {
  const [[existingNew]] = await pool.query("SELECT id FROM telegram_groups WHERE integration_id = ? AND chat_id = ?", [integration.id, newId]);
  if (existingNew) {
    // Both rows exist: keep the old one's history under the new id.
    const [[oldRow]] = await pool.query("SELECT id FROM telegram_groups WHERE integration_id = ? AND chat_id = ?", [integration.id, oldId]);
    if (!oldRow) return;
    await pool.query("DELETE FROM telegram_groups WHERE id = ?", [existingNew.id]);
  }
  await pool.query("UPDATE telegram_groups SET chat_id = ?, type = 'supergroup' WHERE integration_id = ? AND chat_id = ?", [newId, integration.id, oldId]);
}

const usernameCache = new Map(); // integration id → bot username
async function botUsername(integration) {
  if (usernameCache.has(integration.id)) return usernameCache.get(integration.id);
  const [[row]] = await pool.query("SELECT bot_username FROM telegram_bots WHERE integration_id = ?", [integration.id]);
  const name = row?.bot_username || "";
  usernameCache.set(integration.id, name);
  return name;
}

function isFlooding(groupId, userId, { messages, seconds }) {
  const key = `${groupId}:${userId}`;
  const now = Date.now();
  const recent = (floodWindows.get(key) || []).filter((t) => now - t < seconds * 1000);
  recent.push(now);
  floodWindows.set(key, recent);
  if (floodWindows.size > 20000) {
    for (const [k, v] of floodWindows) if (!v.length || now - v[v.length - 1] > 300000) floodWindows.delete(k);
  }
  if (recent.length > messages) {
    floodWindows.set(key, []);
    return true;
  }
  return false;
}

async function deleteMsg({ integration, group, msg }) {
  await tgCall(integration.access_token, "deleteMessage", { chat_id: group.chat_id, message_id: msg.message_id })
    .catch((e) => logGroup(group, "ERROR", { detail: `Couldn't delete a message: ${e.message}` }));
}

async function notice(integration, group, html) {
  if (!group.settings.notices.enabled) return;
  const sent = await sendHtml(integration.access_token, group.chat_id, html).catch(() => null);
  if (sent && group.settings.notices.deleteAfterSeconds > 0) await scheduleDeletion(group.id, sent.message_id, group.settings.notices.deleteAfterSeconds);
}

/**
 * Delete the message, then DELETE / WARN / MUTE / KICK / BAN. A warning that
 * reaches the limit applies the warnings ladder's action and resets the count.
 */
async function applyPenalty(ctx, action, reason, { muteMinutes = null, detail = null } = {}) {
  const { integration, group, user } = ctx;
  const s = group.settings;
  await deleteMsg(ctx);
  if (action === "DELETE") {
    await logGroup(group, "DELETE", { user, actor: "Bot", detail: detail || reason });
    return;
  }
  if (action === "WARN") {
    await pool.query("UPDATE telegram_group_members SET warnings = warnings + 1 WHERE group_id = ? AND tg_user_id = ?", [group.id, user.id]);
    const [[m]] = await pool.query("SELECT warnings FROM telegram_group_members WHERE group_id = ? AND tg_user_id = ?", [group.id, user.id]);
    const count = Number(m?.warnings) || 1;
    await logGroup(group, "WARN", { user, actor: "Bot", detail: `${detail || reason} (${count}/${s.warnings.limit})` });
    if (count >= s.warnings.limit) {
      await pool.query("UPDATE telegram_group_members SET warnings = 0 WHERE group_id = ? AND tg_user_id = ?", [group.id, user.id]);
      await punish(integration, group, user, s.warnings.action, { minutes: s.warnings.muteMinutes, actor: "Bot", reason: `reached ${s.warnings.limit} warnings` });
      return;
    }
    await notice(integration, group, `⚠️ ${mentionHtml(user)}, ${escapeHtml(reason)}. Warning <b>${count}/${s.warnings.limit}</b>.`);
    return;
  }
  await punish(integration, group, user, action, { minutes: muteMinutes || s.warnings.muteMinutes, actor: "Bot", reason: detail || reason });
}

async function kickUser(token, chatId, userId) {
  await tgCall(token, "banChatMember", { chat_id: chatId, user_id: userId, until_date: Math.floor(Date.now() / 1000) + 60 });
  await tgCall(token, "unbanChatMember", { chat_id: chatId, user_id: userId, only_if_banned: true }).catch(() => {});
}

/** MUTE / UNMUTE / KICK / BAN / UNBAN in Telegram, recorded on the member and in the log. */
async function punish(integration, group, user, action, { minutes = 60, actor = "Bot", reason = null, silent = false } = {}) {
  const token = integration.access_token;
  const chat = group.chat_id;
  if (action === "MUTE") {
    const until = Math.floor(Date.now() / 1000) + minutes * 60;
    await tgCall(token, "restrictChatMember", { chat_id: chat, user_id: user.id, permissions: MUTED_PERMISSIONS, use_independent_chat_permissions: true, until_date: until });
    await pool.query("UPDATE telegram_group_members SET status = 'restricted', muted_until = FROM_UNIXTIME(?) WHERE group_id = ? AND tg_user_id = ?", [until, group.id, user.id]);
    await logGroup(group, "MUTE", { user, actor, detail: [`for ${describeMinutes(minutes)}`, reason].filter(Boolean).join(" — ") });
    if (!silent) await notice(integration, group, `🔇 ${mentionHtml(user)} is muted for ${describeMinutes(minutes)}${reason ? ` — ${escapeHtml(reason)}` : ""}.`);
  } else if (action === "UNMUTE") {
    await tgCall(token, "restrictChatMember", { chat_id: chat, user_id: user.id, permissions: LIFTED_PERMISSIONS, use_independent_chat_permissions: true });
    await pool.query("UPDATE telegram_group_members SET status = 'member', muted_until = NULL, captcha_pending = 0 WHERE group_id = ? AND tg_user_id = ?", [group.id, user.id]);
    await logGroup(group, "UNMUTE", { user, actor, detail: reason });
    if (!silent) await notice(integration, group, `🔊 ${mentionHtml(user)} can post again.`);
  } else if (action === "KICK") {
    await kickUser(token, chat, user.id);
    await pool.query("UPDATE telegram_group_members SET status = 'left', left_at = NOW() WHERE group_id = ? AND tg_user_id = ?", [group.id, user.id]);
    await logGroup(group, "KICK", { user, actor, detail: reason });
    if (!silent) await notice(integration, group, `👢 ${mentionHtml(user)} was removed${reason ? ` — ${escapeHtml(reason)}` : ""}.`);
  } else if (action === "BAN") {
    await tgCall(token, "banChatMember", { chat_id: chat, user_id: user.id });
    await pool.query("UPDATE telegram_group_members SET status = 'kicked', left_at = NOW() WHERE group_id = ? AND tg_user_id = ?", [group.id, user.id]);
    await logGroup(group, "BAN", { user, actor, detail: reason });
    if (!silent) await notice(integration, group, `⛔ ${mentionHtml(user)} was banned${reason ? ` — ${escapeHtml(reason)}` : ""}.`);
  } else if (action === "UNBAN") {
    await tgCall(token, "unbanChatMember", { chat_id: chat, user_id: user.id, only_if_banned: true });
    await pool.query("UPDATE telegram_group_members SET status = 'left', warnings = 0 WHERE group_id = ? AND tg_user_id = ?", [group.id, user.id]);
    await logGroup(group, "UNBAN", { user, actor, detail: reason });
  }
}

/* ── Commands typed in the group ──────────────────────────────────────── */

export const GROUP_COMMANDS = [
  { command: "rules", admin: false, description: "Show the group rules" },
  { command: "report", admin: false, description: "Reply to a message to report it to the admins" },
  { command: "warn", admin: true, description: "Reply: warn (reason optional)" },
  { command: "unwarn", admin: true, description: "Reply: remove one warning" },
  { command: "mute", admin: true, description: "Reply: mute, e.g. /mute 2h" },
  { command: "unmute", admin: true, description: "Reply: let them post again" },
  { command: "kick", admin: true, description: "Reply: remove (they can come back)" },
  { command: "ban", admin: true, description: "Reply: ban" },
  { command: "unban", admin: true, description: "/unban @username or id" },
  { command: "del", admin: true, description: "Reply: delete that message" },
  { command: "pin", admin: true, description: "Reply: pin that message" },
  { command: "unpin", admin: true, description: "Reply: unpin (or the latest pin)" },
];

/** A reply target, or "@username" / numeric id from the arguments (people this group has seen). */
async function commandTarget(group, msg, cmd) {
  const replied = msg.reply_to_message;
  if (replied?.from && !replied.sender_chat) return { user: replied.from, args: cmd.args };
  const first = cmd.args[0];
  if (!first) return { user: null, args: cmd.args };
  const byName = first.startsWith("@") ? first.slice(1) : null;
  const [[m]] = await pool.query(
    byName
      ? "SELECT * FROM telegram_group_members WHERE group_id = ? AND username = ? ORDER BY updated_at DESC LIMIT 1"
      : "SELECT * FROM telegram_group_members WHERE group_id = ? AND tg_user_id = ? LIMIT 1",
    [group.id, byName || (/^\d+$/.test(first) ? first : -1)]
  );
  return { user: m ? memberUser(m) : null, args: cmd.args.slice(1) };
}

async function runCommand(integration, group, msg, cmd, { isAdminSender }) {
  const token = integration.access_token;
  const s = group.settings;
  const def = GROUP_COMMANDS.find((c) => c.command === cmd.command);
  if (!def || !s.commands.enabled) return false;
  const reply = (html) => sendHtml(token, group.chat_id, html, { reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true } }).catch(() => null);
  const actorName = msg.sender_chat ? "an anonymous admin" : fullName(msg.from);
  // The command itself is clutter once handled.
  const cleanup = () => tgCall(token, "deleteMessage", { chat_id: group.chat_id, message_id: msg.message_id }).catch(() => {});

  if (cmd.command === "rules") {
    await reply(s.rules.text ? `📜 <b>Rules of ${escapeHtml(group.title)}</b>\n\n${renderTemplate(s.rules.text, { user: msg.from, group })}` : "No rules have been set for this group yet.");
    return true;
  }
  if (cmd.command === "report") {
    const target = msg.reply_to_message;
    if (!target) {
      await reply("Reply to the message you want to report, then send /report.");
      return true;
    }
    await logGroup(group, "REPORT", {
      user: target.from, actor: actorName,
      detail: `${(target.text || target.caption || "[media]").slice(0, 300)}${cmd.rest ? ` — "${cmd.rest.slice(0, 150)}"` : ""}`,
    });
    emitToAgency(group.agency_id, "tg_group_report", { groupId: group.id, integrationId: integration.id, title: group.title });
    const admins = (group.admins || []).filter((a) => !a.isBot && !a.isAnonymous).slice(0, 5);
    const tags = admins.map((a) => `<a href="tg://user?id=${a.id}">​</a>`).join("");
    await reply(`🚩 Reported to the admins.${tags}`);
    return true;
  }

  if (!isAdminSender) {
    await cleanup();
    return true; // an admin-only command from a member: removed, nothing else
  }
  const target = await commandTarget(group, msg, cmd);
  const reason = target.args.filter((a) => !parseDuration(a)).join(" ").slice(0, 150) || null;
  const needTarget = async () => { await reply("Reply to the person's message (or give @username) to use this command."); return true; };

  try {
    switch (cmd.command) {
      case "warn": {
        if (!target.user) return needTarget();
        if (await isAdmin(integration, group, target.user.id)) { await reply("Admins can't be warned."); return true; }
        await upsertMember(group, target.user);
        await pool.query("UPDATE telegram_group_members SET warnings = warnings + 1 WHERE group_id = ? AND tg_user_id = ?", [group.id, target.user.id]);
        const [[m]] = await pool.query("SELECT warnings FROM telegram_group_members WHERE group_id = ? AND tg_user_id = ?", [group.id, target.user.id]);
        await logGroup(group, "WARN", { user: target.user, actor: actorName, detail: `${reason || "by an admin"} (${m.warnings}/${s.warnings.limit})` });
        if (m.warnings >= s.warnings.limit) {
          await pool.query("UPDATE telegram_group_members SET warnings = 0 WHERE group_id = ? AND tg_user_id = ?", [group.id, target.user.id]);
          await punish(integration, group, target.user, s.warnings.action, { minutes: s.warnings.muteMinutes, actor: actorName, reason: `reached ${s.warnings.limit} warnings` });
        } else {
          await reply(`⚠️ ${mentionHtml(target.user)} has been warned${reason ? ` — ${escapeHtml(reason)}` : ""}. Warning <b>${m.warnings}/${s.warnings.limit}</b>.`);
        }
        break;
      }
      case "unwarn": {
        if (!target.user) return needTarget();
        await pool.query("UPDATE telegram_group_members SET warnings = GREATEST(warnings - 1, 0) WHERE group_id = ? AND tg_user_id = ?", [group.id, target.user.id]);
        await logGroup(group, "UNWARN", { user: target.user, actor: actorName });
        await reply(`✅ One warning removed from ${mentionHtml(target.user)}.`);
        break;
      }
      case "mute": {
        if (!target.user) return needTarget();
        const minutes = target.args.map(parseDuration).find(Boolean) || 60;
        await upsertMember(group, target.user);
        await punish(integration, group, target.user, "MUTE", { minutes, actor: actorName, reason });
        break;
      }
      case "unmute":
      case "kick":
      case "ban":
      case "unban": {
        if (!target.user) return needTarget();
        await upsertMember(group, target.user);
        await punish(integration, group, target.user, cmd.command.toUpperCase(), { actor: actorName, reason });
        if (cmd.command === "unban") await reply(`✅ ${mentionHtml(target.user)} is unbanned and can join again.`);
        break;
      }
      case "del": {
        if (!msg.reply_to_message) { await reply("Reply to the message you want to delete."); return true; }
        await tgCall(token, "deleteMessage", { chat_id: group.chat_id, message_id: msg.reply_to_message.message_id });
        await logGroup(group, "DELETE", { user: msg.reply_to_message.from, actor: actorName, detail: "by /del" });
        break;
      }
      case "pin": {
        if (!msg.reply_to_message) { await reply("Reply to the message you want to pin."); return true; }
        await tgCall(token, "pinChatMessage", { chat_id: group.chat_id, message_id: msg.reply_to_message.message_id, disable_notification: target.args.includes("silent") });
        await logGroup(group, "PIN", { actor: actorName });
        break;
      }
      case "unpin": {
        await tgCall(token, "unpinChatMessage", msg.reply_to_message ? { chat_id: group.chat_id, message_id: msg.reply_to_message.message_id } : { chat_id: group.chat_id });
        await logGroup(group, "UNPIN", { actor: actorName });
        break;
      }
      default:
        return false;
    }
  } catch (err) {
    await reply(`❌ ${escapeHtml(err.message)}`);
  }
  await cleanup();
  return true;
}

/* ── Scheduled work ───────────────────────────────────────────────────── */

async function scheduleDeletion(groupId, messageId, seconds) {
  if (!messageId || !seconds) return;
  await pool.query(
    "INSERT INTO telegram_group_deletions (group_id, message_id, delete_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))",
    [groupId, messageId, seconds]
  ).catch(() => {});
}

async function integrationFor(group) {
  const [[integ]] = await pool.query("SELECT * FROM integrations WHERE id = ? AND is_active = 1", [group.integration_id]);
  return integ || null;
}

export async function processTelegramGroupJobs() {
  // 1. Captchas nobody answered.
  const [expired] = await pool.query(
    `SELECT m.*, g.id AS g_id FROM telegram_group_members m JOIN telegram_groups g ON g.id = m.group_id
      WHERE m.captcha_pending = 1 AND m.captcha_deadline <= NOW() LIMIT 50`
  );
  for (const m of expired) {
    const [claim] = await pool.query("UPDATE telegram_group_members SET captcha_pending = 0, captcha_deadline = NULL WHERE id = ? AND captcha_pending = 1", [m.id]);
    if (claim.affectedRows !== 1) continue;
    try {
      const group = await loadGroup(m.agency_id, m.group_id);
      const integration = group && await integrationFor(group);
      if (!integration) continue;
      const user = memberUser(m);
      if (m.captcha_message_id) tgCall(integration.access_token, "deleteMessage", { chat_id: group.chat_id, message_id: m.captcha_message_id }).catch(() => {});
      if (group.settings.captcha.onFail === "KICK") {
        await kickUser(integration.access_token, group.chat_id, user.id).catch(() => {});
        await pool.query("UPDATE telegram_group_members SET status = 'left', left_at = NOW() WHERE id = ?", [m.id]);
      }
      await logGroup(group, "CAPTCHA_FAILED", { user, actor: "Bot", detail: group.settings.captcha.onFail === "KICK" ? "removed" : "kept muted" });
    } catch (err) {
      console.error("[TG Groups] captcha expiry:", err.message);
    }
  }

  // 2. Bot messages due for deletion.
  const [dels] = await pool.query(
    `SELECT d.id, d.message_id, g.chat_id, g.integration_id FROM telegram_group_deletions d JOIN telegram_groups g ON g.id = d.group_id
      WHERE d.delete_at <= NOW() ORDER BY d.id LIMIT 100`
  );
  if (dels.length) {
    await pool.query("DELETE FROM telegram_group_deletions WHERE id IN (?)", [dels.map((d) => d.id)]);
    for (const d of dels) {
      const integ = await integrationFor({ integration_id: d.integration_id });
      if (integ) tgCall(integ.access_token, "deleteMessage", { chat_id: d.chat_id, message_id: d.message_id }).catch(() => {});
    }
  }

  // 3. Scheduled announcements.
  const [due] = await pool.query("SELECT * FROM telegram_group_posts WHERE status = 'SCHEDULED' AND scheduled_at <= NOW() ORDER BY scheduled_at LIMIT 20");
  const { isWorkspaceExpired } = await import("./subscriptionStatus.js");
  for (const post of due) {
    if (await isWorkspaceExpired(post.agency_id)) {
      await pool.query("UPDATE telegram_group_posts SET scheduled_at = DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE id = ? AND status = 'SCHEDULED'", [post.id]);
      continue;
    }
    // Claimed by flipping the status first — never sent twice, even across instances.
    const [claim] = await pool.query("UPDATE telegram_group_posts SET status = 'SENT', sent_at = NOW() WHERE id = ? AND status = 'SCHEDULED'", [post.id]);
    if (claim.affectedRows !== 1) continue;
    await deliverPost(post).catch(() => {});
  }
}

export function startTelegramGroupScheduler() {
  console.log("👥 Telegram group scheduler started (captcha timeouts, scheduled posts, message cleanup — every 15 s)");
  setInterval(lockedJob("telegram-groups", processTelegramGroupJobs), 15000);
}

/* ── Dashboard operations ─────────────────────────────────────────────── */

export async function getBotGroupInfo(integration) {
  const me = await tgCall(integration.access_token, "getMe");
  return {
    username: me.username,
    canJoinGroups: me.can_join_groups !== false,
    canReadAllGroupMessages: Boolean(me.can_read_all_group_messages),
  };
}

export async function listGroups(agencyId, integrationId) {
  const [rows] = await pool.query(
    `SELECT g.id, g.chat_id, g.type, g.title, g.username, g.member_count, g.bot_status, g.bot_rights, g.joined_at, g.left_at,
            g.last_activity_at, g.added_by_name,
            (SELECT COUNT(*) FROM telegram_group_join_requests r WHERE r.group_id = g.id AND r.status = 'PENDING') AS pending_requests,
            (SELECT COALESCE(SUM(messages), 0) FROM telegram_group_stats st WHERE st.group_id = g.id AND st.day >= CURDATE() - INTERVAL 6 DAY) AS messages_7d,
            (SELECT COALESCE(SUM(actions), 0) FROM telegram_group_stats st WHERE st.group_id = g.id AND st.day >= CURDATE() - INTERVAL 6 DAY) AS actions_7d
       FROM telegram_groups g
      WHERE g.agency_id = ? AND g.integration_id = ?
      ORDER BY g.left_at IS NOT NULL, g.last_activity_at DESC, g.id DESC`,
    [agencyId, integrationId]
  );
  return rows.map((r) => ({ ...hydrate(r), settings: undefined }));
}

/** Pulls the group's live state from Telegram (title, members, the bot's rights, admins, permissions). */
export async function refreshGroup(integration, group) {
  const token = integration.access_token;
  let chat;
  try {
    chat = await tgCall(token, "getChat", { chat_id: group.chat_id });
  } catch (err) {
    if (err.migrateTo) {
      await moveChatId(integration, group.chat_id, err.migrateTo);
      group.chat_id = err.migrateTo;
      chat = await tgCall(token, "getChat", { chat_id: group.chat_id });
    } else if (/isn't in this group/.test(err.message)) {
      await pool.query("UPDATE telegram_groups SET bot_status = 'left', left_at = COALESCE(left_at, NOW()) WHERE id = ?", [group.id]);
      throw err;
    } else {
      throw err;
    }
  }
  const [count, me] = await Promise.all([
    tgCall(token, "getChatMemberCount", { chat_id: group.chat_id }).catch(() => null),
    tgCall(token, "getChatMember", { chat_id: group.chat_id, user_id: botIdOf(integration) }).catch(() => null),
  ]);
  await pool.query(
    `UPDATE telegram_groups SET type = ?, title = ?, username = ?, description = ?, is_forum = ?, member_count = COALESCE(?, member_count),
            default_permissions = ?, primary_invite_link = COALESCE(?, primary_invite_link) WHERE id = ?`,
    [chat.type, String(chat.title || "").slice(0, 255), chat.username || null, chat.description || null, chat.is_forum ? 1 : 0, count,
      chat.permissions ? JSON.stringify(chat.permissions) : null, chat.invite_link || null, group.id]
  );
  if (me?.status) {
    // Only when Telegram told us — a failed lookup keeps what we knew.
    await pool.query(
      `UPDATE telegram_groups SET bot_status = ?, bot_rights = ?,
              left_at = IF(? IN ('left','kicked'), COALESCE(left_at, NOW()), NULL) WHERE id = ?`,
      [me.status, me.status === "administrator" ? JSON.stringify(me) : null, me.status, group.id]
    );
  }
  await syncAdmins(integration, group).catch(() => {});
  return loadGroup(group.agency_id, group.id);
}

export async function groupDetail(agencyId, group) {
  const [[counts]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM telegram_group_members WHERE group_id = ? AND status IN ('member','restricted','administrator','creator')) AS known_members,
       (SELECT COUNT(*) FROM telegram_group_members WHERE group_id = ? AND muted_until > NOW()) AS muted,
       (SELECT COUNT(*) FROM telegram_group_members WHERE group_id = ? AND warnings > 0) AS warned,
       (SELECT COUNT(*) FROM telegram_group_members WHERE group_id = ? AND status = 'kicked') AS banned,
       (SELECT COUNT(*) FROM telegram_group_join_requests WHERE group_id = ? AND status = 'PENDING') AS pending_requests`,
    [group.id, group.id, group.id, group.id, group.id]
  );
  const [stats] = await pool.query(
    `SELECT DATE_FORMAT(day, '%Y-%m-%d') AS day, messages, joins, leaves, actions FROM telegram_group_stats
      WHERE group_id = ? AND day >= CURDATE() - INTERVAL 29 DAY ORDER BY day`,
    [group.id]
  );
  return { group, counts, stats, commands: GROUP_COMMANDS };
}

export async function updateGroupSettings(group, input) {
  const next = cleanGroupSettings(input, group.settings);
  await pool.query("UPDATE telegram_groups SET settings = ? WHERE id = ?", [JSON.stringify(next), group.id]);
  return next;
}

export async function updateGroupInfo(integration, group, { title, description }) {
  const token = integration.access_token;
  if (title !== undefined && String(title).trim() !== group.title) {
    const t = String(title).trim();
    if (!t || t.length > 128) { const e = new Error("The title must be 1–128 characters."); e.status = 400; throw e; }
    await tgCall(token, "setChatTitle", { chat_id: group.chat_id, title: t });
  }
  if (description !== undefined && String(description) !== String(group.description || "")) {
    if (String(description).length > 255) { const e = new Error("The description can be at most 255 characters."); e.status = 400; throw e; }
    await tgCall(token, "setChatDescription", { chat_id: group.chat_id, description: String(description) });
  }
  return refreshGroup(integration, group);
}

export async function setGroupPermissions(integration, group, permissions) {
  const perms = cleanPermissions(permissions);
  await tgCall(integration.access_token, "setChatPermissions", { chat_id: group.chat_id, permissions: perms, use_independent_chat_permissions: true });
  await pool.query("UPDATE telegram_groups SET default_permissions = ? WHERE id = ?", [JSON.stringify(perms), group.id]);
  await logGroup(group, "PERMISSIONS", { actor: "Dashboard" });
  return perms;
}

export async function listMembers(group, { q = "", filter = "all", page = 1, pageSize = 25 } = {}) {
  const where = ["group_id = ?"];
  const params = [group.id];
  if (q) {
    where.push("(first_name LIKE ? OR last_name LIKE ? OR username LIKE ? OR CAST(tg_user_id AS CHAR) = ?)");
    const like = `%${String(q).replace(/[%_]/g, "\\$&")}%`;
    params.push(like, like, like, String(q).replace(/^@/, ""));
  }
  if (filter === "active") where.push("status IN ('member','restricted','administrator','creator')");
  if (filter === "muted") where.push("muted_until > NOW()");
  if (filter === "warned") where.push("warnings > 0");
  if (filter === "banned") where.push("status = 'kicked'");
  if (filter === "left") where.push("status = 'left'");
  if (filter === "captcha") where.push("captcha_pending = 1");
  const size = Math.min(100, Math.max(5, Number(pageSize) || 25));
  const offset = (Math.max(1, Number(page) || 1) - 1) * size;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM telegram_group_members WHERE ${where.join(" AND ")}`, params);
  const [rows] = await pool.query(
    `SELECT id, tg_user_id, first_name, last_name, username, is_bot, status, warnings, messages_count,
            IF(muted_until > NOW(), muted_until, NULL) AS muted_until, captcha_pending, joined_at, left_at, last_message_at
       FROM telegram_group_members WHERE ${where.join(" AND ")}
      ORDER BY (status IN ('member','restricted','administrator','creator')) DESC, last_message_at IS NULL, last_message_at DESC, id DESC
      LIMIT ? OFFSET ?`,
    [...params, size, offset]
  );
  const adminIds = new Set((group.admins || []).map((a) => Number(a.id)));
  return { total, members: rows.map((r) => ({ ...r, is_admin: adminIds.has(Number(r.tg_user_id)) })) };
}

const MEMBER_ACTIONS = ["WARN", "UNWARN", "RESET_WARNINGS", "MUTE", "UNMUTE", "KICK", "BAN", "UNBAN"];

export async function memberAction(integration, group, memberId, action, { minutes, reason, actorName } = {}) {
  const act = String(action || "").toUpperCase();
  if (!MEMBER_ACTIONS.includes(act)) { const e = new Error("Unknown action"); e.status = 400; throw e; }
  const [[m]] = await pool.query("SELECT * FROM telegram_group_members WHERE id = ? AND group_id = ?", [memberId, group.id]);
  if (!m) { const e = new Error("Member not found"); e.status = 404; throw e; }
  const user = memberUser(m);
  if (["MUTE", "KICK", "BAN", "WARN"].includes(act) && await isAdmin(integration, group, user.id)) {
    const e = new Error("Group admins can't be restricted, removed or banned by the bot.");
    e.status = 400;
    throw e;
  }
  const actor = actorName ? `${actorName} (dashboard)` : "Dashboard";
  if (act === "WARN") {
    await pool.query("UPDATE telegram_group_members SET warnings = warnings + 1 WHERE id = ?", [m.id]);
    const [[w]] = await pool.query("SELECT warnings FROM telegram_group_members WHERE id = ?", [m.id]);
    await logGroup(group, "WARN", { user, actor, detail: `${reason || "from the dashboard"} (${w.warnings}/${group.settings.warnings.limit})` });
    if (w.warnings >= group.settings.warnings.limit) {
      await pool.query("UPDATE telegram_group_members SET warnings = 0 WHERE id = ?", [m.id]);
      await punish(integration, group, user, group.settings.warnings.action, { minutes: group.settings.warnings.muteMinutes, actor, reason: `reached ${group.settings.warnings.limit} warnings` });
    }
  } else if (act === "UNWARN") {
    await pool.query("UPDATE telegram_group_members SET warnings = GREATEST(warnings - 1, 0) WHERE id = ?", [m.id]);
    await logGroup(group, "UNWARN", { user, actor });
  } else if (act === "RESET_WARNINGS") {
    await pool.query("UPDATE telegram_group_members SET warnings = 0 WHERE id = ?", [m.id]);
    await logGroup(group, "UNWARN", { user, actor, detail: "all warnings cleared" });
  } else {
    const mins = Math.min(525600, Math.max(1, Number(minutes) || 60));
    await punish(integration, group, user, act, { minutes: mins, actor, reason: reason ? String(reason).slice(0, 150) : null, silent: act === "UNBAN" });
  }
  const [[fresh]] = await pool.query(
    "SELECT id, tg_user_id, first_name, last_name, username, status, warnings, IF(muted_until > NOW(), muted_until, NULL) AS muted_until FROM telegram_group_members WHERE id = ?",
    [m.id]
  );
  return fresh;
}

export async function listJoinRequests(group, status = "PENDING") {
  const st = ["PENDING", "APPROVED", "DECLINED", "GONE"].includes(status) ? status : "PENDING";
  const [rows] = await pool.query(
    `SELECT id, tg_user_id, name, username, bio, invite_link_name, status, requested_at, decided_at
       FROM telegram_group_join_requests WHERE group_id = ? AND status = ? ORDER BY requested_at DESC LIMIT 200`,
    [group.id, st]
  );
  return rows;
}

export async function decideJoinRequests(integration, group, ids, approve, userId) {
  const list = (Array.isArray(ids) ? ids : []).map(Number).filter(Boolean).slice(0, 100);
  if (!list.length) return { done: 0, failed: [] };
  const [rows] = await pool.query("SELECT * FROM telegram_group_join_requests WHERE group_id = ? AND id IN (?) AND status = 'PENDING'", [group.id, list]);
  let done = 0;
  const failed = [];
  for (const r of rows) {
    try {
      await tgCall(integration.access_token, approve ? "approveChatJoinRequest" : "declineChatJoinRequest", { chat_id: group.chat_id, user_id: r.tg_user_id });
      await markRequest(group, r.tg_user_id, approve ? "APPROVED" : "DECLINED", userId);
      await logGroup(group, approve ? "JOIN_APPROVED" : "JOIN_DECLINED", { user: { id: r.tg_user_id, first_name: r.name }, actor: "Dashboard" });
      done += 1;
    } catch (err) {
      // Telegram forgets a request once it's handled elsewhere or expires.
      if (/already handled|HIDE_REQUESTER_MISSING/i.test(err.message + (err.telegram?.description || ""))) {
        await markRequest(group, r.tg_user_id, "GONE", userId);
      }
      failed.push({ id: r.id, name: r.name, message: err.message });
    }
  }
  return { done, failed };
}

export async function listInviteLinks(group) {
  const [rows] = await pool.query(
    `SELECT id, invite_link, name, expire_at, member_limit, creates_join_request, is_revoked, joins, created_at,
            (expire_at IS NOT NULL AND expire_at <= NOW()) AS is_expired
       FROM telegram_group_invite_links WHERE group_id = ? ORDER BY is_revoked, id DESC`,
    [group.id]
  );
  return { primary: group.primary_invite_link, links: rows };
}

export async function createInviteLink(integration, group, { name, expireHours, memberLimit, joinRequest }, userId) {
  const params = { chat_id: group.chat_id };
  const n = String(name || "").trim().slice(0, 32);
  if (n) params.name = n;
  const hours = Number(expireHours) || 0;
  if (hours > 0) params.expire_date = Math.floor(Date.now() / 1000) + Math.min(hours, 24 * 366) * 3600;
  if (joinRequest) params.creates_join_request = true;
  else if (Number(memberLimit) > 0) params.member_limit = Math.min(99999, Math.floor(Number(memberLimit)));
  const link = await tgCall(integration.access_token, "createChatInviteLink", params);
  await pool.query(
    `INSERT INTO telegram_group_invite_links (agency_id, group_id, invite_link, name, expire_at, member_limit, creates_join_request, created_by)
     VALUES (?, ?, ?, ?, ${link.expire_date ? "FROM_UNIXTIME(?)" : "?"}, ?, ?, ?)`,
    [group.agency_id, group.id, link.invite_link, link.name || null, link.expire_date || null, link.member_limit || null, link.creates_join_request ? 1 : 0, userId || null]
  );
  await logGroup(group, "INVITE_LINK", { actor: "Dashboard", detail: `Created ${link.name ? `"${link.name}"` : "a link"}` });
  return link;
}

export async function revokeInviteLink(integration, group, linkId) {
  const [[row]] = await pool.query("SELECT * FROM telegram_group_invite_links WHERE id = ? AND group_id = ?", [linkId, group.id]);
  if (!row) { const e = new Error("Invite link not found"); e.status = 404; throw e; }
  await tgCall(integration.access_token, "revokeChatInviteLink", { chat_id: group.chat_id, invite_link: row.invite_link });
  await pool.query("UPDATE telegram_group_invite_links SET is_revoked = 1 WHERE id = ?", [row.id]);
  await logGroup(group, "INVITE_LINK", { actor: "Dashboard", detail: `Revoked ${row.name ? `"${row.name}"` : "a link"}` });
}

export async function newPrimaryInviteLink(integration, group) {
  const link = await tgCall(integration.access_token, "exportChatInviteLink", { chat_id: group.chat_id });
  await pool.query("UPDATE telegram_groups SET primary_invite_link = ? WHERE id = ?", [link, group.id]);
  await logGroup(group, "INVITE_LINK", { actor: "Dashboard", detail: "New primary link (the old one stopped working)" });
  return link;
}

async function deliverPost(post) {
  const [[g]] = await pool.query("SELECT * FROM telegram_groups WHERE id = ?", [post.group_id]);
  const group = hydrate(g);
  const integration = group && await integrationFor(group);
  try {
    if (!integration) throw new Error("The bot account is disconnected.");
    let buttons = [];
    try { buttons = typeof post.buttons === "string" ? JSON.parse(post.buttons) : (post.buttons || []); } catch { buttons = []; }
    const sent = await sendHtml(integration.access_token, group.chat_id, renderTemplate(post.text, { group }), {
      disable_notification: Boolean(post.silent),
      ...urlKeyboard(buttons),
    });
    let pinError = null;
    if (post.pin) {
      await tgCall(integration.access_token, "pinChatMessage", { chat_id: group.chat_id, message_id: sent.message_id, disable_notification: Boolean(post.silent) })
        .catch((e) => { pinError = e.message; });
    }
    await pool.query("UPDATE telegram_group_posts SET status = 'SENT', sent_at = NOW(), message_id = ?, error = ? WHERE id = ?",
      [sent.message_id, pinError ? `Sent, but not pinned: ${pinError}`.slice(0, 500) : null, post.id]);
    await logGroup(group, "POST", { actor: "Dashboard", detail: String(post.text).slice(0, 120) });
    return sent;
  } catch (err) {
    await pool.query("UPDATE telegram_group_posts SET status = 'FAILED', error = ? WHERE id = ?", [String(err.message).slice(0, 500), post.id]);
    throw err;
  } finally {
    if (group) emitToAgency(group.agency_id, "tg_group_update", { groupId: group.id, integrationId: group.integration_id });
  }
}

function cleanPostInput({ text, buttons, pin, silent }) {
  const t = String(text || "").trim();
  if (!t) { const e = new Error("Write the message first."); e.status = 400; throw e; }
  if (t.length > 4000) { const e = new Error("A message can be at most 4,000 characters."); e.status = 400; throw e; }
  const btns = cleanGroupSettings({ welcome: { buttons } }).welcome.buttons;
  return { text: t, buttons: btns, pin: pin ? 1 : 0, silent: silent ? 1 : 0 };
}

/** Post now, or schedule (scheduledAt = ISO time in the future). */
export async function createPost(group, input, userId) {
  const clean = cleanPostInput(input);
  const at = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (at && Number.isNaN(at.getTime())) { const e = new Error("That date isn't valid."); e.status = 400; throw e; }
  const scheduled = at && at.getTime() > Date.now() + 30000;
  const [res] = await pool.query(
    `INSERT INTO telegram_group_posts (agency_id, group_id, text, buttons, pin, silent, status, scheduled_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED', ${scheduled ? "DATE_ADD(NOW(), INTERVAL ? SECOND)" : "NOW()"}, ?)`,
    scheduled
      ? [group.agency_id, group.id, clean.text, JSON.stringify(clean.buttons), clean.pin, clean.silent, Math.round((at.getTime() - Date.now()) / 1000), userId || null]
      : [group.agency_id, group.id, clean.text, JSON.stringify(clean.buttons), clean.pin, clean.silent, userId || null]
  );
  if (!scheduled) {
    const [claim] = await pool.query("UPDATE telegram_group_posts SET status = 'SENT', sent_at = NOW() WHERE id = ? AND status = 'SCHEDULED'", [res.insertId]);
    if (claim.affectedRows === 1) {
      const [[post]] = await pool.query("SELECT * FROM telegram_group_posts WHERE id = ?", [res.insertId]);
      await deliverPost(post);
    }
  }
  const [[row]] = await pool.query("SELECT * FROM telegram_group_posts WHERE id = ?", [res.insertId]);
  return row;
}

export async function listPosts(group) {
  const [rows] = await pool.query(
    "SELECT id, text, buttons, pin, silent, status, scheduled_at, sent_at, message_id, error, created_at FROM telegram_group_posts WHERE group_id = ? ORDER BY COALESCE(scheduled_at, created_at) DESC LIMIT 100",
    [group.id]
  );
  return rows;
}

export async function cancelPost(group, postId) {
  const [res] = await pool.query("UPDATE telegram_group_posts SET status = 'CANCELLED' WHERE id = ? AND group_id = ? AND status = 'SCHEDULED'", [postId, group.id]);
  if (!res.affectedRows) { const e = new Error("Only a scheduled post can be cancelled."); e.status = 400; throw e; }
}

export async function unpinAll(integration, group) {
  await tgCall(integration.access_token, "unpinAllChatMessages", { chat_id: group.chat_id });
  await logGroup(group, "UNPIN", { actor: "Dashboard", detail: "all pinned messages" });
}

export async function listLogs(group, { action = null, page = 1, pageSize = 50 } = {}) {
  const size = Math.min(100, Math.max(10, Number(pageSize) || 50));
  const offset = (Math.max(1, Number(page) || 1) - 1) * size;
  const filter = action ? " AND action = ?" : "";
  const params = action ? [group.id, String(action).toUpperCase()] : [group.id];
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM telegram_group_logs WHERE group_id = ?${filter}`, params);
  const [rows] = await pool.query(
    `SELECT id, action, tg_user_id, user_name, actor, detail, created_at FROM telegram_group_logs WHERE group_id = ?${filter} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, size, offset]
  );
  return { total, logs: rows };
}

export async function leaveGroup(integration, group) {
  await tgCall(integration.access_token, "leaveChat", { chat_id: group.chat_id }).catch((err) => {
    if (!/isn't in this group/.test(err.message)) throw err;
  });
  await pool.query("UPDATE telegram_groups SET bot_status = 'left', left_at = NOW() WHERE id = ?", [group.id]);
  await logGroup(group, "BOT_REMOVED", { actor: "Dashboard" });
}

/** Removes a group the bot is no longer in from the dashboard (and its history). */
export async function forgetGroup(group) {
  if (!group.left_at) { const e = new Error("The bot is still in this group — make it leave first."); e.status = 400; throw e; }
  await pool.query("DELETE FROM telegram_groups WHERE id = ?", [group.id]);
}

/**
 * Makes sure Telegram sends this bot everything group management needs: a
 * webhook bot is re-registered with the full allowed_updates list (a polled
 * bot asks for it on every getUpdates), and the group commands are published.
 */
export async function enableGroupUpdates(integration) {
  const [[bot]] = await pool.query("SELECT id, webhook_set FROM telegram_bots WHERE integration_id = ? AND is_active = 1", [integration.id]);
  let webhook = "polling";
  if (bot?.webhook_set) {
    const { registerTelegramWebhook } = await import("./webhookAuth.js");
    const ok = await registerTelegramWebhook({ agencyId: integration.agency_id, integrationId: integration.id, botToken: integration.access_token });
    webhook = ok ? "webhook" : "webhook-failed";
  }
  await publishGroupCommands(integration);
  return { webhook };
}

/** The bot's own group commands, shown in the "/" menu of group chats (setMyCommands, scope all_group_chats). */
export async function publishGroupCommands(integration) {
  await tgCall(integration.access_token, "setMyCommands", {
    commands: GROUP_COMMANDS.map((c) => ({ command: c.command, description: c.description.slice(0, 256) })),
    scope: { type: "all_group_chats" },
  });
}
