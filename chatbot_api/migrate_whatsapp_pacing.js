/**
 * WhatsApp template / portfolio pacing: Meta can hold a template message
 * ("held_for_quality_assessment") and later send it or drop it (code 132015).
 * broadcast_logs gets a HELD status and broadcast_campaigns a held_count, so
 * a paced campaign shows what is waiting instead of counting it as sent.
 *
 * Safe to re-run.
 * Run: node migrate_whatsapp_pacing.js
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

async function run() {
  const conn = await pool.getConnection();
  try {
    const [[col]] = await conn.query("SELECT COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'broadcast_logs' AND COLUMN_NAME = 'status'");
    if (!String(col.t).includes("'HELD'")) {
      await conn.query("ALTER TABLE broadcast_logs MODIFY COLUMN status ENUM('PENDING','HELD','SENT','DELIVERED','READ','FAILED') NOT NULL DEFAULT 'PENDING'");
      console.log("  ~ broadcast_logs.status + HELD");
    }
    const [held] = await conn.query("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'broadcast_campaigns' AND COLUMN_NAME = 'held_count'");
    if (!held.length) {
      await conn.query("ALTER TABLE broadcast_campaigns ADD COLUMN held_count INT NOT NULL DEFAULT 0 AFTER failed_count");
      console.log("  + broadcast_campaigns.held_count");
    }
    await recordMigration(conn, "migrate_whatsapp_pacing.js");
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
