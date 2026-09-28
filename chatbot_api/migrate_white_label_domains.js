/**
 * White-label domains (Cloudflare for SaaS) + sign-up default package.
 *
 * agencies — a reseller's custom domain is a Cloudflare "custom hostname" on
 * the platform's zone (utils/cloudflareSaas.js):
 *   cf_hostname_id       Cloudflare custom hostname id
 *   domain_status        NONE | PENDING | ACTIVE | FAILED (hostname + SSL together)
 *   domain_ssl_status    Cloudflare's SSL status (pending_validation, active, …)
 *   domain_dns_records   JSON — the DNS records shown to the reseller
 *   domain_error         last verification error from Cloudflare, if any
 *   domain_checked_at    last status check
 * Logos / favicon live in the existing agencies.custom_branding JSON
 * (logoUrl, logoIconUrl, faviconUrl).
 *
 * packages — `is_default` is the default package of its type (the editor
 * keeps one per type). This database had drifted to several END_USER
 * defaults; the cheapest one is kept, because it is the package every new
 * self-signup now starts on (utils/signupPackage.js).
 *
 * Safe to re-run. Run: node migrate_white_label_domains.js (or npm run migrate)
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";

async function addColumn(table, column, ddl) {
  try {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    console.log(`✅ Added ${table}.${column}`);
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME") console.log(`ℹ️ ${table}.${column} already exists`);
    else throw e;
  }
}

async function run() {
  try {
    await addColumn("agencies", "cf_hostname_id", "VARCHAR(64) NULL");
    await addColumn("agencies", "domain_status", "VARCHAR(20) NOT NULL DEFAULT 'NONE'");
    await addColumn("agencies", "domain_ssl_status", "VARCHAR(40) NULL");
    await addColumn("agencies", "domain_dns_records", "JSON NULL");
    await addColumn("agencies", "domain_error", "VARCHAR(500) NULL");
    await addColumn("agencies", "domain_checked_at", "DATETIME NULL");

    // Domains verified the old way (DNS lookup) keep working as ACTIVE.
    await pool.query("UPDATE agencies SET domain_status = 'ACTIVE' WHERE custom_domain IS NOT NULL AND domain_verified = 1 AND domain_status = 'NONE'");
    await pool.query("UPDATE agencies SET domain_status = 'PENDING' WHERE custom_domain IS NOT NULL AND domain_verified = 0 AND domain_status = 'NONE'");

    const [defaults] = await pool.query(
      "SELECT id, name, price FROM packages WHERE type = 'END_USER' AND is_default = 1 ORDER BY price ASC, id ASC"
    );
    if (defaults.length > 1) {
      const keep = defaults[0];
      await pool.query("UPDATE packages SET is_default = 0 WHERE type = 'END_USER' AND is_default = 1 AND id <> ?", [keep.id]);
      console.log(`✅ END_USER default package: kept "${keep.name}" (#${keep.id}), cleared ${defaults.length - 1} other default(s)`);
    } else if (!defaults.length) {
      const [[cheapest]] = await pool.query("SELECT id, name FROM packages WHERE type = 'END_USER' AND is_active = 1 ORDER BY price ASC, id ASC LIMIT 1");
      if (cheapest) {
        await pool.query("UPDATE packages SET is_default = 1 WHERE id = ?", [cheapest.id]);
        console.log(`✅ END_USER default package set to "${cheapest.name}" (#${cheapest.id})`);
      } else {
        console.log("⚠️ No END_USER package exists — create one and mark it default in Packages & Modules");
      }
    } else {
      console.log(`ℹ️ END_USER default package: "${defaults[0].name}" (#${defaults[0].id})`);
    }

    await recordMigration(pool, "migrate_white_label_domains.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
