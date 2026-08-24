import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection({
  host: process.env.DB_HOST, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  multipleStatements: true,
});

const sql = `
CREATE TABLE IF NOT EXISTS sequences (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  agency_id   INT NOT NULL,
  name        VARCHAR(200) NOT NULL,
  platform    ENUM('WHATSAPP','FACEBOOK','INSTAGRAM','TELEGRAM','WEBCHAT') NOT NULL DEFAULT 'WHATSAPP',
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_seq_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sequence_items (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  sequence_id   INT NOT NULL,
  delay_minutes INT NOT NULL DEFAULT 0,
  message_body  TEXT NOT NULL,
  template_id   INT NULL,
  step_number   INT NOT NULL DEFAULT 1,
  CONSTRAINT fk_sitem_seq FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sequence_subscribers (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  sequence_id   INT NOT NULL,
  contact_id    INT NOT NULL,
  current_step  INT NOT NULL DEFAULT 1,
  next_run_at   DATETIME NOT NULL,
  status        ENUM('ACTIVE','COMPLETED','PAUSED') NOT NULL DEFAULT 'ACTIVE',
  subscribed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ssub_seq FOREIGN KEY (sequence_id) REFERENCES sequences(id) ON DELETE CASCADE,
  CONSTRAINT fk_ssub_cnt FOREIGN KEY (contact_id)  REFERENCES contacts(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Drip sequences tables created!' AS result;
`;

try {
  await conn.query(sql);
  console.log('✅ Drip sequences tables created!');
} catch(e) { console.error('❌', e.message); }
finally { await conn.end(); }
