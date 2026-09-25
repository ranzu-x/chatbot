import pool from './db.js';
import { countryFromPhone } from './utils/country.js';

/**
 * Migration: subscriber source + earnings-by-country.
 *
 * contacts.source — how a subscriber came to exist:
 *   INCOMING    they messaged a bot / booked via a public page (the default)
 *   INTEGRATION created by an inbound webhook (Shopify, Zapier, …)
 *   IMPORT      CSV / Google Sheet import (POST /contacts/import)
 *   MANUAL      added one by one on the Subscribers page
 * Subscriber-gain statistics count only INCOMING + INTEGRATION.
 *
 * One-time backfill of existing rows (only when the column is first added —
 * re-running never re-classifies anyone). Best-effort, from what the data
 * shows, since the origin was never recorded:
 *   no external id                                 → INTEGRATION (webhook-created)
 *   no conversation at all                         → MANUAL
 *   has a conversation but has never written in    → IMPORT
 *   everything else                                → INCOMING
 *
 * invoices.country — ISO-3166 alpha-2, set when a payment is recorded
 * (utils/country.js). Existing invoices are backfilled from the paying
 * account owner's phone number where it has a country code.
 */
async function columnExists(table, column) {
  const [[row]] = await pool.query(
    'SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column]
  );
  return row.n > 0;
}

async function addIndex(table, name, cols) {
  const [[row]] = await pool.query(
    'SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
    [table, name]
  );
  if (row.n) { console.log(`ℹ️ ${table}.${name} already exists`); return; }
  await pool.query(`ALTER TABLE ${table} ADD INDEX ${name} (${cols})`);
  console.log(`✅ Added index ${table}.${name}`);
}

async function run() {
  console.log('Running subscriber source + earnings migration...');

  // ── contacts.source ──
  if (!(await columnExists('contacts', 'source'))) {
    await pool.query(
      "ALTER TABLE contacts ADD COLUMN source ENUM('INCOMING','INTEGRATION','IMPORT','MANUAL') NOT NULL DEFAULT 'INCOMING' AFTER platform"
    );
    console.log('✅ Added contacts.source — backfilling existing subscribers once');

    const [a] = await pool.query("UPDATE contacts SET source = 'INTEGRATION' WHERE external_id IS NULL OR external_id = ''");
    const [b] = await pool.query(
      `UPDATE contacts c SET c.source = 'MANUAL'
       WHERE c.source = 'INCOMING' AND NOT EXISTS (SELECT 1 FROM conversations cv WHERE cv.contact_id = c.id)`
    );
    const [c] = await pool.query(
      `UPDATE contacts c SET c.source = 'IMPORT'
       WHERE c.source = 'INCOMING'
         AND EXISTS (SELECT 1 FROM conversations cv WHERE cv.contact_id = c.id)
         AND NOT EXISTS (SELECT 1 FROM conversations cv WHERE cv.contact_id = c.id AND cv.last_inbound_at IS NOT NULL)
         AND NOT EXISTS (
           SELECT 1 FROM conversations cv JOIN messages m ON m.conversation_id = cv.id
           WHERE cv.contact_id = c.id AND m.direction = 'INBOUND'
         )`
    );
    console.log(`   INTEGRATION ${a.affectedRows}, MANUAL ${b.affectedRows}, IMPORT ${c.affectedRows} (the rest stay INCOMING)`);
  } else {
    console.log('ℹ️ contacts.source already exists — backfill skipped');
  }
  await addIndex('contacts', 'idx_contacts_agency_source_created', 'agency_id, source, created_at');
  await addIndex('contacts', 'idx_contacts_source_created', 'source, created_at');

  // ── invoices.country ──
  if (!(await columnExists('invoices', 'country'))) {
    await pool.query('ALTER TABLE invoices ADD COLUMN country CHAR(2) NULL AFTER currency');
    console.log('✅ Added invoices.country');
  }
  await addIndex('invoices', 'idx_invoices_status_paid', 'status, paid_at');

  const [missing] = await pool.query(
    `SELECT i.id, COALESCE(owner.phone, u.phone) AS phone
     FROM invoices i
     LEFT JOIN agencies a ON a.id = i.agency_id
     LEFT JOIN users owner ON owner.id = a.owner_id
     LEFT JOIN users u ON u.id = i.user_id
     WHERE i.country IS NULL`
  );
  let filled = 0;
  for (const row of missing) {
    const country = countryFromPhone(row.phone);
    if (!country) continue;
    await pool.query('UPDATE invoices SET country = ? WHERE id = ? AND country IS NULL', [country, row.id]);
    filled++;
  }
  console.log(`✅ Invoice countries backfilled from owner phone: ${filled} of ${missing.length} without one`);

  // ── Dashboard aggregate helpers ──
  await addIndex('broadcast_campaigns', 'idx_broadcast_agency_status', 'agency_id, status');
  await addIndex('flow_webhook_logs', 'idx_flow_webhook_logs_agency_created', 'agency_id, created_at');

  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
