/**
 * Migration: database-level tenant isolation (Phase 1).
 *
 * Until now "reseller A must never see reseller B's data" was enforced only by
 * every route remembering `WHERE agency_id = ?`. MySQL has no row-level
 * security, so this migration adds what the database CAN enforce:
 *
 *   1. users.home_agency_id — every login belongs to exactly one workspace.
 *      Before this, a user's workspace had to be inferred from
 *      organization_members / agencies.owner_id / agent_profiles, and the
 *      database could not answer "which reseller does this user belong to".
 *      Backfilled from those existing links (owned workspace first, then
 *      membership, then agent profile). FK is ON DELETE SET NULL, matching how
 *      agencies are already deleted without removing their owner's login.
 *
 *   2. Triggers on agencies that protect the reseller tree itself:
 *        - a RESELLER_CUSTOMER must have a parent that is a RESELLER
 *        - only RESELLER_CUSTOMERs may have a parent at all
 *        - a customer can never be moved to a different reseller
 *        - a RESELLER that still has customers cannot be demoted
 *      (agencies.parent_agency_id already is the reseller pointer, so no
 *      duplicate "reseller_id" column is added — a second copy could only drift.)
 *
 *   3. Composite foreign keys so a conversation can never point at a contact
 *      or a channel account from a different workspace:
 *        conversations(contact_id, agency_id)     -> contacts(id, agency_id)
 *        conversations(integration_id, agency_id) -> integrations(id, agency_id)
 *      Same ON DELETE behaviour as the existing single-column keys.
 *
 *   4. Triggers on flows and bots enforcing the same rule for their
 *      integration_id (a composite FK can't be used there: their existing
 *      ON DELETE SET NULL would try to null the NOT NULL agency_id).
 *
 *   5. Triggers that fill users.home_agency_id automatically whenever a user
 *      becomes an owner/member of a workspace, and forbid changing it later.
 *
 * Refuses to run (touching nothing) if existing data already violates a rule,
 * and prints the offending rows. Safe to re-run.
 *
 * Run: node migrate_tenant_isolation.js
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { recordMigration } from "./utils/migrationLedger.js";
dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  multipleStatements: false,
});
const dbName = process.env.DB_NAME;

async function columnExists(conn, table, column) {
  const [[r]] = await conn.query(
    "SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?",
    [dbName, table, column]
  );
  return r.n > 0;
}
async function constraintExists(conn, table, name) {
  const [[r]] = await conn.query(
    "SELECT COUNT(*) n FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND CONSTRAINT_NAME=?",
    [dbName, table, name]
  );
  return r.n > 0;
}
async function indexExists(conn, table, name) {
  const [[r]] = await conn.query(
    "SELECT COUNT(*) n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND INDEX_NAME=?",
    [dbName, table, name]
  );
  return r.n > 0;
}

// Pre-flight: every rule below is only added if today's data already obeys it.
const PREFLIGHT = [
  ["customers whose parent is not a reseller (or missing)",
   `SELECT a.id, a.name FROM agencies a LEFT JOIN agencies p ON p.id = a.parent_agency_id
    WHERE a.account_type = 'RESELLER_CUSTOMER' AND (p.id IS NULL OR p.account_type <> 'RESELLER')`],
  ["non-customer workspaces that have a parent",
   `SELECT id, name FROM agencies WHERE account_type <> 'RESELLER_CUSTOMER' AND parent_agency_id IS NOT NULL`],
  ["conversations whose contact belongs to another workspace",
   `SELECT c.id FROM conversations c JOIN contacts k ON k.id = c.contact_id WHERE k.agency_id <> c.agency_id`],
  ["conversations whose channel account belongs to another workspace",
   `SELECT c.id FROM conversations c JOIN integrations i ON i.id = c.integration_id WHERE i.agency_id <> c.agency_id`],
  ["flows whose channel account belongs to another workspace",
   `SELECT f.id FROM flows f JOIN integrations i ON i.id = f.integration_id WHERE i.agency_id <> f.agency_id`],
  ["bots whose channel account belongs to another workspace",
   `SELECT b.id FROM bots b JOIN integrations i ON i.id = b.integration_id WHERE i.agency_id <> b.agency_id`],
];

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running tenant-isolation migration on database: ${dbName}\n`);

    // ── Pre-flight ─────────────────────────────────────────────────────────
    let violations = 0;
    for (const [label, sql] of PREFLIGHT) {
      const [rows] = await conn.query(sql);
      if (rows.length) {
        violations += rows.length;
        console.error(`❌ ${label}: ${rows.length}`, JSON.stringify(rows.slice(0, 10)));
      }
    }
    if (violations) {
      console.error("\nExisting data breaks a rule this migration adds. Fix those rows first; nothing was changed.");
      process.exitCode = 1;
      return;
    }
    console.log("✅ pre-flight: existing data already obeys every rule");

    // ── 1. users.home_agency_id ───────────────────────────────────────────
    if (!(await columnExists(conn, "users", "home_agency_id"))) {
      await conn.query("ALTER TABLE users ADD COLUMN home_agency_id INT NULL AFTER role");
      console.log("✅ users.home_agency_id added");
    } else {
      console.log("⏭️  users.home_agency_id already exists");
    }
    const [bf] = await conn.query(
      `UPDATE users u SET u.home_agency_id = COALESCE(
         (SELECT a.id FROM agencies a WHERE a.owner_id = u.id ORDER BY a.id LIMIT 1),
         (SELECT om.agency_id FROM organization_members om WHERE om.user_id = u.id
            ORDER BY (om.member_kind = 'OWNER') DESC, om.id LIMIT 1),
         (SELECT ap.agency_id FROM agent_profiles ap WHERE ap.user_id = u.id AND ap.agency_id IS NOT NULL LIMIT 1)
       ) WHERE u.home_agency_id IS NULL`
    );
    console.log(`✅ backfilled home_agency_id on ${bf.affectedRows} user(s)`);
    if (!(await indexExists(conn, "users", "idx_users_home_agency"))) {
      await conn.query("ALTER TABLE users ADD INDEX idx_users_home_agency (home_agency_id)");
    }
    if (!(await constraintExists(conn, "users", "fk_user_home_agency"))) {
      await conn.query(
        "ALTER TABLE users ADD CONSTRAINT fk_user_home_agency FOREIGN KEY (home_agency_id) REFERENCES agencies(id) ON DELETE SET NULL"
      );
      console.log("✅ fk_user_home_agency added");
    }
    const [unhomed] = await conn.query("SELECT id, email, role FROM users WHERE home_agency_id IS NULL");
    if (unhomed.length) {
      console.warn("⚠️  users still without a home workspace (no ownership, membership or agent profile):", JSON.stringify(unhomed));
    }

    // ── 2. agencies tree guards ───────────────────────────────────────────
    await conn.query("DROP TRIGGER IF EXISTS trg_agencies_tree_bi");
    await conn.query(`
      CREATE TRIGGER trg_agencies_tree_bi BEFORE INSERT ON agencies FOR EACH ROW
      BEGIN
        DECLARE parent_type VARCHAR(32);
        IF NEW.account_type = 'RESELLER_CUSTOMER' THEN
          IF NEW.parent_agency_id IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant guard: a reseller customer must have a parent reseller';
          END IF;
          SELECT account_type INTO parent_type FROM agencies WHERE id = NEW.parent_agency_id;
          IF parent_type IS NULL OR parent_type <> 'RESELLER' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant guard: the parent of a reseller customer must be a reseller';
          END IF;
        ELSEIF NEW.parent_agency_id IS NOT NULL THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant guard: only reseller customers may have a parent workspace';
        END IF;
      END`);
    await conn.query("DROP TRIGGER IF EXISTS trg_agencies_tree_bu");
    await conn.query(`
      CREATE TRIGGER trg_agencies_tree_bu BEFORE UPDATE ON agencies FOR EACH ROW
      BEGIN
        DECLARE parent_type VARCHAR(32);
        DECLARE child_count INT DEFAULT 0;
        IF NEW.account_type = 'RESELLER_CUSTOMER' THEN
          IF NEW.parent_agency_id IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant guard: a reseller customer must have a parent reseller';
          END IF;
          IF OLD.account_type = 'RESELLER_CUSTOMER' AND NOT (NEW.parent_agency_id <=> OLD.parent_agency_id) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant guard: a customer cannot be moved to a different reseller';
          END IF;
          SELECT account_type INTO parent_type FROM agencies WHERE id = NEW.parent_agency_id;
          IF parent_type IS NULL OR parent_type <> 'RESELLER' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant guard: the parent of a reseller customer must be a reseller';
          END IF;
        ELSEIF NEW.parent_agency_id IS NOT NULL THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant guard: only reseller customers may have a parent workspace';
        END IF;
        IF OLD.account_type = 'RESELLER' AND NEW.account_type <> 'RESELLER' THEN
          SELECT COUNT(*) INTO child_count FROM agencies WHERE parent_agency_id = OLD.id;
          IF child_count > 0 THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant guard: a reseller that still has customers cannot be changed to another type';
          END IF;
        END IF;
      END`);
    console.log("✅ agencies tree triggers (re)created");

    // ── 3. conversations: composite same-workspace keys ───────────────────
    if (!(await indexExists(conn, "contacts", "uq_contacts_id_agency"))) {
      await conn.query("ALTER TABLE contacts ADD UNIQUE KEY uq_contacts_id_agency (id, agency_id)");
    }
    if (!(await indexExists(conn, "integrations", "uq_integrations_id_agency"))) {
      await conn.query("ALTER TABLE integrations ADD UNIQUE KEY uq_integrations_id_agency (id, agency_id)");
    }
    if (!(await constraintExists(conn, "conversations", "fk_conv_contact_same_agency"))) {
      await conn.query(
        `ALTER TABLE conversations ADD CONSTRAINT fk_conv_contact_same_agency
           FOREIGN KEY (contact_id, agency_id) REFERENCES contacts(id, agency_id)`
      );
      console.log("✅ conversations -> contacts same-workspace key added");
    }
    if (!(await constraintExists(conn, "conversations", "fk_conv_integ_same_agency"))) {
      await conn.query(
        `ALTER TABLE conversations ADD CONSTRAINT fk_conv_integ_same_agency
           FOREIGN KEY (integration_id, agency_id) REFERENCES integrations(id, agency_id) ON DELETE CASCADE`
      );
      console.log("✅ conversations -> integrations same-workspace key added");
    }

    // ── 4. flows / bots: channel account must be in the same workspace ────
    for (const table of ["flows", "bots"]) {
      for (const op of ["bi", "bu"]) {
        const name = `trg_${table}_same_agency_${op}`;
        await conn.query(`DROP TRIGGER IF EXISTS ${name}`);
        await conn.query(`
          CREATE TRIGGER ${name} BEFORE ${op === "bi" ? "INSERT" : "UPDATE"} ON ${table} FOR EACH ROW
          BEGIN
            DECLARE integ_agency INT;
            IF NEW.integration_id IS NOT NULL THEN
              SELECT agency_id INTO integ_agency FROM integrations WHERE id = NEW.integration_id;
              IF integ_agency IS NOT NULL AND integ_agency <> NEW.agency_id THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant guard: ${table} cannot use a channel account from another workspace';
              END IF;
            END IF;
          END`);
      }
    }
    console.log("✅ flows / bots same-workspace triggers (re)created");

    // ── 5. keep home_agency_id correct automatically, for every code path ─
    // Users are created in a dozen places (signup, reseller/admin create,
    // team invites, provisioning, seeds). Rather than trusting each INSERT to
    // remember the new column, the database fills it the moment a user gains a
    // workspace, and refuses to let it be moved to a different one afterwards.
    await conn.query("DROP TRIGGER IF EXISTS trg_agencies_set_owner_home_ai");
    await conn.query(`
      CREATE TRIGGER trg_agencies_set_owner_home_ai AFTER INSERT ON agencies FOR EACH ROW
      BEGIN
        UPDATE users SET home_agency_id = NEW.id WHERE id = NEW.owner_id AND home_agency_id IS NULL;
      END`);
    await conn.query("DROP TRIGGER IF EXISTS trg_orgmembers_set_home_ai");
    await conn.query(`
      CREATE TRIGGER trg_orgmembers_set_home_ai AFTER INSERT ON organization_members FOR EACH ROW
      BEGIN
        UPDATE users SET home_agency_id = NEW.agency_id WHERE id = NEW.user_id AND home_agency_id IS NULL;
      END`);
    await conn.query("DROP TRIGGER IF EXISTS trg_agentprofiles_set_home_ai");
    await conn.query(`
      CREATE TRIGGER trg_agentprofiles_set_home_ai AFTER INSERT ON agent_profiles FOR EACH ROW
      BEGIN
        IF NEW.agency_id IS NOT NULL THEN
          UPDATE users SET home_agency_id = NEW.agency_id WHERE id = NEW.user_id AND home_agency_id IS NULL;
        END IF;
      END`);
    await conn.query("DROP TRIGGER IF EXISTS trg_users_home_immutable_bu");
    await conn.query(`
      CREATE TRIGGER trg_users_home_immutable_bu BEFORE UPDATE ON users FOR EACH ROW
      BEGIN
        IF OLD.home_agency_id IS NOT NULL AND NEW.home_agency_id IS NOT NULL
           AND NOT (NEW.home_agency_id <=> OLD.home_agency_id) THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant guard: a user cannot be moved to a different workspace';
        END IF;
      END`);
    console.log("✅ home_agency_id auto-fill and immutability triggers (re)created");

    await recordMigration(conn, "migrate_tenant_isolation.js");
    console.log("\n🎉 tenant-isolation migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
