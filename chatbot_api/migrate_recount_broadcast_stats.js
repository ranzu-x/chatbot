/**
 * Broadcast counters used to be incremented, so a message WhatsApp accepted
 * and then reported as failed was counted as both sent and failed (1
 * subscriber showed as "1 / 2"). They are now always recounted from
 * broadcast_logs (utils/broadcastStats.js); this recounts every existing
 * campaign once so old rows match.
 *
 * Safe to re-run (a recount is idempotent).
 * Run: node migrate_recount_broadcast_stats.js   (or: npm run migrate)
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";
import { recountBroadcastStats } from "./utils/broadcastStats.js";

async function run() {
  try {
    const [campaigns] = await pool.query("SELECT id FROM broadcast_campaigns");
    for (const c of campaigns) await recountBroadcastStats(c.id);
    console.log(`✅ Recounted ${campaigns.length} broadcast campaign(s) from their delivery logs`);
    await recordMigration(pool, "migrate_recount_broadcast_stats.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
