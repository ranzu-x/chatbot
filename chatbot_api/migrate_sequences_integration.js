/**
 * Migration: sequences.integration_id — a sequence now sends from one
 * specific, explicitly-chosen channel account rather than sequenceRunner.js
 * silently grabbing "the first active integration for this platform" when
 * there's no prior contact history to infer the right one from. Same bug
 * class already fixed for WhatsApp Calling (routes/whatsappCalls.js) and
 * Broadcasting (broadcast_campaigns.integration_id) — an agency with two
 * numbers on the same platform could have a sequence step silently sent
 * from the wrong one.
 *
 * Purely additive (ADD COLUMN, nullable — existing rows unaffected, though
 * an in-flight sequence without one set now gets a clear error instead of
 * a silent wrong-number pick; see routes/sequences.js and
 * utils/sequenceRunner.js).
 *
 * Safe to re-run. First migration to self-register in schema_migrations —
 * see utils/migrationLedger.js.
 * Run: node migrate_sequences_integration.js
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
    console.log(`\n🏗️  Running sequences-integration migration on database: ${dbName}\n`);

    const [[col]] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'sequences' AND COLUMN_NAME = 'integration_id'`,
      [dbName]
    );
    if (col) {
      console.log("⏭️  sequences.integration_id already exists");
    } else {
      await conn.query(`ALTER TABLE sequences ADD COLUMN integration_id INT NULL AFTER platform`);
      console.log("✅ Added sequences.integration_id");
    }

    await recordMigration(conn, "migrate_sequences_integration.js");
    console.log("\n🎉 sequences-integration migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
