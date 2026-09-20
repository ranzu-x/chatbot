/**
 * Tenant query gate.
 *
 *  - LOCKED files (tenant-lock.json) may not contain raw SQL at all: no
 *    pool/conn .query/.execute/.getConnection calls and no direct db.js import.
 *    They must go through utils/tenantDb.js or a dedicated data layer, which
 *    apply the workspace filter by construction. Any violation fails the run.
 *  - Every other route file is reported, not failed: how many raw queries it
 *    still makes, and how many look like "by id" queries with no agency_id in
 *    the same statement (the shape of the leaks the isolation test has found).
 *    Convert them over time, then add them to tenant-lock.json.
 *
 * Run: npm run lint:tenant           (also runs before `npm test`)
 *      npm run lint:tenant -- --verbose   (list the suspicious statements)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const verbose = process.argv.includes("--verbose");

const RAW_CALL = /\b(?:pool|conn|connection|db|client)\s*\.\s*(?:query|execute|getConnection)\s*\(/g;
const DB_IMPORT = /import\s+[\w{},\s*]+\s+from\s+["'][^"']*\/db\.js["']/g;

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => (/^\s*\/\//.test(l) ? "" : l))
    .join("\n");
}
const lineOf = (src, index) => src.slice(0, index).split("\n").length;

const lock = JSON.parse(fs.readFileSync(path.join(ROOT, "tenant-lock.json"), "utf8"));
const locked = new Set(lock.locked);

let failed = false;

// ── Locked files ─────────────────────────────────────────────────────────
console.log("Locked files (no raw SQL allowed):");
for (const rel of lock.locked) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.error(`  x ${rel} is listed in tenant-lock.json but does not exist`);
    failed = true;
    continue;
  }
  const src = stripComments(fs.readFileSync(file, "utf8"));
  const hits = [...src.matchAll(RAW_CALL), ...src.matchAll(DB_IMPORT)];
  if (hits.length) {
    failed = true;
    console.error(`  x ${rel}: ${hits.length} raw database access(es)`);
    for (const h of hits) console.error(`      line ${lineOf(src, h.index)}: ${h[0].trim()}`);
  } else {
    console.log(`  ok ${rel}`);
  }
}

// ── Everything else: report only ─────────────────────────────────────────
const routesDir = path.join(ROOT, "routes");
const report = [];
for (const name of fs.readdirSync(routesDir).filter((f) => f.endsWith(".js"))) {
  const rel = `routes/${name}`;
  if (locked.has(rel)) continue;
  const src = stripComments(fs.readFileSync(path.join(routesDir, name), "utf8"));
  const raw = [...src.matchAll(RAW_CALL)].length;

  // "by id" statements with no agency_id anywhere in the same string literal.
  const suspicious = [];
  for (const m of src.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*?(?:SELECT|UPDATE|DELETE)(?:\\.|(?!\1)[^\\])*?)\1/gis)) {
    const sql = m[2];
    if (!/\bWHERE\b/i.test(sql)) continue;
    const byId = /\bWHERE\s+(?:\w+\.)?id\s*=\s*\?/i.test(sql) || /\bWHERE\s+(?:\w+\.)?\w+_id\s*=\s*\?\s*(?:ORDER|LIMIT|$)/i.test(sql);
    if (!byId) continue;
    if (/agency_id|agencyId|owner_id|user_id\s*=\s*\?/i.test(sql)) continue;
    suspicious.push({ line: lineOf(src, m.index), sql: sql.replace(/\s+/g, " ").slice(0, 110) });
  }
  if (raw) report.push({ rel, raw, suspicious });
}

report.sort((a, b) => b.suspicious.length - a.suspicious.length || b.raw - a.raw);
const totalRaw = report.reduce((n, r) => n + r.raw, 0);
const totalSusp = report.reduce((n, r) => n + r.suspicious.length, 0);
console.log(`\nNot yet converted: ${report.length} route files, ${totalRaw} raw queries, ${totalSusp} that look like by-id queries with no workspace filter (warnings only).`);
for (const r of report.slice(0, verbose ? report.length : 12)) {
  if (!r.suspicious.length && !verbose) continue;
  console.log(`  ${r.rel}: ${r.raw} raw, ${r.suspicious.length} by-id without a workspace filter`);
  if (verbose) for (const s of r.suspicious) console.log(`      line ${s.line}: ${s.sql}`);
}
if (!verbose && totalSusp) console.log("  (npm run lint:tenant -- --verbose lists every statement)");

if (failed) {
  console.error("\nlint:tenant FAILED: a locked route file uses raw SQL. Use utils/tenantDb.js or the file's data layer.");
  process.exit(1);
}
console.log("\nlint:tenant passed.");
