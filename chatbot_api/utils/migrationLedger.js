/**
 * A minimal migration ledger — closes the "36 standalone migrate_*.js
 * scripts, no record of which have run where" gap without touching any of
 * their existing logic. Each one stays exactly as it is (self-contained,
 * idempotent, run by hand); this just gives new migrations a one-line way
 * to record themselves after they run, and gives anyone checking a
 * deployment a real answer to "did migration X actually run here?" via
 * `SELECT * FROM schema_migrations`.
 *
 * Not a full migration framework — no automatic runner, no rollback, no
 * dependency ordering. Deliberately small: a ledger, not a rewrite.
 */
export async function ensureLedgerTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      name        VARCHAR(255) NOT NULL UNIQUE,
      applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

/** Call at the end of a migration's run() to record that it applied. Safe to re-run (INSERT IGNORE on the unique name). */
export async function recordMigration(conn, name) {
  await ensureLedgerTable(conn);
  await conn.query("INSERT IGNORE INTO schema_migrations (name) VALUES (?)", [name]);
}

export async function hasRun(conn, name) {
  await ensureLedgerTable(conn);
  const [[row]] = await conn.query("SELECT 1 AS x FROM schema_migrations WHERE name = ?", [name]);
  return !!row;
}
