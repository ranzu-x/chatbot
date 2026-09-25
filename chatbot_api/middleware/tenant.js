/**
 * Tenant context — the one place that decides "which workspace is this
 * request acting inside, and is the caller really allowed to be there".
 *
 * Why this exists: routes used to trust `req.user.agencyId` straight from the
 * JWT and every query had to remember its own `WHERE agency_id = ?`. The
 * token is signed, so it can't be forged, but it is a snapshot: it says
 * nothing about whether the workspace was deactivated since, or whether the
 * user actually belongs to it. This middleware re-checks both against the
 * database on every authenticated request (with a short cache) and exposes a
 * server-derived `req.tenant` that routes use for scoping instead of anything
 * the client sent.
 *
 * Mounted once, globally, in index.js (see `tenantContext`). Public routes
 * (no token) pass straight through and keep using their own protections.
 *
 *   req.tenant = {
 *     agencyId,        // the workspace this request acts in
 *     accountType,     // PLATFORM | RESELLER | RESELLER_CUSTOMER | DIRECT_CUSTOMER
 *     resellerId,      // RESELLER -> its own id, RESELLER_CUSTOMER -> its parent, else null
 *     isPlatform, isReseller, isCustomerOfReseller,
 *   }
 */
import jwt from "jsonwebtoken";
import pool from "../db.js";

const CACHE_TTL_MS = 15000;
const cache = new Map(); // `${userId}:${agencyId}` -> { value, ts }

/** Drop cached tenant decisions (call after deactivating/moving workspaces or changing memberships). */
export function invalidateTenantCache() {
  cache.clear();
}

// Paths that must keep working for a deactivated/mismatched session so the
// client can log out cleanly and show the right message.
const EXEMPT_PREFIXES = ["/auth/"];

async function evaluate(userId, agencyId) {
  // Role and active flag come from the database, not the token.
  const [[dbUser]] = await pool.query("SELECT role, is_active, token_version FROM users WHERE id = ?", [userId]);
  // A deactivated (or deleted) user's still-valid token stops working right away, on every route.
  // Before this, only login and /auth/me looked at is_active, so a token issued before the
  // account was switched off kept full API access until it expired (up to 7 days).
  if (!dbUser || !dbUser.is_active) return { ok: false, status: 401, message: "Account is inactive or not found" };
  const role = dbUser.role;

  const [[agency]] = await pool.query(
    "SELECT id, account_type, parent_agency_id, is_active FROM agencies WHERE id = ?",
    [agencyId]
  );
  if (!agency) return { ok: false, status: 401, message: "Workspace not found" };

  const isPlatformStaff = role === "ADMIN";

  if (!isPlatformStaff) {
    if (!agency.is_active) {
      return { ok: false, status: 403, message: "This workspace has been deactivated. Please contact your administrator." };
    }
    // The caller must actually belong to this workspace: it is their home
    // workspace, or they hold a membership / agent profile in it.
    const [[belongs]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE id = ? AND home_agency_id = ?)
       + (SELECT COUNT(*) FROM organization_members WHERE user_id = ? AND agency_id = ? AND is_active = 1)
       + (SELECT COUNT(*) FROM agent_profiles WHERE user_id = ? AND agency_id = ?) AS n`,
      [userId, agencyId, userId, agencyId, userId, agencyId]
    );
    if (!belongs.n) {
      return { ok: false, status: 403, message: "You do not have access to this workspace." };
    }
  }

  const accountType = agency.account_type;
  return {
    ok: true,
    role,
    tokenVersion: Number(dbUser.token_version || 0),
    tenant: {
      agencyId: agency.id,
      accountType,
      resellerId:
        accountType === "RESELLER" ? agency.id : accountType === "RESELLER_CUSTOMER" ? agency.parent_agency_id : null,
      isPlatform: accountType === "PLATFORM",
      isReseller: accountType === "RESELLER",
      isCustomerOfReseller: accountType === "RESELLER_CUSTOMER",
    },
  };
}

async function evaluateCached(userId, agencyId) {
  const key = `${userId}:${agencyId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.value;
  const value = await evaluate(userId, agencyId);
  cache.set(key, { value, ts: Date.now() });
  return value;
}

/**
 * Every login token carries the user's token_version (`tv`, missing = 0); a
 * password reset bumps users.token_version, so every older session dies. A
 * counter rather than "issued before password_changed_at": the app server's
 * and the database's clocks may disagree.
 */
export function isTokenRevoked(decoded, result) {
  if (!result?.ok) return false;
  return Number(decoded?.tv || 0) !== Number(result.tokenVersion || 0);
}

/** Same decision the HTTP middleware makes, for callers outside a request (the socket layer). */
export async function checkTenantAccess(userId, agencyId) {
  return evaluateCached(userId, agencyId);
}

export const tenantContext = async (req, res, next) => {
  try {
    if (EXEMPT_PREFIXES.some((p) => req.path.startsWith(p))) return next();

    const token = req.cookies?.token || req.headers?.authorization?.split(" ")[1];
    if (!token) return next(); // public route; its own protections apply

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return next(); // authMiddleware on the route will answer 401
    }
    if (!decoded?.id || !decoded?.agencyId) return next();

    const result = await evaluateCached(decoded.id, decoded.agencyId);
    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.message, code: "TENANT_ACCESS_DENIED" });
    }
    if (isTokenRevoked(decoded, result)) {
      return res.status(401).json({ success: false, message: "Your password was changed. Please sign in again.", code: "SESSION_REVOKED" });
    }
    // userId/role come from the verified token + the database (the role is
    // re-read from users, not trusted from the token) — used by teamPermissions.
    req.tenant = { ...result.tenant, userId: decoded.id, role: result.role };
    return next();
  } catch (err) {
    console.error("tenantContext error:", err);
    return res.status(500).json({ success: false, message: "Workspace check failed" });
  }
};

/** Route guard: caller's workspace must be a RESELLER. Uses req.tenant, not a fresh client-influenced lookup. */
export const requireReseller = (req, res, next) => {
  if (!req.tenant?.isReseller) {
    return res.status(403).json({ success: false, message: "Only a reseller account can do this" });
  }
  next();
};
