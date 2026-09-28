import pool from "../db.js";
import { buildFieldValues } from "./commerceEvents.js";

/**
 * Order Tracking flow element ("orderStatus"): finds a store order
 * (commerce_orders, from the connected Shopify / WooCommerce stores) for the
 * subscriber and fills {{order.*}} placeholders (same fields as the store
 * automation templates — COMMERCE_FIELDS).
 *
 * Privacy: an order is only ever shown to its own customer — it must match the
 * subscriber (linked contact, same phone number, or same email), even when an
 * order number is given. A typed order number of someone else finds nothing.
 */
const digits = (v) => String(v || "").replace(/\D/g, "");

export function phonesMatch(a, b) {
  const x = digits(a);
  const y = digits(b);
  if (x.length < 7 || y.length < 7) return false;
  const n = Math.min(x.length, y.length, 9); // compare the last 9 digits: local vs international formats
  return x.slice(-n) === y.slice(-n);
}

export function orderBelongsToContact(order, contact) {
  if (!order || !contact) return false;
  if (order.contact_id && Number(order.contact_id) === Number(contact.id)) return true;
  // A WhatsApp subscriber id is their number; other channels' ids (e.g. Telegram's numeric user id) are not phones.
  const isWhatsApp = String(contact.platform || "").toUpperCase() === "WHATSAPP";
  const contactPhones = [contact.phone, isWhatsApp && /^\d{7,}$/.test(String(contact.external_id || "")) ? contact.external_id : null].filter(Boolean);
  if (order.customer_phone && contactPhones.some((p) => phonesMatch(p, order.customer_phone))) return true;
  if (order.customer_email && contact.email && order.customer_email.trim().toLowerCase() === contact.email.trim().toLowerCase()) return true;
  return false;
}

export function normalizeOrderNumber(v) {
  return String(v || "").trim().replace(/^#/, "").slice(0, 60);
}

/** The subscriber's order: the given number, or their most recent one. */
export async function findOrderForContact(agencyId, contact, orderNumber = null) {
  const wanted = normalizeOrderNumber(orderNumber);
  const params = [agencyId];
  let where = "c.agency_id = ?";
  if (wanted) {
    where += " AND (TRIM(LEADING '#' FROM o.order_number) = ? OR o.external_order_id = ?)";
    params.push(wanted, wanted);
  } else {
    // Narrow first by what can match, then check precisely in JS.
    const email = String(contact?.email || "").trim().toLowerCase();
    const phoneTail = digits(contact?.phone || (String(contact?.platform || "").toUpperCase() === "WHATSAPP" ? contact?.external_id : "")).slice(-7);
    const ors = ["o.contact_id = ?"];
    params.push(contact?.id || 0);
    if (email) { ors.push("LOWER(o.customer_email) = ?"); params.push(email); }
    if (phoneTail.length === 7) { ors.push("REGEXP_REPLACE(o.customer_phone, '[^0-9]', '') LIKE ?"); params.push(`%${phoneTail}`); }
    where += ` AND (${ors.join(" OR ")})`;
  }
  const [rows] = await pool.query(
    `SELECT o.*, c.platform AS conn_platform, c.store_domain, c.store_name, c.name AS conn_name
     FROM commerce_orders o JOIN commerce_connections c ON c.id = o.connection_id
     WHERE ${where} ORDER BY COALESCE(o.external_created_at, o.created_at) DESC LIMIT 50`,
    params
  );
  const order = rows.find((o) => orderBelongsToContact(o, contact)) || null;
  if (!order) return null;
  const connection = { platform: order.conn_platform, store_domain: order.store_domain, store_name: order.store_name, name: order.conn_name };
  return { order, fields: buildFieldValues({ connection, order }) };
}

/** Replaces {{order.field}} placeholders; unknown fields become empty. */
export function renderOrderText(text, fields) {
  return String(text || "").replace(/\{\{\s*order\.([a-z_]+)\s*\}\}/gi, (_, key) => fields?.[key.toLowerCase()] ?? "");
}
