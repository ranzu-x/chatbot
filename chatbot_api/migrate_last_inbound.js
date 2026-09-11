import pool from "./db.js";

async function run() {
  const [cols] = await pool.query("SHOW COLUMNS FROM conversations LIKE 'last_inbound_at'");
  if (cols.length === 0) {
    await pool.query("ALTER TABLE conversations ADD COLUMN last_inbound_at DATETIME NULL AFTER last_message_at");
    console.log("Added last_inbound_at column to conversations");
  } else {
    console.log("last_inbound_at column already exists");
  }

  await pool.query(`
    UPDATE conversations cv 
    SET last_inbound_at = (
      SELECT MAX(created_at) 
      FROM messages 
      WHERE conversation_id = cv.id AND direction = 'INBOUND'
    )
  `);
  console.log("Backfilled last_inbound_at on all conversations");

  const [rows] = await pool.query("SELECT id, last_message_at, last_inbound_at FROM conversations ORDER BY id DESC LIMIT 5");
  console.log("Recent conversations:", rows);
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
