/**
 * Migration: FULLTEXT indexes backing utils/searchQuery.js.
 *
 * Every search box used to run `LIKE '%term%'` with no ranking. searchQuery.js
 * replaces that with tokenised, ranked FULLTEXT matching — which needs an
 * index per column-set it matches on.
 *
 * Tables are skipped when absent: not every deployment has run every feature
 * migration (blog and templates in particular), and a missing table must not
 * fail the whole run. searchQuery.js checks which indexes actually exist at
 * runtime and degrades to LIKE-only for anything missing, so partial
 * application here is safe.
 *
 * Safe to re-run.
 * Run: node migrate_search_indexes.js
 */
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

// [table, indexName, columns]
const INDEXES = [
  ["contacts", "ft_contacts_search", "name, email"],
  ["users", "ft_users_search", "name, email"],
  ["blog_posts", "ft_blog_posts_search", "title, excerpt, content"],
  ["support_tickets", "ft_tickets_search", "subject"],
  ["appointments", "ft_appointments_search", "customer_name, service_name"],
  ["templates", "ft_templates_search", "template_name, body_text"],
  ["flows", "ft_flows_search", "name"],
  ["broadcast_campaigns", "ft_broadcasts_search", "name"],
];

async function run() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`USE \`${dbName}\``);
    console.log(`\nRunning search-index migration on database: ${dbName}\n`);

    for (const [table, indexName, columns] of INDEXES) {
      const [[exists]] = await conn.query(
        `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [dbName, table]
      );
      if (!exists) {
        console.log(`skip: table ${table} does not exist here`);
        continue;
      }

      const [[haveIndex]] = await conn.query(
        `SELECT INDEX_NAME FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
        [dbName, table, indexName]
      );
      if (haveIndex) {
        console.log(`skip: ${table}.${indexName} already exists`);
        continue;
      }

      // Every listed column must exist — a table can legitimately predate the
      // feature migration that added one of them.
      const wanted = columns.split(",").map((c) => c.trim());
      const [cols] = await conn.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [dbName, table]
      );
      const have = new Set(cols.map((c) => c.COLUMN_NAME.toLowerCase()));
      const missing = wanted.filter((c) => !have.has(c.toLowerCase()));
      if (missing.length) {
        console.log(`skip: ${table} is missing column(s) ${missing.join(", ")}`);
        continue;
      }

      try {
        await conn.query(`ALTER TABLE \`${table}\` ADD FULLTEXT \`${indexName}\` (${columns})`);
        console.log(`added: ${table}.${indexName} (${columns})`);
      } catch (err) {
        console.warn(`warn: could not add ${table}.${indexName} — ${err.message}`);
      }
    }

    console.log("\nDone.\n");
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
