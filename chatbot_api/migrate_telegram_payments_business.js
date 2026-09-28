/**
 * Telegram Stars payments + Telegram Business chats.
 *
 * chat_orders: which chat / bot / flow step an order belongs to (so a paid
 * order can confirm in that chat and continue the flow), the provider
 * (Stripe checkout link or Telegram Stars invoice) and the Stars charge id
 * needed for refunds.
 *
 * telegram_business_connections: a Telegram Business account that connected
 * this bot (Settings → Business → Chatbots) so the bot answers the owner's
 * customers. conversations.tg_business_connection_id marks a chat that runs
 * through one; every reply in it must carry that id.
 *
 * Safe to re-run.
 * Run: node migrate_telegram_payments_business.js
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
  database: process.env.DB_NAME,
});

async function addColumn(conn, table, column, ddl) {
  const [rows] = await conn.query(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column]
  );
  if (!rows.length) {
    await conn.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    console.log(`  + ${table}.${column}`);
  }
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await addColumn(conn, "chat_orders", "provider", "ENUM('STRIPE','TELEGRAM_STARS') NOT NULL DEFAULT 'STRIPE' AFTER currency");
    await addColumn(conn, "chat_orders", "conversation_id", "INT NULL AFTER subscriber_id");
    await addColumn(conn, "chat_orders", "integration_id", "INT NULL AFTER conversation_id");
    await addColumn(conn, "chat_orders", "next_node_id", "VARCHAR(100) NULL AFTER node_id");
    await addColumn(conn, "chat_orders", "success_message", "TEXT NULL");
    await addColumn(conn, "chat_orders", "telegram_charge_id", "VARCHAR(255) NULL");
    await addColumn(conn, "chat_orders", "telegram_user_id", "BIGINT NULL");
    await addColumn(conn, "chat_orders", "refunded_at", "DATETIME NULL");
    await addColumn(conn, "chat_orders", "refund_error", "VARCHAR(500) NULL");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS telegram_business_connections (
        id             VARCHAR(255) NOT NULL PRIMARY KEY,
        integration_id INT NOT NULL,
        agency_id      INT NOT NULL,
        tg_user_id     BIGINT NOT NULL,
        tg_user_name   VARCHAR(255) NULL,
        user_chat_id   BIGINT NULL,
        can_reply      TINYINT(1) NOT NULL DEFAULT 0,
        is_enabled     TINYINT(1) NOT NULL DEFAULT 1,
        rights         JSON NULL,
        connected_at   DATETIME NULL,
        updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_tbc_integration (integration_id),
        CONSTRAINT fk_tbc_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ telegram_business_connections ready");
    await addColumn(conn, "conversations", "tg_business_connection_id", "VARCHAR(255) NULL");

    await recordMigration(conn, "migrate_telegram_payments_business.js");
    console.log("✅ Done");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
