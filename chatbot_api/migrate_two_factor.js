/**
 * Two-factor login (optional for every user — decided with the user):
 * an authenticator-app code (TOTP, utils/totp.js) after the password, with
 * one-time backup codes.
 *
 * users.two_factor_secret         encrypted (utils/cryptoVault.js); set once confirmed
 * users.two_factor_pending_secret encrypted; between "set up" and the first valid code
 * users.two_factor_enabled_at     NULL = off
 * users.two_factor_backup_codes   JSON array of sha256 hashes; a used code is removed
 * users.two_factor_last_step      last accepted time step — a code is never accepted twice
 *
 * Safe to re-run.
 * Run: node migrate_two_factor.js
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
    console.log(`\n🏗️  Running two-factor migration on database: ${dbName}\n`);
    const columns = [
      ["two_factor_secret", "TEXT NULL"],
      ["two_factor_pending_secret", "TEXT NULL"],
      ["two_factor_enabled_at", "DATETIME NULL"],
      ["two_factor_backup_codes", "JSON NULL"],
      ["two_factor_last_step", "BIGINT NULL"],
    ];
    for (const [name, def] of columns) {
      if (await columnExists(conn, "users", name)) {
        console.log(`⏭️  users.${name} already exists`);
      } else {
        await conn.query(`ALTER TABLE users ADD COLUMN ${name} ${def}`);
        console.log(`✅ Added users.${name}`);
      }
    }
    await recordMigration(conn, "migrate_two_factor.js");
    console.log("\n🎉 Two-factor migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
