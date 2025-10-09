import express from "express";
import multer from "multer";
import bcrypt from "bcrypt";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";

const router = express.Router();

// ==============================
// Multer Config
// ==============================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/profile"),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// ==============================
// Create User Route
// ==============================
router.post(
  "/users/create-users",
  authMiddleWare,
  upload.single("profileImage"),
  async (req, res) => {
    const connection = await pool.getConnection(); // ✅ Use connection for transaction
    try {
      await connection.beginTransaction();

      const currentUser = req.user;
      const hospital_id = currentUser.hospital_id;
      
      const {
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

      const userRoles = currentUser.roles || [];
      const isSuperAdmin = userRoles.includes("super_admin");
      const isHospitalAdmin = userRoles.includes("hospital_admin");

      if (!isSuperAdmin && !isHospitalAdmin) {
        return res.status(403).json({ message: "You are not authorized to create users." });
      }


      const profileImage = req.file ? req.file.filename : null;
      const hashedPassword = await bcrypt.hash(password, 10);

      // ==============================
      // Insert into Users Table
      // ==============================
      const [userResult] = await connection.query(
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

      const userId = userResult.insertId;

      // ==============================
      // Assign Role Based on Department
      // ==============================
      let role_id = null;
      switch (department?.toLowerCase()) {
        case "doctor":
          role_id = 3;
          break;
        case "nurse":
          role_id = 4;
          break;
        case "receptionist":
          role_id = 5;
          break;
        case "lab technician":
          role_id = 6;
          break;
        case "pharmacist":
          role_id = 7;
          break;
        default:
          role_id = null;
      }

      if (role_id) {
        await connection.query(
          `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`,
          [userId, role_id]
        );

        // ==============================
        // Assign Doctor Permissions
        // ==============================
        if (role_id === 3) {
          const permissionId = 3; // "write prescription"
          const [exists] = await connection.query(
            `SELECT * FROM role_permissions WHERE role_id = ? AND permission_id = ?`,
            [role_id, permissionId]
          );

          if (exists.length === 0) {
            await connection.query(
              `INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
              [role_id, permissionId]
            );
          }
        }
      }

      // ✅ Commit transaction
      await connection.commit();

      res.status(201).json({
        message: "User created successfully",
        userId,
      });
    } catch (error) {
      await connection.rollback();
      console.error("❌ Error creating user:", error);
      res.status(500).json({
        message: "Server error while creating user",
        error: error.message,
      });
    } finally {
      connection.release();
    }
  }
);

export default router;
