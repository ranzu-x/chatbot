import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

async function inspectAll() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
  });

  const [integs] = await conn.execute("SELECT id, agency_id, platform, name, wa_phone_number_id, wa_business_acc_id, fb_page_id, ig_account_id, is_active FROM integrations");
  console.log("=== INTEGRATIONS ===");
  console.log(integs);

  const [contacts] = await conn.execute("SELECT id, agency_id, platform, external_id, name, phone FROM contacts");
  console.log("\n=== CONTACTS ===");
  console.log(contacts);

  const [convs] = await conn.execute("SELECT cv.id, cv.agency_id, cv.contact_id, cv.integration_id, cv.status, cv.last_message_at, c.platform AS contactPlatform, c.name AS contactName, i.platform AS integPlatform, i.name AS integName FROM conversations cv LEFT JOIN contacts c ON c.id = cv.contact_id LEFT JOIN integrations i ON i.id = cv.integration_id");
  console.log("\n=== CONVERSATIONS ===");
  console.log(convs);

  const [msgs] = await conn.execute("SELECT id, conversation_id, direction, type, body, external_msg_id, created_at FROM messages ORDER BY id DESC LIMIT 10");
  console.log("\n=== RECENT MESSAGES ===");
  console.log(msgs);

  await conn.end();
}

inspectAll().catch(console.error);
