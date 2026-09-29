import crypto from "crypto";
import pool from "../db.js";

/**
 * Growth tools: a trackable link (and its QR code) that opens a chat with one
 * bot account and starts one of that bot's flows. Everyone who comes through
 * it can also get a label.
 *
 * Shared link:  <BACKEND>/api/v1/go/<code>   — counts the click, then redirects to:
 *   Messenger   https://m.me/<PAGE_ID>?ref=gl_<code>      → webhook referral.ref
 *   Instagram   https://ig.me/m/<username>?ref=gl_<code>  → webhook referral.ref (source SHORTLINKS)
 *   Telegram    https://t.me/<bot>?start=gl_<code>        → "/start gl_<code>"
 *   WhatsApp    https://wa.me/<phone>?text=<text> (ref <code>) → the code in the first message
 * (WhatsApp links can't carry a hidden parameter, so the code rides in the
 * pre-filled text; a person who deletes it simply starts a normal chat.)
 *
 * The flow must belong to the same bot account (bot-scope rule).
 */
export const SUPPORTED_PLATFORMS = ["FACEBOOK", "INSTAGRAM", "TELEGRAM", "WHATSAPP"];
export const REF_PREFIX = "gl_";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
const CODE_LENGTH = 8;

export function newCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

const backendBase = () => (process.env.BACKEND_URL || process.env.PUBLIC_BACKEND_URL || "http://localhost:5000").replace(/\/+$/, "");

/** The public, trackable address to share / put in the QR code. */
export function shareUrl(code) {
  return `${backendBase()}/api/v1/go/${code}`;
}

export const DEFAULT_PREFILL = "Hi! I'd like to know more.";

/** The channel's own chat link for this growth link, or null if the bot account can't have one. */
export function chatUrl(link, integration) {
  const ref = `${REF_PREFIX}${link.code}`;
  switch (String(integration?.platform || "").toUpperCase()) {
    case "FACEBOOK":
      return integration.fb_page_id ? `https://m.me/${integration.fb_page_id}?ref=${ref}` : null;
    case "INSTAGRAM":
      return integration.ig_username ? `https://ig.me/m/${encodeURIComponent(integration.ig_username)}?ref=${ref}` : null;
    case "TELEGRAM":
      return integration.tg_bot_username ? `https://t.me/${integration.tg_bot_username}?start=${ref}` : null;
    case "WHATSAPP": {
      const phone = String(integration.wa_display_phone || "").replace(/\D/g, "");
      if (!phone) return null;
      const text = `${(link.prefill_text || DEFAULT_PREFILL).trim()} (ref ${link.code})`;
      return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    }
    default:
      return null;
  }
}

/**
 * The growth-link code a person arrived with, if any:
 *   metaRef   Messenger / Instagram referral.ref
 *   text      Telegram "/start gl_CODE", WhatsApp "... (ref CODE)"
 */
export function extractGrowthCode({ platform, text, metaRef }) {
  const fromRef = (v) => {
    const m = /^gl_([A-Z0-9]{6,16})$/i.exec(String(v || "").trim());
    return m ? m[1].toUpperCase() : null;
  };
  if (metaRef) return fromRef(metaRef);
  const t = String(text || "").trim();
  if (!t) return null;
  if (platform === "TELEGRAM") {
    const m = /^\/start(?:@\w+)?\s+(\S+)$/i.exec(t);
    return m ? fromRef(m[1]) : null;
  }
  if (platform === "WHATSAPP") {
    const m = /\(ref\s+([A-Z0-9]{6,16})\)\s*$/i.exec(t);
    return m ? m[1].toUpperCase() : null;
  }
  return null;
}

/** Messenger / Instagram: the link's ref from a message, postback or referral event (not an ad's). */
export function extractMetaLinkRef(event) {
  const r = event?.referral || event?.postback?.referral || event?.message?.referral;
  if (!r?.ref) return null;
  if (String(r.source || "").toUpperCase() === "ADS" || r.ad_id) return null;
  return String(r.ref).startsWith(REF_PREFIX) ? String(r.ref) : null;
}

/**
 * Someone arrived through a growth link: count it, add its label, start its
 * flow (unless a person is handling the chat). Returns true when the link's
 * flow was started (nothing else should answer this message).
 */
export async function handleGrowthLinkArrival({ agencyId, integration, platform, conversation, contact, code }) {
  if (!code) return false;
  const [[link]] = await pool.query(
    "SELECT * FROM growth_links WHERE code = ? AND agency_id = ? AND integration_id = ? AND is_active = 1",
    [code, agencyId, integration.id]
  );
  if (!link) return false;

  const isNew = contact?.created_at ? Date.now() - new Date(contact.created_at).getTime() < 5 * 60 * 1000 : false;
  await pool.query(
    "UPDATE growth_links SET starts = starts + 1, new_subscribers = new_subscribers + ? WHERE id = ?",
    [isNew ? 1 : 0, link.id]
  );
  if (link.label_id && contact?.id) {
    const [[label]] = await pool.query("SELECT id FROM labels WHERE id = ? AND agency_id = ?", [link.label_id, agencyId]);
    if (label) {
      // Same helper as the flow's Actions step (also re-syncs contacts.tags and updates the Inbox live).
      const { applyLabelToContact } = await import("../routes/labels.js");
      await applyLabelToContact(agencyId, contact.id, label.id);
    }
  }
  // No flow, or a person is handling the chat: counted and labelled only.
  if (!link.flow_id || conversation.bot_paused || contact.bot_paused) return false;

  // Bot scope: only a flow of this same bot account, still switched on.
  const [[flow]] = await pool.query(
    "SELECT * FROM flows WHERE id = ? AND agency_id = ? AND integration_id = ? AND is_active = 1",
    [link.flow_id, agencyId, integration.id]
  );
  if (!flow) return false;
  const { startFlowForConversation } = await import("./messengerProfile.js");
  return startFlowForConversation({ agencyId, flow, conversation, contact, integration, platform });
}

/** Redirect target for /go/<code>, counting the click. Null if unknown / off / not linkable. */
export async function resolveClick(code) {
  const clean = String(code || "").toUpperCase();
  if (!/^[A-Z0-9]{6,16}$/.test(clean)) return null;
  const [[link]] = await pool.query(
    `SELECT gl.*, i.platform, i.fb_page_id, i.ig_username, i.wa_display_phone, tb.bot_username AS tg_bot_username
       FROM growth_links gl
       JOIN integrations i ON i.id = gl.integration_id AND i.agency_id = gl.agency_id AND i.is_active = 1
       LEFT JOIN telegram_bots tb ON tb.integration_id = i.id
      WHERE gl.code = ? AND gl.is_active = 1`,
    [clean]
  );
  if (!link) return null;
  const url = chatUrl(link, link);
  if (!url) return null;
  await pool.query("UPDATE growth_links SET clicks = clicks + 1, last_click_at = NOW() WHERE id = ?", [link.id]);
  return url;
}
