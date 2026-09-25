import pool from './db.js';
import { recordMigration } from './utils/migrationLedger.js';

/**
 * Migration: password reset (routes/auth.js /auth/forgot-password, /auth/reset-password).
 *
 *   password_reset_tokens — one row per emailed link. Only the SHA-256 of the
 *                           token is stored, so a database leak can't be used
 *                           to reset anyone's password. 1 hour, single use.
 *   users.password_changed_at — when the password last changed (audit/display).
 *   users.token_version     — carried in every login token (`tv`); a reset bumps
 *                           it, so middleware/tenant.js rejects every older
 *                           session. A counter, not a time comparison: the app
 *                           and database clocks may disagree.
 *
 * Safe to re-run.
 */
async function run() {
  console.log('Running password reset migration...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      user_id      INT NOT NULL,
      token_hash   CHAR(64) NOT NULL,
      expires_at   DATETIME NOT NULL,
      consumed_at  DATETIME NULL,
      requested_ip VARCHAR(64) NULL,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_password_reset_token (token_hash),
      KEY idx_password_reset_user (user_id, created_at),
      CONSTRAINT fk_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('✅ password_reset_tokens');
  try {
    await pool.query('ALTER TABLE users ADD COLUMN password_changed_at DATETIME NULL');
    console.log('✅ Added users.password_changed_at');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') console.log('ℹ️ users.password_changed_at already exists');
    else throw e;
  }
  try {
    await pool.query('ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0');
    console.log('✅ Added users.token_version');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') console.log('ℹ️ users.token_version already exists');
    else throw e;
  }
  await recordMigration(pool, 'migrate_password_reset.js');
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
