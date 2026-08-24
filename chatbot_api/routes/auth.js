import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db.js";

const router = express.Router();

// ─── LOGIN (All roles) ────────────────────────────────────────────────────────
router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ success: false, message: "Email and password are required" });

  try {
    const [rows] = await pool.query(
      `SELECT u.*, a.id as agencyId, a.name as agencyName, a.slug as agencySlug,
              ap.id as agentProfileId, ap.agency_id as agentAgencyId
       FROM users u
       LEFT JOIN agencies a ON a.owner_id = u.id
       LEFT JOIN agent_profiles ap ON ap.user_id = u.id
       WHERE u.email = ? AND u.is_active = 1 LIMIT 1`,
      [email]
    );

    if (rows.length === 0)
      return res.status(401).json({ success: false, message: "Invalid credentials" });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ success: false, message: "Invalid credentials" });

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      agencyId: user.agencyId || user.agentAgencyId || null,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      message: "Login successful",
      user: payload,
      token,
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
router.post("/auth/logout", (req, res) => {
  res.clearCookie("token");
  return res.json({ success: true, message: "Logged out successfully" });
});

// ─── GET CURRENT USER ─────────────────────────────────────────────────────────
router.get("/auth/me", async (req, res) => {
  const token = req.cookies?.token || req.headers?.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, message: "Not authenticated" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return res.json({ success: true, user: decoded });
  } catch {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
});

export default router;