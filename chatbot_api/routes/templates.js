import express from "express";
import axios from "axios";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("AGENCY", "ADMIN", "AGENT"));

const META_API_VERSION = process.env.META_API_VERSION || "v21.0";

// ─── LIST WHATSAPP TEMPLATES ──────────────────────────────────────────────────
router.get("/templates/whatsapp", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { category, status, search } = req.query;

    let query = "SELECT * FROM whatsapp_templates WHERE agency_id = ?";
    const params = [agencyId];

    if (category) {
      query += " AND category = ?";
      params.push(category);
    }

    if (status) {
      query += " AND status = ?";
      params.push(status);
    }

    if (search) {
      query += " AND (template_name LIKE ? OR body_text LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    query += " ORDER BY created_at DESC";

    const [templates] = await pool.query(query, params);

    return res.json({ success: true, templates });
  } catch (err) {
    console.error("List WhatsApp templates error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── SYNC TEMPLATES FROM META WABA ───────────────────────────────────────────
router.post("/templates/whatsapp/sync", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { integrationId } = req.body;

    // Find WhatsApp integration
    let query = "SELECT * FROM integrations WHERE agency_id = ? AND platform = 'WHATSAPP' AND is_active = 1";
    const params = [agencyId];
    if (integrationId) {
      query += " AND id = ?";
      params.push(integrationId);
    }
    query += " LIMIT 1";

    const [integrations] = await pool.query(query, params);
    if (!integrations.length) {
      return res.status(400).json({ success: false, message: "No active WhatsApp integration found" });
    }

    const integration = integrations[0];
    const wabaId = integration.wa_business_acc_id;
    const accessToken = integration.access_token;

    if (!wabaId || !accessToken) {
      return res.status(400).json({ success: false, message: "WhatsApp Business Account ID or Access Token missing" });
    }

    // Call Meta Graph API to list WABA message templates
    const metaUrl = `https://graph.facebook.com/${META_API_VERSION}/${wabaId}/message_templates`;
    const metaRes = await axios.get(metaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const metaTemplates = metaRes.data?.data || [];
    let syncedCount = 0;

    for (const tpl of metaTemplates) {
      const templateName = tpl.name;
      const language = tpl.language;
      const category = (tpl.category || "MARKETING").toUpperCase();
      const status = (tpl.status || "APPROVED").toUpperCase();
      const metaId = tpl.id;

      // Extract components
      let headerType = "NONE";
      let headerText = null;
      let bodyText = "";
      let footerText = null;
      let buttons = [];

      const components = tpl.components || [];
      for (const comp of components) {
        if (comp.type === "HEADER") {
          headerType = (comp.format || "TEXT").toUpperCase();
          headerText = comp.text || null;
        } else if (comp.type === "BODY") {
          bodyText = comp.text || "";
        } else if (comp.type === "FOOTER") {
          footerText = comp.text || null;
        } else if (comp.type === "BUTTONS") {
          buttons = comp.buttons || [];
        }
      }

      // Upsert into local DB
      const [existing] = await pool.query(
        "SELECT id FROM whatsapp_templates WHERE agency_id = ? AND template_name = ? AND language = ?",
        [agencyId, templateName, language]
      );

      if (existing.length) {
        await pool.query(
          `UPDATE whatsapp_templates 
           SET integration_id = ?, category = ?, header_type = ?, header_text = ?, body_text = ?, footer_text = ?, buttons_json = ?, status = ?, meta_template_id = ?
           WHERE id = ?`,
          [integration.id, category, headerType, headerText, bodyText, footerText, JSON.stringify(buttons), status, metaId, existing[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO whatsapp_templates (agency_id, integration_id, template_name, language, category, header_type, header_text, body_text, footer_text, buttons_json, status, meta_template_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [agencyId, integration.id, templateName, language, category, headerType, headerText, bodyText, footerText, JSON.stringify(buttons), status, metaId]
        );
      }
      syncedCount++;
    }

    return res.json({ success: true, message: `Successfully synced ${syncedCount} WhatsApp templates from Meta`, syncedCount });
  } catch (err) {
    console.error("Sync WhatsApp templates error:", err.response?.data || err.message);
    return res.status(500).json({
      success: false,
      message: err.response?.data?.error?.message || "Failed to sync templates from Meta",
    });
  }
});

// ─── CREATE NEW WHATSAPP TEMPLATE (Local + Meta Submission) ────────────────────
router.post("/templates/whatsapp", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const {
      integrationId,
      templateName,
      language = "en_US",
      category = "MARKETING",
      headerType = "NONE",
      headerText,
      bodyText,
      footerText,
      buttons = [],
      submitToMeta = false,
    } = req.body;

    if (!templateName || !bodyText) {
      return res.status(400).json({ success: false, message: "Template name and body text are required" });
    }

    // Clean template name (alphanumeric lowercase and underscores)
    const cleanName = templateName.toLowerCase().replace(/[^a-z0-9_]/g, "_");

    let status = "APPROVED"; // Default local
    let metaTemplateId = null;

    // Optional Meta API submission
    if (submitToMeta) {
      const [integrations] = await pool.query(
        "SELECT * FROM integrations WHERE agency_id = ? AND platform = 'WHATSAPP' AND is_active = 1 LIMIT 1",
        [agencyId]
      );

      if (integrations.length && integrations[0].wa_business_acc_id) {
        const integration = integrations[0];
        const wabaId = integration.wa_business_acc_id;
        const accessToken = integration.access_token;

        const components = [];
        if (headerType === "TEXT" && headerText) {
          components.push({ type: "HEADER", format: "TEXT", text: headerText });
        }
        components.push({ type: "BODY", text: bodyText });
        if (footerText) {
          components.push({ type: "FOOTER", text: footerText });
        }
        if (buttons.length > 0) {
          components.push({ type: "BUTTONS", buttons });
        }

        const metaUrl = `https://graph.facebook.com/${META_API_VERSION}/${wabaId}/message_templates`;
        const metaRes = await axios.post(metaUrl, {
          name: cleanName,
          language,
          category,
          components,
        }, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        status = (metaRes.data?.status || "PENDING").toUpperCase();
        metaTemplateId = metaRes.data?.id || null;
      }
    }

    const [result] = await pool.query(
      `INSERT INTO whatsapp_templates 
       (agency_id, integration_id, template_name, language, category, header_type, header_text, body_text, footer_text, buttons_json, status, meta_template_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [agencyId, integrationId || null, cleanName, language, category, headerType, headerText || null, bodyText, footerText || null, JSON.stringify(buttons), status, metaTemplateId]
    );

    const [newTpl] = await pool.query("SELECT * FROM whatsapp_templates WHERE id = ?", [result.insertId]);

    return res.status(201).json({ success: true, message: "Template created", template: newTpl[0] });
  } catch (err) {
    console.error("Create WhatsApp template error:", err.response?.data || err.message);
    return res.status(500).json({
      success: false,
      message: err.response?.data?.error?.message || err.message || "Server error",
    });
  }
});

// ─── DELETE WHATSAPP TEMPLATE ────────────────────────────────────────────────
router.delete("/templates/whatsapp/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query(
      "SELECT * FROM whatsapp_templates WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Template not found" });
    }

    const tpl = rows[0];

    // Optionally delete from Meta Graph API if integrated
    if (tpl.meta_template_id && tpl.integration_id) {
      const [integ] = await pool.query("SELECT * FROM integrations WHERE id = ?", [tpl.integration_id]);
      if (integ.length && integ[0].wa_business_acc_id) {
        try {
          const wabaId = integ[0].wa_business_acc_id;
          const accessToken = integ[0].access_token;
          await axios.delete(`https://graph.facebook.com/${META_API_VERSION}/${wabaId}/message_templates`, {
            params: { name: tpl.template_name },
            headers: { Authorization: `Bearer ${accessToken}` },
          });
        } catch (mErr) {
          console.error("Meta template delete error (continuing local delete):", mErr.message);
        }
      }
    }

    await pool.query("DELETE FROM whatsapp_templates WHERE id = ?", [tpl.id]);
    return res.json({ success: true, message: "Template deleted" });
  } catch (err) {
    console.error("Delete WhatsApp template error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
