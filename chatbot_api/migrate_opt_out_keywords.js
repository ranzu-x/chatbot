/**
 * Opt-out / opt-in keywords per bot account (utils/optOut.js): a subscriber
 * who sends exactly "STOP" (or another opt-out word) is unsubscribed from
 * broadcasts and sequences; "START" subscribes them again. No row = the
 * defaults (on, STOP/UNSUBSCRIBE, START/SUBSCRIBE).
 *
 * Safe to re-run.
 * Run: node migrate_opt_out_keywords.js
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
    console.log(`\n🏗️  Running opt-out keywords migration on database: ${dbName}\n`);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS subscription_keywords (
        integration_id   INT NOT NULL PRIMARY KEY,
        agency_id        INT NOT NULL,
        enabled          TINYINT(1) NOT NULL DEFAULT 1,
        opt_out_keywords VARCHAR(500) NOT NULL DEFAULT 'STOP,UNSUBSCRIBE',
        opt_out_reply    TEXT NULL,
        opt_in_keywords  VARCHAR(500) NOT NULL DEFAULT 'START,SUBSCRIBE',
        opt_in_reply     TEXT NULL,
        updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_subscription_keywords_agency (agency_id),
        CONSTRAINT fk_subscription_keywords_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_subscription_keywords_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ subscription_keywords ready");
    await recordMigration(conn, "migrate_opt_out_keywords.js");
    console.log("\n🎉 Opt-out keywords migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
