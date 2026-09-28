/**
 * Broadcasts: A/B test between two flows (normal messages, not only
 * templates) and "send at each subscriber's best hour". Click-to-chat ads:
 * every ad click that opened a chat (Meta's `referral` on the first message),
 * for the Bot Manager → Click Ads report and per-ad flows.
 *
 * Safe to re-run.
 * Run: node migrate_broadcast_ab_ads.js
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

async function addColumn(conn, table, column, ddl) {
  const [rows] = await conn.query(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column]
  );
  if (!rows.length) {
    await conn.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    console.log(`  + ${table}.${column}`);
  }
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await addColumn(conn, "broadcast_campaigns", "variant_b_flow_id", "INT NULL");
    await addColumn(conn, "broadcast_campaigns", "send_time_mode", "ENUM('NOW','BEST_HOUR') NOT NULL DEFAULT 'NOW'");
    await addColumn(conn, "broadcast_campaigns", "best_hour_started_at", "DATETIME NULL");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS ad_referrals (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        agency_id       INT NOT NULL,
        integration_id  INT NOT NULL,
        contact_id      INT NULL,
        conversation_id INT NULL,
        platform        VARCHAR(20) NOT NULL,
        source_type     VARCHAR(30) NULL,
        source_id       VARCHAR(100) NULL,
        source_url      VARCHAR(1000) NULL,
        headline        VARCHAR(500) NULL,
        body            VARCHAR(1000) NULL,
        ctwa_clid       VARCHAR(255) NULL,
        is_new_contact  TINYINT(1) NOT NULL DEFAULT 0,
        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_adref_agency (agency_id, integration_id, created_at),
        KEY idx_adref_source (integration_id, source_id),
        CONSTRAINT fk_adref_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS ad_flow_rules (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        agency_id      INT NOT NULL,
        integration_id INT NOT NULL,
        source_id      VARCHAR(100) NOT NULL,
        label          VARCHAR(200) NULL,
        flow_id        INT NOT NULL,
        created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_ad_flow (integration_id, source_id),
        CONSTRAINT fk_adflow_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ ad_referrals / ad_flow_rules ready");
    await recordMigration(conn, "migrate_broadcast_ab_ads.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
