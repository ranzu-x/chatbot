/**
 * Migration: User Input Flows (reusable Q&A sequences) + sub-flow execution support
 * Run: node migrate_user_input_flows.js
 *
 * A User Input Flow is a standalone, reusable sequence of questions (its own list,
 * its own mini-builder) that a regular bot Flow can run via a new "Run User Input
 * Flow" node — pick an existing one or create a new one. Executing it is a real
 * sub-flow call: the engine parks the main flow's position, runs the User Input
 * Flow's own nodes/edges, and returns control to the main flow once its "Final
 * Answer" node completes.
 *
 * Also adds `contacts.platform_profile` — a JSON blob for the extra profile fields
 * each channel's API can return (Messenger locale/timezone/gender, Instagram
 * username/follower_count/verification, Telegram username/language_code, ...),
 * surfaced read-only as "System Fields" alongside the editable Custom Fields.
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
    console.log(`\n🏗️  Running user input flows migration on database: ${dbName}\n`);

    if (!(await tableExists(conn, "user_input_flows"))) {
      await conn.query(`
        CREATE TABLE user_input_flows (
          id          INT AUTO_INCREMENT PRIMARY KEY,
          agency_id   INT NOT NULL,
          name        VARCHAR(200) NOT NULL,
          nodes_json  LONGTEXT NULL,
          edges_json  LONGTEXT NULL,
          is_active   TINYINT(1) NOT NULL DEFAULT 1,
          created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_uif_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ user_input_flows created");
    } else {
      console.log("⏭️  user_input_flows already exists");
    }

    // flow_sessions: sub-flow call/return context (single level — a User Input Flow
    // itself cannot run another User Input Flow).
    const sessionCols = [
      ["active_context", "ENUM('MAIN','USER_INPUT_FLOW') NOT NULL DEFAULT 'MAIN'"],
      ["user_input_flow_id", "INT NULL"],
      ["uif_current_node_id", "VARCHAR(100) NULL"],
      ["return_node_id", "VARCHAR(100) NULL"],
    ];
    for (const [col, def] of sessionCols) {
      if (!(await columnExists(conn, "flow_sessions", col))) {
        await conn.query(`ALTER TABLE flow_sessions ADD COLUMN ${col} ${def}`);
        console.log(`✅ flow_sessions.${col} added`);
      } else {
        console.log(`⏭️  flow_sessions.${col} already exists`);
      }
    }

    if (!(await columnExists(conn, "contacts", "platform_profile"))) {
      await conn.query(`ALTER TABLE contacts ADD COLUMN platform_profile JSON NULL AFTER avatar`);
      console.log("✅ contacts.platform_profile added");
    } else {
      console.log("⏭️  contacts.platform_profile already exists");
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
