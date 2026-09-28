/**
 * Marketing Messages on Messenger (utils/messengerMarketing.js) — per Facebook
 * Page: connect (Facebook Login for Business code, or a pasted token), ad
 * account, subscribers, campaigns, opt-in requests. Team members need the
 * broadcast.* keys (middleware/teamPermissions.js); connecting is owner-only.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requireModule } from "../utils/entitlements.js";
import {
  getAccount, publicAccount, loginConfigFor, exchangeLoginCode, listAdAccounts, saveAccount, syncSubscribers,
  buildMarketingMessage, describeMarketingMessage, computeAudience, executeCampaign, sendOptInRequest,
} from "../utils/messengerMarketing.js";

const router = express.Router();
router.use("/marketing-messages", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), requireModule("feature_messenger_utility"));
const ownerOnly = roleMiddleware("RESELLER", "ADMIN");
const agencyOf = (req) => req.tenant?.agencyId ?? req.user.agencyId;

function fail(res, err, label) {
  if (err.status) return res.status(err.status).json({ success: false, message: err.message });
  if (err.code === "META_API_ERROR") return res.status(502).json({ success: false, message: `Meta: ${err.message}` });
  console.error(`[Marketing Messages] ${label}:`, err);
  return res.status(500).json({ success: false, message: "Server error" });
}

async function loadPage(req, res) {
  const [[integration]] = await pool.query(
    "SELECT * FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'FACEBOOK'",
    [req.params.integrationId, agencyOf(req)]
  );
  if (!integration) res.status(404).json({ success: false, message: "Facebook Page not found" });
  return integration || null;
}

// ─── Overview ────────────────────────────────────────────────────────────────
router.get("/marketing-messages/:integrationId", async (req, res) => {
  try {
    const integration = await loadPage(req, res);
    if (!integration) return;
    const agencyId = agencyOf(req);
    const [account, cfg] = await Promise.all([getAccount(agencyId, integration.id), loginConfigFor(agencyId)]);
    const [[subs]] = await pool.query(
      `SELECT SUM(status = 'ACTIVE' AND (expires_at IS NULL OR expires_at > NOW())) AS active, SUM(status = 'STOPPED') AS stopped,
              SUM(status = 'ACTIVE' AND next_eligible_at > NOW()) AS resting
       FROM mm_subscriptions WHERE integration_id = ? AND agency_id = ?`,
      [integration.id, agencyId]
    );
    const [campaigns] = await pool.query(
      `SELECT id, name, message, audience, daily_budget, status, total_targeted, sent_count, delivered_count, read_count, click_count,
              failed_count, skipped_count, error_message, created_at, sent_at
       FROM mm_campaigns WHERE integration_id = ? AND agency_id = ? ORDER BY id DESC LIMIT 100`,
      [integration.id, agencyId]
    );
    return res.json({
      success: true,
      page: { id: integration.id, name: integration.fb_page_name || integration.name, pageId: integration.fb_page_id },
      login: { appId: cfg?.appId || null, configId: cfg?.configId || null },
      account: publicAccount(account),
      subscribers: { active: Number(subs.active) || 0, stopped: Number(subs.stopped) || 0, resting: Number(subs.resting) || 0 },
      campaigns: campaigns.map((c) => {
        const message = typeof c.message === "string" ? JSON.parse(c.message) : c.message;
        return { ...c, message, preview: describeMarketingMessage(message), audience: typeof c.audience === "string" ? JSON.parse(c.audience || "null") : c.audience };
      }),
    });
  } catch (err) {
    return fail(res, err, "overview");
  }
});

// ─── Connect ─────────────────────────────────────────────────────────────────
router.post("/marketing-messages/:integrationId/connect/code", ownerOnly, async (req, res) => {
  try {
    const integration = await loadPage(req, res);
    if (!integration) return;
    if (!req.body?.code) return res.status(400).json({ success: false, message: "Missing the Facebook login code" });
    const got = await exchangeLoginCode(agencyOf(req), String(req.body.code));
    await saveAccount({ agencyId: agencyOf(req), integrationId: integration.id, ...got, adAccountId: null });
    const adAccounts = await listAdAccounts(got.token).catch(() => []);
    return res.json({ success: true, adAccounts, message: "Logged in — now choose the ad account to bill" });
  } catch (err) {
    return fail(res, err, "connect code");
  }
});

router.post("/marketing-messages/:integrationId/connect/manual", ownerOnly, async (req, res) => {
  try {
    const integration = await loadPage(req, res);
    if (!integration) return;
    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ success: false, message: "Paste the access token" });
    const adAccounts = await listAdAccounts(token); // proves the token works
    await saveAccount({
      agencyId: agencyOf(req), integrationId: integration.id, token,
      type: req.body?.tokenType === "USER" ? "USER" : "SYSTEM_USER", expiresAt: null, adAccountId: req.body?.adAccountId || null,
    });
    return res.json({ success: true, adAccounts });
  } catch (err) {
    return fail(res, err, "connect manual");
  }
});

router.get("/marketing-messages/:integrationId/ad-accounts", ownerOnly, async (req, res) => {
  try {
    const integration = await loadPage(req, res);
    if (!integration) return;
    const account = await getAccount(agencyOf(req), integration.id);
    if (!account) return res.status(400).json({ success: false, message: "Connect first" });
    return res.json({ success: true, adAccounts: await listAdAccounts(account.token) });
  } catch (err) {
    return fail(res, err, "ad accounts");
  }
});

router.put("/marketing-messages/:integrationId/ad-account", ownerOnly, async (req, res) => {
  try {
    const integration = await loadPage(req, res);
    if (!integration) return;
    const account = await getAccount(agencyOf(req), integration.id);
    if (!account) return res.status(400).json({ success: false, message: "Connect first" });
    const adAccounts = await listAdAccounts(account.token);
    const wanted = String(req.body?.adAccountId || "");
    const chosen = adAccounts.find((a) => a.id === wanted || a.id === `act_${wanted}`);
    if (!chosen) return res.status(400).json({ success: false, message: "That ad account isn't available with this login" });
    await saveAccount({
      agencyId: agencyOf(req), integrationId: integration.id, token: account.token, type: account.token_type,
      expiresAt: account.token_expires_at, adAccountId: chosen.id, adAccountName: chosen.name,
    });
    return res.json({ success: true, message: `Marketing messages will be billed to ${chosen.name}` });
  } catch (err) {
    return fail(res, err, "ad account");
  }
});

router.delete("/marketing-messages/:integrationId/account", ownerOnly, async (req, res) => {
  try {
    const integration = await loadPage(req, res);
    if (!integration) return;
    await pool.query("DELETE FROM mm_accounts WHERE integration_id = ? AND agency_id = ?", [integration.id, agencyOf(req)]);
    return res.json({ success: true, message: "Disconnected" });
  } catch (err) {
    return fail(res, err, "disconnect");
  }
});

// ─── Subscribers ─────────────────────────────────────────────────────────────
router.post("/marketing-messages/:integrationId/subscribers/sync", async (req, res) => {
  try {
    const integration = await loadPage(req, res);
    if (!integration) return;
    const count = await syncSubscribers(integration);
    return res.json({ success: true, count, message: `${count} subscription token(s) read from Meta` });
  } catch (err) {
    return fail(res, err, "sync");
  }
});

router.get("/marketing-messages/:integrationId/subscribers", async (req, res) => {
  try {
    const integration = await loadPage(req, res);
    if (!integration) return;
    const page = Math.max(1, Number(req.query.page) || 1);
    const [rows] = await pool.query(
      `SELECT s.id, s.status, s.title, s.source, s.next_eligible_at, s.created_at, c.id AS contact_id, c.name AS contact_name
       FROM mm_subscriptions s LEFT JOIN contacts c ON c.id = s.contact_id
       WHERE s.integration_id = ? AND s.agency_id = ? ORDER BY s.id DESC LIMIT 50 OFFSET ?`,
      [integration.id, agencyOf(req), (page - 1) * 50]
    );
    const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM mm_subscriptions WHERE integration_id = ? AND agency_id = ?", [integration.id, agencyOf(req)]);
    return res.json({ success: true, subscribers: rows, total, page });
  } catch (err) {
    return fail(res, err, "subscribers");
  }
});

/** Ask one subscriber (from the Inbox) to opt in. */
router.post("/marketing-messages/:integrationId/opt-in", async (req, res) => {
  try {
    const integration = await loadPage(req, res);
    if (!integration) return;
    const [[contact]] = await pool.query(
      "SELECT id, external_id FROM contacts WHERE id = ? AND agency_id = ? AND platform = 'FACEBOOK'",
      [req.body?.contactId, agencyOf(req)]
    );
    if (!contact) return res.status(404).json({ success: false, message: "Subscriber not found" });
    const [[conversation]] = await pool.query(
      "SELECT * FROM conversations WHERE contact_id = ? AND integration_id = ? AND agency_id = ? ORDER BY last_message_at DESC LIMIT 1",
      [contact.id, integration.id, agencyOf(req)]
    );
    const title = String(req.body?.title || "Get our offers and updates").slice(0, 65);
    if (!conversation) {
      await sendOptInRequest(integration, contact.external_id, { title, imageUrl: req.body?.imageUrl, payload: "MM_OPTIN_INBOX" });
    } else {
      // Through sendMsg so it shows in the Inbox like any other message.
      const { sendMsg } = await import("../utils/flowEngine.js");
      const msg = await sendMsg(agencyOf(req), conversation, `📬 ${title}`, "TEXT", integration, {
        marketingOptIn: { title, imageUrl: req.body?.imageUrl || null, payload: "MM_OPTIN_INBOX" },
      });
      if (!msg?.external_msg_id) return res.status(502).json({ success: false, message: msg?.sendError || "Messenger didn't accept the request (the person may be outside the 24-hour window)" });
    }
    return res.json({ success: true, message: "Opt-in request sent" });
  } catch (err) {
    return fail(res, err, "opt-in");
  }
});

// ─── Campaigns ───────────────────────────────────────────────────────────────
function cleanCampaignBody(body) {
  const name = String(body?.name || "").trim().slice(0, 191);
  if (!name) throw Object.assign(new Error("Give the campaign a name"), { status: 400 });
  const message = body?.message || {};
  buildMarketingMessage(message); // validates
  const labelIds = (Array.isArray(body?.audience?.labelIds) ? body.audience.labelIds : []).map(Number).filter(Boolean).slice(0, 50);
  const budget = body?.dailyBudget ? Math.round(Number(body.dailyBudget) * 100) : null;
  if (budget !== null && !(budget > 0)) throw Object.assign(new Error("The daily budget must be more than 0"), { status: 400 });
  return { name, message, audience: { labelIds }, dailyBudget: budget };
}

router.post("/marketing-messages/:integrationId/campaigns", async (req, res) => {
  try {
    const integration = await loadPage(req, res);
    if (!integration) return;
    const c = cleanCampaignBody(req.body);
    const [ins] = await pool.query(
      "INSERT INTO mm_campaigns (agency_id, integration_id, name, message, audience, daily_budget, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [agencyOf(req), integration.id, c.name, JSON.stringify(c.message), JSON.stringify(c.audience), c.dailyBudget, req.user.id]
    );
    return res.json({ success: true, id: ins.insertId });
  } catch (err) {
    return fail(res, err, "create");
  }
});

router.put("/marketing-messages/:integrationId/campaigns/:campaignId", async (req, res) => {
  try {
    const integration = await loadPage(req, res);
    if (!integration) return;
    const c = cleanCampaignBody(req.body);
    const [r] = await pool.query(
      "UPDATE mm_campaigns SET name = ?, message = ?, audience = ?, daily_budget = ? WHERE id = ? AND integration_id = ? AND agency_id = ? AND status = 'DRAFT'",
      [c.name, JSON.stringify(c.message), JSON.stringify(c.audience), c.dailyBudget, req.params.campaignId, integration.id, agencyOf(req)]
    );
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Only a draft can be edited" });
    return res.json({ success: true, message: "Saved" });
  } catch (err) {
    return fail(res, err, "update");
  }
});

router.delete("/marketing-messages/:integrationId/campaigns/:campaignId", async (req, res) => {
  try {
    const integration = await loadPage(req, res);
    if (!integration) return;
    const [r] = await pool.query("DELETE FROM mm_campaigns WHERE id = ? AND integration_id = ? AND agency_id = ? AND status = 'DRAFT'", [req.params.campaignId, integration.id, agencyOf(req)]);
    if (!r.affectedRows) return res.status(404).json({ success: false, message: "Only a draft can be deleted" });
    return res.json({ success: true, message: "Deleted" });
  } catch (err) {
    return fail(res, err, "delete");
  }
});

router.get("/marketing-messages/:integrationId/campaigns/:campaignId/audience", async (req, res) => {
  try {
    const integration = await loadPage(req, res);
    if (!integration) return;
    const [[campaign]] = await pool.query("SELECT * FROM mm_campaigns WHERE id = ? AND integration_id = ? AND agency_id = ?", [req.params.campaignId, integration.id, agencyOf(req)]);
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });
    const audience = await computeAudience(campaign);
    const resting = audience.filter((s) => s.next_eligible_at && new Date(s.next_eligible_at) > new Date()).length;
    return res.json({ success: true, count: audience.length, resting });
  } catch (err) {
    return fail(res, err, "audience");
  }
});

// Paid sending: needs an explicit confirmation from the caller.
router.post("/marketing-messages/:integrationId/campaigns/:campaignId/send", async (req, res) => {
  try {
    const integration = await loadPage(req, res);
    if (!integration) return;
    if (req.body?.confirmPaid !== true) {
      return res.status(409).json({ success: false, code: "PAID_CONFIRMATION_REQUIRED", message: "Marketing messages are paid per delivery — confirm to send." });
    }
    const account = await getAccount(agencyOf(req), integration.id);
    if (!account?.ad_account_id) return res.status(400).json({ success: false, message: "Connect Marketing Messages and choose an ad account first" });
    const [[campaign]] = await pool.query("SELECT id, status FROM mm_campaigns WHERE id = ? AND integration_id = ? AND agency_id = ?", [req.params.campaignId, integration.id, agencyOf(req)]);
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });
    if (!["DRAFT", "FAILED"].includes(campaign.status)) return res.status(400).json({ success: false, message: "This campaign was already sent" });
    executeCampaign(campaign.id).catch((e) => console.error("[Marketing Messages] send:", e.message));
    return res.json({ success: true, message: "Sending started" });
  } catch (err) {
    return fail(res, err, "send");
  }
});

router.get("/marketing-messages/:integrationId/campaigns/:campaignId/logs", async (req, res) => {
  try {
    const integration = await loadPage(req, res);
    if (!integration) return;
    const [[campaign]] = await pool.query("SELECT id FROM mm_campaigns WHERE id = ? AND integration_id = ? AND agency_id = ?", [req.params.campaignId, integration.id, agencyOf(req)]);
    if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });
    const [logs] = await pool.query(
      `SELECT l.id, l.status, l.error, l.sent_at, c.name AS contact_name FROM mm_logs l LEFT JOIN contacts c ON c.id = l.contact_id
       WHERE l.campaign_id = ? ORDER BY l.id LIMIT 500`,
      [campaign.id]
    );
    return res.json({ success: true, logs });
  } catch (err) {
    return fail(res, err, "logs");
  }
});

export default router;
