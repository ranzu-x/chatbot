/**
 * Telegram Poll flow element (utils/telegramPolls.js): one row per poll sent,
 * so a poll_answer — which only carries the poll id, the voter and the chosen
 * option numbers — can be saved on the right subscriber / custom field.
 *
 * Safe to re-run.
 * Run: node migrate_telegram_polls.js
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
  database: process.env.DB_NAME,
});

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS telegram_polls (
        poll_id         VARCHAR(64) NOT NULL PRIMARY KEY,
        agency_id       INT NOT NULL,
        integration_id  INT NOT NULL,
        conversation_id INT NULL,
        contact_id      INT NULL,
        flow_id         INT NULL,
        node_id         VARCHAR(100) NULL,
        question        VARCHAR(300) NOT NULL,
        options         JSON NOT NULL,
        field_id        INT NULL,
        answer          VARCHAR(1000) NULL,
        answered_at     DATETIME NULL,
        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_tp_agency (agency_id),
        CONSTRAINT fk_tp_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ telegram_polls ready");
    await recordMigration(conn, "migrate_telegram_polls.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
