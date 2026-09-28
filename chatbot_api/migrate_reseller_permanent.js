/**
 * A Reseller is permanent (decided with the user, utils/accountTypeRules.js).
 *
 * The agencies tree trigger used to let a Reseller become another account
 * type once it had no customers left. Now no Reseller can change type — a
 * plan change by mistake must never strand its customers, their users or
 * their subscribers. Every other tree rule is unchanged (same body as
 * migrate_tenant_isolation.js, which now carries this rule too).
 *
 * Safe to re-run.
 * Run: node migrate_reseller_permanent.js   (or: npm run migrate)
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";

async function run() {
  try {
    await pool.query("DROP TRIGGER IF EXISTS trg_agencies_tree_bu");
    await pool.query(`
      CREATE TRIGGER trg_agencies_tree_bu BEFORE UPDATE ON agencies FOR EACH ROW
      BEGIN
        DECLARE parent_type VARCHAR(32);
        IF NEW.account_type = 'RESELLER_CUSTOMER' THEN
          IF NEW.parent_agency_id IS NULL THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant guard: a reseller customer must have a parent reseller';
          END IF;
          IF OLD.account_type = 'RESELLER_CUSTOMER' AND NOT (NEW.parent_agency_id <=> OLD.parent_agency_id) THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant guard: a customer cannot be moved to a different reseller';
          END IF;
          SELECT account_type INTO parent_type FROM agencies WHERE id = NEW.parent_agency_id;
          IF parent_type IS NULL OR parent_type <> 'RESELLER' THEN
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant guard: the parent of a reseller customer must be a reseller';
          END IF;
        ELSEIF NEW.parent_agency_id IS NOT NULL THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant guard: only reseller customers may have a parent workspace';
        END IF;
        -- A Reseller is permanent.
        IF OLD.account_type = 'RESELLER' AND NEW.account_type <> 'RESELLER' THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'tenant guard: a reseller cannot be changed to another account type';
        END IF;
      END`);
    console.log("✅ trg_agencies_tree_bu: a Reseller can no longer change account type");
    await recordMigration(pool, "migrate_reseller_permanent.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
