/**
 * Forum access gates — composable with authMiddleware, mirrors
 * middleware/tenant.js's style. Two independent checks:
 *   - requireForumEligible: tenant must be DIRECT_CUSTOMER/RESELLER
 *     (utils/tenantEligibility.js) — never a Reseller's own
 *     RESELLER_CUSTOMER.
 *   - requireVerifiedEmail: users.email_verified_at must be set. Always
 *     re-checked fresh against the DB (never trusts the JWT snapshot) —
 *     same reasoning tenant.js documents for is_active: a token is signed,
 *     not live.
 */
import pool from "../db.js";
import { isEligibleAccountType } from "../utils/tenantEligibility.js";

// ADMIN (Platform staff) bypasses both checks below — they're trusted
// staff, not a customer tenant, so req.tenant.accountType is 'PLATFORM'
// (never eligible on its own) and there's no reason to make them verify an
// email to post an official "Staff" reply (see forum_replies.is_admin_reply).
export function requireForumEligible(req, res, next) {
  if (req.user?.role === "ADMIN") return next();
  if (!isEligibleAccountType(req.tenant?.accountType)) {
    return res.status(403).json({
      success: false,
      message: "The forum is only available to End User and Reseller accounts.",
      code: "FORUM_NOT_ELIGIBLE",
    });
  }
  next();
}

export async function requireVerifiedEmail(req, res, next) {
  if (req.user?.role === "ADMIN") return next();
  try {
    const [[row]] = await pool.query("SELECT email_verified_at FROM users WHERE id = ?", [req.user.id]);
    if (!row?.email_verified_at) {
      return res.status(403).json({
        success: false,
        message: "Please verify your email address before posting to the forum.",
        code: "EMAIL_NOT_VERIFIED",
      });
    }
    next();
  } catch (err) {
    console.error("requireVerifiedEmail error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}
