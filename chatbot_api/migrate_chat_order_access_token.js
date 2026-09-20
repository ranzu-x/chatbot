/**
 * Migration: unguessable access token on in-chat orders.
 *
 * The checkout page (/payments/pay/<orderId>) and its two public API routes
 * (GET /payments/order/:orderId, POST /payments/order/:orderId/simulate-pay)
 * identified an order by its sequential integer id alone, with no login. Anyone
 * could count through the ids, read every workspace's customer names, emails,
 * phones and addresses, and mark any workspace's order as paid.
 *
 * Each order now carries a random 128-bit token, included in the payment link
 * (?t=...) and required by both routes. Orders that already exist get a token
 * too, and any still-pending simulated-checkout links are rewritten to include
 * it. Links already sent in old chat messages (without ?t=) stop working, which
 * is the point: they were the unguarded form.
 *
 * Safe to re-run.
 * Run: node migrate_chat_order_access_token.js
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

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running chat-order access-token migration on database: ${dbName}\n`);

    const [[col]] = await conn.query(
      "SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='chat_orders' AND COLUMN_NAME='access_token'",
      [dbName]
    );
    if (!col.n) {
      await conn.query("ALTER TABLE chat_orders ADD COLUMN access_token CHAR(32) NULL");
      console.log("✅ chat_orders.access_token added");
    } else {
      console.log("⏭️  chat_orders.access_token already exists");
    }

    const [bf] = await conn.query("UPDATE chat_orders SET access_token = LOWER(HEX(RANDOM_BYTES(16))) WHERE access_token IS NULL");
    console.log(`✅ issued a token to ${bf.affectedRows} existing order(s)`);

    const [[idx]] = await conn.query(
      "SELECT COUNT(*) n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME='chat_orders' AND INDEX_NAME='uq_chat_orders_access_token'",
      [dbName]
    );
    if (!idx.n) await conn.query("ALTER TABLE chat_orders ADD UNIQUE KEY uq_chat_orders_access_token (access_token)");

    const [links] = await conn.query(
      `UPDATE chat_orders SET payment_url = CONCAT(payment_url, '?t=', access_token)
       WHERE status = 'PENDING' AND payment_url LIKE '%/payments/pay/%' AND payment_url NOT LIKE '%?t=%'`
    );
    console.log(`✅ rewrote ${links.affectedRows} pending checkout link(s) to include the token`);

    await recordMigration(conn, "migrate_chat_order_access_token.js");
    console.log("\n🎉 migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
