/**
 * Instagram automated-DM budget (utils/igRateLimit.js): Instagram allows about
 * 200 automated DMs per hour per account; sends beyond that are refused by
 * Meta and can get the account restricted. One counter row per account per
 * clock hour.
 *
 * Safe to re-run.
 * Run: node migrate_ig_rate_limit.js
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
    await conn.query(`
      CREATE TABLE IF NOT EXISTS ig_hourly_usage (
        integration_id INT NOT NULL,
        hour_start     DATETIME NOT NULL,
        sent           INT NOT NULL DEFAULT 0,
        PRIMARY KEY (integration_id, hour_start),
        CONSTRAINT fk_ig_hourly_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ ig_hourly_usage ready");
    await recordMigration(conn, "migrate_ig_rate_limit.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
