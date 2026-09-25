import pool from "../db.js";
import { assertLimit } from "./entitlements.js";

// ─── Bot-account limit on (re)connect ─────────────────────────────────────
// Reconnecting an account that is already a bot account of this workspace
// (same Page / Instagram account / phone number id) only refreshes its token
// and details on the SAME row — it never counts against the plan's
// max_bot_accounts. Only accounts that would become a NEW row do (decided with
// the user). This is what lets every customer re-import after the Meta app or
// Business changes without deleting or recreating any bot.
const ACCOUNT_ID_COLUMNS = { fb_page_id: true, ig_account_id: true, wa_phone_number_id: true };

/** How many of these external account ids are not yet a bot account of this workspace. */
export async function countNewAccounts(agencyId, platform, column, externalIds) {
  if (!ACCOUNT_ID_COLUMNS[column]) throw new Error(`countNewAccounts: unsupported column ${column}`);
  const ids = [...new Set((externalIds || []).filter(Boolean).map(String))];
  if (!ids.length) return 0;
  const [rows] = await pool.query(
    `SELECT DISTINCT ${column} AS ext FROM integrations WHERE agency_id = ? AND platform = ? AND ${column} IN (?)`,
    [agencyId, platform, ids]
  );
  const existing = new Set(rows.map((r) => String(r.ext)));
  return ids.filter((id) => !existing.has(id)).length;
}

/**
 * Checks the plan has room for `newCount` new bot accounts (nothing to check
 * when 0 — a pure reconnect). For a multi-account import the whole batch is
 * refused up front, before anything is saved or subscribed, with a message
 * saying the import would go over the limit.
 */
export async function assertRoomForNewAccounts(agencyId, userId, newCount, { batch = false } = {}) {
  if (newCount <= 0) return;
  try {
    await assertLimit(agencyId, "max_bot_accounts", newCount, userId);
  } catch (err) {
    if (batch && (err.code === "LIMIT_EXCEEDED" || err.code === "RESELLER_POOL_LIMIT_EXCEEDED")) {
      err.message = `This would add ${newCount} new bot account${newCount === 1 ? "" : "s"} and exceed your plan's limit, so nothing was imported. `
        + "Accounts that are already connected can always be reconnected — select fewer new ones or upgrade your plan. "
        + `(${err.message})`;
    }
    throw err;
  }
}

