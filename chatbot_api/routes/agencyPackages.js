/**
 * An agency's own plans for ITS customers — CRUD over the previously-dead
 * agency_packages table (scaffolded by migrate_agency_payment_gateways.js,
 * never given routes until now). Originally reseller-only; opened up to
 * every agency (Direct Customer or Reseller — see migrate_agency_packages_permission.js)
 * since "Reseller" is now just a capability flag on an agency (see
 * routes/admin.js) rather than a separate account type with separate
 * privileges. Assignment to a specific customer happens via
 * routes/resellerCustomers.js, not here.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";

const router = express.Router();
router.use(authMiddleware);

async function requireCallerIsAgency(req, res) {
  const [[agency]] = await pool.query("SELECT id, account_type FROM agencies WHERE id = ?", [req.user.agencyId]);
  if (!agency || !["DIRECT_CUSTOMER", "RESELLER"].includes(agency.account_type)) {
    res.status(403).json({ success: false, message: "Only an agency account can manage its own packages" });
    return null;
  }
  return agency;
}

router.get("/reseller/packages", requirePermission("agency.packages.manage", "reseller.packages.manage", "reseller.customers.view"), async (req, res) => {
  const reseller = await requireCallerIsAgency(req, res);
  if (!reseller) return;
  try {
    const [rows] = await pool.query("SELECT * FROM agency_packages WHERE agency_id = ? ORDER BY created_at DESC", [reseller.id]);
    return res.json({ success: true, packages: rows });
  } catch (err) {
    console.error("GET /reseller/packages error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/reseller/packages", requirePermission("agency.packages.manage", "reseller.packages.manage"), async (req, res) => {
  const reseller = await requireCallerIsAgency(req, res);
  if (!reseller) return;
  const { name, description, price = 0, currency = "USD", billingCycle = "monthly", maxBotAccounts, maxSubscribers, maxTeamMembers, maxMonthlyMessages, isDefault } = req.body;
  if (!name) return res.status(400).json({ success: false, message: "name is required" });
  try {
    const slug = `${name}-${Date.now().toString(36)}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (isDefault) {
      await pool.query("UPDATE agency_packages SET is_default = 0 WHERE agency_id = ?", [reseller.id]);
    }
    const [ins] = await pool.query(
      `INSERT INTO agency_packages
        (agency_id, name, slug, description, price, currency, billing_cycle, is_default, max_bot_accounts, max_subscribers, max_team_members, max_monthly_messages)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [reseller.id, name, slug, description || null, price, currency, billingCycle, isDefault ? 1 : 0,
        maxBotAccounts ?? null, maxSubscribers ?? null, maxTeamMembers ?? null, maxMonthlyMessages ?? null]
    );
    return res.status(201).json({ success: true, packageId: ins.insertId });
  } catch (err) {
    console.error("POST /reseller/packages error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/reseller/packages/:id", requirePermission("agency.packages.manage", "reseller.packages.manage"), async (req, res) => {
  const reseller = await requireCallerIsAgency(req, res);
  if (!reseller) return;
  try {
    const [[pkg]] = await pool.query("SELECT id FROM agency_packages WHERE id = ? AND agency_id = ?", [req.params.id, reseller.id]);
    if (!pkg) return res.status(404).json({ success: false, message: "Package not found" });
    const { name, description, price, currency, billingCycle, maxBotAccounts, maxSubscribers, maxTeamMembers, maxMonthlyMessages, isActive, isDefault } = req.body;
    if (isDefault) await pool.query("UPDATE agency_packages SET is_default = 0 WHERE agency_id = ?", [reseller.id]);
    const fields = []; const values = [];
    const set = (col, val) => { if (val !== undefined) { fields.push(`${col} = ?`); values.push(val); } };
    set("name", name); set("description", description); set("price", price); set("currency", currency);
    set("billing_cycle", billingCycle); set("max_bot_accounts", maxBotAccounts); set("max_subscribers", maxSubscribers);
    set("max_team_members", maxTeamMembers); set("max_monthly_messages", maxMonthlyMessages);
    if (typeof isActive === "boolean") set("is_active", isActive ? 1 : 0);
    if (typeof isDefault === "boolean") set("is_default", isDefault ? 1 : 0);
    if (fields.length) {
      values.push(req.params.id);
      await pool.query(`UPDATE agency_packages SET ${fields.join(", ")} WHERE id = ?`, values);
    }
    return res.json({ success: true, message: "Package updated" });
  } catch (err) {
    console.error("PUT /reseller/packages/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/reseller/packages/:id", requirePermission("agency.packages.manage", "reseller.packages.manage"), async (req, res) => {
  const reseller = await requireCallerIsAgency(req, res);
  if (!reseller) return;
  try {
    const [[pkg]] = await pool.query("SELECT id FROM agency_packages WHERE id = ? AND agency_id = ?", [req.params.id, reseller.id]);
    if (!pkg) return res.status(404).json({ success: false, message: "Package not found" });
    const [[{ cnt }]] = await pool.query("SELECT COUNT(*) as cnt FROM agency_client_subscriptions WHERE package_id = ? AND status = 'ACTIVE'", [req.params.id]);
    if (cnt > 0) return res.status(400).json({ success: false, message: `Cannot delete — ${cnt} customer(s) are actively on this plan` });
    await pool.query("DELETE FROM agency_packages WHERE id = ?", [req.params.id]);
    return res.json({ success: true, message: "Package deleted" });
  } catch (err) {
    console.error("DELETE /reseller/packages/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
