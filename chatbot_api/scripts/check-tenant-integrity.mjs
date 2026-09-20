/**
 * Nightly tenant-integrity check: finds rows whose workspace disagrees with the
 * workspace of the thing they point at. Read-only. Exits 1 if anything is found,
 * so it can run from cron / CI.
 *
 * Run: npm run check:tenant
 */
import "dotenv/config";
import pool from "../db.js";

const checks = [];
const add = (label, sql, params = []) => checks.push({ label, sql, params });

add("users with no home workspace (excluding platform admins)",
  "SELECT id, email FROM users WHERE home_agency_id IS NULL AND role <> 'ADMIN'");
add("owners whose home workspace is not one they own",
  "SELECT u.id, u.email FROM users u WHERE u.home_agency_id IS NOT NULL AND EXISTS (SELECT 1 FROM agencies a WHERE a.owner_id = u.id) AND NOT EXISTS (SELECT 1 FROM agencies a2 WHERE a2.owner_id = u.id AND a2.id = u.home_agency_id)");
add("customers whose parent is missing or not a reseller",
  "SELECT a.id, a.name FROM agencies a LEFT JOIN agencies p ON p.id = a.parent_agency_id WHERE a.account_type = 'RESELLER_CUSTOMER' AND (p.id IS NULL OR p.account_type <> 'RESELLER')");
add("non-customer workspaces that have a parent",
  "SELECT id, name FROM agencies WHERE account_type <> 'RESELLER_CUSTOMER' AND parent_agency_id IS NOT NULL");
add("customer plans issued by a different reseller than the customer's own",
  "SELECT acs.id FROM agency_client_subscriptions acs JOIN agencies c ON c.id = acs.client_agency_id WHERE c.account_type = 'RESELLER_CUSTOMER' AND acs.agency_id <> c.parent_agency_id");
add("customer plans using another reseller's package",
  "SELECT acs.id FROM agency_client_subscriptions acs JOIN agency_packages p ON p.id = acs.package_id WHERE p.agency_id <> acs.agency_id");
add("team members whose profile workspace differs from their home workspace",
  "SELECT ap.id, ap.user_id FROM agent_profiles ap JOIN users u ON u.id = ap.user_id WHERE ap.agency_id IS NOT NULL AND u.home_agency_id IS NOT NULL AND ap.agency_id <> u.home_agency_id");

async function schemaDrivenChecks() {
  // Every single-column foreign key from one workspace-owned table to another
  // workspace-owned table: the two rows must belong to the same workspace.
  const [pairs] = await pool.query(`
    SELECT k.TABLE_NAME child, k.COLUMN_NAME col, k.REFERENCED_TABLE_NAME parent, k.REFERENCED_COLUMN_NAME pcol
    FROM information_schema.KEY_COLUMN_USAGE k
    WHERE k.TABLE_SCHEMA = DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL AND k.REFERENCED_TABLE_NAME <> 'agencies'
      AND EXISTS (SELECT 1 FROM information_schema.COLUMNS c WHERE c.TABLE_SCHEMA = k.TABLE_SCHEMA AND c.TABLE_NAME = k.TABLE_NAME AND c.COLUMN_NAME = 'agency_id')
      AND EXISTS (SELECT 1 FROM information_schema.COLUMNS c WHERE c.TABLE_SCHEMA = k.TABLE_SCHEMA AND c.TABLE_NAME = k.REFERENCED_TABLE_NAME AND c.COLUMN_NAME = 'agency_id')
      AND (SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE k2 WHERE k2.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND k2.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND k2.TABLE_NAME = k.TABLE_NAME) = 1
  `);
  for (const p of pairs) {
    add(`${p.child}.${p.col} points at a ${p.parent} row of another workspace`,
      `SELECT c.\`id\` FROM \`${p.child}\` c JOIN \`${p.parent}\` p ON p.\`${p.pcol}\` = c.\`${p.col}\` WHERE p.agency_id <> c.agency_id LIMIT 50`);
  }
}

await schemaDrivenChecks();
let bad = 0;
for (const c of checks) {
  let rows;
  try { [rows] = await pool.query(c.sql, c.params); }
  catch (err) { console.log(`  ?  ${c.label}: check could not run (${err.message.slice(0, 70)})`); continue; }
  if (rows.length) {
    bad += rows.length;
    console.log(`  x ${c.label}: ${rows.length}`, JSON.stringify(rows.slice(0, 5)));
  }
}
console.log(bad ? `\ntenant integrity: ${bad} problem row(s) found` : `\ntenant integrity: OK (${checks.length} checks)`);
await pool.end();
process.exit(bad ? 1 : 0);
