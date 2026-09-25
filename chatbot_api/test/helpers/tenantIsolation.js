/**
 * Fixture + scanner for the cross-tenant isolation test.
 *
 *   buildApp()        mounts every real router in index.js's order, behind the real
 *                     tenantContext middleware, on an in-process test server
 *   createTenants()   two resellers (R1, R2), one customer under each (C1, C2),
 *                     each with a team member
 *   seedAll()         one row, stuffed with a per-tenant marker string, in every table
 *                     that carries an agency_id, plus every child table hanging off
 *                     those (messages, rules, ticket messages, ...). Schema-driven.
 *   scan()            attacks the real routes from one tenant using another tenant's ids
 *
 * A leak is either (a) a response that contains another tenant's marker, or
 * (b) a mutating request that changes any seeded table or a test tenant's
 * users / workspaces. Both are unambiguous.
 */
import fs from "fs";
import path from "path";
import http from "http";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { fileURLToPath, pathToFileURL } from "url";
import pool from "../../db.js";
import { tenantContext } from "../../middleware/tenant.js";
import { createCustomerAccount } from "../../utils/resellerScope.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(__dirname, "../..");

// ── App: the same routers, same order, as index.js ─────────────────────────
export async function buildApp() {
  const src = fs.readFileSync(path.join(API_ROOT, "index.js"), "utf8");
  const files = {};
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+"\.\/routes\/([\w.]+)"/g)) files[m[1]] = m[2];
  const order = [...src.matchAll(/app\.use\(\s*"\/api\/v1"\s*,\s*(\w+)\s*\)/g)].map((m) => m[1]).filter((n) => files[n]);

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use("/api/v1", tenantContext);

  const routers = [];
  for (const name of order) {
    const mod = await import(pathToFileURL(path.join(API_ROOT, "routes", files[name])).href);
    app.use("/api/v1", mod.default);
    routers.push({ name, file: files[name], router: mod.default });
  }
  return { app, routers };
}

export function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app).listen(0, () => resolve({ server, port: server.address().port }));
  });
}

// ── Routes ─────────────────────────────────────────────────────────────────
export function enumerateRoutes(routers) {
  const out = [];
  for (const { file, router } of routers) {
    for (const layer of router.stack || []) {
      if (!layer.route) continue;
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const p of paths) {
        if (typeof p !== "string" || /[{}*()?]/.test(p.replace(/:\w+/g, ""))) continue;
        for (const method of Object.keys(layer.route.methods || {})) {
          if (layer.route.methods[method]) out.push({ method: method.toUpperCase(), path: p, file });
        }
      }
    }
  }
  return out;
}

// ── Tenants ────────────────────────────────────────────────────────────────
const TAG = "iso-test";
const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

async function createTeamMember(tenant) {
  const email = `${TAG}-team-${tenant.label}-${uniq()}@example.invalid`;
  const hash = await bcrypt.hash("Iso-test-1", 4);
  const [u] = await pool.query("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'USER')", [`ISO team ${tenant.label}`, email, hash]);
  await pool.query("INSERT INTO agent_profiles (user_id, agency_id, user_type, is_online) VALUES (?, ?, 'AGENCY_USER', 0)", [u.insertId, tenant.agencyId]);
  const [[role]] = await pool.query("SELECT id FROM roles WHERE scope_type='AGENCY' AND agency_id IS NULL AND slug='agent'");
  if (role) {
    await pool.query(
      "INSERT INTO organization_members (user_id, agency_id, role_id, member_kind, chat_access) VALUES (?,?,?, 'TEAM_MEMBER', 'ASSIGNED_ONLY')",
      [u.insertId, tenant.agencyId, role.id]
    );
  }
  return u.insertId;
}

async function createReseller(label) {
  const email = `${TAG}-${label}-${uniq()}@example.invalid`;
  const hash = await bcrypt.hash("Iso-test-1", 4);
  const [u] = await pool.query("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'RESELLER')", [`ISO ${label}`, email, hash]);
  const [a] = await pool.query(
    "INSERT INTO agencies (name, slug, owner_id, account_type) VALUES (?, ?, ?, 'RESELLER')",
    [`ISO ${label} Reseller`, `${TAG}-${label}-${uniq()}`, u.insertId]
  );
  const [[role]] = await pool.query("SELECT id FROM roles WHERE scope_type='RESELLER' AND agency_id IS NULL AND slug='reseller_owner'");
  if (role) {
    await pool.query(
      "INSERT INTO organization_members (user_id, agency_id, role_id, member_kind, chat_access) VALUES (?,?,?, 'OWNER', 'ALL')",
      [u.insertId, a.insertId, role.id]
    );
  }
  return { label, userId: u.insertId, agencyId: a.insertId, email, role: "RESELLER", accountType: "RESELLER" };
}

async function createCustomer(reseller, label) {
  const email = `${TAG}-${label}-${uniq()}@example.invalid`;
  const { customerId, ownerId } = await createCustomerAccount({
    resellerId: reseller.agencyId,
    actor: { id: reseller.userId },
    name: `ISO ${label} Workspace`,
    ownerName: `ISO ${label}`,
    ownerEmail: email,
    ownerPassword: "Iso-test-1",
  });
  return { label, userId: ownerId, agencyId: customerId, email, role: "RESELLER", accountType: "RESELLER_CUSTOMER", resellerId: reseller.agencyId };
}

export async function createTenants() {
  const R1 = await createReseller("R1");
  const R2 = await createReseller("R2");
  const C1 = await createCustomer(R1, "C1");
  const C2 = await createCustomer(R2, "C2");
  const all = [R1, R2, C1, C2];
  for (const t of all) {
    t.teamUserId = await createTeamMember(t);
    t.token = jwt.sign(
      { id: t.userId, name: `ISO ${t.label}`, email: t.email, role: t.role, agencyId: t.agencyId, accountType: t.accountType },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
  }
  return { R1, R2, C1, C2, all };
}

export async function cleanupTenants(tenants) {
  const ids = tenants.all.map((t) => t.agencyId);
  const userIds = tenants.all.flatMap((t) => [t.userId, t.teamUserId]).filter(Boolean);
  await pool.query("DELETE FROM conversations WHERE agency_id IN (?)", [ids]).catch((e) => console.warn("cleanup conversations", e.message));
  // Customers first (the reseller-tree guard), then resellers.
  for (const t of [tenants.C1, tenants.C2, tenants.R1, tenants.R2]) {
    await pool.query("DELETE FROM agencies WHERE id = ?", [t.agencyId]).catch((e) => console.warn("cleanup agency", t.agencyId, e.message));
  }
  await pool.query("DELETE FROM users WHERE id IN (?)", [userIds]).catch((e) => console.warn("cleanup users", e.message));
  const [[left]] = await pool.query(
    "SELECT (SELECT COUNT(*) FROM agencies WHERE id IN (?)) a, (SELECT COUNT(*) FROM users WHERE id IN (?)) u",
    [ids, userIds]
  );
  return left;
}

// ── Seeding: one marker-stuffed row in every tenant table ──────────────────
// Never seeded: global / platform-level tables, and tables whose rows only make
// sense as part of the user/membership setup done explicitly above.
const NEVER_SEED = new Set([
  "schema_migrations", "permissions", "modules", "package_modules", "packages", "role_permissions",
  "platform_settings", "platform_payment_gateways", "pending_signups",
  "organization_members", "agent_profiles", "team_member_integration_access",
  "subscriptions", "agency_client_subscriptions", "users", "agencies",
]);

export const markerFor = (agencyId) => `ISO${agencyId}_`;

async function tableMeta() {
  const [cols] = await pool.query(
    `SELECT TABLE_NAME t, COLUMN_NAME c, DATA_TYPE dt, COLUMN_TYPE ct, IS_NULLABLE nullable, COLUMN_DEFAULT def,
            EXTRA extra, CHARACTER_MAXIMUM_LENGTH len, GENERATION_EXPRESSION gen
     FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION`
  );
  const [fks] = await pool.query(
    `SELECT TABLE_NAME t, COLUMN_NAME c, REFERENCED_TABLE_NAME rt FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`
  );
  const meta = {};
  for (const c of cols) (meta[c.t] ||= { cols: [], fks: {} }).cols.push(c);
  for (const f of fks) if (meta[f.t]) meta[f.t].fks[f.c] = f.rt;

  // Tables that belong to a tenant: they carry agency_id, or hang off one that does.
  const seedable = new Set(Object.keys(meta).filter((t) => !NEVER_SEED.has(t) && meta[t].cols.some((c) => c.c === "agency_id")));
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of Object.keys(meta)) {
      if (seedable.has(t) || NEVER_SEED.has(t)) continue;
      if (Object.values(meta[t].fks).some((rt) => seedable.has(rt))) { seedable.add(t); grew = true; }
    }
  }
  return { meta, seedable };
}

function valueFor(col, marker, tableName) {
  const { dt, ct, len } = col;
  if (["varchar", "char"].includes(dt)) {
    const v = `${marker}${tableName}`;
    return v.length <= len ? v : (len >= marker.length + 1 ? v.slice(0, len) : "x".slice(0, len));
  }
  if (["text", "tinytext", "mediumtext", "longtext"].includes(dt)) return `${marker}${tableName}`;
  if (["blob", "tinyblob", "mediumblob", "longblob", "binary", "varbinary"].includes(dt)) return Buffer.from(`${marker}${tableName}`);
  if (dt === "json") return "{}";
  if (["int", "bigint", "smallint", "mediumint", "tinyint", "decimal", "float", "double", "year"].includes(dt)) return 1;
  if (dt === "enum") return /enum\('((?:[^']|'')*)'/.exec(ct)?.[1]?.replace(/''/g, "'");
  if (dt === "set") return /set\('((?:[^']|'')*)'/.exec(ct)?.[1];
  if (["date", "datetime", "timestamp"].includes(dt)) return new Date();
  if (dt === "time") return "00:00:00";
  return null;
}

/** Inserts one row per seedable table for this tenant. Returns { table: id, ... } (+ failures as __failed:table). */
export async function seedTenantData(tenant, { meta, seedable }) {
  const marker = markerFor(tenant.agencyId);
  const seeded = { agencies: tenant.agencyId, users: tenant.userId, team_users: tenant.teamUserId };
  let pending = [...seedable];
  for (let pass = 0; pass < 5 && pending.length; pass++) {
    const next = [];
    for (const table of pending) {
      const { cols, fks } = meta[table];
      const row = {};
      let blocked = false;
      for (const col of cols) {
        if (/auto_increment/i.test(col.extra) || col.gen) continue;
        if (col.c === "agency_id") { row.agency_id = tenant.agencyId; continue; }
        const refTable = fks[col.c];
        if (refTable) {
          if (refTable === "agencies") { row[col.c] = tenant.agencyId; continue; }
          if (refTable === "users") { row[col.c] = tenant.userId; continue; }
          if (seeded[refTable] && seeded[refTable] !== true) { row[col.c] = seeded[refTable]; continue; }
          if (col.nullable === "NO" && col.def === null) { blocked = true; break; }
          continue; // nullable FK: leave NULL
        }
        const isText = ["varchar", "char", "text", "tinytext", "mediumtext", "longtext"].includes(col.dt);
        const required = col.nullable === "NO" && col.def === null;
        if (required || isText) {
          const v = valueFor(col, marker, table);
          if (v !== null && v !== undefined) row[col.c] = v;
        }
      }
      if (blocked) { next.push(table); continue; }
      try {
        const keys = Object.keys(row);
        const [r] = await pool.query(
          `INSERT INTO \`${table}\` (${keys.map((k) => `\`${k}\``).join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
          keys.map((k) => row[k])
        );
        seeded[table] = r.insertId || true;
      } catch (err) {
        if (pass === 4) seeded[`__failed:${table}`] = err.message.slice(0, 90);
        else next.push(table);
      }
    }
    pending = next;
  }
  for (const t of pending) seeded[`__failed:${t}`] ||= "blocked on a parent table that could not be seeded";
  return seeded;
}

export async function seedAll(tenants) {
  const info = await tableMeta();
  for (const t of tenants.all) t.seeded = await seedTenantData(t, info);
  return info;
}

// ── Scanner ────────────────────────────────────────────────────────────────

// Route params whose name does not match a table. [route regex, { param: table }]
const PARAM_OVERRIDES = [
  [/^\/channels\/webchat\/:id/, { id: "webchat_widgets" }],
  [/^\/channels\/(whatsapp|facebook|instagram|telegram|tiktok)\/:id/, { id: "integrations" }],
  [/^\/canned-responses\/:id/, { id: "quick_replies" }],
  [/^\/custom-fields\/:id/, { id: "custom_field_definitions" }],
  [/^\/contacts\/:id\/custom-fields\/:fieldId/, { id: "contacts", fieldId: "custom_field_definitions" }],
  [/^\/contacts\/:id\/notes\/:noteId/, { id: "contacts", noteId: "contact_notes" }],
  [/^\/broadcasts\/:id/, { id: "broadcast_campaigns" }],
  [/^\/commerce\/connections\/:id/, { id: "commerce_connections" }],
  [/^\/commerce\/campaigns\/:id/, { id: "commerce_campaigns" }],
  [/^\/calls\/:id/, { id: "whatsapp_calls" }],
  [/^\/support-desk\/departments\/:id/, { id: "support_departments" }],
  [/^\/support-desk\/canned-responses\/:id/, { id: "support_canned_responses" }],
  [/^\/support-desk\/tickets\/:id/, { id: "support_tickets" }],
  [/^\/payments\/order\/:orderId/, { orderId: "chat_orders" }],
  [/^\/team-members\/:id/, { id: "team_users" }],
  [/^\/agency\/agents\/:userId/, { userId: "team_users" }],
  [/^\/slots\/:id/, { id: "appointment_slots" }],
  [/^\/templates\/whatsapp\/:id/, { id: "whatsapp_templates" }],
  [/^\/bots\/errors\/:id/, { id: "bot_error_logs" }],
  [/^\/bots\/:botId\/rules\/:ruleId/, { botId: "bots", ruleId: "bot_rules" }],
  [/^\/reseller\/packages\/:id/, { id: "agency_packages" }],
  [/^\/reseller\/(users|customers)\/:id/, { id: "users" }],
  [/^\/ai\/reply-settings\/:integrationId\/active-agents\/:agentId/, { integrationId: "integrations", agentId: "ai_agents" }],
  [/^\/ai\/agents\/:id\/knowledge\/:sourceId/, { id: "ai_agents", sourceId: "ai_agent_knowledge_sources" }],
  [/^\/conversations\/:id\/messages\/:messageId/, { id: "conversations", messageId: "messages" }],
  [/^\/media\/whatsapp\/:messageId/, { messageId: "messages" }],
  [/^\/comments\/delete-comment\/:commentId/, { commentId: "comment_automation_rules" }],
  [/^\/admin\/agencies\/:id/, { id: "agencies" }],
  [/^\/admin\/users\/:id/, { id: "users" }],
];

function tableCandidates(name, segments) {
  const cands = new Set();
  const snake = (s) => s.replace(/-/g, "_").replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  const plural = (s) => [s, `${s}s`, `${s}es`, s.replace(/y$/, "ies")];
  if (name === "id") {
    const idx = segments.lastIndexOf(":id");
    const prev = idx > 0 ? snake(segments[idx - 1]) : null;
    const prev2 = idx > 1 ? snake(segments[idx - 2]) : null;
    if (prev) { plural(prev).forEach((c) => cands.add(c)); if (prev2) plural(`${prev2}_${prev}`).forEach((c) => cands.add(c)); }
  } else {
    plural(snake(name.replace(/Id$/, ""))).forEach((c) => cands.add(c));
  }
  return [...cands];
}

function fillPath(routePath, victim) {
  const segments = routePath.split("/").filter(Boolean);
  const params = [...routePath.matchAll(/:(\w+)/g)].map((m) => m[1]);
  const override = PARAM_OVERRIDES.find(([re]) => re.test(routePath))?.[1] || {};
  let filled = routePath;
  for (const p of params) {
    const candidates = override[p] ? [override[p]] : tableCandidates(p, segments);
    const table = candidates.find((c) => victim.seeded[c] && victim.seeded[c] !== true);
    if (!table) return null;
    filled = filled.replace(`:${p}`, String(victim.seeded[table]));
  }
  return filled;
}

/** A fingerprint of everything an attacker must not be able to change. */
export async function fingerprint(tenants, seedable) {
  const tables = [...seedable];
  const [rows] = await pool.query(`CHECKSUM TABLE ${tables.map((t) => `\`${t}\``).join(",")}`);
  const out = Object.fromEntries(rows.map((r) => [r.Table.split(".").pop(), r.Checksum]));
  // users / agencies also hold real accounts that legitimately change, so only the test tenants' rows are compared.
  const ids = tenants.all.map((t) => t.agencyId);
  const userIds = tenants.all.flatMap((t) => [t.userId, t.teamUserId]);
  const [[u]] = await pool.query(
    "SELECT MD5(GROUP_CONCAT(CONCAT_WS('|',id,name,email,role,is_active,phone,address,password,home_agency_id) ORDER BY id)) h FROM users WHERE id IN (?)", [userIds]);
  const [[a]] = await pool.query(
    "SELECT MD5(GROUP_CONCAT(CONCAT_WS('|',id,name,is_active,account_type,parent_agency_id,owner_id,package_id) ORDER BY id)) h FROM agencies WHERE id IN (?)", [ids]);
  out.__users = u.h;
  out.__agencies = a.h;
  return out;
}

const md5 = (v) => crypto.createHash("md5").update(JSON.stringify(v)).digest("hex");

/** Hash of exactly the rows that belong to `victim` in `table` (or null if the table has none we can address). */
async function victimTableHash(info, victim, table) {
  if (table === "users") {
    const [rows] = await pool.query("SELECT * FROM users WHERE id IN (?) ORDER BY id", [[victim.userId, victim.teamUserId]]);
    return md5(rows);
  }
  if (table === "agencies") {
    const [rows] = await pool.query("SELECT * FROM agencies WHERE id = ?", [victim.agencyId]);
    return md5(rows);
  }
  const { cols, fks } = info.meta[table];
  let where;
  let params = [];
  if (cols.some((c) => c.c === "agency_id")) {
    where = "agency_id = ?";
    params = [victim.agencyId];
  } else {
    const conds = [];
    for (const [col, parent] of Object.entries(fks)) {
      const id = victim.seeded[parent];
      if (info.seedable.has(parent) && id && id !== true) { conds.push(`\`${col}\` = ?`); params.push(id); }
    }
    if (!conds.length) return null;
    where = conds.join(" OR ");
  }
  const [rows] = await pool.query(`SELECT * FROM \`${table}\` WHERE ${where} ORDER BY 1`, params);
  return md5(rows);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The dev server (and any other process on this database) runs background
 * schedulers: sequences, broadcasts, follow-up reminders, flow delays... They
 * legitimately touch the test tenants' rows on their own. Attributing such a
 * change to whichever request happened to be in flight would be a false alarm,
 * so before attacking, measure which tables change with NO request at all
 * (after a settle window, over a probe window) and exclude only those from the
 * "was a row modified" check. Response-content leaks are still checked for them.
 * Returns the set of table names that change on their own.
 */
export async function findBackgroundNoise(info, tenants, { settleMs = 65000, probeMs = 70000 } = {}) {
  await sleep(settleMs);
  const tables = [...info.seedable, "users", "agencies"];
  const snap = async () => {
    const out = {};
    for (const v of tenants.all) for (const t of tables) out[`${v.label}:${t}`] = await victimTableHash(info, v, t);
    return out;
  };
  const a = await snap();
  await sleep(probeMs);
  const b = await snap();
  const noisy = new Set();
  for (const k of Object.keys(a)) if (a[k] !== b[k]) noisy.add(k.split(":")[1]);
  return noisy;
}

async function snapshotVictims(info, victims) {
  const snap = {};
  for (const v of victims) {
    snap[v.label] = {};
    for (const t of [...info.seedable, "users", "agencies"]) snap[v.label][t] = await victimTableHash(info, v, t);
  }
  return snap;
}

// A request body that passes most validation and points at the victim's rows by every id name a route might read.
function bodyFor(victim) {
  const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const singular = (s) => s.replace(/ies$/, "y").replace(/ses$/, "s").replace(/s$/, "");
  const b = {
    name: "x", title: "x", label: "x", color: "#123456", description: "x", body: "x", content: "x", message: "x", text: "x",
    subject: "x", triggerKeyword: "x", replyMessage: "x", keyword: "x", email: "iso-x@example.invalid", phone: "1555",
    status: "OPEN", type: "TEXT", isActive: true, is_active: true,
  };
  for (const [table, id] of Object.entries(victim.seeded)) {
    if (typeof id !== "number") continue;
    b[`${camel(singular(table))}Id`] = id;
    b[`${singular(table)}_id`] = id;
  }
  b.agentProfileId = victim.seeded.agent_profiles || victim.seeded.team_users || 1;
  b.agencyId = victim.agencyId;
  b.id = victim.seeded.contacts || victim.seeded.bots || 1;
  return b;
}

/**
 * Attack every route from `attacker` against each of `victims`.
 * Returns { findings, stats }; a finding is { kind, attacker, victim, method, path, file, status, evidence }.
 */
export async function scan({ port, routes, attacker, victims, tenants, info, ignoreTables = new Set() }) {
  const seedable = info.seedable;
  const findings = [];
  const baseline = await snapshotVictims(info, victims);
  const victimMarkers = victims.map((v) => ({ v, marker: markerFor(v.agencyId) }));
  const stats = { requests: 0, paramRoutesSkipped: 0, paramRoutesHit: 0, listRoutesHit: 0, skipped: [] };

  const call = async (method, urlPath, body) => {
    stats.requests++;
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/v1${urlPath}`, {
        method,
        headers: { authorization: `Bearer ${attacker.token}`, "content-type": "application/json" },
        body: ["GET", "HEAD", "DELETE"].includes(method) ? undefined : JSON.stringify(body || {}),
        signal: AbortSignal.timeout(8000),
      });
      return { status: r.status, text: await r.text() };
    } catch {
      return { status: 0, text: "" };
    }
  };

  for (const route of routes) {
    const hasParams = /:\w+/.test(route.path);
    const isMutation = route.method !== "GET" && route.method !== "HEAD";

    const check = async (urlPath, victim, extra = "") => {
      const before = isMutation ? await fingerprint(tenants, seedable) : null;
      const res = await call(route.method, urlPath + extra, isMutation ? bodyFor(victims.find((x) => x === victim) || victims[0]) : {});
      const leaked = victimMarkers.find(({ marker }) => res.text.includes(marker));
      if (leaked) {
        findings.push({ kind: "data-in-response", attacker: attacker.label, victim: leaked.v.label, method: route.method, path: route.path, file: route.file, status: res.status });
      }
      if (isMutation) {
        const after = await fingerprint(tenants, seedable);
        const changed = Object.keys(after).filter((k) => after[k] !== before[k]).map((k) => (k === "__users" ? "users" : k === "__agencies" ? "agencies" : k));
        // The coarse check also trips on the attacker writing to their OWN rows. Only a change to a
        // victim's rows counts, so confirm against the victims' own row hashes.
        for (const t of changed) {
          if (ignoreTables.has(t)) continue; // changes on its own (background scheduler), not because of this request
          for (const v of victims) {
            const now = await victimTableHash(info, v, t);
            if (now !== baseline[v.label][t]) {
              findings.push({ kind: "data-modified", attacker: attacker.label, victim: v.label, method: route.method, path: route.path, file: route.file, status: res.status, evidence: t });
              baseline[v.label][t] = now;
            }
          }
        }
      }
    };

    if (hasParams) {
      let any = false;
      for (const victim of victims) {
        const filled = fillPath(route.path, victim);
        if (!filled) continue;
        any = true;
        await check(filled, victim);
      }
      if (any) stats.paramRoutesHit++;
      else { stats.paramRoutesSkipped++; stats.skipped.push(`${route.method} ${route.path}`); }
    } else if (!isMutation) {
      // List-style endpoints: also try to steer them at a victim through the usual query params.
      const q = `agencyId=${victims[0].agencyId}&agency_id=${victims[0].agencyId}&resellerId=${victims[0].agencyId}`;
      await check(route.path, victims[0]);
      await check(route.path, victims[0], `?${q}`);
      stats.listRoutesHit++;
    }
  }
  return { findings, stats };
}
