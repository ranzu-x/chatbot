/**
 * Seed Script - Creates the initial ADMIN user
 * Run once: node seed.js
 */
import bcrypt from "bcrypt";
import pool from "./db.js";
import dotenv from "dotenv";
dotenv.config();

const adminUser = {
  name: "Super Admin",
  email: "admin@chatbot.com",
  password: "Admin@123456",
};

async function seed() {
  try {
    console.log("🌱 Running seed script...");

    const [[existing]] = await pool.query("SELECT id FROM users WHERE email = ?", [adminUser.email]);
    if (existing) {
      console.log("⚠️  Admin user already exists. Skipping.");
      process.exit(0);
    }

    const hashed = await bcrypt.hash(adminUser.password, 10);
    await pool.query(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'ADMIN')",
      [adminUser.name, adminUser.email, hashed]
    );

    console.log("✅ Admin user created successfully!");
    console.log("─────────────────────────────────");
    console.log("  Email   :", adminUser.email);
    console.log("  Password:", adminUser.password);
    console.log("─────────────────────────────────");
    console.log("⚠️  Please change the password after first login!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
  }
}

seed();
