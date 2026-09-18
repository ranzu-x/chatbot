/**
 * Migration: per-integration Meta App Secret.
 *
 * meta_app_settings holds ONE Meta app (id + secret) per agency, which is
 * fine while every Meta channel an agency owns comes from that same app.
 * It breaks the moment a WhatsApp number is connected manually via Cloud
 * API from a DIFFERENT Meta app than the one the agency's Facebook/
 * Instagram pages are subscribed to: Meta signs each webhook with the app
 * secret of the app that owns that subscription, so routes/webhook.js's
 * X-Hub-Signature-256 check can only ever satisfy one of the two — the
 * other channel's webhooks are rejected 401 forever.
 *
 * This column lets a manually-connected integration carry its own app
 * secret, and verifyMetaSignature() accepts a signature matching the
 * agency's configured app secret OR any of its integrations' own secrets.
 *
 * Safe to re-run.
 * Run: node migrate_integration_app_secret.js
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

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\nRunning integration-app-secret migration on database: ${dbName}\n`);

    const [[col]] = await conn.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'integrations' AND COLUMN_NAME = 'app_secret'`,
      [dbName]
    );
    if (col) {
      console.log("skip: integrations.app_secret already exists");
    } else {
      await conn.query(`ALTER TABLE integrations ADD COLUMN app_secret VARCHAR(255) NULL AFTER verify_token`);
      console.log("added: integrations.app_secret");
    }

    console.log("\nDone.\n");
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
