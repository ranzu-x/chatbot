/**
 * Subscriber Manager upgrade — adds the pieces the Subscribers page needs
 * that didn't exist yet:
 *
 *  - contacts.subscription_status: a real opt-out flag. Nothing in the app
 *    previously recorded whether a subscriber had unsubscribed — broadcasts,
 *    sequences, the page's own "Subscribed"/"Unsubscribed" badge, all had
 *    nothing to read. Purely additive (NOT NULL DEFAULT 'SUBSCRIBED' — every
 *    existing row keeps behaving exactly as it does today).
 *  - contact_lists / contact_list_members: a Lists feature, deliberately
 *    separate from the existing Labels system — a label marks *what a
 *    subscriber is* (VIP, Hot Lead), a list is *a group you built* (an
 *    import batch, a hand-picked audience for one campaign). Contacts can
 *    belong to many lists, same many-to-many shape as contact_labels.
 *
 * Safe to re-run.
 * Run: node migrate_subscriber_manager.js
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
    console.log(`\n🏗️  Running subscriber-manager migration on database: ${dbName}\n`);

    if (await columnExists(conn, "contacts", "subscription_status")) {
      console.log("⏭️  contacts.subscription_status already exists");
    } else {
      await conn.query(
        `ALTER TABLE contacts ADD COLUMN subscription_status ENUM('SUBSCRIBED','UNSUBSCRIBED') NOT NULL DEFAULT 'SUBSCRIBED' AFTER bot_paused`
      );
      await conn.query(`ALTER TABLE contacts ADD INDEX idx_contacts_agency_status (agency_id, subscription_status)`);
      console.log("✅ Added contacts.subscription_status (+ index)");
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS contact_lists (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        agency_id   INT NOT NULL,
        name        VARCHAR(120) NOT NULL,
        description VARCHAR(500) DEFAULT NULL,
        created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_agency_list_name (agency_id, name),
        CONSTRAINT fk_contact_lists_agency FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ contact_lists ready");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS contact_list_members (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        list_id    INT NOT NULL,
        contact_id INT NOT NULL,
        added_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_list_contact (list_id, contact_id),
        KEY idx_list_members_contact (contact_id),
        CONSTRAINT fk_list_members_list FOREIGN KEY (list_id) REFERENCES contact_lists (id) ON DELETE CASCADE,
        CONSTRAINT fk_list_members_contact FOREIGN KEY (contact_id) REFERENCES contacts (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ contact_list_members ready");

    await recordMigration(conn, "migrate_subscriber_manager.js");
    console.log("\n🎉 subscriber-manager migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
