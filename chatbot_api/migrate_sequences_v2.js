/**
 * Migration: Sequence Messages v2 — canvas content, real status tracking, per-step delivery log.
 * Run: node migrate_sequences_v2.js
 *
 * Extends the existing (previously UI-less) drip-sequence tables from migrate_sequences.js
 * rather than replacing them — see chatbot_ui memory/plan notes for why.
 *
 *  - sequences.nodes_json / edges_json — a Sequence is now authored on the same node/edge
 *    canvas as Flows and User Input Flows (mirrors flows.nodes_json/edges_json), not a flat
 *    steps array. The old `sequence_items` table is left in place (nothing ever wrote real
 *    data to it — no UI existed) but is no longer read by the rewritten runner.
 *  - sequences.platform gains 'TIKTOK' (was missing from the original enum).
 *  - sequence_subscribers.current_node_id — replaces step-number progress tracking with a
 *    node id, matching flow_sessions.current_node_id.
 *  - sequence_subscribers.status gains 'STOPPED' (explicit Stop action, distinct from
 *    'PAUSED' which this migration doesn't otherwise use) and .enrolled_via (button / flow
 *    node / API — shown in the subscriber-facing "Active Sequences" view).
 *  - sequence_subscriber_log — one row per attempted send (SENT / SKIPPED_WINDOW / FAILED),
 *    so a Messenger/Instagram/TikTok step skipped by the messaging-window rules is visible
 *    on the subscriber's timeline instead of silently vanishing.
 *
 * Safe to re-run — all statements are guarded by existence checks (MODIFY COLUMN for enum
 * extension is naturally idempotent, so those run unconditionally).
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

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table]
  );
  return rows[0].cnt > 0;
}

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
    console.log(`\n🏗️  Running Sequence Messages v2 migration on database: ${dbName}\n`);

    if (!(await tableExists(conn, "sequences"))) {
      console.error("❌ `sequences` table not found — run migrate_sequences.js first.");
      process.exit(1);
    }

    if (!(await columnExists(conn, "sequences", "nodes_json"))) {
      await conn.query(`ALTER TABLE sequences ADD COLUMN nodes_json LONGTEXT NULL AFTER platform`);
      console.log("✅ sequences.nodes_json added");
    } else {
      console.log("⏭️  sequences.nodes_json already exists");
    }

    if (!(await columnExists(conn, "sequences", "edges_json"))) {
      await conn.query(`ALTER TABLE sequences ADD COLUMN edges_json LONGTEXT NULL AFTER nodes_json`);
      console.log("✅ sequences.edges_json added");
    } else {
      console.log("⏭️  sequences.edges_json already exists");
    }

    // Idempotent by nature — always safe to (re-)apply the same enum definition.
    await conn.query(`
      ALTER TABLE sequences
      MODIFY COLUMN platform ENUM('WHATSAPP','FACEBOOK','INSTAGRAM','TELEGRAM','TIKTOK','WEBCHAT') NOT NULL DEFAULT 'WHATSAPP'
    `);
    console.log("✅ sequences.platform enum includes TIKTOK");

    if (!(await columnExists(conn, "sequence_subscribers", "current_node_id"))) {
      await conn.query(`ALTER TABLE sequence_subscribers ADD COLUMN current_node_id VARCHAR(100) NULL AFTER current_step`);
      console.log("✅ sequence_subscribers.current_node_id added");
    } else {
      console.log("⏭️  sequence_subscribers.current_node_id already exists");
    }

    if (!(await columnExists(conn, "sequence_subscribers", "enrolled_via"))) {
      await conn.query(`ALTER TABLE sequence_subscribers ADD COLUMN enrolled_via VARCHAR(50) NULL AFTER status`);
      console.log("✅ sequence_subscribers.enrolled_via added");
    } else {
      console.log("⏭️  sequence_subscribers.enrolled_via already exists");
    }

    await conn.query(`
      ALTER TABLE sequence_subscribers
      MODIFY COLUMN status ENUM('ACTIVE','COMPLETED','PAUSED','STOPPED') NOT NULL DEFAULT 'ACTIVE'
    `);
    console.log("✅ sequence_subscribers.status enum includes STOPPED");

    if (!(await tableExists(conn, "sequence_subscriber_log"))) {
      await conn.query(`
        CREATE TABLE sequence_subscriber_log (
          id            INT AUTO_INCREMENT PRIMARY KEY,
          subscriber_id INT NOT NULL,
          node_id       VARCHAR(100) NOT NULL,
          status        ENUM('SENT','SKIPPED_WINDOW','FAILED') NOT NULL,
          detail        VARCHAR(255) NULL,
          created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_subscriber_created (subscriber_id, created_at),
          CONSTRAINT fk_sslog_subscriber FOREIGN KEY (subscriber_id) REFERENCES sequence_subscribers(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ sequence_subscriber_log created");
    } else {
      console.log("⏭️  sequence_subscriber_log already exists");
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
