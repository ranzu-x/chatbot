/**
 * Migration: Live Inbox extensions — human takeover metadata, auto-resume
 * setting, follow-ups, canned-response shortcuts, WhatsApp Flow references,
 * and the performance indexes needed for the new pagination/search work.
 *
 * Purely additive — no drops, no renames. Safe to re-run (every statement
 * guarded by an existence check), same pattern as every other migration in
 * this repo. See the approved plan for the full rationale per column.
 *
 * Run: node migrate_inbox_extensions.js
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
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return rows[0].cnt > 0;
}

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [dbName, table]
  );
  return rows[0].cnt > 0;
}

async function indexExists(conn, table, indexName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [dbName, table, indexName]
  );
  return rows[0].cnt > 0;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running Live Inbox extensions migration on database: ${dbName}\n`);

    // ────────────────────────────────────────────────────────────────
    // 1. conversations: human-takeover / pause metadata
    // ────────────────────────────────────────────────────────────────
    if (!(await columnExists(conn, "conversations", "paused_by_user_id"))) {
      await conn.query(`ALTER TABLE conversations ADD COLUMN paused_by_user_id INT NULL AFTER bot_paused`);
      console.log("✅ conversations.paused_by_user_id added");
    } else {
      console.log("⏭️  conversations.paused_by_user_id already exists");
    }
    if (!(await columnExists(conn, "conversations", "paused_at"))) {
      await conn.query(`ALTER TABLE conversations ADD COLUMN paused_at DATETIME NULL AFTER paused_by_user_id`);
      console.log("✅ conversations.paused_at added");
    } else {
      console.log("⏭️  conversations.paused_at already exists");
    }
    if (!(await columnExists(conn, "conversations", "pause_reason"))) {
      await conn.query(`ALTER TABLE conversations ADD COLUMN pause_reason ENUM('MANUAL','HUMAN_TAKEOVER') NULL AFTER paused_at`);
      console.log("✅ conversations.pause_reason added");
    } else {
      console.log("⏭️  conversations.pause_reason already exists");
    }
    if (!(await columnExists(conn, "conversations", "auto_resume_at"))) {
      await conn.query(`ALTER TABLE conversations ADD COLUMN auto_resume_at DATETIME NULL AFTER pause_reason`);
      console.log("✅ conversations.auto_resume_at added");
    } else {
      console.log("⏭️  conversations.auto_resume_at already exists");
    }

    // ────────────────────────────────────────────────────────────────
    // 2. ai_reply_settings: auto-resume-after-takeover delay
    // ────────────────────────────────────────────────────────────────
    if (!(await columnExists(conn, "ai_reply_settings", "auto_resume_minutes"))) {
      await conn.query(`ALTER TABLE ai_reply_settings ADD COLUMN auto_resume_minutes INT NULL AFTER confidence_threshold`);
      console.log("✅ ai_reply_settings.auto_resume_minutes added (NULL = Never)");
    } else {
      console.log("⏭️  ai_reply_settings.auto_resume_minutes already exists");
    }

    // ────────────────────────────────────────────────────────────────
    // 3. quick_replies: shortcut for the "/" picker
    // ────────────────────────────────────────────────────────────────
    if (!(await columnExists(conn, "quick_replies", "shortcut"))) {
      await conn.query(`ALTER TABLE quick_replies ADD COLUMN shortcut VARCHAR(50) NULL AFTER title`);
      console.log("✅ quick_replies.shortcut added");
    } else {
      console.log("⏭️  quick_replies.shortcut already exists");
    }

    // ────────────────────────────────────────────────────────────────
    // 4. follow_ups — new reusable follow-up system
    // ────────────────────────────────────────────────────────────────
    if (!(await tableExists(conn, "follow_ups"))) {
      await conn.query(`
        CREATE TABLE follow_ups (
          id                          INT AUTO_INCREMENT PRIMARY KEY,
          agency_id                   INT NOT NULL,
          contact_id                  INT NOT NULL,
          conversation_id             INT NULL,
          created_by_user_id          INT NOT NULL,
          assigned_to_agent_profile_id INT NULL,
          due_at                      DATETIME NOT NULL,
          note                        TEXT NOT NULL,
          status                      ENUM('PENDING','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING',
          completed_at                DATETIME NULL,
          created_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_fu_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          CONSTRAINT fk_fu_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
          CONSTRAINT fk_fu_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
          KEY idx_fu_contact (agency_id, contact_id),
          KEY idx_fu_due (agency_id, due_at),
          KEY idx_fu_assignee (agency_id, assigned_to_agent_profile_id, status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ follow_ups created");
    } else {
      console.log("⏭️  follow_ups already exists");
    }

    // ────────────────────────────────────────────────────────────────
    // 5. whatsapp_flow_refs — reference already-Meta-published Flows
    // ────────────────────────────────────────────────────────────────
    if (!(await tableExists(conn, "whatsapp_flow_refs"))) {
      await conn.query(`
        CREATE TABLE whatsapp_flow_refs (
          id             INT AUTO_INCREMENT PRIMARY KEY,
          agency_id      INT NOT NULL,
          integration_id INT NULL,
          name           VARCHAR(150) NOT NULL,
          flow_id        VARCHAR(100) NOT NULL,
          created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_wfr_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
          CONSTRAINT fk_wfr_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE,
          KEY idx_wfr_agency (agency_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      console.log("✅ whatsapp_flow_refs created");
    } else {
      console.log("⏭️  whatsapp_flow_refs already exists");
    }

    // ────────────────────────────────────────────────────────────────
    // 6. Performance indexes
    // ────────────────────────────────────────────────────────────────
    if (!(await indexExists(conn, "conversations", "idx_conv_agency_status_lastmsg"))) {
      await conn.query(`ALTER TABLE conversations ADD INDEX idx_conv_agency_status_lastmsg (agency_id, status, last_message_at)`);
      console.log("✅ conversations index idx_conv_agency_status_lastmsg added");
    } else {
      console.log("⏭️  conversations index idx_conv_agency_status_lastmsg already exists");
    }

    if (!(await indexExists(conn, "contacts", "idx_contacts_agency_phone"))) {
      await conn.query(`ALTER TABLE contacts ADD INDEX idx_contacts_agency_phone (agency_id, phone)`);
      console.log("✅ contacts index idx_contacts_agency_phone added");
    } else {
      console.log("⏭️  contacts index idx_contacts_agency_phone already exists");
    }

    if (!(await indexExists(conn, "contacts", "ft_contacts_name"))) {
      // InnoDB FULLTEXT — agency-scoped queries still add a WHERE agency_id=?
      // predicate alongside the MATCH() clause; MySQL applies both.
      await conn.query(`ALTER TABLE contacts ADD FULLTEXT INDEX ft_contacts_name (name)`);
      console.log("✅ contacts FULLTEXT index ft_contacts_name added");
    } else {
      console.log("⏭️  contacts FULLTEXT index ft_contacts_name already exists");
    }

    if (!(await indexExists(conn, "messages", "idx_msg_conv_created"))) {
      await conn.query(`ALTER TABLE messages ADD INDEX idx_msg_conv_created (conversation_id, created_at)`);
      console.log("✅ messages index idx_msg_conv_created added");
    } else {
      console.log("⏭️  messages index idx_msg_conv_created already exists");
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
