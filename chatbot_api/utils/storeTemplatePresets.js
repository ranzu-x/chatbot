import axios from "axios";
import pool from "../db.js";
import { GRAPH_URL } from "./metaApi.js";

/**
 * Default WhatsApp templates for store automation (Commerce campaigns,
 * utils/commerceEvents.js), created in one click from the template manager
 * (Bot Manager → Message Templates → Store templates) or from the campaign
 * editor, and submitted to Meta for review.
 *
 * They use NAMED parameters whose names are exactly the store field ids
 * (COMMERCE_FIELDS: {{customer_first_name}}, {{order_number}}, …), so a
 * campaign maps every variable automatically (suggestedVariableMap) — and so
 * does any template the customer writes with the same names. Links (order
 * page, tracking, checkout) are body variables, not URL buttons: a URL button
 * needs a fixed domain, and a Shopify order page may be on the myshopify
 * domain or the store's own one. whatsapp_templates.preset_key marks a
 * default (migrate_store_template_presets.js).
 *
 * Meta rules followed: named parameters are lowercase + underscores and never
 * start or end the body; body ≤ 1024, header ≤ 60 (no variables, no emoji),
 * footer ≤ 60, quick replies ≤ 25 chars. Order updates and COD are UTILITY;
 * an abandoned-cart reminder is MARKETING (Meta would re-categorise it anyway).
 */

export const STORE_TEMPLATE_LANGUAGE = "en_US";

// Example values Meta reviews the template with.
const SAMPLES = {
  customer_first_name: "Sarah",
  customer_name: "Sarah Khan",
  store_name: "Acme Store",
  order_number: "#1024",
  items: "Classic T-shirt x2, Canvas cap",
  total: "USD 49.90",
  shipping_address: "12 Lake Road, Dhaka, Bangladesh",
  order_url: "https://acme-store.com/orders/7f3a9c",
  tracking_number: "1Z999AA10123456784",
  tracking_url: "https://track.example.com/1Z999AA10123456784",
  checkout_url: "https://acme-store.com/checkouts/c/9b2e41",
};

export const STORE_TEMPLATE_PRESETS = [
  {
    key: "ORDER_CREATED",
    trigger: "ORDER_CREATED",
    title: "Order confirmation",
    description: "Sent when a new order is placed: items, total, delivery address and the order page link.",
    name: "store_order_confirmation",
    category: "UTILITY",
    headerText: "Order confirmed",
    body: [
      "Hi {{customer_first_name}}, thank you for shopping with {{store_name}}! 🎉",
      "",
      "We've received your order *{{order_number}}*.",
      "🛍️ Items: {{items}}",
      "💰 Total: {{total}}",
      "📦 Delivery to: {{shipping_address}}",
      "",
      "View your order anytime: {{order_url}}",
      "",
      "We'll message you again as soon as it ships.",
    ].join("\n"),
    footer: "Reply to this message if you need help.",
    buttons: [],
  },
  {
    key: "COD_VERIFICATION",
    trigger: "COD_VERIFICATION",
    title: "COD order verification",
    description: "Asks a Cash-on-Delivery customer to confirm or cancel. The first button confirms, the second cancels.",
    name: "store_cod_verification",
    category: "UTILITY",
    headerText: "Please confirm your order",
    body: [
      "Hi {{customer_first_name}}, thanks for your order *{{order_number}}* at {{store_name}}.",
      "",
      "🛍️ Items: {{items}}",
      "💰 Pay on delivery: {{total}}",
      "📦 Delivery to: {{shipping_address}}",
      "",
      "Please confirm your Cash on Delivery order with a button below so we can ship it right away.",
    ].join("\n"),
    footer: "Unconfirmed orders may be delayed.",
    buttons: [
      { type: "QUICK_REPLY", text: "Confirm order" },
      { type: "QUICK_REPLY", text: "Cancel order" },
    ],
  },
  {
    key: "ABANDONED_CART",
    trigger: "ABANDONED_CART",
    title: "Abandoned cart recovery",
    description: "Reminds a shopper who left checkout, with their items, total and a link back to their cart.",
    name: "store_cart_reminder",
    category: "MARKETING",
    headerText: "You left something behind",
    body: [
      "Hi {{customer_first_name}}, you left some items in your cart at {{store_name}} 🛒",
      "",
      "🛍️ {{items}}",
      "💰 Total: {{total}}",
      "",
      "Your cart is saved — complete your order here: {{checkout_url}}",
      "",
      "Questions before you buy? Just reply to this message.",
    ].join("\n"),
    footer: "Reply STOP to stop these reminders.",
    buttons: [],
  },
  {
    key: "ORDER_PAID",
    trigger: "ORDER_PAID",
    title: "Payment received",
    description: "Confirms the order is fully paid.",
    name: "store_payment_received",
    category: "UTILITY",
    headerText: "Payment received",
    body: [
      "Hi {{customer_first_name}}, we've received your payment of {{total}} for order *{{order_number}}*. Thank you!",
      "",
      "{{store_name}} is now preparing your items and will let you know when they ship.",
    ].join("\n"),
    footer: "Reply to this message if you need help.",
    buttons: [],
  },
  {
    key: "ORDER_SHIPPED",
    trigger: "ORDER_SHIPPED",
    title: "Order shipped",
    description: "Tells the customer the order is on its way, with the tracking number and link.",
    name: "store_order_shipped",
    category: "UTILITY",
    headerText: "Your order is on its way",
    body: [
      "Good news, {{customer_first_name}}! Your order *{{order_number}}* from {{store_name}} has been shipped. 🚚",
      "",
      "📦 Tracking number: {{tracking_number}}",
      "🔗 Track your package: {{tracking_url}}",
      "",
      "Thank you for shopping with us!",
    ].join("\n"),
    footer: "Reply to this message if you need help.",
    buttons: [],
  },
  {
    key: "ORDER_DELIVERED",
    trigger: "ORDER_DELIVERED",
    title: "Order delivered",
    description: "Sent when the carrier marks the order delivered (Shopify).",
    name: "store_order_delivered",
    category: "UTILITY",
    headerText: "Your order has been delivered",
    body: [
      "Hi {{customer_first_name}}, your order *{{order_number}}* from {{store_name}} has been delivered. 🎉",
      "",
      "We hope you love it! If anything isn't right, just reply to this message and we'll help.",
    ].join("\n"),
    footer: "Thank you for shopping with us.",
    buttons: [],
  },
  {
    key: "ORDER_CANCELLED",
    trigger: "ORDER_CANCELLED",
    title: "Order cancelled",
    description: "Lets the customer know the order was cancelled.",
    name: "store_order_cancelled",
    category: "UTILITY",
    headerText: "Order cancelled",
    body: [
      "Hi {{customer_first_name}}, your order *{{order_number}}* from {{store_name}} has been cancelled.",
      "",
      "If you already paid, the refund goes back to your original payment method. Questions? Just reply to this message.",
    ].join("\n"),
    footer: "",
    buttons: [],
  },
  {
    key: "ORDER_REFUNDED",
    trigger: "ORDER_REFUNDED",
    title: "Refund issued",
    description: "Confirms a full or partial refund.",
    name: "store_order_refunded",
    category: "UTILITY",
    headerText: "Refund issued",
    body: [
      "Hi {{customer_first_name}}, we've issued a refund for your order *{{order_number}}* from {{store_name}}.",
      "",
      "It can take a few business days to appear on your statement. Reply here if you have any questions.",
    ].join("\n"),
    footer: "",
    buttons: [],
  },
];

export const PRESETS_BY_KEY = Object.fromEntries(STORE_TEMPLATE_PRESETS.map((p) => [p.key, p]));

const namedParams = (text) => [...new Set([...String(text || "").matchAll(/{{\s*([a-z_]+)\s*}}/g)].map((m) => m[1]))];

/** Pure: the body with the review sample values filled in (for previews). */
export function renderPresetSample(text) {
  return String(text || "").replace(/{{\s*([a-z_]+)\s*}}/g, (m, k) => SAMPLES[k] ?? m);
}

/** Pure: Meta's create payload for a preset (named parameters). */
export function presetMetaPayload(preset) {
  const components = [];
  if (preset.headerText) components.push({ type: "HEADER", format: "TEXT", text: preset.headerText });
  components.push({
    type: "BODY",
    text: preset.body,
    example: { body_text_named_params: namedParams(preset.body).map((name) => ({ param_name: name, example: SAMPLES[name] || "Example" })) },
  });
  if (preset.footer) components.push({ type: "FOOTER", text: preset.footer });
  if (preset.buttons.length) components.push({ type: "BUTTONS", buttons: preset.buttons.map((b) => ({ type: b.type, text: b.text })) });
  return { name: preset.name, language: STORE_TEMPLATE_LANGUAGE, category: preset.category, parameter_format: "named", components };
}

/**
 * Pure: a campaign's variable_map for a template — every header / body
 * placeholder whose name is a store field id is mapped to that field.
 * Positional ({{1}}) placeholders stay for the person to choose.
 */
export function suggestedVariableMap(placeholders, fieldIds) {
  const ids = new Set(fieldIds);
  const pick = (list) => Object.fromEntries((list || []).filter((p) => ids.has(p)).map((p) => [p, p]));
  return { header: pick(placeholders?.header), body: pick(placeholders?.body), buttons: {} };
}

/* ── Meta + database ──────────────────────────────────────────────────── */

function metaError(err) {
  const e = err.response?.data?.error;
  return e?.error_user_msg || e?.message || err.message || "Meta refused the template";
}

async function fetchMetaTemplateByName(integration, name) {
  const res = await axios.get(`${GRAPH_URL}/${integration.wa_business_acc_id}/message_templates`, {
    params: { name, fields: "id,name,language,status,category,rejected_reason,components" },
    headers: { Authorization: `Bearer ${integration.access_token}` },
    timeout: 15000,
  });
  return (res.data?.data || []).find((t) => t.name === name && t.language === STORE_TEMPLATE_LANGUAGE) || null;
}

/** Writes (or re-links) the local row of a preset template. */
async function saveRow(agencyId, integration, preset, { metaId, status, category, reason, content = null }) {
  const src = content || preset;
  const buttons = (src.buttons || []).map((b) => ({ type: b.type, text: b.text }));
  const [[existing]] = await pool.query(
    "SELECT id FROM whatsapp_templates WHERE agency_id = ? AND template_name = ? AND language = ? AND (integration_id = ? OR integration_id IS NULL)",
    [agencyId, preset.name, STORE_TEMPLATE_LANGUAGE, integration.id]
  );
  const values = [
    integration.id, category || preset.category, src.headerText ? "TEXT" : "NONE", src.headerText || null,
    src.body, src.footer || null, JSON.stringify(buttons), status, reason || null, metaId || null, preset.key,
  ];
  if (existing) {
    await pool.query(
      `UPDATE whatsapp_templates SET integration_id = ?, category = ?, template_type = 'STANDARD', header_type = ?, header_text = ?,
              body_text = ?, footer_text = ?, buttons_json = ?, status = ?, rejection_reason = ?, meta_template_id = ?, preset_key = ?
        WHERE id = ?`,
      [...values, existing.id]
    );
    return existing.id;
  }
  const [ins] = await pool.query(
    `INSERT INTO whatsapp_templates
       (integration_id, category, template_type, header_type, header_text, body_text, footer_text, buttons_json,
        status, rejection_reason, meta_template_id, preset_key, agency_id, template_name, language, carousel_cards_json, variables_json, created_at)
     VALUES (?, ?, 'STANDARD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', NOW())`,
    [...values, agencyId, preset.name, STORE_TEMPLATE_LANGUAGE]
  );
  return ins.insertId;
}

/** A Meta template object → our preset-shaped content (for adopting one that already exists). */
function contentFromMeta(tpl) {
  const comp = (type) => (tpl.components || []).find((c) => String(c.type).toUpperCase() === type);
  return {
    headerText: comp("HEADER")?.format === "TEXT" ? comp("HEADER").text : null,
    body: comp("BODY")?.text || "",
    footer: comp("FOOTER")?.text || "",
    buttons: (comp("BUTTONS")?.buttons || []).map((b) => ({ type: String(b.type).toUpperCase(), text: b.text })),
  };
}

function assertWaba(integration) {
  if (String(integration.platform).toUpperCase() !== "WHATSAPP") {
    const e = new Error("Store templates are WhatsApp templates — choose a WhatsApp number.");
    e.status = 400;
    throw e;
  }
  if (!integration.wa_business_acc_id || !integration.access_token) {
    const e = new Error("This WhatsApp number has no Business Account (WABA) connected, so templates can't be submitted to Meta.");
    e.status = 400;
    throw e;
  }
}

/** Every preset with its template's state on this number. */
export async function listStorePresets(agencyId, integration) {
  const [rows] = await pool.query(
    "SELECT id, preset_key, status, rejection_reason, category, template_name FROM whatsapp_templates WHERE agency_id = ? AND integration_id = ? AND preset_key IS NOT NULL",
    [agencyId, integration.id]
  );
  const byKey = new Map(rows.map((r) => [r.preset_key, r]));
  return STORE_TEMPLATE_PRESETS.map((p) => {
    const row = byKey.get(p.key);
    return {
      key: p.key,
      trigger: p.trigger,
      title: p.title,
      description: p.description,
      name: p.name,
      category: p.category,
      headerText: p.headerText,
      body: p.body,
      sample: renderPresetSample(p.body),
      footer: p.footer,
      buttons: p.buttons,
      template: row ? { id: row.id, status: row.status, reason: row.rejection_reason, category: row.category } : null,
    };
  });
}

/**
 * Submits the chosen presets to Meta (skips ones that already exist and
 * aren't rejected). A name Meta already has on this WABA is adopted as is.
 * Returns one result per key.
 */
export async function createStorePresets(agencyId, integration, keys) {
  assertWaba(integration);
  const wanted = [...new Set((Array.isArray(keys) ? keys : []).filter((k) => PRESETS_BY_KEY[k]))];
  if (!wanted.length) {
    const e = new Error("Choose at least one template.");
    e.status = 400;
    throw e;
  }
  const current = new Map((await listStorePresets(agencyId, integration)).map((p) => [p.key, p.template]));
  const results = [];
  for (const key of wanted) {
    const preset = PRESETS_BY_KEY[key];
    const existing = current.get(key);
    if (existing && existing.status !== "REJECTED") {
      results.push({ key, ok: true, skipped: true, status: existing.status, templateId: existing.id });
      continue;
    }
    // A rejected one keeps its name at Meta: it is edited and sent for review again.
    if (existing?.status === "REJECTED") {
      try {
        const [[row]] = await pool.query("SELECT meta_template_id FROM whatsapp_templates WHERE id = ?", [existing.id]);
        if (row?.meta_template_id) {
          const { category, components } = presetMetaPayload(preset);
          await axios.post(`${GRAPH_URL}/${row.meta_template_id}`, { category, components }, {
            headers: { Authorization: `Bearer ${integration.access_token}`, "Content-Type": "application/json" },
            timeout: 20000,
          });
          await saveRow(agencyId, integration, preset, { metaId: row.meta_template_id, status: "PENDING", category });
          results.push({ key, ok: true, status: "PENDING", templateId: existing.id });
          continue;
        }
      } catch (err) {
        console.error(`[Store templates] resubmit ${preset.name}:`, err.response?.data || err.message);
        results.push({ key, ok: false, message: metaError(err) });
        continue;
      }
    }
    try {
      const res = await axios.post(`${GRAPH_URL}/${integration.wa_business_acc_id}/message_templates`, presetMetaPayload(preset), {
        headers: { Authorization: `Bearer ${integration.access_token}`, "Content-Type": "application/json" },
        timeout: 20000,
      });
      const status = String(res.data?.status || "PENDING").toUpperCase();
      const templateId = await saveRow(agencyId, integration, preset, { metaId: res.data?.id, status, category: res.data?.category });
      results.push({ key, ok: true, status, templateId });
    } catch (err) {
      // Already on this WhatsApp account (made earlier, or elsewhere): link it instead.
      const already = /already exists|2388024|2388023/i.test(`${metaError(err)} ${err.response?.data?.error?.error_subcode || ""}`);
      if (already) {
        try {
          const found = await fetchMetaTemplateByName(integration, preset.name);
          if (found) {
            const status = String(found.status || "PENDING").toUpperCase();
            const templateId = await saveRow(agencyId, integration, preset, {
              metaId: found.id, status, category: found.category, reason: found.rejected_reason, content: contentFromMeta(found),
            });
            results.push({ key, ok: true, adopted: true, status, templateId });
            continue;
          }
        } catch (lookupErr) {
          console.warn("[Store templates] lookup after duplicate:", metaError(lookupErr));
        }
      }
      console.error(`[Store templates] ${preset.name}:`, err.response?.data || err.message);
      results.push({ key, ok: false, message: metaError(err) });
    }
  }
  return results;
}

/** Pulls the review status of this number's store templates from Meta. */
export async function refreshStorePresets(agencyId, integration) {
  assertWaba(integration);
  const [rows] = await pool.query(
    "SELECT id, template_name, preset_key FROM whatsapp_templates WHERE agency_id = ? AND integration_id = ? AND preset_key IS NOT NULL",
    [agencyId, integration.id]
  );
  for (const row of rows) {
    try {
      const found = await fetchMetaTemplateByName(integration, row.template_name);
      if (!found) continue;
      await pool.query(
        "UPDATE whatsapp_templates SET status = ?, category = ?, rejection_reason = ?, meta_template_id = ? WHERE id = ?",
        [String(found.status || "PENDING").toUpperCase(), String(found.category || "UTILITY").toUpperCase(),
          found.rejected_reason && found.rejected_reason !== "NONE" ? found.rejected_reason : null, found.id, row.id]
      );
    } catch (err) {
      console.warn(`[Store templates] status of ${row.template_name}:`, metaError(err));
    }
  }
  return listStorePresets(agencyId, integration);
}
