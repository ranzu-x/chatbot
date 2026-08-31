import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();
async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL || {
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  const [rows] = await conn.execute("SHOW COLUMNS FROM integrations LIKE 'wa_display_phone'");
  if (rows.length > 0) {
    console.log('Column wa_display_phone already exists');
  } else {
    await conn.execute("ALTER TABLE integrations ADD COLUMN wa_display_phone VARCHAR(50) DEFAULT NULL AFTER wa_phone_number_id");
    console.log('Column wa_display_phone added successfully');
  }
  await conn.end();
}
main().catch(console.error);
