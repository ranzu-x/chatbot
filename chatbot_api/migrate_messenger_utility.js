/**
 * Messenger Utility Messages + the HUMAN_AGENT tag.
 *
 * messenger_utility_templates — a Facebook Page's Utility templates
 *   (POST /<PAGE_ID>/message_templates, category UTILITY). One row per
 *   (Page integration, name, language). Belongs to that one bot account
 *   (integration_id), like every other bot component (utils/botScope.js).
 *   `components_json` is Meta's own components array; status comes from
 *   Meta (APPROVED / PENDING / REJECTED / …) and is kept fresh by the
 *   `message_template_status_update` webhook and by a sync.
 *
 * integrations.human_agent_enabled — the owner switched on Meta's Human Agent
 *   feature for this Facebook Page / Instagram account (it needs Meta App
 *   Review). When on, a person in the Inbox may reply up to 7 days after the
 *   customer's last message (messaging_type MESSAGE_TAG, tag HUMAN_AGENT).
 *   Automation never uses it.
 *
 * commerce_orders.customer_email — used to find a store customer's Messenger
 *   subscriber (a Messenger id can't be derived from a phone number).
 *
 * modules / permissions — `feature_messenger_utility` (enabled on every
 *   package) and team-rule keys `messenger_template.*`.
 *
 * Safe to re-run.
 * Run: node migrate_messenger_utility.js   (or: npm run migrate)
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";

async function addColumn(table, column, ddl) {
  try {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    console.log(`✅ Added ${table}.${column}`);
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME") console.log(`ℹ️ ${table}.${column} already exists`);
    else throw e;
  }
}

const PERMISSIONS = [
  ["messenger_template.create", "Messenger - Utility Templates: Create", "Channels & Accounts"],
  ["messenger_template.update", "Messenger - Utility Templates: Update / Sync", "Channels & Accounts"],
  ["messenger_template.delete", "Messenger - Utility Templates: Delete", "Channels & Accounts"],
];
const FULL_ACCESS_ROLES = ["owner", "super_admin", "reseller_owner", "manager"];

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messenger_utility_templates (
        id                INT NOT NULL AUTO_INCREMENT,
        agency_id         INT NOT NULL,
        integration_id    INT NOT NULL,
        meta_template_id  VARCHAR(64) NULL,
        name              VARCHAR(512) NOT NULL,
        language          VARCHAR(20) NOT NULL,
        category          VARCHAR(30) NOT NULL DEFAULT 'UTILITY',
        parameter_format  ENUM('POSITIONAL','NAMED') NOT NULL DEFAULT 'POSITIONAL',
        components_json   JSON NULL,
        status            VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        rejection_reason  VARCHAR(500) NULL,
        source            ENUM('CUSTOM','LIBRARY','SYNCED') NOT NULL DEFAULT 'SYNCED',
        library_template_name VARCHAR(255) NULL,
        header_media_url  TEXT NULL,
        created_by        INT NULL,
        last_synced_at    DATETIME NULL,
        created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_mut_name (integration_id, name(191), language),
        KEY idx_mut_agency (agency_id, integration_id, status),
        KEY idx_mut_meta (meta_template_id),
        CONSTRAINT fk_mut_agency FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE,
        CONSTRAINT fk_mut_integration FOREIGN KEY (integration_id) REFERENCES integrations (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ messenger_utility_templates");

    await addColumn("integrations", "human_agent_enabled", "TINYINT(1) NOT NULL DEFAULT 0");
    await addColumn("commerce_orders", "customer_email", "VARCHAR(191) NULL");
    await addColumn("commerce_carts", "customer_email", "VARCHAR(191) NULL");

    const [mod] = await pool.query(
      "INSERT IGNORE INTO modules (`key`, display_name, module_type, category, is_active, sort_order) VALUES (?, ?, 'feature', ?, 1, ?)",
      ["feature_messenger_utility", "Messenger - Utility Messages", "channels", 52]
    );
    console.log(mod.affectedRows ? "✅ module feature_messenger_utility" : "ℹ️ module feature_messenger_utility already exists");
    const [bf] = await pool.query(
      "INSERT IGNORE INTO package_modules (package_id, module_key, is_enabled) SELECT id, 'feature_messenger_utility', 1 FROM packages"
    );
    if (bf.affectedRows) console.log(`   enabled on ${bf.affectedRows} existing package(s)`);

    for (const [key, label, category] of PERMISSIONS) {
      await pool.query(
        `INSERT INTO permissions (permission_key, label, category, scope_type) VALUES (?, ?, ?, 'AGENCY')
         ON DUPLICATE KEY UPDATE label = VALUES(label), category = VALUES(category)`,
        [key, label, category]
      );
    }
    const [roles] = await pool.query("SELECT id, slug FROM roles WHERE agency_id IS NULL AND slug IN (?)", [FULL_ACCESS_ROLES]);
    for (const role of roles) {
      for (const [key] of PERMISSIONS) {
        await pool.query("INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)", [role.id, key]);
      }
    }
    console.log(`✅ ${PERMISSIONS.length} team-rule permissions registered, granted to ${roles.length} full-access role(s)`);

    await recordMigration(pool, "migrate_messenger_utility.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
