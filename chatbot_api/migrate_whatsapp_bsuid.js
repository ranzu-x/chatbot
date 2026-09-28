/**
 * WhatsApp usernames / business-scoped user IDs (BSUID).
 *
 * Since 2026 a WhatsApp user can hide their phone number behind a username.
 * Meta then identifies them with a BSUID ("US.13491208655302741918") in
 * `contacts[].user_id` / `messages[].from_user_id`, and leaves the phone
 * number out when the business hasn't talked to them for 30 days and they
 * aren't in the business's Contact Book.
 *
 * - contact_wa_identities: every BSUID (and parent BSUID) we have seen for a
 *   subscriber. A table, not a column: a BSUID is per business portfolio, so
 *   a workspace with numbers in two portfolios sees two ids for one person.
 * - contacts.wa_username: the user's @username (display only).
 * - contact_merges: an audit row for every time two subscribers were merged
 *   into one (utils/whatsappIdentity.js mergeContacts).
 *
 * Safe to re-run.
 * Run: node migrate_whatsapp_bsuid.js
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
    console.log(`\n🏗️  Running WhatsApp BSUID migration on database: ${dbName}\n`);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS contact_wa_identities (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        agency_id      INT NOT NULL,
        contact_id     INT NOT NULL,
        user_id        VARCHAR(160) NOT NULL,
        kind           ENUM('USER','PARENT') NOT NULL DEFAULT 'USER',
        integration_id INT NULL,
        created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_wa_identity (agency_id, user_id),
        KEY idx_wa_identity_contact (contact_id),
        CONSTRAINT fk_wa_identity_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_wa_identity_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ contact_wa_identities ready");

    if (await columnExists(conn, "contacts", "wa_username")) {
      console.log("⏭️  contacts.wa_username already exists");
    } else {
      await conn.query(`ALTER TABLE contacts ADD COLUMN wa_username VARCHAR(100) NULL AFTER phone`);
      console.log("✅ Added contacts.wa_username");
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS contact_merges (
        id                 INT AUTO_INCREMENT PRIMARY KEY,
        agency_id          INT NOT NULL,
        survivor_id        INT NOT NULL,
        merged_id          INT NOT NULL,
        merged_external_id VARCHAR(200) NULL,
        merged_name        VARCHAR(200) NULL,
        reason             VARCHAR(40) NOT NULL,
        merged_by          INT NULL,
        created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_contact_merges_agency (agency_id, created_at),
        KEY idx_contact_merges_survivor (survivor_id),
        CONSTRAINT fk_contact_merges_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ contact_merges ready");

    await recordMigration(conn, "migrate_whatsapp_bsuid.js");
    console.log("\n🎉 WhatsApp BSUID migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
