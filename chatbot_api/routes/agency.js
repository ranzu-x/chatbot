import express from "express";
import bcrypt from "bcrypt";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { assertLimit } from "../utils/entitlements.js";
import { unavailableEarnings, getDailyGain, getAutomationStats } from "../utils/dashboardStats.js";
import { countCustomers } from "../utils/resellerScope.js";

const router = express.Router();

// All agency routes require AGENCY or ADMIN role — AGENT is included here
// too NOT because AGENT should reach any route in *this* file (none of them
// match an AGENT's use case), but because every route file in this app is
// mounted at the same flat "/api/v1" prefix (see index.js), so Express
// tries each router in registration order for every request. A blanket
// `router.use(role gate)` here — this file is mounted early — was rejecting
// AGENT-role requests bound for LATER-mounted routers (conversations,
// contacts, team-members, ...) before they ever got there. Confirmed live:
// an AGENT token hitting GET /conversations was rejected by *this* file's
// gate, never reaching routes/conversations.js's own (correctly AGENT-
// inclusive) roleMiddleware at all.
router.use(authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"));

// ─── GET AGENCY DETAILS ───────────────────────────────────────────────────────
router.get("/agency/profile", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query(
      `SELECT a.*, u.name as ownerName, u.email as ownerEmail
       FROM agencies a JOIN users u ON u.id = a.owner_id
       WHERE a.id = ?`,
      [agencyId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Agency not found" });
    return res.json({ success: true, agency: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET AGENCY STATS ─────────────────────────────────────────────────────────
router.get("/agency/stats", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [[{ totalAgents }]] = await pool.query(
      "SELECT COUNT(*) as totalAgents FROM agent_profiles WHERE agency_id = ?", [agencyId]
    );
    const [[{ totalContacts }]] = await pool.query(
      "SELECT COUNT(*) as totalContacts FROM contacts WHERE agency_id = ?", [agencyId]
    );
    const [[{ openConversations }]] = await pool.query(
      "SELECT COUNT(*) as openConversations FROM conversations WHERE agency_id = ? AND status = 'OPEN'", [agencyId]
    );
    const [[{ resolvedConversations }]] = await pool.query(
      "SELECT COUNT(*) as resolvedConversations FROM conversations WHERE agency_id = ? AND status = 'RESOLVED'", [agencyId]
    );
    const [[{ totalMessages }]] = await pool.query(`
      SELECT COUNT(*) as totalMessages FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.agency_id = ?`, [agencyId]
    );
    return res.json({
      success: true,
      stats: { totalAgents, totalContacts, openConversations, resolvedConversations, totalMessages },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── WORKSPACE / RESELLER DASHBOARD ───────────────────────────────────────────
// Scoped from req.tenant (never from the request): daily subscriber gain for
// ?month=YYYY-MM and automation reports for this workspace. A Reseller also
// gets its customer count and its earnings block — reported as unavailable
// until resellers can take payments (decided with the user; no estimates).
router.get("/agency/dashboard", async (req, res) => {
  try {
    const agencyId = req.tenant?.agencyId;
    if (!agencyId) return res.status(404).json({ success: false, message: "Workspace not found" });
    const scope = { kind: "workspace", agencyId };
    const isReseller = req.tenant.accountType === "RESELLER";
    const [dailyGain, automation, customers] = await Promise.all([
      getDailyGain(scope, req.query.month),
      getAutomationStats(scope),
      isReseller ? countCustomers(agencyId) : null,
    ]);
    return res.json({
      success: true,
      dashboard: {
        scope: isReseller ? "RESELLER" : "WORKSPACE",
        users: customers,
        earnings: isReseller ? unavailableEarnings("Your customers can't pay you through the platform yet, so there are no earnings to show.") : null,
        dailyGain,
        automation,
      },
    });
  } catch (err) {
    console.error("Agency dashboard error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET AGENCY ANALYTICS ─────────────────────────────────────────────────────
router.get("/agency/analytics", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const days = parseInt(req.query.days || "14");

    // 1. Daily message volume trends (last N days)
    const [dailyMessages] = await pool.query(`
      SELECT 
        DATE(m.created_at) as date,
        SUM(CASE WHEN m.direction = 'INBOUND' THEN 1 ELSE 0 END) as inbound,
        SUM(CASE WHEN m.direction = 'OUTBOUND' THEN 1 ELSE 0 END) as outbound,
        COUNT(*) as total
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.agency_id = ? AND m.created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(m.created_at)
      ORDER BY DATE(m.created_at) ASC
    `, [agencyId, days]);

    // 2. Platform distribution
    const [platformDistribution] = await pool.query(`
      SELECT c.platform, COUNT(*) as count
      FROM conversations cv
      JOIN contacts c ON c.id = cv.contact_id
      WHERE cv.agency_id = ?
      GROUP BY c.platform
    `, [agencyId]);

    // 3. Conversation status breakdown
    const [statusBreakdown] = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM conversations
      WHERE agency_id = ?
      GROUP BY status
    `, [agencyId]);

    // 4. Role breakdown (bot vs agent vs customer)
    const [roleBreakdown] = await pool.query(`
      SELECT m.direction, COUNT(*) as count
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.agency_id = ?
      GROUP BY m.direction
    `, [agencyId]);

    // 5. Daily subscriber gain (last N days)
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
      WHERE agency_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        AND source IN ('INCOMING', 'INTEGRATION') -- imports + manual adds aren't gain
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) ASC
    `, [agencyId, days]);

    return res.json({
      success: true,
      analytics: {
        dailyMessages,
        platformDistribution,
        statusBreakdown,
        roleBreakdown,
        subscriberGain,
      },
    });
  } catch (err) {
    console.error("Analytics error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});
router.get("/agency/agents", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Helper to ensure an agent_profile exists for a user and return it
    async function ensureAgentProfile(uId) {
      let [[prof]] = await pool.query("SELECT id, is_online FROM agent_profiles WHERE user_id = ?", [uId]);
      if (!prof) {
        const [ins] = await pool.query(
          "INSERT INTO agent_profiles (user_id, owner_user_id, user_type, team_role) VALUES (?, ?, 'OWNER_USER', 'OWNER')",
          [uId, uId]
        );
        prof = { id: ins.insertId, is_online: 0 };
      }
      return prof;
    }

    // Fetch agency to identify account owner
    let ownerId = null;
    if (agencyId) {
      const [[agency]] = await pool.query("SELECT id, owner_id FROM agencies WHERE id = ?", [agencyId]);
      ownerId = agency?.owner_id || null;
    }

    const adminAgents = [];
    const seenUserIds = new Set();

    // 1. Account Owner as Admin
    if (ownerId) {
      const ownerProf = await ensureAgentProfile(ownerId);
      const [[ownerUser]] = await pool.query(
        "SELECT id, name, email, is_active, created_at FROM users WHERE id = ?",
        [ownerId]
      );
      if (ownerUser) {
        adminAgents.push({
          id: ownerUser.id,
          name: "Admin",
          email: ownerUser.email,
          is_active: ownerUser.is_active,
          profileId: ownerProf.id,
          agent_profile_id: ownerProf.id,
          is_online: ownerProf.is_online || 0,
          isAdmin: true,
          role: "ADMIN",
          created_at: ownerUser.created_at,
        });
        seenUserIds.add(ownerUser.id);
      }
    }

    // 2. Platform ADMIN caller if not already added
    if (userRole === "ADMIN" && !seenUserIds.has(userId)) {
      const adminProf = await ensureAgentProfile(userId);
      const [[adminUser]] = await pool.query(
        "SELECT id, name, email, is_active, created_at FROM users WHERE id = ?",
        [userId]
      );
      if (adminUser) {
        adminAgents.push({
          id: adminUser.id,
          name: "Admin",
          email: adminUser.email,
          is_active: adminUser.is_active,
          profileId: adminProf.id,
          agent_profile_id: adminProf.id,
          is_online: adminProf.is_online || 0,
          isAdmin: true,
          role: "ADMIN",
          created_at: adminUser.created_at,
        });
        seenUserIds.add(adminUser.id);
      }
    }

    // 3. Team members explicitly assigned to this agency
    const [teamAgents] = await pool.query(`
      SELECT u.id, u.name, u.email, u.is_active, ap.id as profileId, ap.id as agent_profile_id, ap.is_online, u.created_at
      FROM agent_profiles ap
      JOIN users u ON u.id = ap.user_id
      WHERE ap.agency_id = ?
      ORDER BY u.created_at DESC
    `, [agencyId]);

    const otherAgents = [];
    for (const ag of teamAgents) {
      if (!seenUserIds.has(ag.id)) {
        otherAgents.push(ag);
        seenUserIds.add(ag.id);
      }
    }

    const agents = [...adminAgents, ...otherAgents];
    return res.json({ success: true, agents });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE AGENT ─────────────────────────────────────────────────────────────
router.post("/agency/agents", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ success: false, message: "All fields are required" });

  const agencyId = req.user.agencyId;
  try {
    await assertLimit(agencyId, "max_team_members");
  } catch (limitErr) {
    return res.status(403).json({ success: false, message: limitErr.message });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[existing]] = await conn.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existing) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Email already in use" });
    }
    const hashed = await bcrypt.hash(password, 10);
    // Created by a logged-in admin/reseller, who vouches for the address — so it's
    // marked verified directly instead of emailing a link (see utils/emailVerification.js).
    const [userResult] = await conn.query(
      "INSERT INTO users (name, email, password, role, email_verified_at) VALUES (?, ?, ?, 'USER', NOW())",
      [name, email, hashed]
    );
    await conn.query(
      "INSERT INTO agent_profiles (user_id, agency_id) VALUES (?, ?)",
      [userResult.insertId, agencyId]
    );
    await conn.commit();
    return res.status(201).json({ success: true, message: "Agent created successfully" });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
});

// ─── DELETE AGENT ─────────────────────────────────────────────────────────────
router.delete("/agency/agents/:userId", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [check] = await pool.query(
      "SELECT id FROM agent_profiles WHERE user_id = ? AND agency_id = ?",
      [req.params.userId, agencyId]
    );
    if (!check.length) return res.status(404).json({ success: false, message: "Agent not found" });
    await pool.query("DELETE FROM users WHERE id = ?", [req.params.userId]);
    return res.json({ success: true, message: "Agent removed" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
