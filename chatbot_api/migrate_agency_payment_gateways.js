/**
 * Migration: Agency Payment Gateways + Agency-defined Client Packages
 * Run: node migrate_agency_payment_gateways.js
 *
 * Lets an Agency plug in its OWN payment gateway credentials (Stripe, PayPal, ...)
 * and define its OWN subscription packages to bill its sub-agencies/white-label
 * clients (agencies.parent_agency_id hierarchy) — fully separate from the
 * platform's own `packages`/`subscriptions` billing (services/stripeService.js).
 *
 * Safe to re-run — all statements are guarded by existence checks.
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

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table]
  );
  return rows[0].cnt > 0;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running agency payment gateway migration on database: ${dbName}\n`);

    // ──────────────────────────────────────────────────────────────────────
    // 1. agency_payment_gateways — BYOK credentials, one row per agency+provider
    // ──────────────────────────────────────────────────────────────────────
    if (!(await tableExists(conn, "agency_payment_gateways"))) {
      await conn.query(`
        CREATE TABLE agency_payment_gateways (
          id             INT AUTO_INCREMENT PRIMARY KEY,
          agency_id      INT NOT NULL,
          provider       ENUM('STRIPE','PAYPAL') NOT NULL,
          mode           ENUM('test','live') NOT NULL DEFAULT 'live',
          credentials    TEXT NOT NULL,        -- AES-256-GCM encrypted JSON blob (see utils/cryptoVault.js)
          public_ref     VARCHAR(255) NULL,    -- non-secret ref safe to show in UI (e.g. Stripe publishable key)
          is_active      TINYINT(1) NOT NULL DEFAULT 1,
          last_verified_at DATETIME NULL,
          created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_apg_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          UNIQUE KEY uniq_agency_provider (agency_id, provider)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ agency_payment_gateways created");
    } else {
      console.log("⏭️  agency_payment_gateways already exists");
    }

    // ──────────────────────────────────────────────────────────────────────
    // 2. agency_packages — plans an Agency defines for its OWN clients
    // ──────────────────────────────────────────────────────────────────────
    if (!(await tableExists(conn, "agency_packages"))) {
      await conn.query(`
        CREATE TABLE agency_packages (
          id                  INT AUTO_INCREMENT PRIMARY KEY,
          agency_id           INT NOT NULL,     -- the reseller agency that owns this plan
          name                VARCHAR(150) NOT NULL,
          slug                VARCHAR(150) NOT NULL,
          description         TEXT NULL,
          price               DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          currency            CHAR(3) NOT NULL DEFAULT 'USD',
          billing_cycle       ENUM('monthly','yearly','lifetime','free') NOT NULL DEFAULT 'monthly',
          is_active           TINYINT(1) NOT NULL DEFAULT 1,
          is_default          TINYINT(1) NOT NULL DEFAULT 0,
          max_bot_accounts    INT NULL,
          max_subscribers     INT NULL,
          max_team_members    INT NULL,
          max_monthly_messages INT NULL,
          features_summary    JSON NULL,
          provider            ENUM('STRIPE','PAYPAL') NULL,   -- which of the agency's own gateways this plan bills through
          provider_price_ref  VARCHAR(255) NULL,              -- that provider's price/plan id
          created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_apkg_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          UNIQUE KEY uniq_agency_slug (agency_id, slug)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ agency_packages created");
    } else {
      console.log("⏭️  agency_packages already exists");
    }

    // ──────────────────────────────────────────────────────────────────────
    // 3. agency_client_subscriptions — a client (child) agency's subscription
    //    to one of its parent agency's agency_packages
    // ──────────────────────────────────────────────────────────────────────
    if (!(await tableExists(conn, "agency_client_subscriptions"))) {
      await conn.query(`
        CREATE TABLE agency_client_subscriptions (
          id                    INT AUTO_INCREMENT PRIMARY KEY,
          agency_id             INT NOT NULL,   -- the reseller/parent agency (billing party)
          client_agency_id      INT NOT NULL,   -- the sub-agency/client being billed
          package_id            INT NOT NULL,
          provider               ENUM('STRIPE','PAYPAL') NOT NULL,
          provider_customer_id   VARCHAR(255) NULL,
          provider_subscription_id VARCHAR(255) NULL,
          status                ENUM('ACTIVE','CANCELLED','EXPIRED','TRIAL') NOT NULL DEFAULT 'ACTIVE',
          started_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          current_period_start  DATETIME NULL,
          current_period_end    DATETIME NULL,
          cancel_at_period_end  TINYINT(1) NOT NULL DEFAULT 0,
          notes                 TEXT NULL,
          created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_acs_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          CONSTRAINT fk_acs_client_agency FOREIGN KEY (client_agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          CONSTRAINT fk_acs_package FOREIGN KEY (package_id) REFERENCES agency_packages(id) ON DELETE RESTRICT,
          KEY idx_acs_client (client_agency_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ agency_client_subscriptions created");
    } else {
      console.log("⏭️  agency_client_subscriptions already exists");
    }

    console.log("\n✅ Migration completed successfully!\n");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    conn.release();
  }
}

run();
