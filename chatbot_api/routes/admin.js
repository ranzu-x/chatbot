import express from "express";
import bcrypt from "bcrypt";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();

// All admin routes require ADMIN role
router.use(authMiddleware, roleMiddleware("ADMIN"));

// ─── GET DASHBOARD STATS ──────────────────────────────────────────────────────
router.get("/admin/stats", async (req, res) => {
  try {
    const [[{ totalAgencies }]] = await pool.query("SELECT COUNT(*) as totalAgencies FROM agencies");
    const [[{ totalAgents }]] = await pool.query("SELECT COUNT(*) as totalAgents FROM agent_profiles");
    const [[{ totalConversations }]] = await pool.query("SELECT COUNT(*) as totalConversations FROM conversations");
    const [[{ totalMessages }]] = await pool.query("SELECT COUNT(*) as totalMessages FROM messages");

    return res.json({
      success: true,
      stats: { totalAgencies, totalAgents, totalConversations, totalMessages },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET ALL AGENCIES ─────────────────────────────────────────────────────────
router.get("/admin/agencies", async (req, res) => {
  try {
    const [agencies] = await pool.query(`
      SELECT a.*, u.name as ownerName, u.email as ownerEmail,
             COUNT(DISTINCT ap.id) as agentCount
      FROM agencies a
      JOIN users u ON u.id = a.owner_id
      LEFT JOIN agent_profiles ap ON ap.agency_id = a.id
      GROUP BY a.id
      ORDER BY a.created_at DESC
    `);
    return res.json({ success: true, agencies });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE AGENCY + AGENCY OWNER USER ────────────────────────────────────────
router.post("/admin/agencies", async (req, res) => {
  const { agencyName, ownerName, ownerEmail, ownerPassword, slug, website } = req.body;
  if (!agencyName || !ownerName || !ownerEmail || !ownerPassword)
    return res.status(400).json({ success: false, message: "All fields are required" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Check email uniqueness
    const [[existing]] = await conn.query("SELECT id FROM users WHERE email = ?", [ownerEmail]);
    if (existing) {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Email already in use" });
    }

    const hashed = await bcrypt.hash(ownerPassword, 10);
    const [userResult] = await conn.query(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'AGENCY')",
      [ownerName, ownerEmail, hashed]
    );
    const ownerId = userResult.insertId;

    const agencySlug = slug || agencyName.toLowerCase().replace(/\s+/g, "-");
    await conn.query(
      "INSERT INTO agencies (name, slug, website, owner_id) VALUES (?, ?, ?, ?)",
      [agencyName, agencySlug, website || null, ownerId]
    );

    await conn.commit();
    return res.status(201).json({ success: true, message: "Agency created successfully" });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
});

// ─── TOGGLE AGENCY ACTIVE STATUS ─────────────────────────────────────────────
router.patch("/admin/agencies/:id/toggle", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT is_active FROM agencies WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Agency not found" });
    const newStatus = !rows[0].is_active;
    await pool.query("UPDATE agencies SET is_active = ? WHERE id = ?", [newStatus, req.params.id]);
    return res.json({ success: true, isActive: newStatus });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── DELETE AGENCY ────────────────────────────────────────────────────────────
router.delete("/admin/agencies/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM agencies WHERE id = ?", [req.params.id]);
    return res.json({ success: true, message: "Agency deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET ALL USERS ────────────────────────────────────────────────────────────
router.get("/admin/users", async (req, res) => {
  try {
    const [users] = await pool.query(
      "SELECT id, name, email, role, is_active, created_at FROM users ORDER BY created_at DESC"
    );
    return res.json({ success: true, users });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
