import pool from './db.js';
import { pruneSocialPostHistory } from './utils/socialPostHistory.js';

/**
 * Migration: social_post_usage (monthly post quota counter) + trim existing
 * Social Posting history to the latest 50 finished posts per workspace.
 *
 * The quota used to be COUNT(*) FROM social_posts; history is now capped and
 * old rows are deleted, so the count lives in its own table
 * (utils/socialPostHistory.js). Safe to re-run: the backfill only ever raises
 * a counter, never lowers it.
 */
async function run() {
  console.log('Running social post usage migration...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS social_post_usage (
      agency_id   INT NOT NULL,
      month_start DATE NOT NULL,
      post_count  INT NOT NULL DEFAULT 0,
      PRIMARY KEY (agency_id, month_start),
      CONSTRAINT fk_social_post_usage_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('✅ social_post_usage table ready');

  // Carry this month's usage over from the old row count before any pruning.
  await pool.query(`
    INSERT INTO social_post_usage (agency_id, month_start, post_count)
    SELECT sp.agency_id, DATE_FORMAT(NOW(), '%Y-%m-01'), COUNT(*)
    FROM social_posts sp
    JOIN agencies a ON a.id = sp.agency_id  -- skip rows left by deleted workspaces
    WHERE sp.status != 'DRAFT' AND sp.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
    GROUP BY sp.agency_id
    ON DUPLICATE KEY UPDATE post_count = GREATEST(post_count, VALUES(post_count))
  `);
  console.log('✅ Backfilled this month\'s post usage');

  const [agencies] = await pool.query('SELECT DISTINCT agency_id FROM social_posts');
  let removed = 0;
  for (const { agency_id } of agencies) removed += await pruneSocialPostHistory(agency_id);
  console.log(`✅ Trimmed history to the latest 50 posts per workspace (${removed} old row(s) removed)`);

  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
