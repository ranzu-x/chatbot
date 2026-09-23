/**
 * Shared "is this tenant a Super Admin's own direct signup" predicate —
 * agencies.account_type DIRECT_CUSTOMER or RESELLER, never
 * RESELLER_CUSTOMER (a Reseller's own end user/customer). Used by any
 * feature scoped to "End Users and Resellers only" — today the Affiliate
 * program (utils/affiliateCommission.js) and the Forum
 * (middleware/forumAccess.js) — so the rule lives in exactly one place.
 */
const ELIGIBLE_ACCOUNT_TYPES = ["DIRECT_CUSTOMER", "RESELLER"];

export function isEligibleAccountType(accountType) {
  return ELIGIBLE_ACCOUNT_TYPES.includes(accountType);
}
