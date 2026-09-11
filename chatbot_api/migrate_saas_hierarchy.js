/**
 * Migration: Multi-tenant SaaS hierarchy — Platform / Reseller / Direct
 * Customer / Team Members, real roles+permissions, per-team-member channel
 * & chat access, and the reseller-pool AI feature gate.
 *
 * Run: node migrate_saas_hierarchy.js
 *
 * Safe to re-run — every statement is guarded by an existence check, and
 * every INSERT is either idempotent (ON DUPLICATE KEY / INSERT IGNORE
 * against a real unique key) or explicitly SELECT-before-INSERT where a
 * MySQL unique index can't express the uniqueness we need (system roles,
 * which have agency_id IS NULL — MySQL treats multiple NULLs in a unique
 * index as distinct, so we can't rely on a unique constraint there).
 *
 * See the approved plan: revives agencies.parent_agency_id + agency_packages/
 * agency_client_subscriptions (already existed, never wired) instead of
 * inventing new reseller tables from scratch.
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
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table]
  );
  return rows[0].cnt > 0;
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows[0].cnt > 0;
}

// ────────────────────────────────────────────────────────────────────────
// Seed data: permissions, and which system roles get which permissions.
// Deliberately representative rather than exhaustive — more keys can be
// added later (by a future migration or the Roles admin UI) without
// touching this shape.
// ────────────────────────────────────────────────────────────────────────

const PERMISSIONS = [
  // PLATFORM scope — gates chatbot_api/routes/admin.js and friends
  ["admin.dashboard.view", "View admin dashboard", "Admin", "PLATFORM"],
  ["admin.users.view", "View platform users", "Admin", "PLATFORM"],
  ["admin.users.manage", "Create/edit/suspend platform users", "Admin", "PLATFORM"],
  ["admin.agencies.view", "View direct customer accounts", "Admin", "PLATFORM"],
  ["admin.agencies.manage", "Create/edit/suspend direct customer accounts", "Admin", "PLATFORM"],
  ["admin.resellers.view", "View resellers & their customers", "Admin", "PLATFORM"],
  ["admin.resellers.manage", "Create/edit resellers, assign reseller packages", "Admin", "PLATFORM"],
  ["admin.packages.manage", "Manage platform packages & modules", "Admin", "PLATFORM"],
  ["admin.team.manage", "Manage the platform's own internal team members", "Admin", "PLATFORM"],
  ["admin.roles.manage", "Manage roles & permissions platform-wide", "Admin", "PLATFORM"],
  ["admin.settings.manage", "Manage platform settings & feature toggles", "Admin", "PLATFORM"],
  ["admin.ai_providers.manage", "Manage platform AI provider availability", "Admin", "PLATFORM"],
  ["admin.billing.manage", "View/manage platform billing", "Admin", "PLATFORM"],
  ["admin.stats.view", "View platform stats", "Admin", "PLATFORM"],
  ["admin.analytics.view", "View platform analytics", "Admin", "PLATFORM"],
  ["admin.webhooks.manage", "Manage webhook/Zapier integrations", "Admin", "PLATFORM"],

  // AGENCY scope — a direct customer's or reseller customer's own workspace
  ["inbox.view", "View conversations", "Workspace", "AGENCY"],
  ["inbox.manage", "Reply, assign, resolve conversations", "Workspace", "AGENCY"],
  ["contacts.view", "View subscribers/contacts", "Workspace", "AGENCY"],
  ["contacts.manage", "Create/edit/delete subscribers", "Workspace", "AGENCY"],
  ["flows.manage", "Build & publish bot flows", "Workspace", "AGENCY"],
  ["broadcasts.manage", "Send broadcasts", "Workspace", "AGENCY"],
  ["bot_manager.manage", "Connect/manage bot accounts", "Workspace", "AGENCY"],
  ["sequences.manage", "Manage sequences", "Workspace", "AGENCY"],
  ["team.view", "View team members", "Workspace", "AGENCY"],
  ["team.manage", "Invite/edit/remove team members", "Workspace", "AGENCY"],
  ["roles.manage", "Manage custom roles for this workspace", "Workspace", "AGENCY"],
  ["settings.manage", "Manage workspace settings", "Workspace", "AGENCY"],
  ["billing.manage", "Manage workspace billing/subscription", "Workspace", "AGENCY"],
  ["ai_agents.manage", "Manage AI Reply agents", "Workspace", "AGENCY"],
  ["ai_providers.manage", "Manage AI provider API keys", "Workspace", "AGENCY"],
  ["integrations.manage", "Manage Meta/TikTok app credentials", "Workspace", "AGENCY"],
  ["domain.manage", "Manage custom domain & branding", "Workspace", "AGENCY"],
  ["orders.manage", "Manage in-chat orders", "Workspace", "AGENCY"],
  ["appointments.manage", "Manage appointments", "Workspace", "AGENCY"],
  ["social_posts.manage", "Manage social post publishing", "Workspace", "AGENCY"],
  ["custom_fields.manage", "Manage custom fields", "Workspace", "AGENCY"],
  ["labels.manage", "Manage labels", "Workspace", "AGENCY"],
  ["reports.view", "View reports", "Workspace", "AGENCY"],
  ["agency.packages.manage", "Manage packages sold to your own customers", "Workspace", "AGENCY"],

  // RESELLER scope — a reseller's own management console over its customers
  ["reseller.customers.view", "View reseller customers", "Reseller", "RESELLER"],
  ["reseller.customers.manage", "Create/edit reseller customers", "Reseller", "RESELLER"],
  ["reseller.packages.manage", "Manage packages sold to reseller customers", "Reseller", "RESELLER"],
  ["reseller.team.manage", "Manage the reseller's own team members", "Reseller", "RESELLER"],
  ["reseller.roles.manage", "Manage custom roles for the reseller", "Reseller", "RESELLER"],
  ["reseller.branding.manage", "Manage white-label branding & domain", "Reseller", "RESELLER"],
  ["reseller.apps.manage", "Manage reseller's own Meta/TikTok app credentials", "Reseller", "RESELLER"],
  ["reseller.ai.manage", "Manage reseller's own AI provider credentials", "Reseller", "RESELLER"],
  ["reseller.billing.view", "View reseller billing/usage", "Reseller", "RESELLER"],
];

const ALL_PLATFORM = PERMISSIONS.filter((p) => p[3] === "PLATFORM").map((p) => p[0]);
const ALL_AGENCY = PERMISSIONS.filter((p) => p[3] === "AGENCY").map((p) => p[0]);
const ALL_RESELLER = PERMISSIONS.filter((p) => p[3] === "RESELLER").map((p) => p[0]);

// System roles: [scopeType, slug, name, permissionKeys]
const SYSTEM_ROLES = [
  // PLATFORM — Super Admin gets literally everything (including AGENCY +
  // RESELLER keys) so the platform org can also be used as a normal
  // workspace, per the spec ("usable as both a normal account AND an
  // administrator").
  ["PLATFORM", "super_admin", "Super Admin", [...ALL_PLATFORM, ...ALL_AGENCY, ...ALL_RESELLER]],
  ["PLATFORM", "support", "Support", ["admin.dashboard.view", "admin.users.view", "admin.agencies.view", "admin.resellers.view", "admin.stats.view"]],
  ["PLATFORM", "sales", "Sales", ["admin.dashboard.view", "admin.users.view", "admin.agencies.view", "admin.resellers.view", "admin.packages.manage"]],
  ["PLATFORM", "finance", "Finance", ["admin.dashboard.view", "admin.billing.manage", "admin.stats.view", "admin.agencies.view", "admin.resellers.view"]],
  ["PLATFORM", "technical_admin", "Technical Admin", ["admin.dashboard.view", "admin.settings.manage", "admin.ai_providers.manage", "admin.webhooks.manage", "admin.roles.manage"]],

  // AGENCY — direct customer / reseller-customer workspace roles
  ["AGENCY", "owner", "Owner", ALL_AGENCY],
  ["AGENCY", "manager", "Workspace Manager", ["inbox.view", "inbox.manage", "contacts.view", "contacts.manage", "flows.manage", "broadcasts.manage", "bot_manager.manage", "sequences.manage", "team.view", "reports.view", "labels.manage", "custom_fields.manage"]],
  ["AGENCY", "agent", "Live Chat User", ["inbox.view", "inbox.manage", "contacts.view", "labels.manage", "team.view"]],
  ["AGENCY", "bot_builder", "Bot & Flow Specialist", ["flows.manage", "bot_manager.manage", "sequences.manage", "ai_agents.manage", "custom_fields.manage", "team.view"]],
  ["AGENCY", "marketing", "Campaign Specialist", ["broadcasts.manage", "sequences.manage", "social_posts.manage", "contacts.view", "reports.view", "team.view"]],
  ["AGENCY", "viewer", "Analyst/Viewer", ["inbox.view", "contacts.view", "reports.view", "team.view"]],
  ["AGENCY", "team_member", "Team Member", ["inbox.view", "contacts.view", "team.view"]], // generic fallback for unmapped legacy team_role values

  // RESELLER — reseller's own management-console roles (Reseller Owner
  // also gets full AGENCY permissions since the reseller's own agencies
  // row is a usable workspace in its own right, not just a console).
  ["RESELLER", "reseller_owner", "Owner", [...ALL_RESELLER, ...ALL_AGENCY]],
  ["RESELLER", "reseller_sales", "Sales", ["reseller.customers.view", "reseller.customers.manage", "reseller.packages.manage", "reseller.billing.view"]],
  ["RESELLER", "reseller_support", "Support", ["reseller.customers.view", "reseller.billing.view"]],
  ["RESELLER", "reseller_manager", "Manager", ["reseller.customers.view", "reseller.customers.manage", "reseller.team.manage", "reseller.branding.manage", "reseller.apps.manage", "reseller.ai.manage", "reseller.billing.view"]],
];

// Legacy agent_profiles.team_role string -> new AGENCY role slug
const LEGACY_TEAM_ROLE_MAP = {
  MANAGER: "manager",
  AGENT: "agent",
  BOT_BUILDER: "bot_builder",
  MARKETING: "marketing",
  VIEWER: "viewer",
};

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running SaaS hierarchy migration on database: ${dbName}\n`);

    // ────────────────────────────────────────────────────────────────
    // 1. agencies.account_type
    // ────────────────────────────────────────────────────────────────
    if (!(await columnExists(conn, "agencies", "account_type"))) {
      await conn.query(`
        ALTER TABLE agencies
          ADD COLUMN account_type ENUM('PLATFORM','DIRECT_CUSTOMER','RESELLER','RESELLER_CUSTOMER')
            NOT NULL DEFAULT 'DIRECT_CUSTOMER'
          AFTER parent_agency_id
      `);
      console.log("✅ agencies.account_type added");
    } else {
      console.log("⏭️  agencies.account_type already exists");
    }

    // Designate exactly one PLATFORM row: the agency owned by the
    // lowest-id ADMIN user, creating one if that admin owns none yet.
    const [adminRows] = await conn.query("SELECT id FROM users WHERE role='ADMIN' ORDER BY id LIMIT 1");
    let platformAgencyId = null;
    if (adminRows.length) {
      const adminId = adminRows[0].id;
      const [owned] = await conn.query("SELECT id, account_type FROM agencies WHERE owner_id=?", [adminId]);
      if (owned.length) {
        platformAgencyId = owned[0].id;
        if (owned[0].account_type !== "PLATFORM") {
          await conn.query("UPDATE agencies SET account_type='PLATFORM' WHERE id=?", [platformAgencyId]);
          console.log(`✅ agencies#${platformAgencyId} designated PLATFORM (owned by admin user #${adminId})`);
        } else {
          console.log(`⏭️  agencies#${platformAgencyId} already PLATFORM`);
        }
      } else {
        const [ins] = await conn.query(
          "INSERT INTO agencies (name, slug, owner_id, account_type, is_active) VALUES ('Platform', 'platform', ?, 'PLATFORM', 1)",
          [adminId]
        );
        platformAgencyId = ins.insertId;
        console.log(`✅ Created reserved PLATFORM agency #${platformAgencyId} for admin user #${adminId}`);
      }
    } else {
      console.warn("⚠️  No ADMIN user found — skipping PLATFORM agency designation (run again after creating one)");
    }

    // ────────────────────────────────────────────────────────────────
    // 1b. users.address — needed by the Super Admin User Edit screen
    // ────────────────────────────────────────────────────────────────
    if (!(await columnExists(conn, "users", "address"))) {
      await conn.query(`ALTER TABLE users ADD COLUMN address VARCHAR(500) NULL AFTER phone`);
      console.log("✅ users.address added");
    } else {
      console.log("⏭️  users.address already exists");
    }

    // ────────────────────────────────────────────────────────────────
    // 2. permissions
    // ────────────────────────────────────────────────────────────────
    if (!(await tableExists(conn, "permissions"))) {
      await conn.query(`
        CREATE TABLE permissions (
          permission_key VARCHAR(80) PRIMARY KEY,
          label          VARCHAR(150) NOT NULL,
          category       VARCHAR(60) NOT NULL,
          scope_type     ENUM('PLATFORM','AGENCY','RESELLER') NOT NULL,
          created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ permissions created");
    } else {
      console.log("⏭️  permissions already exists");
    }
    for (const [key, label, category, scope] of PERMISSIONS) {
      await conn.query(
        "INSERT INTO permissions (permission_key, label, category, scope_type) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE label=VALUES(label), category=VALUES(category)",
        [key, label, category, scope]
      );
    }
    console.log(`✅ permissions seeded (${PERMISSIONS.length} keys)`);

    // ────────────────────────────────────────────────────────────────
    // 3. roles
    // ────────────────────────────────────────────────────────────────
    if (!(await tableExists(conn, "roles"))) {
      await conn.query(`
        CREATE TABLE roles (
          id          INT AUTO_INCREMENT PRIMARY KEY,
          agency_id   INT NULL,        -- NULL = system role; set = a custom role an org cloned/created
          scope_type  ENUM('PLATFORM','AGENCY','RESELLER') NOT NULL,
          slug        VARCHAR(60) NOT NULL,
          name        VARCHAR(100) NOT NULL,
          is_system   TINYINT(1) NOT NULL DEFAULT 0,
          created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_role_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          KEY idx_role_scope (scope_type, agency_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ roles created");
    } else {
      console.log("⏭️  roles already exists");
    }

    if (!(await tableExists(conn, "role_permissions"))) {
      await conn.query(`
        CREATE TABLE role_permissions (
          role_id         INT NOT NULL,
          permission_key  VARCHAR(80) NOT NULL,
          PRIMARY KEY (role_id, permission_key),
          CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
          CONSTRAINT fk_rp_perm FOREIGN KEY (permission_key) REFERENCES permissions(permission_key) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ role_permissions created");
    } else {
      console.log("⏭️  role_permissions already exists");
    }

    const roleIdBySlug = {}; // `${scope}:${slug}` -> id
    for (const [scope, slug, name, permKeys] of SYSTEM_ROLES) {
      const [existing] = await conn.query(
        "SELECT id FROM roles WHERE scope_type=? AND agency_id IS NULL AND slug=?",
        [scope, slug]
      );
      let roleId;
      if (existing.length) {
        roleId = existing[0].id;
      } else {
        const [ins] = await conn.query(
          "INSERT INTO roles (agency_id, scope_type, slug, name, is_system) VALUES (NULL, ?, ?, ?, 1)",
          [scope, slug, name]
        );
        roleId = ins.insertId;
      }
      roleIdBySlug[`${scope}:${slug}`] = roleId;
      for (const key of permKeys) {
        await conn.query("INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?,?)", [roleId, key]);
      }
    }
    console.log(`✅ system roles seeded (${SYSTEM_ROLES.length} roles)`);

    // ────────────────────────────────────────────────────────────────
    // 4. organization_members
    // ────────────────────────────────────────────────────────────────
    if (!(await tableExists(conn, "organization_members"))) {
      await conn.query(`
        CREATE TABLE organization_members (
          id            INT AUTO_INCREMENT PRIMARY KEY,
          user_id       INT NOT NULL,
          agency_id     INT NOT NULL,
          role_id       INT NOT NULL,
          member_kind   ENUM('OWNER','TEAM_MEMBER') NOT NULL DEFAULT 'TEAM_MEMBER',
          chat_access   ENUM('ALL','ASSIGNED_ONLY') NOT NULL DEFAULT 'ALL',
          is_active     TINYINT(1) NOT NULL DEFAULT 1,
          invited_by    INT NULL,
          created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_om_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT fk_om_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          CONSTRAINT fk_om_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
          UNIQUE KEY uniq_user_org (user_id, agency_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ organization_members created");
    } else {
      console.log("⏭️  organization_members already exists");
    }

    // Backfill: one OWNER membership per existing agency
    const [allAgencies] = await conn.query("SELECT id, owner_id, account_type FROM agencies");
    for (const a of allAgencies) {
      const scope = a.account_type === "PLATFORM" ? "PLATFORM" : a.account_type === "RESELLER" ? "RESELLER" : "AGENCY";
      const slug = a.account_type === "PLATFORM" ? "super_admin" : a.account_type === "RESELLER" ? "reseller_owner" : "owner";
      const roleId = roleIdBySlug[`${scope}:${slug}`];
      if (!roleId) continue;
      await conn.query(
        "INSERT IGNORE INTO organization_members (user_id, agency_id, role_id, member_kind, chat_access) VALUES (?,?,?, 'OWNER', 'ALL')",
        [a.owner_id, a.id, roleId]
      );
    }

    // Backfill: one TEAM_MEMBER membership per existing agent_profiles row
    // (skip rows that are actually the owner's own profile, if any)
    const [allProfiles] = await conn.query("SELECT user_id, agency_id, team_role FROM agent_profiles WHERE agency_id IS NOT NULL");
    for (const p of allProfiles) {
      const [alreadyOwner] = await conn.query("SELECT id FROM organization_members WHERE user_id=? AND agency_id=?", [p.user_id, p.agency_id]);
      if (alreadyOwner.length) continue; // already has a membership (e.g. is the owner)
      const mappedSlug = LEGACY_TEAM_ROLE_MAP[String(p.team_role || "").toUpperCase()] || "team_member";
      const roleId = roleIdBySlug[`AGENCY:${mappedSlug}`] || roleIdBySlug["AGENCY:team_member"];
      // Every team member was created with users.role='AGENT' (routes/team.js
      // always hardcoded this, regardless of the cosmetic team_role label),
      // and role='AGENT' was hard-restricted to assigned-only chats
      // (routes/conversations.js) — preserve that real prior behavior here
      // rather than defaulting everyone to 'ALL' on migration day.
      await conn.query(
        "INSERT IGNORE INTO organization_members (user_id, agency_id, role_id, member_kind, chat_access) VALUES (?,?,?, 'TEAM_MEMBER', 'ASSIGNED_ONLY')",
        [p.user_id, p.agency_id, roleId]
      );
    }
    console.log(`✅ organization_members backfilled (${allAgencies.length} owners, ${allProfiles.length} team members checked)`);

    // ────────────────────────────────────────────────────────────────
    // 5. team_member_integration_access — empty by default (no rows =
    //    unrestricted, matching today's real behavior for every existing
    //    member so nobody loses access on migration day)
    // ────────────────────────────────────────────────────────────────
    if (!(await tableExists(conn, "team_member_integration_access"))) {
      await conn.query(`
        CREATE TABLE team_member_integration_access (
          organization_member_id INT NOT NULL,
          integration_id         INT NOT NULL,
          PRIMARY KEY (organization_member_id, integration_id),
          CONSTRAINT fk_tmia_member FOREIGN KEY (organization_member_id) REFERENCES organization_members(id) ON DELETE CASCADE,
          CONSTRAINT fk_tmia_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ team_member_integration_access created");
    } else {
      console.log("⏭️  team_member_integration_access already exists");
    }

    // ────────────────────────────────────────────────────────────────
    // 6. platform_settings — first global (not per-agency) settings table
    // ────────────────────────────────────────────────────────────────
    if (!(await tableExists(conn, "platform_settings"))) {
      await conn.query(`
        CREATE TABLE platform_settings (
          setting_key VARCHAR(80) PRIMARY KEY,
          value       JSON NOT NULL,
          updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ platform_settings created");
    } else {
      console.log("⏭️  platform_settings already exists");
    }
    await conn.query(
      "INSERT IGNORE INTO platform_settings (setting_key, value) VALUES ('custom_ai_api_for_resellers', JSON_OBJECT('enabled', false))"
    );
    console.log("✅ platform_settings seeded (custom_ai_api_for_resellers: off by default)");

    // ────────────────────────────────────────────────────────────────
    // 7. modules: register the reseller-package feature flag consumed by
    //    the two-level AI-API gate (utils/aiProviders/registry.js)
    // ────────────────────────────────────────────────────────────────
    const [modRows] = await conn.query("SELECT id FROM modules WHERE `key`='custom_ai_api'");
    if (!modRows.length) {
      const [[{ maxSort }]] = await conn.query("SELECT COALESCE(MAX(sort_order),0)+1 AS maxSort FROM modules");
      await conn.query(
        "INSERT INTO modules (`key`, display_name, module_type, category, description, is_active, sort_order) VALUES (?,?,?,?,?,1,?)",
        ["custom_ai_api", "Custom AI API (for Reseller Customers)", "feature", "Reseller", "Lets a reseller's customers inherit the reseller's own AI provider credentials (also gated by the platform-wide toggle).", maxSort]
      );
      console.log("✅ modules.custom_ai_api registered");
    } else {
      console.log("⏭️  modules.custom_ai_api already exists");
    }

    // ────────────────────────────────────────────────────────────────
    // 8. modules: register reseller_management (feature-scoped limits_json
    //    holds { maxResellerCustomers }) — read by utils/entitlements.js's
    //    assertLimit('max_reseller_customers', ...) so "how many customers
    //    can this reseller create" is configured the same flexible way as
    //    every other package feature/limit, not a new hardcoded column.
    // ────────────────────────────────────────────────────────────────
    const [rmRows] = await conn.query("SELECT id FROM modules WHERE `key`='reseller_management'");
    if (!rmRows.length) {
      const [[{ maxSort2 }]] = await conn.query("SELECT COALESCE(MAX(sort_order),0)+1 AS maxSort2 FROM modules");
      await conn.query(
        "INSERT INTO modules (`key`, display_name, module_type, category, description, is_active, sort_order) VALUES (?,?,?,?,?,1,?)",
        ["reseller_management", "Reseller Management", "feature", "Reseller", "Marks a package as a reseller-tier plan; its limits_json.maxResellerCustomers caps how many customer accounts this reseller can create.", maxSort2]
      );
      console.log("✅ modules.reseller_management registered");
    } else {
      console.log("⏭️  modules.reseller_management already exists");
    }

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
