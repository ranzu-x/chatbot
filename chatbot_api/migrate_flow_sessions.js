import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection({
  host: process.env.DB_HOST, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  multipleStatements: true,
});

const sql = `
CREATE TABLE IF NOT EXISTS flow_sessions (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  agency_id        INT NOT NULL,
  conversation_id  INT NOT NULL,
  flow_id          INT NOT NULL,
  current_node_id  VARCHAR(100) NULL,
  variables        JSON NULL,
  status           ENUM('ACTIVE','COMPLETED','EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_flow_sess_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_flow_sess_conv   FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_flow_sess_flow   FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SELECT 'Flow sessions table created!' AS result;
`;

try {
  await conn.query(sql);
  console.log('✅ Flow sessions table created!');
} catch(e) { console.error('❌', e.message); }
finally { await conn.end(); }
