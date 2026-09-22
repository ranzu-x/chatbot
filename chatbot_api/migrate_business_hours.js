/**
 * Migration: Business Hours — per-bot-account (per-integration) weekly
 * schedule that gates automated replies outside opening hours.
 *
 * Two tables, both keyed on `integration_id` (a bot/channel account), same
 * shape as ai_reply_settings — one settings row + a day-by-day schedule:
 *
 *   business_hours_settings   — one row per integration. `enabled = 0` means
 *     the feature is off entirely and nothing about a bot's behavior changes
 *     (utils/businessHours.js short-circuits to "always within hours").
 *   business_hours_days       — exactly 7 rows per integration (Sun..Sat),
 *     each either marked `is_off` (closed all day) or carrying an
 *     open_time/close_time pair. Always all 7, even when the UI's "same
 *     time every day" toggle is on — that toggle only controls how the
 *     Business Hours page edits them, not how they're stored or read.
 *
 * `off_hours_flow_id` is the "special bot" — an existing Flow (built the
 * normal way in the Flow Builder) that a NEW conversation is handed to
 * automatically when it starts outside business hours, instead of (or in
 * addition to, depending on the toggles) normal keyword/AI matching. It is
 * a Flow reference, so it is subject to the bot-scope wall (utils/botScope.js
 * REF_KEYS) — must belong to the SAME integration_id, enforced in
 * routes/businessHours.js.
 *
 * Safe to re-run — every statement is guarded by an existence check.
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
  multipleStatements: true,
});

const dbName = process.env.DB_NAME;

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
    [dbName, table]
  );
  return rows.length > 0;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running business-hours migration on database: ${dbName}\n`);

    if (await tableExists(conn, "business_hours_settings")) {
      console.log("⏭️  business_hours_settings already exists");
    } else {
      await conn.query(`
        CREATE TABLE business_hours_settings (
          id                      INT AUTO_INCREMENT PRIMARY KEY,
          integration_id          INT NOT NULL,
          agency_id               INT NOT NULL,
          enabled                 TINYINT(1) NOT NULL DEFAULT 0,
          timezone                VARCHAR(64) NOT NULL DEFAULT 'UTC',
          same_every_day          TINYINT(1) NOT NULL DEFAULT 1,
          bot_replies_off_hours   TINYINT(1) NOT NULL DEFAULT 1,
          ai_replies_off_hours    TINYINT(1) NOT NULL DEFAULT 1,
          off_hours_flow_id       INT NULL,
          created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_bhs_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE,
          CONSTRAINT fk_bhs_off_hours_flow FOREIGN KEY (off_hours_flow_id) REFERENCES flows(id) ON DELETE SET NULL,
          UNIQUE KEY uniq_bhs_integration (integration_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ Created business_hours_settings");
    }

    if (await tableExists(conn, "business_hours_days")) {
      console.log("⏭️  business_hours_days already exists");
    } else {
      await conn.query(`
        CREATE TABLE business_hours_days (
          id              INT AUTO_INCREMENT PRIMARY KEY,
          integration_id  INT NOT NULL,
          day_of_week     TINYINT NOT NULL,
          is_off          TINYINT(1) NOT NULL DEFAULT 0,
          open_time       TIME NULL DEFAULT '09:00:00',
          close_time      TIME NULL DEFAULT '17:00:00',
          CONSTRAINT fk_bhd_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE,
          CONSTRAINT chk_bhd_day CHECK (day_of_week BETWEEN 0 AND 6),
          UNIQUE KEY uniq_bhd_day (integration_id, day_of_week)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ Created business_hours_days");
    }

    await recordMigration(conn, "migrate_business_hours.js");
    console.log("\n✅ Business Hours migration complete.\n");
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
