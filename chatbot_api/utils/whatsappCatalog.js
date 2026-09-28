import axios from "axios";
import pool from "../db.js";
import { GRAPH_URL } from "./metaApi.js";

/**
 * WhatsApp catalog & product messages (Meta commerce catalog):
 *  - catalog connected to the WhatsApp Business Account
 *    (GET /<WABA_ID>/product_catalogs) + storefront switches
 *    (/<PHONE_NUMBER_ID>/whatsapp_commerce_settings: catalog visible, cart on)
 *  - sync: products of a connected Shopify / WooCommerce store
 *    (commerce_products) → the Meta catalog (Catalog Batch API items_batch,
 *    retailer id "<connectionId>_<productId>"). The token needs
 *    catalog_management; Meta's refusal is shown as is.
 *  - product messages: catalog message, single product, product list
 *    (up to 30 items in up to 10 sections) — `buildProductMessage`.
 *  - an inbound "order" message is summarised for the Inbox (`describeOrder`).
 */

const H = (integration) => ({ Authorization: `Bearer ${integration.access_token}`, "Content-Type": "application/json" });
export const metaError = (e) => e.response?.data?.error?.error_user_msg || e.response?.data?.error?.message || e.message;
const err400 = (m) => { const e = new Error(m); e.status = 400; return e; };

export async function getCatalogInfo(integration) {
  const [[link]] = await pool.query("SELECT * FROM whatsapp_catalog_links WHERE integration_id = ?", [integration.id]);
  let catalogs = [];
  let settings = null;
  let error = null;
  try {
    if (integration.wa_business_acc_id) {
      const { data } = await axios.get(`${GRAPH_URL}/${integration.wa_business_acc_id}/product_catalogs`, { params: { fields: "id,name,product_count" }, headers: H(integration) });
      catalogs = data?.data || [];
    }
    const { data: cs } = await axios.get(`${GRAPH_URL}/${integration.wa_phone_number_id}/whatsapp_commerce_settings`, { headers: H(integration) });
    settings = cs?.data?.[0] || null;
  } catch (e) {
    error = metaError(e);
  }
  const catalogId = link?.catalog_id || catalogs[0]?.id || null;
  return {
    catalogId,
    catalogs,
    catalogVisible: settings ? Boolean(settings.is_catalog_visible) : null,
    cartEnabled: settings ? Boolean(settings.is_cart_enabled) : null,
    connectionId: link?.connection_id || null,
    lastSyncAt: link?.last_sync_at || null,
    lastSyncCount: link?.last_sync_count ?? null,
    lastSyncError: link?.last_sync_error || null,
    error,
  };
}

export async function saveCatalogLink(integration, { catalogId, connectionId }) {
  await pool.query(
    `INSERT INTO whatsapp_catalog_links (integration_id, agency_id, catalog_id, connection_id) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE catalog_id = VALUES(catalog_id), connection_id = VALUES(connection_id)`,
    [integration.id, integration.agency_id, catalogId || null, connectionId || null]
  );
}

export async function setCommerceSettings(integration, { catalogVisible, cartEnabled }) {
  await axios.post(`${GRAPH_URL}/${integration.wa_phone_number_id}/whatsapp_commerce_settings`, null, {
    params: { is_catalog_visible: Boolean(catalogVisible), is_cart_enabled: Boolean(cartEnabled) },
    headers: H(integration),
  });
}

export async function listCatalogProducts(integration, catalogId, { after = null, q = "" } = {}) {
  if (!catalogId) throw err400("No catalog is connected to this WhatsApp account");
  const params = { fields: "retailer_id,name,price,currency,image_url,availability", limit: 50, ...(after ? { after } : {}) };
  if (q) params.filter = JSON.stringify({ name: { i_contains: q } });
  const { data } = await axios.get(`${GRAPH_URL}/${catalogId}/products`, { params, headers: H(integration) });
  return { products: (data?.data || []).map((p) => ({ retailerId: p.retailer_id, name: p.name, price: p.price, imageUrl: p.image_url, availability: p.availability })), after: data?.paging?.cursors?.after || null, hasMore: Boolean(data?.paging?.next) };
}

/** Pure: a store product → a Catalog Batch API item. */
export function toCatalogItem(product, connectionId) {
  const price = Number(product.price);
  return {
    method: "UPDATE",
    data: {
      id: `${connectionId}_${product.external_product_id}`,
      title: String(product.title || "Product").slice(0, 150),
      description: String(product.title || "Product").slice(0, 5000),
      availability: "in stock",
      condition: "new",
      price: `${Number.isFinite(price) ? price.toFixed(2) : "0.00"} ${String(product.currency || "USD").toUpperCase()}`,
      link: product.product_url || "https://example.com",
      image_link: product.image_url || undefined,
    },
  };
}

/** Pushes every synced store product into the Meta catalog (UPDATE with upsert). */
export async function syncStoreToCatalog(integration, catalogId, connectionId) {
  if (!catalogId) throw err400("Pick the Meta catalog first");
  const [[conn]] = await pool.query("SELECT id FROM commerce_connections WHERE id = ? AND agency_id = ?", [connectionId, integration.agency_id]);
  if (!conn) throw err400("Pick a connected store");
  const [products] = await pool.query("SELECT * FROM commerce_products WHERE connection_id = ?", [conn.id]);
  if (!products.length) throw err400("That store has no synced products yet — press Products on the store first");
  let sent = 0;
  let error = null;
  try {
    for (let i = 0; i < products.length; i += 1000) {
      const requests = products.slice(i, i + 1000).map((p) => toCatalogItem(p, conn.id));
      await axios.post(`${GRAPH_URL}/${catalogId}/items_batch`,
        { item_type: "PRODUCT_ITEM", allow_upsert: true, requests: JSON.stringify(requests) },
        { headers: H(integration) });
      sent += requests.length;
    }
  } catch (e) {
    error = metaError(e);
  }
  await pool.query(
    `INSERT INTO whatsapp_catalog_links (integration_id, agency_id, catalog_id, connection_id, last_sync_at, last_sync_count, last_sync_error)
     VALUES (?, ?, ?, ?, NOW(), ?, ?)
     ON DUPLICATE KEY UPDATE catalog_id = VALUES(catalog_id), connection_id = VALUES(connection_id), last_sync_at = NOW(),
       last_sync_count = VALUES(last_sync_count), last_sync_error = VALUES(last_sync_error)`,
    [integration.id, integration.agency_id, catalogId, conn.id, sent, error ? String(error).slice(0, 500) : null]
  );
  if (error) throw Object.assign(new Error(`Meta refused the products: ${error}`), { status: 400 });
  return { sent };
}

/**
 * Pure: the interactive message for kind "catalog" | "product" | "list".
 * list: sections [{ title, retailerIds }] (≤10 sections, ≤30 products).
 */
export function buildProductMessage({ kind, catalogId, retailerIds = [], sections = null, header = "", body = "", footer = "" }) {
  const text = String(body || "").trim();
  if (kind === "catalog") {
    return {
      type: "catalog_message",
      body: { text: text || "Browse our catalog" },
      action: { name: "catalog_message", ...(retailerIds[0] ? { parameters: { thumbnail_product_retailer_id: retailerIds[0] } } : {}) },
      ...(footer ? { footer: { text: footer } } : {}),
    };
  }
  if (!catalogId) throw err400("No catalog is connected to this WhatsApp account");
  if (kind === "product") {
    if (!retailerIds[0]) throw err400("Pick a product");
    return {
      type: "product",
      ...(text ? { body: { text } } : {}),
      ...(footer ? { footer: { text: footer } } : {}),
      action: { catalog_id: catalogId, product_retailer_id: retailerIds[0] },
    };
  }
  const secs = (sections && sections.length ? sections : [{ title: "Products", retailerIds }])
    .map((s) => ({ title: String(s.title || "Products").slice(0, 24), product_items: (s.retailerIds || []).map((id) => ({ product_retailer_id: id })) }))
    .filter((s) => s.product_items.length);
  const total = secs.reduce((n, s) => n + s.product_items.length, 0);
  if (!total) throw err400("Pick at least one product");
  if (total > 30 || secs.length > 10) throw err400("At most 30 products in up to 10 sections");
  return {
    type: "product_list",
    header: { type: "text", text: String(header || "Our products").slice(0, 60) },
    body: { text: text || "Take a look" },
    ...(footer ? { footer: { text: footer } } : {}),
    action: { catalog_id: catalogId, sections: secs },
  };
}

/** Pure: Inbox text for an inbound "order" message. */
export function describeOrder(order) {
  const items = order?.product_items || [];
  const count = items.reduce((n, i) => n + (Number(i.quantity) || 0), 0);
  const total = items.reduce((n, i) => n + (Number(i.item_price) || 0) * (Number(i.quantity) || 0), 0);
  const currency = items[0]?.currency || "";
  const lines = items.slice(0, 10).map((i) => `• ${i.quantity} × ${i.product_retailer_id} @ ${i.item_price} ${i.currency || ""}`.trim());
  return [`🛒 Order: ${count} item${count === 1 ? "" : "s"}${total ? `, ${Math.round(total * 100) / 100} ${currency}` : ""}`, ...lines, order?.text ? `Note: ${order.text}` : null]
    .filter(Boolean).join("\n");
}
