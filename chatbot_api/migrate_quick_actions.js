/**
 * Quick Actions (Bot Manager → Bot Manager → Quick Actions, utils/quickActions.js).
 *
 * Every bot account gets its own "action bots": No match reply, Chat with
 * Human, Chat with Robot, Unsubscribe, Resubscribe. Each one's reply is a
 * real flow (flows.trigger_type = 'QUICK_ACTION', edited in the Flow Builder)
 * that findMatchingFlow() never starts by keyword — only the action does.
 *
 *   quick_actions — one row per (bot account, action): the reply flow, and
 *                   the optional exact-match keywords (Chat with Human /
 *                   Chat with Robot; Unsubscribe / Resubscribe use the
 *                   Opt-out Keywords instead).
 *
 * Safe to re-run.
 * Run: node migrate_quick_actions.js   (or: npm run migrate)
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";

async function run() {
  try {
    const [[col]] = await pool.query(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'flows' AND COLUMN_NAME = 'trigger_type'`
    );
    if (col && col.COLUMN_TYPE.includes("QUICK_ACTION")) {
      console.log("ℹ️ flows.trigger_type already includes QUICK_ACTION");
    } else {
      await pool.query(
        `ALTER TABLE flows MODIFY COLUMN trigger_type
           ENUM('KEYWORD','ANY','FIRST_CONTACT','POSTBACK','BROADCAST','CHAT_WIDGET','QUICK_ACTION') NOT NULL DEFAULT 'KEYWORD'`
      );
      console.log("✅ flows.trigger_type now includes QUICK_ACTION");
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS quick_actions (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        agency_id       INT NOT NULL,
        integration_id  INT NOT NULL,
        action_key      ENUM('NO_MATCH','CHAT_HUMAN','CHAT_ROBOT','UNSUBSCRIBE','RESUBSCRIBE') NOT NULL,
        flow_id         INT NULL,
        keywords        VARCHAR(500) NULL,
        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_quick_action (integration_id, action_key),
        KEY idx_quick_actions_agency (agency_id),
        CONSTRAINT fk_quick_actions_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_quick_actions_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE,
        CONSTRAINT fk_quick_actions_flow FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ quick_actions ready");

    await recordMigration(pool, "migrate_quick_actions.js");
    console.log("\n🎉 Quick Actions migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
