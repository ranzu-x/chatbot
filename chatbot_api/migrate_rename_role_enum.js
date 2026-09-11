/**
 * Migration: rename users.role ENUM values to match the already-renamed UI
 * terminology and codebase identifiers — 'AGENCY' -> 'RESELLER',
 * 'AGENT' -> 'USER' ('ADMIN' is unchanged).
 *
 * This is the DB half of the "Agency -> Reseller, Agent -> User" rename.
 * Every code call site (roleMiddleware(), JWT payloads, INSERT INTO users
 * role literals, frontend ROLE_HOME/NAV_CONFIG/ROLE_LABELS maps, etc.) has
 * already been updated to read/write 'RESELLER'/'USER' — this migration
 * makes the actual column values (and its schema definition) match.
 *
 * NOT touched (different, unrelated dimensions that coincidentally also use
 * the words AGENCY/AGENT — renaming these would break the separate
 * role-template/permission system or collide with the pre-existing distinct
 * 'RESELLER' value already used there):
 *   - agencies.account_type ENUM(...,'RESELLER',...)
 *   - roles.scope_type / permissions.scope_type ENUM('PLATFORM','AGENCY','RESELLER')
 *   - roles.slug ('agent', etc.) and agent_profiles.team_role
 *   - packages.type ENUM('AGENCY','END_USER','TEAM_MEMBER')
 *   - conversations.js's senderType, appointments.booking_source
 *
 * Uses the safe 3-step ENUM-rename pattern to avoid MySQL truncating/
 * erroring on existing 'AGENCY'/'AGENT' row values during a direct
 * redefinition:
 *   1. Widen the ENUM to include both old and new values.
 *   2. UPDATE existing rows from the old values to the new ones.
 *   3. Narrow the ENUM down to just the new values (+ default).
 *
 * Idempotent — safe to re-run (each step checks current state first).
 *
 * Run: node migrate_rename_role_enum.js
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
    console.log(`\n🏗️  Running role-enum-rename migration on database: ${dbName}\n`);

    const [[col]] = await conn.query(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`,
      [dbName]
    );
    if (!col) {
      throw new Error("users.role column not found — is the schema set up?");
    }

    if (col.COLUMN_TYPE === "enum('ADMIN','RESELLER','USER')") {
      console.log("⏭️  users.role is already ENUM('ADMIN','RESELLER','USER') — nothing to do.");
    } else {
      // 1. Widen: include both old and new values so existing rows stay valid
      //    no matter which step we're resuming from.
      console.log("  → Step 1/3: widening users.role ENUM to include old + new values...");
      await conn.query(
        `ALTER TABLE users MODIFY COLUMN role ENUM('ADMIN','AGENCY','AGENT','RESELLER','USER') NOT NULL DEFAULT 'USER'`
      );

      // 2. Migrate existing row values.
      console.log("  → Step 2/3: converting existing 'AGENCY'/'AGENT' rows...");
      const [agencyResult] = await conn.query(`UPDATE users SET role = 'RESELLER' WHERE role = 'AGENCY'`);
      const [agentResult] = await conn.query(`UPDATE users SET role = 'USER' WHERE role = 'AGENT'`);
      console.log(`     ${agencyResult.affectedRows} row(s) AGENCY -> RESELLER, ${agentResult.affectedRows} row(s) AGENT -> USER`);

      // 3. Narrow: drop the old enum labels entirely.
      console.log("  → Step 3/3: narrowing users.role ENUM to final values...");
      await conn.query(
        `ALTER TABLE users MODIFY COLUMN role ENUM('ADMIN','RESELLER','USER') NOT NULL DEFAULT 'USER'`
      );
      console.log("✅ users.role is now ENUM('ADMIN','RESELLER','USER').");
    }

    // Sanity check: confirm no row still holds a legacy value (paranoia —
    // should be structurally impossible once the ENUM is narrowed, but this
    // gives a clear signal if something unexpected happened).
    const [[{ cnt }]] = await conn.query(
      `SELECT COUNT(*) as cnt FROM users WHERE role NOT IN ('ADMIN','RESELLER','USER')`
    );
    if (cnt > 0) {
      console.warn(`⚠️  ${cnt} user row(s) still hold an unexpected role value — investigate before relying on this migration.`);
    } else {
      console.log("✅ All users.role values confirmed within ('ADMIN','RESELLER','USER').");
    }

    console.log("\n🎉 role-enum-rename migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
