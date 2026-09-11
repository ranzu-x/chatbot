/**
 * Migration: Comment Automation Improvements — adds image replies, AI-powered
 * public comment replies, and Bot-Flow-driven private replies.
 *
 * comment_automation_rules gains:
 *  - auto_reply_media_url   VARCHAR(500) NULL   — image attached to the public comment reply
 *  - reply_mode             ENUM('STATIC','AI') — governs the public comment reply only
 *  - ai_prompt_instruction  TEXT NULL           — "how should the AI respond" instruction
 *  - ai_agent_id            INT NULL            — optional reference into ai_agents (unenforced FK, matches flow_id's existing convention)
 *  - private_reply_mode     ENUM('TEXT','FLOW') — TEXT = today's static text (unchanged); FLOW = uses the existing flow_id column
 *
 * Purely additive. Existing rows default to reply_mode='STATIC',
 * private_reply_mode='TEXT' — today's exact behavior, unchanged. Safe to re-run.
 *
 * Run: node migrate_comment_automation_v2.js
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
  const [[row]] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return Boolean(row);
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running comment-automation-v2 migration on database: ${dbName}\n`);

    const additions = [
      { column: "auto_reply_media_url", ddl: "ADD COLUMN auto_reply_media_url VARCHAR(500) NULL AFTER comment_variations" },
      { column: "reply_mode", ddl: "ADD COLUMN reply_mode ENUM('STATIC','AI') NOT NULL DEFAULT 'STATIC' AFTER auto_reply_media_url" },
      { column: "ai_prompt_instruction", ddl: "ADD COLUMN ai_prompt_instruction TEXT NULL AFTER reply_mode" },
      { column: "ai_agent_id", ddl: "ADD COLUMN ai_agent_id INT NULL AFTER ai_prompt_instruction" },
      { column: "private_reply_mode", ddl: "ADD COLUMN private_reply_mode ENUM('TEXT','FLOW') NOT NULL DEFAULT 'TEXT' AFTER auto_reply_private_message" },
    ];

    for (const { column, ddl } of additions) {
      if (await columnExists(conn, "comment_automation_rules", column)) {
        console.log(`⏭️  comment_automation_rules.${column} already exists`);
      } else {
        await conn.query(`ALTER TABLE comment_automation_rules ${ddl}`);
        console.log(`✅ comment_automation_rules.${column} added`);
      }
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
