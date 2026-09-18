/**
 * HTTP API Campaigns — reusable outbound-HTTP configs (Automation module),
 * called by id from the Flow Builder's "HTTP API" node during execution
 * (see utils/flowEngine.js's "httpApi" case) or dispatched manually here for
 * testing. See services/httpApiExecutor.js for the actual request/response
 * handling and the response-to-custom-field mapping logic.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requireModule, assertLimit } from "../utils/entitlements.js";
import { replaceVariables } from "../utils/flowEngine.js";
import { executeHttpApiCampaign } from "../services/httpApiExecutor.js";

const router = express.Router();
router.use("/http-api-campaigns", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), requireModule("feature_http_api"));

function parseJsonField(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

// ─── LIST ─────────────────────────────────────────────────────────────────────
router.get("/http-api-campaigns", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.*, (SELECT COUNT(*) FROM http_api_campaign_logs l WHERE l.campaign_id = c.id) AS executionCount
       FROM http_api_campaigns c WHERE c.agency_id = ? ORDER BY c.updated_at DESC`,
      [req.user.agencyId]
    );
    const campaigns = rows.map((c) => ({
      ...c,
      headers_json: parseJsonField(c.headers_json, {}),
      response_mappings: parseJsonField(c.response_mappings, []),
    }));
    return res.json({ success: true, campaigns });
  } catch (err) {
    console.error("List HTTP API campaigns error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET ONE ──────────────────────────────────────────────────────────────────
router.get("/http-api-campaigns/:id", async (req, res) => {
  try {
    const [[campaign]] = await pool.query("SELECT * FROM http_api_campaigns WHERE id = ? AND agency_id = ?", [req.params.id, req.user.agencyId]);
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });
    campaign.headers_json = parseJsonField(campaign.headers_json, {});
    campaign.response_mappings = parseJsonField(campaign.response_mappings, []);
    return res.json({ success: true, campaign });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE ───────────────────────────────────────────────────────────────────
router.post("/http-api-campaigns", async (req, res) => {
  try {
    const { name, description, campaignType, method, url, headers, bodyTemplate, responseMappings, timeoutMs } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ success: false, message: "Name is required" });
    if (!url || !url.trim()) return res.status(400).json({ success: false, message: "URL is required" });

    await assertLimit(req.user.agencyId, "max_http_api_campaigns", 1, req.user?.id);

    const [result] = await pool.query(
      `INSERT INTO http_api_campaigns (agency_id, name, description, campaign_type, method, url, headers_json, body_template, response_mappings, timeout_ms, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.agencyId, name.trim(), description || null, campaignType || "SEND", method || "POST", url.trim(),
        JSON.stringify(headers || {}), bodyTemplate || null, JSON.stringify(responseMappings || []),
        Number(timeoutMs) || 10000, req.user.id,
      ]
    );
    return res.status(201).json({ success: true, message: "Campaign created", campaignId: result.insertId });
  } catch (err) {
    console.error("Create HTTP API campaign error:", err);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Server error", code: err.code });
  }
});

// ─── UPDATE ───────────────────────────────────────────────────────────────────
router.put("/http-api-campaigns/:id", async (req, res) => {
  try {
    const { name, description, campaignType, method, url, headers, bodyTemplate, responseMappings, timeoutMs, isActive } = req.body || {};
    const [[existing]] = await pool.query("SELECT id FROM http_api_campaigns WHERE id = ? AND agency_id = ?", [req.params.id, req.user.agencyId]);
    if (!existing) return res.status(404).json({ success: false, message: "Campaign not found" });

    await pool.query(
      `UPDATE http_api_campaigns SET
        name = COALESCE(?, name), description = ?, campaign_type = COALESCE(?, campaign_type),
        method = COALESCE(?, method), url = COALESCE(?, url), headers_json = ?, body_template = ?,
        response_mappings = ?, timeout_ms = COALESCE(?, timeout_ms), is_active = COALESCE(?, is_active)
       WHERE id = ? AND agency_id = ?`,
      [
        name?.trim() || null, description ?? null, campaignType || null, method || null, url?.trim() || null,
        JSON.stringify(headers || {}), bodyTemplate || null, JSON.stringify(responseMappings || []),
        timeoutMs ? Number(timeoutMs) : null, isActive === undefined ? null : (isActive ? 1 : 0),
        req.params.id, req.user.agencyId,
      ]
    );
    return res.json({ success: true, message: "Campaign updated" });
  } catch (err) {
    console.error("Update HTTP API campaign error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── DELETE ───────────────────────────────────────────────────────────────────
router.delete("/http-api-campaigns/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM http_api_campaigns WHERE id = ? AND agency_id = ?", [req.params.id, req.user.agencyId]);
    return res.json({ success: true, message: "Campaign deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── TEST DISPATCH ────────────────────────────────────────────────────────────
// Mirrors flowWebhooks.js's /webhooks/test-dispatch — fires the campaign for
// real, against either a real contact (pulling their actual custom field
// values as {{field_key}} variables) or a synthetic sample contact.
router.post("/http-api-campaigns/:id/test", async (req, res) => {
  try {
    const [[campaign]] = await pool.query("SELECT * FROM http_api_campaigns WHERE id = ? AND agency_id = ?", [req.params.id, req.user.agencyId]);
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });

    const { contactId } = req.body || {};
    let contact = { id: null, name: "Test Customer", phone: "+1234567890", email: "customer@example.com" };
    let variables = {};

    if (contactId) {
      const [[realContact]] = await pool.query("SELECT * FROM contacts WHERE id = ? AND agency_id = ?", [contactId, req.user.agencyId]);
      if (realContact) {
        contact = realContact;
        const [fieldRows] = await pool.query(
          `SELECT d.field_key, v.value FROM custom_field_definitions d
           LEFT JOIN contact_custom_field_values v ON v.field_id = d.id AND v.contact_id = ?
           WHERE d.agency_id = ? AND d.is_active = 1`,
          [contactId, req.user.agencyId]
        );
        for (const f of fieldRows) if (f.value !== null) variables[f.field_key] = f.value;
      }
    }

    const result = await executeHttpApiCampaign(campaign, { agencyId: req.user.agencyId, contact, variables, replaceVariables });
    return res.json({ success: true, result });
  } catch (err) {
    console.error("Test HTTP API campaign error:", err);
    return res.status(500).json({ success: false, message: err.message || "Test dispatch failed" });
  }
});

// ─── EXECUTION LOGS ───────────────────────────────────────────────────────────
router.get("/http-api-campaigns/:id/logs", async (req, res) => {
  try {
    const [[campaign]] = await pool.query("SELECT id FROM http_api_campaigns WHERE id = ? AND agency_id = ?", [req.params.id, req.user.agencyId]);
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });

    const [logs] = await pool.query(
      "SELECT * FROM http_api_campaign_logs WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 50",
      [req.params.id]
    );
    return res.json({ success: true, logs });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
