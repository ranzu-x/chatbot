import express from "express";
import bcrypt from "bcrypt";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { assertLimit, getAgencyEntitlements } from "../utils/entitlements.js";
import { buildSearch } from "../utils/searchQuery.js";
import { getAccessibleIntegrationIds, setIntegrationAccess } from "../utils/teamAccess.js";
import { invalidateTenantCache } from "../middleware/tenant.js";

const router = express.Router();

// All team routes require authentication
router.use(authMiddleware);

// Was missing entirely below — every /team-members mutation (create/edit/
// toggle/delete) had no permission check beyond "is logged in," so any
// authenticated user (including a plain Agent) could call them directly and
// e.g. reassign their own role. "team.view"/"team.manage" already existed
// as permission keys (seeded correctly — only Owner gets team.manage by
// default) but were never actually required by these routes until now.
const requireTeamView = requirePermission("team.view", "team.manage");
const requireTeamManage = requirePermission("team.manage");

// ─── MY OWN HUMAN-AGENT SIGNATURE (Live Inbox "Join Chat" modal) ─────────────
// Self-only, registered before the generic /team-members/:id routes below
// (otherwise :id would greedily match "me"). Any authenticated user —
// including an agency owner, who may not have an agent_profiles row yet —
// can read/set their own signature; upserted so an owner's first save
// creates their row rather than failing.
router.get("/team-members/me", async (req, res) => {
  try {
    const [[row]] = await pool.query("SELECT signature FROM agent_profiles WHERE user_id = ?", [req.user.id]);
    return res.json({ success: true, signature: row?.signature || "" });
  } catch (err) {
    console.error("GET /team-members/me error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/team-members/me", async (req, res) => {
  try {
    const { signature } = req.body;
    const trimmed = typeof signature === "string" ? signature.trim().slice(0, 500) : "";
    const [[existing]] = await pool.query("SELECT id FROM agent_profiles WHERE user_id = ?", [req.user.id]);
    if (existing) {
      await pool.query("UPDATE agent_profiles SET signature = ? WHERE user_id = ?", [trimmed || null, req.user.id]);
    } else {
      // No agent_profiles row yet (e.g. an agency owner who has never been
      // through the team-member creation flow) — create a minimal one so
      // their signature has somewhere to live. Deliberately leaves
      // agency_id NULL: utils/entitlements.js's usedTeamMembers count is
      // `WHERE agency_id = ?`, and an owner must never count against their
      // own max_team_members limit just for saving a signature.
      await pool.query(
        "INSERT INTO agent_profiles (user_id, owner_user_id, user_type, team_role, signature) VALUES (?, ?, 'OWNER_USER', 'OWNER', ?)",
        [req.user.id, req.user.id, trimmed || null]
      );
    }
    return res.json({ success: true, signature: trimmed });
  } catch (err) {
    console.error("PUT /team-members/me error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Legacy free-text team_role -> new system role slug (for callers still on
// the old create/edit shape); new UI passes roleId directly.
const LEGACY_TEAM_ROLE_MAP = {
  MANAGER: "manager",
  AGENT: "agent",
  BOT_BUILDER: "bot_builder",
  MARKETING: "marketing",
  VIEWER: "viewer",
};

async function resolveRoleId({ roleId, teamRole }) {
  if (roleId) {
    const [[row]] = await pool.query("SELECT id FROM roles WHERE id = ? AND scope_type = 'AGENCY'", [roleId]);
    if (row) return row.id;
  }
  const slug = LEGACY_TEAM_ROLE_MAP[String(teamRole || "").toUpperCase()] || "agent";
  const [[row]] = await pool.query("SELECT id FROM roles WHERE scope_type='AGENCY' AND agency_id IS NULL AND slug=?", [slug]);
  return row?.id || null;
}

// ─── GET TEAM MEMBERS (WITH ROLES, STATS & PACKAGE LIMITS) ───────────────────
router.get("/team-members", requireTeamView, async (req, res) => {
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

    // Ranked, multi-word search across name / email / phone — see
    // utils/searchQuery.js.
    const searchClause = await buildSearch({
      term: search,
      fulltext: [{ table: "users", columns: ["name", "email"], expr: "u.name, u.email", weight: 4 }],
      like: ["u.name", "u.email", "COALESCE(ap.phone, u.phone)"],
      boost: { expr: "u.name" },
    });
    if (searchClause.active) {
      whereClauses.push(searchClause.where);
      queryParams.push(...searchClause.whereParams);
    }

    // Team Role filter (matches either the legacy free-text team_role or the new role slug)
    if (roleFilter && roleFilter !== "ALL") {
      whereClauses.push("(ap.team_role = ? OR r.slug = ?)");
      queryParams.push(roleFilter, roleFilter);
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
      LEFT JOIN organization_members om ON om.user_id = ap.user_id AND om.agency_id = ap.agency_id
      LEFT JOIN roles r ON r.id = om.role_id
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
        owner.name as owner_name,
        om.id as org_member_id,
        om.chat_access as chat_access,
        r.id as role_id,
        r.slug as role_slug,
        r.name as role_name
        ${searchClause.active ? `, ${searchClause.relevance} AS _relevance` : ""}
      FROM agent_profiles ap
      JOIN users u ON u.id = ap.user_id
      LEFT JOIN agencies a ON a.id = ap.agency_id
      LEFT JOIN users owner ON owner.id = ap.owner_user_id
      LEFT JOIN organization_members om ON om.user_id = ap.user_id AND om.agency_id = ap.agency_id
      LEFT JOIN roles r ON r.id = om.role_id
      ${whereSql}
      ORDER BY ${searchClause.active ? "_relevance DESC, " : ""}u.created_at DESC
      LIMIT ? OFFSET ?
    `, [...(searchClause.active ? searchClause.relevanceParams : []), ...queryParams, limit, offset]);

    // Attach channel access (null = unrestricted) without an N+1 query
    for (const member of rows) {
      member.integrationAccess = member.org_member_id ? await getAccessibleIntegrationIds(member.org_member_id) : null;
    }

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
router.post("/team-members", requireTeamManage, async (req, res) => {
  const { name, email, phone, password, teamRole = "AGENT", roleId, integrationIds, chatAccess } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: "Name, email, and password are required" });
  }
  const resolvedChatAccess = chatAccess === "ASSIGNED_ONLY" ? "ASSIGNED_ONLY" : "ALL";

  const callerId = req.user.id;
  const callerRole = req.user.role;
  const callerAgencyId = req.user.agencyId;

  // 1. Enforce package limit for Agency and End User accounts (reseller-pool
  // aware as of utils/entitlements.js's assertLimit — see the approved plan §7)
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
       VALUES (?, ?, ?, ?, 'USER', 1, NOW())`,
      [name.trim(), email.toLowerCase().trim(), phone ? phone.trim() : null, hashed]
    );
    const newUserId = userResult.insertId;

    // 4. Create agent/team member profile (kept — still holds bot-presence
    //    is_online state unrelated to permissions)
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

    // 5. Real role + org membership (permissions, chat access)
    const finalRoleId = await resolveRoleId({ roleId, teamRole });
    let orgMemberId = null;
    if (finalRoleId && callerAgencyId) {
      const [omResult] = await conn.query(
        `INSERT INTO organization_members (user_id, agency_id, role_id, member_kind, chat_access)
         VALUES (?, ?, ?, 'TEAM_MEMBER', ?)`,
        [newUserId, callerAgencyId, finalRoleId, resolvedChatAccess]
      );
      orgMemberId = omResult.insertId;
    }

    await conn.commit();

    // 6. Channel/bot access checklist (outside the transaction — its own
    //    table, non-critical if it fails partway, and setIntegrationAccess
    //    already does its own delete+insert atomically enough for this use)
    if (orgMemberId && Array.isArray(integrationIds)) {
      await setIntegrationAccess(orgMemberId, integrationIds);
    }

    return res.status(201).json({
      success: true,
      message: `Team member "${name}" created successfully with role "${teamRole}".`,
      teamMember: {
        id: newUserId,
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone ? phone.trim() : null,
        team_role: teamRole,
        role_id: finalRoleId,
        chat_access: resolvedChatAccess,
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
router.get("/team-members/:id", requireTeamView, async (req, res) => {
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
        owner.name as owner_name,
        om.id as org_member_id,
        om.chat_access as chat_access,
        r.id as role_id,
        r.slug as role_slug,
        r.name as role_name
      FROM agent_profiles ap
      JOIN users u ON u.id = ap.user_id
      LEFT JOIN agencies a ON a.id = ap.agency_id
      LEFT JOIN users owner ON owner.id = ap.owner_user_id
      LEFT JOIN organization_members om ON om.user_id = ap.user_id AND om.agency_id = ap.agency_id
      LEFT JOIN roles r ON r.id = om.role_id
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

    member.integrationAccess = member.org_member_id ? await getAccessibleIntegrationIds(member.org_member_id) : null;

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
router.put("/team-members/:id", requireTeamManage, async (req, res) => {
  const targetUserId = req.params.id;
  const { name, email, phone, teamRole, password, is_active, roleId, integrationIds, chatAccess } = req.body;
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

    // 5. Update / create the real role + org membership row
    const [[existingMember]] = await conn.query(
      "SELECT id FROM organization_members WHERE user_id = ? AND agency_id = ?",
      [targetUserId, check[0].agency_id]
    );
    let orgMemberId = existingMember?.id || null;
    const omUpdates = [];
    const omParams = [];
    if (roleId || teamRole) {
      const finalRoleId = await resolveRoleId({ roleId, teamRole });
      if (finalRoleId) { omUpdates.push("role_id = ?"); omParams.push(finalRoleId); }
    }
    if (chatAccess === "ALL" || chatAccess === "ASSIGNED_ONLY") {
      omUpdates.push("chat_access = ?");
      omParams.push(chatAccess);
    }
    if (orgMemberId && omUpdates.length) {
      omParams.push(orgMemberId);
      await conn.query(`UPDATE organization_members SET ${omUpdates.join(", ")} WHERE id = ?`, omParams);
    } else if (!orgMemberId && check[0].agency_id) {
      // Backfill a missing membership row (e.g. a pre-migration member never touched since)
      const finalRoleId = await resolveRoleId({ roleId, teamRole });
      if (finalRoleId) {
        const [ins] = await conn.query(
          "INSERT INTO organization_members (user_id, agency_id, role_id, member_kind, chat_access) VALUES (?,?,?, 'TEAM_MEMBER', ?)",
          [targetUserId, check[0].agency_id, finalRoleId, chatAccess === "ASSIGNED_ONLY" ? "ASSIGNED_ONLY" : "ALL"]
        );
        orgMemberId = ins.insertId;
      }
    }

    await conn.commit();

    if (orgMemberId && Array.isArray(integrationIds)) {
      await setIntegrationAccess(orgMemberId, integrationIds);
    }

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
router.patch("/team-members/:id/toggle", requireTeamManage, async (req, res) => {
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
    invalidateTenantCache();

    return res.json({ success: true, isActive: nextStatus === 1 });
  } catch (err) {
    console.error("Toggle team member error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── DELETE TEAM MEMBER ───────────────────────────────────────────────────────
router.delete("/team-members/:id", requireTeamManage, async (req, res) => {
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

    // Deleting from users cascades to agent_profiles + organization_members
    await pool.query("DELETE FROM users WHERE id = ?", [targetUserId]);

    return res.json({ success: true, message: "Team member removed successfully" });
  } catch (err) {
    console.error("Delete team member error:", err);
    return res.status(500).json({ success: false, message: "Server error deleting team member" });
  }
});

export default router;
