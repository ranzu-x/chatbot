/**
 * Affiliate System — Super Admin tenant only.
 *
 * Any workspace signed up directly under the Super Admin (account_type
 * DIRECT_CUSTOMER or RESELLER — never RESELLER_CUSTOMER, i.e. never a
 * Reseller's own end user) can become an affiliate and get a referral
 * link. A tenant that signs up through that link (via the public
 * Pricing -> Guest Checkout flow, see routes/billing.js /
 * services/guestSignupService.js) is tracked against it, and every
 * payment that referred tenant ever makes (first purchase + every
 * recurring renewal) earns the affiliate a commission (25% by default,
 * see utils/affiliateCommission.js).
 *
 *   affiliates            — one row per referring tenant + its code
 *   affiliate_commissions — one row per PAID invoice earned against a
 *                            referral (UNIQUE on invoice_id: retried
 *                            webhooks never double-charge)
 *   affiliate_payouts     — manual payout records an admin creates when
 *                            marking a batch of commissions as paid
 *   agencies.affiliate_id — which affiliate referred this tenant, set
 *                            once at tenant-creation time and never
 *                            changed afterwards
 *   pending_signups.affiliate_code — carries the ref code from guest
 *                            checkout initiation through to the trusted
 *                            webhook/IPN that actually creates the account
 *
 * Safe to re-run.
 * Run: node migrate_affiliate_system.js
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

async function hasColumn(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows.length > 0;
}

async function hasIndex(conn, table, indexName) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [dbName, table, indexName]
  );
  return rows.length > 0;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running affiliate-system migration on database: ${dbName}\n`);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS affiliates (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        agency_id        INT NOT NULL,
        code             VARCHAR(20) NOT NULL,
        status           ENUM('ACTIVE','SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
        commission_rate  DECIMAL(5,2) NOT NULL DEFAULT 25.00,
        created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_affiliates_agency (agency_id),
        UNIQUE KEY uq_affiliates_code (code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ affiliates ready");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS affiliate_payouts (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        affiliate_id  INT NOT NULL,
        amount        DECIMAL(10,2) NOT NULL,
        currency      VARCHAR(10) NOT NULL DEFAULT 'USD',
        note          VARCHAR(255) NULL,
        created_by    INT NULL,
        created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_payouts_affiliate (affiliate_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ affiliate_payouts ready");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS affiliate_commissions (
        id                 INT AUTO_INCREMENT PRIMARY KEY,
        affiliate_id       INT NOT NULL,
        referred_agency_id INT NOT NULL,
        invoice_id         INT NOT NULL,
        revenue_amount     DECIMAL(10,2) NOT NULL,
        commission_rate    DECIMAL(5,2) NOT NULL,
        commission_amount  DECIMAL(10,2) NOT NULL,
        currency           VARCHAR(10) NOT NULL DEFAULT 'USD',
        status             ENUM('PENDING','PAID','VOID') NOT NULL DEFAULT 'PENDING',
        payout_id          INT NULL,
        created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_commissions_invoice (invoice_id),
        KEY idx_commissions_affiliate_status (affiliate_id, status),
        KEY idx_commissions_referred_agency (referred_agency_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ affiliate_commissions ready");

    if (!(await hasColumn(conn, "agencies", "affiliate_id"))) {
      await conn.query(`ALTER TABLE agencies ADD COLUMN affiliate_id INT NULL AFTER parent_agency_id`);
      console.log("✅ agencies.affiliate_id added");
    } else {
      console.log("⏭️  agencies.affiliate_id already exists");
    }
    if (!(await hasIndex(conn, "agencies", "idx_agencies_affiliate"))) {
      await conn.query(`ALTER TABLE agencies ADD INDEX idx_agencies_affiliate (affiliate_id)`);
      console.log("✅ agencies.affiliate_id index added");
    } else {
      console.log("⏭️  agencies.affiliate_id index already exists");
    }

    if (!(await hasColumn(conn, "pending_signups", "affiliate_code"))) {
      await conn.query(`ALTER TABLE pending_signups ADD COLUMN affiliate_code VARCHAR(20) NULL AFTER business_name`);
      console.log("✅ pending_signups.affiliate_code added");
    } else {
      console.log("⏭️  pending_signups.affiliate_code already exists");
    }

    await recordMigration(conn, "migrate_affiliate_system.js");
    console.log("\n🎉 affiliate-system migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
