/**
 * Migration: user_input_flows.integration_id — a User Input Flow now belongs to
 * ONE bot account (same as Sequences already do), so no other bot can ever list,
 * pick or run it. See utils/botScope.js for the rules this supports.
 *
 * Existing rows are assigned from the flows that already run them: if every flow
 * that references a form lives on ONE bot account, the form is given to it. A form
 * that is unused, or shared by flows on different bots, is left UNASSIGNED
 * (integration_id NULL) — unassigned forms are usable by no bot until the owner
 * assigns one in Bot Manager → Data Collection → User Input Flows. Nothing is
 * ever guessed across bots.
 *
 * Idempotent. Run:  node migrate_bot_scope.js
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column]
  );
  return rows.length > 0;
}

function collectUifIds(nodes) {
  const ids = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!v || typeof v !== "object") return;
    for (const [k, val] of Object.entries(v)) {
      if (k === "userInputFlowId" && /^\d+$/.test(String(val ?? ""))) ids.add(Number(val));
      else walk(val);
    }
  };
  for (const n of nodes) walk(n?.data);
  return ids;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    if (!(await columnExists(conn, "user_input_flows", "integration_id"))) {
      await conn.query("ALTER TABLE user_input_flows ADD COLUMN integration_id INT NULL AFTER platform");
      await conn.query("ALTER TABLE user_input_flows ADD INDEX idx_uif_integration (agency_id, integration_id)");
      console.log("✅ user_input_flows.integration_id added");
    } else {
      console.log("⏭️  user_input_flows.integration_id already exists");
    }

    // Infer owners from the flows that reference each form.
    const [flows] = await conn.query("SELECT id, agency_id, integration_id, nodes_json FROM flows");
    const owners = new Map(); // "agency:uifId" -> Set(integration_id | null)
    for (const f of flows) {
      let nodes = [];
      try { nodes = JSON.parse(f.nodes_json || "[]"); } catch { continue; }
      for (const uifId of collectUifIds(nodes)) {
        const key = `${f.agency_id}:${uifId}`;
        if (!owners.has(key)) owners.set(key, new Set());
        owners.get(key).add(f.integration_id ?? null);
      }
    }

    let assigned = 0;
    let left = 0;
    const [uifs] = await conn.query("SELECT id, agency_id, platform, integration_id FROM user_input_flows");
    for (const u of uifs) {
      if (u.integration_id) continue;
      const set = owners.get(`${u.agency_id}:${u.id}`);
      if (set && set.size === 1 && [...set][0]) {
        const integrationId = [...set][0];
        const [[integ]] = await conn.query("SELECT id FROM integrations WHERE id = ? AND agency_id = ?", [integrationId, u.agency_id]);
        if (integ) {
          await conn.query("UPDATE user_input_flows SET integration_id = ? WHERE id = ?", [integrationId, u.id]);
          assigned++;
          continue;
        }
      }
      left++;
    }
    await recordMigration(conn, "migrate_bot_scope.js");
    console.log(`✅ ${assigned} form(s) assigned to their bot account; ${left} left unassigned (assign them in Bot Manager).`);
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch((err) => { console.error("❌ Migration failed:", err); process.exit(1); });
