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
    const { category, status, search, integrationId } = req.query;

    let query = `
      SELECT t.*, i.name as integration_name, i.wa_phone_number_id, i.wa_business_acc_id
      FROM whatsapp_templates t
      LEFT JOIN integrations i ON i.id = t.integration_id
      WHERE t.agency_id = ?
    `;
    const params = [agencyId];

    if (integrationId && integrationId !== "all") {
      query += " AND (t.integration_id = ? OR t.integration_id IS NULL)";
      params.push(integrationId);
    }

    if (category && category !== "ALL") {
      query += " AND t.category = ?";
      params.push(category);
    }

    if (status && status !== "ALL") {
      query += " AND t.status = ?";
      params.push(status);
    }

    if (search) {
      query += " AND (t.template_name LIKE ? OR t.body_text LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    query += " ORDER BY t.created_at DESC";

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
    if (integrationId && integrationId !== "all") {
      query += " AND id = ?";
      params.push(integrationId);
    }
    query += " ORDER BY id ASC LIMIT 1";

    const [integrations] = await pool.query(query, params);
    if (!integrations.length) {
      return res.status(400).json({ success: false, message: "No active WhatsApp account found to sync from" });
    }

    const integration = integrations[0];
    const wabaId = integration.wa_business_acc_id;
    const accessToken = integration.access_token;

    if (!wabaId || !accessToken) {
      return res.status(400).json({ success: false, message: "WhatsApp Business Account ID (WABA) or Access Token is missing for this account" });
    }

    // Call Meta Graph API to list WABA message templates
    let allMetaTemplates = [];
    let nextUrl = `https://graph.facebook.com/${META_API_VERSION}/${wabaId}/message_templates?limit=100`;

    while (nextUrl && allMetaTemplates.length < 300) {
      const metaRes = await axios.get(nextUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10000,
      });

      const pageData = metaRes.data?.data || [];
      allMetaTemplates = allMetaTemplates.concat(pageData);
      nextUrl = metaRes.data?.paging?.next || null;
    }

    let syncedCount = 0;

    for (const tpl of allMetaTemplates) {
      const templateName = tpl.name;
      const language = tpl.language || "en_US";
      const category = (tpl.category || "MARKETING").toUpperCase();
      const status = (tpl.status || "APPROVED").toUpperCase();
      const metaId = tpl.id;
      const rejectionReason = tpl.reason || tpl.quality_score?.reasons?.[0] || null;

      // Extract components
      let headerType = "NONE";
      let headerText = null;
      let headerMediaUrl = null;
      let bodyText = "";
      let footerText = null;
      let buttons = [];
      let variables = [];

      const components = tpl.components || [];
      for (const comp of components) {
        if (comp.type === "HEADER") {
          headerType = (comp.format || "TEXT").toUpperCase();
          headerText = comp.text || null;
          if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType)) {
            headerMediaUrl = comp.example?.header_handle?.[0] || null;
          }
        } else if (comp.type === "BODY") {
          bodyText = comp.text || "";
          if (comp.example?.body_text?.[0]) {
            variables = comp.example.body_text[0].map((sample, idx) => ({
              param: `{{${idx + 1}}}`,
              type: "contact_field",
              field: idx === 0 ? "name" : (idx === 1 ? "phone" : "custom"),
              sample: String(sample),
            }));
          }
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
           SET integration_id = ?, category = ?, header_type = ?, header_text = ?, header_media_url = ?,
               body_text = ?, footer_text = ?, buttons_json = ?, variables_json = ?, status = ?,
               rejection_reason = ?, meta_template_id = ?
           WHERE id = ?`,
          [
            integration.id,
            category,
            headerType,
            headerText,
            headerMediaUrl,
            bodyText,
            footerText,
            JSON.stringify(buttons),
            JSON.stringify(variables),
            status,
            rejectionReason,
            metaId,
            existing[0].id,
          ]
        );
      } else {
        await pool.query(
          `INSERT INTO whatsapp_templates 
           (agency_id, integration_id, template_name, language, category, header_type, header_text, header_media_url,
            body_text, footer_text, buttons_json, variables_json, status, rejection_reason, meta_template_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [
            agencyId,
            integration.id,
            templateName,
            language,
            category,
            headerType,
            headerText,
            headerMediaUrl,
            bodyText,
            footerText,
            JSON.stringify(buttons),
            JSON.stringify(variables),
            status,
            rejectionReason,
            metaId,
          ]
        );
      }
      syncedCount++;
    }

    return res.json({
      success: true,
      message: `Successfully synced ${syncedCount} WhatsApp templates from Meta`,
      syncedCount,
      accountName: integration.name,
    });
  } catch (err) {
    console.error("Sync WhatsApp templates error:", err.response?.data || err.message);
    return res.status(500).json({
      success: false,
      message: err.response?.data?.error?.message || err.message || "Failed to sync templates from Meta",
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
      headerMediaUrl,
      headerSample,
      bodyText,
      footerText,
      buttons = [],
      variables = [],
      submitToMeta = false,
    } = req.body;

    if (!templateName || !bodyText) {
      return res.status(400).json({ success: false, message: "Template name and body text are required" });
    }

    // Clean template name (lowercase letters, numbers, and underscores only)
    const cleanName = templateName.toLowerCase().trim().replace(/[^a-z0-9_]/g, "_");

    let status = submitToMeta ? "PENDING" : "APPROVED";
    let metaTemplateId = null;

    // Optional Meta API submission
    if (submitToMeta) {
      let integQuery = "SELECT * FROM integrations WHERE agency_id = ? AND platform = 'WHATSAPP' AND is_active = 1";
      const integParams = [agencyId];
      if (integrationId && integrationId !== "all") {
        integQuery += " AND id = ?";
        integParams.push(integrationId);
      }
      integQuery += " ORDER BY id ASC LIMIT 1";

      const [integrations] = await pool.query(integQuery, integParams);

      if (!integrations.length || !integrations[0].wa_business_acc_id) {
        return res.status(400).json({
          success: false,
          message: "No active WhatsApp Business Account found to submit this template to Meta. Please select an active WhatsApp channel.",
        });
      }

      const integration = integrations[0];
      const wabaId = integration.wa_business_acc_id;
      const accessToken = integration.access_token;

      // Construct Meta Components array
      const components = [];

      // 1. Header Component
      if (headerType && headerType !== "NONE") {
        if (headerType === "TEXT" && headerText) {
          const headerComp = { type: "HEADER", format: "TEXT", text: headerText.trim() };
          if (headerText.includes("{{1}}") && headerSample) {
            headerComp.example = { header_text: [String(headerSample).trim()] };
          }
          components.push(headerComp);
        } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType)) {
          components.push({
            type: "HEADER",
            format: headerType,
          });
        } else if (headerType === "LOCATION") {
          components.push({ type: "HEADER", format: "LOCATION" });
        }
      }

      // 2. Body Component
      const bodyComp = { type: "BODY", text: bodyText.trim() };
      // Check for variables {{1}}, {{2}}, etc.
      const varMatches = bodyText.match(/\{\{(\d+)\}\}/g);
      if (varMatches && varMatches.length > 0) {
        // Collect samples in order
        const sampleValues = [];
        const count = new Set(varMatches).size;
        for (let i = 1; i <= count; i++) {
          const found = variables.find(v => v.param === `{{${i}}}`);
          sampleValues.push(found?.sample || (i === 1 ? "Customer" : (i === 2 ? "12345" : "Sample")));
        }
        bodyComp.example = { body_text: [sampleValues] };
      }
      components.push(bodyComp);

      // 3. Footer Component
      if (footerText && footerText.trim()) {
        components.push({ type: "FOOTER", text: footerText.trim() });
      }

      // 4. Buttons Component
      if (buttons && buttons.length > 0) {
        const metaButtons = [];
        for (const btn of buttons) {
          const type = (btn.type || "QUICK_REPLY").toUpperCase();
          if (type === "QUICK_REPLY") {
            metaButtons.push({
              type: "QUICK_REPLY",
              text: btn.text.substring(0, 25),
            });
          } else if (type === "PHONE_NUMBER") {
            metaButtons.push({
              type: "PHONE_NUMBER",
              text: btn.text.substring(0, 25),
              phone_number: btn.phoneNumber || btn.phone_number || "+1234567890",
            });
          } else if (type === "URL") {
            const urlObj = {
              type: "URL",
              text: btn.text.substring(0, 25),
              url: btn.url || "https://example.com",
            };
            if (btn.url && btn.url.includes("{{1}}")) {
              urlObj.example = [btn.sampleUrl || "https://example.com/order/123"];
            }
            metaButtons.push(urlObj);
          } else if (type === "COPY_CODE") {
            metaButtons.push({
              type: "COPY_CODE",
              example: btn.couponCode || btn.code || "SAVE20",
            });
          } else if (type === "FLOW") {
            metaButtons.push({
              type: "FLOW",
              text: btn.text.substring(0, 25),
              flow_id: btn.flowId || btn.flow_id,
              flow_action: btn.flowAction || "navigate",
              navigate_screen: btn.navigateScreen || "START",
            });
          } else if (type === "CATALOG") {
            metaButtons.push({
              type: "CATALOG",
              text: (btn.text || "View catalog").substring(0, 25),
            });
          } else if (type === "MPM") {
            metaButtons.push({
              type: "MPM",
              text: (btn.text || "View items").substring(0, 25),
            });
          }
        }
        if (metaButtons.length > 0) {
          components.push({ type: "BUTTONS", buttons: metaButtons });
        }
      }

      // Send to Meta Graph API
      const metaUrl = `https://graph.facebook.com/${META_API_VERSION}/${wabaId}/message_templates`;
      console.log(`[Meta Template Submission] Sending to ${metaUrl}:`, JSON.stringify({
        name: cleanName,
        language,
        category,
        components,
      }, null, 2));

      const metaRes = await axios.post(
        metaUrl,
        {
          name: cleanName,
          language,
          category,
          components,
        },
        {
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          timeout: 15000,
        }
      );

      status = (metaRes.data?.status || "PENDING").toUpperCase();
      metaTemplateId = metaRes.data?.id || null;
      console.log(`✅ [Meta Template Submission] Success: id=${metaTemplateId}, status=${status}`);
    }

    // Save to Database
    const [result] = await pool.query(
      `INSERT INTO whatsapp_templates 
       (agency_id, integration_id, template_name, language, category, header_type, header_text, header_media_url,
        body_text, footer_text, buttons_json, variables_json, status, meta_template_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        agencyId,
        integrationId && integrationId !== "all" ? integrationId : null,
        cleanName,
        language,
        category,
        headerType,
        headerText || null,
        headerMediaUrl || null,
        bodyText,
        footerText || null,
        JSON.stringify(buttons),
        JSON.stringify(variables),
        status,
        metaTemplateId,
      ]
    );

    const [newTpl] = await pool.query("SELECT * FROM whatsapp_templates WHERE id = ?", [result.insertId]);

    return res.status(201).json({
      success: true,
      message: submitToMeta
        ? `Template "${cleanName}" submitted to Meta for review (Status: ${status})`
        : `Template "${cleanName}" saved successfully`,
      template: newTpl[0],
    });
  } catch (err) {
    console.error("Create WhatsApp template error:", err.response?.data || err.message);
    const metaMsg = err.response?.data?.error?.message || err.response?.data?.error?.error_user_msg || err.message;
    return res.status(500).json({
      success: false,
      message: metaMsg || "Failed to create/submit WhatsApp template",
      errorDetails: err.response?.data || null,
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

    // Optionally delete from Meta Graph API
    if (tpl.integration_id) {
      const [integ] = await pool.query("SELECT * FROM integrations WHERE id = ?", [tpl.integration_id]);
      if (integ.length && integ[0].wa_business_acc_id) {
        try {
          const wabaId = integ[0].wa_business_acc_id;
          const accessToken = integ[0].access_token;
          await axios.delete(`https://graph.facebook.com/${META_API_VERSION}/${wabaId}/message_templates`, {
            params: { name: tpl.template_name },
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 10000,
          });
          console.log(`Deleted template "${tpl.template_name}" from Meta WABA ${wabaId}`);
        } catch (mErr) {
          console.error("Meta template delete warning (continuing local delete):", mErr.response?.data || mErr.message);
        }
      }
    }

    await pool.query("DELETE FROM whatsapp_templates WHERE id = ?", [tpl.id]);
    return res.json({ success: true, message: `Template "${tpl.template_name}" deleted successfully` });
  } catch (err) {
    console.error("Delete WhatsApp template error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
