/**
 * Bot Settings → General / Inbox tabs (utils/botSettings.js). One bot account
 * at a time; the bot must belong to the caller's workspace (404 otherwise).
 * Team members need bot_manager.update to save (middleware/teamPermissions.js).
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { getBotSettings, cleanBotSettings, saveBotSettings, LIMITS, DEFAULT_UIF_SESSION_MINUTES } from "../utils/botSettings.js";
import { getTransporter } from "../utils/emailNotifications.js";

const router = express.Router();
router.use("/bot-settings", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

async function ownedIntegration(req) {
  const agencyId = req.tenant?.agencyId || req.user?.agencyId;
  if (!agencyId || !/^\d+$/.test(String(req.params.integrationId))) return null;
  const [[row]] = await pool.query(
    "SELECT id, platform, name FROM integrations WHERE id = ? AND agency_id = ?",
    [req.params.integrationId, agencyId]
  );
  return row ? { agencyId, integration: row } : null;
}

async function payload(integrationId, settings) {
  const [[ai]] = await pool.query("SELECT auto_resume_minutes FROM ai_reply_settings WHERE integration_id = ?", [integrationId]);
  return {
    success: true,
    settings,
    defaults: {
      uifSessionMinutes: DEFAULT_UIF_SESSION_MINUTES,
      // What Chat with Human uses when its own session isn't set.
      autoResumeMinutes: ai?.auto_resume_minutes ?? null,
    },
    limits: LIMITS,
    emailConfigured: Boolean(getTransporter()),
  };
}

router.get("/bot-settings/:integrationId", async (req, res) => {
  try {
    const owned = await ownedIntegration(req);
    if (!owned) return res.status(404).json({ success: false, message: "Bot account not found" });
    return res.json(await payload(owned.integration.id, await getBotSettings(owned.integration.id)));
  } catch (err) {
    console.error("GET /bot-settings error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/bot-settings/:integrationId", async (req, res) => {
  try {
    const owned = await ownedIntegration(req);
    if (!owned) return res.status(404).json({ success: false, message: "Bot account not found" });
    const { values, errors } = cleanBotSettings(req.body || {});
    if (errors.length) return res.status(400).json({ success: false, code: "INVALID_SETTINGS", message: errors[0], errors });
    const settings = await saveBotSettings(owned.agencyId, owned.integration.id, values);
    return res.json({ ...(await payload(owned.integration.id, settings)), message: "Bot settings saved" });
  } catch (err) {
    console.error("PUT /bot-settings error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
