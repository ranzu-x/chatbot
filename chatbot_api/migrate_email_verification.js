/**
 * Email verification — real send-link/click-link flow. Nothing like this
 * existed before (no email_verified field anywhere). Gates Forum *posting*
 * only (see migrate_forum.js) — never login/dashboard access, so existing
 * accounts keep working exactly as before; they just can't post to the
 * forum until they verify.
 *
 *   users.email_verified_at   — NULL until verified, set once, never
 *                                cleared back to NULL by any code path.
 *   email_verification_tokens — one row per link ever sent; a real,
 *                                revocable/expirable DB token (crypto
 *                                random hex), not a JWT — same reasoning
 *                                as chat_orders.access_token.
 *
 * Safe to re-run.
 * Run: node migrate_email_verification.js
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

async function hasColumn(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows.length > 0;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running email-verification migration on database: ${dbName}\n`);

    if (!(await hasColumn(conn, "users", "email_verified_at"))) {
      await conn.query(`ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL AFTER is_active`);
      console.log("✅ users.email_verified_at added");
    } else {
      console.log("⏭️  users.email_verified_at already exists");
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS email_verification_tokens (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        user_id      INT NOT NULL,
        token        CHAR(64) NOT NULL,
        expires_at   DATETIME NOT NULL,
        consumed_at  DATETIME NULL,
        created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_evt_token (token),
        KEY idx_evt_user (user_id),
        CONSTRAINT fk_evt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ email_verification_tokens ready");

    await recordMigration(conn, "migrate_email_verification.js");
    console.log("\n🎉 email-verification migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
