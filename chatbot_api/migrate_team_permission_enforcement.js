/**
 * Closes a real gap: routes/team.js's team-member CRUD endpoints
 * (POST/PUT/PATCH/DELETE /team-members*) had NO permission check beyond
 * "is logged in" — any authenticated user, including a plain Agent, could
 * call them directly (bypassing the UI, which never exposed these actions
 * to Agents) to create/edit/deactivate/delete team members, including
 * reassigning roles. Fixed in routes/team.js by gating those routes on the
 * existing "team.manage" permission (already correctly scoped to Owner-only
 * in the seeded AGENCY roles — see migrate_saas_hierarchy.js's ALL_AGENCY).
 *
 * Read access (GET /team-members, GET /team-members/:id) is now gated on
 * "team.view" — already granted to the seeded "manager" role, but missing
 * from "agent", "bot_builder", "marketing", "viewer", and "team_member".
 * Since those routes were previously wide open, every one of those roles
 * could already see the team list; granting them "team.view" here preserves
 * that existing behavior instead of silently regressing it while the real
 * fix (requiring the permission at all) goes in.
 *
 * Purely additive. Safe to re-run.
 *
 * Run: node migrate_team_permission_enforcement.js
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
const ROLE_SLUGS_NEEDING_TEAM_VIEW = ["agent", "bot_builder", "marketing", "viewer", "team_member"];

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running team-permission-enforcement migration on database: ${dbName}\n`);

    const [roles] = await conn.query(
      "SELECT id, slug FROM roles WHERE scope_type = 'AGENCY' AND agency_id IS NULL AND slug IN (?)",
      [ROLE_SLUGS_NEEDING_TEAM_VIEW]
    );

    let granted = 0;
    for (const role of roles) {
      const [[already]] = await conn.query(
        "SELECT 1 AS x FROM role_permissions WHERE role_id = ? AND permission_key = 'team.view'",
        [role.id]
      );
      if (already) {
        console.log(`⏭️  role '${role.slug}' already has team.view`);
        continue;
      }
      await conn.query("INSERT INTO role_permissions (role_id, permission_key) VALUES (?, 'team.view')", [role.id]);
      console.log(`✅ granted team.view to role '${role.slug}'`);
      granted++;
    }
    console.log(`\n✅ Migration completed — ${granted} role(s) newly granted team.view.\n`);
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
