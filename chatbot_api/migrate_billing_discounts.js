/**
 * Discounts at checkout + renewals from the dashboard with any gateway.
 *
 * - coupons: codes the Super Admin creates (percent or fixed USD amount,
 *   one payment or every renewal, dates, packages, total and per-customer
 *   limits). A user's `special_coupon` names one of these codes.
 * - coupon_redemptions: one row per paid checkout that used a coupon (the
 *   limits count these).
 * - pending_payments: a signed-in customer paying through SSLCommerz /
 *   aamarPay / PortWallet (a renewal or a plan change) — like pending_signups
 *   for guests; the trusted IPN turns it into a subscription + invoice.
 * - invoices / pending_signups: what was discounted and by which coupon.
 *
 * Safe to re-run.
 * Run: node migrate_billing_discounts.js
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

async function addColumn(conn, table, column, def) {
  if (await columnExists(conn, table, column)) {
    console.log(`⏭️  ${table}.${column} already exists`);
    return;
  }
  await conn.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
  console.log(`✅ Added ${table}.${column}`);
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running billing discounts migration on database: ${dbName}\n`);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        code              VARCHAR(64) NOT NULL,
        description       VARCHAR(255) NULL,
        discount_type     ENUM('PERCENT','FIXED') NOT NULL DEFAULT 'PERCENT',
        amount            DECIMAL(10,2) NOT NULL,
        duration          ENUM('ONCE','FOREVER') NOT NULL DEFAULT 'ONCE',
        package_ids       JSON NULL,
        max_redemptions   INT NULL,
        per_customer_limit INT NULL DEFAULT 1,
        starts_at         DATETIME NULL,
        ends_at           DATETIME NULL,
        is_active         TINYINT(1) NOT NULL DEFAULT 1,
        created_by        INT NULL,
        created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_coupon_code (code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ coupons ready");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS coupon_redemptions (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        coupon_id       INT NOT NULL,
        agency_id       INT NULL,
        email           VARCHAR(255) NULL,
        invoice_id      INT NULL,
        discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        currency        VARCHAR(10) NOT NULL DEFAULT 'USD',
        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_coupon_redemptions_coupon (coupon_id),
        KEY idx_coupon_redemptions_agency (agency_id),
        KEY idx_coupon_redemptions_email (email),
        CONSTRAINT fk_coupon_redemptions_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ coupon_redemptions ready");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS pending_payments (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        reference_token VARCHAR(64) NOT NULL,
        agency_id       INT NOT NULL,
        user_id         INT NOT NULL,
        package_id      INT NOT NULL,
        provider        VARCHAR(20) NOT NULL,
        amount          DECIMAL(10,2) NOT NULL,
        currency        VARCHAR(10) NOT NULL,
        original_amount DECIMAL(10,2) NULL,
        discount_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
        coupon_id       INT NULL,
        status          ENUM('PENDING','PAID','CONSUMED','FAILED') NOT NULL DEFAULT 'PENDING',
        gateway_txn_id  VARCHAR(191) NULL,
        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_pending_payments_ref (reference_token),
        KEY idx_pending_payments_agency (agency_id),
        CONSTRAINT fk_pending_payments_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ pending_payments ready");

    await addColumn(conn, "pending_signups", "coupon_id", "INT NULL");
    await addColumn(conn, "pending_signups", "original_amount", "DECIMAL(10,2) NULL");
    await addColumn(conn, "pending_signups", "discount_amount", "DECIMAL(10,2) NOT NULL DEFAULT 0");
    await addColumn(conn, "invoices", "discount_amount", "DECIMAL(10,2) NOT NULL DEFAULT 0");
    await addColumn(conn, "invoices", "coupon_id", "INT NULL");

    await recordMigration(conn, "migrate_billing_discounts.js");
    console.log("\n🎉 Billing discounts migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
