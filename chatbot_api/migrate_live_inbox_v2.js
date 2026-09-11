/**
 * Migration: Live Inbox v2 — per-agent human-agent signature.
 *
 * "Last message tick", "Agent filter", and "Date range filter" all reuse
 * existing columns (messages.status/is_read/delivered_at, conversations.
 * assigned_to_id/last_message_at) — nothing new needed for those. This
 * migration only adds the one genuinely new field: each team member's own
 * signature message, appended to their outbound message when they use
 * "Join Chat" with "include my signature" checked.
 *
 * Purely additive. Safe to re-run.
 * Run: node migrate_live_inbox_v2.js
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

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows[0].cnt > 0;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running Live Inbox v2 migration on database: ${dbName}\n`);

    if (!(await columnExists(conn, "agent_profiles", "signature"))) {
      await conn.query(`ALTER TABLE agent_profiles ADD COLUMN signature VARCHAR(500) NULL AFTER phone`);
      console.log("✅ agent_profiles.signature added");
    } else {
      console.log("⏭️  agent_profiles.signature already exists");
    }

    console.log("\n✅ Migration completed successfully!\n");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Migration failed:", err.message);
    console.error(err);
    process.exit(1);
  } finally {
    conn.release();
  }
}

run();
