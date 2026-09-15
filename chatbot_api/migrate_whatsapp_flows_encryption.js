/**
 * WhatsApp Flows — the encrypted data-exchange endpoint. Distinct from the
 * existing whatsapp_flow_refs (which only lets an agency reference an
 * already-Meta-published Flow in the Send Menu — this app has never
 * authored Flow screen JSON and still doesn't). This is the other half:
 * once a Flow message is sent, Meta's servers POST encrypted per-screen
 * traffic to OUR endpoint (RSA-OAEP + AES-128-GCM per Meta's spec — see
 * utils/whatsappFlowCrypto.js), and something has to answer it.
 *
 * Rather than hardcode screen logic this app has no way to know (Flow
 * screens are authored externally, in Meta's own Flow Builder), each
 * whatsapp_flow_refs row gets an optional relay_webhook_url: the agency's
 * own server/automation that implements the actual per-screen behavior.
 * This endpoint's job is the hard, error-prone part — correct encryption —
 * not guessing business logic. No relay configured -> a safe generic
 * "SUCCESS" terminal response instead of leaving Meta hanging.
 *
 * Tables:
 *  - whatsapp_flow_encryption_keys: one RSA keypair per WhatsApp integration
 *    (Meta's Flow encryption is per-phone-number). Private key encrypted at
 *    rest via utils/cryptoVault.js, same as every other stored secret key
 *    in this app (agency payment gateway keys, etc.) — a leaked DB dump
 *    still can't decrypt live Flow submissions without ENCRYPTION_KEY too.
 *  - whatsapp_flow_sessions: flow_token -> agency/integration/contact/
 *    conversation, recorded the moment a Flow message is actually sent
 *    (utils/platformSender.js) — without this there'd be no way to trace an
 *    incoming encrypted POST back to who it's even for. Also the running
 *    record of that Flow run's progress/final answer, mirroring how
 *    user_input_flow_responses already works for this app's OWN flow
 *    builder, so a completed WhatsApp Flow shows up the same way.
 *
 * Safe to re-run.
 * Run: node migrate_whatsapp_flows_encryption.js
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

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running WhatsApp Flows encryption migration on database: ${dbName}\n`);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_flow_encryption_keys (
        id                     INT AUTO_INCREMENT PRIMARY KEY,
        agency_id              INT NOT NULL,
        integration_id         INT NOT NULL,
        public_key_pem         TEXT NOT NULL,
        private_key_encrypted  TEXT NOT NULL,
        key_uploaded_to_meta   TINYINT(1) NOT NULL DEFAULT 0,
        created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_integration (integration_id),
        CONSTRAINT fk_flow_keys_agency FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ whatsapp_flow_encryption_keys ready");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS whatsapp_flow_sessions (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        flow_token       VARCHAR(120) NOT NULL,
        agency_id        INT NOT NULL,
        integration_id   INT NOT NULL,
        contact_id       INT NULL,
        conversation_id  INT NULL,
        flow_ref_id      INT NULL,
        relay_webhook_url VARCHAR(500) NULL,
        status           ENUM('SENT','IN_PROGRESS','COMPLETED','FAILED') NOT NULL DEFAULT 'SENT',
        last_screen      VARCHAR(120) NULL,
        response_data    JSON NULL,
        created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_flow_token (flow_token),
        KEY idx_flow_sessions_agency (agency_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ whatsapp_flow_sessions ready");

    if (await columnExists(conn, "whatsapp_flow_refs", "relay_webhook_url")) {
      console.log("⏭️  whatsapp_flow_refs.relay_webhook_url already exists");
    } else {
      await conn.query(`ALTER TABLE whatsapp_flow_refs ADD COLUMN relay_webhook_url VARCHAR(500) NULL AFTER flow_id`);
      console.log("✅ Added whatsapp_flow_refs.relay_webhook_url");
    }

    await recordMigration(conn, "migrate_whatsapp_flows_encryption.js");
    console.log("\n🎉 WhatsApp Flows encryption migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
