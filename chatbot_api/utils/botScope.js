/**
 * BOT SCOPE — the wall between bot accounts.
 *
 * Every reusable component a flow can point at (a Sequence, a User Input Flow,
 * another Flow) belongs to exactly ONE bot account (`integration_id`) inside ONE
 * workspace (`agency_id`). A flow may only reference components with the SAME
 * agency_id AND the SAME integration_id as itself — never another bot's, never
 * another workspace's.
 *
 * This is enforced server-side in three places, independent of whatever the UI
 * shows:
 *   1. when a flow is saved / created / cloned   (findOutOfScopeRefs / stripComponentRefs)
 *   2. when a flow runs                          (utils/flowEngine.js scopes its lookups)
 *   3. when a contact is enrolled in a Sequence  (routes/sequences.js)
 * The pickers in the builder are only a convenience on top of this.
 */
import pool from "../db.js";

// node.data keys that point at another bot component, and the table they live in
const REF_KEYS = {
  sequenceId: "sequences",
  userInputFlowId: "user_input_flows",
  flowId: "flows",
};
// Display-name snapshots stored next to those ids
const REF_NAME_KEYS = ["sequenceName", "userInputFlowName", "flowName"];

const asId = (v) => (v !== null && v !== undefined && /^\d+$/.test(String(v)) ? Number(v) : null);

/** Every {table -> Set(ids)} a flow's nodes point at (deep: buttons, list items, actions, Message Block elements...). */
export function collectComponentRefs(nodes) {
  const refs = { sequences: new Set(), user_input_flows: new Set(), flows: new Set() };
  const walk = (v) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!v || typeof v !== "object") return;
    for (const [k, val] of Object.entries(v)) {
      const table = REF_KEYS[k];
      const id = table ? asId(val) : null;
      if (id !== null) refs[table].add(id);
      else walk(val);
    }
  };
  for (const n of Array.isArray(nodes) ? nodes : []) walk(n?.data);
  return refs;
}

/**
 * Every reference in a flow WITH where it lives: [{ nodeId, nodeType, nodeLabel, itemId, where, table, id }].
 * `itemId` is set when the reference sits inside a Message Block element; `where` is the title of the
 * button / list item / action that holds it, when there is one.
 */
export function collectNodeRefs(nodes) {
  const out = [];
  for (const n of Array.isArray(nodes) ? nodes : []) {
    const base = { nodeId: n?.id, nodeType: n?.type, nodeLabel: n?.data?.label || n?.type };
    const walk = (v, itemId, where) => {
      if (Array.isArray(v)) { v.forEach((x) => walk(x, itemId, where)); return; }
      if (!v || typeof v !== "object") return;
      const here = v.title || v.label || where;
      for (const [k, val] of Object.entries(v)) {
        const table = REF_KEYS[k];
        const id = table ? asId(val) : null;
        if (id !== null) out.push({ ...base, itemId, where: here || null, table, id });
        else walk(val, itemId, here);
      }
    };
    if (n?.type === "messageBlock") {
      for (const item of Array.isArray(n.data?.items) ? n.data.items : []) walk(item?.data, item?.id || null, null);
    } else {
      walk(n?.data, null, null);
    }
  }
  return out;
}

/**
 * The references that are NOT allowed for a flow living on `integrationId` in workspace
 * `agencyId`. Empty array = everything the flow points at is its own bot's. Each entry says
 * WHICH element, WHAT it points at, and WHY that isn't allowed (owned by another bot / by no bot / gone).
 */
export async function findOutOfScopeRefs({ agencyId, integrationId, nodes }) {
  const refs = collectNodeRefs(nodes);
  if (refs.length === 0) return [];

  const byTable = {};
  for (const r of refs) (byTable[r.table] = byTable[r.table] || new Set()).add(r.id);

  const rowsByTable = {};
  const botIds = new Set();
  for (const [table, ids] of Object.entries(byTable)) {
    const [rows] = await pool.query(
      `SELECT id, integration_id, name FROM ${table} WHERE agency_id = ? AND id IN (?)`,
      [agencyId, [...ids]]
    );
    rowsByTable[table] = new Map(rows.map((r) => [r.id, r]));
    rows.forEach((r) => { if (r.integration_id) botIds.add(r.integration_id); });
  }
  const botNames = new Map();
  if (botIds.size) {
    const [bots] = await pool.query("SELECT id, name FROM integrations WHERE agency_id = ? AND id IN (?)", [agencyId, [...botIds]]);
    bots.forEach((b) => botNames.set(b.id, b.name));
  }

  const bad = [];
  for (const r of refs) {
    const row = rowsByTable[r.table]?.get(r.id);
    let reason = null;
    if (!row) reason = "not_found";
    else if (!row.integration_id) reason = "no_bot";
    else if (!integrationId || Number(row.integration_id) !== Number(integrationId)) reason = "other_bot";
    if (reason) bad.push({ ...r, targetName: row?.name || null, botName: row?.integration_id ? (botNames.get(row.integration_id) || null) : null, reason });
  }
  return bad;
}

const TABLE_LABEL = { sequences: "Sequence", user_input_flows: "User Input Flow", flows: "Flow" };
const REASON_TEXT = {
  other_bot: (v) => `belongs to a different bot account${v.botName ? ` ("${v.botName}")` : ""}`,
  no_bot: () => "isn't linked to any bot account",
  not_found: () => "no longer exists",
};

/** One human sentence per violation: "Text Message → button "Yes": Sequence "Welcome" belongs to ..." */
export function describeViolation(v) {
  const kind = TABLE_LABEL[v.table];
  const name = v.targetName ? ` "${v.targetName}"` : ` #${v.id}`;
  const where = [v.nodeLabel, v.where && v.where !== v.nodeLabel ? `"${v.where}"` : null].filter(Boolean).join(" → ");
  return `${where}: ${kind}${name} ${REASON_TEXT[v.reason](v)}`;
}

export function describeOutOfScope(bad, integrationId = undefined) {
  if (integrationId === null || integrationId === "") {
    return "This flow isn't linked to a bot account yet, so it can't use Sequences, forms or other flows. Open it from a bot account in Bot Manager (or choose its account) and save again.";
  }
  const lines = bad.slice(0, 4).map(describeViolation);
  const more = bad.length > 4 ? ` (+${bad.length - 4} more)` : "";
  return `${lines.join("; ")}${more}. A bot can only use its own components — pick this bot's own or remove it, then save again.`;
}

/** Shape sent to the builder so it can select the exact element: [{ nodeId, itemId, message }] */
export function violationsForClient(bad) {
  return bad.map((v) => ({ nodeId: v.nodeId, itemId: v.itemId || null, message: describeViolation(v) }));
}

/** Removes every reference to another component (used when a flow is copied to a different bot). */
export function stripComponentRefs(nodes) {
  const walk = (v) => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (!v || typeof v !== "object") return;
    for (const k of Object.keys(v)) {
      if (REF_KEYS[k]) v[k] = null;
      else if (REF_NAME_KEYS.includes(k)) v[k] = "";
      else walk(v[k]);
    }
  };
  const copy = JSON.parse(JSON.stringify(nodes || []));
  walk(copy);
  return copy;
}

/** The bot account must exist in THIS workspace (and, if given, match the platform). Returns the row or null. */
export async function getOwnedIntegration(agencyId, integrationId, platform = null) {
  if (!integrationId) return null;
  const [[row]] = await pool.query(
    "SELECT id, platform, name FROM integrations WHERE id = ? AND agency_id = ?",
    [integrationId, agencyId]
  );
  if (!row) return null;
  if (platform && String(row.platform).toUpperCase() !== String(platform).toUpperCase()) return null;
  return row;
}
