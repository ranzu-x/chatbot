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
  upload.single("profile_image"), // Match the column name in the DB
  async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const currentUser = req.user;
      const hospital_id = currentUser.hospital_id;

      // --- Destructure all potential fields from the request body ---
      const {
        firstName,
        lastName,
        email,
        password,
        phone,
        gender,
        dateOfBirth,
        address,
        // Staff-specific fields
        department,
        qualification,
        emergencyContact,
        // Doctor-specific field
        specialization,
      } = req.body;

      // --- Authorization Check (Unchanged) ---
      const userRoles = currentUser.roles || [];
      const isSuperAdmin = userRoles.includes("super_admin");
      const isHospitalAdmin = userRoles.includes("hospital_admin");

      if (!isSuperAdmin && !isHospitalAdmin) {
        return res.status(403).json({ message: "You are not authorized to create users." });
      }

      // --- Data Preparation (Unchanged) ---
      const profileImage = req.file ? req.file.filename : null;
      const hashedPassword = await bcrypt.hash(password, 10);

      // ==========================================================
      // Step 1: Insert into the lean 'users' table
      // This table now only contains core identity and auth info.
      // ==========================================================
      const [userResult] = await connection.query(
        `
        INSERT INTO users (
          hospital_id, first_name, last_name, email, password,
          phone, gender, date_of_birth, address, profile_image, created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          address,
          profileImage,
          currentUser.id // Log who created this user
        ]
      );

      const userId = userResult.insertId;

      // ==========================================================
      // Step 2: If it's a staff member, insert into 'staff_profiles'
      // We determine this by the presence of a 'department'.
      // ==========================================================
      if (department) {
        await connection.query(
          `
          INSERT INTO staff_profiles (
            user_id, department, qualification, emergency_contact
          )
          VALUES (?, ?, ?, ?)
          `,
          [userId, department, qualification, emergencyContact]
        );
      }

      // ==========================================================
      // Step 3: Assign a role based on the department
      // (This logic remains largely the same)
      // ==========================================================
      let role_id = null;
      // Define roles in a clearer way
      const roleMap = {
          "doctor": 3,
          "nurse": 4,
          "receptionist": 5,
          "lab technician": 6,
          "pharmacist": 7,
      };
      
      role_id = roleMap[department?.toLowerCase()];

      if (role_id) {
        await connection.query(
          `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`,
          [userId, role_id]
        );
      }

      // ==========================================================
      // Step 4: If the role is a doctor, insert into 'doctor_details'
      // This provides doctor-specific information like specialization.
      // ==========================================================
      if (role_id === 3) { // 3 is the role_id for 'Doctor'
        await connection.query(
          `
          INSERT INTO doctor_details (user_id, specialization)
          VALUES (?, ?)
          `,
          [userId, specialization]
        );

        // // Optional: Assign doctor-specific permissions (your logic was fine)
        // const permissionId = 3; // "write prescription"
        // const [exists] = await connection.query(
        //   `SELECT 1 FROM role_permissions WHERE role_id = ? AND permission_id = ?`,
        //   [role_id, permissionId]
        // );

        // if (exists.length === 0) {
        //   await connection.query(
        //     `INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
        //     [role_id, permissionId]
        //   );
        // }
      }

      // --- If all queries succeed, commit the transaction ---
      await connection.commit();

      res.status(201).json({
        message: "User and profiles created successfully",
        userId,
      });
    } catch (error) {
      // --- If any query fails, roll back all previous queries ---
      await connection.rollback();
      console.error("❌ Error creating user:", error);

      // Check for a specific duplicate entry error
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'A user with this email or username already exists for this hospital.' });
      }

      res.status(500).json({
        message: "Server error while creating user",
        error: error.message,
      });
    } finally {
      // --- Always release the connection back to the pool ---
      if (connection) connection.release();
    }
  }
);


router.get("/team-members", authMiddleWare, async (req, res) => {
  try {
    const hospitalId = req.user.hospital_id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const offset = (page - 1) * limit;

    const like = `%${search}%`;

    const [[countResult]] = await pool.query(
      `
      SELECT COUNT(*) AS totalStaffs
      FROM users u
      LEFT JOIN staff_profiles sp ON u.id = sp.user_id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.hospital_id = ?
      AND (r.name IS NULL OR r.name != 'hospital_admin')
      AND (
        u.first_name LIKE ? OR
        u.last_name LIKE ? OR
        u.email LIKE ? OR
        u.phone LIKE ? OR
        sp.department LIKE ?
      )
      `,
      [hospitalId, like, like, like, like, like]
    );

    const totalStaffs = countResult.totalStaffs;
    const totalPages = Math.ceil(totalStaffs / limit);

    const [rows] = await pool.query(
      `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.gender,
        u.phone,
        u.email,
        sp.department,
        r.name AS role_name
      FROM users u
      LEFT JOIN staff_profiles sp ON u.id = sp.user_id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.hospital_id = ?
      AND (r.name IS NULL OR r.name != 'hospital_admin')
      AND (
        u.first_name LIKE ? OR
        u.last_name LIKE ? OR
        u.email LIKE ? OR
        u.phone LIKE ? OR
        sp.department LIKE ?
      )
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [hospitalId, like, like, like, like, like, limit, offset]
    );

    res.json({
      staffMembers: rows,
      pagination: {
        totalStaffs,
        totalPages,
        currentPage: page,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Get all doctors with their full, joined profile information
router.get("/doctors", authMiddleWare, async (req, res) => {
    try {
        const hospitalId = req.user.hospital_id;

        const [rows] = await pool.query(
            `
            SELECT 
                u.id,
                u.first_name,
                u.last_name,
                u.email,
                u.phone,
                u.profile_image,
                sp.department,         -- <<< ADDED: Get department from staff_profiles
                dd.specialization,     -- <<< ADDED: Get specialization from doctor_details
                sp.qualification       -- <<< ADDED: Get qualification from staff_profiles
            FROM users u
            -- The JOIN to user_roles and roles is still the best way to identify doctors
            INNER JOIN user_roles ur ON u.id = ur.user_id
            INNER JOIN roles r ON ur.role_id = r.id
            -- Now, join the other tables to get the rest of their profile
            INNER JOIN staff_profiles sp ON u.id = sp.user_id
            INNER JOIN doctor_details dd ON u.id = dd.user_id
            WHERE u.hospital_id = ?
              AND r.name = 'doctor'
            `,
            [hospitalId]
        );

        console.log("Hospital ID:", hospitalId);
        console.log("Doctors found:", rows.length);
        res.json(rows);
    } catch (err) {
        console.error("Error fetching doctors:", err);
        res.status(500).json({ error: err.message });
    }
});
export default router;
