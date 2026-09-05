/**
 * Migration: Message Delivery Status (for accurate tick indicators)
 * Run: node migrate_message_delivery_status.js
 *
 * Adds explicit failure tracking to `messages` so the UI can distinguish:
 *  - normal flow: single tick (sent) -> double grey (delivered) -> double blue (read)
 *    [unchanged, still driven by existing sent_at/delivered_at/read_at]
 *  - status='FAILED', failure_stage='SEND'     -> never left our server at all
 *    (sendPlatformMessage threw before any external_msg_id was obtained)
 *  - status='FAILED', failure_stage='DELIVERY' -> platform accepted it (we have an
 *    external_msg_id) but later told us, async, that it couldn't actually be delivered
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
    console.log(`\n🏗️  Running message delivery status migration on database: ${dbName}\n`);

    if (!(await columnExists(conn, "messages", "status"))) {
      await conn.query(`
        ALTER TABLE messages
          ADD COLUMN status ENUM('SENT','FAILED') NULL DEFAULT NULL AFTER read_at
      `);
      console.log("✅ messages.status added");
    } else {
      console.log("⏭️  messages.status already exists");
    }

    if (!(await columnExists(conn, "messages", "failure_stage"))) {
      await conn.query(`
        ALTER TABLE messages
          ADD COLUMN failure_stage ENUM('SEND','DELIVERY') NULL DEFAULT NULL AFTER status
      `);
      console.log("✅ messages.failure_stage added");
    } else {
      console.log("⏭️  messages.failure_stage already exists");
    }

    if (!(await columnExists(conn, "messages", "failure_reason"))) {
      await conn.query(`
        ALTER TABLE messages
          ADD COLUMN failure_reason TEXT NULL AFTER failure_stage
      `);
      console.log("✅ messages.failure_reason added");
    } else {
      console.log("⏭️  messages.failure_reason already exists");
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
