/**
 * No match reply: how often the SAME subscriber may get it (Bot Settings →
 * No match reply, utils/quickActions.js runNoMatchReply).
 *
 *   quick_actions.trigger_frequency   EVERY_TIME (default = the old behaviour)
 *                                     | DAILY | WEEKLY | MONTHLY — used by NO_MATCH
 *   quick_action_deliveries           when a subscriber last got an action's reply
 *                                     on a bot account (one row per bot × subscriber
 *                                     × action), claimed atomically before sending.
 *
 * On/off is not stored here: it stays the reply flow's is_active (the same
 * switch as Bot Manager → Quick Actions).
 *
 * Safe to re-run.
 * Run: node migrate_no_match_frequency.js   (or: npm run migrate)
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";

async function columnExists(table, column) {
  const [rows] = await pool.query(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column]
  );
  return rows.length > 0;
}

async function run() {
  try {
    if (!(await columnExists("quick_actions", "trigger_frequency"))) {
      await pool.query(
        `ALTER TABLE quick_actions
           ADD COLUMN trigger_frequency ENUM('EVERY_TIME','DAILY','WEEKLY','MONTHLY') NOT NULL DEFAULT 'EVERY_TIME' AFTER keywords`
      );
      console.log("✅ quick_actions.trigger_frequency added");
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quick_action_deliveries (
        agency_id       INT NOT NULL,
        integration_id  INT NOT NULL,
        contact_id      INT NOT NULL,
        action_key      VARCHAR(20) NOT NULL,
        last_sent_at    DATETIME NOT NULL,
        PRIMARY KEY (integration_id, contact_id, action_key),
        KEY idx_qad_contact (contact_id),
        KEY idx_qad_agency (agency_id),
        CONSTRAINT fk_qad_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_qad_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE,
        CONSTRAINT fk_qad_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ quick_action_deliveries ready");
    await recordMigration(pool, "migrate_no_match_frequency.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
