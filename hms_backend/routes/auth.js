import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";

const router = express.Router();

// ✅ Super Admin Login
router.post("/superadmin/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await pool.execute(
      `SELECT 
    u.id AS user_id,
    u.first_name,
    u.last_name,
    u.email,
    u.password,
    h.id AS hospital_id,
    h.hospital_name,
    GROUP_CONCAT(DISTINCT r.name) AS roles,
    GROUP_CONCAT(DISTINCT p.name) AS permissions
FROM users u
LEFT JOIN hospitals h ON u.hospital_id = h.id
LEFT JOIN user_roles ur ON u.id = ur.user_id
LEFT JOIN roles r ON ur.role_id = r.id
LEFT JOIN role_permissions rp ON r.id = rp.role_id
LEFT JOIN permissions p ON rp.permission_id = p.id
WHERE u.email = ?
GROUP BY u.id
LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid email" });
    }
    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // Create token
    const token = jwt.sign(
      {
        id: user.user_id,
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
        username: user.username,
        hospital_id: user.hospital_id,
        hospital_name: user.hospital_name,
        roles: user.roles ? user.roles.split(',') : [],
        permissions: user.permissions ? user.permissions.split(',') : [],
      },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );    
    res.cookie("token", token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 1000,
    });
    res.json({
      message: "Login successful",
      user: {
        id: user.user_id,
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
        username: user.username,
        hospital_id: user.hospital_id,
        hospital_name: user.hospital_name,
        roles: user.roles ? user.roles.split(',') : [],
        permissions: user.permissions ? user.permissions.split(',') : [],
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Check-auth
router.get("/check-auth", authMiddleWare, (req, res) => {
  res.json({ user: req.user });
});

// ✅ Logout
router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out" });
});

export default router;
