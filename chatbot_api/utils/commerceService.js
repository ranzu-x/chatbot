/**
 * WhatsApp Shopify/WooCommerce integration — the actual store API calls.
 * Credentials are encrypted at rest (utils/cryptoVault.js), same discipline
 * as every other BYOK integration in this codebase.
 *
 * Shopify needs a registered Partner app (platform-level client_id/secret,
 * stored via the generic platform_settings key/value table under
 * 'shopify_app_credentials' — see getShopifyAppCredentials below) so an
 * agency can OAuth-install against their own store; WooCommerce has no
 * OAuth step, the store owner just generates REST API consumer key/secret
 * from their own wp-admin and pastes them in directly.
 *
 * HARD BLOCKER (flagged explicitly, per the approved plan): this session
 * has no real Shopify Partner Dashboard app or WooCommerce store to test
 * against. The code below follows each platform's documented OAuth/REST
 * shape as accurately as possible without live access — every place that
 * needs confirming against a real app/store is marked TODO. Endpoint URLs
 * and payload shapes here should be treated as "needs a real test pass",
 * not as verified.
 */
import axios from "axios";
import crypto from "crypto";
import pool from "../db.js";
import { encryptSecret, decryptSecret } from "./cryptoVault.js";

const SHOPIFY_API_VERSION = "2024-01"; // TODO: confirm current stable version at integration time
const SHOPIFY_SCOPES = "read_products,read_orders"; // TODO: confirm exact scopes needed once a real app is registered

// ─── Shopify Partner app credentials (platform-level, reused across every
// agency's OAuth install — same shape as usd_to_bdt_rate's storage) ──────────
export async function getShopifyAppCredentials() {
  const [[row]] = await pool.query("SELECT value FROM platform_settings WHERE setting_key = 'shopify_app_credentials'");
  if (!row) return null;
  const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
  if (!parsed?.clientId || !parsed?.clientSecretEncrypted) return null;
  return { clientId: parsed.clientId, clientSecret: decryptSecret(parsed.clientSecretEncrypted) };
}

export async function saveShopifyAppCredentials(clientId, clientSecret) {
  await pool.query(
    "INSERT INTO platform_settings (setting_key, value) VALUES ('shopify_app_credentials', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)",
    [JSON.stringify({ clientId, clientSecretEncrypted: encryptSecret(clientSecret) })]
  );
}

// ─── Shopify OAuth ────────────────────────────────────────────────────────────
export function buildShopifyAuthUrl({ shopDomain, clientId, redirectUri, state }) {
  const shop = shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const url = new URL(`https://${shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", SHOPIFY_SCOPES);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

// Shopify signs every OAuth callback's query params with the app's client
// secret — verifying this (not just trusting the redirect) is required by
// Shopify's own app-review guidelines. See:
// https://shopify.dev/docs/apps/auth/oauth/getting-started (TODO: re-check
// the exact param-serialization rule against current docs before going live).
export function verifyShopifyHmac(query, clientSecret) {
  const { hmac, signature, ...rest } = query;
  if (!hmac) return false;
  const message = Object.keys(rest).sort().map((k) => `${k}=${Array.isArray(rest[k]) ? rest[k].join(",") : rest[k]}`).join("&");
  const digest = crypto.createHmac("sha256", clientSecret).update(message).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(String(hmac), "hex"));
  } catch {
    return false;
  }
}

export async function exchangeShopifyCode({ shopDomain, code, clientId, clientSecret }) {
  const shop = shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const res = await axios.post(`https://${shop}/admin/oauth/access_token`, {
    client_id: clientId,
    client_secret: clientSecret,
    code,
  });
  return res.data?.access_token; // TODO: Shopify may also return a `scope` field worth storing/checking
}

// ─── Store product/order sync ────────────────────────────────────────────────
export async function syncShopifyStore(connection) {
  const creds = JSON.parse(decryptSecret(connection.credentials));
  const shop = connection.store_domain;

  const productsRes = await axios.get(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/products.json?limit=100`, {
    headers: { "X-Shopify-Access-Token": creds.accessToken },
  });
  const products = productsRes.data?.products || [];

  for (const p of products) {
    const variant = p.variants?.[0];
    await pool.query(
      `INSERT INTO commerce_products (connection_id, external_product_id, title, price, currency, image_url, product_url, raw_json, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE title = VALUES(title), price = VALUES(price), image_url = VALUES(image_url), raw_json = VALUES(raw_json), synced_at = NOW()`,
      [connection.id, String(p.id), p.title, variant?.price || null, "USD", p.image?.src || null, `https://${shop}/products/${p.handle}`, JSON.stringify(p)]
    );
  }

  return { productsCount: products.length };
}

export async function syncWooCommerceStore(connection) {
  const creds = JSON.parse(decryptSecret(connection.credentials));
  const base = connection.store_domain.replace(/\/$/, "");

  const productsRes = await axios.get(`${base}/wp-json/wc/v3/products`, {
    params: { per_page: 100, consumer_key: creds.consumerKey, consumer_secret: creds.consumerSecret },
  });
  const products = productsRes.data || [];

  for (const p of products) {
    await pool.query(
      `INSERT INTO commerce_products (connection_id, external_product_id, title, price, currency, image_url, product_url, raw_json, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE title = VALUES(title), price = VALUES(price), image_url = VALUES(image_url), raw_json = VALUES(raw_json), synced_at = NOW()`,
      [connection.id, String(p.id), p.name, p.price || null, "USD", p.images?.[0]?.src || null, p.permalink || null, JSON.stringify(p)]
    );
  }

  return { productsCount: products.length };
}

export async function syncConnection(connection) {
  if (connection.platform === "SHOPIFY") return syncShopifyStore(connection);
  if (connection.platform === "WOOCOMMERCE") return syncWooCommerceStore(connection);
  throw new Error(`Unknown commerce platform: ${connection.platform}`);
}

// Verifies WooCommerce credentials work before saving them for real — a
// lightweight GET that fails fast on bad keys/domain rather than only
// discovering it on the next scheduled sync.
export async function testWooCommerceConnection({ storeDomain, consumerKey, consumerSecret }) {
  const base = storeDomain.replace(/\/$/, "");
  const res = await axios.get(`${base}/wp-json/wc/v3/products`, {
    params: { per_page: 1, consumer_key: consumerKey, consumer_secret: consumerSecret },
  });
  return Array.isArray(res.data);
}
