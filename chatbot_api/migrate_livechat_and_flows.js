import pool from "./db.js";

async function runMigration() {
  console.log("Starting Live Chat & Flow Builder database migration...");
  const conn = await pool.getConnection();

  try {
    // 1. Add tags and bot_paused to contacts if not existing
    try {
      await conn.query("ALTER TABLE contacts ADD COLUMN tags JSON NULL");
      console.log("✅ Added tags column to contacts");
    } catch (e) {
      if (!e.message.includes("Duplicate column name")) {
        console.warn("Notice on contacts tags:", e.message);
      }
    }

    try {
      await conn.query("ALTER TABLE contacts ADD COLUMN bot_paused TINYINT(1) NOT NULL DEFAULT 0");
      console.log("✅ Added bot_paused column to contacts");
    } catch (e) {
      if (!e.message.includes("Duplicate column name")) {
        console.warn("Notice on contacts bot_paused:", e.message);
      }
    }

    // 2. Add bot_paused to conversations if not existing
    try {
      await conn.query("ALTER TABLE conversations ADD COLUMN bot_paused TINYINT(1) NOT NULL DEFAULT 0");
      console.log("✅ Added bot_paused column to conversations");
    } catch (e) {
      if (!e.message.includes("Duplicate column name")) {
        console.warn("Notice on conversations bot_paused:", e.message);
      }
    }

    // 3. Create contact_notes table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS contact_notes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        agency_id INT NOT NULL,
        contact_id INT NOT NULL,
        user_id INT NULL,
        author_name VARCHAR(150) NULL,
        note TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_cn_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_cn_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ Created contact_notes table");

    console.log("🎉 Migration completed successfully!");
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    conn.release();
    process.exit(0);
  }
}

runMigration();
