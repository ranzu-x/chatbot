/**
 * Migration: follow-up reminders (title, snooze, "has this one alerted yet").
 *
 * follow_ups was a bare per-subscriber note with a due time and nothing ever
 * fired when it came due. This adds:
 *   title         short heading shown in the list and in the alert (existing
 *                 rows are given a title made from the start of their note)
 *   snooze_count  how many times the reminder has been pushed back
 *   alerted_at    when the reminder last fired for its CURRENT due time. NULL
 *                 means "not fired yet"; the scheduler claims a row by setting
 *                 it, so two ticks (or two servers) never alert twice. Snoozing
 *                 or rescheduling sets it back to NULL.
 * `note` stays and is now the optional description.
 *
 * Reminders that were already overdue when this runs are marked as alerted, so
 * turning the feature on doesn't fire a burst of old alerts at everyone.
 *
 * Safe to re-run.
 * Run: node migrate_followup_reminders.js
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
});
const dbName = process.env.DB_NAME;

async function hasColumn(conn, col) {
  const [[r]] = await conn.query(
    "SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='follow_ups' AND COLUMN_NAME=?",
    [dbName, col]
  );
  return r.n > 0;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running follow-up reminders migration on database: ${dbName}\n`);

    if (!(await hasColumn(conn, "title"))) {
      await conn.query("ALTER TABLE follow_ups ADD COLUMN title VARCHAR(160) NOT NULL DEFAULT '' AFTER assigned_to_agent_profile_id");
      const [r] = await conn.query("UPDATE follow_ups SET title = LEFT(TRIM(note), 80) WHERE title = ''");
      console.log(`✅ follow_ups.title added (${r.affectedRows} existing row(s) titled from their note)`);
    } else {
      console.log("⏭️  follow_ups.title already exists");
    }

    if (!(await hasColumn(conn, "snooze_count"))) {
      await conn.query("ALTER TABLE follow_ups ADD COLUMN snooze_count INT NOT NULL DEFAULT 0");
      console.log("✅ follow_ups.snooze_count added");
    }

    if (!(await hasColumn(conn, "alerted_at"))) {
      await conn.query("ALTER TABLE follow_ups ADD COLUMN alerted_at DATETIME NULL");
      const [r] = await conn.query("UPDATE follow_ups SET alerted_at = NOW() WHERE due_at <= NOW()");
      console.log(`✅ follow_ups.alerted_at added (${r.affectedRows} already-overdue row(s) marked as alerted)`);
    }

    // The note is now an optional description.
    await conn.query("ALTER TABLE follow_ups MODIFY COLUMN note TEXT NULL");

    const [[idx]] = await conn.query(
      "SELECT COUNT(*) n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME='follow_ups' AND INDEX_NAME='idx_follow_ups_due'",
      [dbName]
    );
    if (!idx.n) {
      await conn.query("ALTER TABLE follow_ups ADD INDEX idx_follow_ups_due (status, alerted_at, due_at)");
      console.log("✅ idx_follow_ups_due added");
    }

    await recordMigration(conn, "migrate_followup_reminders.js");
    console.log("\n🎉 follow-up reminders migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
