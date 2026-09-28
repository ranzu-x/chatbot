/**
 * WhatsApp Groups (Groups API, utils/whatsappGroups.js): groups a WhatsApp
 * number created (invite-link only), and their message feed. Group messages
 * never go through the one-to-one pipeline (no subscriber, no bot, no Inbox
 * chat) — they land here.
 *
 * Safe to re-run.
 * Run: node migrate_whatsapp_groups.js
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
    console.log(`\n🏗️  Running WhatsApp groups migration on database: ${dbName}\n`);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_groups (
        id                 INT AUTO_INCREMENT PRIMARY KEY,
        agency_id          INT NOT NULL,
        integration_id     INT NOT NULL,
        group_id           VARCHAR(191) NOT NULL,
        subject            VARCHAR(128) NOT NULL,
        description        TEXT NULL,
        invite_link        VARCHAR(255) NULL,
        join_approval_mode VARCHAR(30) NULL,
        participant_count  INT NOT NULL DEFAULT 0,
        suspended          TINYINT(1) NOT NULL DEFAULT 0,
        deleted_at         DATETIME NULL,
        created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_wa_group (integration_id, group_id),
        KEY idx_wa_groups_agency (agency_id),
        CONSTRAINT fk_wa_groups_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_wa_groups_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_group_messages (
        id           BIGINT AUTO_INCREMENT PRIMARY KEY,
        agency_id    INT NOT NULL,
        group_row_id INT NOT NULL,
        direction    ENUM('INBOUND','OUTBOUND') NOT NULL,
        sender_id    VARCHAR(191) NULL,
        sender_name  VARCHAR(200) NULL,
        type         VARCHAR(20) NOT NULL DEFAULT 'TEXT',
        body         TEXT NULL,
        wamid        VARCHAR(191) NULL,
        sent_by      INT NULL,
        created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_wa_group_messages_group (group_row_id, id),
        UNIQUE KEY uq_wa_group_messages_wamid (wamid),
        CONSTRAINT fk_wa_group_messages_group FOREIGN KEY (group_row_id) REFERENCES whatsapp_groups(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ whatsapp_groups + whatsapp_group_messages ready");
    await recordMigration(conn, "migrate_whatsapp_groups.js");
    console.log("\n🎉 WhatsApp groups migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
