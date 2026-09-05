/**
 * Migration: Custom Fields (agency-defined subscriber data)
 * Run: node migrate_custom_fields.js
 *
 * Lets an agency define its own custom field types (text/number/date/select)
 * and fill them in per-subscriber from the Inbox — separate from the existing
 * flow-variable read-only display and the labels/tags system.
 *
 * Safe to re-run — all statements are guarded by existence checks.
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

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running custom fields migration on database: ${dbName}\n`);

    if (!(await tableExists(conn, "custom_field_definitions"))) {
      await conn.query(`
        CREATE TABLE custom_field_definitions (
          id          INT AUTO_INCREMENT PRIMARY KEY,
          agency_id   INT NOT NULL,
          name        VARCHAR(100) NOT NULL,
          field_key   VARCHAR(100) NOT NULL,   -- slug used as a stable key (e.g. for flow variables later)
          field_type  ENUM('TEXT','NUMBER','DATE','SELECT') NOT NULL DEFAULT 'TEXT',
          options     JSON NULL,               -- array of choices when field_type = 'SELECT'
          sort_order  INT NOT NULL DEFAULT 0,
          is_active   TINYINT(1) NOT NULL DEFAULT 1,
          created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_cfd_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          UNIQUE KEY uniq_agency_field_key (agency_id, field_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ custom_field_definitions created");
    } else {
      console.log("⏭️  custom_field_definitions already exists");
    }

    if (!(await tableExists(conn, "contact_custom_field_values"))) {
      await conn.query(`
        CREATE TABLE contact_custom_field_values (
          id          INT AUTO_INCREMENT PRIMARY KEY,
          contact_id  INT NOT NULL,
          field_id    INT NOT NULL,
          value       TEXT NULL,
          created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_ccfv_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
          CONSTRAINT fk_ccfv_field FOREIGN KEY (field_id) REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
          UNIQUE KEY uniq_contact_field (contact_id, field_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ contact_custom_field_values created");
    } else {
      console.log("⏭️  contact_custom_field_values already exists");
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
