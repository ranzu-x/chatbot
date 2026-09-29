/**
 * Browser push notifications for dashboard users (Web Push + VAPID).
 *
 * A person switches them on per browser (bell dropdown → "Desktop
 * notifications"); the browser's PushSubscription is stored in
 * push_subscriptions (migrate_web_push.js). A push goes out only when the
 * person has NO dashboard tab open on this server (utils/socket.js
 * hasOpenTab) — with a tab open they already get the in-app alert. The
 * service worker (chatbot_ui/public/push-sw.js) also skips showing it when a
 * dashboard window is visible, which covers several API instances.
 *
 * What is pushed:
 *   • every stored in-app notification (`user_notification`: @mentions, chat
 *     auto-assigned to you, Super Admin notices)
 *   • a follow-up reminder coming due (`follow_up_due`)
 *   • a new customer message in a chat assigned to you (notifyAssigneeOfInbound,
 *     at most one per chat every 2 minutes)
 *
 * VAPID keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (+ VAPID_SUBJECT) from the
 * env, else a pair generated once and kept in web_push_keys (private key
 * encrypted). Changing the keys makes every stored subscription invalid —
 * people just switch notifications on again.
 */
import crypto from "crypto";
import webpush from "web-push";
import pool from "../db.js";
import { encryptSecret, decryptSecret } from "./cryptoVault.js";
import { hasOpenTab } from "./socket.js";

let keysPromise = null;

async function loadKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const read = async () => {
    const [[row]] = await pool.query("SELECT public_key, private_key_enc FROM web_push_keys WHERE id = 1");
    return row ? { publicKey: row.public_key, privateKey: decryptSecret(row.private_key_enc) } : null;
  };
  const existing = await read();
  if (existing) return existing;
  const fresh = webpush.generateVAPIDKeys();
  // INSERT IGNORE + re-read: two instances starting together agree on one pair.
  await pool.query(
    "INSERT IGNORE INTO web_push_keys (id, public_key, private_key_enc) VALUES (1, ?, ?)",
    [fresh.publicKey, encryptSecret(fresh.privateKey)]
  );
  return read();
}

export function getVapidKeys() {
  if (!keysPromise) keysPromise = loadKeys().catch((err) => { keysPromise = null; throw err; });
  return keysPromise;
}

function vapidSubject() {
  const s = process.env.VAPID_SUBJECT || process.env.SMTP_FROM_EMAIL || "";
  if (/^(mailto:|https:)/.test(s)) return s;
  if (s.includes("@")) return `mailto:${s.replace(/^.*<|>.*$/g, "")}`;
  const front = process.env.FRONTEND_URL || "";
  return front.startsWith("https://") ? front : "mailto:admin@example.com";
}

const hashEndpoint = (endpoint) => crypto.createHash("sha256").update(endpoint).digest("hex");

/** Only real push-service URLs over https; the keys as the browser gives them. */
export function cleanSubscription(sub) {
  const endpoint = String(sub?.endpoint || "");
  const p256dh = String(sub?.keys?.p256dh || "");
  const auth = String(sub?.keys?.auth || "");
  if (!/^https:\/\/[^\s]+$/.test(endpoint) || endpoint.length > 1024) return null;
  if (!/^[A-Za-z0-9_-]{20,255}={0,2}$/.test(p256dh) || !/^[A-Za-z0-9_-]{8,255}={0,2}$/.test(auth)) return null;
  return { endpoint, p256dh, auth };
}

/** Stores (or moves to this user) one browser's subscription. */
export async function saveSubscription(userId, sub, userAgent) {
  const clean = cleanSubscription(sub);
  if (!clean) return false;
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent)`,
    [userId, clean.endpoint, hashEndpoint(clean.endpoint), clean.p256dh, clean.auth, String(userAgent || "").slice(0, 255) || null]
  );
  return true;
}

export async function removeSubscription(userId, endpoint) {
  const [r] = await pool.query("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint_hash = ?", [userId, hashEndpoint(String(endpoint || ""))]);
  return r.affectedRows > 0;
}

/**
 * Sends one notification to every browser of `userId`.
 * payload: { title, body, url (a /path in the dashboard), tag }
 * Skipped while the person has a dashboard tab open, unless `force`.
 * Never throws. Returns { sent, removed, skipped }.
 */
export async function sendPushToUser(userId, payload, { force = false } = {}) {
  const result = { sent: 0, removed: 0, skipped: false };
  try {
    if (!userId) return result;
    if (!force && hasOpenTab(userId)) { result.skipped = true; return result; }
    const [subs] = await pool.query("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?", [userId]);
    if (!subs.length) return result;
    const keys = await getVapidKeys();
    const url = typeof payload.url === "string" && payload.url.startsWith("/") && !payload.url.startsWith("//") ? payload.url : "/inbox";
    const body = JSON.stringify({
      title: String(payload.title || "New notification").slice(0, 120),
      body: String(payload.body || "").slice(0, 300),
      url,
      tag: payload.tag ? String(payload.tag).slice(0, 64) : undefined,
    });
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 3600, vapidDetails: { subject: vapidSubject(), publicKey: keys.publicKey, privateKey: keys.privateKey } }
        );
        result.sent++;
        pool.query("UPDATE push_subscriptions SET last_sent_at = NOW() WHERE id = ?", [s.id]).catch(() => {});
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await pool.query("DELETE FROM push_subscriptions WHERE id = ?", [s.id]).catch(() => {});
          result.removed++;
        } else {
          console.warn(`[WebPush] user ${userId}: ${err.statusCode || ""} ${err.body || err.message}`);
        }
      }
    }
  } catch (err) {
    console.warn("[WebPush] send failed:", err.message);
  }
  return result;
}

/** The socket events that also become a push (called from emitToUser). */
export function pushForEvent(userId, event, data) {
  if (event === "user_notification") {
    return sendPushToUser(userId, { title: data?.title, body: data?.body, url: data?.link || "/inbox", tag: "note" });
  }
  if (event === "follow_up_due") {
    return sendPushToUser(userId, {
      title: `Follow-up: ${data?.title || "reminder"}`,
      body: data?.contactName ? `With ${data.contactName}` : (data?.description || ""),
      url: data?.conversationId ? `/inbox?conv=${data.conversationId}` : "/inbox",
      tag: `followup-${data?.id || ""}`,
    });
  }
  return null;
}

// One push per chat per person every 2 minutes (a burst of messages = one alert).
const INBOUND_GAP_MS = 2 * 60 * 1000;
const lastInboundPush = new Map();

/** A customer wrote in a chat that is assigned to someone → push to them. */
export async function notifyAssigneeOfInbound(conversationId, message) {
  try {
    const [[row]] = await pool.query(
      `SELECT ap.user_id, c.name AS contactName
         FROM conversations cv
         JOIN agent_profiles ap ON ap.id = cv.assigned_to_id
         LEFT JOIN contacts c ON c.id = cv.contact_id
        WHERE cv.id = ?`,
      [conversationId]
    );
    if (!row?.user_id) return null;
    const key = `${row.user_id}:${conversationId}`;
    const now = Date.now();
    if (now - (lastInboundPush.get(key) || 0) < INBOUND_GAP_MS) return null;
    if (hasOpenTab(row.user_id)) return null;
    lastInboundPush.set(key, now);
    if (lastInboundPush.size > 5000) {
      for (const [k, t] of lastInboundPush) if (now - t > INBOUND_GAP_MS) lastInboundPush.delete(k);
    }
    const text = message?.type === "TEXT" || !message?.type ? String(message?.body || "") : `[${String(message.type).toLowerCase()}]`;
    return sendPushToUser(row.user_id, {
      title: row.contactName || "New message",
      body: text.slice(0, 200) || "New message",
      url: `/inbox?conv=${conversationId}`,
      tag: `conv-${conversationId}`,
    });
  } catch (err) {
    console.warn("[WebPush] inbound:", err.message);
    return null;
  }
}
