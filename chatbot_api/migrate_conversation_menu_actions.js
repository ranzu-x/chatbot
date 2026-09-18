/**
 * Migration: 3-dots Conversation Context Menu actions
 * Adds `is_important` and `is_archived` flags to `conversations`.
 *
 * Safe to re-run.
 * Run: node migrate_conversation_menu_actions.js
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

async function indexExists(conn, table, indexName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [dbName, table, indexName]
  );
  return rows[0].cnt > 0;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running conversation menu actions migration on database: ${dbName}\n`);

    if (await columnExists(conn, "conversations", "is_important")) {
      console.log("⏭️  conversations.is_important already exists");
    } else {
      await conn.query(`ALTER TABLE conversations ADD COLUMN is_important TINYINT(1) NOT NULL DEFAULT 0 AFTER unread_count`);
      console.log("✅ Added conversations.is_important");
    }

    if (await columnExists(conn, "conversations", "is_archived")) {
      console.log("⏭️  conversations.is_archived already exists");
    } else {
      await conn.query(`ALTER TABLE conversations ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0 AFTER is_important`);
      console.log("✅ Added conversations.is_archived");
    }

    if (!(await indexExists(conn, "conversations", "idx_conv_agency_important"))) {
      await conn.query(`ALTER TABLE conversations ADD INDEX idx_conv_agency_important (agency_id, is_important)`);
      console.log("✅ conversations index idx_conv_agency_important added");
    } else {
      console.log("⏭️  conversations index idx_conv_agency_important already exists");
    }

    if (!(await indexExists(conn, "conversations", "idx_conv_agency_archived"))) {
      await conn.query(`ALTER TABLE conversations ADD INDEX idx_conv_agency_archived (agency_id, is_archived)`);
      console.log("✅ conversations index idx_conv_agency_archived added");
    } else {
      console.log("⏭️  conversations index idx_conv_agency_archived already exists");
    }

    await recordMigration(conn, "migrate_conversation_menu_actions.js");
    console.log("\n🎉 Conversation menu actions migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
