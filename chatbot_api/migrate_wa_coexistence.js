/**
 * WhatsApp number extras:
 * - integrations.wa_two_step_pin: the two-step verification PIN set when the
 *   number was registered (random, encrypted — it used to be "123456" for
 *   every number).
 * - integrations.wa_coexistence: the number also stays on the WhatsApp
 *   Business app (utils/whatsappCoexistence.js).
 * - integrations.wa_history_sync_requested_at.
 *
 * Safe to re-run.
 * Run: node migrate_wa_coexistence.js
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
    console.log(`\n🏗️  Running WhatsApp coexistence migration on database: ${dbName}\n`);
    for (const [column, def] of [
      ["wa_two_step_pin", "TEXT NULL"],
      ["wa_coexistence", "TINYINT(1) NOT NULL DEFAULT 0"],
      ["wa_history_sync_requested_at", "DATETIME NULL"],
    ]) {
      if (await columnExists(conn, "integrations", column)) {
        console.log(`⏭️  integrations.${column} already exists`);
      } else {
        await conn.query(`ALTER TABLE integrations ADD COLUMN ${column} ${def}`);
        console.log(`✅ Added integrations.${column}`);
      }
    }
    await recordMigration(conn, "migrate_wa_coexistence.js");
    console.log("\n🎉 WhatsApp coexistence migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
