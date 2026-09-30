/**
 * Marketing Messages budget fix (utils/messengerMarketing.js):
 *
 *   mm_accounts.ad_account_currency    the billed ad account's currency (Meta
 *                                      budgets are in its smallest unit — cents
 *                                      for USD, whole units for JPY, VND, IDR…)
 *   mm_campaigns.daily_budget_amount   the daily budget as the person typed it,
 *                                      in whole currency units; converted with
 *                                      the ad account's offset only when Meta's
 *                                      message campaign is created. Backfilled
 *                                      from the old daily_budget (stored ×100).
 *
 * Safe to re-run.
 * Run: node migrate_mm_budget_currency.js   (or: npm run migrate)
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";

async function columnExists(table, column) {
  const [rows] = await pool.query(
    "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column]
  );
  return rows.length > 0;
}

async function run() {
  try {
    if (!(await columnExists("mm_accounts", "ad_account_currency"))) {
      await pool.query("ALTER TABLE mm_accounts ADD COLUMN ad_account_currency VARCHAR(8) NULL AFTER ad_account_name");
      console.log("✅ mm_accounts.ad_account_currency added");
    }
    if (!(await columnExists("mm_campaigns", "daily_budget_amount"))) {
      await pool.query("ALTER TABLE mm_campaigns ADD COLUMN daily_budget_amount DECIMAL(14,2) NULL AFTER daily_budget");
      const [r] = await pool.query("UPDATE mm_campaigns SET daily_budget_amount = daily_budget / 100 WHERE daily_budget IS NOT NULL");
      console.log(`✅ mm_campaigns.daily_budget_amount added (${r.affectedRows} backfilled)`);
    }
    await recordMigration(pool, "migrate_mm_budget_currency.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
