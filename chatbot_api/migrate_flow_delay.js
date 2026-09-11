/**
 * Migration: per-node "Delay before this step" (Flow Builder)
 * Run: node migrate_flow_delay.js
 *
 * Every node type (except Start and a Sequence's own "Wait" node) can now
 * optionally hold `data.delay: {hours,minutes,seconds}` — a real wait, up to
 * 48 hours, before that step runs. It's scheduled, never a blocking sleep:
 * when a node with a delay is reached, utils/flowEngine.js pauses the
 * session right there (writing `delay_next_run_at`) and returns — the live
 * webhook request completes normally. utils/flowDelayScheduler.js polls for
 * due sessions and resumes exactly where each one left off, the same
 * "schedule and claim, don't block" shape utils/sequenceRunner.js already
 * uses for Sequence Messages.
 *
 * Safe to re-run — all statements are guarded by existence checks.
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
    console.log(`\n🏗️  Running per-node Delay migration on database: ${dbName}\n`);

    if (!(await columnExists(conn, "flow_sessions", "delay_next_run_at"))) {
      await conn.query(`ALTER TABLE flow_sessions ADD COLUMN delay_next_run_at DATETIME NULL AFTER return_node_id`);
      console.log("✅ flow_sessions.delay_next_run_at added");
    } else {
      console.log("⏭️  flow_sessions.delay_next_run_at already exists");
    }

    // Lets the scheduler's poll query skip straight to due, active sessions
    // without scanning every row.
    const [idx] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'flow_sessions' AND INDEX_NAME = 'idx_flow_sessions_delay_next_run_at'`,
      [dbName]
    );
    if (idx[0].cnt === 0) {
      await conn.query(`CREATE INDEX idx_flow_sessions_delay_next_run_at ON flow_sessions (status, delay_next_run_at)`);
      console.log("✅ idx_flow_sessions_delay_next_run_at created");
    } else {
      console.log("⏭️  idx_flow_sessions_delay_next_run_at already exists");
    }

    console.log("\n✅ Migration completed successfully!\n");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    conn.release();
  }
}

run();
