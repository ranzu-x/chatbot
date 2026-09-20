/**
 * A Reseller's own customers and their users.
 *
 *   /reseller/customers  — "Add Customer" style management of customer workspaces
 *   /reseller/users      — the User Manager (same screen as Super Admin's, scoped)
 *
 * TENANT-LOCKED: this file contains no SQL. Every read and write goes through
 * utils/resellerScope.js, which takes the reseller's id from `req.tenant`
 * (derived server-side by middleware/tenant.js) and anchors every statement on
 * it. `npm run lint:tenant` fails if raw queries are added here.
 */
import express from "express";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { requireReseller } from "../middleware/tenant.js";
import * as scope from "../utils/resellerScope.js";

const router = express.Router();
// Scoped to /reseller: an unscoped router.use(authMiddleware) here used to 401
// every later-mounted router's public routes (see index.js mount order notes).
router.use("/reseller", authMiddleware, requireReseller);

const VIEW = requirePermission("reseller.customers.view", "reseller.customers.manage");
const MANAGE = requirePermission("reseller.customers.manage");

function fail(res, err, label) {
  if (err instanceof scope.TenantError) {
    return res.status(err.status).json({ success: false, message: err.message, code: err.code });
  }
  console.error(`${label} error:`, err);
  return res.status(500).json({ success: false, message: "Server error" });
}

// ─── Customers ───────────────────────────────────────────────────────────────
router.get("/reseller/customers", VIEW, async (req, res) => {
  try {
    return res.json({ success: true, customers: await scope.listCustomers(req.tenant.agencyId) });
  } catch (err) { return fail(res, err, "GET /reseller/customers"); }
});

router.post("/reseller/customers", MANAGE, async (req, res) => {
  const { name, slug, ownerName, ownerEmail, ownerPassword, agencyPackageId } = req.body;
  if (!name || !ownerName || !ownerEmail || !ownerPassword) {
    return res.status(400).json({ success: false, message: "name, ownerName, ownerEmail and ownerPassword are required" });
  }
  try {
    const { customerId } = await scope.createCustomerAccount({
      resellerId: req.tenant.agencyId, actor: req.user,
      name, slug, ownerName, ownerEmail: String(ownerEmail).toLowerCase().trim(), ownerPassword, agencyPackageId,
    });
    return res.status(201).json({ success: true, message: "Customer created", customerId });
  } catch (err) { return fail(res, err, "POST /reseller/customers"); }
});

router.patch("/reseller/customers/:id/package", MANAGE, async (req, res) => {
  const { agencyPackageId } = req.body;
  if (!agencyPackageId) return res.status(400).json({ success: false, message: "agencyPackageId is required" });
  try {
    const customer = await scope.getCustomer(req.tenant.agencyId, req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });
    await scope.assignCustomerPackage(req.tenant.agencyId, req.user, customer, agencyPackageId);
    return res.json({ success: true, message: "Package reassigned. Existing data is always kept — if the new plan's limits are lower, this customer just can't add more of that resource until they're back under the limit." });
  } catch (err) { return fail(res, err, "PATCH /reseller/customers/:id/package"); }
});

router.patch("/reseller/customers/:id/toggle", MANAGE, async (req, res) => {
  try {
    const customer = await scope.getCustomer(req.tenant.agencyId, req.params.id);
    if (!customer) return res.status(404).json({ success: false, message: "Customer not found" });
    return res.json({ success: true, isActive: await scope.toggleCustomer(req.tenant.agencyId, req.user, customer) });
  } catch (err) { return fail(res, err, "PATCH /reseller/customers/:id/toggle"); }
});

// ─── User Manager ────────────────────────────────────────────────────────────
router.get("/reseller/users", VIEW, async (req, res) => {
  try {
    return res.json({ success: true, users: await scope.listCustomerUsers(req.tenant.agencyId) });
  } catch (err) { return fail(res, err, "GET /reseller/users"); }
});

router.post("/reseller/users", MANAGE, async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").toLowerCase().trim();
  const { password, phone, packageId } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: "Name, email, and password are required" });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
  }
  try {
    const { ownerId, customerId } = await scope.createCustomerAccount({
      resellerId: req.tenant.agencyId, actor: req.user,
      name: `${name}'s Workspace`, ownerName: name, ownerEmail: email, ownerPassword: password,
      agencyPackageId: packageId || null, phone: phone || null,
    });
    return res.status(201).json({ success: true, message: "User created", userId: ownerId, customerId });
  } catch (err) { return fail(res, err, "POST /reseller/users"); }
});

router.put("/reseller/users/:id", MANAGE, async (req, res) => {
  try {
    const target = await scope.getCustomerUser(req.tenant.agencyId, req.params.id);
    if (!target) return res.status(404).json({ success: false, message: "User not found" });
    const { packageChange } = await scope.updateCustomerUser(req.tenant.agencyId, req.user, target, req.body);
    return res.json({ success: true, message: "User updated", packageChange });
  } catch (err) { return fail(res, err, "PUT /reseller/users/:id"); }
});

router.patch("/reseller/users/:id/toggle", MANAGE, async (req, res) => {
  try {
    const target = await scope.getCustomerUser(req.tenant.agencyId, req.params.id);
    if (!target) return res.status(404).json({ success: false, message: "User not found" });
    return res.json({ success: true, isActive: await scope.toggleCustomerUser(req.tenant.agencyId, req.user, target) });
  } catch (err) { return fail(res, err, "PATCH /reseller/users/:id/toggle"); }
});

router.delete("/reseller/users/:id", MANAGE, async (req, res) => {
  try {
    const target = await scope.getCustomerUser(req.tenant.agencyId, req.params.id);
    if (!target) return res.status(404).json({ success: false, message: "User not found" });
    await scope.deleteCustomerUser(req.tenant.agencyId, req.user, target);
    return res.json({ success: true, message: "User deleted" });
  } catch (err) { return fail(res, err, "DELETE /reseller/users/:id"); }
});

export default router;
