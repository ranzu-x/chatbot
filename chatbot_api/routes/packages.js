import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { getAgencyEntitlements } from "../utils/entitlements.js";

const router = express.Router();

// ─── GET CURRENT USER ENTITLEMENTS (Available to all logged-in roles) ─────────
router.get("/packages/my-entitlements", authMiddleware, async (req, res) => {
  try {
    const agencyId = req.user?.agencyId;
    const userId = req.user?.id;
    const entitlements = await getAgencyEntitlements(agencyId, userId);
    return res.json({ success: true, entitlements });
  } catch (err) {
    console.error("My entitlements error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET CENTRAL MODULE REGISTRY ─────────────────────────────────────────────
router.get("/packages/registry", authMiddleware, async (req, res) => {
  try {
    const [modules] = await pool.query(
      "SELECT * FROM modules WHERE is_active = 1 ORDER BY sort_order ASC, id ASC"
    );
    return res.json({ success: true, modules });
  } catch (err) {
    console.error("Modules registry error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── ADMIN: GET ALL PACKAGES ─────────────────────────────────────────────────
router.get("/packages", authMiddleware, roleMiddleware("ADMIN", "AGENCY"), async (req, res) => {
  try {
    const [packages] = await pool.query(`
      SELECT p.*,
        (SELECT COUNT(*) FROM agencies a WHERE a.package_id = p.id) as assigned_agencies_count,
        (SELECT COUNT(*) FROM users u WHERE u.package_id = p.id) as assigned_users_count
      FROM packages p
      ORDER BY p.type ASC, p.price ASC, p.id ASC
    `);

    // Attach enabled modules summary
    const [pkgModules] = await pool.query(`
      SELECT pm.package_id, pm.module_key, pm.is_enabled, m.display_name, m.module_type, m.category
      FROM package_modules pm
      JOIN modules m ON m.key = pm.module_key
      WHERE pm.is_enabled = 1
    `);

    const moduleMap = {};
    for (const pm of pkgModules) {
      if (!moduleMap[pm.package_id]) moduleMap[pm.package_id] = [];
      moduleMap[pm.package_id].push({
        key: pm.module_key,
        displayName: pm.display_name,
        type: pm.module_type,
        category: pm.category,
      });
    }

    const fullPackages = packages.map((p) => ({
      ...p,
      price: Number(p.price),
      enabledModules: moduleMap[p.id] || [],
    }));

    return res.json({ success: true, packages: fullPackages });
  } catch (err) {
    console.error("List packages error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── ADMIN: GET SINGLE PACKAGE MATRIX ────────────────────────────────────────
router.get("/packages/:id", authMiddleware, roleMiddleware("ADMIN"), async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM packages WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Package not found" });

    const pkg = rows[0];

    // Fetch all modules in registry + package module states
    const [matrix] = await pool.query(`
      SELECT m.key, m.display_name, m.module_type, m.category, m.description, m.icon, m.sort_order,
             COALESCE(pm.is_enabled, 0) as is_enabled,
             pm.limits_json
      FROM modules m
      LEFT JOIN package_modules pm ON pm.module_key = m.key AND pm.package_id = ?
      WHERE m.is_active = 1
      ORDER BY m.sort_order ASC, m.id ASC
    `, [pkg.id]);

    const formattedMatrix = matrix.map((m) => {
      let limits = {};
      try {
        limits = typeof m.limits_json === "string" ? JSON.parse(m.limits_json || "{}") : m.limits_json || {};
      } catch {
        limits = {};
      }
      return {
        key: m.key,
        displayName: m.display_name,
        moduleType: m.module_type,
        category: m.category,
        description: m.description,
        icon: m.icon,
        isEnabled: Boolean(m.is_enabled),
        limits,
      };
    });

    return res.json({
      success: true,
      package: {
        ...pkg,
        price: Number(pkg.price),
      },
      modulesMatrix: formattedMatrix,
    });
  } catch (err) {
    console.error("Get package matrix error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── ADMIN: CREATE PACKAGE WITH MODULE MATRIX ────────────────────────────────
router.post("/packages", authMiddleware, roleMiddleware("ADMIN"), async (req, res) => {
  try {
    const {
      name,
      slug,
      type = "AGENCY",
      description,
      price = 0,
      billingCycle = "monthly",
      isActive = true,
      isDefault = false,
      maxBotAccounts = null,
      maxSubscribers = null,
      maxTeamMembers = null,
      maxMonthlyMessages = null,
      modules = [], // array of { key, isEnabled, limits }
    } = req.body;

    if (!name) return res.status(400).json({ success: false, message: "Package name is required" });

    const packageSlug = (slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).trim();

    // Check slug collision
    const [existing] = await pool.query("SELECT id FROM packages WHERE slug = ?", [packageSlug]);
    if (existing.length) {
      return res.status(400).json({ success: false, message: `A package with slug "${packageSlug}" already exists.` });
    }

    if (isDefault) {
      await pool.query("UPDATE packages SET is_default = 0 WHERE type = ?", [type]);
    }

    const [pkgResult] = await pool.query(
      `INSERT INTO packages (
        name, slug, type, description, price, billing_cycle,
        is_active, is_default, max_bot_accounts, max_subscribers,
        max_team_members, max_monthly_messages, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        name.trim(),
        packageSlug,
        type,
        description || null,
        Number(price) || 0,
        billingCycle,
        isActive ? 1 : 0,
        isDefault ? 1 : 0,
        maxBotAccounts === "" || maxBotAccounts === null ? null : Number(maxBotAccounts),
        maxSubscribers === "" || maxSubscribers === null ? null : Number(maxSubscribers),
        maxTeamMembers === "" || maxTeamMembers === null ? null : Number(maxTeamMembers),
        maxMonthlyMessages === "" || maxMonthlyMessages === null ? null : Number(maxMonthlyMessages),
      ]
    );

    const newPackageId = pkgResult.insertId;

    // Insert module configurations
    if (Array.isArray(modules) && modules.length > 0) {
      for (const m of modules) {
        await pool.query(
          `INSERT INTO package_modules (package_id, module_key, is_enabled, limits_json)
           VALUES (?, ?, ?, ?)`,
          [
            newPackageId,
            m.key,
            m.isEnabled ? 1 : 0,
            m.limits ? JSON.stringify(m.limits) : null,
          ]
        );
      }
    } else {
      // Default: enable all registered modules
      const [allMods] = await pool.query("SELECT `key` FROM modules WHERE is_active = 1");
      for (const m of allMods) {
        await pool.query(
          `INSERT INTO package_modules (package_id, module_key, is_enabled) VALUES (?, ?, 1)`,
          [newPackageId, m.key]
        );
      }
    }

    return res.status(201).json({
      success: true,
      message: `Package "${name}" created successfully!`,
      packageId: newPackageId,
    });
  } catch (err) {
    console.error("Create package error:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to create package" });
  }
});

// ─── ADMIN: UPDATE PACKAGE & MODULE MATRIX ───────────────────────────────────
router.put("/packages/:id", authMiddleware, roleMiddleware("ADMIN"), async (req, res) => {
  try {
    const {
      name,
      slug,
      type,
      description,
      price,
      billingCycle,
      isActive,
      isDefault,
      maxBotAccounts,
      maxSubscribers,
      maxTeamMembers,
      maxMonthlyMessages,
      modules = [], // array of { key, isEnabled, limits }
    } = req.body;

    const [existing] = await pool.query("SELECT id FROM packages WHERE id = ?", [req.params.id]);
    if (!existing.length) return res.status(404).json({ success: false, message: "Package not found" });

    if (isDefault && type) {
      await pool.query("UPDATE packages SET is_default = 0 WHERE type = ? AND id != ?", [type, req.params.id]);
    }

    await pool.query(
      `UPDATE packages SET
        name = COALESCE(?, name),
        slug = COALESCE(?, slug),
        type = COALESCE(?, type),
        description = ?,
        price = COALESCE(?, price),
        billing_cycle = COALESCE(?, billing_cycle),
        is_active = COALESCE(?, is_active),
        is_default = COALESCE(?, is_default),
        max_bot_accounts = ?,
        max_subscribers = ?,
        max_team_members = ?,
        max_monthly_messages = ?
      WHERE id = ?`,
      [
        name,
        slug,
        type,
        description || null,
        price !== undefined ? Number(price) : null,
        billingCycle,
        isActive !== undefined ? (isActive ? 1 : 0) : null,
        isDefault !== undefined ? (isDefault ? 1 : 0) : null,
        maxBotAccounts === "" || maxBotAccounts === null ? null : Number(maxBotAccounts),
        maxSubscribers === "" || maxSubscribers === null ? null : Number(maxSubscribers),
        maxTeamMembers === "" || maxTeamMembers === null ? null : Number(maxTeamMembers),
        maxMonthlyMessages === "" || maxMonthlyMessages === null ? null : Number(maxMonthlyMessages),
        req.params.id,
      ]
    );

    // Upsert module configurations
    if (Array.isArray(modules) && modules.length > 0) {
      for (const m of modules) {
        await pool.query(
          `INSERT INTO package_modules (package_id, module_key, is_enabled, limits_json)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             is_enabled = VALUES(is_enabled),
             limits_json = VALUES(limits_json)`,
          [
            req.params.id,
            m.key,
            m.isEnabled ? 1 : 0,
            m.limits ? JSON.stringify(m.limits) : null,
          ]
        );
      }
    }

    return res.json({ success: true, message: `Package updated successfully!` });
  } catch (err) {
    console.error("Update package error:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to update package" });
  }
});

// ─── ADMIN: CLONE PACKAGE ───────────────────────────────────────────────────
router.post("/packages/:id/clone", authMiddleware, roleMiddleware("ADMIN"), async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM packages WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Source package not found" });

    const src = rows[0];
    const newName = `${src.name} (Copy)`;
    const newSlug = `${src.slug}-copy-${Date.now().toString().slice(-4)}`;

    const [cloneResult] = await pool.query(
      `INSERT INTO packages (
        name, slug, type, description, price, billing_cycle,
        is_active, is_default, max_bot_accounts, max_subscribers,
        max_team_members, max_monthly_messages, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?, ?, NOW())`,
      [
        newName,
        newSlug,
        src.type,
        src.description,
        src.price,
        src.billing_cycle,
        src.max_bot_accounts,
        src.max_subscribers,
        src.max_team_members,
        src.max_monthly_messages,
      ]
    );

    const newId = cloneResult.insertId;

    // Clone all module configurations
    const [srcModules] = await pool.query("SELECT module_key, is_enabled, limits_json FROM package_modules WHERE package_id = ?", [src.id]);
    for (const m of srcModules) {
      await pool.query(
        "INSERT INTO package_modules (package_id, module_key, is_enabled, limits_json) VALUES (?, ?, ?, ?)",
        [newId, m.module_key, m.is_enabled, m.limits_json]
      );
    }

    return res.status(201).json({
      success: true,
      message: `Package cloned as "${newName}"!`,
      packageId: newId,
    });
  } catch (err) {
    console.error("Clone package error:", err);
    return res.status(500).json({ success: false, message: "Failed to clone package" });
  }
});

// ─── ADMIN: DELETE / ARCHIVE PACKAGE ─────────────────────────────────────────
router.delete("/packages/:id", authMiddleware, roleMiddleware("ADMIN"), async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT is_default, name FROM packages WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Package not found" });

    if (rows[0].is_default) {
      return res.status(400).json({ success: false, message: "Cannot delete the default package." });
    }

    await pool.query("DELETE FROM packages WHERE id = ?", [req.params.id]);
    return res.json({ success: true, message: `Package "${rows[0].name}" deleted successfully.` });
  } catch (err) {
    console.error("Delete package error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete package" });
  }
});

// ─── ADMIN: ASSIGN PACKAGE TO AGENCY OR USER ─────────────────────────────────
router.post("/packages/assign", authMiddleware, roleMiddleware("ADMIN"), async (req, res) => {
  try {
    const { packageId, agencyId, userId, notes } = req.body;

    if (!packageId) {
      return res.status(400).json({ success: false, message: "Package ID is required" });
    }
    if (!agencyId && !userId) {
      return res.status(400).json({ success: false, message: "Please specify an Agency ID or User ID" });
    }

    const [pkg] = await pool.query("SELECT name FROM packages WHERE id = ?", [packageId]);
    if (!pkg.length) return res.status(404).json({ success: false, message: "Package not found" });

    if (agencyId) {
      await pool.query("UPDATE agencies SET package_id = ? WHERE id = ?", [packageId, agencyId]);
      await pool.query("UPDATE subscriptions SET status = 'CANCELLED' WHERE agency_id = ? AND status = 'ACTIVE'", [agencyId]);
      await pool.query(
        "INSERT INTO subscriptions (agency_id, package_id, status, started_at, notes) VALUES (?, ?, 'ACTIVE', NOW(), ?)",
        [agencyId, packageId, notes || `Assigned ${pkg[0].name}`]
      );
    }

    if (userId) {
      await pool.query("UPDATE users SET package_id = ? WHERE id = ?", [packageId, userId]);
      await pool.query("UPDATE subscriptions SET status = 'CANCELLED' WHERE user_id = ? AND status = 'ACTIVE'", [userId]);
      await pool.query(
        "INSERT INTO subscriptions (user_id, package_id, status, started_at, notes) VALUES (?, ?, 'ACTIVE', NOW(), ?)",
        [userId, packageId, notes || `Assigned ${pkg[0].name}`]
      );
    }

    return res.json({
      success: true,
      message: `Package "${pkg[0].name}" successfully assigned!`,
    });
  } catch (err) {
    console.error("Assign package error:", err);
    return res.status(500).json({ success: false, message: "Failed to assign package" });
  }
});

export default router;
