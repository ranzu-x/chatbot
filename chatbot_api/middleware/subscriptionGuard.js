import { getSubscriptionState, EXPIRED_MESSAGE } from "../utils/subscriptionStatus.js";

/**
 * Read-only mode for a workspace whose plan has expired (utils/subscriptionStatus.js).
 * Mounted right after tenantContext. Reads always pass; writes answer
 * 402 SUBSCRIPTION_EXPIRED — except what someone needs to get out of it:
 * signing in/out and account security, billing (renewing), and their own
 * notifications. The Super Admin is never limited.
 */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const ALWAYS_ALLOWED = [
  /^\/auth\//,
  /^\/billing\//,
  /^\/customer-billing\//, // a reseller's customer paying its reseller (utils/resellerBilling.js)
  /^\/me\/notifications/,
  /^\/notifications\/(read|mark)/,
];

export async function subscriptionGuard(req, res, next) {
  if (READ_METHODS.has(req.method) || !req.tenant?.agencyId || req.tenant?.role === "ADMIN") return next();
  if (ALWAYS_ALLOWED.some((re) => re.test(req.path))) return next();
  const state = await getSubscriptionState(req.tenant.agencyId);
  if (!state.expired) return next();
  return res.status(402).json({
    success: false,
    code: "SUBSCRIPTION_EXPIRED",
    message: state.source === "RESELLER"
      ? "Your provider's plan has expired, so this workspace is read-only for now. Please contact your provider."
      : EXPIRED_MESSAGE,
    endsAt: state.endsAt,
  });
}
