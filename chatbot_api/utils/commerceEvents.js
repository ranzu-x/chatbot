/**
 * Store automation engine (Automation → Commerce campaigns).
 *
 * 1. pollAllStores()      every 60s — reads orders/checkouts changed since each
 *    connection's cursor (utils/commerceService.js), upserts commerce_orders /
 *    commerce_carts, works out which events happened (new order, paid,
 *    shipped, delivered, cancelled, refunded, COD order, abandoned cart) and
 *    queues one commerce_campaign_sends row per (campaign, event) — the
 *    unique (campaign_id, event_key) makes every event fire at most once.
 *    Polling, not store webhooks: works for every credential type (an
 *    admin-token Shopify app has no signing secret we could verify) and on
 *    servers without a public URL. Latency is about a minute.
 * 2. sendDueMessages()    every 20s — sends queued rows whose send_at is due
 *    as the campaign's approved WhatsApp template, into the subscriber's
 *    conversation on the campaign's bot account; applies label / sequence.
 * 3. handleCommerceButton() — a tap on a COD template's Confirm / Cancel
 *    quick-reply button (payload "CMC:<sendId>:Y|N", routes/webhook.js)
 *    records the answer and updates the order in the store.
 *
 * Existing orders are never messaged: a connection's cursor starts at
 * connect time and "order created" events only fire for orders created
 * after the store was connected.
 */
import pool from "../db.js";
import {
  fetchShopifyOrders, fetchShopifyCarts, fetchWooOrders,
  shopifyAddOrderTags, shopifyCancelOrder, wooAddOrderNote, wooSetOrderStatus, itemsSummary,
} from "./commerceService.js";
import { sendPlatformMessage } from "./platformSender.js";
import { templatePlaceholders, describeTemplate, buildTemplateComponents } from "./whatsappTemplateParams.js";
export { templatePlaceholders, describeTemplate, buildTemplateComponents };
import { sendMsg } from "./flowEngine.js";
import { findOrCreateConversationForBroadcast } from "./broadcastRunner.js";
import { assertLimit } from "./entitlements.js";
import { emitToAgency, emitToConversation } from "./socket.js";
import { syncContactTagsJson } from "../routes/labels.js";
import { enrollContactsInSequence } from "../routes/sequences.js";

export const COMMERCE_TRIGGERS = [
  { id: "ORDER_CREATED", label: "Order created", description: "A new order is placed." },
  { id: "COD_VERIFICATION", label: "COD verification", description: "A new Cash-on-Delivery order is placed. First quick-reply button = Confirm, second = Cancel." },
  { id: "ORDER_PAID", label: "Order paid", description: "The order becomes fully paid." },
  { id: "ORDER_SHIPPED", label: "Order shipped", description: "Shopify: fulfilled. WooCommerce: status Completed." },
  { id: "ORDER_DELIVERED", label: "Order delivered", description: "Shopify only: a fulfillment is marked delivered by the carrier." },
  { id: "ORDER_CANCELLED", label: "Order cancelled", description: "The order is cancelled." },
  { id: "ORDER_REFUNDED", label: "Order refunded", description: "The order is fully or partly refunded." },
  { id: "ABANDONED_CART", label: "Abandoned cart", description: "A checkout with a phone number is left unfinished for the delay you set." },
];
const TRIGGER_IDS = new Set(COMMERCE_TRIGGERS.map((t) => t.id));

// Template variable sources. `order` = only for order triggers, `cart` = only abandoned cart.
export const COMMERCE_FIELDS = [
  { id: "customer_name", label: "Customer name" },
  { id: "customer_first_name", label: "Customer first name" },
  { id: "store_name", label: "Store name" },
  { id: "store_url", label: "Store URL" },
  { id: "total", label: "Order / cart total (with currency)" },
  { id: "total_amount", label: "Total amount (number only)" },
  { id: "currency", label: "Currency" },
  { id: "items", label: "Items (comma separated)" },
  { id: "item_count", label: "Item count" },
  { id: "order_number", label: "Order number", scope: "order" },
  { id: "order_status", label: "Order status", scope: "order" },
  { id: "payment_method", label: "Payment method", scope: "order" },
  { id: "shipping_address", label: "Shipping address", scope: "order" },
  { id: "order_url", label: "Order status page URL", scope: "order" },
  { id: "order_url_path", label: "Order status URL path (for a URL button)", scope: "order" },
  { id: "tracking_number", label: "Tracking number", scope: "order" },
  { id: "tracking_url", label: "Tracking URL", scope: "order" },
  { id: "checkout_url", label: "Checkout recovery URL", scope: "cart" },
  { id: "checkout_url_path", label: "Checkout recovery URL path (for a URL button)", scope: "cart" },
];

const ORDER_OVERLAP_MS = 2 * 60 * 1000; // re-read a little behind the cursor; upserts make it harmless
const CREATED_GRACE_MS = 5 * 60 * 1000;
const SEND_BATCH = 40;

// ─── Phone numbers ───────────────────────────────────────────────────────────

/**
 * Store phone → WhatsApp id (digits only, with country code). A number that
 * starts with "+" or "00" already has one; a local number ("017…") gets the
 * campaign's default country code with its trunk 0 dropped. null = unusable.
 */
export function toWhatsAppNumber(raw, defaultCountryCode) {
  if (!raw) return null;
  const s = String(raw).trim();
  let digits = s.replace(/\D/g, "");
  if (!digits) return null;
  if (s.startsWith("+")) {
    // already international
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else {
    const cc = String(defaultCountryCode || "").replace(/\D/g, "");
    if (cc && !digits.startsWith(cc)) digits = cc + digits.replace(/^0+/, "");
    else if (cc && digits.startsWith(cc) && digits.length <= 10) digits = cc + digits.replace(/^0+/, "");
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

// ─── Polling ─────────────────────────────────────────────────────────────────

async function activeCampaignsFor(connectionId) {
  const [rows] = await pool.query(
    "SELECT * FROM commerce_campaigns WHERE connection_id = ? AND is_active = 1",
    [connectionId]
  );
  return rows;
}

async function queueSends(campaigns, trigger, { eventKey, orderId = null, cartId = null, phone, sendAfter = new Date() }) {
  for (const c of campaigns.filter((x) => x.trigger_event === trigger)) {
    const sendAt = new Date(Math.max(Date.now(), sendAfter.getTime()) + Number(c.delay_minutes || 0) * 60000);
    await pool.query(
      `INSERT INTO commerce_campaign_sends (agency_id, campaign_id, event_key, order_id, cart_id, phone, status, send_at)
       VALUES (?, ?, ?, ?, ?, ?, 'SCHEDULED', ?)
       ON DUPLICATE KEY UPDATE
         -- an abandoned cart the customer touched again waits for its full delay again
         send_at = IF(status = 'SCHEDULED' AND cart_id IS NOT NULL, VALUES(send_at), send_at),
         phone = IF(status = 'SCHEDULED', VALUES(phone), phone)`,
      [c.agency_id, c.id, eventKey, orderId, cartId, phone || null, sendAt]
    );
  }
}

async function upsertOrder(connection, o) {
  const [[prev]] = await pool.query(
    "SELECT * FROM commerce_orders WHERE connection_id = ? AND external_order_id = ?",
    [connection.id, o.externalId]
  );
  const values = [
    o.number, o.customerName || null, o.phone || null, o.status || null, o.total, o.currency,
    o.financialStatus || null, o.fulfillmentStatus || null, o.paymentMethod || null, o.isCod ? 1 : 0,
    o.orderUrl || null, o.createdAt, o.updatedAt, JSON.stringify(o.raw),
  ];
  if (prev) {
    await pool.query(
      `UPDATE commerce_orders SET order_number = ?, customer_name = ?, customer_phone = ?, status = ?, total = ?, currency = ?,
         financial_status = ?, fulfillment_status = ?, payment_method = ?, is_cod = ?, order_url = ?,
         external_created_at = ?, external_updated_at = ?, raw_json = ?, updated_at = NOW()
       WHERE id = ?`,
      [...values, prev.id]
    );
    return { row: { ...prev, id: prev.id }, prev };
  }
  const [ins] = await pool.query(
    `INSERT INTO commerce_orders (order_number, customer_name, customer_phone, status, total, currency,
       financial_status, fulfillment_status, payment_method, is_cod, order_url,
       external_created_at, external_updated_at, raw_json, connection_id, external_order_id, cod_status, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [...values, connection.id, o.externalId, o.isCod && !o.isCancelled ? "PENDING" : null]
  );
  return { row: { id: ins.insertId }, prev: null };
}

async function processOrder(connection, campaigns, o) {
  const { row, prev } = await upsertOrder(connection, o);
  const was = prev ? {
    paid: prev.financial_status === "PAID",
    shipped: ["FULFILLED", "PARTIALLY_FULFILLED", "DELIVERED"].includes(prev.fulfillment_status),
    delivered: prev.fulfillment_status === "DELIVERED",
    cancelled: prev.status === "cancelled",
    refunded: ["REFUNDED", "PARTIALLY_REFUNDED"].includes(prev.financial_status) || prev.status === "refunded",
  } : { paid: false, shipped: false, delivered: false, cancelled: false, refunded: false };

  const createdAfterConnect = o.createdAt && o.createdAt.getTime() >= new Date(connection.created_at).getTime() - CREATED_GRACE_MS;
  const base = { orderId: row.id, phone: o.phone };
  const key = (t) => `${t}:order:${row.id}`;

  if (!prev && createdAfterConnect && !o.isCancelled) {
    await queueSends(campaigns, "ORDER_CREATED", { ...base, eventKey: key("ORDER_CREATED") });
    if (o.isCod) await queueSends(campaigns, "COD_VERIFICATION", { ...base, eventKey: key("COD_VERIFICATION") });
  }
  // Status changes. A first-seen order only counts for these when it was
  // created after the store was connected (so connecting never replays history).
  if (prev || createdAfterConnect) {
    if (o.isPaid && !was.paid) await queueSends(campaigns, "ORDER_PAID", { ...base, eventKey: key("ORDER_PAID") });
    if (o.isShipped && !was.shipped) await queueSends(campaigns, "ORDER_SHIPPED", { ...base, eventKey: key("ORDER_SHIPPED") });
    if (o.isDelivered && !was.delivered) await queueSends(campaigns, "ORDER_DELIVERED", { ...base, eventKey: key("ORDER_DELIVERED") });
    if (o.isCancelled && !was.cancelled) await queueSends(campaigns, "ORDER_CANCELLED", { ...base, eventKey: key("ORDER_CANCELLED") });
    if (o.isRefunded && !was.refunded) await queueSends(campaigns, "ORDER_REFUNDED", { ...base, eventKey: key("ORDER_REFUNDED") });
  }
}

async function processCart(connection, campaigns, c) {
  const status = c.completed ? "RECOVERED" : "OPEN";
  await pool.query(
    `INSERT INTO commerce_carts (connection_id, external_checkout_id, customer_name, customer_phone, total, currency,
       items_summary, recovery_url, status, external_created_at, external_updated_at, raw_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE customer_name = VALUES(customer_name), customer_phone = VALUES(customer_phone),
       total = VALUES(total), currency = VALUES(currency), items_summary = VALUES(items_summary),
       recovery_url = VALUES(recovery_url), status = IF(status = 'OPEN', VALUES(status), status),
       external_updated_at = VALUES(external_updated_at), raw_json = VALUES(raw_json)`,
    [connection.id, c.externalId, c.customerName || null, c.phone || null, c.total, c.currency,
      itemsSummary(c.items || []), c.recoveryUrl || null, status, c.createdAt, c.updatedAt, JSON.stringify(c.raw)]
  );
  if (status !== "OPEN" || !c.phone) return;
  const [[cart]] = await pool.query("SELECT id FROM commerce_carts WHERE connection_id = ? AND external_checkout_id = ?", [connection.id, c.externalId]);
  await queueSends(campaigns, "ABANDONED_CART", {
    cartId: cart.id,
    phone: c.phone,
    eventKey: `ABANDONED_CART:cart:${cart.id}`,
    sendAfter: c.updatedAt || new Date(),
  });
}

async function markCartRecovered(connectionId, externalId) {
  await pool.query(
    "UPDATE commerce_carts SET status = 'RECOVERED' WHERE connection_id = ? AND external_checkout_id = ? AND status = 'OPEN'",
    [connectionId, externalId]
  );
}

export async function pollConnection(connection) {
  const campaigns = await activeCampaignsFor(connection.id);
  const ordersSince = new Date(new Date(connection.orders_cursor || connection.created_at).getTime() - ORDER_OVERLAP_MS);
  let ordersCursor = connection.orders_cursor ? new Date(connection.orders_cursor) : new Date(connection.created_at);
  let cartsCursor = connection.carts_cursor ? new Date(connection.carts_cursor) : new Date(connection.created_at);
  const bump = (cur, d) => (d && d > cur ? d : cur);
  let orderCount = 0;
  let cartCount = 0;

  if (connection.platform === "SHOPIFY") {
    for (const o of await fetchShopifyOrders(connection, ordersSince)) {
      await processOrder(connection, campaigns, o);
      ordersCursor = bump(ordersCursor, o.updatedAt);
      orderCount++;
    }
    const cartsSince = new Date(cartsCursor.getTime() - ORDER_OVERLAP_MS);
    for (const c of await fetchShopifyCarts(connection, cartsSince)) {
      await processCart(connection, campaigns, c);
      cartsCursor = bump(cartsCursor, c.updatedAt);
      cartCount++;
    }
  } else {
    for (const o of await fetchWooOrders(connection, ordersSince)) {
      if (o.isCart) {
        await processCart(connection, campaigns, {
          externalId: o.externalId, customerName: o.customerName, phone: o.phone, total: o.total, currency: o.currency,
          items: o.items, recoveryUrl: o.recoveryUrl, completed: false, createdAt: o.createdAt, updatedAt: o.updatedAt, raw: o.raw,
        });
        cartCount++;
      } else {
        // The same WooCommerce order id was a draft/pending "cart" until it got paid or placed.
        await markCartRecovered(connection.id, o.externalId);
        await processOrder(connection, campaigns, o);
        orderCount++;
      }
      ordersCursor = bump(ordersCursor, o.updatedAt);
    }
    cartsCursor = ordersCursor;
  }

  await pool.query(
    "UPDATE commerce_connections SET orders_cursor = ?, carts_cursor = ?, last_polled_at = NOW(), last_poll_error = NULL WHERE id = ?",
    [ordersCursor, cartsCursor, connection.id]
  );
  return { orderCount, cartCount };
}

let polling = false;
export async function pollAllStores() {
  if (polling) return;
  polling = true;
  try {
    const [connections] = await pool.query("SELECT * FROM commerce_connections WHERE is_active = 1");
    for (const connection of connections) {
      try {
        await pollConnection(connection);
      } catch (err) {
        console.error(`[Commerce] poll of store #${connection.id} (${connection.platform}) failed:`, err.message);
        await pool.query(
          "UPDATE commerce_connections SET last_polled_at = NOW(), last_poll_error = ? WHERE id = ?",
          [String(err.message).slice(0, 500), connection.id]
        ).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[Commerce] poll failed:", err);
  } finally {
    polling = false;
  }
}

// ─── Template rendering ──────────────────────────────────────────────────────

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function money(amount, currency) {
  if (amount === null || amount === undefined || amount === "") return "";
  const n = Number(amount);
  return `${currency ? `${currency} ` : ""}${Number.isFinite(n) ? n.toFixed(2) : amount}`;
}

function urlPath(u) {
  try {
    const url = new URL(u);
    return `${url.pathname.replace(/^\//, "")}${url.search}`;
  } catch {
    return "";
  }
}

export function buildFieldValues({ connection, order, cart }) {
  const src = order || cart || {};
  const raw = parseJson(src.raw_json, {});
  const name = src.customer_name || "";
  const itemsText = order
    ? ((raw.lineItems?.nodes || raw.line_items || []).map((i) => `${i.title || i.name}${Number(i.quantity) > 1 ? ` x${i.quantity}` : ""}`).join(", "))
    : cart?.items_summary || "";
  const itemCount = order
    ? (raw.lineItems?.nodes || raw.line_items || []).reduce((s, i) => s + Number(i.quantity || 1), 0)
    : (cart?.items_summary ? cart.items_summary.split(",").length : 0);
  const tracking = raw.fulfillments?.flatMap?.((f) => f.trackingInfo || [])?.[0]
    || (raw.meta_data || []).find((m) => m.key === "_wc_shipment_tracking_items")?.value?.[0] || {};
  const storeUrl = connection.platform === "SHOPIFY" ? `https://${connection.store_domain}` : connection.store_domain;
  const shipping = raw.shippingAddress
    ? [raw.shippingAddress.address1, raw.shippingAddress.city, raw.shippingAddress.country].filter(Boolean).join(", ")
    : raw.shipping ? [raw.shipping.address_1, raw.shipping.city, raw.shipping.country].filter(Boolean).join(", ") : "";
  return {
    customer_name: name || "there",
    customer_first_name: (name.split(" ")[0]) || "there",
    store_name: connection.store_name || connection.name || storeUrl,
    store_url: storeUrl,
    total: money(src.total, src.currency),
    total_amount: src.total !== null && src.total !== undefined ? String(src.total) : "",
    currency: src.currency || "",
    items: itemsText.slice(0, 900),
    item_count: String(itemCount || ""),
    order_number: order?.order_number || "",
    order_status: order?.status || "",
    payment_method: order?.payment_method || "",
    shipping_address: shipping,
    order_url: order?.order_url || "",
    order_url_path: urlPath(order?.order_url || ""),
    tracking_number: tracking.number || tracking.tracking_number || "",
    tracking_url: tracking.url || tracking.custom_tracking_link || "",
    checkout_url: cart?.recovery_url || "",
    checkout_url_path: urlPath(cart?.recovery_url || ""),
  };
}

// ─── Sending ─────────────────────────────────────────────────────────────────

async function finish(sendId, status, extra = {}) {
  await pool.query(
    `UPDATE commerce_campaign_sends SET status = ?, error = ?, contact_id = COALESCE(?, contact_id),
       conversation_id = COALESCE(?, conversation_id), message_id = COALESCE(?, message_id),
       sent_at = IF(? = 'SENT', NOW(), sent_at)
     WHERE id = ?`,
    [status, extra.error ? String(extra.error).slice(0, 1000) : null, extra.contactId || null, extra.conversationId || null, extra.messageId || null, status, sendId]
  );
}

async function findOrCreateWhatsAppContact(agencyId, waNumber, name) {
  const [[existing]] = await pool.query(
    "SELECT * FROM contacts WHERE agency_id = ? AND platform = 'WHATSAPP' AND external_id = ?",
    [agencyId, waNumber]
  );
  if (existing) return existing;
  await assertLimit(agencyId, "max_subscribers", 1, null);
  const [ins] = await pool.query(
    `INSERT IGNORE INTO contacts (agency_id, platform, external_id, name, phone, source, created_at)
     VALUES (?, 'WHATSAPP', ?, ?, ?, 'INTEGRATION', NOW())`,
    [agencyId, waNumber, name || waNumber, waNumber]
  );
  const [[contact]] = await pool.query(
    "SELECT * FROM contacts WHERE agency_id = ? AND platform = 'WHATSAPP' AND external_id = ?",
    [agencyId, waNumber]
  );
  if (!contact) throw new Error(`Could not create subscriber (insert ${ins.affectedRows})`);
  return contact;
}

function sendError(err) {
  return err.response?.data?.error?.error_data?.details || err.response?.data?.error?.message || err.message || String(err);
}

async function deliver(send) {
  const [[campaign]] = await pool.query("SELECT * FROM commerce_campaigns WHERE id = ?", [send.campaign_id]);
  if (!campaign || !campaign.is_active) return finish(send.id, "SKIPPED", { error: "Campaign is paused" });

  const [[connection]] = await pool.query("SELECT * FROM commerce_connections WHERE id = ? AND agency_id = ?", [campaign.connection_id, campaign.agency_id]);
  if (!connection || !connection.is_active) return finish(send.id, "SKIPPED", { error: "Store is paused or disconnected" });

  const [[order]] = send.order_id ? await pool.query("SELECT * FROM commerce_orders WHERE id = ?", [send.order_id]) : [[null]];
  const [[cart]] = send.cart_id ? await pool.query("SELECT * FROM commerce_carts WHERE id = ?", [send.cart_id]) : [[null]];
  if (campaign.trigger_event === "ABANDONED_CART") {
    if (!cart) return finish(send.id, "SKIPPED", { error: "Cart no longer exists" });
    if (cart.status !== "OPEN") return finish(send.id, "SKIPPED", { error: "Customer completed the checkout" });
  } else if (!order) {
    return finish(send.id, "SKIPPED", { error: "Order no longer exists" });
  } else if (campaign.trigger_event === "COD_VERIFICATION" && (order.status === "cancelled" || order.cod_status !== "PENDING")) {
    return finish(send.id, "SKIPPED", { error: "Order is no longer awaiting COD confirmation" });
  }

  const [[integration]] = await pool.query(
    "SELECT * FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'WHATSAPP' AND is_active = 1",
    [campaign.integration_id, campaign.agency_id]
  );
  if (!integration) return finish(send.id, "FAILED", { error: "The campaign's WhatsApp account is missing or inactive" });

  const [[tpl]] = await pool.query(
    "SELECT * FROM whatsapp_templates WHERE id = ? AND agency_id = ? AND status = 'APPROVED'",
    [campaign.template_id, campaign.agency_id]
  );
  if (!tpl) return finish(send.id, "FAILED", { error: "The campaign's template is missing or not approved" });

  const rawPhone = send.phone || order?.customer_phone || cart?.customer_phone;
  const waNumber = toWhatsAppNumber(rawPhone, campaign.default_country_code);
  if (!waNumber) return finish(send.id, "FAILED", { error: rawPhone ? `"${rawPhone}" is not a usable WhatsApp number — set a default country code` : "The customer gave no phone number" });

  let contact;
  try {
    await assertLimit(campaign.agency_id, "max_monthly_messages", 1, null);
    contact = await findOrCreateWhatsAppContact(campaign.agency_id, waNumber, order?.customer_name || cart?.customer_name);
  } catch (err) {
    return finish(send.id, "FAILED", { error: err.message });
  }
  if (contact.is_blocked) return finish(send.id, "SKIPPED", { error: "Subscriber is blocked", contactId: contact.id });

  const conversation = await findOrCreateConversationForBroadcast(campaign.agency_id, contact.id, integration.id);
  const fields = buildFieldValues({ connection, order, cart });
  const quickReplyPayloads = campaign.trigger_event === "COD_VERIFICATION" ? [`CMC:${send.id}:Y`, `CMC:${send.id}:N`] : [];
  const built = buildTemplateComponents(tpl, parseJson(campaign.variable_map, {}), fields, { quickReplyPayloads });

  let externalMsgId;
  try {
    externalMsgId = await sendPlatformMessage("WHATSAPP", integration, contact.external_id, {
      type: "TEXT",
      body: built.renderedBody,
      whatsappTemplate: { name: tpl.template_name, language: tpl.language, components: built.components },
    });
    if (!externalMsgId) throw new Error("WhatsApp did not return a message id — check the account's access token");
  } catch (err) {
    return finish(send.id, "FAILED", { error: sendError(err), contactId: contact.id, conversationId: conversation.id });
  }

  const metadata = {
    senderType: "BOT",
    senderName: "Store automation",
    template: tpl.template_name,
    ...(built.renderedHeader ? { headerType: "TEXT", headerText: built.renderedHeader } : {}),
    ...(tpl.footer_text ? { footerText: tpl.footer_text } : {}),
    ...(built.buttons.length ? { buttons: built.buttons } : {}),
  };
  const [msg] = await pool.query(
    `INSERT INTO messages (conversation_id, direction, type, body, metadata, external_msg_id, created_at)
     VALUES (?, 'OUTBOUND', 'TEMPLATE', ?, ?, ?, NOW())`,
    [conversation.id, built.renderedBody, JSON.stringify(metadata), externalMsgId]
  );
  await pool.query("UPDATE conversations SET last_message_at = NOW() WHERE id = ?", [conversation.id]);
  const [[saved]] = await pool.query("SELECT * FROM messages WHERE id = ?", [msg.insertId]);
  emitToAgency(campaign.agency_id, "new_message", { conversationId: conversation.id, message: saved });
  emitToConversation(conversation.id, "new_message", { conversationId: conversation.id, message: saved });

  await finish(send.id, "SENT", { contactId: contact.id, conversationId: conversation.id, messageId: msg.insertId });

  // Label + sequence are extras: a failure here never undoes the send.
  try {
    if (campaign.label_id) {
      const [[label]] = await pool.query("SELECT id FROM labels WHERE id = ? AND agency_id = ?", [campaign.label_id, campaign.agency_id]);
      if (label) {
        await pool.query("INSERT IGNORE INTO contact_labels (contact_id, label_id) VALUES (?, ?)", [contact.id, label.id]);
        await syncContactTagsJson(contact.id);
      }
    }
    if (campaign.sequence_id) {
      await enrollContactsInSequence(campaign.sequence_id, campaign.agency_id, {
        contactId: contact.id, targetPlatform: "WHATSAPP", enrolledVia: "COMMERCE", integrationId: campaign.integration_id,
      });
    }
  } catch (err) {
    console.error(`[Commerce] label/sequence after send #${send.id} failed:`, err.message);
  }
}

let sending = false;
export async function sendDueMessages() {
  if (sending) return;
  sending = true;
  try {
    const [due] = await pool.query(
      "SELECT * FROM commerce_campaign_sends WHERE status = 'SCHEDULED' AND send_at <= NOW() ORDER BY send_at ASC LIMIT ?",
      [SEND_BATCH]
    );
    for (const send of due) {
      const [claim] = await pool.query("UPDATE commerce_campaign_sends SET status = 'SENDING' WHERE id = ? AND status = 'SCHEDULED'", [send.id]);
      if (!claim.affectedRows) continue;
      try {
        await deliver(send);
      } catch (err) {
        console.error(`[Commerce] send #${send.id} failed:`, err);
        await finish(send.id, "FAILED", { error: err.message }).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[Commerce] send loop failed:", err);
  } finally {
    sending = false;
  }
}

// A crash mid-send leaves rows in SENDING; after 10 minutes they are failed
// (not retried — a retry could message the customer twice).
async function failStuckSends() {
  await pool.query(
    "UPDATE commerce_campaign_sends SET status = 'FAILED', error = 'Interrupted while sending' WHERE status = 'SENDING' AND send_at < NOW() - INTERVAL 10 MINUTE"
  ).catch(() => {});
}

// ─── COD button taps ─────────────────────────────────────────────────────────

export function isCommerceButton(buttonRoute) {
  return typeof buttonRoute === "string" && /^CMC:\d+:[YN]$/.test(buttonRoute);
}

/**
 * The customer tapped Confirm (Y) / Cancel (N) on a COD verification
 * message. Only counts when the tap comes from the very subscriber the
 * message was sent to. Updates the store per the campaign's settings and
 * answers with the campaign's reply text (inside the 24h window the tap opened).
 * Returns true when handled.
 */
export async function handleCommerceButton({ agencyId, buttonRoute, contact, conversation, integration }) {
  const [, idStr, answer] = buttonRoute.split(":");
  const [[send]] = await pool.query(
    "SELECT * FROM commerce_campaign_sends WHERE id = ? AND agency_id = ? AND contact_id = ?",
    [Number(idStr), agencyId, contact.id]
  );
  if (!send?.order_id) return false;
  const [[campaign]] = await pool.query("SELECT * FROM commerce_campaigns WHERE id = ?", [send.campaign_id]);
  const [[order]] = await pool.query("SELECT * FROM commerce_orders WHERE id = ?", [send.order_id]);
  const [[connection]] = await pool.query("SELECT * FROM commerce_connections WHERE id = ? AND agency_id = ?", [order?.connection_id, agencyId]);
  if (!campaign || !order || !connection) return false;

  const confirmed = answer === "Y";
  const fields = buildFieldValues({ connection, order });
  const alreadyAnswered = order.cod_status && order.cod_status !== "PENDING";

  if (!alreadyAnswered) {
    await pool.query(
      "UPDATE commerce_orders SET cod_status = ?, cod_responded_at = NOW() WHERE id = ?",
      [confirmed ? "CONFIRMED" : "CANCELLED", order.id]
    );
    try {
      const note = `Customer ${confirmed ? "confirmed" : "cancelled"} this Cash-on-Delivery order on WhatsApp (+${contact.external_id}).`;
      if (connection.platform === "SHOPIFY") {
        await shopifyAddOrderTags(connection, order.external_order_id, [confirmed ? "COD Confirmed" : "COD Cancelled"]);
        if (!confirmed && campaign.cod_cancel_action === "CANCEL") await shopifyCancelOrder(connection, order.external_order_id, note);
      } else {
        await wooAddOrderNote(connection, order.external_order_id, note);
        if (confirmed && campaign.cod_confirm_action === "PROCESSING") await wooSetOrderStatus(connection, order.external_order_id, "processing");
        if (!confirmed && campaign.cod_cancel_action === "CANCEL") await wooSetOrderStatus(connection, order.external_order_id, "cancelled");
      }
    } catch (err) {
      console.error(`[Commerce] COD store update for order #${order.id} failed:`, err.message);
      await pool.query(
        "UPDATE commerce_campaign_sends SET error = ? WHERE id = ?",
        [`Customer ${confirmed ? "confirmed" : "cancelled"}, but updating the store failed: ${err.message}`.slice(0, 1000), send.id]
      );
    }
    emitToAgency(agencyId, "commerce_cod_update", { orderId: order.id, codStatus: confirmed ? "CONFIRMED" : "CANCELLED" });
  }

  const template = confirmed
    ? campaign.cod_confirm_reply || "Thank you! Your order {{order_number}} is confirmed and will be shipped soon."
    : campaign.cod_cancel_reply || "Your order {{order_number}} has been cancelled. Reply here if this was a mistake.";
  const reply = alreadyAnswered
    ? `We already have your answer for order ${fields.order_number} (${order.cod_status === "CONFIRMED" ? "confirmed" : "cancelled"}). Reply here if you need help.`
    : template.replace(/{{\s*([a-z_]+)\s*}}/g, (_, k) => fields[k] ?? "");
  await sendMsg(agencyId, conversation, reply, "TEXT", integration, { contactIdentifier: contact.external_id });
  return true;
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

export function startCommerceEventScheduler() {
  console.log("🛒 Commerce automation started (store poll every 60s, sends every 20s)");
  setTimeout(pollAllStores, 15000);
  setInterval(pollAllStores, 60 * 1000);
  setInterval(() => { failStuckSends(); sendDueMessages(); }, 20 * 1000);
}

export { TRIGGER_IDS };
