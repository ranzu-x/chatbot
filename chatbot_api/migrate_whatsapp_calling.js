/**
 * Migration: WhatsApp Business Calling — business-initiated (outbound) calls
 * from the Live Inbox, per Meta's Cloud API Calling docs.
 *
 * Two tables:
 *   - whatsapp_calls: one row per call attempt (the WebRTC SDP offer/answer,
 *     status through its lifecycle, timestamps, duration). status values
 *     mirror Meta's own call status/event vocabulary (RINGING/ACCEPTED/
 *     REJECTED from the `statuses` webhook, COMPLETED/FAILED from the
 *     `terminate` event) plus two local-only states (INITIATING before
 *     Meta's connect webhook arrives, TERMINATED for a business-initiated
 *     hangup before Meta's own terminate webhook confirms it).
 *   - whatsapp_call_permissions: WhatsApp requires explicit per-contact
 *     consent before a business can call them at all (a `call_permission_
 *     request` interactive message, answered via a `call_permission_reply`
 *     webhook) — this caches that state per contact so the Inbox's Call
 *     button knows whether to call directly or request permission first.
 *
 * Safe to re-run.
 * Run: node migrate_whatsapp_calling.js
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

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running whatsapp-calling migration on database: ${dbName}\n`);

    const [[callsTable]] = await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'whatsapp_calls'`,
      [dbName]
    );
    if (callsTable) {
      console.log("⏭️  whatsapp_calls already exists");
    } else {
      await conn.query(`
        CREATE TABLE whatsapp_calls (
          id                      INT AUTO_INCREMENT PRIMARY KEY,
          agency_id               INT NOT NULL,
          integration_id          INT NOT NULL,
          conversation_id         INT NULL,
          contact_id              INT NOT NULL,
          wacid                   VARCHAR(255) NULL,
          direction               ENUM('BUSINESS_INITIATED') NOT NULL DEFAULT 'BUSINESS_INITIATED',
          status                  ENUM('INITIATING','RINGING','ACCEPTED','CONNECTED','REJECTED','FAILED','TERMINATED','COMPLETED') NOT NULL DEFAULT 'INITIATING',
          sdp_offer                LONGTEXT NULL,
          sdp_answer               LONGTEXT NULL,
          biz_opaque_callback_data VARCHAR(512) NULL,
          error_message           TEXT NULL,
          started_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          connected_at            DATETIME NULL,
          ended_at                DATETIME NULL,
          duration_seconds        INT NULL,
          created_by              INT NULL,
          created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_wacall_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          CONSTRAINT fk_wacall_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
          INDEX idx_wacall_wacid (wacid),
          INDEX idx_wacall_agency_status (agency_id, status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("✅ Created whatsapp_calls");
    }

    const [[permTable]] = await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'whatsapp_call_permissions'`,
      [dbName]
    );
    if (permTable) {
      console.log("⏭️  whatsapp_call_permissions already exists");
    } else {
      await conn.query(`
        CREATE TABLE whatsapp_call_permissions (
          id             INT AUTO_INCREMENT PRIMARY KEY,
          agency_id      INT NOT NULL,
          contact_id     INT NOT NULL,
          integration_id INT NOT NULL,
          status         ENUM('UNKNOWN','PENDING','GRANTED','REJECTED','EXPIRED') NOT NULL DEFAULT 'UNKNOWN',
          is_permanent   TINYINT(1) NOT NULL DEFAULT 0,
          requested_at   DATETIME NULL,
          responded_at   DATETIME NULL,
          expires_at     DATETIME NULL,
          created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_wacallperm_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          CONSTRAINT fk_wacallperm_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
          UNIQUE KEY uq_wacallperm_contact (contact_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("✅ Created whatsapp_call_permissions");
    }

    console.log("\n🎉 whatsapp-calling migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
