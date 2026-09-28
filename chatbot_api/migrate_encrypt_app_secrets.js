/**
 * Encrypts developer-app secrets at rest (utils/appSecrets.js):
 * meta_app_pool.app_secret / system_user_token and
 * tiktok_app_settings.client_secret, which were stored in plain text.
 *
 * Every reader opens them (utils/appCredentials.js and the few direct
 * lookups) and an unsealed value is still read as plain text, so this can run
 * any time. Needs ENCRYPTION_KEY (already required for store credentials).
 *
 * Safe to re-run (already-sealed values are skipped).
 * Run: node migrate_encrypt_app_secrets.js   (or: npm run migrate)
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";
import { sealAppSecret, isSealed } from "./utils/appSecrets.js";

async function sealColumn(table, column) {
  const [rows] = await pool.query(`SELECT id, \`${column}\` AS v FROM \`${table}\` WHERE \`${column}\` IS NOT NULL AND \`${column}\` <> ''`);
  let sealed = 0;
  for (const r of rows) {
    if (isSealed(r.v)) continue;
    await pool.query(`UPDATE \`${table}\` SET \`${column}\` = ? WHERE id = ? AND \`${column}\` = ?`, [sealAppSecret(r.v), r.id, r.v]);
    sealed += 1;
  }
  console.log(`✅ ${table}.${column}: ${sealed} encrypted (${rows.length - sealed} already were)`);
}

async function widen(table, column) {
  // Ciphertext is ~2× the plain value plus a prefix — make sure it fits.
  const [[col]] = await pool.query(
    "SELECT DATA_TYPE, CHARACTER_MAXIMUM_LENGTH AS len FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column]
  );
  if (col && col.DATA_TYPE === "varchar" && Number(col.len) < 2000) {
    await pool.query(`ALTER TABLE \`${table}\` MODIFY \`${column}\` TEXT NULL`);
    console.log(`✅ ${table}.${column} widened to TEXT`);
  }
}

async function run() {
  try {
    for (const [table, column] of [["meta_app_pool", "app_secret"], ["meta_app_pool", "system_user_token"], ["tiktok_app_settings", "client_secret"]]) {
      await widen(table, column);
      await sealColumn(table, column);
    }
    await recordMigration(pool, "migrate_encrypt_app_secrets.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
