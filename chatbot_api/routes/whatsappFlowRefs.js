/**
 * References to already-Meta-published WhatsApp Flows (whatsapp_flow_refs) —
 * this app does not author/publish Flow JSON; an agency pastes the flow_id
 * of a Flow it already built and published in Meta Business Manager, once,
 * here, so it shows up as a pickable option in the Live Inbox Send Menu.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requireModule } from "../utils/entitlements.js";

const router = express.Router();
router.use("/whatsapp-flow-refs", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), requireModule("feature_whatsapp_flows"));

router.get("/whatsapp-flow-refs", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { integrationId } = req.query;
    let query = "SELECT * FROM whatsapp_flow_refs WHERE agency_id = ?";
    const params = [agencyId];
    if (integrationId) {
      query += " AND (integration_id = ? OR integration_id IS NULL)";
      params.push(integrationId);
    }
    query += " ORDER BY name ASC";
    const [rows] = await pool.query(query, params);
    return res.json({ success: true, flowRefs: rows });
  } catch (err) {
    console.error("GET /whatsapp-flow-refs error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/whatsapp-flow-refs", roleMiddleware("RESELLER", "ADMIN"), async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { name, flowId, integrationId } = req.body;
    if (!name || !flowId) return res.status(400).json({ success: false, message: "name and flowId are required" });
    const [ins] = await pool.query(
      "INSERT INTO whatsapp_flow_refs (agency_id, integration_id, name, flow_id) VALUES (?, ?, ?, ?)",
      [agencyId, integrationId || null, name, flowId]
    );
    return res.status(201).json({ success: true, id: ins.insertId });
  } catch (err) {
    console.error("POST /whatsapp-flow-refs error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Wires this Flow to the agency's own server/automation that implements
// its actual per-screen logic — see routes/whatsappFlowEndpoint.js, which
// relays the encrypted data-exchange traffic here once configured.
router.patch("/whatsapp-flow-refs/:id", roleMiddleware("RESELLER", "ADMIN"), async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { relayWebhookUrl } = req.body;
    const [result] = await pool.query(
      "UPDATE whatsapp_flow_refs SET relay_webhook_url = ? WHERE id = ? AND agency_id = ?",
      [relayWebhookUrl?.trim() || null, req.params.id, agencyId]
    );
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Flow reference not found" });
    return res.json({ success: true, message: "Relay webhook updated" });
  } catch (err) {
    console.error("PATCH /whatsapp-flow-refs/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/whatsapp-flow-refs/:id", roleMiddleware("RESELLER", "ADMIN"), async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    await pool.query("DELETE FROM whatsapp_flow_refs WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    return res.json({ success: true, message: "Deleted" });
  } catch (err) {
    console.error("DELETE /whatsapp-flow-refs/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
