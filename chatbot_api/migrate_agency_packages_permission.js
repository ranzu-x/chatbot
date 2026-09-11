/**
 * New permission: "agency.packages.manage" — lets ANY agency (Direct
 * Customer or Reseller, not just Reseller-type accounts) manage the plans
 * it sells to its own end customers, under Bot Manager → ... actually under
 * the sidebar's "Packages & Modules" (now agency-facing package CRUD,
 * mirroring the Super Admin's own Packages & Modules page — see
 * chatbot_ui/src/Pages/Agency/AgencyPackagesPage.jsx and
 * chatbot_api/routes/agencyPackages.js).
 *
 * Granted to the AGENCY-scope 'owner' role (id 6) so it reaches every
 * existing Direct Customer agency immediately, the RESELLER-scope
 * 'reseller_owner' role (id 13) for parity with its existing
 * reseller.packages.manage grant, and the PLATFORM 'super_admin' role
 * (id 1) for completeness. Purely additive — existing role_permissions
 * rows are untouched. Safe to re-run.
 *
 * Run: node migrate_agency_packages_permission.js
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
const PERMISSION_KEY = "agency.packages.manage";

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running agency-packages-permission migration on database: ${dbName}\n`);

    const [[existing]] = await conn.query("SELECT permission_key FROM permissions WHERE permission_key = ?", [PERMISSION_KEY]);
    if (existing) {
      console.log(`⏭️  permission '${PERMISSION_KEY}' already exists`);
    } else {
      await conn.query(
        "INSERT INTO permissions (permission_key, label, category, scope_type) VALUES (?, ?, ?, ?)",
        [PERMISSION_KEY, "Manage packages sold to your own customers", "Workspace", "AGENCY"]
      );
      console.log(`✅ permission '${PERMISSION_KEY}' added`);
    }

    // Every role (across every agency, not just the global templates) whose
    // scope is AGENCY, RESELLER, or PLATFORM should get this — mirrors how
    // an agency's cloned/custom roles already inherit whichever permissions
    // its scope_type makes available elsewhere in this app.
    const [roles] = await conn.query("SELECT id, scope_type, slug FROM roles WHERE scope_type IN ('AGENCY','RESELLER','PLATFORM')");
    let granted = 0;
    for (const role of roles) {
      // Only grant to Owner-equivalent roles by default (same pattern this
      // app already uses — narrower roles like Support/Sales opt in
      // explicitly via routes/roles.js if an agency wants to share it).
      if (!["owner", "reseller_owner", "super_admin"].includes(role.slug)) continue;
      const [[already]] = await conn.query(
        "SELECT 1 AS x FROM role_permissions WHERE role_id = ? AND permission_key = ?",
        [role.id, PERMISSION_KEY]
      );
      if (already) continue;
      await conn.query("INSERT INTO role_permissions (role_id, permission_key) VALUES (?, ?)", [role.id, PERMISSION_KEY]);
      granted++;
    }
    console.log(`✅ granted '${PERMISSION_KEY}' to ${granted} role(s) (owner/reseller_owner/super_admin)`);

    console.log("\n✅ Migration completed successfully!\n");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Migration failed:", err.message);
    console.error(err);
    process.exit(1);
  } finally {
    conn.release();
  }
}

run();
