/**
 * Run this once to create all database tables.
 * node create_tables.js
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

const sql = `
CREATE DATABASE IF NOT EXISTS \`${dbName}\`;
USE \`${dbName}\`;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS contacts;
DROP TABLE IF EXISTS integrations;
DROP TABLE IF EXISTS agent_profiles;
DROP TABLE IF EXISTS agencies;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS quick_replies;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE IF NOT EXISTS users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  email      VARCHAR(255) NOT NULL UNIQUE,
  password   VARCHAR(255) NOT NULL,
  role       ENUM('ADMIN','AGENCY','AGENT') NOT NULL DEFAULT 'AGENT',
  avatar     VARCHAR(500),
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agencies (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  slug       VARCHAR(200) NOT NULL UNIQUE,
  logo       VARCHAR(500),
  website    VARCHAR(500),
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  owner_id   INT NOT NULL UNIQUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_agency_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_profiles (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL UNIQUE,
  agency_id  INT NOT NULL,
  is_online  TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ap_user   FOREIGN KEY (user_id)   REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_ap_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS integrations (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  agency_id           INT NOT NULL,
  platform            ENUM('WHATSAPP','FACEBOOK','INSTAGRAM') NOT NULL,
  name                VARCHAR(200) NOT NULL,
  is_active           TINYINT(1) NOT NULL DEFAULT 1,
  access_token        TEXT,
  verify_token        VARCHAR(255),
  wa_phone_number_id  VARCHAR(100),
  wa_business_acc_id  VARCHAR(100),
  fb_page_id          VARCHAR(100),
  fb_page_name        VARCHAR(200),
  ig_account_id       VARCHAR(100),
  ig_username         VARCHAR(200),
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_integ_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contacts (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  agency_id   INT NOT NULL,
  platform    ENUM('WHATSAPP','FACEBOOK','INSTAGRAM') NOT NULL,
  external_id VARCHAR(200) NOT NULL,
  name        VARCHAR(200),
  phone       VARCHAR(50),
  email       VARCHAR(255),
  avatar      VARCHAR(500),
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_contact_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  UNIQUE KEY uq_contact (agency_id, platform, external_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversations (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  agency_id        INT NOT NULL,
  contact_id       INT NOT NULL,
  integration_id   INT NOT NULL,
  assigned_to_id   INT,
  status           ENUM('OPEN','ASSIGNED','RESOLVED','PENDING') NOT NULL DEFAULT 'OPEN',
  unread_count     INT NOT NULL DEFAULT 0,
  last_message_at  DATETIME,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_conv_agency    FOREIGN KEY (agency_id)      REFERENCES agencies(id)       ON DELETE CASCADE,
  CONSTRAINT fk_conv_contact   FOREIGN KEY (contact_id)     REFERENCES contacts(id),
  CONSTRAINT fk_conv_integ     FOREIGN KEY (integration_id) REFERENCES integrations(id),
  CONSTRAINT fk_conv_agent     FOREIGN KEY (assigned_to_id) REFERENCES agent_profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id  INT NOT NULL,
  direction        ENUM('INBOUND','OUTBOUND') NOT NULL,
  type             ENUM('TEXT','IMAGE','AUDIO','VIDEO','DOCUMENT','TEMPLATE') NOT NULL DEFAULT 'TEXT',
  body             TEXT,
  media_url        VARCHAR(1000),
  media_caption    TEXT,
  external_msg_id  VARCHAR(200) UNIQUE,
  is_read          TINYINT(1) NOT NULL DEFAULT 0,
  sent_at          DATETIME,
  delivered_at     DATETIME,
  read_at          DATETIME,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_msg_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quick_replies (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  agency_id  INT NOT NULL,
  title      VARCHAR(200) NOT NULL,
  body       TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("🏗️  Creating tables...");
    await conn.query(sql);
    console.log("✅ All tables created successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Error creating tables:", err.message);
    process.exit(1);
  } finally {
    conn.release();
  }
}

run();
