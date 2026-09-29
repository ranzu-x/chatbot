/**
 * Per-step flow analytics (utils/flowStats.js, Flow → Analytics).
 *
 *   flow_step_stats   one row per flow × step × output (handle) × day with
 *                     counters: reached (the step ran), sent / failed (its
 *                     message), delivered / read (receipts), clicked (a
 *                     button / quick reply / list item of it was tapped, or a
 *                     Randomizer branch was taken — handle = btn-0, branch-1…).
 *                     handle '' = the step as a whole.
 *
 * Counters, not a scan of `messages` (which retention prunes after 90 days).
 * Deleting a flow deletes its stats. Safe to re-run.
 * Run: node migrate_flow_analytics.js   (or: npm run migrate)
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS flow_step_stats (
        agency_id   INT NOT NULL,
        flow_id     INT NOT NULL,
        node_id     VARCHAR(191) NOT NULL,
        handle      VARCHAR(64) NOT NULL DEFAULT '',
        stat_date   DATE NOT NULL,
        reached     INT NOT NULL DEFAULT 0,
        sent        INT NOT NULL DEFAULT 0,
        failed      INT NOT NULL DEFAULT 0,
        delivered   INT NOT NULL DEFAULT 0,
        read_count  INT NOT NULL DEFAULT 0,
        clicked     INT NOT NULL DEFAULT 0,
        PRIMARY KEY (flow_id, node_id, handle, stat_date),
        KEY idx_fss_agency (agency_id),
        KEY idx_fss_flow_date (flow_id, stat_date),
        CONSTRAINT fk_fss_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_fss_flow FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ flow_step_stats ready");
    await recordMigration(pool, "migrate_flow_analytics.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
