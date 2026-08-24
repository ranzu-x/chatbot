import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection({
  host: process.env.DB_HOST, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  multipleStatements: true,
});

const sql = `
CREATE TABLE IF NOT EXISTS flows (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  agency_id        INT NOT NULL,
  bot_id           INT NULL,
  name             VARCHAR(200) NOT NULL,
  platform         ENUM('WHATSAPP','FACEBOOK','INSTAGRAM','TELEGRAM','WEBCHAT') NOT NULL,
  trigger_keyword  VARCHAR(300) NULL COMMENT 'keyword that starts this flow; NULL = default flow',
  trigger_type     ENUM('KEYWORD','ANY','FIRST_CONTACT','POSTBACK') NOT NULL DEFAULT 'KEYWORD',
  nodes_json       LONGTEXT NULL,
  edges_json       LONGTEXT NULL,
  is_active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_flow_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_flow_bot    FOREIGN KEY (bot_id)    REFERENCES bots(id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Flows table created!' AS result;
`;

try {
  await conn.query(sql);
  console.log('✅ Flows table created!');
} catch(e) { console.error('❌', e.message); }
finally { await conn.end(); }
