/**
 * Telegram Checklist flow element (utils/telegramChecklists.js): one row per
 * checklist sent in a Telegram Business chat, so tick / untick events
 * (checklist_tasks_done) update the right subscriber / custom field.
 *
 * Safe to re-run.
 * Run: node migrate_telegram_checklists.js
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
      CREATE TABLE IF NOT EXISTS telegram_checklists (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        agency_id       INT NOT NULL,
        integration_id  INT NOT NULL,
        chat_external_id VARCHAR(255) NOT NULL,
        message_id      VARCHAR(64) NOT NULL,
        conversation_id INT NULL,
        contact_id      INT NULL,
        flow_id         INT NULL,
        node_id         VARCHAR(100) NULL,
        title           VARCHAR(255) NOT NULL,
        tasks           JSON NOT NULL,
        done_task_ids   JSON NULL,
        field_id        INT NULL,
        completed_at    DATETIME NULL,
        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_tg_checklist (integration_id, chat_external_id, message_id),
        CONSTRAINT fk_tgcl_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ telegram_checklists ready");
    await recordMigration(conn, "migrate_telegram_checklists.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
