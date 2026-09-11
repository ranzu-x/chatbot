/**
 * A Reseller's own "Create Customer" flow — creates a RESELLER_CUSTOMER
 * agencies row owned by the caller's reseller org (parent_agency_id), per
 * the approved SaaS hierarchy plan (§6). Separate from
 * routes/resellers.js, which is Super Admin's view into this same data.
 */
import express from "express";
import bcrypt from "bcrypt";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { assertLimit } from "../utils/entitlements.js";

const router = express.Router();
router.use(authMiddleware);

async function requireCallerIsReseller(req, res) {
  const [[agency]] = await pool.query("SELECT id, account_type FROM agencies WHERE id = ?", [req.user.agencyId]);
  if (!agency || agency.account_type !== "RESELLER") {
    res.status(403).json({ success: false, message: "Only a reseller account can manage reseller customers" });
    return null;
  }
  return agency;
}

// ─── LIST MY CUSTOMERS ────────────────────────────────────────────────────────
router.get("/reseller/customers", requirePermission("reseller.customers.view", "reseller.customers.manage"), async (req, res) => {
  const reseller = await requireCallerIsReseller(req, res);
  if (!reseller) return;
  try {
    const [rows] = await pool.query(`
      SELECT a.id, a.name, a.slug, a.is_active, a.owner_id, u.name AS ownerName, u.email AS ownerEmail, a.created_at,
             acs.package_id AS agencyPackageId, ap.name AS agencyPackageName, acs.status AS subscriptionStatus
      FROM agencies a
      JOIN users u ON u.id = a.owner_id
      LEFT JOIN agency_client_subscriptions acs ON acs.client_agency_id = a.id AND acs.status = 'ACTIVE'
      LEFT JOIN agency_packages ap ON ap.id = acs.package_id
      WHERE a.parent_agency_id = ? AND a.account_type = 'RESELLER_CUSTOMER'
      ORDER BY a.created_at DESC
    `, [reseller.id]);
    return res.json({ success: true, customers: rows });
  } catch (err) {
    console.error("GET /reseller/customers error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE A CUSTOMER ────────────────────────────────────────────────────────
router.post("/reseller/customers", requirePermission("reseller.customers.manage"), async (req, res) => {
  const reseller = await requireCallerIsReseller(req, res);
  if (!reseller) return;

  const { name, slug, ownerName, ownerEmail, ownerPassword, agencyPackageId } = req.body;
  if (!name || !ownerName || !ownerEmail || !ownerPassword) {
    return res.status(400).json({ success: false, message: "name, ownerName, ownerEmail and ownerPassword are required" });
  }

  // Pool limit — real usage across the reseller's whole tree vs the
  // reseller's own platform package limit for max_bot_accounts is checked
  // elsewhere; here we specifically gate the *customer count* itself
  // (this reseller's own package's own "how many customers" ceiling).
  try {
    await assertLimit(reseller.id, "max_reseller_customers", 1, req.user.id);
  } catch (limitErr) {
    return res.status(403).json({ success: false, message: limitErr.message || "Customer limit reached for your reseller plan.", code: "LIMIT_EXCEEDED" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[existing]] = await conn.query("SELECT id FROM users WHERE email = ?", [ownerEmail]);
    if (existing) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Email already in use" });
    }
    const hashed = await bcrypt.hash(ownerPassword, 10);
    const [userResult] = await conn.query(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'RESELLER')",
      [ownerName, ownerEmail, hashed]
    );
    const ownerId = userResult.insertId;
    const agencySlug = slug || `${name}-${Date.now().toString(36)}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const [agencyResult] = await conn.query(
      "INSERT INTO agencies (name, slug, owner_id, account_type, parent_agency_id) VALUES (?, ?, ?, 'RESELLER_CUSTOMER', ?)",
      [name, agencySlug, ownerId, reseller.id]
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
      const [[pkg]] = await conn.query("SELECT id FROM agency_packages WHERE id = ? AND agency_id = ?", [agencyPackageId, reseller.id]);
      if (pkg) {
        await conn.query(
          "INSERT INTO agency_client_subscriptions (agency_id, client_agency_id, package_id, provider, status, started_at, notes) VALUES (?, ?, ?, 'STRIPE', 'ACTIVE', NOW(), 'Assigned at customer creation')",
          [reseller.id, customerId, agencyPackageId]
        );
      }
    }

    await conn.commit();
    return res.status(201).json({ success: true, message: "Customer created", customerId });
  } catch (err) {
    await conn.rollback();
    console.error("POST /reseller/customers error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
});

// ─── ASSIGN/CHANGE A CUSTOMER'S AGENCY PACKAGE ────────────────────────────────
router.patch("/reseller/customers/:id/package", requirePermission("reseller.customers.manage"), async (req, res) => {
  const reseller = await requireCallerIsReseller(req, res);
  if (!reseller) return;
  const { agencyPackageId } = req.body;
  if (!agencyPackageId) return res.status(400).json({ success: false, message: "agencyPackageId is required" });
  try {
    const [[customer]] = await pool.query("SELECT id FROM agencies WHERE id = ? AND parent_agency_id = ? AND account_type='RESELLER_CUSTOMER'", [req.params.id, reseller.id]);
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });
    const [[pkg]] = await pool.query("SELECT id FROM agency_packages WHERE id = ? AND agency_id = ?", [agencyPackageId, reseller.id]);
    if (!pkg) return res.status(400).json({ success: false, message: "Package not found" });

    await pool.query("UPDATE agency_client_subscriptions SET status='CANCELLED' WHERE client_agency_id = ? AND status='ACTIVE'", [customer.id]);
    await pool.query(
      "INSERT INTO agency_client_subscriptions (agency_id, client_agency_id, package_id, provider, status, started_at, notes) VALUES (?, ?, ?, 'STRIPE', 'ACTIVE', NOW(), 'Reassigned by reseller')",
      [reseller.id, customer.id, agencyPackageId]
    );
    return res.json({ success: true, message: "Package reassigned. Existing data is always kept — if the new plan's limits are lower, this customer just can't add more of that resource until they're back under the limit." });
  } catch (err) {
    console.error("PATCH /reseller/customers/:id/package error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── TOGGLE A CUSTOMER'S STATUS ───────────────────────────────────────────────
router.patch("/reseller/customers/:id/toggle", requirePermission("reseller.customers.manage"), async (req, res) => {
  const reseller = await requireCallerIsReseller(req, res);
  if (!reseller) return;
  try {
    const [[customer]] = await pool.query("SELECT id, is_active FROM agencies WHERE id = ? AND parent_agency_id = ? AND account_type='RESELLER_CUSTOMER'", [req.params.id, reseller.id]);
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });
    const newStatus = customer.is_active ? 0 : 1;
    await pool.query("UPDATE agencies SET is_active = ? WHERE id = ?", [newStatus, customer.id]);
    return res.json({ success: true, isActive: newStatus === 1 });
  } catch (err) {
    console.error("PATCH /reseller/customers/:id/toggle error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
