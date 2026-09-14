/**
 * Migration: broadcast_campaigns.integration_id — a campaign now sends from
 * one specific, explicitly-chosen channel account rather than
 * executeBroadcast() silently grabbing "the first active integration for
 * this platform" for the agency. That silent pick was a real bug: an
 * agency with more than one WhatsApp number connected could have a
 * campaign send from a DIFFERENT number than the one its contacts actually
 * have a message history with — making WINDOW-mode sends fail the 24h
 * check for everyone, even contacts genuinely inside the window on the
 * number they actually talk to. Same class of fix already applied to
 * WhatsApp Calling (routes/whatsappCalls.js).
 *
 * Purely additive (ADD COLUMN, nullable — existing rows unaffected, though
 * any in-flight campaign without one set will now get a clear error instead
 * of a silent wrong-number pick; see routes/broadcasts.js).
 *
 * Safe to re-run.
 * Run: node migrate_broadcast_integration.js
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
    console.log(`\n🏗️  Running broadcast-integration migration on database: ${dbName}\n`);

    const [[col]] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'broadcast_campaigns' AND COLUMN_NAME = 'integration_id'`,
      [dbName]
    );
    if (col) {
      console.log("⏭️  broadcast_campaigns.integration_id already exists");
    } else {
      await conn.query(`ALTER TABLE broadcast_campaigns ADD COLUMN integration_id INT NULL AFTER platform`);
      console.log("✅ Added broadcast_campaigns.integration_id");
    }

    console.log("\n🎉 broadcast-integration migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
