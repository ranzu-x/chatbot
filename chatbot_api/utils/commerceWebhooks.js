import crypto from "crypto";
import pool from "../db.js";
import { encryptSecret, decryptSecret } from "./cryptoVault.js";
import { readCredentials, shopifyQuery, wooClient } from "./commerceService.js";

/**
 * Instant store updates. Polling (utils/commerceEvents.js, every 60s) stays
 * the source of truth; a store webhook only means "something changed — poll
 * this store now", so a lost or duplicated webhook can never lose or repeat
 * an event (the poll cursor + UNIQUE(campaign_id, event_key) still decide).
 *
 * - Shopify: only for Dev Dashboard (client id + secret) connections — the
 *   webhook is signed with that app's client secret. Admin-created (shpat_)
 *   apps sign with an API secret we never receive, so they stay on polling.
 * - WooCommerce: webhooks created through the REST API with a secret we
 *   generate (stored encrypted); signed as X-WC-Webhook-Signature.
 * Needs a public HTTPS backend (BACKEND_URL); on localhost nothing is registered.
 */
const SHOPIFY_TOPICS = ["ORDERS_CREATE", "ORDERS_UPDATED", "CHECKOUTS_CREATE", "CHECKOUTS_UPDATE"];
const WOO_TOPICS = ["order.created", "order.updated"];

export function publicBackendBase() {
  const base = (process.env.BACKEND_URL || process.env.PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(base) || /localhost|127\.0\.0\.1/i.test(base)) return null;
  return base;
}

export function storeWebhookUrl(connection) {
  const base = publicBackendBase();
  return base ? `${base}/api/v1/store-webhooks/${connection.id}` : null;
}

/** Can this connection get signed webhooks at all? Returns null or a reason it can't. */
export function webhookBlocker(connection) {
  if (!publicBackendBase()) return "Instant updates need the app to be served on a public HTTPS address (BACKEND_URL). Orders are still checked every minute.";
  if (connection.platform === "SHOPIFY" && connection.auth_mode !== "CLIENT_CREDENTIALS") {
    return "Instant updates need a Shopify Dev Dashboard app (client id + secret); stores connected with an admin token are checked every minute.";
  }
  return null;
}

async function saveState(connectionId, patch) {
  const cols = Object.keys(patch);
  await pool.query(
    `UPDATE commerce_connections SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`,
    [...cols.map((c) => patch[c]), connectionId]
  );
}

export async function registerStoreWebhooks(connection) {
  const blocker = webhookBlocker(connection);
  if (blocker) {
    await saveState(connection.id, { webhook_status: "UNAVAILABLE", webhook_error: blocker });
    return { ok: false, error: blocker };
  }
  await removeStoreWebhooks(connection).catch(() => {});
  const url = storeWebhookUrl(connection);
  const ids = [];
  try {
    if (connection.platform === "SHOPIFY") {
      for (const topic of SHOPIFY_TOPICS) {
        const data = await shopifyQuery(
          connection,
          `mutation($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
             webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) { webhookSubscription { id } userErrors { field message } }
           }`,
          { topic, sub: { uri: url, format: "JSON" } }
        );
        const r = data.webhookSubscriptionCreate || {};
        if (r.userErrors?.length) throw new Error(`${topic}: ${r.userErrors.map((e) => e.message).join("; ")}`);
        if (r.webhookSubscription?.id) ids.push(r.webhookSubscription.id);
      }
      await saveState(connection.id, { webhook_status: "ACTIVE", webhook_ids: JSON.stringify(ids), webhook_error: null });
    } else {
      const secret = crypto.randomBytes(24).toString("hex");
      const client = wooClient(connection.store_domain, readCredentials(connection));
      for (const topic of WOO_TOPICS) {
        const res = await client.post("/webhooks", { name: `Chatbot ${topic}`, topic, delivery_url: url, secret, status: "active" });
        if (res.data?.id) ids.push(res.data.id);
      }
      await saveState(connection.id, { webhook_status: "ACTIVE", webhook_ids: JSON.stringify(ids), webhook_secret: encryptSecret(secret), webhook_error: null });
    }
    return { ok: true, count: ids.length };
  } catch (err) {
    const msg = String(err.response?.data?.message || err.message).slice(0, 500);
    await saveState(connection.id, { webhook_status: "FAILED", webhook_ids: JSON.stringify(ids), webhook_error: msg });
    return { ok: false, error: msg };
  }
}

export async function removeStoreWebhooks(connection) {
  let ids = [];
  try { ids = JSON.parse(connection.webhook_ids || "[]") || []; } catch { ids = []; }
  for (const id of ids) {
    try {
      if (connection.platform === "SHOPIFY") {
        await shopifyQuery(connection, "mutation($id: ID!) { webhookSubscriptionDelete(id: $id) { userErrors { message } } }", { id });
      } else {
        await wooClient(connection.store_domain, readCredentials(connection)).delete(`/webhooks/${id}`, { params: { force: true } });
      }
    } catch (err) {
      console.warn(`[Commerce webhooks] could not remove ${id} from store #${connection.id}:`, err.message);
    }
  }
  await saveState(connection.id, { webhook_status: "NONE", webhook_ids: null, webhook_secret: null, webhook_error: null });
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ""));
  const y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

/** True when the request really comes from this store. */
export function verifyStoreWebhook(connection, headers, rawBody) {
  if (!rawBody) return false;
  let secret = null;
  let given = null;
  if (connection.platform === "SHOPIFY") {
    if (connection.auth_mode !== "CLIENT_CREDENTIALS") return false;
    secret = readCredentials(connection).clientSecret;
    given = headers["x-shopify-hmac-sha256"];
  } else {
    secret = connection.webhook_secret ? decryptSecret(connection.webhook_secret) : null;
    given = headers["x-wc-webhook-signature"];
  }
  if (!secret || !given) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("base64");
  return safeEqual(expected, given);
}

// Several webhooks for one store in a burst → one poll.
const pending = new Map();
export function schedulePoll(connectionId, pollFn, delayMs = 3000) {
  if (pending.has(connectionId)) return;
  pending.set(connectionId, setTimeout(async () => {
    pending.delete(connectionId);
    try {
      await pollFn();
    } catch (err) {
      console.error(`[Commerce webhooks] instant poll of store #${connectionId} failed:`, err.message);
    }
  }, delayMs));
}
