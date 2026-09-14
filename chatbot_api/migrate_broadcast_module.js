/**
 * Migration: the Broadcasting module — replaces the old bare-bones
 * campaigns/campaign_logs pair with a richer broadcast_campaigns/
 * broadcast_logs pair that supports:
 *   - Audience targeting: include/exclude labels, include/exclude specific
 *     contacts (JSON id arrays — an ad-hoc pick, not a separate saved-list
 *     entity, since labels already are the reusable/named grouping concept).
 *   - A label auto-attached to each recipient when the message actually
 *     sends (tag_label_id).
 *   - WhatsApp's two real send modes: WINDOW (free-form, inside the 24h
 *     customer-service window) vs TEMPLATE (a pre-approved
 *     whatsapp_templates row, required outside the window).
 *   - Real per-recipient status tracking (PENDING/SENT/DELIVERED/READ/
 *     FAILED) correlated back to the existing messages/webhook plumbing via
 *     external_msg_id, not a fake delivered=sent placeholder.
 *   - Send Now vs Schedule.
 *
 * Message CONTENT comes from a Flow (flows.trigger_type='BROADCAST', a new
 * enum value so these flows are never picked up by inbound keyword/first-
 * contact matching) for WINDOW-mode campaigns, or directly from a
 * whatsapp_templates row for TEMPLATE-mode campaigns (Meta requires an
 * approved template outside the window — that can't be authored as a flow).
 *
 * The old campaigns/campaign_logs tables are left in place (untouched, not
 * dropped) in case any existing data/links reference them — this migration
 * is purely additive.
 *
 * Safe to re-run.
 * Run: node migrate_broadcast_module.js
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  multipleStatements: true,
});

const dbName = process.env.DB_NAME;

async function columnExists(conn, table, column) {
  const [[row]] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return Boolean(row);
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running broadcast-module migration on database: ${dbName}\n`);

    // 1. Widen flows.trigger_type to add 'BROADCAST'
    const [[flowsCol]] = await conn.query(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'flows' AND COLUMN_NAME = 'trigger_type'`,
      [dbName]
    );
    if (flowsCol && flowsCol.COLUMN_TYPE.includes("BROADCAST")) {
      console.log("⏭️  flows.trigger_type already includes BROADCAST");
    } else {
      await conn.query(
        `ALTER TABLE flows MODIFY COLUMN trigger_type ENUM('KEYWORD','ANY','FIRST_CONTACT','POSTBACK','BROADCAST') NOT NULL`
      );
      console.log("✅ flows.trigger_type now includes BROADCAST");
    }

    // 2. broadcast_campaigns
    const [[campTable]] = await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'broadcast_campaigns'`,
      [dbName]
    );
    if (campTable) {
      console.log("⏭️  broadcast_campaigns already exists");
    } else {
      await conn.query(`
        CREATE TABLE broadcast_campaigns (
          id                  INT AUTO_INCREMENT PRIMARY KEY,
          agency_id           INT NOT NULL,
          name                VARCHAR(200) NOT NULL,
          platform            ENUM('WHATSAPP','FACEBOOK','TELEGRAM','TIKTOK') NOT NULL,
          flow_id             INT NULL,
          mode                ENUM('WINDOW','TEMPLATE') NOT NULL DEFAULT 'WINDOW',
          template_id         INT NULL,
          include_label_ids   JSON NULL,
          exclude_label_ids   JSON NULL,
          include_contact_ids JSON NULL,
          exclude_contact_ids JSON NULL,
          tag_label_id        INT NULL,
          status              ENUM('DRAFT','SCHEDULED','PROCESSING','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
          scheduled_at        DATETIME NULL,
          total_targeted      INT NOT NULL DEFAULT 0,
          sent_count          INT NOT NULL DEFAULT 0,
          delivered_count     INT NOT NULL DEFAULT 0,
          read_count          INT NOT NULL DEFAULT 0,
          failed_count        INT NOT NULL DEFAULT 0,
          created_by          INT NULL,
          error_message       TEXT NULL,
          created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_bcast_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          INDEX idx_bcast_agency_platform (agency_id, platform),
          INDEX idx_bcast_status_sched (status, scheduled_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("✅ Created broadcast_campaigns");
    }

    // 3. broadcast_logs
    const [[logsTable]] = await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'broadcast_logs'`,
      [dbName]
    );
    if (logsTable) {
      console.log("⏭️  broadcast_logs already exists");
    } else {
      await conn.query(`
        CREATE TABLE broadcast_logs (
          id              INT AUTO_INCREMENT PRIMARY KEY,
          campaign_id     INT NOT NULL,
          contact_id      INT NOT NULL,
          status          ENUM('PENDING','SENT','DELIVERED','READ','FAILED') NOT NULL DEFAULT 'PENDING',
          external_msg_id VARCHAR(200) NULL,
          error_message   TEXT NULL,
          sent_at         DATETIME NULL,
          delivered_at    DATETIME NULL,
          read_at         DATETIME NULL,
          created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_blog_campaign FOREIGN KEY (campaign_id) REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
          CONSTRAINT fk_blog_contact  FOREIGN KEY (contact_id)  REFERENCES contacts(id)  ON DELETE CASCADE,
          INDEX idx_blog_campaign_status (campaign_id, status),
          INDEX idx_blog_external_msg (external_msg_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("✅ Created broadcast_logs");
    }

    console.log("\n🎉 broadcast-module migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
