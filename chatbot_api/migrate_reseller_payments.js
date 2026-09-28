/**
 * Reseller payments: a reseller's customers pay the reseller's own plans
 * (agency_packages) through the reseller's own Stripe account
 * (agency_payment_gateways). One row per confirmed payment — the reseller's
 * earnings on its dashboard come from here.
 *
 * Safe to re-run.
 * Run: node migrate_reseller_payments.js
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
  database: process.env.DB_NAME,
});

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS agency_client_payments (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        reseller_agency_id  INT NOT NULL,
        client_agency_id    INT NOT NULL,
        package_id          INT NULL,
        package_name        VARCHAR(191) NULL,
        provider            VARCHAR(20) NOT NULL DEFAULT 'STRIPE',
        provider_session_id VARCHAR(255) NOT NULL,
        amount              DECIMAL(12,2) NOT NULL,
        currency            VARCHAR(10) NOT NULL,
        period_end          DATETIME NULL,
        paid_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_acp_session (provider, provider_session_id),
        KEY idx_acp_reseller (reseller_agency_id, paid_at),
        CONSTRAINT fk_acp_reseller FOREIGN KEY (reseller_agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_acp_client FOREIGN KEY (client_agency_id) REFERENCES agencies(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ agency_client_payments ready");
    await recordMigration(conn, "migrate_reseller_payments.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
