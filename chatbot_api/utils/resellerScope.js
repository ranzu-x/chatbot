/**
 * The ONLY place that reads or writes "a reseller's customers and their
 * users". Every function takes the reseller's agency id as its first argument
 * (always `req.tenant.resellerId`, derived server-side by middleware/tenant.js,
 * never anything the client sent) and every statement is anchored on
 * `agencies.parent_agency_id = resellerId`.
 *
 * Routes call these named functions instead of writing their own SQL, so
 * "reseller A can never reach reseller B's customers or users" is enforced in
 * one small, tested file rather than re-derived in each route handler. The
 * database backs this up independently (see migrate_tenant_isolation.js: the
 * agencies tree triggers stop a customer from being moved between resellers).
 *
 * routes/resellerCustomers.js is locked by `npm run lint:tenant`: it may not
 * run raw SQL, only call this module.
 */
import bcrypt from "bcrypt";
import pool from "../db.js";
import { assertLimit } from "./entitlements.js";
import { logAuditEvent } from "./auditLog.js";
import { invalidateTenantCache } from "../middleware/tenant.js";

export class TenantError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    if (code) this.code = code;
  }
}

// Neutral wording on purpose: it must not reveal whether an address belongs to
// a user of some other reseller.
export const EMAIL_UNAVAILABLE = "This email address can't be used. Please try a different one.";

// ── Reads ────────────────────────────────────────────────────────────────

export async function listCustomers(resellerId) {
  const [rows] = await pool.query(
    `SELECT a.id, a.name, a.slug, a.is_active, a.owner_id, u.name AS ownerName, u.email AS ownerEmail, a.created_at,
            acs.package_id AS agencyPackageId, ap.name AS agencyPackageName, acs.status AS subscriptionStatus
     FROM agencies a
     JOIN users u ON u.id = a.owner_id
     LEFT JOIN agency_client_subscriptions acs ON acs.client_agency_id = a.id AND acs.status = 'ACTIVE'
     LEFT JOIN agency_packages ap ON ap.id = acs.package_id
     WHERE a.parent_agency_id = ? AND a.account_type = 'RESELLER_CUSTOMER'
     ORDER BY a.created_at DESC`,
    [resellerId]
  );
  return rows;
}

export async function listCustomerUsers(resellerId) {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.address, u.avatar, u.role, u.created_at, u.updated_at,
            (u.is_active = 1 AND a.is_active = 1) AS is_active,
            a.id AS agencyId, a.name AS agencyName,
            acs.package_id AS package_id, ap.name AS packageName
     FROM agencies a
     JOIN users u ON u.id = a.owner_id
     LEFT JOIN agency_client_subscriptions acs ON acs.client_agency_id = a.id AND acs.status = 'ACTIVE'
     LEFT JOIN agency_packages ap ON ap.id = acs.package_id
     WHERE a.parent_agency_id = ? AND a.account_type = 'RESELLER_CUSTOMER'
     ORDER BY u.created_at DESC`,
    [resellerId]
  );
  return rows;
}

/** One customer workspace, only if it belongs to this reseller. */
export async function getCustomer(resellerId, agencyId) {
  const [[row]] = await pool.query(
    `SELECT id, name, is_active FROM agencies
     WHERE id = ? AND parent_agency_id = ? AND account_type = 'RESELLER_CUSTOMER'`,
    [agencyId, resellerId]
  );
  return row || null;
}

/** One customer owner's login, only if it belongs to this reseller. */
export async function getCustomerUser(resellerId, userId) {
  const [[row]] = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.address, u.is_active AS userActive,
            a.id AS agencyId, a.name AS agencyName, a.is_active AS agencyActive
     FROM agencies a
     JOIN users u ON u.id = a.owner_id
     WHERE u.id = ? AND a.parent_agency_id = ? AND a.account_type = 'RESELLER_CUSTOMER'
     LIMIT 1`,
    [userId, resellerId]
  );
  return row || null;
}

/** One of this reseller's own plans. */
export async function getResellerPackage(resellerId, packageId) {
  const [[row]] = await pool.query("SELECT id, name FROM agency_packages WHERE id = ? AND agency_id = ?", [packageId, resellerId]);
  return row || null;
}

async function getActivePackageId(customerAgencyId) {
  const [[row]] = await pool.query(
    "SELECT package_id FROM agency_client_subscriptions WHERE client_agency_id = ? AND status = 'ACTIVE' LIMIT 1",
    [customerAgencyId]
  );
  return row?.package_id ?? null;
}

// ── Writes ───────────────────────────────────────────────────────────────

/** One new customer workspace plus its owner login, under this reseller. */
export async function createCustomerAccount({ resellerId, actor, name, slug, ownerName, ownerEmail, ownerPassword, agencyPackageId, phone }) {
  try {
    await assertLimit(resellerId, "max_reseller_customers", 1, actor.id);
  } catch (limitErr) {
    throw new TenantError(403, limitErr.message || "Customer limit reached for your reseller plan.", "LIMIT_EXCEEDED");
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[existing]] = await conn.query("SELECT id FROM users WHERE email = ?", [ownerEmail]);
    if (existing) throw new TenantError(400, EMAIL_UNAVAILABLE);

    if (agencyPackageId) {
      const [[pkg]] = await conn.query("SELECT id FROM agency_packages WHERE id = ? AND agency_id = ?", [agencyPackageId, resellerId]);
      if (!pkg) throw new TenantError(400, "Package not found");
    }

    const hashed = await bcrypt.hash(ownerPassword, 10);
    // Created by a logged-in admin/reseller, who vouches for the address — so it's
    // marked verified directly instead of emailing a link (see utils/emailVerification.js).
    const [userResult] = await conn.query(
      "INSERT INTO users (name, email, password, role, phone, email_verified_at) VALUES (?, ?, ?, 'RESELLER', ?, NOW())",
      [ownerName, ownerEmail, hashed, phone || null]
    );
    const ownerId = userResult.insertId;
    const agencySlug = slug || `${name}-${Date.now().toString(36)}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    // The database refuses this insert unless resellerId really is a RESELLER
    // (trg_agencies_tree_bi), and fills the owner's home_agency_id itself.
    const [agencyResult] = await conn.query(
      "INSERT INTO agencies (name, slug, owner_id, account_type, parent_agency_id) VALUES (?, ?, ?, 'RESELLER_CUSTOMER', ?)",
      [name, agencySlug, ownerId, resellerId]
    );
    const customerId = agencyResult.insertId;

    const [[ownerRole]] = await conn.query("SELECT id FROM roles WHERE scope_type='AGENCY' AND agency_id IS NULL AND slug='owner'");
    if (ownerRole) {
      await conn.query(
        "INSERT INTO organization_members (user_id, agency_id, role_id, member_kind, chat_access) VALUES (?,?,?, 'OWNER', 'ALL')",
        [ownerId, customerId, ownerRole.id]
      );
    }

    if (agencyPackageId) {
      await conn.query(
        "INSERT INTO agency_client_subscriptions (agency_id, client_agency_id, package_id, provider, status, started_at, notes) VALUES (?, ?, ?, 'STRIPE', 'ACTIVE', NOW(), 'Assigned at customer creation')",
        [resellerId, customerId, agencyPackageId]
      );
    }

    await conn.commit();

    logAuditEvent({
      agencyId: resellerId, actor, action: "reseller_customer.create",
      entityType: "agency", entityId: customerId, entityLabel: name,
      summary: `Created customer "${name}" (owner: ${ownerEmail})`,
      targetAgencyId: customerId,
    });
    return { customerId, ownerId };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Edit a customer owner's details / status / plan. `target` must come from getCustomerUser. */
export async function updateCustomerUser(resellerId, actor, target, patch) {
  const { phone, address, isActive, newPassword, packageId } = patch;
  const name = patch.name !== undefined ? String(patch.name).trim() : undefined;
  const email = patch.email !== undefined ? String(patch.email).toLowerCase().trim() : undefined;

  if (name !== undefined && !name) throw new TenantError(400, "Name cannot be empty");
  if (email !== undefined) {
    if (!email) throw new TenantError(400, "Email cannot be empty");
    const [[clash]] = await pool.query("SELECT id FROM users WHERE email = ? AND id != ?", [email, target.id]);
    if (clash) throw new TenantError(400, EMAIL_UNAVAILABLE);
  }
  if (newPassword && String(newPassword).length < 6) throw new TenantError(400, "Password must be at least 6 characters");

  let newPackage = null;
  if (packageId && Number(packageId) !== Number(await getActivePackageId(target.agencyId))) {
    newPackage = await getResellerPackage(resellerId, packageId);
    if (!newPackage) throw new TenantError(400, "Package not found");
  }

  const fields = [];
  const values = [];
  if (name !== undefined) { fields.push("name = ?"); values.push(name); }
  if (email !== undefined) { fields.push("email = ?"); values.push(email); }
  if (phone !== undefined) { fields.push("phone = ?"); values.push(phone || null); }
  if (address !== undefined) { fields.push("address = ?"); values.push(address || null); }
  if (newPassword) { fields.push("password = ?"); values.push(await bcrypt.hash(newPassword, 10)); }
  if (typeof isActive === "boolean") { fields.push("is_active = ?"); values.push(isActive ? 1 : 0); }
  if (fields.length) {
    values.push(target.id);
    await pool.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values);
  }
  if (typeof isActive === "boolean") {
    await pool.query("UPDATE agencies SET is_active = ? WHERE id = ? AND parent_agency_id = ?", [isActive ? 1 : 0, target.agencyId, resellerId]);
    invalidateTenantCache();
  }

  let packageChange = null;
  if (newPackage) {
    await pool.query("UPDATE agency_client_subscriptions SET status='CANCELLED' WHERE client_agency_id = ? AND status='ACTIVE'", [target.agencyId]);
    await pool.query(
      "INSERT INTO agency_client_subscriptions (agency_id, client_agency_id, package_id, provider, status, started_at, notes) VALUES (?, ?, ?, 'STRIPE', 'ACTIVE', NOW(), 'Reassigned by reseller')",
      [resellerId, target.agencyId, newPackage.id]
    );
    packageChange = {
      toPackage: newPackage.name,
      note: "Existing data is always kept. If this plan's limits are lower than what the user already has, they simply can't add more of that resource until they're back under the limit or upgraded. Nothing is deleted automatically.",
    };
  }

  logAuditEvent({
    agencyId: resellerId, actor, action: "reseller_user.update",
    entityType: "user", entityId: target.id, entityLabel: name || target.name,
    summary: `Updated user "${target.name}"${packageChange ? ` — plan → ${packageChange.toPackage}` : ""}`,
    targetAgencyId: target.agencyId,
  });
  return { packageChange };
}

/** Flip a customer owner's status (stored on both the login and the workspace). */
export async function toggleCustomerUser(resellerId, actor, target) {
  const newStatus = target.userActive && target.agencyActive ? 0 : 1;
  await pool.query("UPDATE users SET is_active = ? WHERE id = ?", [newStatus, target.id]);
  await pool.query("UPDATE agencies SET is_active = ? WHERE id = ? AND parent_agency_id = ?", [newStatus, target.agencyId, resellerId]);
  invalidateTenantCache();
  logAuditEvent({
    agencyId: resellerId, actor, action: "reseller_user.toggle",
    entityType: "user", entityId: target.id, entityLabel: target.name,
    summary: `${newStatus ? "Activated" : "Deactivated"} user "${target.name}"`,
    targetAgencyId: target.agencyId,
  });
  return newStatus === 1;
}

/** Delete a customer owner, their workspace, and (if nothing else uses it) the login. */
export async function deleteCustomerUser(resellerId, actor, target) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Conversations first: conversations -> contacts is NO ACTION while both
    // cascade from the workspace, so deleting the workspace directly fails
    // (in whichever order MySQL happens to cascade) once it has any chats.
    await conn.query("DELETE FROM conversations WHERE agency_id = ?", [target.agencyId]);
    await conn.query("DELETE FROM agencies WHERE id = ? AND parent_agency_id = ?", [target.agencyId, resellerId]);
    const [[{ memberships }]] = await conn.query("SELECT COUNT(*) AS memberships FROM organization_members WHERE user_id = ?", [target.id]);
    if (!memberships) await conn.query("DELETE FROM users WHERE id = ? AND role != 'ADMIN'", [target.id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  invalidateTenantCache();
  logAuditEvent({
    agencyId: resellerId, actor, action: "reseller_user.delete",
    entityType: "user", entityId: target.id, entityLabel: target.name,
    summary: `Deleted user "${target.name}" (${target.email}) and their workspace`,
  });
}

/** Reassign a customer's plan. `customer` must come from getCustomer. */
export async function assignCustomerPackage(resellerId, actor, customer, packageId) {
  const pkg = await getResellerPackage(resellerId, packageId);
  if (!pkg) throw new TenantError(400, "Package not found");
  await pool.query("UPDATE agency_client_subscriptions SET status='CANCELLED' WHERE client_agency_id = ? AND status='ACTIVE'", [customer.id]);
  await pool.query(
    "INSERT INTO agency_client_subscriptions (agency_id, client_agency_id, package_id, provider, status, started_at, notes) VALUES (?, ?, ?, 'STRIPE', 'ACTIVE', NOW(), 'Reassigned by reseller')",
    [resellerId, customer.id, packageId]
  );
  logAuditEvent({
    agencyId: resellerId, actor, action: "reseller_customer.package_change",
    entityType: "agency", entityId: customer.id, entityLabel: customer.name,
    summary: `Changed "${customer.name}"'s plan to "${pkg.name}"`,
    targetAgencyId: customer.id,
  });
}

/** Flip a customer workspace's status. `customer` must come from getCustomer. */
export async function toggleCustomer(resellerId, actor, customer) {
  const newStatus = customer.is_active ? 0 : 1;
  await pool.query("UPDATE agencies SET is_active = ? WHERE id = ? AND parent_agency_id = ?", [newStatus, customer.id, resellerId]);
  invalidateTenantCache();
  logAuditEvent({
    agencyId: resellerId, actor, action: "reseller_customer.toggle",
    entityType: "agency", entityId: customer.id, entityLabel: customer.name,
    summary: `${newStatus ? "Activated" : "Deactivated"} customer "${customer.name}"`,
    changes: { is_active: { before: !!customer.is_active, after: newStatus === 1 } },
    targetAgencyId: customer.id,
  });
  return newStatus === 1;
}
