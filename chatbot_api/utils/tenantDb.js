/**
 * Workspace-scoped data access for tenant-owned tables.
 *
 *   const db = tenantDb(req);                 // workspace comes from req.tenant, never from the client
 *   await db.list("quick_replies", { orderBy: "title" });
 *   await db.getOwned("quick_replies", id);   // null unless the row is this workspace's
 *   await db.insert("quick_replies", { title, body });      // agency_id is forced
 *   await db.updateOwned("quick_replies", id, { title });   // can only touch this workspace's row
 *   await db.deleteOwned("quick_replies", id);
 *
 * Every statement built here carries `agency_id = <the caller's workspace>`, so
 * a route using it cannot forget the filter, and cannot be pointed at another
 * workspace's row by passing its id. Table and column names are validated
 * against the live schema (only tables that actually have an agency_id column),
 * values are always bound parameters.
 *
 * Routes that use this instead of raw queries can be added to tenant-lock.json,
 * after which `npm run lint:tenant` refuses any raw SQL in them.
 */
import pool from "../db.js";

let tenantTables = null; // Map<table, Set<column>> for every table that has an agency_id column
async function loadTenantTables() {
  if (tenantTables) return tenantTables;
  const [rows] = await pool.query(
    `SELECT c.TABLE_NAME t, c.COLUMN_NAME c FROM information_schema.COLUMNS c
     WHERE c.TABLE_SCHEMA = DATABASE()
       AND c.TABLE_NAME IN (SELECT TABLE_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'agency_id')`
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.t)) map.set(r.t, new Set());
    map.get(r.t).add(r.c);
  }
  tenantTables = map;
  return map;
}

/** Forget the cached schema (tests, or after a migration adds a table). */
export function resetTenantSchemaCache() {
  tenantTables = null;
}

const IDENT = /^[a-z][a-z0-9_]*$/i;
const q = (name) => `\`${name}\``;

async function assertColumns(table, columns) {
  const tables = await loadTenantTables();
  if (!IDENT.test(table) || !tables.has(table)) {
    throw new Error(`tenantDb: "${table}" is not a workspace-owned table`);
  }
  for (const col of columns) {
    if (!IDENT.test(col) || !tables.get(table).has(col)) {
      throw new Error(`tenantDb: "${table}" has no column "${col}"`);
    }
  }
}

function whereClause(agencyId, where = {}) {
  const parts = ["`agency_id` = ?"];
  const params = [agencyId];
  for (const [col, value] of Object.entries(where)) {
    if (value === null) parts.push(`${q(col)} IS NULL`);
    else { parts.push(`${q(col)} = ?`); params.push(value); }
  }
  return { sql: parts.join(" AND "), params };
}

export function tenantDb(reqOrAgencyId) {
  const agencyId = typeof reqOrAgencyId === "object" ? reqOrAgencyId?.tenant?.agencyId : reqOrAgencyId;
  if (!agencyId) throw new Error("tenantDb: no workspace on this request (is the tenant middleware mounted?)");

  return {
    agencyId,

    async list(table, { where = {}, orderBy = null, direction = "ASC", limit = null } = {}) {
      await assertColumns(table, [...Object.keys(where), ...(orderBy ? [orderBy] : [])]);
      const w = whereClause(agencyId, where);
      let sql = `SELECT * FROM ${q(table)} WHERE ${w.sql}`;
      if (orderBy) sql += ` ORDER BY ${q(orderBy)} ${String(direction).toUpperCase() === "DESC" ? "DESC" : "ASC"}`;
      if (limit) { sql += " LIMIT ?"; w.params.push(Number(limit)); }
      const [rows] = await pool.query(sql, w.params);
      return rows;
    },

    /** The row with this id, only if it belongs to the caller's workspace. */
    async getOwned(table, id) {
      await assertColumns(table, ["id"]);
      const [rows] = await pool.query(`SELECT * FROM ${q(table)} WHERE \`id\` = ? AND \`agency_id\` = ? LIMIT 1`, [id, agencyId]);
      return rows[0] || null;
    },

    /** Inserts a row for the caller's workspace (agency_id is set here, any supplied value is ignored). Returns the new id. */
    async insert(table, data) {
      const cols = Object.keys(data).filter((c) => c !== "agency_id");
      await assertColumns(table, cols);
      const names = ["agency_id", ...cols];
      const [r] = await pool.query(
        `INSERT INTO ${q(table)} (${names.map(q).join(", ")}) VALUES (${names.map(() => "?").join(", ")})`,
        [agencyId, ...cols.map((c) => data[c])]
      );
      return r.insertId;
    },

    /** Updates the row only if it is the caller's. Returns the number of rows changed (0 = not theirs / not found). */
    async updateOwned(table, id, patch) {
      const cols = Object.keys(patch).filter((c) => c !== "id" && c !== "agency_id");
      if (!cols.length) return 0;
      await assertColumns(table, cols);
      const [r] = await pool.query(
        `UPDATE ${q(table)} SET ${cols.map((c) => `${q(c)} = ?`).join(", ")} WHERE \`id\` = ? AND \`agency_id\` = ?`,
        [...cols.map((c) => patch[c]), id, agencyId]
      );
      return r.affectedRows;
    },

    /** Deletes the row only if it is the caller's. Returns the number of rows removed. */
    async deleteOwned(table, id) {
      await assertColumns(table, ["id"]);
      const [r] = await pool.query(`DELETE FROM ${q(table)} WHERE \`id\` = ? AND \`agency_id\` = ?`, [id, agencyId]);
      return r.affectedRows;
    },
  };
}
