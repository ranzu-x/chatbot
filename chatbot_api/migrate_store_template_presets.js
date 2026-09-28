/**
 * Default store-automation WhatsApp templates (utils/storeTemplatePresets.js).
 *
 *   whatsapp_templates.preset_key — which built-in store template a row is
 *   (ORDER_CREATED, COD_VERIFICATION, ABANDONED_CART, ORDER_PAID, …), so the
 *   Commerce campaign editor can pick the right template for a trigger and
 *   the template manager can show which defaults already exist. NULL for
 *   every template the customer wrote themselves.
 *
 * Safe to re-run.
 * Run: node migrate_store_template_presets.js   (or: npm run migrate)
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";

async function run() {
  try {
    try {
      await pool.query("ALTER TABLE whatsapp_templates ADD COLUMN preset_key VARCHAR(40) NULL");
      console.log("✅ Added whatsapp_templates.preset_key");
    } catch (e) {
      if (e.code === "ER_DUP_FIELDNAME") console.log("ℹ️ whatsapp_templates.preset_key already exists");
      else throw e;
    }
    try {
      await pool.query("ALTER TABLE whatsapp_templates ADD KEY idx_wa_templates_preset (integration_id, preset_key)");
      console.log("✅ Added index idx_wa_templates_preset");
    } catch (e) {
      if (e.code === "ER_DUP_KEYNAME") console.log("ℹ️ idx_wa_templates_preset already exists");
      else throw e;
    }
    await recordMigration(pool, "migrate_store_template_presets.js");
    console.log("\n🎉 Store template presets migration complete.\n");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
