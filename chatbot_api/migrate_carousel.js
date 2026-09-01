import pool from "./db.js";

async function run() {
  const conn = await pool.getConnection();
  try {
    const [cols] = await conn.query("SHOW COLUMNS FROM whatsapp_templates");
    const colNames = cols.map((c) => c.Field);
    if (!colNames.includes("template_type")) {
      await conn.query("ALTER TABLE whatsapp_templates ADD COLUMN template_type VARCHAR(50) NOT NULL DEFAULT 'STANDARD' AFTER category");
      console.log("✅ Added template_type");
    }
    if (!colNames.includes("carousel_cards_json")) {
      await conn.query("ALTER TABLE whatsapp_templates ADD COLUMN carousel_cards_json LONGTEXT NULL AFTER buttons_json");
      console.log("✅ Added carousel_cards_json");
    }
    console.log("✅ Carousel migration finished");
    process.exit(0);
  } catch (err) {
    console.error("Migration error:", err.message);
    process.exit(1);
  } finally {
    conn.release();
  }
}

run();
