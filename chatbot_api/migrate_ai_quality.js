/**
 * AI answer quality: what each AI reply answered and from which knowledge
 * (citations), the owner's review (good / bad + a corrected answer that is
 * added to the agent's knowledge), and "hand off to a person when unsure".
 *
 * Safe to re-run.
 * Run: node migrate_ai_quality.js
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

async function addColumn(conn, table, column, ddl) {
  const [rows] = await conn.query(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column]
  );
  if (!rows.length) {
    await conn.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    console.log(`  + ${table}.${column}`);
  }
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await addColumn(conn, "ai_message_logs", "question", "TEXT NULL");
    await addColumn(conn, "ai_message_logs", "answer", "TEXT NULL");
    await addColumn(conn, "ai_message_logs", "message_id", "INT NULL");
    await addColumn(conn, "ai_message_logs", "sources", "JSON NULL");
    await addColumn(conn, "ai_message_logs", "top_score", "DECIMAL(5,3) NULL");
    await addColumn(conn, "ai_message_logs", "handed_off", "TINYINT(1) NOT NULL DEFAULT 0");
    await addColumn(conn, "ai_message_logs", "review_rating", "ENUM('GOOD','BAD') NULL");
    await addColumn(conn, "ai_message_logs", "reviewed_by", "INT NULL");
    await addColumn(conn, "ai_message_logs", "reviewed_at", "DATETIME NULL");
    await addColumn(conn, "ai_message_logs", "correction", "TEXT NULL");
    await addColumn(conn, "ai_message_logs", "correction_source_id", "INT NULL");
    await addColumn(conn, "ai_agents", "handoff_when_unsure", "TINYINT(1) NOT NULL DEFAULT 0");
    await addColumn(conn, "ai_agents", "handoff_message", "VARCHAR(500) NULL");
    const [idx] = await conn.query("SHOW INDEX FROM ai_message_logs WHERE Key_name = 'idx_aml_review'");
    if (!idx.length) await conn.query("ALTER TABLE ai_message_logs ADD INDEX idx_aml_review (agency_id, agent_id, created_at)");
    await recordMigration(conn, "migrate_ai_quality.js");
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
