/**
 * WhatsApp Calling v2 — everything Meta's Calling API offers beyond the
 * business-initiated call from the Inbox (migrate_whatsapp_calling.js):
 *
 * - whatsapp_calls.direction += USER_INITIATED (a customer calls the business),
 *   status += MISSED (rang, nobody answered / rejected by the business).
 * - Call details from Meta's webhooks: caller number, call-button / deep-link
 *   payloads, who answered, why it ended.
 * - Recording: the audio is recorded in the answering agent's browser (Meta
 *   has no recording API — the media flows through our WebRTC connection) and
 *   stored privately (never under the public /uploads).
 * - whatsapp_call_prefs: per-number options that live in this app, not at
 *   Meta: record calls, missed-call auto reply.
 *
 * Safe to re-run.
 * Run: node migrate_whatsapp_calling_v2.js
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

async function columnExists(conn, table, column) {
  const [[row]] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return !!row;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running WhatsApp Calling v2 migration on database: ${dbName}\n`);

    await conn.query(`ALTER TABLE whatsapp_calls MODIFY direction ENUM('BUSINESS_INITIATED','USER_INITIATED') NOT NULL DEFAULT 'BUSINESS_INITIATED'`);
    await conn.query(`ALTER TABLE whatsapp_calls MODIFY status ENUM('INITIATING','RINGING','ACCEPTED','CONNECTED','REJECTED','FAILED','TERMINATED','COMPLETED','MISSED') NOT NULL DEFAULT 'INITIATING'`);
    console.log("✅ whatsapp_calls direction / status widened");

    const columns = [
      ["caller_number", "VARCHAR(40) NULL AFTER contact_id"],
      ["cta_payload", "VARCHAR(512) NULL AFTER biz_opaque_callback_data"],
      ["deeplink_payload", "VARCHAR(512) NULL AFTER cta_payload"],
      ["answered_by", "INT NULL AFTER created_by"],
      ["end_reason", "VARCHAR(255) NULL AFTER error_message"],
      ["recording_path", "VARCHAR(500) NULL AFTER duration_seconds"],
      ["recording_seconds", "INT NULL AFTER recording_path"],
      ["recording_bytes", "INT NULL AFTER recording_seconds"],
    ];
    for (const [name, def] of columns) {
      if (await columnExists(conn, "whatsapp_calls", name)) {
        console.log(`⏭️  whatsapp_calls.${name} already exists`);
      } else {
        await conn.query(`ALTER TABLE whatsapp_calls ADD COLUMN ${name} ${def}`);
        console.log(`✅ Added whatsapp_calls.${name}`);
      }
    }
    const [[idx]] = await conn.query(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'whatsapp_calls' AND INDEX_NAME = 'idx_wacall_integration_started'`,
      [dbName]
    );
    if (!idx) {
      await conn.query(`ALTER TABLE whatsapp_calls ADD INDEX idx_wacall_integration_started (integration_id, started_at)`);
      console.log("✅ Added idx_wacall_integration_started");
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_call_prefs (
        integration_id            INT NOT NULL PRIMARY KEY,
        agency_id                 INT NOT NULL,
        record_calls              TINYINT(1) NOT NULL DEFAULT 0,
        missed_call_reply_enabled TINYINT(1) NOT NULL DEFAULT 0,
        missed_call_reply         TEXT NULL,
        created_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_wacallprefs_agency (agency_id),
        CONSTRAINT fk_wacallprefs_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_wacallprefs_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ whatsapp_call_prefs ready");

    await recordMigration(conn, "migrate_whatsapp_calling_v2.js");
    console.log("\n🎉 WhatsApp Calling v2 migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
