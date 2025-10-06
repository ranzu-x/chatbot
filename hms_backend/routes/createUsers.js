import express from "express";
import multer from "multer";
import pool from "../db.js"; // your MySQL connection

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
router.post("/users/create-users", upload.single("profileImage"), async (req, res) => {
  try {
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

    console.log("Received hospital_id:", hospital_id);

    const profileImage = req.file ? req.file.filename : null;

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
        password, // (hash this in production)
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
