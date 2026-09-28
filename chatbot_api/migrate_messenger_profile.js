/**
 * Messenger / Instagram "bot profile" — what a customer sees before and
 * around the chat (Meta's Messenger Profile API, utils/messengerProfile.js):
 * the Get Started button, the greeting, ice breakers (up to 4 suggested
 * questions) and the persistent menu. One row per Facebook Page / Instagram
 * account (integration). Each button runs an action: a flow of the same bot
 * account, a text reply, or (menu only) a web link.
 *
 * Safe to re-run.
 * Run: node migrate_messenger_profile.js
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { recordMigration } from "./utils/migrationLedger.js";
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  multipleStatements: true,
});

const dbName = process.env.DB_NAME;

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running messenger profile migration on database: ${dbName}\n`);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS messenger_profiles (
        integration_id          INT NOT NULL PRIMARY KEY,
        agency_id               INT NOT NULL,
        get_started_enabled     TINYINT(1) NOT NULL DEFAULT 0,
        get_started_action      JSON NULL,
        greeting                TEXT NULL,
        ice_breakers            JSON NULL,
        persistent_menu         JSON NULL,
        composer_input_disabled TINYINT(1) NOT NULL DEFAULT 0,
        last_synced_at          DATETIME NULL,
        last_error              VARCHAR(500) NULL,
        created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_messenger_profiles_agency (agency_id),
        CONSTRAINT fk_messenger_profiles_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_messenger_profiles_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ messenger_profiles ready");
    await recordMigration(conn, "migrate_messenger_profile.js");
    console.log("\n🎉 Messenger profile migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
