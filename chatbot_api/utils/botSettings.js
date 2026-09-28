/**
 * Per-bot settings (Bot Manager → Bot Settings → General / Inbox tabs;
 * migrate_bot_settings.js). One `bot_settings` row per bot account; no row
 * means every value is at its default, which is exactly the behaviour from
 * before these settings existed.
 *
 *   chatHumanEmail            emailed when a subscriber taps Chat with Human
 *                             (utils/quickActions.js → notifyChatHumanEmail)
 *   uifSessionMinutes         a User Input Flow waiting for an answer expires
 *                             after this long (utils/flowEngine.js)
 *   chatHumanSessionMinutes   a subscriber's own Chat with Human keeps the bot
 *                             paused this long; null = the bot's "Automatic
 *                             resume after human takeover" setting
 */
import pool from "../db.js";
import { getTransporter, smtpFromAddress } from "./emailNotifications.js";

export const DEFAULT_UIF_SESSION_MINUTES = 24 * 60; // the old fixed 24 hours
export const LIMITS = {
  uifSessionMinutes: { min: 5, max: 7 * 24 * 60 },        // 5 minutes … 7 days
  chatHumanSessionMinutes: { min: 5, max: 30 * 24 * 60 }, // 5 minutes … 30 days
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isValidEmail = (v) => typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v.trim());

const CACHE_TTL_MS = 30_000;
const cache = new Map(); // integrationId -> { value, ts }

function toSettings(row) {
  return {
    chatHumanEmail: row?.chat_human_email || null,
    uifSessionMinutes: row?.uif_session_minutes ?? null,
    chatHumanSessionMinutes: row?.chat_human_session_minutes ?? null,
  };
}

/** Settings of one bot account (cached 30 s — read on every inbound message). */
export async function getBotSettings(integrationId) {
  if (!integrationId) return toSettings(null);
  const hit = cache.get(Number(integrationId));
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.value;
  const [[row]] = await pool.query("SELECT * FROM bot_settings WHERE integration_id = ?", [integrationId]);
  const value = toSettings(row);
  cache.set(Number(integrationId), { value, ts: Date.now() });
  return value;
}

export function invalidateBotSettings(integrationId) {
  if (integrationId) cache.delete(Number(integrationId));
  else cache.clear();
}

/**
 * Validates a (partial) update. Returns { values, errors } where values holds
 * only the fields that were sent; `null` / "" clears a field back to its default.
 */
export function cleanBotSettings(input = {}) {
  const values = {};
  const errors = [];
  if (input.chatHumanEmail !== undefined) {
    const email = String(input.chatHumanEmail ?? "").trim();
    if (email && !isValidEmail(email)) errors.push("Enter a valid email address for Chat with Human notifications.");
    else values.chat_human_email = email || null;
  }
  for (const [key, col] of [["uifSessionMinutes", "uif_session_minutes"], ["chatHumanSessionMinutes", "chat_human_session_minutes"]]) {
    if (input[key] === undefined) continue;
    if (input[key] === null || input[key] === "") { values[col] = null; continue; }
    const n = Number(input[key]);
    const { min, max } = LIMITS[key];
    if (!Number.isInteger(n) || n < min || n > max) {
      errors.push(`${key === "uifSessionMinutes" ? "User Input Flow session" : "Chat with Human session"} must be a whole number of minutes between ${min} and ${max}.`);
    } else {
      values[col] = n;
    }
  }
  return { values, errors };
}

export async function saveBotSettings(agencyId, integrationId, values) {
  const cols = Object.keys(values);
  if (cols.length) {
    await pool.query(
      `INSERT INTO bot_settings (integration_id, agency_id, ${cols.join(", ")})
       VALUES (?, ?, ${cols.map(() => "?").join(", ")})
       ON DUPLICATE KEY UPDATE ${cols.map((c) => `${c} = VALUES(${c})`).join(", ")}`,
      [integrationId, agencyId, ...cols.map((c) => values[c])]
    );
  }
  invalidateBotSettings(integrationId);
  return getBotSettings(integrationId);
}

/** Minutes a User Input Flow session may wait for the next answer. */
export async function uifSessionMinutes(integrationId) {
  const s = await getBotSettings(integrationId);
  return s.uifSessionMinutes || DEFAULT_UIF_SESSION_MINUTES;
}

const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * Chat with Human → email the bot's configured address. Best-effort: never
 * throws, never blocks the hand-over itself. Returns "sent" | "no_email" |
 * "not_configured" (SMTP) | "failed".
 */
export async function notifyChatHumanEmail({ agencyId, integration, conversation, contact }) {
  try {
    const integrationId = integration?.id || conversation?.integration_id;
    const { chatHumanEmail } = await getBotSettings(integrationId);
    if (!chatHumanEmail) return "no_email";
    const transporter = getTransporter();
    if (!transporter) {
      console.log(`[Chat with Human] would email ${chatHumanEmail} (SMTP not configured) — conversation ${conversation?.id}`);
      return "not_configured";
    }

    // The last few things the subscriber wrote, for context in the email.
    const [recent] = await pool.query(
      `SELECT body, created_at FROM messages
        WHERE conversation_id = ? AND direction = 'INBOUND' AND body IS NOT NULL AND body <> ''
        ORDER BY id DESC LIMIT 5`,
      [conversation.id]
    );
    const [[bot]] = await pool.query(
      "SELECT name, platform, fb_page_name, ig_username FROM integrations WHERE id = ? AND agency_id = ?",
      [integrationId, agencyId]
    );
    const botName = bot?.name || bot?.fb_page_name || bot?.ig_username || "your bot";
    const name = contact?.name || contact?.external_id || "A subscriber";
    const base = (process.env.FRONTEND_URL || "").replace(/\/$/, "");
    const inboxLink = base ? `${base}/inbox?conv=${conversation.id}` : null;

    const rows = [
      ["Subscriber", name],
      ["Channel", bot?.platform || conversation?.platform || ""],
      ["Bot account", botName],
      contact?.phone ? ["Phone", contact.phone] : null,
      contact?.email ? ["Email", contact.email] : null,
      ["Conversation", `#${conversation.id}`],
    ].filter(Boolean);

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:560px;color:#0f172a">
        <h2 style="font-size:18px;margin:0 0 8px">${escapeHtml(name)} wants to chat with a person</h2>
        <p style="font-size:14px;color:#475569;margin:0 0 16px">They tapped <b>Chat with Human</b> on ${escapeHtml(botName)}. The bot is paused on this chat until someone replies or it resumes automatically.</p>
        <table style="font-size:14px;border-collapse:collapse;margin-bottom:16px">
          ${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${escapeHtml(k)}</td><td style="padding:4px 0"><b>${escapeHtml(v)}</b></td></tr>`).join("")}
        </table>
        ${recent.length ? `<div style="font-size:13px;color:#64748b;margin-bottom:6px">Latest messages</div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:14px">
          ${recent.reverse().map((m) => `<div style="margin:4px 0">${escapeHtml(String(m.body).slice(0, 400))}</div>`).join("")}
        </div>` : ""}
        ${inboxLink ? `<p style="margin-top:18px"><a href="${escapeHtml(inboxLink)}" style="background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px">Open in Inbox</a></p>` : ""}
      </div>`;

    await transporter.sendMail({
      from: smtpFromAddress(),
      to: chatHumanEmail,
      subject: `Chat with Human: ${String(name).slice(0, 80)} is waiting`,
      html,
    });
    return "sent";
  } catch (err) {
    console.error("[Chat with Human] email failed:", err.message);
    return "failed";
  }
}
