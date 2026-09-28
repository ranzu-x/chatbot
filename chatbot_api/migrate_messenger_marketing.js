/**
 * Marketing Messages on Messenger (utils/messengerMarketing.js): paid
 * marketing messages to people who opted in, sent through Meta's
 * Marketing Message API (ad account + message campaign).
 *
 * - meta_app_pool.mm_config_id: the Meta app's Facebook Login for Business
 *   configuration for Marketing Messages.
 * - mm_accounts: per Facebook Page — the token from that login (system-user
 *   token, or long-lived user token) and the ad account billed.
 * - mm_subscriptions: one subscription token per person per Page.
 * - mm_campaigns / mm_logs: what was sent, to whom, and what happened.
 *
 * Safe to re-run.
 * Run: node migrate_messenger_marketing.js
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
    const [col] = await conn.query("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'meta_app_pool' AND COLUMN_NAME = 'mm_config_id'");
    if (!col.length) {
      await conn.query("ALTER TABLE meta_app_pool ADD COLUMN mm_config_id VARCHAR(64) NULL");
      console.log("  + meta_app_pool.mm_config_id");
    }
    await conn.query(`
      CREATE TABLE IF NOT EXISTS mm_accounts (
        integration_id  INT NOT NULL PRIMARY KEY,
        agency_id       INT NOT NULL,
        access_token    TEXT NOT NULL,
        token_type      ENUM('SYSTEM_USER','USER') NOT NULL DEFAULT 'SYSTEM_USER',
        token_expires_at DATETIME NULL,
        ad_account_id   VARCHAR(40) NULL,
        ad_account_name VARCHAR(191) NULL,
        status          ENUM('ACTIVE','ERROR') NOT NULL DEFAULT 'ACTIVE',
        last_error      VARCHAR(500) NULL,
        subscribers_synced_at DATETIME NULL,
        connected_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_mm_acc_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS mm_subscriptions (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        agency_id        INT NOT NULL,
        integration_id   INT NOT NULL,
        contact_id       INT NULL,
        psid             VARCHAR(64) NULL,
        token            VARCHAR(255) NOT NULL,
        status           ENUM('ACTIVE','STOPPED') NOT NULL DEFAULT 'ACTIVE',
        title            VARCHAR(255) NULL,
        timezone         VARCHAR(64) NULL,
        next_eligible_at DATETIME NULL,
        expires_at       DATETIME NULL,
        source           VARCHAR(30) NULL,
        created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_mm_sub (integration_id, token),
        KEY idx_mm_sub_contact (contact_id),
        KEY idx_mm_sub_psid (integration_id, psid),
        CONSTRAINT fk_mm_sub_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS mm_campaigns (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        agency_id        INT NOT NULL,
        integration_id   INT NOT NULL,
        name             VARCHAR(191) NOT NULL,
        meta_campaign_id VARCHAR(64) NULL,
        message          JSON NOT NULL,
        audience         JSON NULL,
        daily_budget     INT NULL,
        status           ENUM('DRAFT','SENDING','SENT','FAILED') NOT NULL DEFAULT 'DRAFT',
        total_targeted   INT NOT NULL DEFAULT 0,
        sent_count       INT NOT NULL DEFAULT 0,
        delivered_count  INT NOT NULL DEFAULT 0,
        read_count       INT NOT NULL DEFAULT 0,
        click_count      INT NOT NULL DEFAULT 0,
        failed_count     INT NOT NULL DEFAULT 0,
        skipped_count    INT NOT NULL DEFAULT 0,
        error_message    VARCHAR(500) NULL,
        created_by       INT NULL,
        created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        sent_at          DATETIME NULL,
        KEY idx_mm_camp (agency_id, integration_id),
        CONSTRAINT fk_mm_camp_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS mm_logs (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        campaign_id     INT NOT NULL,
        subscription_id INT NOT NULL,
        contact_id      INT NULL,
        token           VARCHAR(255) NOT NULL,
        status          ENUM('PENDING','SENT','DELIVERED','READ','CLICKED','FAILED','SKIPPED') NOT NULL DEFAULT 'PENDING',
        tracking_id     VARCHAR(64) NULL,
        error           VARCHAR(500) NULL,
        sent_at         DATETIME NULL,
        updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_mm_log (campaign_id, subscription_id),
        KEY idx_mm_log_tracking (tracking_id),
        KEY idx_mm_log_token (token),
        CONSTRAINT fk_mm_log_campaign FOREIGN KEY (campaign_id) REFERENCES mm_campaigns(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ Marketing Messages tables ready");
    await recordMigration(conn, "migrate_messenger_marketing.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
