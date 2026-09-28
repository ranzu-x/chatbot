/**
 * Inbox extras:
 * - messages.transcript: text of a voice message (Inbox "Transcribe" button,
 *   or automatically when inbox_settings.auto_transcribe is on).
 * - inbox_settings.auto_transcribe.
 * - contact_notes.mentions: user ids @mentioned in an internal note (each gets
 *   a notification).
 *
 * Safe to re-run.
 * Run: node migrate_inbox_extras.js
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
    console.log(`\n🏗️  Running inbox extras migration on database: ${dbName}\n`);
    for (const [table, column, def] of [
      ["messages", "transcript", "TEXT NULL"],
      ["inbox_settings", "auto_transcribe", "TINYINT(1) NOT NULL DEFAULT 0"],
      ["contact_notes", "mentions", "JSON NULL"],
    ]) {
      if (await columnExists(conn, table, column)) {
        console.log(`⏭️  ${table}.${column} already exists`);
      } else {
        await conn.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
        console.log(`✅ Added ${table}.${column}`);
      }
    }
    await recordMigration(conn, "migrate_inbox_extras.js");
    console.log("\n🎉 Inbox extras migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
