import axios from "axios";
import pool from "../db.js";
import { GRAPH_URL } from "./metaApi.js";
import { encryptSecret, decryptSecret } from "./cryptoVault.js";
import { resolveMetaAppSettings, PLATFORM_GROUP } from "./appCredentials.js";
import { isWorkspaceExpired } from "./subscriptionStatus.js";
import { emitToAgency } from "./socket.js";

/**
 * Marketing Messages on Messenger — Meta's paid Marketing Message API
 * (docs: developers.facebook.com/documentation/business-messaging/messenger-platform/marketing-messages-on-messenger).
 *
 * - The Meta app needs App Review for ads_management, pages_messaging and
 *   paid_marketing_messages (or marketing_messages_messenger), plus a Facebook
 *   Login for Business configuration (meta_app_pool.mm_config_id). The
 *   business logs in with it; the code is exchanged here for a system-user
 *   token (or a long-lived user token) and an ad account is chosen — Meta
 *   bills each delivered message to that ad account.
 * - Subscribers: people who opted in. Their subscription token arrives in the
 *   `messaging_optins` webhook (type notification_messages) after an opt-in
 *   request, or is synced from GET /<PAGE_ID>/notification_message_tokens
 *   (click-to-Messenger ads and Meta's own automations subscribe people too).
 * - Sending: one Meta "message campaign" per campaign here
 *   (POST act_<id>/message_campaign), then POST act_<id>/messages per
 *   subscription token. One message per token per 12 hours (Meta's rule).
 * - Webhook fields marketing_message_echoes / _deliveries / _reads / _clicks /
 *   _delivery_failed update each recipient's row (mm_logs).
 */
const TEXT_MAX = 640;
const cut = (v, n) => String(v ?? "").trim().slice(0, n);
const bad = (message) => Object.assign(new Error(message), { status: 400 });

// ─── Message content ─────────────────────────────────────────────────────────
function cleanButtons(buttons) {
  const list = (Array.isArray(buttons) ? buttons : []).slice(0, 3);
  return list.map((b, i) => {
    const title = cut(b?.title, 20);
    if (!title) throw bad(`Button ${i + 1} needs a title`);
    if (b.type === "postback") return { type: "postback", title, payload: cut(b.payload || title, 1000) };
    const url = cut(b?.url, 2000);
    if (!/^https:\/\//i.test(url)) throw bad(`Button ${i + 1} needs an https:// link`);
    return { type: "web_url", title, url };
  });
}

/**
 * spec: { type: 'text' | 'button' | 'generic', text, title, subtitle, imageUrl, linkUrl, buttons[] }
 * → the `message` object of POST act_<id>/messages (Text / Button / Generic templates).
 */
export function buildMarketingMessage(spec = {}) {
  const type = spec.type || "text";
  if (type === "text") {
    const text = cut(spec.text, TEXT_MAX + 1);
    if (!text) throw bad("Write the message");
    if (text.length > TEXT_MAX) throw bad(`A text message can be at most ${TEXT_MAX} characters`);
    return { text };
  }
  if (type === "button") {
    const text = cut(spec.text, TEXT_MAX + 1);
    if (!text) throw bad("Write the message");
    if (text.length > TEXT_MAX) throw bad(`The text can be at most ${TEXT_MAX} characters`);
    const buttons = cleanButtons(spec.buttons);
    if (!buttons.length) throw bad("Add at least one button, or send a plain text message");
    return { attachment: { type: "template", payload: { template_type: "button", text, buttons } } };
  }
  if (type === "generic") {
    const title = cut(spec.title, 80);
    if (!title) throw bad("The card needs a title");
    const element = { title };
    if (spec.subtitle) element.subtitle = cut(spec.subtitle, 80);
    if (spec.imageUrl) {
      if (!/^https:\/\//i.test(spec.imageUrl)) throw bad("The image must be a public https:// link");
      element.image_url = cut(spec.imageUrl, 2000);
    }
    if (spec.linkUrl) {
      if (!/^https:\/\//i.test(spec.linkUrl)) throw bad("The card link must be https://");
      element.default_action = { type: "web_url", url: cut(spec.linkUrl, 2000), webview_height_ratio: "full" };
    }
    const buttons = cleanButtons(spec.buttons);
    if (buttons.length) element.buttons = buttons;
    return { attachment: { type: "template", payload: { template_type: "generic", elements: [element] } } };
  }
  throw bad("Unknown message type");
}

/** Short preview text for lists and the Inbox. */
export function describeMarketingMessage(spec = {}) {
  if (spec.type === "generic") return [spec.title, spec.subtitle].filter(Boolean).join(" — ");
  return String(spec.text || "");
}

// ─── Account (token + ad account) ────────────────────────────────────────────
export async function getAccount(agencyId, integrationId) {
  const [[row]] = await pool.query("SELECT * FROM mm_accounts WHERE integration_id = ? AND agency_id = ?", [integrationId, agencyId]);
  if (!row) return null;
  return { ...row, token: decryptSecret(row.access_token) };
}

export function publicAccount(acc) {
  if (!acc) return null;
  return {
    adAccountId: acc.ad_account_id, adAccountName: acc.ad_account_name, tokenType: acc.token_type,
    tokenExpiresAt: acc.token_expires_at, status: acc.status, lastError: acc.last_error,
    connectedAt: acc.connected_at, subscribersSyncedAt: acc.subscribers_synced_at,
  };
}

async function graph(method, path, token, data) {
  const res = await axios({
    method,
    url: /^https?:/.test(path) ? path : `${GRAPH_URL}/${path.replace(/^\//, "")}`,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(method === "GET" ? { params: data } : { data }),
    timeout: 20000,
    validateStatus: () => true,
  });
  if (res.status >= 400 || res.data?.error) {
    const e = res.data?.error || {};
    const err = new Error(e.error_user_msg || e.message || `Meta answered HTTP ${res.status}`);
    err.code = "META_API_ERROR";
    err.metaCode = e.code;
    err.metaSubcode = e.error_subcode;
    throw err;
  }
  return res.data;
}

/** The Meta app (and its Marketing Messages login configuration) this workspace uses. */
export async function loginConfigFor(agencyId) {
  const app = await resolveMetaAppSettings(agencyId, PLATFORM_GROUP.FACEBOOK);
  return app ? { appId: app.app_id, configId: app.mm_config_id || null, app } : null;
}

/**
 * Facebook Login for Business → code → token. Detects the token type and
 * turns a short user token into a 60-day one.
 */
export async function exchangeLoginCode(agencyId, code) {
  const cfg = await loginConfigFor(agencyId);
  if (!cfg?.app?.app_id || !cfg.app.app_secret) throw bad("The Meta app isn't set up for this workspace");
  const tokenRes = await axios.get(`${GRAPH_URL}/oauth/access_token`, {
    params: { client_id: cfg.app.app_id, client_secret: cfg.app.app_secret, code },
    timeout: 20000, validateStatus: () => true,
  });
  if (!tokenRes.data?.access_token) throw bad(tokenRes.data?.error?.message || "Facebook didn't return a token");
  let token = tokenRes.data.access_token;
  const appToken = `${cfg.app.app_id}|${cfg.app.app_secret}`;
  const debug = await graph("GET", "debug_token", appToken, { input_token: token }).catch(() => null);
  const type = debug?.data?.type === "SYSTEM_USER" ? "SYSTEM_USER" : "USER";
  let expiresAt = debug?.data?.expires_at ? new Date(debug.data.expires_at * 1000) : null;
  if (type === "USER") {
    const long = await axios.get(`${GRAPH_URL}/oauth/access_token`, {
      params: { grant_type: "fb_exchange_token", client_id: cfg.app.app_id, client_secret: cfg.app.app_secret, fb_exchange_token: token },
      timeout: 20000, validateStatus: () => true,
    });
    if (long.data?.access_token) {
      token = long.data.access_token;
      expiresAt = long.data.expires_in ? new Date(Date.now() + long.data.expires_in * 1000) : expiresAt;
    }
  }
  if (expiresAt && expiresAt.getTime() === 0) expiresAt = null; // 0 = never expires
  return { token, type, expiresAt };
}

export async function listAdAccounts(token) {
  const data = await graph("GET", "me/adaccounts", token, { fields: "id,name,account_status,currency", limit: 100 });
  return (data.data || []).map((a) => ({ id: a.id, name: a.name, status: a.account_status, currency: a.currency }));
}

export async function saveAccount({ agencyId, integrationId, token, type, expiresAt, adAccountId, adAccountName }) {
  // The ad account may be chosen right after login (saved without one first).
  const act = !adAccountId ? null : String(adAccountId).startsWith("act_") ? String(adAccountId) : `act_${adAccountId}`;
  if (act && !/^act_\d+$/.test(act)) throw bad("That isn't an ad account id");
  await pool.query(
    `INSERT INTO mm_accounts (integration_id, agency_id, access_token, token_type, token_expires_at, ad_account_id, ad_account_name, status, last_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', NULL)
     ON DUPLICATE KEY UPDATE access_token = VALUES(access_token), token_type = VALUES(token_type), token_expires_at = VALUES(token_expires_at),
       ad_account_id = VALUES(ad_account_id), ad_account_name = VALUES(ad_account_name), status = 'ACTIVE', last_error = NULL`,
    [integrationId, agencyId, encryptSecret(token), type === "USER" ? "USER" : "SYSTEM_USER", expiresAt || null, act, adAccountName || null]
  );
}

// ─── Subscribers ─────────────────────────────────────────────────────────────
async function contactForPsid(agencyId, psid) {
  if (!psid) return null;
  const [[c]] = await pool.query("SELECT id FROM contacts WHERE agency_id = ? AND platform = 'FACEBOOK' AND external_id = ? LIMIT 1", [agencyId, String(psid)]);
  return c?.id || null;
}

export async function upsertSubscription(integration, { token, psid, status = "ACTIVE", title, timezone, nextEligibleAt, expiresAt, source }) {
  if (!token) return null;
  const contactId = await contactForPsid(integration.agency_id, psid);
  await pool.query(
    `INSERT INTO mm_subscriptions (agency_id, integration_id, contact_id, psid, token, status, title, timezone, next_eligible_at, expires_at, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE contact_id = COALESCE(VALUES(contact_id), contact_id), psid = COALESCE(VALUES(psid), psid), status = VALUES(status),
       title = COALESCE(VALUES(title), title), timezone = COALESCE(VALUES(timezone), timezone),
       next_eligible_at = VALUES(next_eligible_at), expires_at = VALUES(expires_at), source = COALESCE(source, VALUES(source))`,
    [integration.agency_id, integration.id, contactId, psid ? String(psid) : null, String(token), status, title ? cut(title, 255) : null,
      timezone ? cut(timezone, 64) : null, nextEligibleAt || null, expiresAt || null, source || null]
  );
  return { contactId };
}

/** messaging_optins webhook with type notification_messages. Returns true when handled. */
export async function handleOptinEvent(integration, event) {
  const optin = event?.optin;
  if (!optin || optin.type !== "notification_messages") return false;
  const stopped = /STOP/i.test(String(optin.notification_messages_status || "")) || /STOP|EXPIRED/i.test(String(optin.user_token_status || ""));
  await upsertSubscription(integration, {
    token: optin.notification_messages_token,
    psid: event.sender?.id,
    status: stopped ? "STOPPED" : "ACTIVE",
    title: optin.title,
    timezone: optin.notification_messages_timezone,
    source: "OPT_IN",
  });
  emitToAgency(integration.agency_id, "mm_subscription", { integrationId: integration.id, psid: event.sender?.id || null, status: stopped ? "STOPPED" : "ACTIVE" });
  return true;
}

/** Pulls every subscription token of the Page (opt-ins, click-to-Messenger ads, Meta automations). */
export async function syncSubscribers(integration) {
  const tsToDate = (v) => (v ? new Date(Number(v) * (String(v).length > 11 ? 1 : 1000)) : null);
  let url = `${integration.fb_page_id || "me"}/notification_message_tokens`;
  let params = { limit: 1000 };
  let count = 0;
  for (let page = 0; page < 100 && url; page++) {
    const data = await graph("GET", url, integration.access_token, params);
    for (const t of data.data || []) {
      if (!t.notification_messages_token) continue;
      await upsertSubscription(integration, {
        token: t.notification_messages_token,
        psid: t.recipient_id,
        status: /STOP|EXPIRED/i.test(String(t.user_token_status || "")) ? "STOPPED" : "ACTIVE",
        title: t.topic_title,
        timezone: t.notification_messages_timezone,
        nextEligibleAt: tsToDate(t.next_eligible_time),
        expiresAt: tsToDate(t.token_expiry_timestamp),
        source: t.custom_audience_ids ? "CUSTOM_AUDIENCE" : "SYNC",
      });
      count++;
    }
    url = data.paging?.next || null;
    params = undefined;
  }
  await pool.query("UPDATE mm_accounts SET subscribers_synced_at = NOW() WHERE integration_id = ?", [integration.id]);
  return count;
}

/** Opt-in request ("Get updates?") to someone who is chatting with the Page. */
export function buildOptInRequest({ title, imageUrl, payload, timezone }) {
  const t = cut(title, 65);
  if (!t) throw bad("The opt-in request needs a title");
  const p = { template_type: "notification_messages", title: t, payload: cut(payload || "MM_OPTIN", 1000) };
  if (imageUrl) {
    if (!/^https:\/\//i.test(imageUrl)) throw bad("The image must be a public https:// link");
    p.image_url = imageUrl;
  }
  if (timezone) p.notification_messages_timezone = cut(timezone, 64);
  return { attachment: { type: "template", payload: p } };
}

export async function sendOptInRequest(integration, psid, opts) {
  const message = buildOptInRequest(opts);
  const data = await graph("POST", `${integration.fb_page_id || "me"}/messages`, integration.access_token, {
    recipient: { id: String(psid) }, message, messaging_type: "RESPONSE",
  });
  return data.message_id || data.recipient?.message_id || null;
}

// ─── Campaigns ───────────────────────────────────────────────────────────────
export async function computeAudience(campaign) {
  const audience = typeof campaign.audience === "string" ? JSON.parse(campaign.audience || "{}") : campaign.audience || {};
  const labelIds = (audience.labelIds || []).map(Number).filter(Boolean);
  const params = [campaign.integration_id, campaign.agency_id];
  let labelSql = "";
  if (labelIds.length) {
    labelSql = "AND s.contact_id IN (SELECT contact_id FROM contact_labels WHERE label_id IN (?))";
    params.push(labelIds);
  }
  const [rows] = await pool.query(
    `SELECT s.* FROM mm_subscriptions s
     LEFT JOIN contacts c ON c.id = s.contact_id
     WHERE s.integration_id = ? AND s.agency_id = ? AND s.status = 'ACTIVE'
       AND (s.expires_at IS NULL OR s.expires_at > NOW())
       AND (c.id IS NULL OR (c.is_blocked = 0 AND COALESCE(c.subscription_status, 'SUBSCRIBED') <> 'UNSUBSCRIBED'))
       ${labelSql}`,
    params
  );
  return rows;
}

export async function recountCampaign(campaignId) {
  const [[c]] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(status IN ('SENT','DELIVERED','READ','CLICKED')) AS sent,
            SUM(status IN ('DELIVERED','READ','CLICKED')) AS delivered,
            SUM(status IN ('READ','CLICKED')) AS read_c,
            SUM(status = 'CLICKED') AS clicked,
            SUM(status = 'FAILED') AS failed,
            SUM(status = 'SKIPPED') AS skipped
     FROM mm_logs WHERE campaign_id = ?`,
    [campaignId]
  );
  await pool.query(
    `UPDATE mm_campaigns SET sent_count = ?, delivered_count = ?, read_count = ?, click_count = ?, failed_count = ?, skipped_count = ? WHERE id = ?`,
    [Number(c.sent) || 0, Number(c.delivered) || 0, Number(c.read_c) || 0, Number(c.clicked) || 0, Number(c.failed) || 0, Number(c.skipped) || 0, campaignId]
  );
}

const STATUS_RANK = { PENDING: 0, FAILED: 1, SKIPPED: 1, SENT: 2, DELIVERED: 3, READ: 4, CLICKED: 5 };

/** Sends a campaign now. Safe to call twice: only one caller claims it. */
export async function executeCampaign(campaignId) {
  const [claim] = await pool.query("UPDATE mm_campaigns SET status = 'SENDING', error_message = NULL WHERE id = ? AND status IN ('DRAFT','FAILED')", [campaignId]);
  if (!claim.affectedRows) return;
  const [[campaign]] = await pool.query("SELECT * FROM mm_campaigns WHERE id = ?", [campaignId]);
  const emit = () => pool.query("SELECT id, status, sent_count, delivered_count, read_count, click_count, failed_count, skipped_count, total_targeted FROM mm_campaigns WHERE id = ?", [campaignId])
    .then(([[row]]) => row && emitToAgency(campaign.agency_id, "mm_campaign_update", row)).catch(() => {});
  try {
    if (await isWorkspaceExpired(campaign.agency_id)) throw new Error("Your plan has expired — renew it to send.");
    const [[integration]] = await pool.query("SELECT * FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'FACEBOOK' AND is_active = 1", [campaign.integration_id, campaign.agency_id]);
    if (!integration) throw new Error("This Facebook Page is no longer connected");
    const account = await getAccount(campaign.agency_id, campaign.integration_id);
    if (!account?.ad_account_id) throw new Error("Connect Marketing Messages for this Page first");
    const spec = typeof campaign.message === "string" ? JSON.parse(campaign.message) : campaign.message;
    const message = buildMarketingMessage(spec);

    let metaCampaignId = campaign.meta_campaign_id;
    if (!metaCampaignId) {
      const body = { name: campaign.name, page_id: integration.fb_page_id };
      if (campaign.daily_budget) body.daily_budget = Number(campaign.daily_budget);
      const created = await graph("POST", `${account.ad_account_id}/message_campaign`, account.token, body);
      metaCampaignId = created.id;
      await pool.query("UPDATE mm_campaigns SET meta_campaign_id = ? WHERE id = ?", [metaCampaignId, campaignId]);
    }

    const audience = await computeAudience(campaign);
    if (audience.length) {
      await pool.query(
        "INSERT IGNORE INTO mm_logs (campaign_id, subscription_id, contact_id, token, status) VALUES ?",
        [audience.map((s) => [campaignId, s.id, s.contact_id, s.token, "PENDING"])]
      );
    }
    await pool.query("UPDATE mm_campaigns SET total_targeted = (SELECT COUNT(*) FROM mm_logs WHERE campaign_id = ?) WHERE id = ?", [campaignId, campaignId]);
    const [pending] = await pool.query(
      `SELECT l.id, l.token, s.next_eligible_at FROM mm_logs l JOIN mm_subscriptions s ON s.id = l.subscription_id
       WHERE l.campaign_id = ? AND l.status = 'PENDING'`,
      [campaignId]
    );
    let authFailures = 0;
    for (const row of pending) {
      if (row.next_eligible_at && new Date(row.next_eligible_at) > new Date()) {
        await pool.query("UPDATE mm_logs SET status = 'SKIPPED', error = ? WHERE id = ?", ["Got a marketing message in the last 12 hours", row.id]);
        continue;
      }
      try {
        const res = await graph("POST", `${account.ad_account_id}/messages`, account.token, {
          message_id: metaCampaignId,
          messenger_delivery_data: { subscription_token: row.token },
          message,
        });
        await pool.query("UPDATE mm_logs SET status = 'SENT', tracking_id = ?, sent_at = NOW(), error = NULL WHERE id = ?", [res.marketing_message_tracking_id || null, row.id]);
        await pool.query("UPDATE mm_subscriptions SET next_eligible_at = NOW() + INTERVAL 12 HOUR WHERE token = ? AND integration_id = ?", [row.token, campaign.integration_id]);
        authFailures = 0;
      } catch (err) {
        const unavailable = Number(err.metaCode) === 2300052;
        await pool.query("UPDATE mm_logs SET status = ?, error = ? WHERE id = ?", [unavailable ? "SKIPPED" : "FAILED", String(err.message).slice(0, 500), row.id]);
        if ([190, 200, 10, 294].includes(Number(err.metaCode))) {
          // The token / permission is the problem — every other send would fail the same way.
          authFailures++;
          if (authFailures >= 3) {
            await pool.query("UPDATE mm_accounts SET status = 'ERROR', last_error = ? WHERE integration_id = ?", [String(err.message).slice(0, 500), campaign.integration_id]);
            throw new Error(`Meta refused the send: ${err.message}`);
          }
        }
      }
      await new Promise((r) => setTimeout(r, 60));
    }
    await recountCampaign(campaignId);
    await pool.query("UPDATE mm_campaigns SET status = 'SENT', sent_at = NOW() WHERE id = ?", [campaignId]);
  } catch (err) {
    await recountCampaign(campaignId).catch(() => {});
    await pool.query("UPDATE mm_campaigns SET status = 'FAILED', error_message = ? WHERE id = ?", [String(err.message).slice(0, 500), campaignId]);
  } finally {
    await emit();
  }
}

/**
 * Page webhook `changes` for Marketing Messages. Returns true when the field
 * was one of ours. Matched by tracking id when present, else by token +
 * Meta campaign id.
 */
export async function handleMarketingChange(integration, change) {
  const field = String(change?.field || "");
  if (!field.startsWith("marketing_message")) return false;
  const v = change.value || change;
  const status = field === "marketing_message_deliveries" ? "DELIVERED"
    : field === "marketing_message_reads" ? "READ"
    : field === "marketing_message_clicks" ? "CLICKED"
    : field === "marketing_message_delivery_failed" ? "FAILED"
    : field === "marketing_message_echoes" ? "SENT" : null;
  if (!status) return true;
  const token = v.messenger_subscription_token ? String(v.messenger_subscription_token) : null;
  const [rows] = v.marketing_message_tracking_id
    ? await pool.query(
      `SELECT l.id, l.status, l.campaign_id FROM mm_logs l JOIN mm_campaigns c ON c.id = l.campaign_id
       WHERE l.tracking_id = ? AND c.integration_id = ?`,
      [String(v.marketing_message_tracking_id), integration.id])
    : await pool.query(
      `SELECT l.id, l.status, l.campaign_id FROM mm_logs l JOIN mm_campaigns c ON c.id = l.campaign_id
       WHERE l.token = ? AND c.meta_campaign_id = ? AND c.integration_id = ?`,
      [token, String(v.message_id || ""), integration.id]);
  for (const r of rows) {
    // Never move backwards (a late "delivered" after "read"); a failure only replaces SENT/PENDING.
    const allowed = status === "FAILED" ? ["PENDING", "SENT"].includes(r.status) : STATUS_RANK[status] > (STATUS_RANK[r.status] ?? 0);
    if (!allowed) continue;
    await pool.query("UPDATE mm_logs SET status = ?, error = ? WHERE id = ?", [status, status === "FAILED" ? cut(v.error_message, 500) : null, r.id]);
    await recountCampaign(r.campaign_id);
  }
  return true;
}
