/**
 * Migration: extend conversations.pause_reason with 'OVER_LIMIT' — used when
 * a brand-new subscriber auto-created from an inbound channel message pushes
 * the agency (or reseller pool) over its max_subscribers limit. The contact
 * and message are still always saved (never dropped), but Bot/AI stays
 * paused for that conversation until the agency upgrades — see
 * utils/messageProcessor.js's findOrCreateContact/findOrCreateConversation.
 *
 * Purely additive (MODIFY COLUMN widening an ENUM — existing 'MANUAL'/
 * 'HUMAN_TAKEOVER' rows are unaffected). Safe to re-run.
 *
 * Run: node migrate_subscriber_limit_enforcement.js
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

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running subscriber-limit-enforcement migration on database: ${dbName}\n`);

    const [[row]] = await conn.query(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'conversations' AND COLUMN_NAME = 'pause_reason'`,
      [dbName]
    );
    if (row && row.COLUMN_TYPE.includes("OVER_LIMIT")) {
      console.log("⏭️  conversations.pause_reason already includes OVER_LIMIT");
    } else {
      await conn.query(`ALTER TABLE conversations MODIFY COLUMN pause_reason ENUM('MANUAL','HUMAN_TAKEOVER','OVER_LIMIT') NULL`);
      console.log("✅ conversations.pause_reason now includes OVER_LIMIT");
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
