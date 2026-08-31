/**
 * Migration: Hierarchy Fix + WhatsApp Connect Columns
 * Run: node migrate_hierarchy_and_wa.js
 *
 * Safe to re-run — all ALTER statements are guarded by column-existence checks.
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

// Helper: check if a column exists in a table
async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows[0].cnt > 0;
}

// Helper: check if a foreign key exists
async function fkExists(conn, table, constraintName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [dbName, table, constraintName]
  );
  return rows[0].cnt > 0;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running hierarchy & WhatsApp migration on database: ${dbName}\n`);

    // ──────────────────────────────────────────────────────────────────────────
    // 1. agencies: add parent_agency_id
    // ──────────────────────────────────────────────────────────────────────────
    if (!(await columnExists(conn, "agencies", "parent_agency_id"))) {
      await conn.query(`
        ALTER TABLE agencies
          ADD COLUMN parent_agency_id INT NULL AFTER owner_id
      `);
      console.log("✅ agencies.parent_agency_id added");
    } else {
      console.log("⏭️  agencies.parent_agency_id already exists");
    }

    // Add FK for parent_agency_id (safe — only if not already present)
    if (!(await fkExists(conn, "agencies", "fk_agency_parent"))) {
      try {
        await conn.query(`
          ALTER TABLE agencies
            ADD CONSTRAINT fk_agency_parent
              FOREIGN KEY (parent_agency_id)
              REFERENCES agencies(id)
              ON DELETE SET NULL
        `);
        console.log("✅ agencies FK fk_agency_parent added");
      } catch (fkErr) {
        // Might fail if data issues exist — just warn
        console.warn("⚠️  Could not add FK fk_agency_parent:", fkErr.message);
      }
    } else {
      console.log("⏭️  FK fk_agency_parent already exists");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. agent_profiles: add user_type to distinguish Owner's direct users
    //    vs Agency's users
    // ──────────────────────────────────────────────────────────────────────────
    if (!(await columnExists(conn, "agent_profiles", "user_type"))) {
      await conn.query(`
        ALTER TABLE agent_profiles
          ADD COLUMN user_type ENUM('OWNER_USER', 'AGENCY_USER') NOT NULL DEFAULT 'AGENCY_USER'
          AFTER agency_id
      `);
      console.log("✅ agent_profiles.user_type added");
    } else {
      console.log("⏭️  agent_profiles.user_type already exists");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. integrations: expand platform ENUM (Telegram + Webchat may already
    //    exist from migrate_channels.js — this is idempotent)
    // ──────────────────────────────────────────────────────────────────────────
    await conn.query(`
      ALTER TABLE integrations
        MODIFY COLUMN platform
          ENUM('WHATSAPP','FACEBOOK','INSTAGRAM','TELEGRAM','WEBCHAT') NOT NULL
    `);
    console.log("✅ integrations.platform ENUM updated (TELEGRAM + WEBCHAT)");

    // ──────────────────────────────────────────────────────────────────────────
    // 4. integrations: add with_catalog flag
    // ──────────────────────────────────────────────────────────────────────────
    if (!(await columnExists(conn, "integrations", "with_catalog"))) {
      await conn.query(`
        ALTER TABLE integrations
          ADD COLUMN with_catalog TINYINT(1) NOT NULL DEFAULT 0
          AFTER is_active
      `);
      console.log("✅ integrations.with_catalog added");
    } else {
      console.log("⏭️  integrations.with_catalog already exists");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 5. integrations: add connection_method (MANUAL vs EMBEDDED)
    // ──────────────────────────────────────────────────────────────────────────
    if (!(await columnExists(conn, "integrations", "connection_method"))) {
      await conn.query(`
        ALTER TABLE integrations
          ADD COLUMN connection_method ENUM('MANUAL','EMBEDDED') NOT NULL DEFAULT 'MANUAL'
          AFTER with_catalog
      `);
      console.log("✅ integrations.connection_method added");
    } else {
      console.log("⏭️  integrations.connection_method already exists");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 6. contacts: expand platform ENUM
    // ──────────────────────────────────────────────────────────────────────────
    await conn.query(`
      ALTER TABLE contacts
        MODIFY COLUMN platform
          ENUM('WHATSAPP','FACEBOOK','INSTAGRAM','TELEGRAM','WEBCHAT') NOT NULL
    `);
    console.log("✅ contacts.platform ENUM updated (TELEGRAM + WEBCHAT)");

    // ──────────────────────────────────────────────────────────────────────────
    // 7. meta_app_settings: ensure system_user_token column exists
    //    (was added by migrate_meta_cols.js — guard here too)
    // ──────────────────────────────────────────────────────────────────────────
    if (!(await columnExists(conn, "meta_app_settings", "system_user_token"))) {
      await conn.query(`
        ALTER TABLE meta_app_settings
          ADD COLUMN system_user_token TEXT NULL AFTER app_secret
      `);
      console.log("✅ meta_app_settings.system_user_token added");
    } else {
      console.log("⏭️  meta_app_settings.system_user_token already exists");
    }

    if (!(await columnExists(conn, "meta_app_settings", "whatsapp_config_id"))) {
      await conn.query(`
        ALTER TABLE meta_app_settings
          ADD COLUMN whatsapp_config_id VARCHAR(200) NULL AFTER system_user_token
      `);
      console.log("✅ meta_app_settings.whatsapp_config_id added");
    } else {
      console.log("⏭️  meta_app_settings.whatsapp_config_id already exists");
    }

    console.log("\n✅ Migration completed successfully!\n");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    conn.release();
  }
}

run();
