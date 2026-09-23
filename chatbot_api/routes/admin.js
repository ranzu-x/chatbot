import express from "express";
import crypto from "crypto";
import bcrypt from "bcrypt";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { assignPackageLocally } from "../services/stripeService.js";
import { logAuditEvent, diffFields } from "../utils/auditLog.js";
import { invalidateTenantCache } from "../middleware/tenant.js";

const router = express.Router();

// Every /admin/* route requires a real login; the FINE-GRAINED gate is now
// requirePermission(...) per route below (not a blanket role==='ADMIN'
// check) so a Super Admin's own internal team member (Support/Sales/
// Finance/Technical Admin — see migrate_saas_hierarchy.js's seeded roles)
// only reaches what their role actually grants. A true Super Admin's
// seeded role has every permission key, so nothing changes for them.
router.use(authMiddleware);

// ─── GET DASHBOARD STATS ──────────────────────────────────────────────────────
router.get("/admin/stats", requirePermission("admin.stats.view", "admin.dashboard.view"), async (req, res) => {
  try {
    const [[{ totalAgencies }]] = await pool.query("SELECT COUNT(*) as totalAgencies FROM agencies WHERE account_type='DIRECT_CUSTOMER'");
    const [[{ totalResellers }]] = await pool.query("SELECT COUNT(*) as totalResellers FROM agencies WHERE account_type='RESELLER'");
    const [[{ totalResellerCustomers }]] = await pool.query("SELECT COUNT(*) as totalResellerCustomers FROM agencies WHERE account_type='RESELLER_CUSTOMER'");
    const [[{ totalAgents }]] = await pool.query("SELECT COUNT(*) as totalAgents FROM agent_profiles");
    const [[{ totalConversations }]] = await pool.query("SELECT COUNT(*) as totalConversations FROM conversations");
    const [[{ totalMessages }]] = await pool.query("SELECT COUNT(*) as totalMessages FROM messages");

    return res.json({
      success: true,
      stats: { totalAgencies, totalResellers, totalResellerCustomers, totalAgents, totalConversations, totalMessages },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET AGENCIES (Direct Customers + Resellers, one unified list) ───────────
// Agencies and Resellers used to be two separate Super Admin pages even
// though they're the exact same `agencies` row shape — a Reseller is simply
// an Agency that's also allowed to create its own sub-customers under a
// shared plan. Merged into one list here; `accountType` distinguishes them
// (still needed internally — billing pools, the Users page's reseller-
// customer filtering, custom-domain signup, AI credential inheritance all
// key off it) and is exposed as a plain field/badge rather than a separate
// page. Reseller customers themselves are still excluded from this list —
// they're reached via the "Customers" count/drill-down on their parent's
// row (GET /admin/agencies/:id/customers, below) — that hasn't changed.
router.get("/admin/agencies", requirePermission("admin.agencies.view", "admin.agencies.manage"), async (req, res) => {
  try {
    const [agencies] = await pool.query(`
      SELECT a.*, u.name as ownerName, u.email as ownerEmail,
             p.name as packageName,
             COUNT(DISTINCT ap.id) as agentCount,
             (SELECT COUNT(*) FROM agencies c WHERE c.parent_agency_id = a.id AND c.account_type='RESELLER_CUSTOMER') AS customerCount,
             -- Team members across this agency's own org, plus (for a
             -- Reseller) every customer org underneath it.
             (SELECT COUNT(DISTINCT om.user_id) FROM organization_members om
                WHERE om.agency_id = a.id
                   OR om.agency_id IN (SELECT id FROM agencies c WHERE c.parent_agency_id = a.id AND c.account_type='RESELLER_CUSTOMER')
             ) AS userCount,
             -- Subscribers (contacts) likewise summed across this agency
             -- plus any reseller-customers underneath it.
             (SELECT COUNT(*) FROM contacts ct
                WHERE ct.agency_id = a.id
                   OR ct.agency_id IN (SELECT id FROM agencies c WHERE c.parent_agency_id = a.id AND c.account_type='RESELLER_CUSTOMER')
             ) AS subscriberCount
      FROM agencies a
      JOIN users u ON u.id = a.owner_id
      LEFT JOIN agent_profiles ap ON ap.agency_id = a.id
      LEFT JOIN packages p ON p.id = a.package_id
      WHERE a.account_type IN ('DIRECT_CUSTOMER', 'RESELLER')
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `);
    return res.json({ success: true, agencies });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── LIST ONE AGENCY'S RESELLER-CUSTOMERS (only meaningful for a Reseller) ───
// Same query routes/resellers.js used to expose at GET /admin/resellers/:id/customers.
router.get("/admin/agencies/:id/customers", requirePermission("admin.agencies.view", "admin.agencies.manage"), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT a.id, a.name, a.slug, a.is_active, a.owner_id, u.name AS ownerName, u.email AS ownerEmail, a.created_at,
             acs.package_id AS agencyPackageId, ap.name AS agencyPackageName
      FROM agencies a
      JOIN users u ON u.id = a.owner_id
      LEFT JOIN agency_client_subscriptions acs ON acs.client_agency_id = a.id AND acs.status = 'ACTIVE'
      LEFT JOIN agency_packages ap ON ap.id = acs.package_id
      WHERE a.parent_agency_id = ? AND a.account_type = 'RESELLER_CUSTOMER'
      ORDER BY a.created_at DESC
    `, [req.params.id]);
    return res.json({ success: true, customers: rows });
  } catch (err) {
    console.error("GET /admin/agencies/:id/customers error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE AGENCY (+ owner user), optionally as a Reseller ──────────────────
router.post("/admin/agencies", requirePermission("admin.agencies.manage"), async (req, res) => {
  // Accepts both `agencyName` (this route's original documented shape) and
  // plain `name` — chatbot_ui's AgenciesPage.jsx create-modal was found to
  // post `name`, which meant every create here 400'd; fixed defensively on
  // both ends rather than only in the frontend.
  const { agencyName, name, ownerName, ownerEmail, ownerPassword, slug, website, isReseller, packageId } = req.body;
  const resolvedAgencyName = agencyName || name;
  if (!resolvedAgencyName || !ownerName || !ownerEmail || !ownerPassword)
    return res.status(400).json({ success: false, message: "All fields are required" });

  const accountType = isReseller ? "RESELLER" : "DIRECT_CUSTOMER";
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.query("SELECT id FROM users WHERE email = ?", [ownerEmail]);
    if (existing) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Email already in use" });
    }

    const hashed = await bcrypt.hash(ownerPassword, 10);
    // Created by a logged-in admin/reseller, who vouches for the address — so it's
    // marked verified directly instead of emailing a link (see utils/emailVerification.js).
    const [userResult] = await conn.query(
      "INSERT INTO users (name, email, password, role, email_verified_at) VALUES (?, ?, ?, 'RESELLER', NOW())",
      [ownerName, ownerEmail, hashed]
    );
    const ownerId = userResult.insertId;

    const agencySlug = slug || resolvedAgencyName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const [agencyResult] = await conn.query(
      "INSERT INTO agencies (name, slug, website, owner_id, account_type, package_id) VALUES (?, ?, ?, ?, ?, ?)",
      [resolvedAgencyName, agencySlug, website || null, ownerId, accountType, isReseller ? (packageId || null) : null]
    );
    const agencyId = agencyResult.insertId;

    const roleSlug = isReseller ? "reseller_owner" : "owner";
    const roleScope = isReseller ? "RESELLER" : "AGENCY";
    const [[ownerRole]] = await conn.query("SELECT id FROM roles WHERE scope_type=? AND agency_id IS NULL AND slug=?", [roleScope, roleSlug]);
    if (ownerRole) {
      await conn.query(
        "INSERT INTO organization_members (user_id, agency_id, role_id, member_kind, chat_access) VALUES (?,?,?, 'OWNER', 'ALL')",
        [ownerId, agencyId, ownerRole.id]
      );
    }
    if (isReseller && packageId) {
      await conn.query(
        "INSERT INTO subscriptions (agency_id, package_id, status, started_at, notes) VALUES (?, ?, 'ACTIVE', NOW(), 'Assigned at creation')",
        [agencyId, packageId]
      );
    }

    // Auto-generate an unbranded random verify token for webhooks (no company/branding names)
    // — one placeholder ACTIVE slot per platform group (WhatsApp and
    // Messenger+Instagram are separate Meta apps), so the webhook GET
    // verification handshake has something to match even before the agency
    // configures real app credentials.
    for (const group of ["WHATSAPP", "MESSENGER_INSTAGRAM"]) {
      const initialVerifyToken = crypto.randomBytes(16).toString("hex");
      await conn.query(
        "INSERT INTO meta_app_pool (agency_id, platform_group, slot_role, verify_token, is_configured, is_active) VALUES (?, ?, 'ACTIVE', ?, 0, 1)",
        [agencyId, group, initialVerifyToken]
      );
    }

    await conn.commit();

    logAuditEvent({
      agencyId: req.user.agencyId, actor: req.user, action: "agency.create",
      entityType: "agency", entityId: agencyId, entityLabel: resolvedAgencyName,
      summary: `Created ${accountType === "RESELLER" ? "reseller" : "agency"} "${resolvedAgencyName}" (owner: ${ownerEmail})`,
      targetAgencyId: agencyId,
    });

    return res.status(201).json({ success: true, message: "Agency created successfully", agencyId });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
});

// ─── TOGGLE AGENCY ACTIVE STATUS (quick switch) ──────────────────────────────
router.patch("/admin/agencies/:id/toggle", requirePermission("admin.agencies.manage"), async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT is_active, name FROM agencies WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Agency not found" });
    const newStatus = !rows[0].is_active;
    await pool.query("UPDATE agencies SET is_active = ? WHERE id = ?", [newStatus, req.params.id]);
    invalidateTenantCache(); // deactivation must lock the workspace out immediately

    logAuditEvent({
      agencyId: req.user.agencyId, actor: req.user, action: "agency.toggle",
      entityType: "agency", entityId: Number(req.params.id), entityLabel: rows[0].name,
      summary: `${newStatus ? "Activated" : "Deactivated"} agency "${rows[0].name}"`,
      changes: { is_active: { before: !!rows[0].is_active, after: newStatus } },
      targetAgencyId: Number(req.params.id),
    });

    return res.json({ success: true, isActive: newStatus });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── FULL EDIT (name/website/plan/active/reseller toggle + owner login) ─────
// Same "full edit" surface the old dedicated Resellers page had — now works
// for either type from the one merged list, including converting a plain
// Agency into a Reseller (or back), which is the whole point of merging them:
// "Reseller" is just a capability toggle on an Agency, not a separate thing.
router.patch("/admin/agencies/:id", requirePermission("admin.agencies.manage"), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [[agency]] = await conn.query(
      "SELECT id, owner_id, account_type, name, website, is_active FROM agencies WHERE id = ? AND account_type IN ('DIRECT_CUSTOMER','RESELLER')",
      [req.params.id]
    );
    if (!agency) return res.status(404).json({ success: false, message: "Agency not found" });

    const { isActive, packageId, name, website, ownerName, ownerEmail, ownerPassword, isReseller } = req.body;

    await conn.beginTransaction();

    if (typeof isActive === "boolean") {
      await conn.query("UPDATE agencies SET is_active = ? WHERE id = ?", [isActive ? 1 : 0, req.params.id]);
      invalidateTenantCache();
    }
    if (name) {
      await conn.query("UPDATE agencies SET name = ? WHERE id = ?", [name, req.params.id]);
    }
    if (website !== undefined) {
      await conn.query("UPDATE agencies SET website = ? WHERE id = ?", [website || null, req.params.id]);
    }

    // Reseller capability toggle. Demoting one that still has customers
    // would orphan them (same guard already used before deleting an
    // agency), so that direction is refused rather than silently allowed.
    if (typeof isReseller === "boolean") {
      const currentlyReseller = agency.account_type === "RESELLER";
      if (isReseller && !currentlyReseller) {
        await conn.query("UPDATE agencies SET account_type = 'RESELLER' WHERE id = ?", [req.params.id]);
        const [[resellerRole]] = await conn.query("SELECT id FROM roles WHERE scope_type='RESELLER' AND agency_id IS NULL AND slug='reseller_owner'");
        if (resellerRole) {
          await conn.query(
            "UPDATE organization_members SET role_id = ? WHERE agency_id = ? AND user_id = ?",
            [resellerRole.id, req.params.id, agency.owner_id]
          );
        }
      } else if (!isReseller && currentlyReseller) {
        const [[{ childCount }]] = await conn.query("SELECT COUNT(*) AS childCount FROM agencies WHERE parent_agency_id = ?", [req.params.id]);
        if (childCount > 0) {
          await conn.rollback();
          return res.status(400).json({ success: false, message: `Can't remove reseller capability — this account still has ${childCount} customer(s) under it` });
        }
        await conn.query("UPDATE agencies SET account_type = 'DIRECT_CUSTOMER' WHERE id = ?", [req.params.id]);
        const [[ownerRole]] = await conn.query("SELECT id FROM roles WHERE scope_type='AGENCY' AND agency_id IS NULL AND slug='owner'");
        if (ownerRole) {
          await conn.query(
            "UPDATE organization_members SET role_id = ? WHERE agency_id = ? AND user_id = ?",
            [ownerRole.id, req.params.id, agency.owner_id]
          );
        }
      }
    }

    if (packageId && agency.account_type !== "PLATFORM") {
      await conn.query("UPDATE agencies SET package_id = ? WHERE id = ?", [packageId, req.params.id]);
      await conn.query("UPDATE subscriptions SET status='CANCELLED' WHERE agency_id = ? AND status='ACTIVE'", [req.params.id]);
      await conn.query(
        "INSERT INTO subscriptions (agency_id, package_id, status, started_at, notes) VALUES (?, ?, 'ACTIVE', NOW(), 'Reassigned by Super Admin')",
        [req.params.id, packageId]
      );
    }

    if (ownerName) {
      await conn.query("UPDATE users SET name = ? WHERE id = ?", [ownerName, agency.owner_id]);
    }
    if (ownerEmail) {
      const [[existing]] = await conn.query("SELECT id FROM users WHERE email = ? AND id != ?", [ownerEmail, agency.owner_id]);
      if (existing) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: "That email is already in use by another user" });
      }
      await conn.query("UPDATE users SET email = ? WHERE id = ?", [ownerEmail, agency.owner_id]);
    }
    if (ownerPassword) {
      if (ownerPassword.length < 6) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
      }
      const hashed = await bcrypt.hash(ownerPassword, 10);
      await conn.query("UPDATE users SET password = ? WHERE id = ?", [hashed, agency.owner_id]);
    }

    await conn.commit();

    logAuditEvent({
      agencyId: req.user.agencyId, actor: req.user, action: "agency.update",
      entityType: "agency", entityId: Number(req.params.id), entityLabel: name || agency.name,
      summary: `Updated agency "${agency.name}"`,
      changes: diffFields(agency, { name: name ?? agency.name, website: website !== undefined ? (website || null) : agency.website, is_active: typeof isActive === "boolean" ? (isActive ? 1 : 0) : agency.is_active }, ["name", "website", "is_active"]),
      targetAgencyId: Number(req.params.id),
    });

    return res.json({ success: true, message: "Agency updated" });
  } catch (err) {
    await conn.rollback();
    console.error("PATCH /admin/agencies/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
});

// ─── DELETE AGENCY ────────────────────────────────────────────────────────────
router.delete("/admin/agencies/:id", requirePermission("admin.agencies.manage"), async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT account_type, name FROM agencies WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Agency not found" });
    if (rows[0].account_type === "PLATFORM") {
      return res.status(400).json({ success: false, message: "The platform account cannot be deleted" });
    }
    // Guard against silently orphaning reseller customers (agencies.parent_agency_id
    // has ON DELETE SET NULL, which would otherwise leave them parentless).
    const [[{ childCount }]] = await pool.query("SELECT COUNT(*) AS childCount FROM agencies WHERE parent_agency_id = ?", [req.params.id]);
    if (childCount > 0) {
      return res.status(400).json({ success: false, message: `Cannot delete — this account still has ${childCount} customer(s) under it` });
    }
    // Conversations first (conversations -> contacts is NO ACTION, so the
    // workspace cascade fails once it has any chats).
    await pool.query("DELETE FROM conversations WHERE agency_id = ?", [req.params.id]);
    await pool.query("DELETE FROM agencies WHERE id = ?", [req.params.id]);

    logAuditEvent({
      agencyId: req.user.agencyId, actor: req.user, action: "agency.delete",
      entityType: "agency", entityId: Number(req.params.id), entityLabel: rows[0].name,
      summary: `Deleted agency "${rows[0].name}"`,
    });

    return res.json({ success: true, message: "Agency deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET ALL USERS ────────────────────────────────────────────────────────────
// Supports ?accountType=DIRECT_CUSTOMER|RESELLER_CUSTOMER|RESELLER|PLATFORM
// so the Users page can filter server-side (reseller customers must never
// appear in the plain Direct Customer view — see the approved plan §15).
//
// By default (no ?accountType param) this list shows ALL users — agency owners,
// agents, and end-users — but intentionally excludes:
//   1. The Super Admin's OWN internal team members (Support/Sales/Finance/Technical
//      Admin stored in the PLATFORM agency). Those have their own dedicated
//      /admin/team page and must not pollute the end-user list.
//   2. Reseller-customer agency owners — they appear via the Agencies drill-down
//      (GET /admin/agencies/:id/customers) and are excluded unless the caller
//      explicitly passes ?accountType=RESELLER_CUSTOMER.
router.get("/admin/users", requirePermission("admin.users.view", "admin.users.manage"), async (req, res) => {
  try {
    const { accountType } = req.query;
    const params = [];
    const conditions = [];

    if (accountType) {
      // Explicit filter — show only users whose agency matches the requested type
      conditions.push("a.account_type = ?");
      params.push(accountType);
    } else {
      // Default view: exclude reseller-customer agency owners (they show in the
      // Agencies drill-down, not here) but include everyone else (AGENCY owners,
      // AGENTs, users with no org membership at all, etc.)
      conditions.push("(a.account_type IS NULL OR a.account_type != 'RESELLER_CUSTOMER')");
    }

    // Always exclude the Super Admin's own internal platform team members.
    // These are users whose ONLY organization membership is inside the PLATFORM
    // agency with member_kind='TEAM_MEMBER' — they have the /admin/team page.
    conditions.push(`
      NOT EXISTS (
        SELECT 1 FROM organization_members om_plat
        JOIN agencies a_plat ON a_plat.id = om_plat.agency_id
        WHERE om_plat.user_id = u.id
          AND a_plat.account_type = 'PLATFORM'
          AND om_plat.member_kind = 'TEAM_MEMBER'
      )
    `);

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const [users] = await pool.query(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.is_active, u.avatar, u.package_id, u.created_at, u.updated_at,
              om.agency_id, om.member_kind, r.slug AS roleSlug, r.name AS roleName,
              a.name AS agencyName, a.account_type AS accountType, a.parent_agency_id AS parentAgencyId,
              pa.name AS resellerName
       FROM users u
       LEFT JOIN organization_members om ON om.user_id = u.id
       LEFT JOIN roles r ON r.id = om.role_id
       LEFT JOIN agencies a ON a.id = om.agency_id
       LEFT JOIN agencies pa ON pa.id = a.parent_agency_id
       ${where}
       ORDER BY u.created_at DESC`,
      params
    );
    return res.json({ success: true, users });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── TOGGLE USER STATUS ───────────────────────────────────────────────────────
router.patch("/admin/users/:id/toggle", requirePermission("admin.users.manage"), async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT is_active, name FROM users WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "User not found" });
    const newStatus = rows[0].is_active ? 0 : 1;
    await pool.query("UPDATE users SET is_active = ? WHERE id = ?", [newStatus, req.params.id]);
    invalidateTenantCache();

    logAuditEvent({
      agencyId: req.user.agencyId, actor: req.user, action: "user.toggle",
      entityType: "user", entityId: Number(req.params.id), entityLabel: rows[0].name,
      summary: `${newStatus ? "Activated" : "Deactivated"} user "${rows[0].name}"`,
      changes: { is_active: { before: !!rows[0].is_active, after: newStatus === 1 } },
    });

    return res.json({ success: true, isActive: newStatus === 1 });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE USER (raw — no organization membership; kept for backward
//      compatibility with existing callers) ───────────────────────────────
router.post("/admin/users", requirePermission("admin.users.manage"), async (req, res) => {
  try {
    const { name, email, password, role = "USER" } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "Name, email, and password are required" });
    }

    const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length) {
      return res.status(400).json({ success: false, message: "Email is already in use" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      // Created by an admin, who vouches for the address — marked verified directly.
      "INSERT INTO users (name, email, password, role, is_active, created_at, email_verified_at) VALUES (?, ?, ?, ?, 1, NOW(), NOW())",
      [name, email, hashedPassword, role]
    );

    const [created] = await pool.query("SELECT id, name, email, role, is_active, created_at FROM users WHERE id = ?", [result.insertId]);

    logAuditEvent({
      agencyId: req.user.agencyId, actor: req.user, action: "user.create",
      entityType: "user", entityId: result.insertId, entityLabel: name,
      summary: `Created user "${name}" (${email}, role ${role})`,
    });

    return res.status(201).json({ success: true, user: created[0] });
  } catch (err) {
    console.error("Create user error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── UPDATE USER — the Super Admin "User Edit" screen ────────────────────────
// name/email/password/phone/address/package/status, per the approved plan
// (§15). Package downgrade/over-limit NEVER deletes data — assertLimit
// (utils/entitlements.js) only blocks *new* creation once over a reduced
// limit; existing rows are always left alone. Reuses
// services/stripeService.js's assignPackageLocally for the reassignment
// itself, same helper the Stripe checkout/webhook flow already uses.
router.put("/admin/users/:id", requirePermission("admin.users.manage"), async (req, res) => {
  try {
    const { name, email, role, phone, address, packageId, isActive, newPassword } = req.body;
    const [existingRows] = await pool.query("SELECT * FROM users WHERE id = ?", [req.params.id]);
    if (!existingRows.length) return res.status(404).json({ success: false, message: "User not found" });
    const existing = existingRows[0];

    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push("name = ?"); values.push(name); }
    if (email !== undefined) { fields.push("email = ?"); values.push(email); }
    if (role !== undefined) { fields.push("role = ?"); values.push(role); }
    if (phone !== undefined) { fields.push("phone = ?"); values.push(phone); }
    if (address !== undefined) { fields.push("address = ?"); values.push(address); }
    if (typeof isActive === "boolean") { fields.push("is_active = ?"); values.push(isActive ? 1 : 0); }
    if (newPassword) { fields.push("password = ?"); values.push(await bcrypt.hash(newPassword, 10)); }

    if (fields.length) {
      values.push(req.params.id);
      await pool.query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values);
    }

    let packageChange = null;
    if (packageId && existing.role !== "ADMIN" && Number(packageId) !== Number(existing.package_id)) {
      const [[targetPkg]] = await pool.query("SELECT * FROM packages WHERE id = ?", [packageId]);
      if (!targetPkg) return res.status(400).json({ success: false, message: "Package not found" });
      await assignPackageLocally({ userId: req.params.id, packageId, notes: "Reassigned by Super Admin" });
      packageChange = {
        toPackage: targetPkg.name,
        note: "Existing data is always kept. If this plan's limits are lower than what the user already has, they simply can't add more of that resource until they're back under the limit or upgraded — nothing is deleted automatically.",
      };
    }

    const [updated] = await pool.query(
      "SELECT id, name, email, phone, address, role, package_id, is_active, created_at, updated_at FROM users WHERE id = ?",
      [req.params.id]
    );

    logAuditEvent({
      agencyId: req.user.agencyId, actor: req.user, action: "user.update",
      entityType: "user", entityId: Number(req.params.id), entityLabel: name || existing.name,
      summary: `Updated user "${existing.name}"${packageChange ? ` — plan → ${packageChange.toPackage}` : ""}`,
      changes: diffFields(existing, { name: name ?? existing.name, email: email ?? existing.email, role: role ?? existing.role, is_active: typeof isActive === "boolean" ? (isActive ? 1 : 0) : existing.is_active }, ["name", "email", "role", "is_active"]),
    });

    return res.json({ success: true, user: updated[0], packageChange });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── DELETE USER ──────────────────────────────────────────────────────────────
router.delete("/admin/users/:id", requirePermission("admin.users.manage"), async (req, res) => {
  try {
    const [[user]] = await pool.query("SELECT name, email FROM users WHERE id = ?", [req.params.id]);
    await pool.query("DELETE FROM users WHERE id = ?", [req.params.id]);

    if (user) {
      logAuditEvent({
        agencyId: req.user.agencyId, actor: req.user, action: "user.delete",
        entityType: "user", entityId: Number(req.params.id), entityLabel: user.name,
        summary: `Deleted user "${user.name}" (${user.email})`,
      });
    }

    return res.json({ success: true, message: "User deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET SYSTEM ANALYTICS ──────────────────────────────────────────────────
router.get("/admin/analytics", requirePermission("admin.analytics.view"), async (req, res) => {
  try {
    const days = parseInt(req.query.days || "14");

    const [dailyMessages] = await pool.query(`
      SELECT
        DATE(created_at) as date,
        SUM(CASE WHEN direction = 'INBOUND' THEN 1 ELSE 0 END) as inbound,
        SUM(CASE WHEN direction = 'OUTBOUND' THEN 1 ELSE 0 END) as outbound,
        COUNT(*) as total
      FROM messages
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
    `, [days]);

    const [subscriberGain] = await pool.query(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as new_subscribers,
        SUM(CASE WHEN platform = 'WHATSAPP' THEN 1 ELSE 0 END) as whatsapp,
        SUM(CASE WHEN platform = 'FACEBOOK' THEN 1 ELSE 0 END) as facebook,
        SUM(CASE WHEN platform = 'INSTAGRAM' THEN 1 ELSE 0 END) as instagram,
        SUM(CASE WHEN platform = 'TELEGRAM' THEN 1 ELSE 0 END) as telegram,
        SUM(CASE WHEN platform = 'WEBCHAT' THEN 1 ELSE 0 END) as webchat
      FROM contacts
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
    `, [days]);

    const [platformDistribution] = await pool.query(`
      SELECT platform, COUNT(*) as count
      FROM contacts
      GROUP BY platform
    `);

    return res.json({
      success: true,
      analytics: {
        dailyMessages,
        subscriberGain,
        platformDistribution,
      },
    });
  } catch (err) {
    console.error("Admin Analytics error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── PLATFORM'S OWN INTERNAL TEAM (Support/Sales/Finance/Technical Admin) ────
// Uses the exact same organization_members + roles architecture as every
// other org, scoped to the one reserved PLATFORM agency row — per the
// approved plan, Super Admin's internal team is explicitly NOT a separate
// system from agency team members.
router.get("/admin/team", requirePermission("admin.team.manage"), async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT om.id, u.id AS userId, u.name, u.email, u.is_active, r.slug AS roleSlug, r.name AS roleName, om.created_at
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
       JOIN roles r ON r.id = om.role_id
       WHERE om.agency_id = ?
       ORDER BY om.created_at DESC`,
      [req.user.agencyId]
    );
    return res.json({ success: true, team: rows });
  } catch (err) {
    console.error("GET /admin/team error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/admin/team", requirePermission("admin.team.manage"), async (req, res) => {
  const { name, email, password, roleSlug } = req.body;
  if (!name || !email || !password || !roleSlug) {
    return res.status(400).json({ success: false, message: "name, email, password and roleSlug are required" });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[roleRow]] = await conn.query("SELECT id FROM roles WHERE scope_type='PLATFORM' AND agency_id IS NULL AND slug=?", [roleSlug]);
    if (!roleRow) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Unknown platform role" });
    }
    const [[existing]] = await conn.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existing) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Email already in use" });
    }
    const hashed = await bcrypt.hash(password, 10);
    // role='ADMIN' in the JWT stays the coarse identity signal (so this
    // person isn't unexpectedly locked out of ADMIN-gated routes elsewhere
    // in the app that haven't been retrofitted with requirePermission yet)
    // — real restriction for /admin/* itself comes entirely from their
    // seeded platform role's permission set, not this flag.
    // Created by a logged-in admin/reseller, who vouches for the address — so it's
    // marked verified directly instead of emailing a link (see utils/emailVerification.js).
    const [userResult] = await conn.query(
      "INSERT INTO users (name, email, password, role, email_verified_at) VALUES (?, ?, ?, 'ADMIN', NOW())",
      [name, email, hashed]
    );
    await conn.query(
      "INSERT INTO organization_members (user_id, agency_id, role_id, member_kind, chat_access) VALUES (?,?,?, 'TEAM_MEMBER', 'ALL')",
      [userResult.insertId, req.user.agencyId, roleRow.id]
    );
    await conn.commit();

    logAuditEvent({
      agencyId: req.user.agencyId, actor: req.user, action: "team_member.create",
      entityType: "user", entityId: userResult.insertId, entityLabel: name,
      summary: `Added platform team member "${name}" (${email}, ${roleSlug})`,
    });

    return res.status(201).json({ success: true, message: "Platform team member created" });
  } catch (err) {
    await conn.rollback();
    console.error("POST /admin/team error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
});

router.delete("/admin/team/:membershipId", requirePermission("admin.team.manage"), async (req, res) => {
  try {
    const [[member]] = await pool.query(
      `SELECT om.user_id, u.name FROM organization_members om JOIN users u ON u.id = om.user_id WHERE om.id = ? AND om.agency_id = ?`,
      [req.params.membershipId, req.user.agencyId]
    );
    if (!member) return res.status(404).json({ success: false, message: "Team member not found" });
    if (member.user_id === req.user.id) return res.status(400).json({ success: false, message: "You cannot remove yourself" });
    await pool.query("DELETE FROM organization_members WHERE id = ?", [req.params.membershipId]);

    logAuditEvent({
      agencyId: req.user.agencyId, actor: req.user, action: "team_member.remove",
      entityType: "user", entityId: member.user_id, entityLabel: member.name,
      summary: `Removed platform team member "${member.name}"`,
    });

    return res.json({ success: true, message: "Team member removed" });
  } catch (err) {
    console.error("DELETE /admin/team/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
