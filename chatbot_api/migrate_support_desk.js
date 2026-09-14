/**
 * Migration: standalone Support Desk (ticketing) module.
 *
 * Tables: support_departments, support_tickets, support_ticket_messages,
 * support_ticket_attachments, support_canned_responses, support_ticket_activity.
 *
 * Also seeds new permission keys into the EXISTING permissions/roles system
 * (migrate_saas_hierarchy.js) rather than inventing a separate agent model —
 * organization_members + roles + role_permissions already cleanly expresses
 * "which team members of this agency can act as helpdesk staff". System
 * roles are shared rows (roles.agency_id IS NULL), so back-filling
 * role_permissions for the relevant system roles here applies to every
 * existing AND future agency of that type automatically.
 *
 * Ticket routing (who a ticket is FOR):
 *   - requester's agency.account_type = 'RESELLER_CUSTOMER' -> their own
 *     Reseller (agencies.parent_agency_id) handles it, Platform never sees it.
 *   - requester's agency.account_type = 'DIRECT_CUSTOMER' or 'RESELLER'
 *     -> the Platform agency (account_type='PLATFORM') handles it.
 * See routes/supportDesk.js's resolveHelpdeskAgencyId().
 *
 * Safe to re-run.
 * Run: node migrate_support_desk.js
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

// New permission keys, mirroring migrate_saas_hierarchy.js's PERMISSIONS shape.
const NEW_PERMISSIONS = [
  ["admin.support_desk.view", "View the platform's support desk tickets", "Support Desk", "PLATFORM"],
  ["admin.support_desk.manage", "Reply to & manage the platform's support desk tickets", "Support Desk", "PLATFORM"],
  ["support_desk.view", "View support desk tickets", "Support Desk", "AGENCY"],
  ["support_desk.manage", "Reply to & manage support desk tickets", "Support Desk", "AGENCY"],
];

// Which existing system roles (scope, slug) get which of the new keys.
// (scope, slug) must already exist — created by migrate_saas_hierarchy.js.
const ROLE_GRANTS = [
  ["PLATFORM", "super_admin", ["admin.support_desk.view", "admin.support_desk.manage"]],
  // The platform's dedicated "Support" role was view-only on everything else;
  // deliberately given .manage here too since replying to tickets is its purpose.
  ["PLATFORM", "support", ["admin.support_desk.view", "admin.support_desk.manage"]],

  ["AGENCY", "owner", ["support_desk.view", "support_desk.manage"]],
  ["AGENCY", "manager", ["support_desk.view", "support_desk.manage"]],
  ["AGENCY", "viewer", ["support_desk.view"]],

  ["RESELLER", "reseller_owner", ["support_desk.view", "support_desk.manage"]],
  ["RESELLER", "reseller_manager", ["support_desk.view", "support_desk.manage"]],
  // reseller_support is literally the reseller's own "Support" role.
  ["RESELLER", "reseller_support", ["support_desk.view", "support_desk.manage"]],
];

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running Support Desk migration on database: ${dbName}\n`);

    // ────────────────────────────────────────────────────────────────
    // 1. Tables
    // ────────────────────────────────────────────────────────────────
    if (!(await tableExists(conn, "support_departments"))) {
      await conn.query(`
        CREATE TABLE support_departments (
          id          INT AUTO_INCREMENT PRIMARY KEY,
          agency_id   INT NOT NULL,
          name        VARCHAR(100) NOT NULL,
          description VARCHAR(255) NULL,
          is_default  TINYINT(1) NOT NULL DEFAULT 0,
          sort_order  INT NOT NULL DEFAULT 0,
          created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uniq_dept_agency_name (agency_id, name),
          CONSTRAINT fk_sd_dept_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ support_departments created");
    } else {
      console.log("⏭️  support_departments already exists");
    }

    if (!(await tableExists(conn, "support_tickets"))) {
      await conn.query(`
        CREATE TABLE support_tickets (
          id                 INT AUTO_INCREMENT PRIMARY KEY,
          ticket_number      VARCHAR(20) NULL UNIQUE,
          helpdesk_agency_id INT NOT NULL,
          requester_user_id  INT NOT NULL,
          requester_agency_id INT NOT NULL,
          department_id      INT NULL,
          subject            VARCHAR(255) NOT NULL,
          priority           ENUM('LOW','NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL',
          status             ENUM('PENDING','ANSWERED','ON_HOLD','SOLVED','CLOSED') NOT NULL DEFAULT 'PENDING',
          assigned_to        INT NULL,
          last_reply_by      ENUM('REQUESTER','AGENT') NULL,
          last_activity_at   DATETIME NULL,
          rating             TINYINT NULL,
          rating_comment     VARCHAR(500) NULL,
          created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          solved_at          DATETIME NULL,
          closed_at          DATETIME NULL,
          KEY idx_st_helpdesk_status (helpdesk_agency_id, status),
          KEY idx_st_requester (requester_user_id),
          CONSTRAINT fk_st_helpdesk_agency FOREIGN KEY (helpdesk_agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          CONSTRAINT fk_st_requester_agency FOREIGN KEY (requester_agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          CONSTRAINT fk_st_requester_user FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT fk_st_department FOREIGN KEY (department_id) REFERENCES support_departments(id) ON DELETE SET NULL,
          CONSTRAINT fk_st_assigned_to FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ support_tickets created");
    } else {
      console.log("⏭️  support_tickets already exists");
    }

    if (!(await tableExists(conn, "support_ticket_messages"))) {
      await conn.query(`
        CREATE TABLE support_ticket_messages (
          id              INT AUTO_INCREMENT PRIMARY KEY,
          ticket_id       INT NOT NULL,
          sender_user_id  INT NOT NULL,
          sender_type     ENUM('REQUESTER','AGENT') NOT NULL,
          body            TEXT NOT NULL,
          is_internal_note TINYINT(1) NOT NULL DEFAULT 0,
          created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_stm_ticket_created (ticket_id, created_at),
          CONSTRAINT fk_stm_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
          CONSTRAINT fk_stm_sender FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ support_ticket_messages created");
    } else {
      console.log("⏭️  support_ticket_messages already exists");
    }

    if (!(await tableExists(conn, "support_ticket_attachments"))) {
      await conn.query(`
        CREATE TABLE support_ticket_attachments (
          id           INT AUTO_INCREMENT PRIMARY KEY,
          ticket_id    INT NOT NULL,
          message_id   INT NULL,
          url          VARCHAR(500) NOT NULL,
          filename     VARCHAR(255) NOT NULL,
          mime_type    VARCHAR(100) NULL,
          size         INT NULL,
          uploaded_by  INT NOT NULL,
          created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_sta_ticket (ticket_id),
          CONSTRAINT fk_sta_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
          CONSTRAINT fk_sta_message FOREIGN KEY (message_id) REFERENCES support_ticket_messages(id) ON DELETE CASCADE,
          CONSTRAINT fk_sta_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ support_ticket_attachments created");
    } else {
      console.log("⏭️  support_ticket_attachments already exists");
    }

    if (!(await tableExists(conn, "support_canned_responses"))) {
      await conn.query(`
        CREATE TABLE support_canned_responses (
          id          INT AUTO_INCREMENT PRIMARY KEY,
          agency_id   INT NOT NULL,
          title       VARCHAR(150) NOT NULL,
          body        TEXT NOT NULL,
          created_by  INT NOT NULL,
          created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_scr_agency (agency_id),
          CONSTRAINT fk_scr_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          CONSTRAINT fk_scr_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ support_canned_responses created");
    } else {
      console.log("⏭️  support_canned_responses already exists");
    }

    if (!(await tableExists(conn, "support_ticket_activity"))) {
      await conn.query(`
        CREATE TABLE support_ticket_activity (
          id            INT AUTO_INCREMENT PRIMARY KEY,
          ticket_id     INT NOT NULL,
          actor_user_id INT NULL,
          event_type    VARCHAR(40) NOT NULL,
          from_value    VARCHAR(100) NULL,
          to_value      VARCHAR(100) NULL,
          created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          KEY idx_sta2_ticket (ticket_id),
          CONSTRAINT fk_sta2_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
          CONSTRAINT fk_sta2_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ support_ticket_activity created");
    } else {
      console.log("⏭️  support_ticket_activity already exists");
    }

    // ────────────────────────────────────────────────────────────────
    // 2. Permissions + role_permissions back-fill
    // ────────────────────────────────────────────────────────────────
    for (const [key, label, category, scope] of NEW_PERMISSIONS) {
      await conn.query(
        "INSERT INTO permissions (permission_key, label, category, scope_type) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE label=VALUES(label), category=VALUES(category)",
        [key, label, category, scope]
      );
    }
    console.log(`✅ permissions seeded (${NEW_PERMISSIONS.length} keys)`);

    let grantCount = 0;
    for (const [scope, slug, keys] of ROLE_GRANTS) {
      const [[role]] = await conn.query(
        "SELECT id FROM roles WHERE scope_type=? AND agency_id IS NULL AND slug=?",
        [scope, slug]
      );
      if (!role) {
        console.warn(`⚠️  system role ${scope}/${slug} not found — skipping (run migrate_saas_hierarchy.js first?)`);
        continue;
      }
      for (const key of keys) {
        await conn.query("INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?,?)", [role.id, key]);
        grantCount++;
      }
    }
    console.log(`✅ role_permissions back-filled (${grantCount} grants across ${ROLE_GRANTS.length} system roles)`);

    // ────────────────────────────────────────────────────────────────
    // 3. Default "General Support" department for Platform + every Reseller
    // ────────────────────────────────────────────────────────────────
    const [helpdeskAgencies] = await conn.query(
      "SELECT id FROM agencies WHERE account_type IN ('PLATFORM','RESELLER')"
    );
    let deptCount = 0;
    for (const a of helpdeskAgencies) {
      const [ins] = await conn.query(
        "INSERT IGNORE INTO support_departments (agency_id, name, description, is_default, sort_order) VALUES (?, 'General Support', 'Default department for all incoming tickets', 1, 0)",
        [a.id]
      );
      if (ins.affectedRows) deptCount++;
    }
    console.log(`✅ default department seeded for ${deptCount} agency/agencies (${helpdeskAgencies.length} eligible)`);

    console.log("\n🎉 Support Desk migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
