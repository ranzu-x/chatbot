/**
 * Account creation for flows that aren't the interactive /auth/register
 * endpoint — today just guest checkout (routes/billing.js's
 * consumePendingSignup), which always creates a brand-new DIRECT_CUSTOMER
 * agency owned by the buyer. Deliberately does NOT run /auth/register's
 * domain-resolution/reseller-signup/join-existing-workspace branches (see
 * routes/auth.js lines ~111-280) — a public Pricing-page buyer isn't
 * landing on any particular tenant's domain, so those branches don't apply.
 *
 * /auth/register itself is left untouched rather than refactored to call
 * this — it's a critical, already-working, heavily-branched path, and
 * duplicating this one shape here is a smaller risk than restructuring it.
 */
import pool from "../db.js";
import { attributeReferral } from "./affiliateCommission.js";

/**
 * Creates a new DIRECT_CUSTOMER agency + its owning RESELLER-role user +
 * an "owner" organization_members row, mirroring exactly the DB shape
 * routes/auth.js's bootstrapNoAgency branch creates (same three inserts),
 * just under a caller-supplied business name/slug instead of "Main
 * Workspace". `passwordHash` must already be bcrypt-hashed by the caller.
 *
 * `affiliateCode`, if present, attributes the new agency to the Super
 * Admin affiliate behind that referral code (see utils/affiliateCommission.js)
 * — this is the only self-serve flow that mints a brand-new top-level
 * tenant, so it's the only place referral attribution happens.
 *
 * Returns { userId, agencyId, agencyName }.
 */
export async function createAccount({ fullName, email, passwordHash, businessName, affiliateCode }) {
  const normalizedEmail = String(email).toLowerCase().trim();

  const [existing] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [normalizedEmail]);
  if (existing.length) {
    const err = new Error("An account with this email already exists");
    err.status = 400;
    throw err;
  }

  const agencyName = (businessName || `${fullName}'s Workspace`).trim();
  const slug = `${agencyName}-${Date.now().toString(36)}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const [userResult] = await pool.query(
    "INSERT INTO users (name, email, password, role, is_active, created_at) VALUES (?, ?, ?, 'RESELLER', 1, NOW())",
    [fullName, normalizedEmail, passwordHash]
  );
  const userId = userResult.insertId;

  const [agResult] = await pool.query(
    "INSERT INTO agencies (name, slug, owner_id, is_active, account_type) VALUES (?, ?, ?, 1, 'DIRECT_CUSTOMER')",
    [agencyName, slug, userId]
  );
  const agencyId = agResult.insertId;

  const [[ownerRole]] = await pool.query("SELECT id FROM roles WHERE scope_type='AGENCY' AND agency_id IS NULL AND slug='owner'");
  if (ownerRole) {
    await pool.query(
      "INSERT INTO organization_members (user_id, agency_id, role_id, member_kind, chat_access) VALUES (?,?,?, 'OWNER', 'ALL')",
      [userId, agencyId, ownerRole.id]
    );
  }

  if (affiliateCode) {
    await attributeReferral(agencyId, affiliateCode);
  }

  console.log(`[Guest Checkout] User "${fullName}" (${normalizedEmail}) created new workspace "${agencyName}" (Agency ID ${agencyId})`);

  return { userId, agencyId, agencyName };
}
