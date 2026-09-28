/**
 * Telegram group management (Bot Manager → Group Management on a Telegram bot,
 * utils/telegramGroups.js, routes/telegramGroups.js).
 *
 * The connected bot is added to Telegram groups / supergroups and manages them:
 * welcome / goodbye, captcha for new members, join-request approval, link /
 * forward / banned-word / flood protection with warnings, admin commands in the
 * group, member moderation, invite links, announcements (now or scheduled),
 * activity log and daily stats. Group messages never go through the one-to-one
 * pipeline (no subscriber, no flow, no Inbox chat).
 *
 *   telegram_groups              one row per (bot account, group chat)
 *   telegram_group_members       people seen in the group (joins, messages, warnings, captcha)
 *   telegram_group_join_requests requests to join (approve / decline from the dashboard)
 *   telegram_group_logs          activity + moderation log
 *   telegram_group_posts         announcements (sent now or scheduled)
 *   telegram_group_invite_links  invite links the bot created
 *   telegram_group_stats         per-day message / join / leave / action counts
 *   telegram_group_deletions     bot messages to delete later (welcome / notices)
 *
 * Safe to re-run.
 * Run: node migrate_telegram_groups.js   (or: npm run migrate)
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";

const TABLE_OPTS = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS telegram_groups (
        id                      INT AUTO_INCREMENT PRIMARY KEY,
        agency_id               INT NOT NULL,
        integration_id          INT NOT NULL,
        chat_id                 BIGINT NOT NULL,
        type                    VARCHAR(20) NOT NULL DEFAULT 'group',
        title                   VARCHAR(255) NOT NULL DEFAULT '',
        username                VARCHAR(64) NULL,
        description             TEXT NULL,
        is_forum                TINYINT(1) NOT NULL DEFAULT 0,
        member_count            INT NULL,
        bot_status              VARCHAR(20) NOT NULL DEFAULT 'member',
        bot_rights              JSON NULL,
        admins                  JSON NULL,
        admins_synced_at        DATETIME NULL,
        default_permissions     JSON NULL,
        settings                JSON NULL,
        primary_invite_link     VARCHAR(255) NULL,
        last_welcome_message_id INT NULL,
        added_by_tg_id          BIGINT NULL,
        added_by_name           VARCHAR(255) NULL,
        joined_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        left_at                 DATETIME NULL,
        last_activity_at        DATETIME NULL,
        created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_tg_group (integration_id, chat_id),
        KEY idx_tg_groups_agency (agency_id),
        CONSTRAINT fk_tg_groups_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_tg_groups_integration FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE CASCADE
      ) ${TABLE_OPTS}
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS telegram_group_members (
        id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
        agency_id          INT NOT NULL,
        group_id           INT NOT NULL,
        tg_user_id         BIGINT NOT NULL,
        first_name         VARCHAR(255) NULL,
        last_name          VARCHAR(255) NULL,
        username           VARCHAR(64) NULL,
        is_bot             TINYINT(1) NOT NULL DEFAULT 0,
        status             VARCHAR(20) NOT NULL DEFAULT 'member',
        warnings           INT NOT NULL DEFAULT 0,
        messages_count     INT NOT NULL DEFAULT 0,
        muted_until        DATETIME NULL,
        captcha_pending    TINYINT(1) NOT NULL DEFAULT 0,
        captcha_deadline   DATETIME NULL,
        captcha_message_id INT NULL,
        joined_at          DATETIME NULL,
        left_at            DATETIME NULL,
        last_message_at    DATETIME NULL,
        created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_tg_member (group_id, tg_user_id),
        KEY idx_tg_member_username (group_id, username),
        KEY idx_tg_member_captcha (captcha_pending, captcha_deadline),
        CONSTRAINT fk_tg_members_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_tg_members_group FOREIGN KEY (group_id) REFERENCES telegram_groups(id) ON DELETE CASCADE
      ) ${TABLE_OPTS}
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS telegram_group_join_requests (
        id                 INT AUTO_INCREMENT PRIMARY KEY,
        agency_id          INT NOT NULL,
        group_id           INT NOT NULL,
        tg_user_id         BIGINT NOT NULL,
        user_chat_id       BIGINT NULL,
        name               VARCHAR(255) NULL,
        username           VARCHAR(64) NULL,
        bio                VARCHAR(255) NULL,
        invite_link_name   VARCHAR(64) NULL,
        status             ENUM('PENDING','APPROVED','DECLINED','GONE') NOT NULL DEFAULT 'PENDING',
        requested_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        decided_at         DATETIME NULL,
        decided_by_user_id INT NULL,
        UNIQUE KEY uq_tg_join_request (group_id, tg_user_id),
        KEY idx_tg_join_requests_status (group_id, status),
        CONSTRAINT fk_tg_join_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_tg_join_group FOREIGN KEY (group_id) REFERENCES telegram_groups(id) ON DELETE CASCADE
      ) ${TABLE_OPTS}
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS telegram_group_logs (
        id          BIGINT AUTO_INCREMENT PRIMARY KEY,
        agency_id   INT NOT NULL,
        group_id    INT NOT NULL,
        action      VARCHAR(30) NOT NULL,
        tg_user_id  BIGINT NULL,
        user_name   VARCHAR(255) NULL,
        actor       VARCHAR(255) NULL,
        detail      VARCHAR(500) NULL,
        created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_tg_logs_group (group_id, id),
        CONSTRAINT fk_tg_logs_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_tg_logs_group FOREIGN KEY (group_id) REFERENCES telegram_groups(id) ON DELETE CASCADE
      ) ${TABLE_OPTS}
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS telegram_group_posts (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        agency_id     INT NOT NULL,
        group_id      INT NOT NULL,
        text          TEXT NOT NULL,
        buttons       JSON NULL,
        pin           TINYINT(1) NOT NULL DEFAULT 0,
        silent        TINYINT(1) NOT NULL DEFAULT 0,
        status        ENUM('SCHEDULED','SENT','FAILED','CANCELLED') NOT NULL DEFAULT 'SCHEDULED',
        scheduled_at  DATETIME NULL,
        sent_at       DATETIME NULL,
        message_id    INT NULL,
        error         VARCHAR(500) NULL,
        created_by    INT NULL,
        created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_tg_posts_due (status, scheduled_at),
        KEY idx_tg_posts_group (group_id, id),
        CONSTRAINT fk_tg_posts_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_tg_posts_group FOREIGN KEY (group_id) REFERENCES telegram_groups(id) ON DELETE CASCADE
      ) ${TABLE_OPTS}
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS telegram_group_invite_links (
        id                   INT AUTO_INCREMENT PRIMARY KEY,
        agency_id            INT NOT NULL,
        group_id             INT NOT NULL,
        invite_link          VARCHAR(255) NOT NULL,
        name                 VARCHAR(32) NULL,
        expire_at            DATETIME NULL,
        member_limit         INT NULL,
        creates_join_request TINYINT(1) NOT NULL DEFAULT 0,
        is_revoked           TINYINT(1) NOT NULL DEFAULT 0,
        joins                INT NOT NULL DEFAULT 0,
        created_by           INT NULL,
        created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_tg_invite_link (invite_link),
        KEY idx_tg_invite_group (group_id),
        CONSTRAINT fk_tg_invite_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_tg_invite_group FOREIGN KEY (group_id) REFERENCES telegram_groups(id) ON DELETE CASCADE
      ) ${TABLE_OPTS}
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS telegram_group_stats (
        group_id  INT NOT NULL,
        day       DATE NOT NULL,
        messages  INT NOT NULL DEFAULT 0,
        joins     INT NOT NULL DEFAULT 0,
        leaves    INT NOT NULL DEFAULT 0,
        actions   INT NOT NULL DEFAULT 0,
        PRIMARY KEY (group_id, day),
        CONSTRAINT fk_tg_stats_group FOREIGN KEY (group_id) REFERENCES telegram_groups(id) ON DELETE CASCADE
      ) ${TABLE_OPTS}
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS telegram_group_deletions (
        id          BIGINT AUTO_INCREMENT PRIMARY KEY,
        group_id    INT NOT NULL,
        message_id  INT NOT NULL,
        delete_at   DATETIME NOT NULL,
        KEY idx_tg_deletions_due (delete_at),
        CONSTRAINT fk_tg_deletions_group FOREIGN KEY (group_id) REFERENCES telegram_groups(id) ON DELETE CASCADE
      ) ${TABLE_OPTS}
    `);
    console.log("✅ telegram_groups + members, join requests, logs, posts, invite links, stats, deletions ready");

    // The module and its team keys existed as "saved only" — make sure they're there.
    await pool.query(
      "INSERT IGNORE INTO modules (`key`, display_name, module_type, category, is_active, sort_order) VALUES ('feature_telegram_group_manager', 'Telegram - Group Manager', 'feature', 'channels', 1, 60)"
    );
    const [bf] = await pool.query(
      "INSERT IGNORE INTO package_modules (package_id, module_key, is_enabled) SELECT id, 'feature_telegram_group_manager', 1 FROM packages"
    );
    if (bf.affectedRows) console.log(`   feature_telegram_group_manager enabled on ${bf.affectedRows} package(s) that had no row`);
    const PERMISSIONS = [
      ["telegram_group_manager.create", "Telegram - Group Manager: Post Announcements"],
      ["telegram_group_manager.update", "Telegram - Group Manager: Edit Rules & Settings"],
      ["telegram_group_manager.delete", "Telegram - Group Manager: Leave / Remove Group"],
      ["telegram_group_manager.special", "Telegram - Group Manager: Ban, Mute & Join Requests"],
    ];
    for (const [key, label] of PERMISSIONS) {
      await pool.query(
        `INSERT INTO permissions (permission_key, label, category, scope_type) VALUES (?, ?, 'Telegram', 'AGENCY')
         ON DUPLICATE KEY UPDATE label = VALUES(label)`,
        [key, label]
      );
    }
    const [roles] = await pool.query("SELECT id FROM roles WHERE agency_id IS NULL AND slug IN ('owner','super_admin','reseller_owner','manager')");
    for (const role of roles) {
      for (const [key] of PERMISSIONS) {
        await pool.query("INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)", [role.id, key]);
      }
    }
    console.log("✅ module + team-rule permissions registered");

    await recordMigration(pool, "migrate_telegram_groups.js");
    console.log("\n🎉 Telegram group management migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
