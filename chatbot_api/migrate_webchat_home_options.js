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

async function columnExists(conn, table, column) {
  const [[row]] = await conn.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  return Boolean(row);
}

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\n🏗️  Running webchat-home-options migration on database: ${dbName}\n`);

    const additions = [
      { column: "home_title", ddl: "ADD COLUMN home_title VARCHAR(150) NULL DEFAULT 'Welcome!' AFTER prefill_message" },
      { column: "home_subtitle", ddl: "ADD COLUMN home_subtitle VARCHAR(255) NULL DEFAULT 'How can we help?' AFTER home_title" },
      { column: "reply_time_text", ddl: "ADD COLUMN reply_time_text VARCHAR(150) NULL DEFAULT 'We typically reply within a few minutes' AFTER home_subtitle" },
      { column: "start_conversation_text", ddl: "ADD COLUMN start_conversation_text VARCHAR(100) NULL DEFAULT 'Start a conversation' AFTER reply_time_text" },
      { column: "chatbot_cards", ddl: "ADD COLUMN chatbot_cards JSON NULL AFTER start_conversation_text" },
    ];

    for (const { column, ddl } of additions) {
      if (await columnExists(conn, "webchat_widgets", column)) {
        console.log(`⏭️  webchat_widgets.${column} already exists`);
      } else {
        await conn.query(`ALTER TABLE webchat_widgets ${ddl}`);
        console.log(`✅ webchat_widgets.${column} added`);
      }
    }

    console.log("\n Migration completed successfully!\n");
  } catch (err) {
    console.error("Migration failed:", err);
  } finally {
    conn.release();
    process.exit(0);
  }
}

run();
