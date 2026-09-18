/**
 * Migration: HTTP API Campaigns.
 *
 * `http_api_campaigns` — a reusable, named outbound-HTTP config (Automation
 * module) that a Flow Builder "HTTP API" node calls by id during execution.
 * A campaign can send a {{field_key}}-templated request (url/headers/body)
 * and/or map fields out of the JSON response back onto the contact's custom
 * fields — the same campaign row covers both "collect data" and "send data"
 * use cases (campaign_type is purely a UI/list label, not a functional
 * branch — the executor always sends the request, and always applies
 * response_mappings when present, regardless of campaign_type).
 *
 * `http_api_campaign_logs` mirrors flow_webhook_logs' shape (see
 * migrate_broadcast_module.js-era webhook logging), scoped to a campaign
 * instead of just flow/node, so a campaign's execution history is visible
 * from its own management page.
 *
 * Registers the `feature_http_api` module (category 'automation', same
 * category as the existing feature_user_input_flows row) so every new route
 * is gated through the existing package/module entitlement system, not left
 * ungated.
 *
 * Safe to re-run.
 * Run: node migrate_http_api_campaigns.js
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
  const [[row]] = await conn.query(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table]
  );
  return Boolean(row);
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\nRunning http-api-campaigns migration on database: ${dbName}\n`);

    if (await tableExists(conn, "http_api_campaigns")) {
      console.log("skip: http_api_campaigns already exists");
    } else {
      await conn.query(`
        CREATE TABLE http_api_campaigns (
          id                 INT AUTO_INCREMENT PRIMARY KEY,
          agency_id          INT NOT NULL,
          name               VARCHAR(191) NOT NULL,
          description        VARCHAR(500) NULL,
          campaign_type      ENUM('COLLECT','SEND','BOTH') NOT NULL DEFAULT 'SEND',
          method             ENUM('GET','POST','PUT','PATCH','DELETE') NOT NULL DEFAULT 'POST',
          url                VARCHAR(1000) NOT NULL,
          headers_json       JSON NULL,
          body_template      TEXT NULL,
          response_mappings  JSON NULL,
          timeout_ms         INT NOT NULL DEFAULT 10000,
          is_active          TINYINT(1) NOT NULL DEFAULT 1,
          created_by         INT NULL,
          created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_http_api_campaigns_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          INDEX idx_http_api_campaigns_agency (agency_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("done: created http_api_campaigns");
    }

    if (await tableExists(conn, "http_api_campaign_logs")) {
      console.log("skip: http_api_campaign_logs already exists");
    } else {
      await conn.query(`
        CREATE TABLE http_api_campaign_logs (
          id                INT AUTO_INCREMENT PRIMARY KEY,
          campaign_id       INT NOT NULL,
          agency_id         INT NOT NULL,
          flow_id           INT NULL,
          node_id           VARCHAR(100) NULL,
          contact_id        INT NULL,
          request_url       VARCHAR(1000) NULL,
          request_method    VARCHAR(10) NULL,
          request_headers   JSON NULL,
          request_body      TEXT NULL,
          response_status   INT NULL,
          response_body     TEXT NULL,
          is_success        TINYINT(1) NOT NULL DEFAULT 0,
          error_message     TEXT NULL,
          execution_time_ms INT NULL,
          created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_http_api_logs_campaign FOREIGN KEY (campaign_id) REFERENCES http_api_campaigns(id) ON DELETE CASCADE,
          INDEX idx_http_api_logs_campaign (campaign_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("done: created http_api_campaign_logs");
    }

    const [[existingModule]] = await conn.query(`SELECT id FROM modules WHERE \`key\` = 'feature_http_api'`);
    if (existingModule) {
      console.log("skip: module feature_http_api already exists");
    } else {
      await conn.query(
        `INSERT INTO modules (\`key\`, display_name, module_type, category, is_active, sort_order) VALUES (?, ?, ?, ?, 1, ?)`,
        ["feature_http_api", "HTTP API Campaigns", "feature", "automation", 31]
      );
      console.log("done: module feature_http_api created");
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
