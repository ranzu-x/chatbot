/**
 * WhatsApp catalog (utils/whatsappCatalog.js): which Meta commerce catalog a
 * WhatsApp number uses, and which connected store (Shopify / WooCommerce)
 * feeds it (products pushed with the Catalog Batch API).
 *
 * Safe to re-run.
 * Run: node migrate_whatsapp_catalog.js
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
    console.log(`\n🏗️  Running WhatsApp catalog migration on database: ${dbName}\n`);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_catalog_links (
        integration_id  INT NOT NULL PRIMARY KEY,
        agency_id       INT NOT NULL,
        catalog_id      VARCHAR(64) NULL,
        connection_id   INT NULL,
        last_sync_at    DATETIME NULL,
        last_sync_count INT NULL,
        last_sync_error VARCHAR(500) NULL,
        updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_wa_catalog_agency (agency_id),
        CONSTRAINT fk_wa_catalog_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_wa_catalog_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ whatsapp_catalog_links ready");
    await recordMigration(conn, "migrate_whatsapp_catalog.js");
    console.log("\n🎉 WhatsApp catalog migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
