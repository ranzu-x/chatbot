/**
 * Resolves which Meta / TikTok developer app an agency's channel-connect
 * flows (WhatsApp Embedded Signup, Facebook/Instagram connect, TikTok
 * connect) should actually use, per the platform's real hierarchy — and,
 * per explicit product rule, the Platform's (Super Admin's) own app is
 * OFF LIMITS to Resellers and their customers, no matter what:
 *
 *   1. The agency's own configured app, if it has one (meta_app_settings /
 *      tiktok_app_settings row, agency_id-scoped, is_configured=1) — lets
 *      any agency (including a Reseller's own customer) bring its own app
 *      if it wants to.
 *   2. Otherwise, if this agency is a Reseller's own customer
 *      (agencies.parent_agency_id set — account_type='RESELLER_CUSTOMER'),
 *      its parent Reseller's configured app, and NOTHING ELSE — if the
 *      Reseller hasn't configured an app yet, this returns null rather than
 *      ever falling through to the Platform's app.
 *   3. Otherwise, if this agency IS a Reseller (account_type='RESELLER',
 *      no parent), only its own app (step 1) — a Reseller with no app of
 *      its own configured gets null, never the Platform's app either.
 *   4. Otherwise — a Direct Customer (account_type='DIRECT_CUSTOMER', a
 *      Super Admin's own End User with no Reseller in between) or the
 *      Platform agency itself — the Platform's own app is the allowed
 *      fallback. These are the ONLY two account types that may ever use
 *      the Super Admin's app.
 *
 * Previously, every call site (routes/channels.js, routes/metaapp.js,
 * routes/tiktokapp.js, routes/integrations.js) did its own flat
 * `WHERE agency_id = ?` lookup with no fallback beyond an (unset) .env var
 * — meaning a Reseller's customer with no app of its own got NO credentials
 * at all, and two of those call sites (Facebook Quick Connect / Import
 * Pages) had `WHERE agency_id = ? OR is_configured = 1`, which — due to SQL
 * operator precedence — could hand back a DIFFERENT, unrelated agency's
 * credentials entirely. Both fixed by routing everything through here.
 */
import pool from "../db.js";

let cachedPlatformAgencyId = null;
async function getPlatformAgencyId() {
  if (cachedPlatformAgencyId) return cachedPlatformAgencyId;
  const [[row]] = await pool.query("SELECT id FROM agencies WHERE account_type = 'PLATFORM' LIMIT 1");
  cachedPlatformAgencyId = row?.id || null;
  return cachedPlatformAgencyId;
}

async function resolveOwnRow(table, agencyId) {
  const [rows] = await pool.query(`SELECT * FROM ${table} WHERE agency_id = ? AND is_configured = 1 LIMIT 1`, [agencyId]);
  return rows[0] || null;
}

async function resolve(table, agencyId) {
  if (!agencyId) return null;

  const own = await resolveOwnRow(table, agencyId);
  if (own) return { ...own, appSource: "own" };

  const [[agency]] = await pool.query("SELECT parent_agency_id, account_type FROM agencies WHERE id = ?", [agencyId]);
  if (!agency) return null;

  // A Reseller's own customer uses ONLY the parent Reseller's app — never
  // the Platform's, even if the Reseller hasn't configured one yet.
  if (agency.parent_agency_id) {
    const parentRow = await resolveOwnRow(table, agency.parent_agency_id);
    return parentRow ? { ...parentRow, appSource: "parent_reseller" } : null;
  }

  // A Reseller runs its own app, full stop — no fallback to the Platform's
  // app even when it hasn't configured one of its own yet.
  if (agency.account_type === "RESELLER") {
    return null;
  }

  // Only reachable for a Direct Customer or the Platform agency itself —
  // the two account types actually allowed to use the Platform's own app.
  const platformAgencyId = await getPlatformAgencyId();
  if (platformAgencyId && platformAgencyId !== agencyId) {
    const platformRow = await resolveOwnRow(table, platformAgencyId);
    if (platformRow) return { ...platformRow, appSource: "platform" };
  }

  return null;
}

export function resolveMetaAppSettings(agencyId) {
  return resolve("meta_app_settings", agencyId);
}

export function resolveTikTokAppSettings(agencyId) {
  return resolve("tiktok_app_settings", agencyId);
}
