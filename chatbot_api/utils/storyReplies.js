import pool from "../db.js";
import { runAction } from "./messengerProfile.js";

/**
 * Instagram / Facebook message extras:
 *  - `parseMetaMessage`: readable Inbox text for shared posts / reels
 *    (Post and Reel shares are now in the Messenger webhook: type share,
 *    ig_post, ig_reel, reel with url / title), story mentions (attachment
 *    type story_mention) and story replies (message.reply_to.story).
 *  - story automation (Bot Manager → Engagement → Story Mentions Reply):
 *    an action (flow of the same bot account, or a reply) when someone
 *    mentions the account in their story or replies to one of its stories,
 *    at most once per person per `story_cooldown_hours` (story_reply_log).
 */

const SHARE_TYPES = new Set(["share", "ig_post", "ig_reel", "reel", "post"]);

/** Pure: { msgType, msgBody, mediaUrl, storyEvent: 'MENTION' | 'REPLY' | null, share } for a Meta `message`. */
export function parseMetaMessage(message) {
  const out = { msgType: "TEXT", msgBody: message?.quick_reply?.payload || message?.text || "", mediaUrl: null, storyEvent: null, share: null };
  const att = message?.attachments?.[0];
  if (att) {
    const type = String(att.type || "").toLowerCase();
    const url = att.payload?.url || null;
    if (type === "story_mention") {
      out.storyEvent = "MENTION";
      out.mediaUrl = url;
      out.msgBody = "📣 Mentioned you in their story";
    } else if (SHARE_TYPES.has(type)) {
      const label = type.includes("reel") ? "reel" : "post";
      const title = att.payload?.title || att.title || "";
      out.share = { type, url, title, id: att.payload?.reel_video_id || att.payload?.id || null };
      out.msgBody = `🔗 Shared a ${label}${title ? `: ${title}` : ""}${url ? `\n${url}` : ""}${message?.text ? `\n${message.text}` : ""}`;
    } else {
      const upper = type.toUpperCase();
      out.msgType = upper === "VIDEO" ? "VIDEO" : upper === "AUDIO" ? "AUDIO" : upper === "FILE" ? "DOCUMENT" : "IMAGE";
      out.mediaUrl = url;
    }
  }
  const story = message?.reply_to?.story;
  if (story) {
    out.storyEvent = "REPLY";
    out.mediaUrl = out.mediaUrl || story.url || null;
    out.msgBody = `↩️ Replied to your story: ${out.msgBody || ""}`.trim();
  }
  return out;
}

export async function getStorySettings(integrationId) {
  const [[row]] = await pool.query(
    "SELECT story_mention_action, story_reply_action, story_cooldown_hours FROM messenger_profiles WHERE integration_id = ?",
    [integrationId]
  );
  const parse = (v) => { if (!v) return null; if (typeof v === "object") return v; try { return JSON.parse(v); } catch { return null; } };
  return {
    mentionAction: parse(row?.story_mention_action),
    replyAction: parse(row?.story_reply_action),
    cooldownHours: row?.story_cooldown_hours ?? 24,
  };
}

/** Runs the configured story action once per person per cooldown. Returns true when it answered. */
export async function handleStoryEvent({ agencyId, platform, integration, conversation, contact, kind }) {
  const s = await getStorySettings(integration.id);
  const action = kind === "MENTION" ? s.mentionAction : s.replyAction;
  if (!action) return false;
  if (s.cooldownHours > 0) {
    const [[recent]] = await pool.query(
      "SELECT id FROM story_reply_log WHERE integration_id = ? AND contact_id = ? AND kind = ? AND created_at > NOW() - INTERVAL ? HOUR LIMIT 1",
      [integration.id, contact.id, kind, s.cooldownHours]
    );
    if (recent) return false;
  }
  const ran = await runAction({ agencyId, platform, integration, conversation, contact, action });
  if (ran) await pool.query("INSERT INTO story_reply_log (integration_id, contact_id, kind) VALUES (?, ?, ?)", [integration.id, contact.id, kind]);
  return ran;
}
