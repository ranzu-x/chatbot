/**
 * Workspace variables — named values a workspace sets once and uses in any
 * message as {{var.<key>}} (Subscriber Manager → Fields & Variables;
 * workspace_variables from migrate_bot_settings.js). E.g. {{var.support_phone}}.
 *
 * replaceVariables() (utils/flowEngine.js) is synchronous and called from many
 * places, so it reads an in-memory copy. Senders warm it with
 * warmWorkspaceVariables(agencyId) before building messages; writes through
 * routes/workspaceVariables.js refresh it immediately.
 */
import pool from "../db.js";

const TTL_MS = 60_000;
const cache = new Map(); // agencyId -> { vars: Map<key, value>, ts }

export const VAR_KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;

export function slugifyVarKey(name) {
  let key = String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
  if (key && !/^[a-z]/.test(key)) key = `v_${key}`.slice(0, 64);
  return key;
}

export async function warmWorkspaceVariables(agencyId) {
  if (!agencyId) return;
  const hit = cache.get(Number(agencyId));
  if (hit && Date.now() - hit.ts < TTL_MS) return;
  try {
    const [rows] = await pool.query("SELECT var_key, value FROM workspace_variables WHERE agency_id = ?", [agencyId]);
    cache.set(Number(agencyId), { vars: new Map(rows.map((r) => [r.var_key, r.value ?? ""])), ts: Date.now() });
  } catch {
    // table missing (migration not run yet) — {{var.*}} simply stays unfilled
  }
}

export function invalidateWorkspaceVariables(agencyId) {
  cache.delete(Number(agencyId));
}

/** Replaces {{var.key}} tokens from the warmed copy; unknown keys become "". */
export function applyWorkspaceVariables(text, agencyId) {
  if (!text || typeof text !== "string" || !text.includes("{{var.")) return text;
  const vars = cache.get(Number(agencyId))?.vars;
  if (!vars) return text;
  return text.replace(/\{\{\s*var\.([a-z0-9_]+)\s*\}\}/gi, (_, k) => (vars.has(k.toLowerCase()) ? String(vars.get(k.toLowerCase())) : ""));
}
