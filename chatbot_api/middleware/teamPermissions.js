/**
 * Team Rules enforcement — makes the per-feature Create / Update / Delete /
 * Special matrix (Roles page, chatbot_ui/src/Pages/Roles/teamRulesConfig.js)
 * actually bind. Before this, the matrix was saved but no route checked it,
 * so a "Live Chat User" could e.g. delete flows by calling the API directly.
 *
 * Mounted once in index.js right after tenantContext. Applies ONLY to team
 * members (users.role = 'USER', read from the database by tenantContext):
 * workspace owners (RESELLER) and platform staff (ADMIN) always have full
 * access to their own workspace. Reads (GET) are never gated here — only
 * writes. A team member without an active membership has no role and
 * therefore no rights.
 *
 * RULES: first match wins; a write that matches no rule passes (its route's
 * own role checks still apply). Paths are relative to /api/v1.
 * Adding a feature's routes? Add rules here, and make sure every key exists
 * in `permissions` (migrate_team_rules_matrix.js / teamRulesConfig.js).
 */
import { getMemberPermissionKeys } from "./permissionMiddleware.js";

const ID = "[^/]+";
// [methods, path regex, permission key]. "*" = any write method.
// For a feature where the plain method mapping fits, `crud()` expands to
// POST → .create, PUT/PATCH → .update, DELETE → .delete.
const crud = (prefix, feature) => [
  ["POST", new RegExp(`^${prefix}(/|$)`), `${feature}.create`],
  ["PUT|PATCH", new RegExp(`^${prefix}(/|$)`), `${feature}.update`],
  ["DELETE", new RegExp(`^${prefix}(/|$)`), `${feature}.delete`],
];

const RULES = [
  // ── Channels & Accounts ── (Google Sheets first: it lives under /integrations)
  ["DELETE", /^\/integrations\/google-sheets$/, "google_sheets.delete"],
  ["POST", /^\/channels\/webchat$/, "webchat_bot.create"],
  ["PUT|PATCH", /^\/channels\/webchat\//, "webchat_bot.update"],
  ["DELETE", /^\/channels\/webchat\//, "webchat_bot.delete"],
  ["POST", new RegExp(`^/channels/facebook/${ID}/send-utility$`), "live_chat.update"],
  ["POST", new RegExp(`^/channels/whatsapp/${ID}/(sync|register)$`), "connect_account.special"],
  ["POST", /^\/channels\/(whatsapp\/discover-accounts|facebook\/(sync-subscriptions|import-pages)|instagram\/(sync-from-facebook|import-accounts))$/, "connect_account.special"],
  ["DELETE", /^\/(channels|integrations)\//, "connect_account.delete"],
  ["*", /^\/(channels|integrations)(\/|$)/, "connect_account.update"],

  // ── Contacts & CRM ──
  ["POST", /^\/contacts\/(import|bulk-delete|bulk-sequence|bulk-list-add|bulk-list-remove|bulk-labels|sync-avatars)$/, "subscribers.special"],
  ["POST", /^\/contacts$/, "subscribers.create"],
  ["DELETE", new RegExp(`^/contacts/${ID}$`), "subscribers.delete"],
  ["*", /^\/contacts\//, "subscribers.update"], // edit, tags, notes, labels, custom-field values, block, toggle-bot
  ...crud("/contact-lists", "subscribers"),

  // ── Inbox & Messaging ──
  ["*", /^\/canned-responses(\/|$)/, "live_chat.advanced"],
  ["*", new RegExp(`^/conversations/${ID}/(translate|messages/${ID}/translate)$`), "live_chat.translator"],
  ["DELETE", new RegExp(`^/conversations/${ID}/messages$`), "live_chat.delete"],
  ["POST", new RegExp(`^/conversations/${ID}/messages$`), "live_chat.update"],
  ["*", new RegExp(`^/conversations/(bulk-assign|${ID}/(assign|join|leave|toggle-bot|reset-flow|trigger-flow))$`), "live_chat.special"],
  ["POST", new RegExp(`^/conversations/${ID}/unsubscribe$`), "subscribers.update"],
  ["*", new RegExp(`^/conversations/(bulk-status|${ID}/(status|important|archive))$`), "live_chat.update"],
  // read/unread markers are personal and stay open.

  // ── Automations ──
  ["POST", new RegExp(`^/flows/${ID}/clone$`), "bot_manager.special"],
  ...crud("/flows", "bot_manager"),
  ["POST", /^\/bots\/errors\/test$/, "bot_manager.special"],
  ["DELETE", /^\/bots\/errors(\/|$)/, "bot_manager.update"],
  ["POST", new RegExp(`^/bots/${ID}/rules$`), "bot_manager.update"],
  ["DELETE", new RegExp(`^/bots/${ID}/rules/`), "bot_manager.update"],
  ...crud("/bots", "bot_manager"),
  ...crud("/user-input-flows", "bot_manager"),
  ["POST", /^\/comments\/(link-user-token|post-comment|reply-comment|like-comment|hide-comment)$/, "comment_automation.special"],
  ["DELETE", /^\/comments\/delete-comment\//, "comment_automation.delete"],
  ...crud("/comments/campaigns", "comment_automation"),

  // ── Marketing ──
  ["POST", /^\/broadcasts\/audience-preview$/, null], // read-only preview
  ["POST", new RegExp(`^/broadcasts/(start-with-flow|${ID}/(send|schedule))$`), "broadcast.special"],
  ["POST", new RegExp(`^/broadcasts/${ID}/cancel$`), "broadcast.update"],
  ...crud("/broadcasts", "broadcast"),
  ["POST", /^\/social-posts\/publish$/, "social_posting.special"],
  ["POST", /^\/social-posts\/schedule$/, "social_posting.create"],
  ...crud("/social-posts", "social_posting"),

  // ── WhatsApp Suite ──
  ["POST", /^\/appointments\/book-public$/, null], // public booking portal
  ...crud("/appointments", "wa_appointment"),
  ...crud("/appointment-services", "wa_appointment"),
  ...crud("/appointment-campaigns", "wa_appointment"),
  ["POST", /^\/slots\/bulk-toggle$/, "wa_appointment.special"],
  ["POST", /^\/slots\/bulk-delete$/, "wa_appointment.special"],
  ["DELETE", /^\/slots\/purge-past$/, "wa_appointment.special"],
  ...crud("/slots", "wa_appointment"),
  ["POST", new RegExp(`^/calls/permission/${ID}/request$`), "wa_calling.special"],
  ["POST", /^\/calls\//, "wa_calling.create"],
  ...crud("/whatsapp-flow-refs", "wa_flows"),
  ["POST", new RegExp(`^/commerce/connections/${ID}/(poll|sync)$`), "wa_shopify_integration.special"],
  ...crud("/commerce/connections", "wa_shopify_integration"),
  ...crud("/commerce/campaigns", "wa_shopify_integration"),

  // ── Integrations & APIs ──
  ["POST", new RegExp(`^/http-api-campaigns/${ID}/test$`), "integration_http_api.special"],
  ...crud("/http-api-campaigns", "integration_http_api"),

  // ── AI ──
  ["POST", new RegExp(`^/ai/agents/${ID}/test-chat$`), "ai_agent.special"],
  ["POST", new RegExp(`^/ai/agents/${ID}/knowledge/${ID}/reindex$`), "ai_agent.special"],
  ["*", new RegExp(`^/ai/agents/${ID}/(knowledge|routing|actions)(/|$)`), "ai_agent.update"],
  ...crud("/ai/agents", "ai_agent"),
  ["*", /^\/ai\/reply-settings\//, "ai_agent.update"],
  ["POST", /^\/ai\/rewrite-message$/, "ai_assistant.special"],
];

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** The permission key a write needs, `null` when the route is explicitly open, `undefined` when no rule matches. */
export function requiredTeamPermission(method, path) {
  for (const [methods, re, key] of RULES) {
    if (methods !== "*" && !methods.split("|").includes(method)) continue;
    if (re.test(path)) return key;
  }
  return undefined;
}

export async function teamPermissions(req, res, next) {
  try {
    if (!WRITE_METHODS.has(req.method)) return next();
    if (!req.tenant || req.tenant.role !== "USER") return next();
    const key = requiredTeamPermission(req.method, req.path);
    if (!key) return next();
    const keys = await getMemberPermissionKeys(req.tenant.userId, req.tenant.agencyId);
    if (keys?.has(key)) return next();
    return res.status(403).json({
      success: false,
      code: "TEAM_PERMISSION_DENIED",
      permission: key,
      message: "Your team role doesn't allow this action. Ask the workspace owner to update your role.",
    });
  } catch (err) {
    console.error("teamPermissions error:", err);
    return res.status(500).json({ success: false, message: "Authorization check failed" });
  }
}
