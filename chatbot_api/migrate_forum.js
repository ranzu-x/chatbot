/**
 * Community Forum — Bug Reports / Feature Requests / Discussions +
 * admin-authored Announcements. Open to DIRECT_CUSTOMER and RESELLER
 * tenants only (never a Reseller's own RESELLER_CUSTOMER, see
 * utils/tenantEligibility.js), readable by anyone including logged-out
 * visitors, posting gated on login + eligibility + a verified email
 * (migrate_email_verification.js).
 *
 * Deliberately NOT tenant-isolated content — see routes/forum.js's header
 * comment. agency_id columns below are for audit/eligibility-at-write-time
 * only, never used to scope reads.
 *
 *   forum_threads         — one row per thread. moderation_status gates
 *                            visibility (PENDING_REVIEW/APPROVED/REJECTED);
 *                            status is the resolution workflow, only
 *                            meaningful once approved (see
 *                            utils/forumStatus.js for the legal
 *                            per-category status set).
 *   forum_replies         — comments on a thread, no moderation gate.
 *   forum_thread_upvotes  — one upvote per user per thread.
 *
 * Safe to re-run.
 * Run: node migrate_forum.js
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

async function hasIndex(conn, table, indexName) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [dbName, table, indexName]
  );
  return rows.length > 0;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running forum migration on database: ${dbName}\n`);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS forum_threads (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        category          ENUM('BUG','FEATURE_REQUEST','DISCUSSION','ANNOUNCEMENT') NOT NULL,
        title             VARCHAR(200) NOT NULL,
        body              TEXT NOT NULL,
        author_user_id    INT NOT NULL,
        author_agency_id  INT NOT NULL,
        moderation_status ENUM('PENDING_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
        status            ENUM('OPEN','IN_PROCESS','CONSIDERED','RESOLVED','IMPLEMENTED','COMPLETED') NOT NULL DEFAULT 'OPEN',
        rejection_reason  VARCHAR(500) NULL,
        is_pinned         TINYINT(1) NOT NULL DEFAULT 0,
        upvote_count      INT NOT NULL DEFAULT 0,
        reply_count       INT NOT NULL DEFAULT 0,
        last_activity_at  DATETIME NULL,
        approved_by       INT NULL,
        approved_at       DATETIME NULL,
        created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_ft_queue (moderation_status, category, status),
        KEY idx_ft_pending (moderation_status, created_at),
        KEY idx_ft_author (author_user_id),
        FULLTEXT KEY ft_forum_threads_search (title, body),
        CONSTRAINT fk_ft_author FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_ft_agency FOREIGN KEY (author_agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_ft_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ forum_threads ready");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS forum_replies (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        thread_id         INT NOT NULL,
        author_user_id    INT NOT NULL,
        author_agency_id  INT NOT NULL,
        body              TEXT NOT NULL,
        is_admin_reply    TINYINT(1) NOT NULL DEFAULT 0,
        created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_fr_thread (thread_id, created_at),
        CONSTRAINT fk_fr_thread FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE CASCADE,
        CONSTRAINT fk_fr_author FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_fr_agency FOREIGN KEY (author_agency_id) REFERENCES agencies(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ forum_replies ready");

    await conn.query(`
      CREATE TABLE IF NOT EXISTS forum_thread_upvotes (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        thread_id   INT NOT NULL,
        user_id     INT NOT NULL,
        created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_ftu_thread_user (thread_id, user_id),
        CONSTRAINT fk_ftu_thread FOREIGN KEY (thread_id) REFERENCES forum_threads(id) ON DELETE CASCADE,
        CONSTRAINT fk_ftu_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ forum_thread_upvotes ready");

    if (!(await hasIndex(conn, "forum_threads", "ft_forum_threads_search"))) {
      // MySQL versions that silently skip FULLTEXT inside the CREATE TABLE
      // statement (rare, but cheap to double-check) get it added here.
      await conn.query(`ALTER TABLE forum_threads ADD FULLTEXT ft_forum_threads_search (title, body)`);
      console.log("✅ forum_threads FULLTEXT index added");
    }

    await recordMigration(conn, "migrate_forum.js");
    console.log("\n🎉 forum migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
