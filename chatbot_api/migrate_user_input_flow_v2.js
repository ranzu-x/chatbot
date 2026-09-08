/**
 * Migration: User Input Flow v2 — channel-scoped reuse, saved responses, Google Sheets.
 * Run: node migrate_user_input_flow_v2.js
 *
 * Adds:
 *  - user_input_flows.platform — a User Input Flow is now locked to the channel it was
 *    created for, so the "Run User Input Flow" picker only ever offers same-channel ones.
 *  - user_input_flow_responses — one row per COMPLETED run (name → email → ... → done),
 *    so a subscriber's full submission is visible in the Inbox and exportable, not just
 *    whatever individual Custom Fields happened to be picked per question.
 *  - google_sheets_connections — one connected Google account per agency (OAuth refresh
 *    token), used by the Start node's "Google Sheet" export destination.
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

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows[0].cnt > 0;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running User Input Flow v2 migration on database: ${dbName}\n`);

    // user_input_flows.platform — required from now on; existing rows (there are none live
    // yet, but be safe) default to WHATSAPP rather than leaving a NULL that would violate
    // NOT NULL, then the column stays NOT NULL for every future insert.
    if (!(await columnExists(conn, "user_input_flows", "platform"))) {
      await conn.query(`ALTER TABLE user_input_flows ADD COLUMN platform VARCHAR(50) NOT NULL DEFAULT 'WHATSAPP' AFTER name`);
      console.log("✅ user_input_flows.platform added");
    } else {
      console.log("⏭️  user_input_flows.platform already exists");
    }

    if (!(await tableExists(conn, "user_input_flow_responses"))) {
      await conn.query(`
        CREATE TABLE user_input_flow_responses (
          id                  INT AUTO_INCREMENT PRIMARY KEY,
          agency_id           INT NOT NULL,
          user_input_flow_id  INT NOT NULL,
          contact_id          INT NOT NULL,
          conversation_id     INT NULL,
          flow_id             INT NULL,
          answers             JSON NOT NULL,
          created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_agency_created (agency_id, created_at),
          INDEX idx_uif (user_input_flow_id),
          INDEX idx_contact (contact_id),
          CONSTRAINT fk_uifr_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          CONSTRAINT fk_uifr_uif FOREIGN KEY (user_input_flow_id) REFERENCES user_input_flows(id) ON DELETE CASCADE,
          CONSTRAINT fk_uifr_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ user_input_flow_responses created");
    } else {
      console.log("⏭️  user_input_flow_responses already exists");
    }

    if (!(await tableExists(conn, "google_sheets_connections"))) {
      await conn.query(`
        CREATE TABLE google_sheets_connections (
          id             INT AUTO_INCREMENT PRIMARY KEY,
          agency_id      INT NOT NULL UNIQUE,
          google_email   VARCHAR(255) NULL,
          access_token   TEXT NOT NULL,
          refresh_token  TEXT NOT NULL,
          token_expiry   DATETIME NULL,
          created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_gsheets_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ google_sheets_connections created");
    } else {
      console.log("⏭️  google_sheets_connections already exists");
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
