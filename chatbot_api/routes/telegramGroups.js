/**
 * Bot Manager → Group Management on a Telegram bot (utils/telegramGroups.js).
 *
 *   GET    /tg-groups?integrationId=                         the bot's groups + what the bot can do in groups
 *   POST   /tg-groups/setup/:integrationId                   ask Telegram for member updates + publish group commands
 *   GET    /tg-groups/:groupId                               settings, counts, 30-day stats
 *   POST   /tg-groups/:groupId/refresh                       pull title / members / rights / admins from Telegram
 *   PUT    /tg-groups/:groupId/settings                      welcome, captcha, protection, warnings, commands, auto-replies…
 *   PUT    /tg-groups/:groupId/info                          { title, description }
 *   PUT    /tg-groups/:groupId/permissions                   what members may do (setChatPermissions)
 *   GET    /tg-groups/:groupId/members?q=&filter=&page=
 *   POST   /tg-groups/:groupId/members/:memberId/action      { action: WARN|UNWARN|RESET_WARNINGS|MUTE|UNMUTE|KICK|BAN|UNBAN, minutes?, reason? }
 *   GET    /tg-groups/:groupId/join-requests?status=
 *   POST   /tg-groups/:groupId/join-requests                 { ids, approve }
 *   GET    /tg-groups/:groupId/invite-links
 *   POST   /tg-groups/:groupId/invite-links                  { name, expireHours, memberLimit, joinRequest }
 *   POST   /tg-groups/:groupId/invite-links/primary          new primary link (the old one stops working)
 *   DELETE /tg-groups/:groupId/invite-links/:linkId          revoke
 *   GET    /tg-groups/:groupId/posts
 *   POST   /tg-groups/:groupId/posts                         { text, buttons, pin, silent, scheduledAt? }
 *   DELETE /tg-groups/:groupId/posts/:postId                 cancel a scheduled post
 *   POST   /tg-groups/:groupId/unpin-all
 *   GET    /tg-groups/:groupId/logs?action=&page=
 *   POST   /tg-groups/:groupId/leave                         the bot leaves the group
 *   DELETE /tg-groups/:groupId                               forget a group the bot already left
 *
 * TENANT-LOCKED: no raw SQL in this file. The bot account comes from
 * tenantDb(req); a group is only ever loaded with this workspace's id, and must
 * belong to one of its Telegram bot accounts.
 */
import express from "express";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requireModule } from "../utils/entitlements.js";
import { tenantDb } from "../utils/tenantDb.js";
import {
  getBotGroupInfo, listGroups, loadGroup, refreshGroup, groupDetail, updateGroupSettings, updateGroupInfo,
  setGroupPermissions, listMembers, memberAction, listJoinRequests, decideJoinRequests, listInviteLinks,
  createInviteLink, revokeInviteLink, newPrimaryInviteLink, listPosts, createPost, cancelPost, unpinAll,
  listLogs, leaveGroup, forgetGroup, enableGroupUpdates,
} from "../utils/telegramGroups.js";

const router = express.Router();
router.use("/tg-groups", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), requireModule("feature_telegram_group_manager"));

const agencyOf = (req) => req.tenant?.agencyId ?? req.user.agencyId;

async function loadTelegramIntegration(req, id) {
  const row = id ? await tenantDb(req).getOwned("integrations", id) : null;
  return row && String(row.platform).toUpperCase() === "TELEGRAM" && row.is_active !== 0 ? row : null;
}

/** The group (this workspace's) and its bot account; 404 otherwise. */
async function withGroup(req, res) {
  const group = await loadGroup(agencyOf(req), req.params.groupId);
  const integration = group ? await loadTelegramIntegration(req, group.integration_id) : null;
  if (!group || !integration) {
    res.status(404).json({ success: false, message: "Group not found" });
    return {};
  }
  return { group, integration };
}

const fail = (res, err) => {
  if (!err.status) console.error("[TG Groups]", err);
  return res.status(err.status || 500).json({ success: false, message: err.status ? err.message : "Server error" });
};

const route = (fn) => async (req, res) => {
  try {
    return await fn(req, res);
  } catch (err) {
    return fail(res, err);
  }
};

router.get("/tg-groups", route(async (req, res) => {
  const integration = await loadTelegramIntegration(req, req.query.integrationId);
  if (!integration) return res.status(404).json({ success: false, message: "Telegram bot not found" });
  const [bot, groups] = await Promise.all([
    getBotGroupInfo(integration).catch((e) => ({ error: e.message })),
    listGroups(agencyOf(req), integration.id),
  ]);
  return res.json({ success: true, bot, groups });
}));

router.post("/tg-groups/setup/:integrationId", route(async (req, res) => {
  const integration = await loadTelegramIntegration(req, req.params.integrationId);
  if (!integration) return res.status(404).json({ success: false, message: "Telegram bot not found" });
  return res.json({ success: true, ...(await enableGroupUpdates(integration)) });
}));

router.get("/tg-groups/:groupId", route(async (req, res) => {
  const { group } = await withGroup(req, res);
  if (!group) return undefined;
  return res.json({ success: true, ...(await groupDetail(agencyOf(req), group)) });
}));

router.post("/tg-groups/:groupId/refresh", route(async (req, res) => {
  const { group, integration } = await withGroup(req, res);
  if (!group) return undefined;
  const fresh = await refreshGroup(integration, group);
  return res.json({ success: true, ...(await groupDetail(agencyOf(req), fresh)) });
}));

router.put("/tg-groups/:groupId/settings", route(async (req, res) => {
  const { group } = await withGroup(req, res);
  if (!group) return undefined;
  return res.json({ success: true, settings: await updateGroupSettings(group, req.body?.settings || req.body || {}) });
}));

router.put("/tg-groups/:groupId/info", route(async (req, res) => {
  const { group, integration } = await withGroup(req, res);
  if (!group) return undefined;
  const fresh = await updateGroupInfo(integration, group, { title: req.body?.title, description: req.body?.description });
  return res.json({ success: true, ...(await groupDetail(agencyOf(req), fresh)) });
}));

router.put("/tg-groups/:groupId/permissions", route(async (req, res) => {
  const { group, integration } = await withGroup(req, res);
  if (!group) return undefined;
  return res.json({ success: true, permissions: await setGroupPermissions(integration, group, req.body?.permissions || {}) });
}));

router.get("/tg-groups/:groupId/members", route(async (req, res) => {
  const { group } = await withGroup(req, res);
  if (!group) return undefined;
  const { q, filter, page, pageSize } = req.query;
  return res.json({ success: true, ...(await listMembers(group, { q: String(q || "").slice(0, 80), filter, page, pageSize })) });
}));

router.post("/tg-groups/:groupId/members/:memberId/action", route(async (req, res) => {
  const { group, integration } = await withGroup(req, res);
  if (!group) return undefined;
  const { action, minutes, reason } = req.body || {};
  const member = await memberAction(integration, group, req.params.memberId, action, { minutes, reason, actorName: req.user?.name });
  return res.json({ success: true, member });
}));

router.get("/tg-groups/:groupId/join-requests", route(async (req, res) => {
  const { group } = await withGroup(req, res);
  if (!group) return undefined;
  return res.json({ success: true, requests: await listJoinRequests(group, String(req.query.status || "PENDING").toUpperCase()) });
}));

router.post("/tg-groups/:groupId/join-requests", route(async (req, res) => {
  const { group, integration } = await withGroup(req, res);
  if (!group) return undefined;
  const result = await decideJoinRequests(integration, group, req.body?.ids, Boolean(req.body?.approve), req.user?.id);
  return res.json({ success: true, ...result });
}));

router.get("/tg-groups/:groupId/invite-links", route(async (req, res) => {
  const { group } = await withGroup(req, res);
  if (!group) return undefined;
  return res.json({ success: true, ...(await listInviteLinks(group)) });
}));

router.post("/tg-groups/:groupId/invite-links/primary", route(async (req, res) => {
  const { group, integration } = await withGroup(req, res);
  if (!group) return undefined;
  return res.json({ success: true, primary: await newPrimaryInviteLink(integration, group) });
}));

router.post("/tg-groups/:groupId/invite-links", route(async (req, res) => {
  const { group, integration } = await withGroup(req, res);
  if (!group) return undefined;
  return res.status(201).json({ success: true, link: await createInviteLink(integration, group, req.body || {}, req.user?.id) });
}));

router.delete("/tg-groups/:groupId/invite-links/:linkId", route(async (req, res) => {
  const { group, integration } = await withGroup(req, res);
  if (!group) return undefined;
  await revokeInviteLink(integration, group, req.params.linkId);
  return res.json({ success: true });
}));

router.get("/tg-groups/:groupId/posts", route(async (req, res) => {
  const { group } = await withGroup(req, res);
  if (!group) return undefined;
  return res.json({ success: true, posts: await listPosts(group) });
}));

router.post("/tg-groups/:groupId/posts", route(async (req, res) => {
  const { group } = await withGroup(req, res);
  if (!group) return undefined;
  return res.status(201).json({ success: true, post: await createPost(group, req.body || {}, req.user?.id) });
}));

router.delete("/tg-groups/:groupId/posts/:postId", route(async (req, res) => {
  const { group } = await withGroup(req, res);
  if (!group) return undefined;
  await cancelPost(group, req.params.postId);
  return res.json({ success: true });
}));

router.post("/tg-groups/:groupId/unpin-all", route(async (req, res) => {
  const { group, integration } = await withGroup(req, res);
  if (!group) return undefined;
  await unpinAll(integration, group);
  return res.json({ success: true });
}));

router.get("/tg-groups/:groupId/logs", route(async (req, res) => {
  const { group } = await withGroup(req, res);
  if (!group) return undefined;
  const { action, page, pageSize } = req.query;
  return res.json({ success: true, ...(await listLogs(group, { action: action || null, page, pageSize })) });
}));

router.post("/tg-groups/:groupId/leave", route(async (req, res) => {
  const { group, integration } = await withGroup(req, res);
  if (!group) return undefined;
  await leaveGroup(integration, group);
  return res.json({ success: true });
}));

router.delete("/tg-groups/:groupId", route(async (req, res) => {
  const { group } = await withGroup(req, res);
  if (!group) return undefined;
  await forgetGroup(group);
  return res.json({ success: true });
}));

export default router;
