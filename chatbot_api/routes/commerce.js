/**
 * WhatsApp Shopify/WooCommerce integration — connect a store, sync its
 * products, and (via utils/commerceService.js) look them up for a bot flow
 * to send as a "buy this" message. See utils/commerceService.js's top
 * comment for the real, hard external-credential blocker on Shopify/
 * WooCommerce testing.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requireModule, assertLimit } from "../utils/entitlements.js";
import { encryptSecret } from "../utils/cryptoVault.js";
import {
  getShopifyAppCredentials, saveShopifyAppCredentials,
  buildShopifyAuthUrl, verifyShopifyHmac, exchangeShopifyCode,
  testWooCommerceConnection, syncConnection,
} from "../utils/commerceService.js";

const router = express.Router();

// ─── ADMIN: Platform Shopify Partner app credentials (one app, shared by
// every agency's OAuth install — same idea as the Meta/TikTok app settings
// an agency pastes in, but here it's the platform's own app) ────────────────
router.put("/admin/commerce/shopify-app", authMiddleware, roleMiddleware("ADMIN"), async (req, res) => {
  try {
    const { clientId, clientSecret } = req.body || {};
    if (!clientId || !clientSecret) {
      return res.status(400).json({ success: false, message: "clientId and clientSecret are required" });
    }
    await saveShopifyAppCredentials(clientId, clientSecret);
    return res.json({ success: true, message: "Shopify app credentials saved" });
  } catch (err) {
    console.error("Save Shopify app credentials error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/admin/commerce/shopify-app", authMiddleware, roleMiddleware("ADMIN"), async (req, res) => {
  try {
    const creds = await getShopifyAppCredentials();
    return res.json({ success: true, configured: Boolean(creds), clientId: creds?.clientId || null });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// The OAuth callback is hit directly by Shopify's redirect (no Authorization
// header) — registered BEFORE the authMiddleware gate below, same pattern
// routes/googleSheets.js already uses for the identical reason.
router.get("/commerce/shopify/callback", async (req, res) => {
  const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
  const { code, shop, state, hmac } = req.query;

  try {
    if (!code || !shop || !state) throw new Error("Missing code/shop/state");
    const agencyId = Number(state);
    if (!agencyId) throw new Error("Invalid state");

    const appCreds = await getShopifyAppCredentials();
    if (!appCreds) throw new Error("Shopify app is not configured on this server yet");

    if (hmac && !verifyShopifyHmac(req.query, appCreds.clientSecret)) {
      throw new Error("Shopify callback signature verification failed");
    }

    const accessToken = await exchangeShopifyCode({ shopDomain: shop, code, clientId: appCreds.clientId, clientSecret: appCreds.clientSecret });
    const encrypted = encryptSecret({ accessToken });

    await pool.query(
      `INSERT INTO commerce_connections (agency_id, platform, store_domain, credentials, is_active)
       VALUES (?, 'SHOPIFY', ?, ?, 1)
       ON DUPLICATE KEY UPDATE store_domain = VALUES(store_domain), credentials = VALUES(credentials), is_active = 1, updated_at = NOW()`,
      [agencyId, shop, encrypted]
    );

    return res.redirect(`${frontendUrl}/agency/commerce?connected=1&platform=shopify`);
  } catch (err) {
    console.error("Shopify OAuth callback failed:", err.message);
    return res.redirect(`${frontendUrl}/agency/commerce?connected=0&reason=${encodeURIComponent(err.message)}`);
  }
});

router.use("/commerce", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), requireModule("feature_whatsapp_commerce"));

// ─── LIST CONNECTIONS ─────────────────────────────────────────────────────────
router.get("/commerce/connections", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id, c.platform, c.store_domain, c.is_active, c.last_synced_at, c.last_sync_error, c.created_at,
              (SELECT COUNT(*) FROM commerce_products p WHERE p.connection_id = c.id) as productCount
       FROM commerce_connections c WHERE c.agency_id = ? ORDER BY c.created_at DESC`,
      [req.user.agencyId]
    );
    return res.json({ success: true, connections: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── SHOPIFY: START OAUTH INSTALL ────────────────────────────────────────────
router.get("/commerce/shopify/auth-url", async (req, res) => {
  try {
    const { storeDomain } = req.query;
    if (!storeDomain) return res.status(400).json({ success: false, message: "storeDomain is required" });

    const appCreds = await getShopifyAppCredentials();
    if (!appCreds) {
      return res.status(400).json({ success: false, message: "Shopify isn't configured on this server yet — an admin needs to add the Partner app credentials first." });
    }

    await assertLimit(req.user.agencyId, "max_shopify_woo_stores", 1, req.user?.id);

    const backendUrl = (process.env.BACKEND_URL || "http://localhost:5000").replace(/\/+$/, "");
    const url = buildShopifyAuthUrl({
      shopDomain: storeDomain,
      clientId: appCreds.clientId,
      redirectUri: `${backendUrl}/api/v1/commerce/shopify/callback`,
      state: String(req.user.agencyId),
    });
    return res.json({ success: true, url });
  } catch (err) {
    console.error(err);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Server error", code: err.code });
  }
});

// ─── WOOCOMMERCE: CONNECT (no OAuth — static REST keys) ──────────────────────
router.post("/commerce/woocommerce/connect", async (req, res) => {
  try {
    const { storeDomain, consumerKey, consumerSecret } = req.body || {};
    if (!storeDomain || !consumerKey || !consumerSecret) {
      return res.status(400).json({ success: false, message: "storeDomain, consumerKey, and consumerSecret are required" });
    }

    await assertLimit(req.user.agencyId, "max_shopify_woo_stores", 1, req.user?.id);

    const works = await testWooCommerceConnection({ storeDomain, consumerKey, consumerSecret });
    if (!works) {
      return res.status(400).json({ success: false, message: "Couldn't connect to that WooCommerce store — check the domain and keys." });
    }

    const encrypted = encryptSecret({ consumerKey, consumerSecret });
    await pool.query(
      `INSERT INTO commerce_connections (agency_id, platform, store_domain, credentials, is_active)
       VALUES (?, 'WOOCOMMERCE', ?, ?, 1)
       ON DUPLICATE KEY UPDATE store_domain = VALUES(store_domain), credentials = VALUES(credentials), is_active = 1, updated_at = NOW()`,
      [req.user.agencyId, storeDomain, encrypted]
    );

    return res.json({ success: true, message: "WooCommerce store connected" });
  } catch (err) {
    console.error("WooCommerce connect error:", err.response?.data || err.message);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to connect WooCommerce store", code: err.code });
  }
});

// ─── SYNC NOW ─────────────────────────────────────────────────────────────────
router.post("/commerce/connections/:id/sync", async (req, res) => {
  try {
    const [[connection]] = await pool.query(
      "SELECT * FROM commerce_connections WHERE id = ? AND agency_id = ?",
      [req.params.id, req.user.agencyId]
    );
    if (!connection) return res.status(404).json({ success: false, message: "Connection not found" });

    const result = await syncConnection(connection);
    await pool.query("UPDATE commerce_connections SET last_synced_at = NOW(), last_sync_error = NULL WHERE id = ?", [connection.id]);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error("Commerce sync error:", err.response?.data || err.message);
    await pool.query("UPDATE commerce_connections SET last_sync_error = ? WHERE id = ?", [err.message?.slice(0, 500), req.params.id]).catch(() => {});
    return res.status(500).json({ success: false, message: err.message || "Sync failed" });
  }
});

// ─── DISCONNECT ───────────────────────────────────────────────────────────────
router.delete("/commerce/connections/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM commerce_connections WHERE id = ? AND agency_id = ?", [req.params.id, req.user.agencyId]);
    return res.json({ success: true, message: "Store disconnected" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── PRODUCTS (for a bot flow's product lookup / "buy this" message) ────────
router.get("/commerce/products", async (req, res) => {
  try {
    const { connectionId, search } = req.query;
    const conditions = ["cc.agency_id = ?"];
    const params = [req.user.agencyId];
    if (connectionId) { conditions.push("p.connection_id = ?"); params.push(connectionId); }
    if (search) { conditions.push("p.title LIKE ?"); params.push(`%${search}%`); }

    const [rows] = await pool.query(
      `SELECT p.* FROM commerce_products p
       JOIN commerce_connections cc ON cc.id = p.connection_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY p.synced_at DESC LIMIT 100`,
      params
    );
    return res.json({ success: true, products: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
