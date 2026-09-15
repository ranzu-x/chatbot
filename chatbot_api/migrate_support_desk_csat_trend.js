/**
 * CSAT trend reporting needs to know WHEN a ticket was rated, not just what
 * the rating was — support_tickets never recorded that. Purely additive.
 *
 * Safe to re-run.
 * Run: node migrate_support_desk_csat_trend.js
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
    console.log(`\n🏗️  Running support-desk CSAT trend migration on database: ${dbName}\n`);

    if (await columnExists(conn, "support_tickets", "rated_at")) {
      console.log("⏭️  support_tickets.rated_at already exists");
    } else {
      await conn.query(`ALTER TABLE support_tickets ADD COLUMN rated_at DATETIME NULL AFTER rating_comment`);
      // Backfill existing ratings with a best-effort timestamp (solved_at, if
      // set, else updated_at) so trend charts aren't missing historical data
      // just because this column didn't exist yet when they were rated.
      await conn.query(`UPDATE support_tickets SET rated_at = COALESCE(solved_at, updated_at) WHERE rating IS NOT NULL AND rated_at IS NULL`);
      console.log("✅ Added support_tickets.rated_at (backfilled from solved_at/updated_at for existing ratings)");
    }

    await recordMigration(conn, "migrate_support_desk_csat_trend.js");
    console.log("\n🎉 support-desk CSAT trend migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
