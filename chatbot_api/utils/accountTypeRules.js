import pool from "../db.js";

/**
 * What kind of account a workspace is follows its package (decided with the user):
 *
 *   - An End User workspace (DIRECT_CUSTOMER) that gets a Reseller package
 *     (packages.type = 'AGENCY') becomes a Reseller.
 *   - A Reseller is permanent. Moving it to an End User package (e.g. by
 *     mistake) changes its plan only — it stays a Reseller, and its customers,
 *     their users and their subscribers are all kept. The database enforces this
 *     too (trg_agencies_tree_bu, migrate_reseller_permanent.js).
 *   - A reseller's customer (RESELLER_CUSTOMER) never changes type.
 *
 * Returns { agencyId, change: 'PROMOTED' | 'STAYS_RESELLER' | 'NONE' }.
 */
export async function applyPackageAccountType({ agencyId = null, userId = null, packageId }, db = pool) {
  const [[pkg]] = await db.query("SELECT id, type FROM packages WHERE id = ?", [packageId]);
  if (!pkg) return { agencyId, change: "NONE" };

  let workspace = null;
  if (agencyId) {
    [[workspace]] = await db.query("SELECT id, account_type, owner_id FROM agencies WHERE id = ?", [agencyId]);
  } else if (userId) {
    [[workspace]] = await db.query(
      "SELECT id, account_type, owner_id FROM agencies WHERE owner_id = ? AND account_type IN ('DIRECT_CUSTOMER','RESELLER') ORDER BY id LIMIT 1",
      [userId]
    );
  }
  if (!workspace) return { agencyId, change: "NONE" };

  const isResellerPackage = String(pkg.type).toUpperCase() === "AGENCY";
  if (workspace.account_type === "RESELLER") {
    return { agencyId: workspace.id, change: isResellerPackage ? "NONE" : "STAYS_RESELLER" };
  }
  if (workspace.account_type !== "DIRECT_CUSTOMER" || !isResellerPackage) return { agencyId: workspace.id, change: "NONE" };

  const [upd] = await db.query("UPDATE agencies SET account_type = 'RESELLER' WHERE id = ? AND account_type = 'DIRECT_CUSTOMER'", [workspace.id]);
  if (upd.affectedRows !== 1) return { agencyId: workspace.id, change: "NONE" };
  const [[resellerRole]] = await db.query("SELECT id FROM roles WHERE scope_type = 'RESELLER' AND agency_id IS NULL AND slug = 'reseller_owner'");
  if (resellerRole && workspace.owner_id) {
    await db.query("UPDATE organization_members SET role_id = ? WHERE agency_id = ? AND user_id = ?", [resellerRole.id, workspace.id, workspace.owner_id]);
  }
  const { invalidateTenantCache } = await import("../middleware/tenant.js");
  invalidateTenantCache();
  console.log(`[Account type] Workspace #${workspace.id} is now a Reseller (package #${pkg.id})`);
  return { agencyId: workspace.id, change: "PROMOTED" };
}

/** Plain-language note for the Super Admin after a package change. */
export function accountTypeNote(change) {
  if (change === "PROMOTED") return "This account is now a Reseller: it can create its own customers. A Reseller stays a Reseller.";
  if (change === "STAYS_RESELLER") return "This account stays a Reseller — a Reseller is never turned back into an End User. Only its plan changed; its customers, their users and their subscribers are all kept.";
  return null;
}

/**
 * Why a user can't be deleted on their own, or null. A Reseller's owner and
 * every user of the Reseller's customers are removed only by deleting the
 * Reseller itself (Super Admin → Resellers).
 */
export async function userDeleteBlocker(userId, db = pool) {
  const [[owned]] = await db.query("SELECT id, name FROM agencies WHERE owner_id = ? AND account_type = 'RESELLER' LIMIT 1", [userId]);
  if (owned) return `This is the owner of the Reseller "${owned.name}". A Reseller's users are removed only by deleting the Reseller (Resellers page).`;
  const [[under]] = await db.query(
    `SELECT r.name FROM users u
       JOIN agencies a ON a.id = u.home_agency_id AND a.account_type = 'RESELLER_CUSTOMER'
       JOIN agencies r ON r.id = a.parent_agency_id
      WHERE u.id = ?
      UNION
     SELECT r.name FROM agencies a JOIN agencies r ON r.id = a.parent_agency_id
      WHERE a.owner_id = ? AND a.account_type = 'RESELLER_CUSTOMER'
      LIMIT 1`,
    [userId, userId]
  );
  if (under) return `This user belongs to the Reseller "${under.name}". A Reseller's users are removed only by deleting the Reseller (Resellers page).`;
  const [[inReseller]] = await db.query(
    `SELECT a.name FROM users u JOIN agencies a ON a.id = u.home_agency_id AND a.account_type = 'RESELLER' WHERE u.id = ?`,
    [userId]
  );
  if (inReseller) return `This user is on the team of the Reseller "${inReseller.name}". Remove them from that Reseller's Team Members, or delete the Reseller.`;
  return null;
}
