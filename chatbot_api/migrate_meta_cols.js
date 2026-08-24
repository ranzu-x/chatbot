import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

try {
  await conn.execute(`ALTER TABLE meta_app_settings 
    ADD COLUMN app_name VARCHAR(200) NULL,
    ADD COLUMN site_url VARCHAR(500) NULL,
    ADD COLUMN privacy_url VARCHAR(500) NULL,
    ADD COLUMN tos_url VARCHAR(500) NULL,
    ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1`);
  console.log('✅ Columns added');
} catch (e) {
  if (e.code === 'ER_DUP_FIELDNAME') console.log('✅ Columns already exist');
  else throw e;
} finally { await conn.end(); }
