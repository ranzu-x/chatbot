import axios from "axios";
import pool from "../db.js";
import { GRAPH_URL } from "./metaApi.js";

/**
 * WhatsApp number management that isn't messaging:
 *  - health: quality rating, messaging-limit tier, throughput, name status
 *    (GET /<PHONE_NUMBER_ID>?fields=…) — why sends get limited or refused.
 *  - business username (Username API, since 29 Jun 2026): GET / POST / DELETE
 *    /<PHONE_NUMBER_ID>/username.
 *  - Block API: blocking a subscriber in the app also blocks them on WhatsApp
 *    (POST / DELETE /<PHONE_NUMBER_ID>/block_users). Meta only accepts it for
 *    people who wrote in the last 24 hours (error 131047).
 */

const headers = (integration) => ({ Authorization: `Bearer ${integration.access_token}`, "Content-Type": "application/json" });
const metaMsg = (e) => e.response?.data?.error?.error_user_msg || e.response?.data?.error?.message || e.message;

const TIER_LABELS = {
  TIER_50: "50 customers / day", TIER_250: "250 customers / day", TIER_1K: "1,000 customers / day",
  TIER_2K: "2,000 customers / day", TIER_10K: "10,000 customers / day", TIER_100K: "100,000 customers / day",
  TIER_UNLIMITED: "Unlimited", TIER_NOT_SET: "Not set yet",
};

export async function getNumberHealth(integration) {
  const fields = "display_phone_number,verified_name,quality_rating,messaging_limit_tier,throughput,name_status,code_verification_status,platform_type,status";
  const { data } = await axios.get(`${GRAPH_URL}/${integration.wa_phone_number_id}`, { params: { fields }, headers: headers(integration) });
  let username = null;
  try {
    const res = await axios.get(`${GRAPH_URL}/${integration.wa_phone_number_id}/username`, { headers: headers(integration) });
    username = res.data?.username ? { username: res.data.username, status: res.data.status || null } : null;
  } catch { /* the Username API isn't available on every number yet */ }
  return {
    displayPhoneNumber: data.display_phone_number || null,
    verifiedName: data.verified_name || null,
    nameStatus: data.name_status || null,
    qualityRating: data.quality_rating || null, // GREEN | YELLOW | RED | UNKNOWN
    messagingLimitTier: data.messaging_limit_tier || null,
    messagingLimitLabel: TIER_LABELS[data.messaging_limit_tier] || data.messaging_limit_tier || null,
    throughput: data.throughput?.level || null, // STANDARD | HIGH
    status: data.status || null,
    username,
  };
}

const USERNAME_RE = /^(?!www)(?!.*\.\.)(?![.])(?!.*[.]$)(?=.*[a-z])[a-z0-9._]{3,35}$/;
const DOMAIN_END_RE = /\.(com|net|org|io|co|app|info|biz|me|xyz|shop|store|online)$/;

export function validateUsername(value) {
  const u = String(value || "").trim().toLowerCase().replace(/^@/, "");
  if (!USERNAME_RE.test(u) || DOMAIN_END_RE.test(u)) {
    const e = new Error("3–35 characters: letters, numbers, . and _ — at least one letter, no dot at the start or end, no '..', not starting with www, not ending like a web address");
    e.status = 400;
    throw e;
  }
  return u;
}

export async function setUsername(integration, username, { forceTransfer = false } = {}) {
  try {
    await axios.post(`${GRAPH_URL}/${integration.wa_phone_number_id}/username`,
      { username: validateUsername(username), ...(forceTransfer ? { transfer_action: "force_transfer" } : {}) },
      { headers: headers(integration) });
  } catch (e) {
    if (e.status) throw e;
    const code = e.response?.data?.error?.code;
    const err = new Error({
      147001: "That username isn't available.",
      147002: "Your business portfolio's messaging limit is too low for a username yet.",
      147003: "Link a Facebook Page to this number first.",
      147005: "That username is on another number of yours — tick \"move it to this number\".",
    }[code] || metaMsg(e));
    err.status = 400;
    throw err;
  }
}

export async function deleteUsername(integration) {
  await axios.delete(`${GRAPH_URL}/${integration.wa_phone_number_id}/username`, { headers: headers(integration) });
}

/**
 * Mirrors an app-side block / unblock onto WhatsApp for every WhatsApp bot
 * account the subscriber has talked to. Never throws — returns a note for the UI.
 */
export async function syncWhatsAppBlock(agencyId, contactId, block) {
  const [[contact]] = await pool.query("SELECT id, platform, external_id FROM contacts WHERE id = ? AND agency_id = ?", [contactId, agencyId]);
  if (!contact || contact.platform !== "WHATSAPP") return null;
  const [integrations] = await pool.query(
    `SELECT DISTINCT i.* FROM integrations i JOIN conversations cv ON cv.integration_id = i.id
      WHERE cv.contact_id = ? AND i.agency_id = ? AND i.platform = 'WHATSAPP' AND i.is_active = 1`,
    [contactId, agencyId]
  );
  const results = [];
  for (const integration of integrations) {
    try {
      await axios({
        method: block ? "post" : "delete",
        url: `${GRAPH_URL}/${integration.wa_phone_number_id}/block_users`,
        headers: headers(integration),
        data: { messaging_product: "whatsapp", block_users: [{ user: contact.external_id }] },
      });
      results.push({ integrationId: integration.id, ok: true });
    } catch (e) {
      const code = e.response?.data?.error?.code;
      results.push({ integrationId: integration.id, ok: false, error: code === 131047 ? "OUTSIDE_24H" : metaMsg(e) });
    }
  }
  if (!results.length) return null;
  if (results.every((r) => r.ok)) return block ? "Also blocked on WhatsApp — they can't message or call this number." : "Also unblocked on WhatsApp.";
  if (block && results.some((r) => r.error === "OUTSIDE_24H")) return "Blocked here. WhatsApp only lets you block people who wrote in the last 24 hours, so their messages are still received but ignored.";
  return `Done here; WhatsApp said: ${results.find((r) => !r.ok)?.error}`;
}
