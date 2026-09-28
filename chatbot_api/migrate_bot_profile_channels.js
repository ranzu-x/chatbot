/**
 * Bot profile for WhatsApp and Telegram too (utils/messengerProfile.js):
 * - commands: WhatsApp "/" commands (conversational automation) and the
 *   Telegram command menu (setMyCommands) — [{ command, description, action }]
 * - description / short_description: Telegram's "What can this bot do?" text
 *   and profile bio (setMyDescription / setMyShortDescription).
 * WhatsApp ice breakers reuse `ice_breakers`; Telegram's /start reuses the
 * Get Started action.
 *
 * Safe to re-run.
 * Run: node migrate_bot_profile_channels.js
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
    console.log(`\n🏗️  Running bot profile channels migration on database: ${dbName}\n`);
    for (const [name, def] of [["commands", "JSON NULL"], ["description", "TEXT NULL"], ["short_description", "VARCHAR(160) NULL"]]) {
      if (await columnExists(conn, "messenger_profiles", name)) {
        console.log(`⏭️  messenger_profiles.${name} already exists`);
      } else {
        await conn.query(`ALTER TABLE messenger_profiles ADD COLUMN ${name} ${def}`);
        console.log(`✅ Added messenger_profiles.${name}`);
      }
    }
    await recordMigration(conn, "migrate_bot_profile_channels.js");
    console.log("\n🎉 Bot profile channels migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
