/**
 * Read side of the Admin & Reseller Audit Log — see utils/auditLog.js for
 * the write side and the agency_id/target_agency_id visibility convention.
 * A Platform Admin sees every entry; a Reseller sees only entries whose
 * agency_id (the actor's own agency) is their own — their own team's
 * actions on their own packages/customers, not other tenants'.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("RESELLER", "ADMIN"));

router.get("/audit-log", async (req, res) => {
  try {
    const { action, entityType, actorUserId, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = " WHERE 1=1";
    const params = [];

    if (req.user.role !== "ADMIN") {
      where += " AND agency_id = ?";
      params.push(req.user.agencyId);
    }
    if (action) { where += " AND action = ?"; params.push(action); }
    if (entityType) { where += " AND entity_type = ?"; params.push(entityType); }
    if (actorUserId) { where += " AND actor_user_id = ?"; params.push(actorUserId); }
    if (search) {
      where += " AND (summary LIKE ? OR entity_label LIKE ? OR actor_name LIKE ?)";
      const p = `%${search}%`;
      params.push(p, p, p);
    }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM admin_audit_log${where}`, params);

    const [rows] = await pool.query(
      `SELECT * FROM admin_audit_log${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    const entries = rows.map((r) => {
      let changes = null;
      if (r.changes) { try { changes = typeof r.changes === "string" ? JSON.parse(r.changes) : r.changes; } catch { changes = null; } }
      return { ...r, changes };
    });

    return res.json({
      success: true,
      entries,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) || 1 },
    });
  } catch (err) {
    console.error("Get audit log error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Distinct action/entity types actually present, so the frontend filter
// dropdowns only ever show options that will return results.
router.get("/audit-log/facets", async (req, res) => {
  try {
    const scoped = req.user.role !== "ADMIN";
    const clause = scoped ? " WHERE agency_id = ?" : "";
    const params = scoped ? [req.user.agencyId] : [];
    const [actions] = await pool.query(`SELECT DISTINCT action FROM admin_audit_log${clause} ORDER BY action ASC`, params);
    const [entityTypes] = await pool.query(`SELECT DISTINCT entity_type FROM admin_audit_log${clause} ORDER BY entity_type ASC`, params);
    return res.json({ success: true, actions: actions.map((a) => a.action), entityTypes: entityTypes.map((e) => e.entity_type) });
  } catch (err) {
    console.error("Get audit log facets error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
