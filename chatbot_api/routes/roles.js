/**
 * Roles & permissions — one shared architecture reused across all three
 * scopes (PLATFORM / AGENCY / RESELLER), per the approved SaaS hierarchy
 * plan. System roles (agency_id IS NULL) are seeded by
 * migrate_saas_hierarchy.js and cannot be edited/deleted; an org can clone
 * one into its own custom role.
 */
import express from "express";
import pool from "../db.js";
import { logAuditEvent } from "../utils/auditLog.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { requirePermission, invalidateRoleCache } from "../middleware/permissionMiddleware.js";

const router = express.Router();
router.use(authMiddleware);

const MANAGE_PERMISSION_BY_SCOPE = {
  PLATFORM: "admin.roles.manage",
  AGENCY: "roles.manage",
  RESELLER: "reseller.roles.manage",
};

async function resolveCallerScope(req) {
  const [rows] = await pool.query("SELECT account_type FROM agencies WHERE id = ?", [req.user.agencyId]);
  const accountType = rows[0]?.account_type || "DIRECT_CUSTOMER";
  if (accountType === "PLATFORM") return "PLATFORM";
  if (accountType === "RESELLER") return "RESELLER";
  return "AGENCY"; // DIRECT_CUSTOMER or RESELLER_CUSTOMER both use AGENCY-scope roles
}

// ─── LIST PERMISSIONS (for the checklist UI) ─────────────────────────────────
router.get("/permissions", async (req, res) => {
  try {
    const scope = await resolveCallerScope(req);
    const allowedScopes = scope === "PLATFORM"
      ? ["PLATFORM", "AGENCY", "RESELLER"]
      : (scope === "RESELLER" ? ["RESELLER", "AGENCY"] : ["AGENCY"]);
    const [rows] = await pool.query(
      "SELECT permission_key, label, category, scope_type FROM permissions WHERE scope_type IN (?) ORDER BY category, label",
      [allowedScopes]
    );
    return res.json({ success: true, permissions: rows });
  } catch (err) {
    console.error("GET /permissions error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── LIST ROLES AVAILABLE TO THE CALLER'S WORKSPACE ──────────────────────────
router.get("/roles", async (req, res) => {
  try {
    const scope = await resolveCallerScope(req);
    const [rows] = await pool.query(
      `SELECT id, agency_id, scope_type, slug, name, is_system,
              (SELECT COUNT(*) FROM organization_members om WHERE om.role_id = roles.id) AS memberCount
       FROM roles
       WHERE scope_type = ? AND (agency_id IS NULL OR agency_id = ?)
       ORDER BY is_system DESC, name ASC`,
      [scope, req.user.agencyId]
    );
    return res.json({ success: true, roles: rows });
  } catch (err) {
    console.error("GET /roles error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET ONE ROLE + ITS PERMISSIONS ───────────────────────────────────────────
router.get("/roles/:id", async (req, res) => {
  try {
    const scope = await resolveCallerScope(req);
    const [rows] = await pool.query(
      "SELECT id, agency_id, scope_type, slug, name, is_system FROM roles WHERE id = ? AND scope_type = ? AND (agency_id IS NULL OR agency_id = ?)",
      [req.params.id, scope, req.user.agencyId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Role not found" });
    const [perms] = await pool.query("SELECT permission_key FROM role_permissions WHERE role_id = ?", [req.params.id]);
    return res.json({ success: true, role: { ...rows[0], permissionKeys: perms.map((p) => p.permission_key) } });
  } catch (err) {
    console.error("GET /roles/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

const requireRoleManage = requirePermission(...Object.values(MANAGE_PERMISSION_BY_SCOPE));

// ─── CREATE A CUSTOM ROLE (optionally cloned from an existing one) ──────────
router.post("/roles", requireRoleManage, async (req, res) => {
  try {
    const scope = await resolveCallerScope(req);
    const { name, permissionKeys = [], cloneFromRoleId = null } = req.body;
    if (!name) return res.status(400).json({ success: false, message: "Role name is required" });

    let finalKeys = Array.isArray(permissionKeys) ? permissionKeys : [];
    if (cloneFromRoleId) {
      const [cloneRows] = await pool.query(
        "SELECT permission_key FROM role_permissions WHERE role_id = ?",
        [cloneFromRoleId]
      );
      finalKeys = cloneRows.map((r) => r.permission_key);
    }
    // Only allow granting keys that exist for this scope (no cross-scope escalation)
    const allowedScopes = scope === "PLATFORM"
      ? ["PLATFORM", "AGENCY", "RESELLER"]
      : (scope === "RESELLER" ? ["RESELLER", "AGENCY"] : ["AGENCY"]);
    const [validRows] = await pool.query("SELECT permission_key FROM permissions WHERE scope_type IN (?)", [allowedScopes]);
    const validSet = new Set(validRows.map((r) => r.permission_key));
    finalKeys = finalKeys.filter((k) => validSet.has(k));

    const slug = `custom_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)}_${Date.now().toString(36)}`;
    const [ins] = await pool.query(
      "INSERT INTO roles (agency_id, scope_type, slug, name, is_system) VALUES (?, ?, ?, ?, 0)",
      [req.user.agencyId, scope, slug, name]
    );
    for (const key of finalKeys) {
      await pool.query("INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)", [ins.insertId, key]);
    }
    logAuditEvent({
      agencyId: req.user.agencyId, actor: req.user, action: "role.create",
      entityType: "role", entityId: ins.insertId, entityLabel: name,
      summary: `Created role "${name}"${cloneFromRoleId ? " (cloned)" : ""} with ${finalKeys.length} permission(s)`,
    });

    return res.status(201).json({ success: true, role: { id: ins.insertId, name, slug, permissionKeys: finalKeys } });
  } catch (err) {
    console.error("POST /roles error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── UPDATE A CUSTOM ROLE'S NAME/PERMISSIONS ─────────────────────────────────
router.put("/roles/:id", requireRoleManage, async (req, res) => {
  try {
    const scope = await resolveCallerScope(req);
    const [roleRows] = await pool.query("SELECT * FROM roles WHERE id = ? AND agency_id = ? AND scope_type = ?", [req.params.id, req.user.agencyId, scope]);
    if (!roleRows.length) return res.status(404).json({ success: false, message: "Custom role not found" });
    if (roleRows[0].is_system) return res.status(400).json({ success: false, message: "System roles cannot be edited" });

    const { name, permissionKeys } = req.body;
    if (name) await pool.query("UPDATE roles SET name = ? WHERE id = ?", [name, req.params.id]);
    if (Array.isArray(permissionKeys)) {
      const allowedScopes = scope === "PLATFORM"
        ? ["PLATFORM", "AGENCY", "RESELLER"]
        : (scope === "RESELLER" ? ["RESELLER", "AGENCY"] : ["AGENCY"]);
      const [validRows] = await pool.query("SELECT permission_key FROM permissions WHERE scope_type IN (?)", [allowedScopes]);
      const validSet = new Set(validRows.map((r) => r.permission_key));
      const filtered = permissionKeys.filter((k) => validSet.has(k));
      await pool.query("DELETE FROM role_permissions WHERE role_id = ?", [req.params.id]);
      for (const key of filtered) {
        await pool.query("INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)", [req.params.id, key]);
      }
      invalidateRoleCache(Number(req.params.id));
    }

    logAuditEvent({
      agencyId: req.user.agencyId, actor: req.user, action: "role.update",
      entityType: "role", entityId: Number(req.params.id), entityLabel: name || roleRows[0].name,
      summary: `Updated role "${roleRows[0].name}"${name && name !== roleRows[0].name ? ` → "${name}"` : ""}`,
      changes: Array.isArray(permissionKeys) ? { permissionKeys: { before: null, after: permissionKeys.length } } : null,
    });

    return res.json({ success: true, message: "Role updated" });
  } catch (err) {
    console.error("PUT /roles/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── DELETE A CUSTOM ROLE (only if unused) ───────────────────────────────────
router.delete("/roles/:id", requireRoleManage, async (req, res) => {
  try {
    const scope = await resolveCallerScope(req);
    const [roleRows] = await pool.query("SELECT * FROM roles WHERE id = ? AND agency_id = ? AND scope_type = ?", [req.params.id, req.user.agencyId, scope]);
    if (!roleRows.length) return res.status(404).json({ success: false, message: "Custom role not found" });
    if (roleRows[0].is_system) return res.status(400).json({ success: false, message: "System roles cannot be deleted" });
    const [[{ cnt }]] = await pool.query("SELECT COUNT(*) AS cnt FROM organization_members WHERE role_id = ?", [req.params.id]);
    if (cnt > 0) return res.status(400).json({ success: false, message: `Cannot delete — ${cnt} member(s) still use this role` });
    await pool.query("DELETE FROM roles WHERE id = ?", [req.params.id]);
    invalidateRoleCache(Number(req.params.id));

    logAuditEvent({
      agencyId: req.user.agencyId, actor: req.user, action: "role.delete",
      entityType: "role", entityId: Number(req.params.id), entityLabel: roleRows[0].name,
      summary: `Deleted role "${roleRows[0].name}"`,
    });

    return res.json({ success: true, message: "Role deleted" });
  } catch (err) {
    console.error("DELETE /roles/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
