import pool from "../db.js";

// Social Posting keeps only the latest SOCIAL_POST_HISTORY_LIMIT finished
// posts (PUBLISHED / FAILED) per workspace — the oldest is deleted first once
// the limit is passed. SCHEDULED posts are never pruned: they haven't run yet.
//
// Because old rows get deleted, the monthly post quota can't be a COUNT of
// social_posts any more (deleting history would hand quota back). It is
// counted in social_post_usage instead (migrate_social_post_usage.js), bumped
// every time a post row is created.
export const SOCIAL_POST_HISTORY_LIMIT = 50;

export async function recordSocialPostUsage(agencyId, count = 1) {
  if (!agencyId || count <= 0) return;
  await pool.query(
    `INSERT INTO social_post_usage (agency_id, month_start, post_count)
     VALUES (?, DATE_FORMAT(NOW(), '%Y-%m-01'), ?)
     ON DUPLICATE KEY UPDATE post_count = post_count + VALUES(post_count)`,
    [agencyId, count]
  );
}

export async function getSocialPostUsageThisMonth(agencyId) {
  const [[row]] = await pool.query(
    `SELECT post_count FROM social_post_usage
     WHERE agency_id = ? AND month_start = DATE_FORMAT(NOW(), '%Y-%m-01')`,
    [agencyId]
  );
  return Number(row?.post_count || 0);
}

export async function pruneSocialPostHistory(agencyId) {
  if (!agencyId) return 0;
  // MySQL can't DELETE from a table it sub-selects with LIMIT/OFFSET, so find
  // the overflow ids first.
  const [rows] = await pool.query(
    `SELECT id FROM social_posts
     WHERE agency_id = ? AND status <> 'SCHEDULED'
     ORDER BY created_at DESC, id DESC
     LIMIT 18446744073709551615 OFFSET ?`,
    [agencyId, SOCIAL_POST_HISTORY_LIMIT]
  );
  if (!rows.length) return 0;
  const [res] = await pool.query(
    "DELETE FROM social_posts WHERE agency_id = ? AND id IN (?)",
    [agencyId, rows.map((r) => r.id)]
  );
  return res.affectedRows || 0;
}
