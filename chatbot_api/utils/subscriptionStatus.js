import pool from "../db.js";

/**
 * Plan expiry — decided with the user: when a workspace's subscription has
 * expired the workspace becomes READ-ONLY. People can still sign in and see
 * everything, but every change is refused (middleware/subscriptionGuard.js,
 * 402 SUBSCRIPTION_EXPIRED) and nothing is sent on its behalf — bots, AI,
 * broadcasts, sequences, comment replies, scheduled posts
 * (`isWorkspaceExpired` at each of those). It is NOT moved to the free plan;
 * renewing (any gateway, /billing) lifts it at once.
 *
 * "Expired" = the workspace's latest subscription row is EXPIRED, or its end
 * date (expires_at, else current_period_end) is in the past. A subscription
 * with no end date (free, lifetime, or created before end dates were stored)
 * never expires. A reseller's customers follow the reseller: they are paid
 * for through the reseller's plan.
 */

const CACHE_TTL_MS = 30 * 1000;
const cache = new Map(); // agencyId → { ts, value }

/** End of one billing period starting at `from` (null = never ends). */
export function periodEndFor(billingCycle, from = new Date()) {
  const d = new Date(from);
  switch (String(billingCycle || "").toLowerCase()) {
    case "monthly": d.setMonth(d.getMonth() + 1); return d;
    case "quarterly": d.setMonth(d.getMonth() + 3); return d;
    case "yearly": d.setFullYear(d.getFullYear() + 1); return d;
    default: return null; // lifetime, free, unknown
  }
}

async function ownState(agencyId) {
  const [[sub]] = await pool.query(
    // Same precedence as utils/entitlements.js: the workspace's own
    // subscription, else its owner's (older / Super-Admin-assigned rows are
    // on users.id).
    `SELECT s.id, s.status, COALESCE(s.expires_at, s.current_period_end) AS ends_at, p.name AS package_name, p.billing_cycle
       FROM subscriptions s
       LEFT JOIN packages p ON p.id = s.package_id
      WHERE s.agency_id = ?
         OR s.user_id IN (SELECT owner_id FROM agencies WHERE id = ? AND owner_id IS NOT NULL)
         OR s.user_id IN (SELECT id FROM users WHERE home_agency_id = ? AND role = 'RESELLER')
      ORDER BY (s.agency_id = ?) DESC, s.id DESC LIMIT 1`,
    [agencyId, agencyId, agencyId, agencyId]
  );
  if (!sub) return { expired: false, endsAt: null, packageName: null };
  const endsAt = sub.ends_at ? new Date(sub.ends_at) : null;
  const pastEnd = Boolean(endsAt && endsAt.getTime() <= Date.now());
  const expired = sub.status === "EXPIRED" || (["ACTIVE", "TRIAL", "CANCELLED"].includes(sub.status) && pastEnd);
  return { expired, endsAt, packageName: sub.package_name || null, status: sub.status };
}

async function compute(agencyId) {
  const [[agency]] = await pool.query("SELECT account_type, parent_agency_id FROM agencies WHERE id = ?", [agencyId]);
  if (!agency || agency.account_type === "PLATFORM") return { expired: false, endsAt: null, packageName: null, source: null };
  const own = await ownState(agencyId);
  if (own.expired) return { ...own, source: "SELF" };
  if (agency.account_type === "RESELLER_CUSTOMER" && agency.parent_agency_id) {
    const parent = await ownState(agency.parent_agency_id);
    if (parent.expired) return { expired: true, endsAt: parent.endsAt, packageName: own.packageName, source: "RESELLER" };
    // The customer's own paid cycle with its reseller (utils/resellerBilling.js).
    // Plans a reseller simply assigned have no end date and never expire.
    const [[plan]] = await pool.query(
      `SELECT acs.current_period_end, ap.name FROM agency_client_subscriptions acs LEFT JOIN agency_packages ap ON ap.id = acs.package_id
       WHERE acs.client_agency_id = ? AND acs.status = 'ACTIVE' ORDER BY acs.id DESC LIMIT 1`,
      [agencyId]
    );
    if (plan?.current_period_end && new Date(plan.current_period_end).getTime() <= Date.now()) {
      return { expired: true, endsAt: new Date(plan.current_period_end), packageName: plan.name || own.packageName, source: "RESELLER_PLAN" };
    }
    if (plan?.current_period_end) return { expired: false, endsAt: new Date(plan.current_period_end), packageName: plan.name || own.packageName, source: null };
  }
  return { ...own, source: own.expired ? "SELF" : null };
}

/** { expired, endsAt, packageName, source: 'SELF' | 'RESELLER' | null } — cached 30 s. */
export async function getSubscriptionState(agencyId) {
  if (!agencyId) return { expired: false, endsAt: null, packageName: null, source: null };
  const hit = cache.get(agencyId);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.value;
  let value;
  try {
    value = await compute(agencyId);
  } catch (err) {
    console.error("[Subscription] state check failed:", err.message);
    value = { expired: false, endsAt: null, packageName: null, source: null }; // never lock anyone out on a DB hiccup
  }
  cache.set(agencyId, { ts: Date.now(), value });
  return value;
}

export async function isWorkspaceExpired(agencyId) {
  return (await getSubscriptionState(agencyId)).expired;
}

/** Call after any change to a workspace's subscriptions (purchase, renewal, admin edit). */
export function invalidateSubscriptionCache(agencyId) {
  if (agencyId) cache.delete(Number(agencyId));
  else cache.clear();
}

export const EXPIRED_MESSAGE = "Your plan has expired, so this workspace is read-only. Renew your plan to make changes and turn automation back on.";
