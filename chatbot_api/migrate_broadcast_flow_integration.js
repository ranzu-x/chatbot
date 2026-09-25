/**
 * Broadcast flows created by POST /broadcasts/start-with-flow used to be
 * inserted without an integration_id (only the campaign had it), so the Flow
 * Builder showed the platform's first bot account ("Test number") instead of
 * the campaign's own. The route now sets it; this backfills existing flows
 * from their campaign. Only fills flows whose integration_id is NULL — never
 * overwrites one that is already set.
 *
 * Safe to re-run.
 * Run: node migrate_broadcast_flow_integration.js   (or: npm run migrate)
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";

async function run() {
  try {
    const [result] = await pool.query(
      `UPDATE flows f
         JOIN broadcast_campaigns bc ON bc.flow_id = f.id AND bc.agency_id = f.agency_id
         JOIN integrations i ON i.id = bc.integration_id AND i.agency_id = f.agency_id
          SET f.integration_id = bc.integration_id
        WHERE f.integration_id IS NULL AND bc.integration_id IS NOT NULL`
    );
    console.log(`✅ Linked ${result.affectedRows} broadcast flow(s) to their campaign's bot account`);
    await recordMigration(pool, "migrate_broadcast_flow_integration.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
