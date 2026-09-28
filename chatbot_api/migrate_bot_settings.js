/**
 * Bot Settings tabs (Bot Manager → Bot Settings, utils/botSettings.js) and the
 * Subscriber Manager's Fields & Variables:
 *
 *   bot_settings                   one row per bot account (integration):
 *     chat_human_email             who gets an email when a subscriber taps
 *                                  Chat with Human (NULL = nobody)
 *     uif_session_minutes          how long a User Input Flow waits for the next
 *                                  answer before the session expires (NULL = 1440,
 *                                  the old fixed 24 hours)
 *     chat_human_session_minutes   how long a subscriber's Chat with Human keeps the
 *                                  bot paused (NULL = the bot's "Automatic resume
 *                                  after human takeover" setting, as before)
 *   auto_responder_integrations    a workspace's Mailchimp / Brevo / ActiveCampaign /
 *                                  Mautic connections (utils/autoResponders.js);
 *                                  credentials encrypted (utils/cryptoVault.js)
 *   workspace_variables            workspace-wide values used in messages as
 *                                  {{var.<key>}} (Subscriber Manager → Variables)
 *   contacts.age                   the "Age" system field
 *   permissions autoresponder.*    Team Rules keys for the Auto Responder tab
 *
 * Safe to re-run.
 * Run: node migrate_bot_settings.js   (or: npm run migrate)
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";

async function columnExists(table, column) {
  const [rows] = await pool.query(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column]
  );
  return rows.length > 0;
}

const TEAM_KEYS = [
  ["autoresponder.create", "Auto Responders: Connect"],
  ["autoresponder.update", "Auto Responders: Edit"],
  ["autoresponder.delete", "Auto Responders: Disconnect"],
];

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bot_settings (
        integration_id              INT NOT NULL PRIMARY KEY,
        agency_id                   INT NOT NULL,
        chat_human_email            VARCHAR(255) NULL,
        uif_session_minutes         INT NULL,
        chat_human_session_minutes  INT NULL,
        created_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_bot_settings_agency (agency_id),
        CONSTRAINT fk_bot_settings_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_bot_settings_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ bot_settings ready");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS auto_responder_integrations (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        agency_id        INT NOT NULL,
        provider         VARCHAR(30) NOT NULL,
        name             VARCHAR(120) NOT NULL,
        credentials      TEXT NOT NULL,
        settings         JSON NULL,
        status           ENUM('CONNECTED','ERROR') NOT NULL DEFAULT 'CONNECTED',
        last_error       VARCHAR(500) NULL,
        last_success_at  DATETIME NULL,
        created_by       INT NULL,
        created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_ari_agency (agency_id, provider),
        CONSTRAINT fk_ari_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ auto_responder_integrations ready");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS workspace_variables (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        agency_id    INT NOT NULL,
        var_key      VARCHAR(64) NOT NULL,
        name         VARCHAR(100) NOT NULL,
        value        TEXT NULL,
        description  VARCHAR(255) NULL,
        created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_workspace_var (agency_id, var_key),
        CONSTRAINT fk_wsvar_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ workspace_variables ready");

    if (!(await columnExists("contacts", "age"))) {
      await pool.query("ALTER TABLE contacts ADD COLUMN age SMALLINT UNSIGNED NULL AFTER email");
      console.log("✅ contacts.age added");
    }

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
    console.log(`✅ autoresponder.* permissions registered (owner roles: ${roles.length})`);

    await recordMigration(pool, "migrate_bot_settings.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
