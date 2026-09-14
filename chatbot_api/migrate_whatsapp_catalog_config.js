/**
 * Migration: add a second WhatsApp Embedded Signup Configuration ID column
 * to meta_app_settings — one for the "with catalog" flow, separate from the
 * existing whatsapp_config_id (used for the plain "without catalog" flow).
 *
 * Per Meta's own Embedded Signup implementation guidance, a Configuration
 * should only include the permissions/assets a given flow actually needs —
 * bundling the Catalogs asset into a single shared Configuration that's
 * also used for non-catalog customers causes them to hit an unexpected
 * catalog-selection screen and abandon the flow. The previous implementation
 * only stored one whatsapp_config_id and tried to toggle catalog behavior
 * via an undocumented runtime `featureType: 'catalog'` extras flag — this
 * migration adds the column needed to do it the way Meta actually
 * recommends: two separate Configurations, selected by config_id per flow.
 *
 * Purely additive (ADD COLUMN, nullable — existing rows unaffected). Safe
 * to re-run.
 *
 * Run: node migrate_whatsapp_catalog_config.js
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
    console.log(`\n🏗️  Running whatsapp-catalog-config migration on database: ${dbName}\n`);

    const [[col]] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'meta_app_settings' AND COLUMN_NAME = 'whatsapp_config_id_catalog'`,
      [dbName]
    );
    if (col) {
      console.log("⏭️  meta_app_settings.whatsapp_config_id_catalog already exists — nothing to do.");
    } else {
      await conn.query(
        `ALTER TABLE meta_app_settings ADD COLUMN whatsapp_config_id_catalog VARCHAR(255) NULL AFTER whatsapp_config_id`
      );
      console.log("✅ Added meta_app_settings.whatsapp_config_id_catalog");
    }

    console.log("\n🎉 whatsapp-catalog-config migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
