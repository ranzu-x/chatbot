/**
 * Granular permission middleware — layers on top of (does not replace)
 * authMiddleware/roleMiddleware. Looks up the caller's organization_members
 * row for the workspace they're acting in (req.user.agencyId, resolved at
 * login — see routes/auth.js) and checks its role's permission set.
 *
 * Deliberately a live DB query per gated request (same style as
 * utils/entitlements.js's assertLimit) rather than trusting a permission
 * list baked into the JWT — a revoked permission must take effect
 * immediately, without waiting for the user's token to expire/refresh.
 * A short in-memory cache on (role_id -> permission keys) keeps this cheap;
 * routes/roles.js calls invalidateRoleCache() whenever a role's permissions
 * change so edits apply right away.
 */
import pool from "../db.js";

const CACHE_TTL_MS = 30000;
const roleCache = new Map(); // role_id -> { keys: Set<string>, ts: number }

async function getRolePermissionKeys(roleId) {
  const cached = roleCache.get(roleId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.keys;
  const [rows] = await pool.query("SELECT permission_key FROM role_permissions WHERE role_id = ?", [roleId]);
  const keys = new Set(rows.map((r) => r.permission_key));
  roleCache.set(roleId, { keys, ts: Date.now() });
  return keys;
}

export function invalidateRoleCache(roleId = null) {
  if (roleId) roleCache.delete(roleId);
  else roleCache.clear();
}

/**
 * Loads (and caches on req) the caller's organization_members row for
 * req.user.agencyId. Returns null if no membership exists.
 */
export async function loadOrgMember(req) {
  if (req._orgMember !== undefined) return req._orgMember;
  if (!req.user?.id || !req.user?.agencyId) {
    req._orgMember = null;
    return null;
  }
  const [rows] = await pool.query(
    "SELECT id, user_id, agency_id, role_id, member_kind, chat_access, is_active FROM organization_members WHERE user_id = ? AND agency_id = ? LIMIT 1",
    [req.user.id, req.user.agencyId]
  );
  req._orgMember = rows.length && rows[0].is_active ? rows[0] : null;
  return req._orgMember;
}

/**
 * requirePermission('a.b', 'a.c') passes if the caller's role has ANY of
 * the listed keys (OR semantics, matching roleMiddleware's multi-role OR
 * pattern). Sets req.orgMember for downstream handlers that need it (e.g.
 * to scope a query by organization_member_id for channel/chat access).
 */
export const requirePermission = (...permissionKeys) => {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
    try {
      const member = await loadOrgMember(req);
      if (!member) {
        return res.status(403).json({ success: false, message: "Forbidden: no active membership for this workspace" });
      }
      req.orgMember = member;
      const keys = await getRolePermissionKeys(member.role_id);
      const allowed = permissionKeys.length === 0 || permissionKeys.some((k) => keys.has(k));
      if (!allowed) {
        return res.status(403).json({ success: false, message: `Forbidden: requires one of [${permissionKeys.join(", ")}]` });
      }
      next();
    } catch (err) {
      console.error("permissionMiddleware error:", err);
      return res.status(500).json({ success: false, message: "Authorization check failed" });
    }
  };
};
