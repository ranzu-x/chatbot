/**
 * Migration: Chat Widget redesign — a Webchat widget is now built through the
 * Flow Builder (logo/colors/position/behavior configured in a new "Widget
 * Appearance" panel there, the reply logic as ordinary flow nodes), instead
 * of the old standalone name/color/greeting-only form. `flow_id` links a
 * widget to the flow that defines its reply behavior; the rest are the
 * appearance/placement fields the new panel edits. `primary_color` is kept
 * as-is (pre-existing widgets' fallback header/button color — the new panel
 * doesn't retire it, just adds more specific fields on top of it).
 *
 * Purely additive. Existing widgets keep working unchanged with these new
 * columns NULL/defaulted. Safe to re-run.
 *
 * Run: node migrate_webchat_widget_v2.js
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

async function columnExists(conn, table, column) {
  const [[row]] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return Boolean(row);
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running webchat-widget-v2 migration on database: ${dbName}\n`);

    const additions = [
      { column: "flow_id", ddl: "ADD COLUMN flow_id INT NULL AFTER integration_id" },
      { column: "logo_url", ddl: "ADD COLUMN logo_url VARCHAR(500) NULL AFTER primary_color" },
      { column: "display_name", ddl: "ADD COLUMN display_name VARCHAR(150) NULL AFTER logo_url" },
      { column: "header_bg_color", ddl: "ADD COLUMN header_bg_color VARCHAR(20) NULL AFTER display_name" },
      { column: "header_text_color", ddl: "ADD COLUMN header_text_color VARCHAR(20) NULL DEFAULT '#ffffff' AFTER header_bg_color" },
      { column: "prefill_message", ddl: "ADD COLUMN prefill_message VARCHAR(500) NULL AFTER placeholder_text" },
      { column: "position", ddl: "ADD COLUMN position ENUM('TOP_LEFT','BOTTOM_LEFT','TOP_RIGHT','BOTTOM_RIGHT') NOT NULL DEFAULT 'BOTTOM_RIGHT' AFTER prefill_message" },
      { column: "open_on_startup", ddl: "ADD COLUMN open_on_startup TINYINT(1) NOT NULL DEFAULT 0 AFTER position" },
      { column: "offset_x", ddl: "ADD COLUMN offset_x INT NOT NULL DEFAULT 20 AFTER open_on_startup" },
      { column: "offset_y", ddl: "ADD COLUMN offset_y INT NOT NULL DEFAULT 20 AFTER offset_x" },
      { column: "button_text", ddl: "ADD COLUMN button_text VARCHAR(100) NULL DEFAULT 'Chat with us' AFTER offset_y" },
      { column: "button_bg_color", ddl: "ADD COLUMN button_bg_color VARCHAR(20) NULL AFTER button_text" },
      { column: "button_text_color", ddl: "ADD COLUMN button_text_color VARCHAR(20) NULL DEFAULT '#ffffff' AFTER button_bg_color" },
      { column: "button_size", ddl: "ADD COLUMN button_size ENUM('MEDIUM','LARGE','XLARGE') NOT NULL DEFAULT 'MEDIUM' AFTER button_text_color" },
    ];

    for (const { column, ddl } of additions) {
      if (await columnExists(conn, "webchat_widgets", column)) {
        console.log(`⏭️  webchat_widgets.${column} already exists`);
      } else {
        await conn.query(`ALTER TABLE webchat_widgets ${ddl}`);
        console.log(`✅ webchat_widgets.${column} added`);
      }
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
