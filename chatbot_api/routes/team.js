import express from "express";
import bcrypt from "bcrypt";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { assertLimit, getAgencyEntitlements } from "../utils/entitlements.js";

const router = express.Router();

// All team routes require authentication
router.use(authMiddleware);

// ─── GET TEAM MEMBERS (WITH ROLES, STATS & PACKAGE LIMITS) ───────────────────
router.get("/team-members", async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const agencyId = req.user.agencyId;

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);
    const offset = (page - 1) * limit;
    const search = (req.query.search || "").trim();
    const roleFilter = (req.query.role || "").trim();
    const statusFilter = (req.query.status || "").trim();

    // 1. Fetch Entitlements & Usage for Current Account Owner
    let planStats = {
      maxTeamMembers: null,
      usedTeamMembers: 0,
      canAddMore: true,
    };

    if (role !== "ADMIN") {
      try {
        const ent = await getAgencyEntitlements(agencyId, userId);
        const max = ent.limits?.maxTeamMembers ?? null;
        const used = ent.usage?.usedTeamMembers ?? 0;
        planStats = {
          maxTeamMembers: max,
          usedTeamMembers: used,
          canAddMore: max === null ? true : used < max,
        };
      } catch (e) {
        console.warn("Could not fetch entitlements for team members:", e.message);
      }
    }

    // 2. Base Query Condition depending on Caller Role
    let whereClauses = [];
    let queryParams = [];

    if (role === "ADMIN") {
      // Super Admin can see all team members, or filter by agency / owner if requested
      if (req.query.agencyId) {
        whereClauses.push("ap.agency_id = ?");
        queryParams.push(req.query.agencyId);
      }
    } else if (agencyId) {
      // Agency owner sees team members of their agency or created by them
      whereClauses.push("(ap.agency_id = ? OR ap.owner_user_id = ?)");
      queryParams.push(agencyId, userId);
    } else {
      // End User sees team members they personally own/created
      whereClauses.push("ap.owner_user_id = ?");
      queryParams.push(userId);
    }

    // Don't show the caller themselves in their team list
    whereClauses.push("u.id != ?");
    queryParams.push(userId);

    // Search filter
    if (search) {
      const q = `%${search}%`;
      whereClauses.push("(u.name LIKE ? OR u.email LIKE ? OR COALESCE(ap.phone, u.phone) LIKE ?)");
      queryParams.push(q, q, q);
    }

    // Team Role filter
    if (roleFilter && roleFilter !== "ALL") {
      whereClauses.push("ap.team_role = ?");
      queryParams.push(roleFilter);
    }

    // Status filter
    if (statusFilter && statusFilter !== "ALL") {
      if (statusFilter === "active") {
        whereClauses.push("u.is_active = 1");
      } else if (statusFilter === "inactive") {
        whereClauses.push("u.is_active = 0");
      }
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // Count Total
    const [[{ total }]] = await pool.query(`
      SELECT COUNT(*) as total
      FROM agent_profiles ap
      JOIN users u ON u.id = ap.user_id
      ${whereSql}
    `, queryParams);

    // Main Query
    const [rows] = await pool.query(`
      SELECT 
        u.id,
        u.name,
        u.email,
        COALESCE(ap.phone, u.phone) as phone,
        u.is_active,
        u.created_at,
        ap.id as profile_id,
        COALESCE(ap.team_role, 'AGENT') as team_role,
        ap.is_online,
        ap.agency_id,
        ap.owner_user_id,
        a.name as agency_name,
        owner.name as owner_name
      FROM agent_profiles ap
      JOIN users u ON u.id = ap.user_id
      LEFT JOIN agencies a ON a.id = ap.agency_id
      LEFT JOIN users owner ON owner.id = ap.owner_user_id
      ${whereSql}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `, [...queryParams, limit, offset]);

    return res.json({
      success: true,
      teamMembers: rows,
      pagination: {
        total: Number(total || 0),
        totalPages: Math.ceil((total || 0) / limit) || 1,
        currentPage: page,
        limit,
      },
      plan: planStats,
    });
  } catch (err) {
    console.error("Get team members error:", err);
    return res.status(500).json({ success: false, message: "Server error loading team members" });
  }
});

// ─── CREATE TEAM MEMBER ───────────────────────────────────────────────────────
router.post("/team-members", async (req, res) => {
  const { name, email, phone, password, teamRole = "AGENT" } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: "Name, email, and password are required" });
  }

  const callerId = req.user.id;
  const callerRole = req.user.role;
  const callerAgencyId = req.user.agencyId;

  // 1. Enforce package limit for Agency and End User accounts
  if (callerRole !== "ADMIN") {
    try {
      await assertLimit(callerAgencyId, "max_team_members", 1, callerId);
    } catch (limitErr) {
      return res.status(403).json({
        success: false,
        message: limitErr.message || "Team member limit reached for your current subscription plan.",
        code: "LIMIT_EXCEEDED",
      });
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 2. Check email uniqueness
    const [[existing]] = await conn.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email.toLowerCase().trim()]);
    if (existing) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "An account with this email already exists" });
    }

    // 3. Hash password and create user
    const hashed = await bcrypt.hash(password, 10);
    const [userResult] = await conn.query(
      `INSERT INTO users (name, email, phone, password, role, is_active, created_at)
       VALUES (?, ?, ?, ?, 'AGENT', 1, NOW())`,
      [name.trim(), email.toLowerCase().trim(), phone ? phone.trim() : null, hashed]
    );
    const newUserId = userResult.insertId;

    // 4. Create agent/team member profile
    await conn.query(
      `INSERT INTO agent_profiles (user_id, owner_user_id, agency_id, user_type, team_role, phone, is_online, created_at)
       VALUES (?, ?, ?, 'AGENCY_USER', ?, ?, 0, NOW())`,
      [
        newUserId,
        callerId,
        callerAgencyId || null,
        teamRole || "AGENT",
        phone ? phone.trim() : null,
      ]
    );

    await conn.commit();

    return res.status(201).json({
      success: true,
      message: `Team member "${name}" created successfully with role "${teamRole}".`,
      teamMember: {
        id: newUserId,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone ? phone.trim() : null,
        team_role: teamRole,
        is_active: 1,
        created_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    await conn.rollback();
    console.error("Create team member error:", err);
    return res.status(500).json({ success: false, message: "Server error creating team member" });
  } finally {
    conn.release();
  }
});

// ─── GET SINGLE TEAM MEMBER PROFILE ──────────────────────────────────────────
router.get("/team-members/:id", async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const callerId = req.user.id;
    const callerRole = req.user.role;
    const callerAgencyId = req.user.agencyId;

    const [rows] = await pool.query(`
      SELECT 
        u.id,
        u.name,
        u.email,
        COALESCE(ap.phone, u.phone) as phone,
        u.avatar,
        u.is_active,
        u.created_at,
        u.updated_at,
        ap.id as profile_id,
        COALESCE(ap.team_role, 'AGENT') as team_role,
        ap.is_online,
        ap.agency_id,
        ap.owner_user_id,
        a.name as agency_name,
        owner.name as owner_name
      FROM agent_profiles ap
      JOIN users u ON u.id = ap.user_id
      LEFT JOIN agencies a ON a.id = ap.agency_id
      LEFT JOIN users owner ON owner.id = ap.owner_user_id
      WHERE u.id = ?
      LIMIT 1
    `, [targetUserId]);

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Team member not found" });
    }

    const member = rows[0];

    // Security check: non-admin callers can only view members they own or belong to their agency
    if (callerRole !== "ADMIN") {
      const isOwner = Number(member.owner_user_id) === Number(callerId);
      const isSameAgency = callerAgencyId && Number(member.agency_id) === Number(callerAgencyId);
      if (!isOwner && !isSameAgency) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
    }

    // Get quick activity stats (conversations handled)
    let assignedConversations = 0;
    try {
      const [[convCount]] = await pool.query(
        "SELECT COUNT(*) as cnt FROM conversations WHERE agent_id = ?",
        [targetUserId]
      );
      assignedConversations = Number(convCount?.cnt || 0);
    } catch {
      // ignore
    }

    return res.json({
      success: true,
      teamMember: {
        ...member,
        assignedConversations,
      },
    });
  } catch (err) {
    console.error("Get single team member error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── UPDATE TEAM MEMBER ───────────────────────────────────────────────────────
router.put("/team-members/:id", async (req, res) => {
  const targetUserId = req.params.id;
  const { name, email, phone, teamRole, password, is_active } = req.body;
  const callerId = req.user.id;
  const callerRole = req.user.role;
  const callerAgencyId = req.user.agencyId;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Verify existence & ownership
    const [check] = await conn.query(
      "SELECT ap.id, ap.owner_user_id, ap.agency_id FROM agent_profiles ap WHERE ap.user_id = ?",
      [targetUserId]
    );

    if (!check.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: "Team member not found" });
    }

    if (callerRole !== "ADMIN") {
      const isOwner = Number(check[0].owner_user_id) === Number(callerId);
      const isSameAgency = callerAgencyId && Number(check[0].agency_id) === Number(callerAgencyId);
      if (!isOwner && !isSameAgency) {
        await conn.rollback();
        return res.status(403).json({ success: false, message: "Forbidden: You cannot edit this member" });
      }
    }

    // 2. Check email uniqueness if email changed
    if (email) {
      const [[coll]] = await conn.query(
        "SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1",
        [email.toLowerCase().trim(), targetUserId]
      );
      if (coll) {
        await conn.rollback();
        return res.status(400).json({ success: false, message: "Email is already in use by another user" });
      }
    }

    // 3. Update user fields
    let userUpdates = [];
    let userParams = [];

    if (name) {
      userUpdates.push("name = ?");
      userParams.push(name.trim());
    }
    if (email) {
      userUpdates.push("email = ?");
      userParams.push(email.toLowerCase().trim());
    }
    if (phone !== undefined) {
      userUpdates.push("phone = ?");
      userParams.push(phone ? phone.trim() : null);
    }
    if (is_active !== undefined) {
      userUpdates.push("is_active = ?");
      userParams.push(is_active ? 1 : 0);
    }
    if (password && password.trim()) {
      const hashed = await bcrypt.hash(password.trim(), 10);
      userUpdates.push("password = ?");
      userParams.push(hashed);
    }

    if (userUpdates.length > 0) {
      userParams.push(targetUserId);
      await conn.query(`UPDATE users SET ${userUpdates.join(", ")} WHERE id = ?`, userParams);
    }

    // 4. Update agent_profiles fields (team_role, phone)
    let apUpdates = [];
    let apParams = [];

    if (teamRole) {
      apUpdates.push("team_role = ?");
      apParams.push(teamRole);
    }
    if (phone !== undefined) {
      apUpdates.push("phone = ?");
      apParams.push(phone ? phone.trim() : null);
    }

    if (apUpdates.length > 0) {
      apParams.push(targetUserId);
      await conn.query(`UPDATE agent_profiles SET ${apUpdates.join(", ")} WHERE user_id = ?`, apParams);
    }

    await conn.commit();
    return res.json({ success: true, message: "Team member updated successfully" });
  } catch (err) {
    await conn.rollback();
    console.error("Update team member error:", err);
    return res.status(500).json({ success: false, message: "Server error updating team member" });
  } finally {
    conn.release();
  }
});

// ─── TOGGLE TEAM MEMBER ACTIVE STATUS ─────────────────────────────────────────
router.patch("/team-members/:id/toggle", async (req, res) => {
  const targetUserId = req.params.id;
  const callerId = req.user.id;
  const callerRole = req.user.role;
  const callerAgencyId = req.user.agencyId;

  try {
    const [check] = await pool.query(
      "SELECT ap.id, ap.owner_user_id, ap.agency_id, u.is_active FROM agent_profiles ap JOIN users u ON u.id = ap.user_id WHERE ap.user_id = ?",
      [targetUserId]
    );

    if (!check.length) {
      return res.status(404).json({ success: false, message: "Team member not found" });
    }

    if (callerRole !== "ADMIN") {
      const isOwner = Number(check[0].owner_user_id) === Number(callerId);
      const isSameAgency = callerAgencyId && Number(check[0].agency_id) === Number(callerAgencyId);
      if (!isOwner && !isSameAgency) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
    }


    const nextStatus = check[0].is_active ? 0 : 1;
    await pool.query("UPDATE users SET is_active = ? WHERE id = ?", [nextStatus, targetUserId]);

    return res.json({ success: true, isActive: nextStatus === 1 });
  } catch (err) {
    console.error("Toggle team member error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── DELETE TEAM MEMBER ───────────────────────────────────────────────────────
router.delete("/team-members/:id", async (req, res) => {
  const targetUserId = req.params.id;
  const callerId = req.user.id;
  const callerRole = req.user.role;
  const callerAgencyId = req.user.agencyId;

  try {
    const [check] = await pool.query(
      "SELECT ap.id, ap.owner_user_id, ap.agency_id FROM agent_profiles ap WHERE ap.user_id = ?",
      [targetUserId]
    );

    if (!check.length) {
      return res.status(404).json({ success: false, message: "Team member not found" });
    }

    if (callerRole !== "ADMIN") {
      const isOwner = Number(check[0].owner_user_id) === Number(callerId);
      const isSameAgency = callerAgencyId && Number(check[0].agency_id) === Number(callerAgencyId);
      if (!isOwner && !isSameAgency) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
    }

    // Deleting from users cascades to agent_profiles
    await pool.query("DELETE FROM users WHERE id = ?", [targetUserId]);

    return res.json({ success: true, message: "Team member removed successfully" });
  } catch (err) {
    console.error("Delete team member error:", err);
    return res.status(500).json({ success: false, message: "Server error deleting team member" });
  }
});

export default router;
