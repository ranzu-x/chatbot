/**
 * Migration: API Developer access.
 *
 * `api_keys` — per-agency API keys for the narrow public REST surface at
 * /api/v1/public/* (routes/publicApi.js), authenticated via
 * middleware/apiKeyMiddleware.js instead of the JWT cookie every other
 * route uses. Follows the key_prefix (shown in UI) + key_hash (sha256,
 * never the raw key) pattern already established for secret handling in
 * this codebase (utils/cryptoVault.js) — the full key is only ever shown
 * once, at creation time.
 *
 * Safe to re-run.
 * Run: node migrate_api_developer.js
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
    console.log(`\nRunning api-developer migration on database: ${dbName}\n`);

    const [[table]] = await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'api_keys'`,
      [dbName]
    );
    if (table) {
      console.log("skip: api_keys already exists");
    } else {
      await conn.query(`
        CREATE TABLE api_keys (
          id                  INT AUTO_INCREMENT PRIMARY KEY,
          agency_id           INT NOT NULL,
          created_by          INT NULL,
          label               VARCHAR(191) NOT NULL,
          key_prefix          VARCHAR(12) NOT NULL,
          key_hash            VARCHAR(64) NOT NULL,
          scopes              JSON NULL,
          rate_limit_per_min  INT NULL,
          last_used_at        DATETIME NULL,
          is_active           TINYINT(1) NOT NULL DEFAULT 1,
          created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          revoked_at          DATETIME NULL,
          CONSTRAINT fk_api_keys_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          UNIQUE KEY uq_api_keys_hash (key_hash),
          INDEX idx_api_keys_agency (agency_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log("done: created api_keys");
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
