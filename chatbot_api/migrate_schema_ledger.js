/**
 * Creates schema_migrations (see utils/migrationLedger.js) and backfills it
 * with every migrate_*.js file already sitting in this directory, so the
 * ledger starts accurate: they've all already run against this database —
 * this migration is the one exception whose applied_at doesn't reflect
 * when it was *actually* run, just when the ledger itself was introduced.
 * From here on, a NEW migration records itself for real at the end of its
 * own run() (see this file's own call at the bottom, and
 * migrate_sequences_integration.js for the first real example).
 *
 * Safe to re-run.
 * Run: node migrate_schema_ledger.js
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ensureLedgerTable, recordMigration } from "./utils/migrationLedger.js";
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  multipleStatements: true,
});

const dbName = process.env.DB_NAME;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running schema-ledger migration on database: ${dbName}\n`);

    await ensureLedgerTable(conn);
    console.log("✅ schema_migrations created (or already existed)");

    const files = fs.readdirSync(__dirname).filter((f) => /^migrate_.*\.js$/.test(f));
    let backfilled = 0;
    for (const file of files) {
      const [result] = await conn.query("INSERT IGNORE INTO schema_migrations (name) VALUES (?)", [file]);
      if (result.affectedRows) backfilled++;
    }
    console.log(`✅ backfilled ${backfilled} of ${files.length} existing migration files (already-recorded ones skipped)`);

    await recordMigration(conn, "migrate_schema_ledger.js");
    console.log("\n🎉 schema-ledger migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
