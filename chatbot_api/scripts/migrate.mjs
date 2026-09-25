/**
 * Migration runner — applies every migrate_*.js script that isn't recorded in
 * `schema_migrations` yet, in the fixed order of migrations.json, and records
 * each one after it succeeds. Stops at the first failure.
 *
 *   npm run migrate                       apply everything pending
 *   npm run migrate -- --status           list pending scripts, change nothing
 *   npm run migrate -- --mark-applied a.js b.js   record without running
 *   npm run migrate -- --mark-applied all          (for a DB where the scripts
 *                                                   were already run by hand)
 *
 * New migration: create migrate_<name>.js (idempotent, exits non-zero on
 * failure) and append it to the END of `order` in migrations.json. The
 * runner refuses to start while a migrate_*.js file is missing from the
 * manifest. Scripts under `manual` are never auto-run (destructive / one-off).
 *
 * A fresh database: import schema.sql first, then `npm run migrate`.
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import pool from "../db.js";
import { ensureLedgerTable } from "../utils/migrationLedger.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const statusOnly = args.includes("--status") || args.includes("--dry-run");
const markIdx = args.indexOf("--mark-applied");

// Some scripts recorded themselves without the ".js" suffix — treat both as one.
const norm = (name) => (name.endsWith(".js") ? name : `${name}.js`);

function loadManifest() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "migrations.json"), "utf8"));
  const order = manifest.order || [];
  const manual = manifest.manual || {};
  const files = fs.readdirSync(ROOT).filter((f) => /^migrate_.*\.js$/.test(f));
  const listed = new Set(order);
  const unlisted = files.filter((f) => !listed.has(f));
  const missing = order.filter((f) => !files.includes(f));
  const dupes = order.filter((f, i) => order.indexOf(f) !== i);
  if (unlisted.length || missing.length || dupes.length) {
    if (unlisted.length) console.error(`Not in migrations.json (append them to "order"):\n  ${unlisted.join("\n  ")}`);
    if (missing.length) console.error(`Listed in migrations.json but no such file:\n  ${missing.join("\n  ")}`);
    if (dupes.length) console.error(`Listed twice in migrations.json:\n  ${dupes.join("\n  ")}`);
    process.exit(1);
  }
  return { order, manual };
}

async function applied() {
  await ensureLedgerTable(pool);
  const [rows] = await pool.query("SELECT name FROM schema_migrations");
  return new Set(rows.map((r) => norm(r.name)));
}

async function record(name) {
  await pool.query("INSERT IGNORE INTO schema_migrations (name) VALUES (?)", [name]);
}

async function main() {
  const { order, manual } = loadManifest();
  const done = await applied();
  const pending = order.filter((f) => !done.has(f));
  const auto = pending.filter((f) => !manual[f]);
  const manualPending = pending.filter((f) => manual[f]);

  if (markIdx !== -1) {
    const names = args.slice(markIdx + 1).filter((a) => !a.startsWith("--"));
    const targets = names.includes("all") ? auto : names.map(norm);
    const unknown = targets.filter((t) => !order.includes(t));
    if (!targets.length || unknown.length) {
      console.error(unknown.length ? `Unknown migration(s): ${unknown.join(", ")}` : "Name the scripts to mark, or 'all'.");
      process.exit(1);
    }
    for (const t of targets) await record(t);
    console.log(`Recorded ${targets.length} migration(s) as applied without running them.`);
    return;
  }

  if (manualPending.length) {
    console.log("Manual-only (never auto-run; run by hand if needed, then --mark-applied):");
    for (const f of manualPending) console.log(`  ${f} — ${manual[f]}`);
    console.log("");
  }
  if (!auto.length) {
    console.log("Database is up to date — no pending migrations.");
    return;
  }
  console.log(`${auto.length} pending migration(s):\n  ${auto.join("\n  ")}\n`);
  if (statusOnly) return;

  for (const file of auto) {
    console.log(`▶ ${file}`);
    const result = spawnSync(process.execPath, [file], { cwd: ROOT, stdio: "inherit" });
    if (result.status !== 0) {
      console.error(`\n✖ ${file} failed (exit ${result.status ?? result.signal}). Stopped; later migrations were not run.`);
      process.exitCode = 1;
      return;
    }
    await record(file);
    console.log(`✔ ${file}\n`);
  }
  console.log(`Applied ${auto.length} migration(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
