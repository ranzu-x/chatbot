/**
 * Which AI resource (whose API keys, whose credits) serves a workspace.
 *
 * This release (decided with the user): PLATFORM only — every workspace,
 * reseller and reseller customer uses the Super Admin's AI providers and
 * spends AI credits. Workspaces' own ai_providers rows are kept but unused.
 *
 * Future: a RESELLER_API resource would be returned here (e.g. a reseller
 * with its own key serving its customers) with its own credit rules. Callers
 * only ever see { type, providerAgencyId, metered }, so adding it doesn't
 * touch AI Reply, the adapters or the credit ledger.
 */
import pool from "../../db.js";

export const AI_RESOURCES = Object.freeze({ PLATFORM: "PLATFORM" /* , RESELLER_API: "RESELLER_API" (future) */ });

let platformAgencyCache = { id: null, at: 0 };

/** The Platform workspace (the Super Admin's) — owner of the platform AI providers. */
export async function platformAgencyId() {
  if (platformAgencyCache.id && Date.now() - platformAgencyCache.at < 5 * 60_000) return platformAgencyCache.id;
  const [[row]] = await pool.query("SELECT id FROM agencies WHERE account_type = 'PLATFORM' ORDER BY id LIMIT 1");
  platformAgencyCache = { id: row?.id || null, at: Date.now() };
  return platformAgencyCache.id;
}

/** @returns {Promise<{ type: 'PLATFORM', providerAgencyId: number|null, metered: boolean }>} */
export async function resolveAiResource(/* agencyId */) {
  return { type: AI_RESOURCES.PLATFORM, providerAgencyId: await platformAgencyId(), metered: true };
}
