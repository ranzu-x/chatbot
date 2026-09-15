/**
 * Admin & Reseller Audit Log — "who changed which package, price or role,
 * and when." Nothing recorded this anywhere before; every mutation just
 * happened silently. Purely additive, one new table.
 *
 * `agency_id` is the ACTOR's own agency (the feed this entry belongs to),
 * not necessarily who the action was performed on — a Platform Admin's own
 * feed is agency_id = the Platform's own agency row, since every admin
 * action is performed from that account; a Reseller's feed is their own
 * agencyId. `target_agency_id` additionally records the agency the action
 * was actually performed ON (e.g. Admin toggling Agency #14), when that
 * differs from the actor's own agency, for a fuller record without
 * complicating the primary visibility scoping.
 *
 * Safe to re-run.
 * Run: node migrate_audit_log.js
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

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running audit-log migration on database: ${dbName}\n`);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS admin_audit_log (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        agency_id        INT NOT NULL,
        target_agency_id INT NULL,
        actor_user_id    INT NULL,
        actor_name       VARCHAR(200) NOT NULL,
        actor_role       VARCHAR(20) NOT NULL,
        action           VARCHAR(60) NOT NULL,
        entity_type      VARCHAR(40) NOT NULL,
        entity_id        INT NULL,
        entity_label     VARCHAR(200) NULL,
        summary          VARCHAR(500) NOT NULL,
        changes          JSON NULL,
        created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_audit_agency_created (agency_id, created_at),
        KEY idx_audit_entity (entity_type, entity_id),
        KEY idx_audit_actor (actor_user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ admin_audit_log ready");

    await recordMigration(conn, "migrate_audit_log.js");
    console.log("\n🎉 audit-log migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
