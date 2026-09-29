/**
 * Browser push notifications for dashboard users (utils/webPush.js):
 *
 *   push_subscriptions  one row per browser a person switched notifications on
 *                       in (endpoint + keys from PushManager.subscribe). Rows
 *                       the push service answers 404/410 for are removed.
 *   web_push_keys       the platform's VAPID key pair (one row, id = 1), made
 *                       on first use unless VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
 *                       are set. The private key is stored encrypted. Kept out
 *                       of platform_settings on purpose (that table is listed
 *                       and writable from the Super Admin settings screen).
 *
 * Safe to re-run. Run: node migrate_web_push.js   (or: npm run migrate)
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        user_id       INT NOT NULL,
        endpoint      VARCHAR(1024) NOT NULL,
        endpoint_hash CHAR(64) NOT NULL,
        p256dh        VARCHAR(255) NOT NULL,
        auth          VARCHAR(255) NOT NULL,
        user_agent    VARCHAR(255) NULL,
        created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_sent_at  DATETIME NULL,
        UNIQUE KEY uq_push_endpoint (endpoint_hash),
        KEY idx_push_user (user_id),
        CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    // An older, never-used stub created push_subscriptions with other columns
    // (agency_id NOT NULL, p256dh_key, auth_key, no hash). Bring it to this shape,
    // keeping any rows it has.
    const [cols] = await pool.query(
      "SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'push_subscriptions'"
    );
    const has = new Set(cols.map((r) => r.c));
    if (!has.has("endpoint_hash")) {
      if (has.has("agency_id")) await pool.query("ALTER TABLE push_subscriptions MODIFY agency_id INT NULL");
      if (!has.has("p256dh")) await pool.query("ALTER TABLE push_subscriptions ADD COLUMN p256dh VARCHAR(255) NULL AFTER endpoint");
      if (!has.has("auth")) await pool.query("ALTER TABLE push_subscriptions ADD COLUMN auth VARCHAR(255) NULL AFTER p256dh");
      if (has.has("p256dh_key")) await pool.query("UPDATE push_subscriptions SET p256dh = p256dh_key, auth = auth_key");
      await pool.query("DELETE FROM push_subscriptions WHERE p256dh IS NULL OR auth IS NULL OR endpoint NOT LIKE 'https://%' OR CHAR_LENGTH(endpoint) > 1024");
      await pool.query("ALTER TABLE push_subscriptions MODIFY endpoint VARCHAR(1024) NOT NULL, MODIFY p256dh VARCHAR(255) NOT NULL, MODIFY auth VARCHAR(255) NOT NULL");
      await pool.query("ALTER TABLE push_subscriptions ADD COLUMN endpoint_hash CHAR(64) NULL AFTER endpoint");
      await pool.query("UPDATE push_subscriptions SET endpoint_hash = SHA2(endpoint, 256)");
      // keep the newest row per browser
      await pool.query(
        `DELETE a FROM push_subscriptions a JOIN push_subscriptions b
          ON a.endpoint_hash = b.endpoint_hash AND a.id < b.id`
      );
      await pool.query("ALTER TABLE push_subscriptions MODIFY endpoint_hash CHAR(64) NOT NULL, ADD UNIQUE KEY uq_push_endpoint (endpoint_hash)");
      if (has.has("p256dh_key")) await pool.query("ALTER TABLE push_subscriptions DROP COLUMN p256dh_key, DROP COLUMN auth_key");
      console.log("✅ push_subscriptions upgraded from the old stub");
    }
    if (!has.has("last_sent_at")) {
      await pool.query("ALTER TABLE push_subscriptions ADD COLUMN last_sent_at DATETIME NULL");
    }
    const [[fk]] = await pool.query(
      `SELECT COUNT(*) AS n FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'push_subscriptions' AND COLUMN_NAME = 'user_id' AND REFERENCED_TABLE_NAME = 'users'`
    );
    if (!fk.n) {
      await pool.query("DELETE ps FROM push_subscriptions ps LEFT JOIN users u ON u.id = ps.user_id WHERE u.id IS NULL");
      await pool.query("ALTER TABLE push_subscriptions ADD CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE");
    }
    console.log("✅ push_subscriptions ready");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS web_push_keys (
        id              TINYINT PRIMARY KEY,
        public_key      VARCHAR(255) NOT NULL,
        private_key_enc TEXT NOT NULL,
        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ web_push_keys ready");
    await recordMigration(pool, "migrate_web_push.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
