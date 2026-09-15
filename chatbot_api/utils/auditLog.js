/**
 * Admin & Reseller Audit Log — records who changed which package, price,
 * role, agency, or user, and when. Fire-and-forget like logBotError: a
 * logging failure must never break the mutation it's describing, so every
 * call site awaits this but it never throws.
 */
import pool from "../db.js";

/**
 * @param {object} opts
 * @param {number} opts.agencyId - the ACTOR's own agency (whose feed this belongs to)
 * @param {object} opts.actor - req.user: { id, name, role }
 * @param {string} opts.action - e.g. "package.update", "agency.toggle"
 * @param {string} opts.entityType - e.g. "package", "agency", "role"
 * @param {number|null} [opts.entityId]
 * @param {string|null} [opts.entityLabel] - human-readable name of the thing changed
 * @param {string} opts.summary - one-line human-readable description
 * @param {object|null} [opts.changes] - { before, after } or any JSON-serializable diff
 * @param {number|null} [opts.targetAgencyId] - the agency the action was performed ON, if different from agencyId
 */
export async function logAuditEvent({
  agencyId, actor, action, entityType, entityId = null, entityLabel = null,
  summary, changes = null, targetAgencyId = null,
}) {
  try {
    await pool.query(
      `INSERT INTO admin_audit_log
       (agency_id, target_agency_id, actor_user_id, actor_name, actor_role, action, entity_type, entity_id, entity_label, summary, changes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId, targetAgencyId,
        actor?.id ?? null, actor?.name || "Unknown", actor?.role || "UNKNOWN",
        action, entityType, entityId, entityLabel, summary,
        changes ? JSON.stringify(changes) : null,
      ]
    );
  } catch (err) {
    console.error("[Audit Log] Failed to record event:", err.message);
  }
}

/** Shallow diff of two flat objects — only the keys that actually changed,
 * `{ before, after }` per key. Used for "old vs new" log entries where the
 * route already has both rows in hand. */
export function diffFields(before = {}, after = {}, keys) {
  const changes = {};
  for (const k of keys) {
    const b = before?.[k] ?? null;
    const a = after?.[k] ?? null;
    if (String(b) !== String(a)) changes[k] = { before: b, after: a };
  }
  return Object.keys(changes).length ? changes : null;
}
