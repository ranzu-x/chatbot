/**
 * CRM integrations — HubSpot, Salesforce, Zoho CRM (utils/crm.js, routes/crm.js):
 *
 *   crm_connections        a workspace's CRM connections; credentials encrypted
 *                          (utils/cryptoVault.js). settings JSON: autoSync,
 *                          logChats, object (Lead / Contact), company,
 *                          fieldMap [{ source, target }].
 *                          sync_since: subscribers created / changed after it
 *                          are pushed by the sync job ("Sync existing
 *                          subscribers" moves it back to the start).
 *   crm_contact_links      subscriber ↔ CRM record (one per connection), the
 *                          last push (last_hash = what was sent, so an unchanged
 *                          subscriber is never re-sent), its outcome. Moved by
 *                          mergeContacts.
 *   modules                feature_crm_integrations, enabled on every package
 *   permissions crm.*      Team Rules keys (connect / edit / disconnect)
 *
 * Safe to re-run.
 * Run: node migrate_crm_integrations.js   (or: npm run migrate)
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";

const TEAM_KEYS = [
  ["crm.create", "CRM Integrations: Connect"],
  ["crm.update", "CRM Integrations: Edit / Sync"],
  ["crm.delete", "CRM Integrations: Disconnect"],
];
const MODULE_KEY = "feature_crm_integrations";

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_connections (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        agency_id        INT NOT NULL,
        provider         VARCHAR(30) NOT NULL,
        name             VARCHAR(120) NOT NULL,
        credentials      TEXT NOT NULL,
        settings         JSON NULL,
        status           ENUM('CONNECTED','ERROR') NOT NULL DEFAULT 'CONNECTED',
        last_error       VARCHAR(500) NULL,
        last_success_at  DATETIME NULL,
        sync_since       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_by       INT NULL,
        created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_crm_conn_agency (agency_id, provider),
        CONSTRAINT fk_crm_conn_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ crm_connections ready");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_contact_links (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        connection_id   INT NOT NULL,
        contact_id      INT NOT NULL,
        external_id     VARCHAR(100) NULL,
        object_type     VARCHAR(30) NULL,
        last_hash       CHAR(40) NULL,
        last_synced_at  DATETIME NULL,
        last_attempt_at DATETIME NULL,
        last_error      VARCHAR(500) NULL,
        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_crm_link (connection_id, contact_id),
        KEY idx_crm_link_contact (contact_id),
        CONSTRAINT fk_crm_link_conn FOREIGN KEY (connection_id) REFERENCES crm_connections(id) ON DELETE CASCADE,
        CONSTRAINT fk_crm_link_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    const [[hasHash]] = await pool.query("SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_contact_links' AND COLUMN_NAME = 'last_hash'");
    if (!hasHash.n) await pool.query("ALTER TABLE crm_contact_links ADD COLUMN last_hash CHAR(40) NULL AFTER object_type");
    console.log("✅ crm_contact_links ready");

    const [ins] = await pool.query(
      "INSERT IGNORE INTO modules (`key`, display_name, module_type, category, is_active, sort_order) VALUES (?, 'CRM Integrations (HubSpot, Salesforce, Zoho)', 'feature', 'integrations', 1, 52)",
      [MODULE_KEY]
    );
    console.log(ins.affectedRows ? `✅ module ${MODULE_KEY}` : `ℹ️ module ${MODULE_KEY} already exists`);
    const [bf] = await pool.query(
      "INSERT IGNORE INTO package_modules (package_id, module_key, is_enabled) SELECT id, ?, 1 FROM packages",
      [MODULE_KEY]
    );
    if (bf.affectedRows) console.log(`   enabled on ${bf.affectedRows} existing package(s)`);

    for (const [key, label] of TEAM_KEYS) {
      await pool.query(
        `INSERT INTO permissions (permission_key, label, category, scope_type)
         VALUES (?, ?, 'Integrations & APIs', 'AGENCY')
         ON DUPLICATE KEY UPDATE label = VALUES(label)`,
        [key, label]
      );
    }
    const [roles] = await pool.query("SELECT id FROM roles WHERE agency_id IS NULL AND slug IN ('owner','super_admin','reseller_owner')");
    for (const role of roles) {
      for (const [key] of TEAM_KEYS) {
        await pool.query("INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)", [role.id, key]);
      }
    }
    console.log(`✅ crm.* permissions registered (owner roles: ${roles.length})`);

    await recordMigration(pool, "migrate_crm_integrations.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
