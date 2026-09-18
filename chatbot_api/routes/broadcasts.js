import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requireModule } from "../utils/entitlements.js";
import { executeBroadcast, computeAudience } from "../utils/broadcastRunner.js";

const router = express.Router();
router.use("/broadcasts", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), requireModule("feature_broadcasts"));

function toIdArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(Number).filter((n) => Number.isFinite(n));
  return [];
}

// A campaign sends from ONE explicit channel account — never "whichever
// active integration for this platform comes back first" (that silently
// sent broadcasts from the wrong WhatsApp number when an agency had more
// than one connected, making every recipient look outside the 24h window
// even when they weren't, on the number they actually talk to). Only
// auto-picks when there's exactly one candidate; otherwise the caller must
// choose explicitly.
async function resolveDefaultIntegrationId(agencyId, platform) {
  const [rows] = await pool.query(
    "SELECT id FROM integrations WHERE agency_id = ? AND platform = ? AND is_active = 1",
    [agencyId, platform]
  );
  return rows.length === 1 ? rows[0].id : null;
}

async function validateIntegration(agencyId, platform, integrationId) {
  if (!integrationId) return null;
  const [[row]] = await pool.query(
    "SELECT id FROM integrations WHERE id = ? AND agency_id = ? AND platform = ? AND is_active = 1",
    [integrationId, agencyId, platform]
  );
  return row ? integrationId : null;
}

// ─── LIST CAMPAIGNS (per platform tab) ─────────────────────────────────────
router.get("/broadcasts", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { platform, integrationId } = req.query;
    const params = [agencyId];
    let sql = `SELECT bc.*, f.name AS flow_name, wt.template_name, l.name AS tag_label_name, l.color AS tag_label_color,
                      i.name AS integration_name, i.wa_display_phone
               FROM broadcast_campaigns bc
               LEFT JOIN flows f ON f.id = bc.flow_id
               LEFT JOIN whatsapp_templates wt ON wt.id = bc.template_id
               LEFT JOIN labels l ON l.id = bc.tag_label_id
               LEFT JOIN integrations i ON i.id = bc.integration_id
               WHERE bc.agency_id = ?`;
    if (platform) { sql += " AND bc.platform = ?"; params.push(platform); }
    if (integrationId && integrationId !== "all") { sql += " AND bc.integration_id = ?"; params.push(integrationId); }
    sql += " ORDER BY bc.created_at DESC";
    const [rows] = await pool.query(sql, params);
    return res.json({ success: true, campaigns: rows });
  } catch (err) {
    console.error("List broadcasts error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET THE CAMPAIGN LINKED TO A FLOW (Flow Builder's Broadcast start node) ───
// A BROADCAST-typed flow always has exactly one owning campaign (set at
// creation by /broadcasts/start-with-flow) — this is how the Flow Builder
// finds it to render the campaign's audience/schedule/send controls
// directly in the canvas's Broadcast start node, regardless of which URL
// the editor was opened from.
router.get("/broadcasts/by-flow/:flowId", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [[campaign]] = await pool.query(
      `SELECT bc.*, wt.template_name FROM broadcast_campaigns bc
       LEFT JOIN whatsapp_templates wt ON wt.id = bc.template_id
       WHERE bc.flow_id = ? AND bc.agency_id = ?`,
      [req.params.flowId, agencyId]
    );
    if (!campaign) return res.status(404).json({ success: false, message: "No campaign linked to this flow" });
    return res.json({ success: true, campaign });
  } catch (err) {
    console.error("Get broadcast by flow error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── FORM DATA HELPER (labels, contact counts, templates) for the Create modal ─
router.get("/broadcasts/form-data", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { platform } = req.query;
    const [labels] = await pool.query("SELECT id, name, color FROM labels WHERE agency_id = ? ORDER BY name", [agencyId]);
    const [templates] = await pool.query(
      "SELECT id, template_name, language, category, status FROM whatsapp_templates WHERE agency_id = ? AND status = 'APPROVED' ORDER BY template_name",
      [agencyId]
    );
    let contactCount = 0;
    let integrations = [];
    if (platform) {
      const [[row]] = await pool.query("SELECT COUNT(*) AS cnt FROM contacts WHERE agency_id = ? AND platform = ?", [agencyId, platform]);
      contactCount = row.cnt;
      [integrations] = await pool.query(
        "SELECT id, name, wa_display_phone, wa_phone_number_id, fb_page_name FROM integrations WHERE agency_id = ? AND platform = ? AND is_active = 1 ORDER BY name",
        [agencyId, platform]
      );
    }
    return res.json({ success: true, labels, templates, contactCount, integrations });
  } catch (err) {
    console.error("Broadcast form-data error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── AUDIENCE PREVIEW (live count as the user builds targeting rules) ─────────
router.post("/broadcasts/audience-preview", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { platform, includeLabelIds, excludeLabelIds, includeContactIds, excludeContactIds } = req.body;
    if (!platform) return res.status(400).json({ success: false, message: "platform is required" });
    const audience = await computeAudience(agencyId, platform, {
      includeLabelIds: toIdArray(includeLabelIds),
      excludeLabelIds: toIdArray(excludeLabelIds),
      includeContactIds: toIdArray(includeContactIds),
      excludeContactIds: toIdArray(excludeContactIds),
    });
    return res.json({ success: true, count: audience.length });
  } catch (err) {
    console.error("Audience preview error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET ONE CAMPAIGN + PER-CONTACT LOGS ───────────────────────────────────
router.get("/broadcasts/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [[campaign]] = await pool.query(
      `SELECT bc.*, f.name AS flow_name, wt.template_name, wtb.template_name AS variant_b_template_name,
              l.name AS tag_label_name, i.name AS integration_name, i.wa_display_phone
       FROM broadcast_campaigns bc
       LEFT JOIN flows f ON f.id = bc.flow_id
       LEFT JOIN whatsapp_templates wt ON wt.id = bc.template_id
       LEFT JOIN whatsapp_templates wtb ON wtb.id = bc.variant_b_template_id
       LEFT JOIN labels l ON l.id = bc.tag_label_id
       LEFT JOIN integrations i ON i.id = bc.integration_id
       WHERE bc.id = ? AND bc.agency_id = ?`,
      [req.params.id, agencyId]
    );
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });

    const [logs] = await pool.query(
      `SELECT bl.*, c.name AS contact_name, c.phone, c.email, c.external_id
       FROM broadcast_logs bl JOIN contacts c ON c.id = bl.contact_id
       WHERE bl.campaign_id = ? ORDER BY bl.id ASC`,
      [req.params.id]
    );

    // Per-variant delivery/read comparison — only meaningful once this is an
    // A/B campaign (variant_b_template_id set), but harmless (empty/single
    // row) to compute either way.
    let variantStats = null;
    if (campaign.variant_b_template_id) {
      const [rows] = await pool.query(
        `SELECT variant,
                COUNT(*) AS targeted,
                SUM(status IN ('SENT','DELIVERED','READ')) AS sent,
                SUM(status IN ('DELIVERED','READ')) AS delivered,
                SUM(status = 'READ') AS read_count,
                SUM(status = 'FAILED') AS failed
         FROM broadcast_logs WHERE campaign_id = ? AND variant IS NOT NULL
         GROUP BY variant`,
        [req.params.id]
      );
      variantStats = rows;
    }

    return res.json({ success: true, campaign, logs, variantStats });
  } catch (err) {
    console.error("Get broadcast error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── START A WINDOW-MODE CAMPAIGN: creates its flow, opens it in the Flow Builder ─
// The Broadcasting page's "Create" button (for WhatsApp Inside-24h, Messenger,
// Telegram, TikTok) hits this first — content is authored as a flow, not here.
router.post("/broadcasts/start-with-flow", async (req, res) => {
  const { name, platform } = req.body;
  if (!name || !platform) return res.status(400).json({ success: false, message: "name and platform are required" });
  const agencyId = req.user.agencyId;

  let integrationId = await validateIntegration(agencyId, platform, req.body.integrationId);
  if (!integrationId) {
    integrationId = await resolveDefaultIntegrationId(agencyId, platform);
  }
  if (!integrationId) {
    return res.status(400).json({
      success: false,
      message: req.body.integrationId
        ? "That account isn't a valid, active connection for this platform"
        : `Choose which ${platform} account this campaign sends from — this agency has more than one connected`,
    });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // A BROADCAST-typed start node — flowEngine.js's findMatchingFlow() has no
    // branch that recognizes trigger_type "broadcast", so this flow structurally
    // never fires from an inbound keyword/first-contact/postback match; it is
    // only ever read directly by broadcastRunner.js via this campaign's flow_id.
    const nodesJson = JSON.stringify([
      { id: "start_1", type: "start", position: { x: 0, y: 0 }, data: { label: "Broadcast", trigger_type: "broadcast" } },
    ]);
    const [flowResult] = await conn.query(
      `INSERT INTO flows (agency_id, name, platform, trigger_type, nodes_json, edges_json, is_active)
       VALUES (?, ?, ?, 'BROADCAST', ?, '[]', 1)`,
      [agencyId, name, platform, nodesJson]
    );
    const flowId = flowResult.insertId;

    const [campResult] = await conn.query(
      `INSERT INTO broadcast_campaigns (agency_id, name, platform, integration_id, flow_id, mode, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'WINDOW', 'DRAFT', ?)`,
      [agencyId, name, platform, integrationId, flowId, req.user.id]
    );

    await conn.commit();
    return res.status(201).json({ success: true, campaignId: campResult.insertId, flowId });
  } catch (err) {
    await conn.rollback();
    console.error("Start broadcast error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
});

// ─── CREATE A TEMPLATE-MODE CAMPAIGN (WhatsApp Anytime — no flow, just a template) ─
router.post("/broadcasts", async (req, res) => {
  const { name, platform, templateId } = req.body;
  if (!name || !platform) return res.status(400).json({ success: false, message: "name and platform are required" });
  if (platform !== "WHATSAPP" || !templateId) {
    return res.status(400).json({ success: false, message: "Anytime campaigns require a WhatsApp platform and an approved template" });
  }
  const agencyId = req.user.agencyId;
  try {
    const [[tpl]] = await pool.query("SELECT id FROM whatsapp_templates WHERE id = ? AND agency_id = ? AND status = 'APPROVED'", [templateId, agencyId]);
    if (!tpl) return res.status(400).json({ success: false, message: "Template not found or not approved" });

    let integrationId = await validateIntegration(agencyId, "WHATSAPP", req.body.integrationId);
    if (!integrationId) integrationId = await resolveDefaultIntegrationId(agencyId, "WHATSAPP");
    if (!integrationId) {
      return res.status(400).json({
        success: false,
        message: req.body.integrationId
          ? "That account isn't a valid, active WhatsApp connection"
          : "Choose which WhatsApp account this campaign sends from — this agency has more than one connected",
      });
    }

    const [result] = await pool.query(
      `INSERT INTO broadcast_campaigns (agency_id, name, platform, integration_id, mode, template_id, status, created_by)
       VALUES (?, ?, 'WHATSAPP', ?, 'TEMPLATE', ?, 'DRAFT', ?)`,
      [agencyId, name, integrationId, templateId, req.user.id]
    );
    return res.status(201).json({ success: true, campaignId: result.insertId });
  } catch (err) {
    console.error("Create broadcast error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── UPDATE A DRAFT CAMPAIGN (audience targeting, tag label, schedule) ─────────
router.put("/broadcasts/:id", async (req, res) => {
  const agencyId = req.user.agencyId;
  const {
    name, includeLabelIds, excludeLabelIds, includeContactIds, excludeContactIds,
    tagLabelId, scheduledAt, templateId, integrationId, variantBTemplateId, abSplitPercent,
  } = req.body;

  try {
    const [[existing]] = await pool.query("SELECT * FROM broadcast_campaigns WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!existing) return res.status(404).json({ success: false, message: "Campaign not found" });
    if (existing.status !== "DRAFT") return res.status(400).json({ success: false, message: "Only a draft campaign can be edited — this one has already been scheduled or sent" });

    let resolvedIntegrationId = existing.integration_id;
    if (integrationId !== undefined) {
      const validated = await validateIntegration(agencyId, existing.platform, integrationId);
      if (!validated) return res.status(400).json({ success: false, message: "That account isn't a valid, active connection for this platform" });
      resolvedIntegrationId = validated;
    }

    // A/B testing is TEMPLATE-mode only — a WINDOW-mode (flow-driven)
    // campaign's content is a whole flow canvas, not a single swappable
    // message, so there's no equivalent "variant B" to pick there.
    let resolvedVariantB = existing.variant_b_template_id;
    if (variantBTemplateId !== undefined) {
      if (variantBTemplateId === null || variantBTemplateId === "") {
        resolvedVariantB = null;
      } else if (existing.mode !== "TEMPLATE") {
        return res.status(400).json({ success: false, message: "A/B testing is only available for template-based campaigns" });
      } else {
        const [[tplB]] = await pool.query("SELECT id FROM whatsapp_templates WHERE id = ? AND agency_id = ? AND status = 'APPROVED'", [variantBTemplateId, agencyId]);
        if (!tplB) return res.status(400).json({ success: false, message: "Variant B template not found or not approved" });
        resolvedVariantB = variantBTemplateId;
      }
    }
    const resolvedSplit = abSplitPercent !== undefined ? Math.min(99, Math.max(1, Number(abSplitPercent) || 50)) : existing.ab_split_percent;

    await pool.query(
      `UPDATE broadcast_campaigns SET
        name = COALESCE(?, name),
        integration_id = ?,
        include_label_ids = ?, exclude_label_ids = ?, include_contact_ids = ?, exclude_contact_ids = ?,
        tag_label_id = ?, scheduled_at = ?, template_id = COALESCE(?, template_id),
        variant_b_template_id = ?, ab_split_percent = ?
       WHERE id = ? AND agency_id = ?`,
      [
        name || null,
        resolvedIntegrationId,
        JSON.stringify(toIdArray(includeLabelIds)), JSON.stringify(toIdArray(excludeLabelIds)),
        JSON.stringify(toIdArray(includeContactIds)), JSON.stringify(toIdArray(excludeContactIds)),
        tagLabelId || null, scheduledAt || null, templateId || null,
        resolvedVariantB, resolvedSplit,
        req.params.id, agencyId,
      ]
    );
    return res.json({ success: true, message: "Campaign updated" });
  } catch (err) {
    console.error("Update broadcast error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── SEND NOW ───────────────────────────────────────────────────────────────
router.post("/broadcasts/:id/send", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [[campaign]] = await pool.query("SELECT * FROM broadcast_campaigns WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });
    if (!["DRAFT", "SCHEDULED", "FAILED"].includes(campaign.status)) {
      return res.status(400).json({ success: false, message: `Campaign is already ${campaign.status.toLowerCase()}` });
    }
    if (!campaign.integration_id) {
      return res.status(400).json({ success: false, message: "This campaign has no account chosen to send from yet" });
    }
    await pool.query("UPDATE broadcast_campaigns SET scheduled_at = NULL WHERE id = ?", [campaign.id]);
    executeBroadcast(campaign.id).catch((err) => console.error("Background broadcast error:", err));
    return res.json({ success: true, message: "Broadcast started" });
  } catch (err) {
    console.error("Send broadcast error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── SCHEDULE ───────────────────────────────────────────────────────────────
router.post("/broadcasts/:id/schedule", async (req, res) => {
  const { scheduledAt } = req.body;
  if (!scheduledAt) return res.status(400).json({ success: false, message: "scheduledAt is required" });
  try {
    const agencyId = req.user.agencyId;
    const [[campaign]] = await pool.query("SELECT id, status, integration_id FROM broadcast_campaigns WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });
    if (campaign.status !== "DRAFT") return res.status(400).json({ success: false, message: "Only a draft campaign can be scheduled" });
    if (!campaign.integration_id) return res.status(400).json({ success: false, message: "This campaign has no account chosen to send from yet" });

    await pool.query("UPDATE broadcast_campaigns SET status = 'SCHEDULED', scheduled_at = ? WHERE id = ?", [scheduledAt, req.params.id]);
    return res.json({ success: true, message: "Broadcast scheduled" });
  } catch (err) {
    console.error("Schedule broadcast error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CANCEL A SCHEDULED CAMPAIGN ────────────────────────────────────────────
router.post("/broadcasts/:id/cancel", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [[campaign]] = await pool.query("SELECT id, status FROM broadcast_campaigns WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });
    if (campaign.status !== "SCHEDULED") return res.status(400).json({ success: false, message: "Only a scheduled campaign can be cancelled" });
    await pool.query("UPDATE broadcast_campaigns SET status = 'DRAFT', scheduled_at = NULL WHERE id = ?", [req.params.id]);
    return res.json({ success: true, message: "Schedule cancelled — back to draft" });
  } catch (err) {
    console.error("Cancel broadcast error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── DELETE ─────────────────────────────────────────────────────────────────
router.delete("/broadcasts/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    await pool.query("DELETE FROM broadcast_campaigns WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    return res.json({ success: true, message: "Campaign deleted" });
  } catch (err) {
    console.error("Delete broadcast error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
