import pool from "../db.js";

/**
 * Click-to-chat ads (Click-to-WhatsApp / Messenger / Instagram Direct).
 * Meta puts a `referral` on the first message sent from an ad; we keep each
 * one (ad_referrals) for the Bot Manager → Click Ads report, and an owner can
 * choose a flow that answers people coming from a given ad (ad_flow_rules —
 * a flow of the same bot account, the bot-scope rule).
 */
const cut = (v, n) => (v === undefined || v === null || v === "" ? null : String(v).slice(0, n));

/** WhatsApp Cloud API: messages[].referral. */
export function extractWhatsAppReferral(msg) {
  const r = msg?.referral;
  if (!r || (!r.source_id && !r.source_url && !r.ctwa_clid)) return null;
  return {
    sourceType: cut(r.source_type, 30), // "ad" | "post"
    sourceId: cut(r.source_id, 100),
    sourceUrl: cut(r.source_url, 1000),
    headline: cut(r.headline, 500),
    body: cut(r.body, 1000),
    ctwaClid: cut(r.ctwa_clid, 255),
  };
}

/** Messenger / Instagram: referral on the message, the postback or the event, from an ad only. */
export function extractMetaReferral(event) {
  const r = event?.message?.referral || event?.postback?.referral || event?.referral;
  if (!r) return null;
  const fromAd = String(r.source || "").toUpperCase() === "ADS" || r.ad_id;
  if (!fromAd) return null;
  return {
    sourceType: "ad",
    sourceId: cut(r.ad_id, 100),
    sourceUrl: cut(r.ads_context_data?.post_id ? `https://www.facebook.com/${r.ads_context_data.post_id}` : null, 1000),
    headline: cut(r.ads_context_data?.ad_title, 500),
    body: cut(r.ref, 1000),
    ctwaClid: null,
  };
}

export async function recordAdReferral({ agencyId, integrationId, platform, contact, conversationId, referral }) {
  if (!referral) return;
  const isNew = contact?.created_at ? Date.now() - new Date(contact.created_at).getTime() < 5 * 60 * 1000 : false;
  await pool.query(
    `INSERT INTO ad_referrals (agency_id, integration_id, contact_id, conversation_id, platform, source_type, source_id, source_url, headline, body, ctwa_clid, is_new_contact)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [agencyId, integrationId, contact?.id || null, conversationId || null, platform, referral.sourceType, referral.sourceId, referral.sourceUrl,
      referral.headline, referral.body, referral.ctwaClid, isNew ? 1 : 0]
  );
}

/** The flow chosen for this ad on this bot account, if any (and still active + same bot). */
export async function flowForAd(agencyId, integrationId, sourceId) {
  if (!sourceId) return null;
  const [[row]] = await pool.query(
    `SELECT r.flow_id FROM ad_flow_rules r JOIN flows f ON f.id = r.flow_id
     WHERE r.integration_id = ? AND r.agency_id = ? AND r.source_id = ? AND f.agency_id = r.agency_id AND f.integration_id = r.integration_id AND f.is_active = 1`,
    [integrationId, agencyId, sourceId]
  );
  return row?.flow_id || null;
}

/** Report: one row per ad (or post) for a bot account over the last `days`. */
export async function adReport(agencyId, integrationId, days = 30) {
  const [rows] = await pool.query(
    `SELECT ar.source_id, MAX(ar.source_type) AS source_type, MAX(ar.headline) AS headline, MAX(ar.source_url) AS source_url,
            COUNT(*) AS chats, SUM(ar.is_new_contact) AS new_subscribers, COUNT(DISTINCT ar.contact_id) AS people,
            MAX(ar.created_at) AS last_at, MAX(r.flow_id) AS flow_id, MAX(r.label) AS label
     FROM ad_referrals ar
     LEFT JOIN ad_flow_rules r ON r.integration_id = ar.integration_id AND r.source_id = ar.source_id
     WHERE ar.agency_id = ? AND ar.integration_id = ? AND ar.created_at > NOW() - INTERVAL ? DAY
     GROUP BY ar.source_id ORDER BY chats DESC LIMIT 200`,
    [agencyId, integrationId, days]
  );
  return rows.map((r) => ({ ...r, chats: Number(r.chats), new_subscribers: Number(r.new_subscribers) || 0, people: Number(r.people) }));
}
