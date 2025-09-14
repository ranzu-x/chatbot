import express from "express";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cors from "cors";
import pool from "./db.js"; // your MySQL pool connection

dotenv.config();
const app = express();
const port = process.env.PORT || 5000;

// ✅ Middleware
app.use(express.json());
app.use(cors());

// ✅ Super Admin Login
app.post("/api/v1/superadmin/login", async (req, res) => {
  const { email, password } = req.body;
  console.log("Entered Email:", email);
  console.log("Entered password:", JSON.stringify(password));

  try {
    // 1. Find user by email in super_admin table
    const [rows] = await pool.execute(
      "SELECT * FROM super_admin WHERE email = ? LIMIT 1",
      [email]
    );


    // The password is adminpass


    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid email" });
    }

    const user = rows[0];
    console.log(user.password);


    // 2. Compare password (bcrypt hashed)
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid password" });
    }

    // 3. Generate JWT (no role column in your schema)
    // const token = jwt.sign(
    //   { id: user.id, type: "super_admin" },
    //   process.env.JWT_SECRET,
    //   { expiresIn: "1h" }
    // );

    res.json({
      message: "Login successful",
      // token,
      user: {
        id: user.id,
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
        type: "super_admin", // since role column doesn’t exist
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
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
