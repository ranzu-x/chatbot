/**
 * Instagram / Facebook story automation (utils/storyReplies.js): what the bot
 * does when someone mentions the account in their story, or replies to one
 * of the account's stories. Stored on the bot profile row (messenger_profiles).
 * story_reply_log: per-person cooldown (don't answer every story reply).
 *
 * Safe to re-run.
 * Run: node migrate_story_replies.js
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

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running story replies migration on database: ${dbName}\n`);
    for (const [column, def] of [
      ["story_mention_action", "JSON NULL"],
      ["story_reply_action", "JSON NULL"],
      ["story_cooldown_hours", "INT NOT NULL DEFAULT 24"],
    ]) {
      if (await columnExists(conn, "messenger_profiles", column)) {
        console.log(`⏭️  messenger_profiles.${column} already exists`);
      } else {
        await conn.query(`ALTER TABLE messenger_profiles ADD COLUMN ${column} ${def}`);
        console.log(`✅ Added messenger_profiles.${column}`);
      }
    }
    await conn.query(`
      CREATE TABLE IF NOT EXISTS story_reply_log (
        id             BIGINT AUTO_INCREMENT PRIMARY KEY,
        integration_id INT NOT NULL,
        contact_id     INT NOT NULL,
        kind           ENUM('MENTION','REPLY') NOT NULL,
        created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_story_log (integration_id, contact_id, kind, created_at),
        CONSTRAINT fk_story_log_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE,
        CONSTRAINT fk_story_log_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ story_reply_log ready");
    await recordMigration(conn, "migrate_story_replies.js");
    console.log("\n🎉 Story replies migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
