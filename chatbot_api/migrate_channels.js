/**
 * DB Migration — Omnichannel Expansion
 * Run: node migrate_channels.js
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

const sql = `
USE \`${process.env.DB_NAME}\`;

-- ─── Expand platform ENUM to include TELEGRAM and WEBCHAT ─────────
ALTER TABLE integrations
  MODIFY COLUMN platform ENUM('WHATSAPP','FACEBOOK','INSTAGRAM','TELEGRAM','WEBCHAT') NOT NULL;

ALTER TABLE contacts
  MODIFY COLUMN platform ENUM('WHATSAPP','FACEBOOK','INSTAGRAM','TELEGRAM','WEBCHAT') NOT NULL;

ALTER TABLE conversations
  ADD COLUMN channel_type ENUM('WHATSAPP','FACEBOOK','INSTAGRAM','TELEGRAM','WEBCHAT') NULL;

-- ─── META APP SETTINGS (per agency) ──────────────────────────────
CREATE TABLE IF NOT EXISTS meta_app_settings (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  agency_id         INT NOT NULL UNIQUE,
  app_id            VARCHAR(200),
  app_secret        VARCHAR(500),
  verify_token      VARCHAR(255),
  webhook_url       VARCHAR(500),
  is_configured     TINYINT(1) NOT NULL DEFAULT 0,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_meta_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── BOTS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bots (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  agency_id        INT NOT NULL,
  integration_id   INT,
  name             VARCHAR(200) NOT NULL,
  platform         ENUM('WHATSAPP','FACEBOOK','INSTAGRAM','TELEGRAM','WEBCHAT') NOT NULL,
  is_active        TINYINT(1) NOT NULL DEFAULT 1,
  welcome_message  TEXT,
  away_message     TEXT,
  collect_email    TINYINT(1) NOT NULL DEFAULT 0,
  collect_phone    TINYINT(1) NOT NULL DEFAULT 0,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bot_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_bot_integ  FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── BOT RULES (keyword auto-replies) ────────────────────────────
CREATE TABLE IF NOT EXISTS bot_rules (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  bot_id           INT NOT NULL,
  trigger_keyword  VARCHAR(300) NOT NULL,
  reply_message    TEXT NOT NULL,
  is_exact_match   TINYINT(1) NOT NULL DEFAULT 0,
  sort_order       INT NOT NULL DEFAULT 0,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_rule_bot FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── WEBCHAT WIDGETS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webchat_widgets (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  agency_id        INT NOT NULL,
  integration_id   INT,
  name             VARCHAR(200) NOT NULL,
  widget_key       VARCHAR(100) NOT NULL UNIQUE,
  primary_color    VARCHAR(20) NOT NULL DEFAULT '#6366f1',
  greeting_message TEXT,
  placeholder_text VARCHAR(300) DEFAULT 'Type a message…',
  allowed_domains  TEXT,
  is_active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_webchat_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── TELEGRAM BOTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_bots (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  agency_id        INT NOT NULL,
  integration_id   INT,
  bot_token        VARCHAR(500) NOT NULL,
  bot_username     VARCHAR(200),
  bot_name         VARCHAR(200),
  webhook_set      TINYINT(1) NOT NULL DEFAULT 0,
  is_active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tgbot_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Migration completed successfully!' AS result;
`;

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("🏗️  Running omnichannel migration...");
    await conn.query(sql);
    console.log("✅ Migration completed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    conn.release();
  }
}

run();
