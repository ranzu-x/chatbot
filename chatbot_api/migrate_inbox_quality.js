/**
 * Inbox quality: response-time (SLA) timers, CSAT surveys, automatic assignment.
 *
 * - inbox_settings (one row per workspace; no row = everything off):
 *   SLA target minutes, CSAT question / thanks, assignment mode.
 * - conversations.awaiting_reply_since: when the customer started waiting
 *   (first unanswered inbound message). Set / cleared by the trigger below on
 *   EVERY message insert, whichever code path wrote it (agent, bot, AI, flow,
 *   API, call log) — so it can never drift.
 * - conversation_response_times: one row per answered wait (seconds, who
 *   answered: AGENT / BOT / AI / …, user id) — for the Inbox reports.
 * - csat_requests: a rating question sent when a chat is resolved; the
 *   customer's 1–5 answer lands here (utils/inboxQuality.js).
 *
 * Safe to re-run.
 * Run: node migrate_inbox_quality.js
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

async function columnExists(conn, table, column) {
  const [[row]] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return !!row;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running inbox quality migration on database: ${dbName}\n`);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS inbox_settings (
        agency_id                INT NOT NULL PRIMARY KEY,
        sla_enabled              TINYINT(1) NOT NULL DEFAULT 0,
        sla_minutes              INT NOT NULL DEFAULT 15,
        csat_enabled             TINYINT(1) NOT NULL DEFAULT 0,
        csat_question            VARCHAR(500) NULL,
        csat_thanks              VARCHAR(500) NULL,
        auto_assign_mode         ENUM('OFF','ROUND_ROBIN','LEAST_BUSY') NOT NULL DEFAULT 'OFF',
        auto_assign_online_only  TINYINT(1) NOT NULL DEFAULT 1,
        last_assigned_profile_id INT NULL,
        updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_inbox_settings_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ inbox_settings ready");
    if (!(await columnExists(conn, "inbox_settings", "auto_assign_trigger"))) {
      // NEW = every new chat; HANDOFF = only when a flow's Handoff step asks for a person.
      await conn.query("ALTER TABLE inbox_settings ADD COLUMN auto_assign_trigger ENUM('NEW','HANDOFF') NOT NULL DEFAULT 'HANDOFF' AFTER auto_assign_mode");
      console.log("✅ Added inbox_settings.auto_assign_trigger");
    }

    if (!(await columnExists(conn, "conversations", "awaiting_reply_since"))) {
      await conn.query("ALTER TABLE conversations ADD COLUMN awaiting_reply_since DATETIME NULL AFTER last_inbound_at, ADD INDEX idx_conv_agency_awaiting (agency_id, awaiting_reply_since)");
      // Open chats whose last message is from the customer are waiting now.
      await conn.query(`
        UPDATE conversations c
        JOIN (SELECT m.conversation_id, m.direction, m.created_at
                FROM messages m
                JOIN (SELECT conversation_id, MAX(id) AS id FROM messages GROUP BY conversation_id) last ON last.id = m.id) lm
          ON lm.conversation_id = c.id
        SET c.awaiting_reply_since = lm.created_at
        WHERE c.status IN ('OPEN','ASSIGNED','PENDING') AND lm.direction = 'INBOUND'
      `);
      console.log("✅ Added conversations.awaiting_reply_since (+ backfilled open chats)");
    } else {
      console.log("⏭️  conversations.awaiting_reply_since already exists");
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS conversation_response_times (
        id              BIGINT AUTO_INCREMENT PRIMARY KEY,
        agency_id       INT NOT NULL,
        conversation_id INT NOT NULL,
        seconds         INT NOT NULL,
        responder       VARCHAR(20) NOT NULL DEFAULT 'BOT',
        user_id         INT NULL,
        responded_at    DATETIME NOT NULL,
        KEY idx_crt_agency_time (agency_id, responded_at),
        KEY idx_crt_conversation (conversation_id),
        CONSTRAINT fk_crt_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ conversation_response_times ready");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS csat_requests (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        agency_id        INT NOT NULL,
        conversation_id  INT NOT NULL,
        contact_id       INT NOT NULL,
        integration_id   INT NOT NULL,
        agent_profile_id INT NULL,
        sent_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        rating           TINYINT NULL,
        responded_at     DATETIME NULL,
        KEY idx_csat_pending (contact_id, integration_id, rating, sent_at),
        KEY idx_csat_agency_time (agency_id, sent_at),
        CONSTRAINT fk_csat_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_csat_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ csat_requests ready");

    await conn.query("DROP TRIGGER IF EXISTS trg_messages_reply_clock_ai");
    await conn.query(`
      CREATE TRIGGER trg_messages_reply_clock_ai AFTER INSERT ON messages
      FOR EACH ROW
      BEGIN
        IF NEW.direction = 'INBOUND' THEN
          UPDATE conversations SET awaiting_reply_since = COALESCE(awaiting_reply_since, NEW.created_at)
           WHERE id = NEW.conversation_id;
        ELSEIF COALESCE(NEW.status, 'SENT') <> 'FAILED' THEN
          INSERT INTO conversation_response_times (agency_id, conversation_id, seconds, responder, user_id, responded_at)
          SELECT c.agency_id, c.id, GREATEST(0, TIMESTAMPDIFF(SECOND, c.awaiting_reply_since, NEW.created_at)),
                 UPPER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(NEW.metadata, '$.senderType')), 'BOT')),
                 CAST(JSON_UNQUOTE(JSON_EXTRACT(NEW.metadata, '$.userId')) AS UNSIGNED),
                 NEW.created_at
            FROM conversations c
           WHERE c.id = NEW.conversation_id AND c.awaiting_reply_since IS NOT NULL;
          UPDATE conversations SET awaiting_reply_since = NULL
           WHERE id = NEW.conversation_id AND awaiting_reply_since IS NOT NULL;
        END IF;
      END
    `);
    console.log("✅ trigger trg_messages_reply_clock_ai");

    await recordMigration(conn, "migrate_inbox_quality.js");
    console.log("\n🎉 Inbox quality migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
