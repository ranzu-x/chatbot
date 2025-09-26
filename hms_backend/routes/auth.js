import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";

const router = express.Router();

// ✅ Super Admin Login
router.post("/superadmin/login", async (req, res) => {
  const { email, password } = req.body;
  console.log("rupos: ", password);

  try {
    const [rows] = await pool.execute(
      `SELECT 
         users.id AS user_id,
         users.first_name,
         users.last_name,
         users.email,
         users.password,
         hospitals.id AS hospital_id,
         hospitals.hospital_name AS hospital_name
      FROM users
      LEFT JOIN hospitals ON users.hospital_id = hospitals.id
      WHERE users.email = ? 
      LIMIT 1;`,
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
        email: user.email,
        hospital_id: user.hospital_id,
        hospital_name: user.hospital_name,
        type: "super_admin"
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
        id: user.id,
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
        username: user.username,
        hospital_id: user.hospital_id,
        hospital_name: user.hospital_name,
        type: "super_admin",
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
