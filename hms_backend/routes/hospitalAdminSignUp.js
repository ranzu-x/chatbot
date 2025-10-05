// backend/routes/auth.js
import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db.js";

const router = express.Router();

// ✅ Hospital Admin Signup (Auto-login)
router.post("/hospital-admin/signup", async (req, res) => {
  const { firstname, lastname, email, password } = req.body;

  try {
    // 1️⃣ Check if email already exists
    const [existingUser] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existingUser.length > 0) {
      return res.status(400).json({ message: "Email already exists. Please log in instead." });
    }

    // 2️⃣ Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3️⃣ Create hospital with unique code
    function generateHospitalCode(length = 10) {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      let code = "";
      for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    }

    const hospitalCode = generateHospitalCode();
    const [hospitalResult] = await pool.query(
      "INSERT INTO hospitals (hospital_name, hospital_code) VALUES (?, ?)",
      [`${firstname}'s Hospital`, hospitalCode]
    );

    const hospitalId = hospitalResult.insertId;

    // 4️⃣ Create user (hospital admin)
    const [userResult] = await pool.query(
      "INSERT INTO users (first_name, last_name, email, password, hospital_id) VALUES (?, ?, ?, ?, ?)",
      [firstname, lastname, email, hashedPassword, hospitalId]
    );
    const userId = userResult.insertId;

    // 5️⃣ Assign hospital_admin role
    const hospitalAdminRoleId = 2; // assuming 2 = hospital_admin
    await pool.query("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [userId, hospitalAdminRoleId]);

    // 6️⃣ Fetch full user details (same query as login)
    const [rows] = await pool.query(
      `SELECT 
        u.id AS user_id,
        u.first_name,
        u.last_name,
        u.email,
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
      WHERE u.id = ?
      GROUP BY u.id
      LIMIT 1`,
      [userId]
    );

    const user = rows[0];

    // 7️⃣ Create token (same as login)
    const tokenPayload = {
      id: user.user_id,
      name: `${user.first_name} ${user.last_name}`,
      email: user.email,
      username: user.username,
      hospital_id: user.hospital_id,
      hospital_name: user.hospital_name,
      roles: user.roles ? user.roles.split(",") : [],
      permissions: user.permissions ? user.permissions.split(",") : [],
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: "1h" });

    // 8️⃣ Set cookie for auto-login
    res.cookie("token", token, {
      httpOnly: true,
      secure: false, // change to true if using HTTPS
      sameSite: "lax",
      maxAge: 60 * 60 * 1000, // 1 hour
    });

    // 9️⃣ Send response (same as login)
    res.status(201).json({
      message: "Signup successful",
      user: tokenPayload,
    });
  } catch (error) {
    console.error("❌ Error creating hospital admin:", error);
    res.status(500).json({ message: "Something went wrong" });
  }
});

export default router;
