/**
 * Bot Manager → Engagement → "Ice Breakers & Welcome" and "Action Buttons &
 * Menus" for a Facebook Page / Instagram account: Get Started, greeting, ice
 * breakers, persistent menu (utils/messengerProfile.js). Saving stores the
 * profile and pushes it to Meta straight away.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { cleanProfile, rowToProfile, syncProfileToMeta, LIMITS, cleanAction } from "../utils/messengerProfile.js";
import { getStorySettings } from "../utils/storyReplies.js";
import { listBusinessConnections } from "../utils/telegramBusiness.js";
import { adReport } from "../utils/adReferrals.js";
import { AUTO_MESSAGE_TYPES, TIKTOK_LIMITS, getAutoMessages, saveAutoMessage, deleteAutoMessage, setAutoMessageStatus, getCommentToMessage, setCommentToMessage } from "../utils/tiktokBusiness.js";

const router = express.Router();
router.use("/bot-profile", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

const agencyOf = (req) => req.tenant?.agencyId ?? req.user.agencyId;

async function loadIntegration(agencyId, integrationId) {
  const [[row]] = await pool.query(
    "SELECT * FROM integrations WHERE id = ? AND agency_id = ? AND platform IN ('FACEBOOK','INSTAGRAM','WHATSAPP','TELEGRAM')",
    [integrationId, agencyId]
  );
  return row || null;
}

router.get("/bot-profile/:integrationId", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const integration = await loadIntegration(agencyId, req.params.integrationId);
    if (!integration) return res.status(404).json({ success: false, message: "Bot account not found" });
    const [[row]] = await pool.query("SELECT * FROM messenger_profiles WHERE integration_id = ?", [integration.id]);
    const [flows] = await pool.query(
      "SELECT id, name, is_active FROM flows WHERE agency_id = ? AND integration_id = ? AND trigger_type <> 'QUICK_ACTION' ORDER BY name",
      [agencyId, integration.id]
    );
    return res.json({ success: true, platform: integration.platform, profile: rowToProfile(row), flows, limits: LIMITS });
  } catch (err) {
    console.error("Get bot profile error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/bot-profile/:integrationId", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const integration = await loadIntegration(agencyId, req.params.integrationId);
    if (!integration) return res.status(404).json({ success: false, message: "Bot account not found" });
    const profile = await cleanProfile(req.body || {}, { agencyId, integrationId: integration.id, platform: integration.platform });
    const sync = await syncProfileToMeta(integration, profile);
    await pool.query(
      `INSERT INTO messenger_profiles (integration_id, agency_id, get_started_enabled, get_started_action, greeting, ice_breakers, persistent_menu,
                                       composer_input_disabled, last_synced_at, last_error, commands, description, short_description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE commands = VALUES(commands), description = VALUES(description), short_description = VALUES(short_description),
         get_started_enabled = VALUES(get_started_enabled), get_started_action = VALUES(get_started_action),
         greeting = VALUES(greeting), ice_breakers = VALUES(ice_breakers), persistent_menu = VALUES(persistent_menu),
         composer_input_disabled = VALUES(composer_input_disabled), last_synced_at = VALUES(last_synced_at), last_error = VALUES(last_error)`,
      [
        integration.id, agencyId, profile.getStartedEnabled ? 1 : 0, JSON.stringify(profile.getStartedAction), profile.greeting || null,
        JSON.stringify(profile.iceBreakers), JSON.stringify(profile.persistentMenu), profile.composerInputDisabled ? 1 : 0,
        sync.ok ? new Date() : null, sync.ok ? null : String(sync.error).slice(0, 500),
        JSON.stringify(profile.commands || []), profile.description || null, profile.shortDescription || null,
      ]
    );
    if (!sync.ok) {
      return res.status(502).json({ success: false, saved: true, message: `Saved here, but ${integration.platform === "TELEGRAM" ? "Telegram" : "Meta"} refused it: ${sync.error}` });
    }
    return res.json({ success: true, message: "Saved and published" });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error("Save bot profile error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── STORY MENTIONS / STORY REPLIES (utils/storyReplies.js) ──────────────────
router.get("/bot-profile/:integrationId/stories", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const integration = await loadIntegration(agencyId, req.params.integrationId);
    if (!integration || !["FACEBOOK", "INSTAGRAM"].includes(integration.platform)) return res.status(404).json({ success: false, message: "Facebook Page / Instagram account not found" });
    const [flows] = await pool.query("SELECT id, name, is_active FROM flows WHERE agency_id = ? AND integration_id = ? AND trigger_type <> 'QUICK_ACTION' ORDER BY name", [agencyId, integration.id]);
    const [[counts]] = await pool.query(
      "SELECT SUM(kind = 'MENTION') mentions, SUM(kind = 'REPLY') replies FROM story_reply_log WHERE integration_id = ? AND created_at > NOW() - INTERVAL 30 DAY",
      [integration.id]
    );
    return res.json({ success: true, settings: await getStorySettings(integration.id), flows, last30Days: { mentions: Number(counts.mentions) || 0, replies: Number(counts.replies) || 0 } });
  } catch (err) {
    console.error("Get story settings error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/bot-profile/:integrationId/stories", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const integration = await loadIntegration(agencyId, req.params.integrationId);
    if (!integration || !["FACEBOOK", "INSTAGRAM"].includes(integration.platform)) return res.status(404).json({ success: false, message: "Facebook Page / Instagram account not found" });
    const b = req.body || {};
    const ctx = { agencyId, integrationId: integration.id };
    const mention = b.mentionAction ? await cleanAction(b.mentionAction, { ...ctx, where: "Story mention" }) : null;
    const reply = b.replyAction ? await cleanAction(b.replyAction, { ...ctx, where: "Story reply" }) : null;
    const cooldown = Math.min(720, Math.max(0, Math.round(Number(b.cooldownHours ?? 24))));
    await pool.query(
      `INSERT INTO messenger_profiles (integration_id, agency_id, story_mention_action, story_reply_action, story_cooldown_hours)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE story_mention_action = VALUES(story_mention_action), story_reply_action = VALUES(story_reply_action),
         story_cooldown_hours = VALUES(story_cooldown_hours)`,
      [integration.id, agencyId, mention ? JSON.stringify(mention) : null, reply ? JSON.stringify(reply) : null, cooldown]
    );
    return res.json({ success: true, message: "Saved" });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error("Save story settings error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CLICK-TO-CHAT ADS (utils/adReferrals.js) ────────────────────────────────
const AD_PLATFORMS = ["WHATSAPP", "FACEBOOK", "INSTAGRAM"];

router.get("/bot-profile/:integrationId/ads", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const integration = await loadIntegration(agencyId, req.params.integrationId);
    if (!integration || !AD_PLATFORMS.includes(integration.platform)) return res.status(404).json({ success: false, message: "WhatsApp / Facebook / Instagram account not found" });
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const [flows] = await pool.query("SELECT id, name, is_active FROM flows WHERE agency_id = ? AND integration_id = ? AND trigger_type <> 'QUICK_ACTION' ORDER BY name", [agencyId, integration.id]);
    return res.json({ success: true, platform: integration.platform, days, ads: await adReport(agencyId, integration.id, days), flows });
  } catch (err) {
    console.error("Ad report error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/bot-profile/:integrationId/ads/:sourceId", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const integration = await loadIntegration(agencyId, req.params.integrationId);
    if (!integration || !AD_PLATFORMS.includes(integration.platform)) return res.status(404).json({ success: false, message: "Account not found" });
    const sourceId = String(req.params.sourceId).slice(0, 100);
    const flowId = req.body?.flowId ? Number(req.body.flowId) : null;
    if (!flowId) {
      await pool.query("DELETE FROM ad_flow_rules WHERE integration_id = ? AND agency_id = ? AND source_id = ?", [integration.id, agencyId, sourceId]);
      return res.json({ success: true, message: "People from this ad get your normal flows again" });
    }
    // Bot-scope rule: only a flow of this same bot account.
    const [[flow]] = await pool.query("SELECT id FROM flows WHERE id = ? AND agency_id = ? AND integration_id = ?", [flowId, agencyId, integration.id]);
    if (!flow) return res.status(400).json({ success: false, message: "Choose a flow of this bot account" });
    await pool.query(
      `INSERT INTO ad_flow_rules (agency_id, integration_id, source_id, label, flow_id) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE flow_id = VALUES(flow_id), label = VALUES(label)`,
      [agencyId, integration.id, sourceId, String(req.body?.label || "").slice(0, 200) || null, flow.id]
    );
    return res.json({ success: true, message: "Saved — people who click this ad start this flow" });
  } catch (err) {
    console.error("Save ad flow error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── TIKTOK AUTOMATIC MESSAGES + COMMENT-TO-MESSAGE (utils/tiktokBusiness.js) ─
// Live on TikTok: every read / change goes straight to the Business Messaging API.
async function loadTikTok(req, res) {
  const [[row]] = await pool.query(
    "SELECT * FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'TIKTOK'",
    [req.params.integrationId, agencyOf(req)]
  );
  if (!row) {
    res.status(404).json({ success: false, message: "TikTok account not found" });
    return null;
  }
  return row;
}

const tiktokError = (res, err) => {
  if (err.status) return res.status(err.status).json({ success: false, message: err.message });
  if (err.code === "TIKTOK_API_ERROR") return res.status(502).json({ success: false, message: `TikTok: ${err.message}` });
  console.error("TikTok auto message error:", err);
  return res.status(500).json({ success: false, message: "Server error" });
};

router.get("/bot-profile/:integrationId/tiktok", async (req, res) => {
  try {
    const integration = await loadTikTok(req, res);
    if (!integration) return;
    const [autoMessages, commentToMessage] = await Promise.all([getAutoMessages(integration), getCommentToMessage(integration)]);
    return res.json({ success: true, autoMessages, commentToMessage, limits: TIKTOK_LIMITS });
  } catch (err) {
    return tiktokError(res, err);
  }
});

router.post("/bot-profile/:integrationId/tiktok/auto-messages", async (req, res) => {
  try {
    const integration = await loadTikTok(req, res);
    if (!integration) return;
    const { type, autoMessageId, ...input } = req.body || {};
    if (!AUTO_MESSAGE_TYPES.includes(type)) return res.status(400).json({ success: false, message: "Unknown automatic message type" });
    await saveAutoMessage(integration, type, input, autoMessageId || null);
    return res.json({ success: true, message: "Saved on TikTok" });
  } catch (err) {
    return tiktokError(res, err);
  }
});

router.delete("/bot-profile/:integrationId/tiktok/auto-messages/:type/:autoMessageId", async (req, res) => {
  try {
    const integration = await loadTikTok(req, res);
    if (!integration) return;
    if (!AUTO_MESSAGE_TYPES.includes(req.params.type)) return res.status(400).json({ success: false, message: "Unknown automatic message type" });
    await deleteAutoMessage(integration, req.params.type, req.params.autoMessageId);
    return res.json({ success: true, message: "Deleted" });
  } catch (err) {
    return tiktokError(res, err);
  }
});

router.put("/bot-profile/:integrationId/tiktok/status", async (req, res) => {
  try {
    const integration = await loadTikTok(req, res);
    if (!integration) return;
    const { type, enabled } = req.body || {};
    if (type === "COMMENT_TO_MESSAGE") await setCommentToMessage(integration, Boolean(enabled));
    else if (AUTO_MESSAGE_TYPES.includes(type)) await setAutoMessageStatus(integration, type, Boolean(enabled));
    else return res.status(400).json({ success: false, message: "Unknown setting" });
    return res.json({ success: true, message: enabled ? "Turned on" : "Turned off" });
  } catch (err) {
    return tiktokError(res, err);
  }
});

// ─── TELEGRAM BUSINESS CONNECTIONS (utils/telegramBusiness.js) ───────────────
router.get("/bot-profile/:integrationId/telegram-business", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const integration = await loadIntegration(agencyId, req.params.integrationId);
    if (!integration || integration.platform !== "TELEGRAM") return res.status(404).json({ success: false, message: "Telegram bot not found" });
    const [[bot]] = await pool.query("SELECT bot_username FROM telegram_bots WHERE integration_id = ?", [integration.id]);
    return res.json({ success: true, botUsername: bot?.bot_username || null, connections: await listBusinessConnections(agencyId, integration.id) });
  } catch (err) {
    console.error("Get Telegram business connections error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
