/**
 * Migration: Live Chat Translator.
 *
 * conversations.translate_enabled/translate_target_lang — a per-conversation
 * toggle + target language, set from the Live Inbox. messages.translated_text/
 * translated_lang — a cache so a translated message is only ever translated
 * once (computed on demand by GET .../translate, see routes/conversations.js),
 * not re-translated on every thread re-render.
 *
 * Safe to re-run.
 * Run: node migrate_live_chat_translator.js
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
    console.log(`\nRunning live-chat-translator migration on database: ${dbName}\n`);

    if (await columnExists(conn, "conversations", "translate_enabled")) {
      console.log("skip: conversations.translate_enabled already exists");
    } else {
      await conn.query(`ALTER TABLE conversations ADD COLUMN translate_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER pause_reason`);
      console.log("done: conversations.translate_enabled added");
    }

    if (await columnExists(conn, "conversations", "translate_target_lang")) {
      console.log("skip: conversations.translate_target_lang already exists");
    } else {
      await conn.query(`ALTER TABLE conversations ADD COLUMN translate_target_lang VARCHAR(8) NULL AFTER translate_enabled`);
      console.log("done: conversations.translate_target_lang added");
    }

    if (await columnExists(conn, "messages", "translated_text")) {
      console.log("skip: messages.translated_text already exists");
    } else {
      await conn.query(`ALTER TABLE messages ADD COLUMN translated_text TEXT NULL AFTER body`);
      console.log("done: messages.translated_text added");
    }

    if (await columnExists(conn, "messages", "translated_lang")) {
      console.log("skip: messages.translated_lang already exists");
    } else {
      await conn.query(`ALTER TABLE messages ADD COLUMN translated_lang VARCHAR(8) NULL AFTER translated_text`);
      console.log("done: messages.translated_lang added");
    }

    console.log("\nMigration complete.\n");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
