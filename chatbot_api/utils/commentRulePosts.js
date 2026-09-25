import axios from "axios";
import pool from "../db.js";

/**
 * Comment Automation: which post a campaign runs on (comment_rule_posts —
 * see migrate_comment_rule_posts.js). Each post campaign has its own post
 * (reusing a campaign COPIES it — see copyCampaign); a post is in at most one
 * campaign per bot account. Page-wide campaigns (post_id = 'ALL_POSTS') and
 * saved campaigns (SAVED_CAMPAIGN) have no links.
 */

/**
 * post_id of a SAVED campaign: a reusable campaign kept in the account's list
 * that runs on no post (never matched by the webhook). "Use an existing
 * campaign" on a post copies a saved (or any other same-account) campaign
 * into a new campaign of that post — campaigns are never shared (decided
 * with the user).
 */
export const SAVED_CAMPAIGN = "SAVED_CAMPAIGN";

const COPY_COLUMNS = [
  "agency_id", "integration_id", "platform",
  "trigger_type", "trigger_keywords", "match_type", "exclude_keywords",
  "auto_reply_comment", "comment_variations", "auto_reply_media_url",
  "reply_mode", "ai_prompt_instruction", "ai_agent_id", "enable_like_comment",
  "auto_reply_private_message", "private_reply_buttons", "private_reply_mode", "flow_id",
  "offensive_keywords", "offensive_action", "offensive_reply_message", "reply_multiple_times",
];

/**
 * Copies campaign `sourceId` (all its reply / DM / moderation settings) into a
 * new, active campaign with its own name and post (a post id, or
 * SAVED_CAMPAIGN). Counters start at zero. For a post, its comment_rule_posts
 * link is created too. Returns the new campaign id.
 */
export async function copyCampaign(conn, sourceId, agencyId, { campaignName, postId, postData = null }) {
  const cols = COPY_COLUMNS.join(", ");
  const [ins] = await conn.query(
    `INSERT INTO comment_automation_rules (${cols}, campaign_name, post_id, post_data, is_active, created_at)
     SELECT ${cols}, ?, ?, ?, 1, NOW() FROM comment_automation_rules WHERE id = ? AND agency_id = ?`,
    [campaignName, postId, postData ? JSON.stringify(postData) : null, sourceId, agencyId]
  );
  if (!ins.affectedRows) return null;
  if (postId && postId !== SAVED_CAMPAIGN && postId !== "ALL_POSTS") {
    const [[row]] = await conn.query("SELECT integration_id FROM comment_automation_rules WHERE id = ?", [ins.insertId]);
    await conn.query(
      "INSERT INTO comment_rule_posts (agency_id, integration_id, rule_id, post_id, post_data) VALUES (?, ?, ?, ?, ?)",
      [agencyId, row.integration_id, ins.insertId, postId, postData ? JSON.stringify(postData) : null]
    );
  }
  return ins.insertId;
}

/**
 * Same post? Meta names a Facebook post "<pageId>_<postId>" in some places and
 * "<postId>" in others, so either form matches (the comparison the code used
 * before links existed). `loose` adds the substring match the comment webhook
 * has always used for Instagram/Facebook comment payloads.
 */
export function samePost(a, b, { loose = false } = {}) {
  if (!a || !b) return false;
  const x = String(a);
  const y = String(b);
  if (x === y || x.endsWith(`_${y}`) || y.endsWith(`_${x}`)) return true;
  return loose && (x.includes(y) || y.includes(x));
}

/**
 * Is this post really one of this bot account's own posts? A campaign's
 * replies are written for its own Page / Instagram account, so a post of any
 * other account must never be attached to it (decided with the user).
 * Facebook post ids are "<pageId>_<postId>"; otherwise (and for Instagram,
 * whose media ids carry no owner) Meta is asked who owns the post, using the
 * campaign account's own token. Any doubt (Meta error, no id) = not allowed.
 */
export async function postBelongsToAccount(integration, postId, apiVersion = process.env.META_API_VERSION || "v21.0") {
  if (!integration || !postId) return false;
  const id = String(postId);
  const isInstagram = String(integration.platform || "").toUpperCase() === "INSTAGRAM";
  if (!isInstagram) {
    if (!integration.fb_page_id) return false;
    if (id.includes("_")) return id.startsWith(`${integration.fb_page_id}_`);
  } else if (!integration.ig_account_id) {
    return false;
  }
  try {
    const res = await axios.get(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(id)}`, {
      params: { fields: isInstagram ? "id,owner{id}" : "id,from{id}", access_token: integration.access_token },
      timeout: 10000,
    });
    const ownerId = isInstagram ? res.data?.owner?.id : res.data?.from?.id;
    return Boolean(ownerId) && String(ownerId) === String(isInstagram ? integration.ig_account_id : integration.fb_page_id);
  } catch {
    return false;
  }
}

/** rule id -> [{ post_id, post_data }] for these campaigns. */
export async function loadRuleLinks(ruleIds, conn = pool) {
  const byRule = new Map();
  const ids = [...new Set((ruleIds || []).filter(Boolean))];
  if (!ids.length) return byRule;
  const [rows] = await conn.query(
    "SELECT rule_id, post_id, post_data FROM comment_rule_posts WHERE rule_id IN (?) ORDER BY id",
    [ids]
  );
  for (const r of rows) {
    if (!byRule.has(r.rule_id)) byRule.set(r.rule_id, []);
    byRule.get(r.rule_id).push({ post_id: r.post_id, post_data: r.post_data });
  }
  return byRule;
}

/** The post-specific campaign (from `rules`) running on this post, or null. */
export function findRuleForPost(rules, links, postId, { loose = false } = {}) {
  for (const rule of rules) {
    if (rule.post_id === "ALL_POSTS" || rule.post_id === SAVED_CAMPAIGN) continue;
    const posts = links.get(rule.id) || [];
    if (posts.some((p) => samePost(p.post_id, postId, { loose }))) return rule;
  }
  return null;
}
