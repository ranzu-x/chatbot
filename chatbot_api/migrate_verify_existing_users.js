/**
 * One-time backfill: every account that existed before email verification
 * shipped is treated as verified, so nobody sees a "verify your email"
 * banner (or loses forum posting) for an address they never had a chance to
 * confirm. Only accounts created AFTER this runs go through verification —
 * self-signups and guest-checkout buyers get an emailed link; accounts an
 * admin/reseller creates are marked verified at creation.
 *
 * DELIBERATELY runs once. The migration ledger (utils/migrationLedger.js)
 * makes a second run a no-op — that guard is load-bearing: re-running this
 * later would wrongly mark real, still-unverified new signups as verified.
 * (Every other migration here is safe to re-run; this one is safe to re-run
 * only because it refuses to.)
 *
 * Run: node migrate_verify_existing_users.js
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { hasRun, recordMigration } from "./utils/migrationLedger.js";
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const NAME = "migrate_verify_existing_users.js";

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${process.env.DB_NAME}\``);

    if (await hasRun(conn, NAME)) {
      console.log("⏭️  Already applied — skipping (this backfill must only ever run once).");
      return;
    }

    const [[before]] = await conn.query("SELECT COUNT(*) AS n FROM users WHERE email_verified_at IS NULL");
    const [result] = await conn.query("UPDATE users SET email_verified_at = COALESCE(created_at, NOW()) WHERE email_verified_at IS NULL");
    console.log(`✅ Marked ${result.affectedRows} existing account(s) as verified (of ${before.n} unverified).`);

    await recordMigration(conn, NAME);
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
