/**
 * Shopify / WooCommerce store API client. Credentials are encrypted at rest
 * (utils/cryptoVault.js); nothing here ever returns them to a route.
 *
 * Shopify (Admin GraphQL API, version SHOPIFY_API_VERSION), two ways in:
 *   - ACCESS_TOKEN: an Admin API access token ("shpat_…") from a custom app
 *     the merchant created in their store admin. Never expires.
 *   - CLIENT_CREDENTIALS: the client id + secret of an app created in the
 *     Shopify Dev Dashboard in the merchant's own organization. Exchanged via
 *     the client credentials grant (POST /admin/oauth/access_token,
 *     grant_type=client_credentials) for a token valid 24h
 *     (expires_in 86399); getShopifyToken() refreshes it an hour early.
 *   Scopes the app needs: read_orders, write_orders (COD tag/cancel),
 *   read_products. Orders include customer name / phone / address, which
 *   Shopify treats as protected customer data: an app created in the store
 *   admin (ACCESS_TOKEN) has it automatically, but a Dev Dashboard app
 *   (CLIENT_CREDENTIALS) must request protected customer data access
 *   (Name, Email, Phone, Address) — until then every order query fails with
 *   "This app is not approved to access the Order object". Seen for real on
 *   a Dev Dashboard store; the UI turns that error into fix-it steps.
 *
 * WooCommerce (REST API v3): consumer key + secret with Read/Write
 * permission, sent as query params over HTTPS (works on hosts that strip the
 * Authorization header). Abandoned carts are the store's checkout-draft
 * (block checkout), pending and failed orders — WooCommerce core has no
 * separate cart API.
 *
 * Every function returns orders/carts in one normalised shape (see
 * normalizeShopifyOrder / normalizeWooOrder) so utils/commerceEvents.js never
 * branches on platform.
 */
import axios from "axios";
import dns from "dns/promises";
import net from "net";
import pool from "../db.js";
import { encryptSecret, decryptSecret } from "./cryptoVault.js";

export const SHOPIFY_API_VERSION = "2026-07";
const HTTP_TIMEOUT = 20000;
const MAX_PAGES = 5; // per poll; the cursor catches up on the next run

// ─── Input cleaning ─────────────────────────────────────────────────────────

/** "my-store", "my-store.myshopify.com" or a full admin URL → "my-store.myshopify.com" */
export function normalizeShopDomain(input) {
  let s = String(input || "").trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const adminMatch = String(input || "").match(/admin\.shopify\.com\/store\/([a-z0-9-]+)/i);
  if (adminMatch) s = adminMatch[1].toLowerCase();
  if (!s.includes(".")) s = `${s}.myshopify.com`;
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s)) {
    const err = new Error("Enter your store's myshopify subdomain, e.g. \"your-store\" (from your-store.myshopify.com).");
    err.status = 400;
    throw err;
  }
  return s;
}

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}

/**
 * The WooCommerce store URL is typed by the customer and the server then
 * calls it, so in production it must be HTTPS and must not resolve to a
 * private/loopback address (no reaching internal services through it).
 */
export async function normalizeWooUrl(input) {
  let raw = String(input || "").trim();
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url;
  try {
    url = new URL(raw);
  } catch {
    const err = new Error("Enter a valid store URL, e.g. https://example.com");
    err.status = 400;
    throw err;
  }
  const production = process.env.NODE_ENV === "production";
  if (production && url.protocol !== "https:") {
    const err = new Error("The store URL must use https://");
    err.status = 400;
    throw err;
  }
  if (production) {
    const addresses = await dns.lookup(url.hostname, { all: true }).catch(() => []);
    if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
      const err = new Error("That store URL can't be reached from our servers.");
      err.status = 400;
      throw err;
    }
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function describeHttpError(err, platform) {
  const status = err.response?.status;
  const data = err.response?.data;
  if (status === 401 || status === 403) {
    return platform === "SHOPIFY"
      ? "Shopify rejected the credentials (check the token / client id + secret and the app's scopes)."
      : "WooCommerce rejected the keys — check the consumer key/secret and that they have Read/Write permission.";
  }
  if (status === 404) return platform === "SHOPIFY" ? "Store not found — check the subdomain." : "WooCommerce REST API not found at that URL (is WooCommerce installed and permalinks enabled?).";
  const msg = data?.errors ? (typeof data.errors === "string" ? data.errors : JSON.stringify(data.errors)) : data?.message || data?.error_description || data?.error || err.message;
  return String(msg).slice(0, 400);
}

export function readCredentials(connection) {
  return JSON.parse(decryptSecret(connection.credentials) || "{}");
}

// ─── Shopify auth ───────────────────────────────────────────────────────────

async function requestClientCredentialsToken(shopDomain, clientId, clientSecret) {
  try {
    const res = await axios.post(
      `https://${shopDomain}/admin/oauth/access_token`,
      new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: HTTP_TIMEOUT }
    );
    if (!res.data?.access_token) throw new Error("Shopify returned no access token");
    const expiresIn = Number(res.data.expires_in || 86399);
    return { accessToken: res.data.access_token, expiresAt: new Date(Date.now() + expiresIn * 1000), scope: res.data.scope || "" };
  } catch (err) {
    if (err.response?.status === 400 || err.response?.status === 401) {
      const e = new Error("Shopify rejected the client id / secret. The app must be created in the Dev Dashboard of the same Shopify organization as the store, and installed on it.");
      e.status = 400;
      throw e;
    }
    throw new Error(describeHttpError(err, "SHOPIFY"));
  }
}

/** A usable Admin API token for this connection (refreshing a client-credentials token when due). */
export async function getShopifyToken(connection) {
  const creds = readCredentials(connection);
  if (connection.auth_mode !== "CLIENT_CREDENTIALS") return creds.accessToken;
  const expiresAt = connection.access_token_expires_at ? new Date(connection.access_token_expires_at) : null;
  if (creds.accessToken && expiresAt && expiresAt.getTime() - Date.now() > 60 * 60 * 1000) return creds.accessToken;

  const fresh = await requestClientCredentialsToken(connection.store_domain, creds.clientId, creds.clientSecret);
  const updated = { ...creds, accessToken: fresh.accessToken };
  await pool.query("UPDATE commerce_connections SET credentials = ?, access_token_expires_at = ? WHERE id = ?", [encryptSecret(updated), fresh.expiresAt, connection.id]);
  connection.credentials = encryptSecret(updated);
  connection.access_token_expires_at = fresh.expiresAt;
  return fresh.accessToken;
}

async function shopifyGraphql(shopDomain, token, query, variables = {}) {
  let res;
  try {
    res = await axios.post(
      `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      { query, variables },
      { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, timeout: HTTP_TIMEOUT }
    );
  } catch (err) {
    throw new Error(describeHttpError(err, "SHOPIFY"));
  }
  const { data, errors } = res.data || {};
  if (!data) throw new Error(errors?.map((e) => e.message).join("; ") || "Empty response from Shopify");
  if (errors?.length) console.warn(`[Commerce] Shopify partial errors on ${shopDomain}:`, errors.map((e) => e.message).join("; "));
  return data;
}

async function shopifyQuery(connection, query, variables) {
  const token = await getShopifyToken(connection);
  return shopifyGraphql(connection.store_domain, token, query, variables);
}

/**
 * Checks Shopify credentials before saving. Returns the encrypted-ready
 * credentials plus the shop's name and currency.
 */
export async function verifyShopify({ storeDomain, accessToken, clientId, clientSecret }) {
  const shopDomain = normalizeShopDomain(storeDomain);
  let token = accessToken?.trim();
  let expiresAt = null;
  let authMode = "ACCESS_TOKEN";
  if (!token) {
    if (!clientId?.trim() || !clientSecret?.trim()) {
      const err = new Error("Enter the Admin API access token, or the app's client id and client secret.");
      err.status = 400;
      throw err;
    }
    const fresh = await requestClientCredentialsToken(shopDomain, clientId.trim(), clientSecret.trim());
    token = fresh.accessToken;
    expiresAt = fresh.expiresAt;
    authMode = "CLIENT_CREDENTIALS";
  }
  let data;
  try {
    data = await shopifyGraphql(shopDomain, token, "{ shop { name currencyCode } }");
  } catch (err) {
    const e = new Error(err.message);
    e.status = 400;
    throw e;
  }
  const credentials = authMode === "ACCESS_TOKEN"
    ? { accessToken: token }
    : { clientId: clientId.trim(), clientSecret: clientSecret.trim(), accessToken: token };
  return { storeDomain: shopDomain, authMode, credentials, expiresAt, storeName: data.shop?.name || shopDomain, currency: data.shop?.currencyCode || null };
}

// ─── Shopify orders / checkouts ─────────────────────────────────────────────

const SHOPIFY_ORDER_FIELDS = `
  id legacyResourceId name createdAt updatedAt cancelledAt closed
  displayFinancialStatus displayFulfillmentStatus paymentGatewayNames statusPageUrl
  email phone
  totalPriceSet { shopMoney { amount currencyCode } }
  customer { firstName lastName phone }
  billingAddress { firstName lastName phone }
  shippingAddress { name phone address1 address2 city province zip country }
  lineItems(first: 20) { nodes { title quantity } }
  fulfillments(first: 5) { displayStatus trackingInfo(first: 1) { number url company } }
`;

const iso = (d) => new Date(d).toISOString().replace(/\.\d{3}Z$/, "Z");

function joinAddress(parts) {
  return parts.filter((p) => p && String(p).trim()).join(", ");
}

function itemsSummary(items) {
  return items.map((i) => `${i.title}${i.quantity > 1 ? ` x${i.quantity}` : ""}`).join(", ").slice(0, 900);
}

function normalizeShopifyOrder(o, shopDomain) {
  const items = (o.lineItems?.nodes || []).map((n) => ({ title: n.title, quantity: Number(n.quantity || 1) }));
  const fulfillments = o.fulfillments || [];
  const tracking = fulfillments.flatMap((f) => f.trackingInfo || [])[0] || null;
  const delivered = fulfillments.some((f) => f.displayStatus === "DELIVERED");
  const gateways = (o.paymentGatewayNames || []).join(", ");
  const fin = String(o.displayFinancialStatus || "").toUpperCase();
  const ful = String(o.displayFulfillmentStatus || "").toUpperCase();
  const name = [o.customer?.firstName || o.billingAddress?.firstName, o.customer?.lastName || o.billingAddress?.lastName].filter(Boolean).join(" ") || o.shippingAddress?.name || "";
  return {
    externalId: String(o.legacyResourceId || String(o.id).split("/").pop()),
    number: o.name || null,
    customerName: name,
    phone: o.phone || o.customer?.phone || o.shippingAddress?.phone || o.billingAddress?.phone || null,
    total: o.totalPriceSet?.shopMoney?.amount ?? null,
    currency: o.totalPriceSet?.shopMoney?.currencyCode || null,
    financialStatus: fin, // PAID, PENDING, AUTHORIZED, REFUNDED, PARTIALLY_REFUNDED, VOIDED...
    fulfillmentStatus: delivered ? "DELIVERED" : ful, // FULFILLED, UNFULFILLED, PARTIALLY_FULFILLED...
    status: o.cancelledAt ? "cancelled" : fin.toLowerCase(),
    isPaid: fin === "PAID",
    isShipped: ful === "FULFILLED" || ful === "PARTIALLY_FULFILLED" || delivered,
    isDelivered: delivered,
    isCancelled: Boolean(o.cancelledAt),
    isRefunded: fin === "REFUNDED" || fin === "PARTIALLY_REFUNDED",
    paymentMethod: gateways,
    isCod: /cash on delivery|\bcod\b|cash_on_delivery/i.test(gateways),
    orderUrl: o.statusPageUrl || `https://${shopDomain}`,
    items,
    shippingAddress: joinAddress([o.shippingAddress?.address1, o.shippingAddress?.address2, o.shippingAddress?.city, o.shippingAddress?.province, o.shippingAddress?.zip, o.shippingAddress?.country]),
    trackingNumber: tracking?.number || null,
    trackingUrl: tracking?.url || null,
    createdAt: o.createdAt ? new Date(o.createdAt) : null,
    updatedAt: o.updatedAt ? new Date(o.updatedAt) : null,
    raw: o,
  };
}

/** Orders updated after `since`, oldest first. */
export async function fetchShopifyOrders(connection, since) {
  const out = [];
  let after = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await shopifyQuery(
      connection,
      `query($q: String!, $after: String) {
        orders(first: 50, after: $after, sortKey: UPDATED_AT, query: $q) {
          nodes { ${SHOPIFY_ORDER_FIELDS} }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { q: `updated_at:>'${iso(since)}'`, after }
    );
    const conn = data.orders || { nodes: [], pageInfo: {} };
    out.push(...conn.nodes.map((o) => normalizeShopifyOrder(o, connection.store_domain)));
    if (!conn.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return out;
}

/** Abandoned checkouts updated after `since`, oldest first. */
export async function fetchShopifyCarts(connection, since) {
  const out = [];
  let after = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await shopifyQuery(
      connection,
      `query($q: String!, $after: String) {
        abandonedCheckouts(first: 50, after: $after, query: $q) {
          nodes {
            id name abandonedCheckoutUrl createdAt updatedAt completedAt
            customer { firstName lastName phone }
            billingAddress { firstName lastName phone }
            shippingAddress { name phone }
            totalPriceSet { shopMoney { amount currencyCode } }
            lineItems(first: 20) { nodes { title quantity } }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { q: `updated_at:>'${iso(since)}'`, after }
    );
    const conn = data.abandonedCheckouts || { nodes: [], pageInfo: {} };
    for (const c of conn.nodes) {
      const items = (c.lineItems?.nodes || []).map((n) => ({ title: n.title, quantity: Number(n.quantity || 1) }));
      out.push({
        externalId: String(c.id).split("/").pop(),
        customerName: [c.customer?.firstName || c.billingAddress?.firstName, c.customer?.lastName || c.billingAddress?.lastName].filter(Boolean).join(" ") || c.shippingAddress?.name || "",
        phone: c.customer?.phone || c.shippingAddress?.phone || c.billingAddress?.phone || null,
        total: c.totalPriceSet?.shopMoney?.amount ?? null,
        currency: c.totalPriceSet?.shopMoney?.currencyCode || null,
        items,
        recoveryUrl: c.abandonedCheckoutUrl || null,
        completed: Boolean(c.completedAt),
        createdAt: c.createdAt ? new Date(c.createdAt) : null,
        updatedAt: c.updatedAt ? new Date(c.updatedAt) : null,
        raw: c,
      });
    }
    if (!conn.pageInfo?.hasNextPage) break;
    after = conn.pageInfo.endCursor;
  }
  return out;
}

async function shopifyMutation(connection, query, variables, resultKey) {
  const data = await shopifyQuery(connection, query, variables);
  const result = data[resultKey] || {};
  const errors = [...(result.userErrors || []), ...(result.orderCancelUserErrors || [])];
  if (errors.length) throw new Error(errors.map((e) => e.message).join("; "));
  return result;
}

export async function shopifyAddOrderTags(connection, externalOrderId, tags) {
  return shopifyMutation(
    connection,
    "mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { field message } } }",
    { id: `gid://shopify/Order/${externalOrderId}`, tags },
    "tagsAdd"
  );
}

export async function shopifyCancelOrder(connection, externalOrderId, staffNote) {
  return shopifyMutation(
    connection,
    `mutation($orderId: ID!, $staffNote: String) {
      orderCancel(orderId: $orderId, reason: CUSTOMER, restock: true, notifyCustomer: false, staffNote: $staffNote) {
        job { id }
        orderCancelUserErrors { field message code }
      }
    }`,
    { orderId: `gid://shopify/Order/${externalOrderId}`, staffNote: String(staffNote || "").slice(0, 255) },
    "orderCancel"
  );
}

// ─── WooCommerce ────────────────────────────────────────────────────────────

function wooClient(storeUrl, creds) {
  return axios.create({
    baseURL: `${storeUrl}/wp-json/wc/v3`,
    params: { consumer_key: creds.consumerKey, consumer_secret: creds.consumerSecret },
    timeout: HTTP_TIMEOUT,
  });
}

async function wooCall(fn) {
  try {
    return await fn();
  } catch (err) {
    throw new Error(describeHttpError(err, "WOOCOMMERCE"));
  }
}

export async function verifyWooCommerce({ storeUrl, consumerKey, consumerSecret }) {
  const base = await normalizeWooUrl(storeUrl);
  if (!consumerKey?.trim() || !consumerSecret?.trim()) {
    const err = new Error("Consumer key and consumer secret are required.");
    err.status = 400;
    throw err;
  }
  const credentials = { consumerKey: consumerKey.trim(), consumerSecret: consumerSecret.trim() };
  const client = wooClient(base, credentials);
  try {
    const res = await client.get("/orders", { params: { per_page: 1 } });
    if (!Array.isArray(res.data)) throw new Error("That URL did not answer like a WooCommerce store.");
  } catch (err) {
    const e = new Error(err.response ? describeHttpError(err, "WOOCOMMERCE") : err.message);
    e.status = 400;
    throw e;
  }
  const currency = await client.get("/data/currencies/current").then((r) => r.data?.code || null).catch(() => null);
  const storeName = await axios.get(`${base}/wp-json/`, { timeout: 8000 }).then((r) => r.data?.name || null).catch(() => null);
  return { storeDomain: base, authMode: "WOO_KEYS", credentials, expiresAt: null, storeName: storeName || new URL(base).hostname, currency };
}

const WOO_CART_STATUSES = new Set(["checkout-draft", "pending", "failed"]);

function wooMeta(o, key) {
  return (o.meta_data || []).find((m) => m.key === key)?.value;
}

function normalizeWooOrder(o, storeUrl) {
  const items = (o.line_items || []).map((i) => ({ title: i.name, quantity: Number(i.quantity || 1) }));
  const status = String(o.status || "");
  // Tracking only exists with a plugin; the WooCommerce Shipment Tracking extension stores it here.
  const tracking = (wooMeta(o, "_wc_shipment_tracking_items") || [])[0] || null;
  const name = [o.billing?.first_name || o.shipping?.first_name, o.billing?.last_name || o.shipping?.last_name].filter(Boolean).join(" ");
  return {
    externalId: String(o.id),
    number: o.number ? `#${o.number}` : `#${o.id}`,
    customerName: name,
    phone: o.billing?.phone || o.shipping?.phone || null,
    total: o.total ?? null,
    currency: o.currency || null,
    financialStatus: o.date_paid ? "PAID" : status.toUpperCase(),
    fulfillmentStatus: status === "completed" ? "FULFILLED" : "UNFULFILLED",
    status,
    isPaid: Boolean(o.date_paid) && !["pending", "failed", "cancelled"].includes(status),
    isShipped: status === "completed",
    isDelivered: false,
    isCancelled: status === "cancelled",
    isRefunded: status === "refunded",
    paymentMethod: o.payment_method_title || o.payment_method || "",
    isCod: o.payment_method === "cod",
    isCart: WOO_CART_STATUSES.has(status),
    orderUrl: o.order_key ? `${storeUrl}/checkout/order-received/${o.id}/?key=${o.order_key}` : storeUrl,
    recoveryUrl: status === "checkout-draft" ? `${storeUrl}/checkout/` : o.payment_url || `${storeUrl}/checkout/`,
    items,
    shippingAddress: joinAddress([o.shipping?.address_1, o.shipping?.address_2, o.shipping?.city, o.shipping?.state, o.shipping?.postcode, o.shipping?.country]),
    trackingNumber: tracking?.tracking_number || null,
    trackingUrl: tracking?.custom_tracking_link || null,
    createdAt: o.date_created_gmt ? new Date(`${o.date_created_gmt}Z`) : null,
    updatedAt: o.date_modified_gmt ? new Date(`${o.date_modified_gmt}Z`) : null,
    raw: o,
  };
}

/**
 * Every order modified after `since` (any status, plus draft checkouts),
 * oldest first. Cart-like ones carry isCart = true.
 */
export async function fetchWooOrders(connection, since) {
  const creds = readCredentials(connection);
  const client = wooClient(connection.store_domain, creds);
  const out = [];
  const seen = new Set();
  // "any" does not include block-checkout drafts, so they are asked for separately.
  for (const status of ["any", "checkout-draft"]) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      let res;
      try {
        res = await client.get("/orders", {
          params: { status, modified_after: iso(since), dates_are_gmt: true, orderby: "modified", order: "asc", per_page: 50, page },
        });
      } catch (err) {
        // Stores without the block checkout reject the draft status — nothing to read then.
        if (status === "checkout-draft" && err.response?.status === 400) break;
        throw new Error(describeHttpError(err, "WOOCOMMERCE"));
      }
      for (const o of res.data || []) {
        if (seen.has(o.id)) continue;
        seen.add(o.id);
        out.push(normalizeWooOrder(o, connection.store_domain));
      }
      const totalPages = Number(res.headers?.["x-wp-totalpages"] || 1);
      if (page >= totalPages) break;
    }
  }
  return out.sort((a, b) => (a.updatedAt?.getTime() || 0) - (b.updatedAt?.getTime() || 0));
}

export async function wooAddOrderNote(connection, externalOrderId, note) {
  const client = wooClient(connection.store_domain, readCredentials(connection));
  return wooCall(() => client.post(`/orders/${externalOrderId}/notes`, { note, customer_note: false }));
}

export async function wooSetOrderStatus(connection, externalOrderId, status) {
  const client = wooClient(connection.store_domain, readCredentials(connection));
  return wooCall(() => client.put(`/orders/${externalOrderId}`, { status }));
}

// ─── Product catalog sync (kept from the first version) ─────────────────────

export async function syncConnection(connection) {
  if (connection.platform === "SHOPIFY") {
    const data = await shopifyQuery(
      connection,
      `{ products(first: 100, sortKey: UPDATED_AT, reverse: true) { nodes {
          legacyResourceId title handle onlineStoreUrl featuredMedia { preview { image { url } } }
          priceRangeV2 { minVariantPrice { amount currencyCode } }
      } } }`
    );
    const products = data.products?.nodes || [];
    for (const p of products) {
      await pool.query(
        `INSERT INTO commerce_products (connection_id, external_product_id, title, price, currency, image_url, product_url, raw_json, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE title = VALUES(title), price = VALUES(price), currency = VALUES(currency), image_url = VALUES(image_url),
           product_url = VALUES(product_url), raw_json = VALUES(raw_json), synced_at = NOW()`,
        [
          connection.id, String(p.legacyResourceId), p.title,
          p.priceRangeV2?.minVariantPrice?.amount ?? null, p.priceRangeV2?.minVariantPrice?.currencyCode || connection.currency,
          p.featuredMedia?.preview?.image?.url || null,
          p.onlineStoreUrl || `https://${connection.store_domain}/products/${p.handle}`,
          JSON.stringify(p),
        ]
      );
    }
    return { productsCount: products.length };
  }
  if (connection.platform === "WOOCOMMERCE") {
    const client = wooClient(connection.store_domain, readCredentials(connection));
    const res = await wooCall(() => client.get("/products", { params: { per_page: 100 } }));
    const products = res.data || [];
    for (const p of products) {
      await pool.query(
        `INSERT INTO commerce_products (connection_id, external_product_id, title, price, currency, image_url, product_url, raw_json, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE title = VALUES(title), price = VALUES(price), currency = VALUES(currency), image_url = VALUES(image_url),
           product_url = VALUES(product_url), raw_json = VALUES(raw_json), synced_at = NOW()`,
        [connection.id, String(p.id), p.name, p.price || null, connection.currency, p.images?.[0]?.src || null, p.permalink || null, JSON.stringify(p)]
      );
    }
    return { productsCount: products.length };
  }
  throw new Error(`Unknown commerce platform: ${connection.platform}`);
}

export { itemsSummary };
