import pool from "../db.js";

/**
 * Instagram automated DMs: about 200 per hour per account (Meta's Instagram
 * messaging limits). Every automated Instagram send (bots, flows, AI,
 * broadcasts, sequences — anything but a person replying from the Inbox)
 * reserves a slot in the current clock hour; past the budget it is refused
 * here with IG_HOURLY_LIMIT instead of by Meta. Budget: env
 * IG_AUTOMATED_DM_LIMIT_PER_HOUR (default 190, a little under Meta's 200).
 */
export const IG_HOURLY_LIMIT = Number(process.env.IG_AUTOMATED_DM_LIMIT_PER_HOUR) || 190;

export async function reserveInstagramSlot(integrationId) {
  if (!integrationId) return;
  await pool.query(
    "INSERT IGNORE INTO ig_hourly_usage (integration_id, hour_start, sent) VALUES (?, DATE_FORMAT(NOW(), '%Y-%m-%d %H:00:00'), 0)",
    [integrationId]
  );
  // Atomic: only increments while under the budget (mysql2 reports matched rows as affectedRows,
  // so the check uses changedRows).
  const [r] = await pool.query(
    "UPDATE ig_hourly_usage SET sent = sent + 1 WHERE integration_id = ? AND hour_start = DATE_FORMAT(NOW(), '%Y-%m-%d %H:00:00') AND sent < ?",
    [integrationId, IG_HOURLY_LIMIT]
  );
  if (!r.changedRows) {
    const err = new Error(`Instagram allows about ${IG_HOURLY_LIMIT} automated messages per hour for this account — this one wasn't sent. It resets at the top of the hour.`);
    err.code = "IG_HOURLY_LIMIT";
    throw err;
  }
}

export async function instagramUsageThisHour(integrationId) {
  const [[row]] = await pool.query(
    "SELECT sent FROM ig_hourly_usage WHERE integration_id = ? AND hour_start = DATE_FORMAT(NOW(), '%Y-%m-%d %H:00:00')",
    [integrationId]
  );
  return { sent: Number(row?.sent) || 0, limit: IG_HOURLY_LIMIT };
}
