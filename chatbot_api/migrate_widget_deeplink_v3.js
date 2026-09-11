/**
 * Migration: Chat Widgets for WhatsApp/Messenger/Telegram/Instagram —
 * generalizes `webchat_widgets` (already the appearance/behavior store for
 * embeddable widgets) to also cover "deep-link" widgets: a customizable
 * floating button + preview popup that hands off to the platform's own app
 * (wa.me/m.me/t.me/ig.me) instead of running a full in-page chat window.
 * Deep-link widgets need no reply flow (`flow_id` stays NULL for them) and
 * no dedicated integration of their own — they reference an EXISTING
 * connected WhatsApp/Facebook/Telegram/Instagram account via `integration_id`
 * (which, for the original WEBCHAT type, keeps meaning "this widget's own
 * auto-created Webchat integration" exactly as before).
 *
 * Purely additive — existing rows default to widget_type='WEBCHAT', which is
 * their exact current behavior, unchanged. Safe to re-run.
 *
 * Run: node migrate_widget_deeplink_v3.js
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
    console.log(`\n🏗️  Running widget-deeplink-v3 migration on database: ${dbName}\n`);

    const additions = [
      { column: "widget_type", ddl: "ADD COLUMN widget_type ENUM('WEBCHAT','DEEPLINK') NOT NULL DEFAULT 'WEBCHAT' AFTER agency_id" },
      { column: "target_platform", ddl: "ADD COLUMN target_platform ENUM('WHATSAPP','FACEBOOK','TELEGRAM','INSTAGRAM') NULL AFTER widget_type" },
    ];

    for (const { column, ddl } of additions) {
      if (await columnExists(conn, "webchat_widgets", column)) {
        console.log(`⏭️  webchat_widgets.${column} already exists`);
      } else {
        await conn.query(`ALTER TABLE webchat_widgets ${ddl}`);
        console.log(`✅ webchat_widgets.${column} added`);
      }
    }

    // integration_id was NOT NULL (every widget had its own auto-created
    // integration) — deep-link widgets reference an EXISTING integration
    // they don't own, but the column itself stays usable either way; no
    // NULL-ability change is actually needed since every widget (of either
    // type) always has a resolvable integration_id. Left as-is.

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
