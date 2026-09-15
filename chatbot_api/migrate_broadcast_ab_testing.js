/**
 * A/B send testing for Broadcasting (TEMPLATE-mode campaigns only) — two
 * WhatsApp template variants split across the audience, delivery/read rates
 * compared per variant. A direct extension of the existing Broadcasting
 * module, reusing its existing delivery tracking (broadcast_logs) rather
 * than building a parallel system.
 *
 * variant_b_template_id / ab_split_percent live on broadcast_campaigns
 * (NULL variant_b_template_id = not an A/B campaign, the common case —
 * existing single-template campaigns are completely unaffected).
 * broadcast_logs.variant records which variant each recipient actually got,
 * assigned once (deterministically, by contact id) when the campaign's
 * PENDING logs are first created — see utils/broadcastRunner.js.
 *
 * Safe to re-run.
 * Run: node migrate_broadcast_ab_testing.js
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
    console.log(`\n🏗️  Running broadcast-AB-testing migration on database: ${dbName}\n`);

    if (await columnExists(conn, "broadcast_campaigns", "variant_b_template_id")) {
      console.log("⏭️  broadcast_campaigns.variant_b_template_id already exists");
    } else {
      await conn.query(`ALTER TABLE broadcast_campaigns ADD COLUMN variant_b_template_id INT NULL AFTER template_id`);
      await conn.query(`ALTER TABLE broadcast_campaigns ADD COLUMN ab_split_percent TINYINT NULL DEFAULT 50 AFTER variant_b_template_id`);
      console.log("✅ Added broadcast_campaigns.variant_b_template_id / ab_split_percent");
    }

    if (await columnExists(conn, "broadcast_logs", "variant")) {
      console.log("⏭️  broadcast_logs.variant already exists");
    } else {
      await conn.query(`ALTER TABLE broadcast_logs ADD COLUMN variant ENUM('A','B') NULL AFTER status`);
      console.log("✅ Added broadcast_logs.variant");
    }

    await recordMigration(conn, "migrate_broadcast_ab_testing.js");
    console.log("\n🎉 broadcast-AB-testing migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
