/**
 * Block a Subscriber — there was genuinely no block/unblock concept
 * anywhere in the schema before this. Purely additive columns on `contacts`.
 * Enforcement point: routes/webhook.js's handleIncomingPayload (the one
 * shared inbound-message entry point for WhatsApp/Facebook/Instagram/
 * Telegram/TikTok) and routes/webchat.js's POST /webchat/message — both
 * check `contact.is_blocked` immediately after resolving the contact and
 * silently drop the message before any conversation/bot/AI processing runs.
 * "A way to reopen" is just the reverse toggle — see routes/contacts.js's
 * PATCH /contacts/:id/block and /unblock.
 *
 * Safe to re-run.
 * Run: node migrate_block_subscriber.js
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
    console.log(`\n🏗️  Running block-subscriber migration on database: ${dbName}\n`);

    if (await columnExists(conn, "contacts", "is_blocked")) {
      console.log("⏭️  contacts.is_blocked already exists");
    } else {
      await conn.query(`ALTER TABLE contacts ADD COLUMN is_blocked TINYINT(1) NOT NULL DEFAULT 0 AFTER subscription_status`);
      await conn.query(`ALTER TABLE contacts ADD COLUMN blocked_at DATETIME NULL AFTER is_blocked`);
      await conn.query(`ALTER TABLE contacts ADD COLUMN blocked_reason VARCHAR(255) NULL AFTER blocked_at`);
      await conn.query(`ALTER TABLE contacts ADD COLUMN blocked_by INT NULL AFTER blocked_reason`);
      await conn.query(`ALTER TABLE contacts ADD INDEX idx_contacts_agency_blocked (agency_id, is_blocked)`);
      console.log("✅ Added contacts.is_blocked / blocked_at / blocked_reason / blocked_by (+ index)");
    }

    await recordMigration(conn, "migrate_block_subscriber.js");
    console.log("\n🎉 block-subscriber migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
