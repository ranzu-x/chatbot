import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection({
  host: process.env.DB_HOST, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  multipleStatements: true,
});

const sql = `
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  agency_id         INT NOT NULL,
  integration_id    INT NULL,
  template_name     VARCHAR(200) NOT NULL,
  language          VARCHAR(20) NOT NULL DEFAULT 'en_US',
  category          ENUM('MARKETING','UTILITY','AUTHENTICATION') NOT NULL DEFAULT 'MARKETING',
  header_type       ENUM('NONE','TEXT','IMAGE','DOCUMENT','VIDEO') NOT NULL DEFAULT 'NONE',
  header_text       TEXT NULL,
  body_text         TEXT NOT NULL,
  footer_text       VARCHAR(255) NULL,
  buttons_json      JSON NULL,
  status            ENUM('APPROVED','PENDING','REJECTED') NOT NULL DEFAULT 'PENDING',
  meta_template_id  VARCHAR(200) NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_wa_tpl_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_wa_tpl_integ  FOREIGN KEY (integration_id) REFERENCES integrations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'WhatsApp templates table created!' AS result;
`;

try {
  await conn.query(sql);
  console.log('✅ WhatsApp templates table created!');
} catch(e) { console.error('❌', e.message); }
finally { await conn.end(); }
