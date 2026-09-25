/**
 * Shopify / WooCommerce stores + Automation → Commerce campaigns.
 *
 * Stores: Settings → App Integrations → Store API, and Automation → Commerce
 * → Store Connections (same component). Shopify connects with its store
 * subdomain + an Admin API access token, or + a Dev Dashboard app's client
 * id/secret; WooCommerce with store URL + REST consumer key/secret. Both are
 * verified live before saving and stored encrypted (utils/commerceService.js).
 * Connecting / disconnecting a store is owner-only (it handles store
 * credentials); team members can run campaigns.
 *
 * Campaigns: one trigger (order created / COD verification / paid / shipped /
 * delivered / cancelled / refunded / abandoned cart) → one approved WhatsApp
 * template on one WhatsApp bot account, sent after a delay. Engine:
 * utils/commerceEvents.js.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requireModule, assertLimit } from "../utils/entitlements.js";
import { encryptSecret } from "../utils/cryptoVault.js";
import { verifyShopify, verifyWooCommerce, syncConnection } from "../utils/commerceService.js";
import {
  COMMERCE_TRIGGERS, COMMERCE_FIELDS, TRIGGER_IDS, describeTemplate, pollConnection,
} from "../utils/commerceEvents.js";
import { logAuditEvent } from "../utils/auditLog.js";

const router = express.Router();
router.use("/commerce", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), requireModule("feature_whatsapp_commerce"));
const ownerOnly = roleMiddleware("RESELLER", "ADMIN");

const agencyOf = (req) => req.tenant?.agencyId ?? req.user.agencyId;
const fail = (res, err, fallback = "Server error") => {
  if (!err.status) console.error("[commerce]", err);
  return res.status(err.status || 500).json({ success: false, message: err.status ? err.message : fallback, code: err.code });
};
const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

const CONNECTION_COLUMNS = `c.id, c.platform, c.name, c.store_domain, c.store_name, c.currency, c.auth_mode, c.is_active,
  c.last_polled_at, c.last_poll_error, c.last_synced_at, c.last_sync_error, c.created_at`;

// ─── Reference data for the editors ──────────────────────────────────────────
router.get("/commerce/meta", (req, res) => {
  res.json({ success: true, triggers: COMMERCE_TRIGGERS, fields: COMMERCE_FIELDS });
});

// ─── STORES ──────────────────────────────────────────────────────────────────
router.get("/commerce/connections", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ${CONNECTION_COLUMNS},
         (SELECT COUNT(*) FROM commerce_orders o WHERE o.connection_id = c.id) AS orderCount,
         (SELECT COUNT(*) FROM commerce_carts k WHERE k.connection_id = c.id AND k.status = 'OPEN') AS openCartCount,
         (SELECT COUNT(*) FROM commerce_campaigns cp WHERE cp.connection_id = c.id AND cp.is_active = 1) AS activeCampaignCount,
         (SELECT COUNT(*) FROM commerce_products p WHERE p.connection_id = c.id) AS productCount
       FROM commerce_connections c WHERE c.agency_id = ? ORDER BY c.created_at DESC`,
      [agencyOf(req)]
    );
    return res.json({ success: true, connections: rows });
  } catch (err) {
    return fail(res, err);
  }
});

router.post("/commerce/connections", ownerOnly, async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const { platform, name } = req.body || {};
    let verified;
    if (platform === "SHOPIFY") {
      verified = await verifyShopify({
        storeDomain: req.body.storeDomain,
        accessToken: req.body.accessToken,
        clientId: req.body.clientId,
        clientSecret: req.body.clientSecret,
      });
    } else if (platform === "WOOCOMMERCE") {
      verified = await verifyWooCommerce({
        storeUrl: req.body.storeUrl,
        consumerKey: req.body.consumerKey,
        consumerSecret: req.body.consumerSecret,
      });
    } else {
      throw badRequest("Choose Shopify or WooCommerce.");
    }

    const [[existing]] = await pool.query(
      "SELECT id FROM commerce_connections WHERE agency_id = ? AND platform = ? AND store_domain = ?",
      [agencyId, platform, verified.storeDomain]
    );
    const profileName = String(name || "").trim().slice(0, 120) || verified.storeName;
    if (existing) {
      // Reconnect: new credentials, same cursors (no replay of past orders).
      await pool.query(
        `UPDATE commerce_connections SET name = ?, auth_mode = ?, credentials = ?, access_token_expires_at = ?,
           store_name = ?, currency = ?, is_active = 1, last_poll_error = NULL WHERE id = ?`,
        [profileName, verified.authMode, encryptSecret(verified.credentials), verified.expiresAt, verified.storeName, verified.currency, existing.id]
      );
    } else {
      await assertLimit(agencyId, "max_shopify_woo_stores", 1, req.user.id);
      await pool.query(
        `INSERT INTO commerce_connections (agency_id, platform, name, store_domain, auth_mode, credentials, access_token_expires_at,
           store_name, currency, is_active, orders_cursor, carts_cursor)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
        [agencyId, platform, profileName, verified.storeDomain, verified.authMode, encryptSecret(verified.credentials), verified.expiresAt, verified.storeName, verified.currency]
      );
    }
    logAuditEvent({
      agencyId, actor: req.user, action: existing ? "commerce.store.reconnect" : "commerce.store.connect",
      entityType: "commerce_connection", entityLabel: profileName,
      summary: `${existing ? "Reconnected" : "Connected"} ${platform === "SHOPIFY" ? "Shopify" : "WooCommerce"} store ${verified.storeDomain}`,
    });
    return res.json({ success: true, message: `${verified.storeName} connected` });
  } catch (err) {
    return fail(res, err, "Failed to connect the store");
  }
});

router.patch("/commerce/connections/:id", ownerOnly, async (req, res) => {
  try {
    const sets = [];
    const params = [];
    if (req.body.name !== undefined) { sets.push("name = ?"); params.push(String(req.body.name).trim().slice(0, 120) || null); }
    if (req.body.isActive !== undefined) { sets.push("is_active = ?"); params.push(req.body.isActive ? 1 : 0); }
    if (!sets.length) throw badRequest("Nothing to update");
    const [r] = await pool.query(`UPDATE commerce_connections SET ${sets.join(", ")} WHERE id = ? AND agency_id = ?`, [...params, req.params.id, agencyOf(req)]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Store not found" });
    return res.json({ success: true, message: "Store updated" });
  } catch (err) {
    return fail(res, err);
  }
});

// "Check now": reads new orders/carts immediately (normally every minute).
router.post("/commerce/connections/:id/poll", async (req, res) => {
  const [[connection]] = await pool.query("SELECT * FROM commerce_connections WHERE id = ? AND agency_id = ?", [req.params.id, agencyOf(req)]);
  if (!connection) return res.status(404).json({ success: false, message: "Store not found" });
  try {
    const result = await pollConnection(connection);
    return res.json({ success: true, ...result, message: `Checked — ${result.orderCount} order update(s), ${result.cartCount} checkout update(s).` });
  } catch (err) {
    await pool.query("UPDATE commerce_connections SET last_polled_at = NOW(), last_poll_error = ? WHERE id = ?", [String(err.message).slice(0, 500), connection.id]);
    return res.status(502).json({ success: false, message: err.message });
  }
});

router.post("/commerce/connections/:id/sync", async (req, res) => {
  const [[connection]] = await pool.query("SELECT * FROM commerce_connections WHERE id = ? AND agency_id = ?", [req.params.id, agencyOf(req)]);
  if (!connection) return res.status(404).json({ success: false, message: "Store not found" });
  try {
    const result = await syncConnection(connection);
    await pool.query("UPDATE commerce_connections SET last_synced_at = NOW(), last_sync_error = NULL WHERE id = ?", [connection.id]);
    return res.json({ success: true, ...result });
  } catch (err) {
    await pool.query("UPDATE commerce_connections SET last_sync_error = ? WHERE id = ?", [String(err.message).slice(0, 500), connection.id]);
    return res.status(502).json({ success: false, message: err.message || "Sync failed" });
  }
});

router.delete("/commerce/connections/:id", ownerOnly, async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const [[row]] = await pool.query("SELECT store_domain, name FROM commerce_connections WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!row) return res.status(404).json({ success: false, message: "Store not found" });
    await pool.query("DELETE FROM commerce_connections WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    logAuditEvent({
      agencyId, actor: req.user, action: "commerce.store.disconnect", entityType: "commerce_connection",
      entityId: Number(req.params.id), entityLabel: row.name || row.store_domain, summary: `Disconnected store ${row.store_domain}`,
    });
    return res.json({ success: true, message: "Store disconnected — its campaigns were removed too" });
  } catch (err) {
    return fail(res, err);
  }
});

router.get("/commerce/products", async (req, res) => {
  try {
    const { connectionId, search } = req.query;
    const conditions = ["cc.agency_id = ?"];
    const params = [agencyOf(req)];
    if (connectionId) { conditions.push("p.connection_id = ?"); params.push(connectionId); }
    if (search) { conditions.push("p.title LIKE ?"); params.push(`%${search}%`); }
    const [rows] = await pool.query(
      `SELECT p.id, p.connection_id, p.external_product_id, p.title, p.price, p.currency, p.image_url, p.product_url, p.synced_at
       FROM commerce_products p JOIN commerce_connections cc ON cc.id = p.connection_id
       WHERE ${conditions.join(" AND ")} ORDER BY p.synced_at DESC LIMIT 100`,
      params
    );
    return res.json({ success: true, products: rows });
  } catch (err) {
    return fail(res, err);
  }
});

// ─── TEMPLATES for the campaign editor ───────────────────────────────────────
router.get("/commerce/templates", async (req, res) => {
  try {
    const integrationId = Number(req.query.integrationId);
    if (!integrationId) throw badRequest("integrationId is required");
    const [rows] = await pool.query(
      `SELECT id, template_name, language, category, header_type, header_text, body_text, footer_text, buttons_json
       FROM whatsapp_templates
       WHERE agency_id = ? AND status = 'APPROVED' AND (integration_id = ? OR integration_id IS NULL)
       ORDER BY template_name`,
      [agencyOf(req), integrationId]
    );
    return res.json({
      success: true,
      templates: rows.map((t) => ({ ...t, placeholders: describeTemplate(t) })),
    });
  } catch (err) {
    return fail(res, err);
  }
});

// ─── CAMPAIGNS ───────────────────────────────────────────────────────────────
const FIELD_IDS = new Set(COMMERCE_FIELDS.map((f) => f.id));

function cleanSource(value, trigger) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  if (s.startsWith("text:")) return s.slice(0, 205);
  if (!FIELD_IDS.has(s)) throw badRequest(`Unknown variable source "${s}"`);
  const field = COMMERCE_FIELDS.find((f) => f.id === s);
  if (field.scope === "cart" && trigger !== "ABANDONED_CART") throw badRequest(`"${field.label}" is only available for abandoned-cart campaigns`);
  if (field.scope === "order" && trigger === "ABANDONED_CART") throw badRequest(`"${field.label}" is not available for abandoned-cart campaigns`);
  return s;
}

async function validateCampaign(agencyId, body, existing = null) {
  const pick = (k, fallback) => (body[k] !== undefined ? body[k] : fallback);
  const name = String(pick("name", existing?.name) || "").trim().slice(0, 150);
  if (!name) throw badRequest("Campaign name is required");
  const trigger = pick("triggerEvent", existing?.trigger_event);
  if (!TRIGGER_IDS.has(trigger)) throw badRequest("Choose what triggers this campaign");

  const connectionId = Number(pick("connectionId", existing?.connection_id));
  const [[connection]] = await pool.query("SELECT id, platform FROM commerce_connections WHERE id = ? AND agency_id = ?", [connectionId, agencyId]);
  if (!connection) throw badRequest("Choose one of your connected stores");
  if (trigger === "ORDER_DELIVERED" && connection.platform !== "SHOPIFY") throw badRequest("\"Order delivered\" is only available for Shopify stores");

  const integrationId = Number(pick("integrationId", existing?.integration_id));
  const [[integration]] = await pool.query(
    "SELECT id FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'WHATSAPP'",
    [integrationId, agencyId]
  );
  if (!integration) throw badRequest("Choose the WhatsApp account that sends these messages");

  const templateId = Number(pick("templateId", existing?.template_id));
  const [[tpl]] = await pool.query(
    "SELECT * FROM whatsapp_templates WHERE id = ? AND agency_id = ? AND status = 'APPROVED' AND (integration_id = ? OR integration_id IS NULL)",
    [templateId, agencyId, integrationId]
  );
  if (!tpl) throw badRequest("Choose an approved template of that WhatsApp account");
  const desc = describeTemplate(tpl);
  if (trigger === "COD_VERIFICATION" && desc.quickReplyCount < 2) {
    throw badRequest("A COD verification template needs two quick-reply buttons (first = Confirm, second = Cancel)");
  }

  const rawMap = pick("variableMap", existing ? (typeof existing.variable_map === "string" ? JSON.parse(existing.variable_map || "{}") : existing.variable_map || {}) : {}) || {};
  const variableMap = { header: {}, body: {}, buttons: {} };
  for (const [section, placeholders] of [["header", desc.header], ["body", desc.body]]) {
    for (const ph of placeholders) {
      const src = cleanSource(rawMap[section]?.[ph], trigger);
      if (!src) throw badRequest(`Choose a value for {{${ph}}} in the template ${section}`);
      variableMap[section][ph] = src;
    }
  }
  for (const b of desc.buttons.filter((x) => x.dynamic)) {
    const src = cleanSource(rawMap.buttons?.[b.index], trigger);
    if (!src) throw badRequest(`Choose a value for the link of the "${b.text}" button`);
    variableMap.buttons[b.index] = src;
  }

  const delay = Number(pick("delayMinutes", existing?.delay_minutes ?? 0));
  if (!Number.isInteger(delay) || delay < 0 || delay > 10080) throw badRequest("Delay must be between 0 and 10080 minutes (7 days)");
  if (trigger === "ABANDONED_CART" && delay < 10) throw badRequest("Wait at least 10 minutes before an abandoned-cart message");

  const countryCode = String(pick("defaultCountryCode", existing?.default_country_code) || "").replace(/\D/g, "").slice(0, 4) || null;

  const labelId = pick("labelId", existing?.label_id) ? Number(pick("labelId", existing?.label_id)) : null;
  if (labelId) {
    const [[label]] = await pool.query("SELECT id FROM labels WHERE id = ? AND agency_id = ?", [labelId, agencyId]);
    if (!label) throw badRequest("That label doesn't exist");
  }
  const sequenceId = pick("sequenceId", existing?.sequence_id) ? Number(pick("sequenceId", existing?.sequence_id)) : null;
  if (sequenceId) {
    // Bot scope: a sequence only runs on its own bot account.
    const [[seq]] = await pool.query("SELECT id FROM sequences WHERE id = ? AND agency_id = ? AND integration_id = ?", [sequenceId, agencyId, integrationId]);
    if (!seq) throw badRequest("Choose a sequence of the same WhatsApp account");
  }

  const confirmAction = pick("codConfirmAction", existing?.cod_confirm_action || "NOTE");
  const cancelAction = pick("codCancelAction", existing?.cod_cancel_action || "CANCEL");
  if (!["NOTE", "PROCESSING"].includes(confirmAction) || !["NOTE", "CANCEL"].includes(cancelAction)) throw badRequest("Invalid COD action");

  const text = (k, col) => {
    const v = pick(k, existing?.[col]);
    return v ? String(v).trim().slice(0, 1000) || null : null;
  };
  return {
    name, trigger, connectionId, integrationId, templateId, variableMap, delay, countryCode, labelId, sequenceId,
    confirmAction, cancelAction, confirmReply: text("codConfirmReply", "cod_confirm_reply"), cancelReply: text("codCancelReply", "cod_cancel_reply"),
    isActive: pick("isActive", existing ? Boolean(existing.is_active) : true) ? 1 : 0,
  };
}

const CAMPAIGN_SELECT = `
  SELECT cp.*, cc.name AS store_label, cc.store_domain, cc.platform AS store_platform,
         i.name AS integration_name, t.template_name,
         (SELECT COUNT(*) FROM commerce_campaign_sends s WHERE s.campaign_id = cp.id AND s.status = 'SENT') AS sentCount,
         (SELECT COUNT(*) FROM commerce_campaign_sends s WHERE s.campaign_id = cp.id AND s.status = 'FAILED') AS failedCount,
         (SELECT COUNT(*) FROM commerce_campaign_sends s WHERE s.campaign_id = cp.id AND s.status = 'SCHEDULED') AS scheduledCount
  FROM commerce_campaigns cp
  JOIN commerce_connections cc ON cc.id = cp.connection_id
  LEFT JOIN integrations i ON i.id = cp.integration_id
  LEFT JOIN whatsapp_templates t ON t.id = cp.template_id`;

router.get("/commerce/campaigns", async (req, res) => {
  try {
    const [rows] = await pool.query(`${CAMPAIGN_SELECT} WHERE cp.agency_id = ? ORDER BY cp.created_at DESC`, [agencyOf(req)]);
    return res.json({ success: true, campaigns: rows });
  } catch (err) {
    return fail(res, err);
  }
});

router.get("/commerce/campaigns/:id", async (req, res) => {
  try {
    const [[row]] = await pool.query(`${CAMPAIGN_SELECT} WHERE cp.id = ? AND cp.agency_id = ?`, [req.params.id, agencyOf(req)]);
    if (!row) return res.status(404).json({ success: false, message: "Campaign not found" });
    return res.json({ success: true, campaign: row });
  } catch (err) {
    return fail(res, err);
  }
});

router.post("/commerce/campaigns", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const v = await validateCampaign(agencyId, req.body || {});
    const [ins] = await pool.query(
      `INSERT INTO commerce_campaigns (agency_id, connection_id, integration_id, name, trigger_event, template_id, variable_map,
         delay_minutes, default_country_code, label_id, sequence_id, cod_confirm_action, cod_cancel_action,
         cod_confirm_reply, cod_cancel_reply, is_active, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [agencyId, v.connectionId, v.integrationId, v.name, v.trigger, v.templateId, JSON.stringify(v.variableMap),
        v.delay, v.countryCode, v.labelId, v.sequenceId, v.confirmAction, v.cancelAction, v.confirmReply, v.cancelReply, v.isActive, req.user.id]
    );
    return res.status(201).json({ success: true, id: ins.insertId, message: "Campaign created" });
  } catch (err) {
    return fail(res, err);
  }
});

router.put("/commerce/campaigns/:id", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const [[existing]] = await pool.query("SELECT * FROM commerce_campaigns WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!existing) return res.status(404).json({ success: false, message: "Campaign not found" });
    const v = await validateCampaign(agencyId, req.body || {}, existing);
    await pool.query(
      `UPDATE commerce_campaigns SET connection_id = ?, integration_id = ?, name = ?, trigger_event = ?, template_id = ?, variable_map = ?,
         delay_minutes = ?, default_country_code = ?, label_id = ?, sequence_id = ?, cod_confirm_action = ?, cod_cancel_action = ?,
         cod_confirm_reply = ?, cod_cancel_reply = ?, is_active = ?
       WHERE id = ? AND agency_id = ?`,
      [v.connectionId, v.integrationId, v.name, v.trigger, v.templateId, JSON.stringify(v.variableMap),
        v.delay, v.countryCode, v.labelId, v.sequenceId, v.confirmAction, v.cancelAction, v.confirmReply, v.cancelReply, v.isActive,
        req.params.id, agencyId]
    );
    return res.json({ success: true, message: "Campaign saved" });
  } catch (err) {
    return fail(res, err);
  }
});

router.patch("/commerce/campaigns/:id/toggle", async (req, res) => {
  try {
    const [r] = await pool.query(
      "UPDATE commerce_campaigns SET is_active = ? WHERE id = ? AND agency_id = ?",
      [req.body?.isActive ? 1 : 0, req.params.id, agencyOf(req)]
    );
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Campaign not found" });
    return res.json({ success: true, message: req.body?.isActive ? "Campaign activated" : "Campaign paused" });
  } catch (err) {
    return fail(res, err);
  }
});

router.delete("/commerce/campaigns/:id", async (req, res) => {
  try {
    const [r] = await pool.query("DELETE FROM commerce_campaigns WHERE id = ? AND agency_id = ?", [req.params.id, agencyOf(req)]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Campaign not found" });
    return res.json({ success: true, message: "Campaign deleted" });
  } catch (err) {
    return fail(res, err);
  }
});

// ─── ACTIVITY / ORDERS / CARTS ───────────────────────────────────────────────
const pageParams = (req) => {
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
  const page = Math.max(1, Number(req.query.page) || 1);
  return { pageSize, offset: (page - 1) * pageSize, page };
};

router.get("/commerce/activity", async (req, res) => {
  try {
    const { pageSize, offset, page } = pageParams(req);
    const where = ["s.agency_id = ?"];
    const params = [agencyOf(req)];
    if (req.query.campaignId) { where.push("s.campaign_id = ?"); params.push(Number(req.query.campaignId)); }
    if (["SCHEDULED", "SENDING", "SENT", "FAILED", "SKIPPED"].includes(req.query.status)) { where.push("s.status = ?"); params.push(req.query.status); }
    const [rows] = await pool.query(
      `SELECT s.id, s.campaign_id, s.status, s.error, s.phone, s.send_at, s.sent_at, s.created_at, s.contact_id, s.conversation_id,
              cp.name AS campaign_name, cp.trigger_event,
              o.order_number, o.customer_name AS order_customer, o.cod_status,
              k.customer_name AS cart_customer, k.total AS cart_total, k.currency AS cart_currency, k.status AS cart_status
       FROM commerce_campaign_sends s
       JOIN commerce_campaigns cp ON cp.id = s.campaign_id
       LEFT JOIN commerce_orders o ON o.id = s.order_id
       LEFT JOIN commerce_carts k ON k.id = s.cart_id
       WHERE ${where.join(" AND ")}
       ORDER BY s.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM commerce_campaign_sends s WHERE ${where.join(" AND ")}`, params);
    return res.json({ success: true, activity: rows, total, page, pageSize });
  } catch (err) {
    return fail(res, err);
  }
});

router.get("/commerce/orders", async (req, res) => {
  try {
    const { pageSize, offset, page } = pageParams(req);
    const where = ["cc.agency_id = ?"];
    const params = [agencyOf(req)];
    if (req.query.connectionId) { where.push("o.connection_id = ?"); params.push(Number(req.query.connectionId)); }
    if (req.query.cod === "1") where.push("o.is_cod = 1");
    const [rows] = await pool.query(
      `SELECT o.id, o.connection_id, o.external_order_id, o.order_number, o.customer_name, o.customer_phone, o.status, o.total, o.currency,
              o.financial_status, o.fulfillment_status, o.payment_method, o.is_cod, o.cod_status, o.cod_responded_at, o.order_url,
              o.external_created_at, cc.name AS store_label, cc.platform
       FROM commerce_orders o JOIN commerce_connections cc ON cc.id = o.connection_id
       WHERE ${where.join(" AND ")}
       ORDER BY COALESCE(o.external_created_at, o.created_at) DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM commerce_orders o JOIN commerce_connections cc ON cc.id = o.connection_id WHERE ${where.join(" AND ")}`, params);
    return res.json({ success: true, orders: rows, total, page, pageSize });
  } catch (err) {
    return fail(res, err);
  }
});

router.get("/commerce/carts", async (req, res) => {
  try {
    const { pageSize, offset, page } = pageParams(req);
    const where = ["cc.agency_id = ?"];
    const params = [agencyOf(req)];
    if (req.query.connectionId) { where.push("k.connection_id = ?"); params.push(Number(req.query.connectionId)); }
    if (["OPEN", "RECOVERED", "CLOSED"].includes(req.query.status)) { where.push("k.status = ?"); params.push(req.query.status); }
    const [rows] = await pool.query(
      `SELECT k.id, k.connection_id, k.customer_name, k.customer_phone, k.total, k.currency, k.items_summary, k.recovery_url, k.status,
              k.external_created_at, k.external_updated_at, cc.name AS store_label, cc.platform
       FROM commerce_carts k JOIN commerce_connections cc ON cc.id = k.connection_id
       WHERE ${where.join(" AND ")}
       ORDER BY COALESCE(k.external_updated_at, k.created_at) DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM commerce_carts k JOIN commerce_connections cc ON cc.id = k.connection_id WHERE ${where.join(" AND ")}`, params);
    return res.json({ success: true, carts: rows, total, page, pageSize });
  } catch (err) {
    return fail(res, err);
  }
});

export default router;
