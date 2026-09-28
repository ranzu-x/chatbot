/**
 * Team-rule permission `developer_apps.manage` (middleware/developerAppsAccess.js):
 * a team member of the Platform or a Reseller may view and manage the
 * workspace's own Meta / TikTok developer apps only with it. Not granted to
 * any team role by default — the owner ticks it in Team Roles & Permissions.
 *
 * Safe to re-run.
 * Run: node migrate_developer_apps_permission.js   (or: npm run migrate)
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";

async function run() {
  try {
    await pool.query(
      `INSERT INTO permissions (permission_key, label, category, scope_type)
       VALUES ('developer_apps.manage', 'Developer Apps (Meta & TikTok): View & Manage App Credentials', 'Channels & Accounts', 'AGENCY')
       ON DUPLICATE KEY UPDATE label = VALUES(label), category = VALUES(category)`
    );
    // Owner-level system roles have every key; team roles don't get it by default.
    const [roles] = await pool.query("SELECT id FROM roles WHERE agency_id IS NULL AND slug IN ('owner','super_admin','reseller_owner')");
    for (const role of roles) {
      await pool.query("INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, 'developer_apps.manage')", [role.id]);
    }
    console.log(`✅ developer_apps.manage registered (owner roles: ${roles.length})`);
    await recordMigration(pool, "migrate_developer_apps_permission.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
