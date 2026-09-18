/**
 * Retires the standalone `fb_comment_rules` table (the Connect Facebook
 * page's own duplicate Comment Automation implementation — routes/channels.js
 * "FACEBOOK COMMENT AUTOMATION RULES" section, now removed).
 *
 * Confirmed dead before removal: fb_comment_rules was written to by
 * FacebookPage.jsx's UI but never read anywhere in routes/webhook.js, which
 * is what actually processes live inbound Meta comment webhooks — that file
 * exclusively reads/writes `comment_automation_rules` (routes/comments.js,
 * the Engagement -> Comment Automation module). Rules saved through the old
 * Facebook-page UI were stored but never fired.
 *
 * Even though those rules were never functionally live, whatever an agency
 * typed into that form was still THEIR configuration — so rather than just
 * dropping the table, every row is copied forward into
 * comment_automation_rules (hardcoded platform='FACEBOOK', since
 * fb_comment_rules was Facebook-only by construction) before the old table
 * is dropped. Columns fb_comment_rules never had get comment_automation_
 * rules' own sensible defaults (see routes/comments.js's INSERT for the
 * canonical shape this mirrors).
 *
 * Safe to re-run — no-ops if fb_comment_rules doesn't exist (either never
 * created, or already retired by a previous run).
 * Run: node migrate_fb_comment_rules_retire.js
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
    console.log(`\nRunning fb_comment_rules retirement on database: ${dbName}\n`);

    const [[table]] = await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'fb_comment_rules'`,
      [dbName]
    );
    if (!table) {
      console.log("skip: fb_comment_rules does not exist — nothing to retire.\n");
      return;
    }

    const [rows] = await conn.query("SELECT * FROM fb_comment_rules");
    console.log(`Found ${rows.length} row(s) in fb_comment_rules.`);

    let migrated = 0;
    for (const r of rows) {
      await conn.query(
        `INSERT INTO comment_automation_rules (
          agency_id, integration_id, platform, campaign_name, post_id, post_data,
          trigger_type, trigger_keywords, match_type, exclude_keywords,
          auto_reply_comment, comment_variations, auto_reply_media_url,
          reply_mode, ai_prompt_instruction, ai_agent_id, enable_like_comment,
          auto_reply_private_message, private_reply_buttons, private_reply_mode, flow_id,
          offensive_keywords, offensive_action, offensive_reply_message,
          reply_multiple_times, is_active, created_at, updated_at
        ) VALUES (?, ?, 'FACEBOOK', ?, ?, NULL, ?, ?, 'CONTAINS', NULL, ?, '[]', NULL, 'STATIC', NULL, NULL, ?, ?, '[]', 'TEXT', NULL, NULL, ?, NULL, 0, ?, ?, ?)`,
        [
          r.agency_id,
          r.integration_id,
          r.campaign_name,
          r.post_id || "ALL_POSTS",
          r.trigger_type || "ALL",
          r.trigger_keywords,
          r.auto_reply_comment,
          r.enable_like_comment ? 1 : 0,
          r.auto_reply_private_message,
          r.enable_hide_comment ? "HIDE" : "NONE",
          r.is_active ? 1 : 0,
          r.created_at,
          r.updated_at,
        ]
      );
      migrated++;
    }

    console.log(`Migrated ${migrated} row(s) into comment_automation_rules.`);

    await conn.query("DROP TABLE fb_comment_rules");
    console.log("Dropped fb_comment_rules.\n");
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
