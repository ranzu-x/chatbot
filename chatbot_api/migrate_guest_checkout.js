/**
 * Migration: guest checkout staging table.
 *
 * `pending_signups` holds a would-be buyer's details + chosen package/
 * gateway from the moment they submit the guest-checkout form until the
 * gateway's trusted webhook/IPN confirms payment — the account is only
 * ever created from that trusted callback (utils/accountProvisioning.js),
 * never from the browser's success-redirect alone. See routes/billing.js's
 * guest-checkout endpoints.
 *
 * Safe to re-run.
 * Run: node migrate_guest_checkout.js
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
    console.log(`\nRunning guest-checkout migration on database: ${dbName}\n`);

    const [[table]] = await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'pending_signups'`,
      [dbName]
    );
    if (table) {
      console.log("skip: pending_signups already exists");
    } else {
      await conn.query(`
        CREATE TABLE pending_signups (
          id                 INT AUTO_INCREMENT PRIMARY KEY,
          reference_token    VARCHAR(64) NOT NULL,
          full_name          VARCHAR(191) NOT NULL,
          email              VARCHAR(191) NOT NULL,
          business_name      VARCHAR(191) NULL,
          password_hash      VARCHAR(255) NOT NULL,
          package_id         INT NOT NULL,
          billing_cycle      ENUM('monthly','quarterly','yearly','lifetime','free') NOT NULL,
          provider           ENUM('STRIPE','SSLCOMMERZ','PORTWALLET','AAMARPAY') NOT NULL,
          amount             DECIMAL(10,2) NOT NULL,
          currency           ENUM('USD','BDT') NOT NULL,
          gateway_txn_id     VARCHAR(191) NULL,
          status             ENUM('PENDING','PAID','FAILED','CANCELLED','CONSUMED') NOT NULL DEFAULT 'PENDING',
          created_agency_id  INT NULL,
          created_user_id    INT NULL,
          created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_pending_signup_ref (reference_token),
          CONSTRAINT fk_pending_signup_pkg FOREIGN KEY (package_id) REFERENCES packages(id),
          INDEX idx_pending_signup_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("done: created pending_signups");
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
