/**
 * Instant store updates (utils/commerceWebhooks.js): which webhooks a store
 * connection registered, their state, and the WooCommerce signing secret.
 *
 * Safe to re-run.
 * Run: node migrate_commerce_webhooks.js
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
  database: process.env.DB_NAME,
});

async function addColumn(conn, column, ddl) {
  const [rows] = await conn.query(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'commerce_connections' AND COLUMN_NAME = ?",
    [column]
  );
  if (!rows.length) {
    await conn.query(`ALTER TABLE commerce_connections ADD COLUMN ${column} ${ddl}`);
    console.log(`  + commerce_connections.${column}`);
  }
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await addColumn(conn, "webhook_status", "ENUM('NONE','ACTIVE','FAILED','UNAVAILABLE') NOT NULL DEFAULT 'NONE'");
    await addColumn(conn, "webhook_ids", "JSON NULL");
    await addColumn(conn, "webhook_secret", "TEXT NULL");
    await addColumn(conn, "webhook_error", "VARCHAR(500) NULL");
    await addColumn(conn, "last_webhook_at", "DATETIME NULL");
    await recordMigration(conn, "migrate_commerce_webhooks.js");
    console.log("✅ Done");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
