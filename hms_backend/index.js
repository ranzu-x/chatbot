import express from "express";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "./db.js"; // your MySQL pool connection

dotenv.config();
const app = express();
app.use(express.json());

// ✅ Super Admin Login
app.post("/api/v1/superadmin/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Find user by email with role = super_admin
    const [rows] = await pool.execute(
      "SELECT * FROM users WHERE email = ? AND role = 'super_admin' LIMIT 1",
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or role" });
    }

    const user = rows[0];

    // 2. Compare password (bcrypt hashed)
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // 3. Generate JWT
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Get all patients
app.get("/patients", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM patients");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Add a patient
app.post("/patients", async (req, res) => {
  const { name, age } = req.body;
  try {
    const [result] = await pool.query(
      "INSERT INTO patients (name, age) VALUES (?, ?)",
      [name, age]
    );
    res.json({ id: result.insertId, name, age });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Server
app.listen(5000, () => {
  console.log("Server running on port 5000");
});
