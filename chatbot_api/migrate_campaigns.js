import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection({
  host: process.env.DB_HOST, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  multipleStatements: true,
});

const sql = `
CREATE TABLE IF NOT EXISTS campaigns (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  agency_id              INT NOT NULL,
  name                   VARCHAR(200) NOT NULL,
  platform               ENUM('WHATSAPP','FACEBOOK','INSTAGRAM','TELEGRAM','WEBCHAT') NOT NULL DEFAULT 'WHATSAPP',
  template_id            INT NULL,
  message_body           TEXT NULL,
  target_platform_filter VARCHAR(50) NULL,
  total_contacts         INT NOT NULL DEFAULT 0,
  sent_count             INT NOT NULL DEFAULT 0,
  delivered_count        INT NOT NULL DEFAULT 0,
  failed_count           INT NOT NULL DEFAULT 0,
  status                 ENUM('DRAFT','SCHEDULED','PROCESSING','COMPLETED','FAILED') NOT NULL DEFAULT 'DRAFT',
  scheduled_at           DATETIME NULL,
  created_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_camp_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS campaign_logs (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  campaign_id   INT NOT NULL,
  contact_id    INT NOT NULL,
  status        ENUM('PENDING','SENT','FAILED') NOT NULL DEFAULT 'PENDING',
  error_message TEXT NULL,
  sent_at       DATETIME NULL,
  CONSTRAINT fk_clog_camp FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
  CONSTRAINT fk_clog_cnt  FOREIGN KEY (contact_id)  REFERENCES contacts(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Campaigns tables created!' AS result;
`;

try {
  await conn.query(sql);
  console.log('✅ Campaigns tables created!');
} catch(e) { console.error('❌', e.message); }
finally { await conn.end(); }
