import express from "express";
import multer from "multer";
import bcrypt from "bcrypt";
import pool from "../db.js"; // your MySQL connection
import { authMiddleWare } from "../middleware/authmiddleware.js";

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/profile"); // folder to store uploaded files
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// ✅ Add new user (Doctor, Nurse, etc.)
router.post("/users/create-users", authMiddleWare, upload.single("profileImage"), async (req, res) => {
  try {
    const currentUser = req.user; // Get current user from authmiddleware
    const {
      hospital_id,
      firstName,
      lastName,
      email,
      password,
      phone,
      gender,
      dateOfBirth,
      age,
      department,
      qualification,
      specialization,
      address,
      emergencyContact,
    } = req.body;


   // ✅ Check if the user has admin-level access
const userRoles = currentUser.roles || [];

const isSuperAdmin = userRoles.includes("super_admin");
const isHospitalAdmin = userRoles.includes("hospital_admin");

// ❌ If neither super_admin nor hospital_admin, deny access
if (!isSuperAdmin && !isHospitalAdmin) {
  return res.status(403).json({ message: "You are not authorized to create users." });
}

// 🏥 Optional: hospital_admin can only create users for their own hospital
if (isHospitalAdmin && hospital_id !== currentUser.hospital_id) {
  return res.status(403).json({ message: "You can only create users within your hospital." });
}

    const profileImage = req.file ? req.file.filename : null;
    const hashedPassword = await bcrypt.hash(password, 10);

    // 🧩 SQL Insert Query
    const [result] = await pool.query(
      `
      INSERT INTO users (
        hospital_id,
        first_name,
        last_name,
        email,
        password,
        phone,
        gender,
        date_of_birth,
        age,
        department,
        qualification,
        specialization,
        address,
        emergency_contact,
        profile_image
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        hospital_id,
        firstName,
        lastName,
        email,
        hashedPassword,
        phone,
        gender,
        dateOfBirth,
        age,
        department,
        qualification,
        specialization,
        address,
        emergencyContact,
        profileImage,
      ]
    );

    res.status(201).json({
      message: "User created successfully",
      userId: result.insertId,
    });
  } catch (error) {
    console.error("Error inserting user:", error);
    res.status(500).json({ message: "Server error while creating user" });
  }
});

export default router;
