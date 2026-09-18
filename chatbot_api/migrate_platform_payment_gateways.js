/**
 * Migration: platform-level payment gateway credentials.
 *
 * `platform_payment_gateways` mirrors agency_payment_gateways' shape exactly
 * (see migrate_agency_payment_gateways.js) but scoped to `provider` alone —
 * these are the SUPER ADMIN's own merchant credentials for selling
 * `packages` to agencies/end-users (Stripe, SSLCommerz, PortWallet,
 * AamarPay), a distinct, platform-wide concern from agency_payment_gateways
 * (an agency's own credentials for billing its sub-agency clients).
 *
 * Also seeds a default `usd_to_bdt_rate` row in the existing generic
 * platform_settings key/value table (routes/platformSettings.js) if one
 * doesn't already exist — the single admin-editable exchange rate the
 * SSLCommerz/PortWallet/AamarPay adapters convert a package's USD price by.
 *
 * Safe to re-run.
 * Run: node migrate_platform_payment_gateways.js
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
    console.log(`\nRunning platform-payment-gateways migration on database: ${dbName}\n`);

    const [[table]] = await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'platform_payment_gateways'`,
      [dbName]
    );
    if (table) {
      console.log("skip: platform_payment_gateways already exists");
    } else {
      await conn.query(`
        CREATE TABLE platform_payment_gateways (
          id                INT AUTO_INCREMENT PRIMARY KEY,
          provider          ENUM('STRIPE','SSLCOMMERZ','PORTWALLET','AAMARPAY') NOT NULL,
          mode              ENUM('test','live') NOT NULL DEFAULT 'live',
          credentials       TEXT NOT NULL,
          public_ref        VARCHAR(191) NULL,
          is_active         TINYINT(1) NOT NULL DEFAULT 1,
          last_verified_at  DATETIME NULL,
          created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_platform_gateway_provider (provider)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("done: created platform_payment_gateways");
    }

    const [[settingsTable]] = await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'platform_settings'`,
      [dbName]
    );
    if (!settingsTable) {
      console.log("skip: platform_settings table doesn't exist yet — usd_to_bdt_rate seed skipped");
    } else {
      const [[existing]] = await conn.query(
        `SELECT setting_key FROM platform_settings WHERE setting_key = 'usd_to_bdt_rate'`
      );
      if (existing) {
        console.log("skip: usd_to_bdt_rate setting already exists");
      } else {
        await conn.query(
          `INSERT INTO platform_settings (setting_key, value) VALUES ('usd_to_bdt_rate', ?)`,
          [JSON.stringify({ rate: 122.5, updatedAt: new Date().toISOString() })]
        );
        console.log("done: seeded usd_to_bdt_rate = 122.5 (edit in Platform Settings)");
      }
    }

    console.log("\nMigration complete.\n");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
