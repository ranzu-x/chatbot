/**
 * Bot Manager → Bot Manager → Quick Actions (utils/quickActions.js).
 *
 *   GET  /quick-actions/:integrationId                 the bot account's actions (created with their default reply on first open)
 *   PUT  /quick-actions/:integrationId/:action         { replyEnabled?, keywords?, frequency? (NO_MATCH) }
 *   POST /quick-actions/:integrationId/:action/reset   put the default reply back into the action's flow
 *
 * Each action's reply is a flow edited in the Flow Builder (/flows/:flowId).
 *
 * TENANT-LOCKED: no raw SQL in this file — the bot account is loaded with
 * tenantDb(req), everything else goes through utils/quickActions.js.
 */
import express from "express";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requireModule } from "../utils/entitlements.js";
import { tenantDb } from "../utils/tenantDb.js";
import { ensureQuickActions, updateQuickAction, resetQuickAction, ACTION_KEYS, actionsForPlatform } from "../utils/quickActions.js";

const router = express.Router();
router.use("/quick-actions", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), requireModule("feature_bot_manager"));

const agencyOf = (req) => req.tenant?.agencyId ?? req.user.agencyId;

async function loadIntegration(req) {
  const row = await tenantDb(req).getOwned("integrations", req.params.integrationId);
  return row && row.is_active !== 0 ? row : null;
}

const fail = (res, err) => {
  if (!err.status) console.error("[Quick Actions]", err);
  return res.status(err.status || 500).json({ success: false, message: err.status ? err.message : "Server error" });
};

router.get("/quick-actions/:integrationId", async (req, res) => {
  try {
    const integration = await loadIntegration(req);
    if (!integration) return res.status(404).json({ success: false, message: "Bot account not found" });
    if (!actionsForPlatform(integration.platform).length) {
      return res.json({ success: true, supported: false, actions: [] });
    }
    const actions = await ensureQuickActions(agencyOf(req), integration);
    return res.json({ success: true, supported: true, platform: integration.platform, actions });
  } catch (err) {
    return fail(res, err);
  }
});

router.put("/quick-actions/:integrationId/:action", async (req, res) => {
  try {
    const actionKey = String(req.params.action || "").toUpperCase();
    if (!ACTION_KEYS.includes(actionKey)) return res.status(404).json({ success: false, message: "Unknown action" });
    const integration = await loadIntegration(req);
    if (!integration) return res.status(404).json({ success: false, message: "Bot account not found" });
    const { replyEnabled, keywords, frequency } = req.body || {};
    const action = await updateQuickAction(agencyOf(req), integration, actionKey, {
      replyEnabled: replyEnabled === undefined ? undefined : Boolean(replyEnabled),
      keywords,
      frequency,
    });
    return res.json({ success: true, action });
  } catch (err) {
    return fail(res, err);
  }
});

router.post("/quick-actions/:integrationId/:action/reset", async (req, res) => {
  try {
    const actionKey = String(req.params.action || "").toUpperCase();
    if (!ACTION_KEYS.includes(actionKey)) return res.status(404).json({ success: false, message: "Unknown action" });
    const integration = await loadIntegration(req);
    if (!integration) return res.status(404).json({ success: false, message: "Bot account not found" });
    return res.json({ success: true, action: await resetQuickAction(agencyOf(req), integration, actionKey) });
  } catch (err) {
    return fail(res, err);
  }
});

export default router;
