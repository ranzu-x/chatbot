/**
 * Caller verification for inbound webhooks that Meta's signature check
 * (utils/metaSignature.js) doesn't cover.
 *
 * Telegram: setWebhook is called with a `secret_token`; Telegram then sends it
 * back on every update in the X-Telegram-Bot-Api-Secret-Token header. The
 * secret is derived per bot (HMAC of the integration id + bot token under a
 * server key), so nothing extra is stored and a new bot token or server key
 * simply means a new secret — ensureTelegramWebhookSecrets() re-registers
 * every webhook bot at startup, which also upgrades bots registered before
 * secrets existed.
 *
 * TikTok: "Tiktok-Signature: t=<unix>,s=<hex>" where
 * s = HMAC-SHA256(client_secret, "<t>.<raw body>")
 * (https://developers.tiktok.com/doc/webhooks-verification).
 */
import crypto from "crypto";
import pool from "../db.js";

const serverKey = () => process.env.WEBHOOK_SECRET_KEY || process.env.JWT_SECRET;

/** Per-bot secret; Telegram allows 1–256 chars of A-Z a-z 0-9 _ - (base64url fits). */
export function telegramSecretFor(integrationId, botToken) {
  return crypto
    .createHmac("sha256", serverKey())
    .update(`telegram-webhook:${integrationId}:${botToken}`)
    .digest("base64url");
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

export function isValidTelegramSecret(header, integrationId, botToken) {
  if (!botToken) return false;
  return safeEqual(header, telegramSecretFor(integrationId, botToken));
}

export function telegramWebhookUrl(agencyId, integrationId) {
  const backendBase = (process.env.BACKEND_URL || process.env.PUBLIC_URL || "http://localhost:5000").replace(/\/+$/, "");
  return `${backendBase}/api/v1/webhook/telegram/${agencyId}/${integrationId}`;
}

/** Registers (or re-registers) the bot's webhook with its secret. Returns true on success. */
export async function registerTelegramWebhook({ agencyId, integrationId, botToken }) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: telegramWebhookUrl(agencyId, integrationId), secret_token: telegramSecretFor(integrationId, botToken) }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  return Boolean(data.ok);
}

/**
 * Startup: give every webhook-mode bot the current secret. Only meaningful on
 * a public HTTPS backend (elsewhere bots are polled, utils/telegramPoller.js).
 * A bot that can't be re-registered falls back to polling (webhook_set = 0)
 * instead of being left on a webhook that would now reject it.
 */
export async function ensureTelegramWebhookSecrets() {
  if (!String(process.env.BACKEND_URL || "").startsWith("https://")) return;
  try {
    const [bots] = await pool.query(
      `SELECT tb.id, tb.agency_id, tb.integration_id, tb.bot_token, tb.bot_username
       FROM telegram_bots tb JOIN integrations i ON i.id = tb.integration_id
       WHERE tb.is_active = 1 AND i.is_active = 1 AND tb.webhook_set = 1`
    );
    for (const bot of bots) {
      let ok = false;
      try {
        ok = await registerTelegramWebhook({ agencyId: bot.agency_id, integrationId: bot.integration_id, botToken: bot.bot_token });
      } catch (err) {
        console.warn(`[Telegram] re-registering webhook for @${bot.bot_username} failed:`, err.message);
      }
      if (!ok) await pool.query("UPDATE telegram_bots SET webhook_set = 0 WHERE id = ?", [bot.id]);
    }
    if (bots.length) console.log(`🔐 [Telegram] webhook secrets refreshed for ${bots.length} bot(s)`);
  } catch (err) {
    console.error("[Telegram] ensureTelegramWebhookSecrets failed:", err.message);
  }
}

/** TikTok webhook signature; rejects timestamps more than `toleranceSec` away (replays). */
export function isValidTikTokSignature(rawBody, header, clientSecret, toleranceSec = 300) {
  if (!rawBody || !header || !clientSecret) return false;
  const parts = Object.fromEntries(
    String(header).split(",").map((p) => p.trim().split("=")).filter((kv) => kv.length === 2)
  );
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", clientSecret).update(`${parts.t}.`).update(rawBody).digest("hex");
  return safeEqual(parts.s, expected);
}

/**
 * Inbound flow webhook (POST /webhooks/inbound/:flowId, routes/flowWebhooks.js):
 * a per-flow key derived like the Telegram secret — shown to the owner as
 * part of the URL, required on every call (?key= or X-Webhook-Key).
 */
export function inboundFlowKey(flowId) {
  return crypto.createHmac("sha256", serverKey()).update(`inbound-flow:${flowId}`).digest("base64url").slice(0, 32);
}

export function isValidInboundFlowKey(flowId, key) {
  return safeEqual(key, inboundFlowKey(flowId));
}
