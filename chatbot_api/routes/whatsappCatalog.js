/** Bot Manager → Product Catalog Sync / Product Messages (WhatsApp) — utils/whatsappCatalog.js. */
import express from "express";
import axios from "axios";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { GRAPH_URL } from "../utils/metaApi.js";
import { waRecipient } from "../utils/whatsappIdentity.js";
import { saveMessage } from "../utils/messageProcessor.js";
import { emitToAgency, emitToConversation } from "../utils/socket.js";
import {
  getCatalogInfo, saveCatalogLink, setCommerceSettings, listCatalogProducts, syncStoreToCatalog, buildProductMessage, metaError,
} from "../utils/whatsappCatalog.js";

const router = express.Router();
router.use("/wa-catalog", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

const agencyOf = (req) => req.tenant?.agencyId ?? req.user.agencyId;
async function loadIntegration(req, id) {
  const [[row]] = await pool.query("SELECT * FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'WHATSAPP'", [id, agencyOf(req)]);
  return row || null;
}
const fail = (res, err, what) => {
  if (err.status) return res.status(err.status).json({ success: false, message: err.message });
  console.error(`[WA Catalog] ${what}:`, err.response?.data || err.message);
  return res.status(err.response ? 400 : 500).json({ success: false, message: err.response ? metaError(err) : "Server error" });
};

router.get("/wa-catalog/:integrationId", async (req, res) => {
  try {
    const integration = await loadIntegration(req, req.params.integrationId);
    if (!integration) return res.status(404).json({ success: false, message: "WhatsApp number not found" });
    const [stores] = await pool.query(
      `SELECT c.id, c.name, c.platform, c.store_domain, (SELECT COUNT(*) FROM commerce_products p WHERE p.connection_id = c.id) AS product_count
         FROM commerce_connections c WHERE c.agency_id = ? ORDER BY c.id`,
      [integration.agency_id]
    );
    return res.json({ success: true, catalog: await getCatalogInfo(integration), stores });
  } catch (err) {
    return fail(res, err, "info");
  }
});

router.put("/wa-catalog/:integrationId", async (req, res) => {
  try {
    const integration = await loadIntegration(req, req.params.integrationId);
    if (!integration) return res.status(404).json({ success: false, message: "WhatsApp number not found" });
    const b = req.body || {};
    await saveCatalogLink(integration, { catalogId: b.catalogId, connectionId: b.connectionId });
    if (b.catalogVisible !== undefined || b.cartEnabled !== undefined) {
      await setCommerceSettings(integration, { catalogVisible: b.catalogVisible, cartEnabled: b.cartEnabled });
    }
    return res.json({ success: true, catalog: await getCatalogInfo(integration) });
  } catch (err) {
    return fail(res, err, "save");
  }
});

router.post("/wa-catalog/:integrationId/sync", async (req, res) => {
  try {
    const integration = await loadIntegration(req, req.params.integrationId);
    if (!integration) return res.status(404).json({ success: false, message: "WhatsApp number not found" });
    const result = await syncStoreToCatalog(integration, req.body?.catalogId, req.body?.connectionId);
    return res.json({ success: true, ...result });
  } catch (err) {
    return fail(res, err, "sync");
  }
});

router.get("/wa-catalog/:integrationId/products", async (req, res) => {
  try {
    const integration = await loadIntegration(req, req.params.integrationId);
    if (!integration) return res.status(404).json({ success: false, message: "WhatsApp number not found" });
    const info = await getCatalogInfo(integration);
    return res.json({ success: true, catalogId: info.catalogId, ...(await listCatalogProducts(integration, info.catalogId, { after: req.query.after, q: String(req.query.q || "").trim() })) });
  } catch (err) {
    return fail(res, err, "products");
  }
});

// Send a catalog / product / product-list message into an Inbox chat (inside the 24-hour window).
router.post("/wa-catalog/send", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const [[conv]] = await pool.query(
      `SELECT cv.*, c.external_id FROM conversations cv JOIN contacts c ON c.id = cv.contact_id
        WHERE cv.id = ? AND cv.agency_id = ?`,
      [req.body?.conversationId, agencyId]
    );
    if (!conv) return res.status(404).json({ success: false, message: "Conversation not found" });
    const integration = await loadIntegration(req, conv.integration_id);
    if (!integration) return res.status(400).json({ success: false, message: "This chat isn't on a WhatsApp number" });
    const info = await getCatalogInfo(integration);
    const interactive = buildProductMessage({ ...req.body, catalogId: info.catalogId });
    const { data } = await axios.post(`${GRAPH_URL}/${integration.wa_phone_number_id}/messages`,
      { messaging_product: "whatsapp", recipient_type: "individual", ...waRecipient(conv.external_id), type: "interactive", interactive },
      { headers: { Authorization: `Bearer ${integration.access_token}`, "Content-Type": "application/json" } });
    const label = { catalog: "🛍️ Catalog", product: "🛍️ Product", list: "🛍️ Product list" }[req.body.kind] || "🛍️ Products";
    const message = await saveMessage(conv.id, "OUTBOUND", "TEXT", `${label}${req.body.body ? `: ${req.body.body}` : ""}`, data?.messages?.[0]?.id || null, null, {
      senderType: "AGENT", senderName: req.user?.name, userId: req.user?.id, productMessage: { kind: req.body.kind, retailerIds: req.body.retailerIds || [] },
    });
    await pool.query("UPDATE conversations SET last_message_at = NOW() WHERE id = ?", [conv.id]);
    emitToAgency(agencyId, "new_message", { conversationId: conv.id, message });
    emitToConversation(conv.id, "new_message", { conversationId: conv.id, message });
    return res.json({ success: true, message });
  } catch (err) {
    return fail(res, err, "send");
  }
});

export default router;
