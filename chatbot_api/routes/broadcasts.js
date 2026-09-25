import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requireModule } from "../utils/entitlements.js";
import { executeBroadcast, computeAudience, inspectCampaign, hasNoAudienceFilter } from "../utils/broadcastRunner.js";
import { emitBroadcastUpdate } from "../utils/broadcastStats.js";
import { findOutOfScopeRefs, describeOutOfScope, violationsForClient } from "../utils/botScope.js";

const router = express.Router();
router.use("/broadcasts", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), requireModule("feature_broadcasts"));

// Audiences at or above this size get an extra "Large Audience" confirmation
// (UI dialog + server-side confirmAudience check). Configurable per server.
const LARGE_AUDIENCE_THRESHOLD = Math.max(1, Number(process.env.BROADCAST_LARGE_AUDIENCE_THRESHOLD) || 5000);

/** What must be confirmed before this audience may be sent / scheduled. */
// A WhatsApp "Inside 24 hours" (WINDOW) broadcast can't be scheduled
// (decided with the user): who is inside the 24-hour window changes by the
// hour, so it's sent now or not at all. Only Anytime (TEMPLATE) schedules.
const NO_SCHEDULE_MESSAGE = "An Inside 24 hours broadcast can't be scheduled — send it now, or switch it to Anytime (template) to schedule it.";
function canSchedule(campaign) {
  return !(campaign.platform === "WHATSAPP" && campaign.mode === "WINDOW");
}

function audienceWarnings(inspection) {
  return {
    noFilter: inspection.noFilter,
    large: inspection.audienceCount >= LARGE_AUDIENCE_THRESHOLD,
    audienceCount: inspection.audienceCount,
    largeAudienceThreshold: LARGE_AUDIENCE_THRESHOLD,
  };
}

/**
 * Server-side gate for send / schedule: re-checks the campaign from the DB
 * (account, content, audience) and refuses an audience the user hasn't
 * explicitly confirmed (no filter = everyone, or a large audience) — so the
 * UI's warnings can't be skipped by calling the API directly.
 */
async function gateSend(campaign, body, res) {
  const inspection = await inspectCampaign(campaign);
  if (inspection.errors.length) {
    res.status(400).json({ success: false, code: "BROADCAST_NOT_READY", message: inspection.errors[0], errors: inspection.errors, audienceCount: inspection.audienceCount });
    return null;
  }
  const warnings = audienceWarnings(inspection);
  if ((warnings.noFilter || warnings.large) && body?.confirmAudience !== true) {
    res.status(409).json({ success: false, code: "AUDIENCE_CONFIRMATION_REQUIRED", message: "Confirm the audience before sending.", ...warnings });
    return null;
  }
  return inspection;
}

/** A JSON id list for an UPDATE: the request's value, or the stored one when the request left it out. */
function idsOrExisting(value, existing) {
  if (value !== undefined) return JSON.stringify(toIdArray(value));
  if (existing == null) return JSON.stringify([]);
  return typeof existing === "string" ? existing : JSON.stringify(existing);
}

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
    const { platform, integrationId } = req.query;
    const [labels] = await pool.query("SELECT id, name, color FROM labels WHERE agency_id = ? ORDER BY name", [agencyId]);
    // A template belongs to the WhatsApp account it was synced from — only
    // offer the chosen bot account's own when one is given.
    const [templates] = await pool.query(
      `SELECT id, template_name, language, category, status FROM whatsapp_templates
       WHERE agency_id = ? AND status = 'APPROVED' ${integrationId ? "AND integration_id = ?" : ""} ORDER BY template_name`,
      integrationId ? [agencyId, integrationId] : [agencyId]
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
    return res.json({ success: true, labels, templates, contactCount, integrations, largeAudienceThreshold: LARGE_AUDIENCE_THRESHOLD });
  } catch (err) {
    console.error("Broadcast form-data error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── AUDIENCE PREVIEW (live count as the user builds targeting rules) ─────────
router.post("/broadcasts/audience-preview", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { includeLabelIds, excludeLabelIds, includeContactIds, excludeContactIds, campaignId } = req.body;
    let { platform, integrationId } = req.body;
    // With a campaign, its own platform + bot account are used (never the client's).
    if (campaignId) {
      const [[c]] = await pool.query("SELECT platform, integration_id FROM broadcast_campaigns WHERE id = ? AND agency_id = ?", [campaignId, agencyId]);
      if (!c) return res.status(404).json({ success: false, message: "Campaign not found" });
      platform = c.platform;
      integrationId = c.integration_id;
    } else if (integrationId) {
      integrationId = await validateIntegration(agencyId, platform, integrationId);
      if (!integrationId) return res.status(400).json({ success: false, message: "That account isn't a valid, active connection for this platform" });
    }
    if (!platform) return res.status(400).json({ success: false, message: "platform is required" });
    const targeting = {
      includeLabelIds: toIdArray(includeLabelIds),
      excludeLabelIds: toIdArray(excludeLabelIds),
      includeContactIds: toIdArray(includeContactIds),
      excludeContactIds: toIdArray(excludeContactIds),
      integrationId: integrationId || null,
    };
    const audience = await computeAudience(agencyId, platform, targeting);
    return res.json({
      success: true,
      count: audience.length,
      noFilter: hasNoAudienceFilter(targeting),
      largeAudienceThreshold: LARGE_AUDIENCE_THRESHOLD,
    });
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
  // The broadcast type chosen on the Broadcasting page: WINDOW (Inside 24
  // hours → a Send Message element) or TEMPLATE (Anytime, WhatsApp only → a
  // Message Template element). Still changeable in the Broadcast element.
  const mode = req.body.mode === undefined ? "WINDOW" : req.body.mode;
  if (!["WINDOW", "TEMPLATE"].includes(mode)) return res.status(400).json({ success: false, message: "Unknown sending mode" });
  if (mode === "TEMPLATE" && platform !== "WHATSAPP") return res.status(400).json({ success: false, message: "Anytime (template) sending is only available on WhatsApp" });
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
    // The Broadcast element comes already connected to what its type needs —
    // a Send Message block (Inside 24 hours) or a Message Template element
    // (Anytime) — so the user only fills in the content. Switching the mode
    // in the builder swaps the connected element.
    const firstStep = mode === "TEMPLATE"
      ? {
          id: "template_1", type: "whatsappTemplate", position: { x: 380, y: 0 },
          data: { label: "Message Template", templateId: null, templateName: "", language: "", params: { header: {}, body: {}, buttons: {} }, templateMeta: null },
        }
      : {
          id: "message_1", type: "messageBlock", position: { x: 380, y: 0 },
          data: { label: "Send Message", items: [{ id: "it_first", type: "buttons", data: { label: "Text Message", message: "", buttons: [] } }] },
        };
    const nodesJson = JSON.stringify([
      { id: "start_1", type: "start", position: { x: 0, y: 0 }, data: { label: "Broadcast", trigger_type: "broadcast" } },
      firstStep,
    ]);
    const edgesJson = JSON.stringify([
      { id: `e-start_1-${firstStep.id}`, source: "start_1", sourceHandle: "next-step", target: firstStep.id, type: "default", animated: false },
    ]);
    // The flow lives on the campaign's own bot account — without it the Flow
    // Builder has no account for the flow and shows the platform's first one.
    const [flowResult] = await conn.query(
      `INSERT INTO flows (agency_id, integration_id, name, platform, trigger_type, nodes_json, edges_json, is_active)
       VALUES (?, ?, ?, ?, 'BROADCAST', ?, ?, 1)`,
      [agencyId, integrationId, name, platform, nodesJson, edgesJson]
    );
    const flowId = flowResult.insertId;

    const [campResult] = await conn.query(
      `INSERT INTO broadcast_campaigns (agency_id, name, platform, integration_id, flow_id, mode, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?)`,
      [agencyId, name, platform, integrationId, flowId, mode, req.user.id]
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
    tagLabelId, scheduledAt, templateId, integrationId, variantBTemplateId, abSplitPercent, mode,
  } = req.body;

  try {
    const [[existing]] = await pool.query("SELECT * FROM broadcast_campaigns WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!existing) return res.status(404).json({ success: false, message: "Campaign not found" });
    // DRAFT / FAILED (fix and retry) / SCHEDULED (audience only — its time changes via /schedule).
    if (!["DRAFT", "FAILED", "SCHEDULED"].includes(existing.status)) return res.status(400).json({ success: false, message: "This campaign is already sending or sent, so it can't be edited" });

    let resolvedIntegrationId = existing.integration_id;
    if (integrationId !== undefined) {
      const validated = await validateIntegration(agencyId, existing.platform, integrationId);
      if (!validated) return res.status(400).json({ success: false, message: "That account isn't a valid, active connection for this platform" });
      resolvedIntegrationId = validated;
    }

    // A flow-driven campaign's flow belongs to the campaign's bot account, so
    // moving the campaign moves its flow too — but only if everything the flow
    // uses (Sequences, forms, other flows) belongs to the new account as well.
    if (existing.flow_id && String(resolvedIntegrationId) !== String(existing.integration_id)) {
      const [[flow]] = await pool.query("SELECT nodes_json FROM flows WHERE id = ? AND agency_id = ?", [existing.flow_id, agencyId]);
      if (flow) {
        let nodes = [];
        try { nodes = JSON.parse(flow.nodes_json || "[]"); } catch { nodes = []; }
        const badRefs = await findOutOfScopeRefs({ agencyId, integrationId: resolvedIntegrationId, nodes });
        if (badRefs.length) {
          return res.status(403).json({ success: false, code: "BOT_SCOPE_VIOLATION", message: describeOutOfScope(badRefs, resolvedIntegrationId), violations: violationsForClient(badRefs) });
        }
      }
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

    // Sending mode of a flow-built campaign (Broadcast element: Inside 24
    // hours = WINDOW, Anytime = TEMPLATE via a Message Template element).
    // A campaign made on the Broadcasting page without a flow is always TEMPLATE.
    let resolvedMode = existing.mode;
    if (mode !== undefined) {
      if (!["WINDOW", "TEMPLATE"].includes(mode)) return res.status(400).json({ success: false, message: "Unknown sending mode" });
      if (mode === "TEMPLATE" && existing.platform !== "WHATSAPP") return res.status(400).json({ success: false, message: "Anytime (template) sending is only available on WhatsApp" });
      if (!existing.flow_id && mode !== "TEMPLATE") return res.status(400).json({ success: false, message: "This campaign has no flow, so it can only send a template" });
      resolvedMode = mode;
    }

    // A planned send time kept on a draft (the Broadcast element's "Schedule"
    // choice) — only a real, future date; scheduling itself happens on send.
    let resolvedScheduledAt = scheduledAt === undefined || existing.status === "SCHEDULED" ? existing.scheduled_at : (scheduledAt || null);
    if (resolvedScheduledAt && !(resolvedScheduledAt instanceof Date)) {
      const when = new Date(resolvedScheduledAt);
      if (Number.isNaN(when.getTime())) return res.status(400).json({ success: false, message: "Invalid send time" });
      resolvedScheduledAt = when;
    }
    // Inside 24 hours can't be scheduled: a scheduled one can't switch to it,
    // and a draft switching to it drops its planned time.
    if (!canSchedule({ platform: existing.platform, mode: resolvedMode })) {
      if (existing.status === "SCHEDULED") return res.status(400).json({ success: false, code: "SCHEDULE_NOT_ALLOWED", message: "Cancel the schedule first — an Inside 24 hours broadcast can't be scheduled." });
      resolvedScheduledAt = null;
    }

    await pool.query(
      `UPDATE broadcast_campaigns SET
        name = COALESCE(?, name),
        integration_id = ?,
        include_label_ids = ?, exclude_label_ids = ?, include_contact_ids = ?, exclude_contact_ids = ?,
        tag_label_id = ?, scheduled_at = ?, template_id = COALESCE(?, template_id),
        variant_b_template_id = ?, ab_split_percent = ?, mode = ?
       WHERE id = ? AND agency_id = ?`,
      [
        name || null,
        resolvedIntegrationId,
        // Audience fields left out of the request keep their stored value
        // (a mode-only change must not clear the audience).
        idsOrExisting(includeLabelIds, existing.include_label_ids), idsOrExisting(excludeLabelIds, existing.exclude_label_ids),
        idsOrExisting(includeContactIds, existing.include_contact_ids), idsOrExisting(excludeContactIds, existing.exclude_contact_ids),
        tagLabelId === undefined ? existing.tag_label_id : (tagLabelId || null), resolvedScheduledAt, templateId || null,
        resolvedVariantB, resolvedSplit, resolvedMode,
        req.params.id, agencyId,
      ]
    );
    if (existing.flow_id && resolvedIntegrationId) {
      await pool.query("UPDATE flows SET integration_id = ? WHERE id = ? AND agency_id = ?", [resolvedIntegrationId, existing.flow_id, agencyId]);
    }
    const [[updated]] = await pool.query("SELECT * FROM broadcast_campaigns WHERE id = ?", [req.params.id]);
    const inspection = await inspectCampaign(updated);
    return res.json({ success: true, message: "Campaign updated", ...audienceWarnings(inspection), readyErrors: inspection.errors });
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
    if (!(await gateSend(campaign, req.body, res))) return;
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
    const [[campaign]] = await pool.query("SELECT * FROM broadcast_campaigns WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });
    // DRAFT / FAILED → schedule; SCHEDULED → reschedule (the same row's time changes — never a second schedule).
    if (!["DRAFT", "SCHEDULED", "FAILED"].includes(campaign.status)) return res.status(400).json({ success: false, message: "Only a draft, failed or scheduled campaign can be scheduled" });
    if (!canSchedule(campaign)) return res.status(400).json({ success: false, code: "SCHEDULE_NOT_ALLOWED", message: NO_SCHEDULE_MESSAGE });
    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime())) return res.status(400).json({ success: false, message: "Invalid send time" });
    if (when.getTime() < Date.now() + 60 * 1000) return res.status(400).json({ success: false, message: "Pick a time at least a minute from now" });
    if (!(await gateSend(campaign, req.body, res))) return;

    const [upd] = await pool.query(
      "UPDATE broadcast_campaigns SET status = 'SCHEDULED', scheduled_at = ? WHERE id = ? AND agency_id = ? AND status IN ('DRAFT', 'SCHEDULED', 'FAILED')",
      [when, req.params.id, agencyId]
    );
    if (upd.affectedRows !== 1) return res.status(409).json({ success: false, message: "The campaign changed state meanwhile — reload and try again" });
    await emitBroadcastUpdate(campaign.id);
    return res.json({ success: true, message: campaign.status === "SCHEDULED" ? "Broadcast rescheduled" : "Broadcast scheduled", rescheduled: campaign.status === "SCHEDULED" });
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
    await emitBroadcastUpdate(campaign.id);
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
