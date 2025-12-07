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
router.post("/users/create-users", authMiddleWare, upload.single("profile_image"), async (req, res) => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const currentUser = req.user;
      const hospital_id = currentUser.hospital_id;

      // Destructure all potential fields from the request body
      const {
        firstName,
        lastName,
        email,
        password,
        phone,
        gender,
        dateOfBirth,
        address,
        role,       // This is the Role (Doctor, Nurse, etc.)
        qualification,
        emergencyContact,
        specialization,
        services          // This will be a JSON string from the FormData
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
      // Step 1: Insert into the 'users' table (Unchanged)
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
          hospital_id, firstName, lastName, email, hashedPassword,
          phone, gender, dateOfBirth, address, profileImage, currentUser.id
        ]
      );

      const userId = userResult.insertId;

      // ==========================================================
      // Step 2: Insert into 'staff_profiles' (Unchanged)
      // ==========================================================
      if (role) {
        await connection.query(
          `
          INSERT INTO staff_profiles (
            user_id, department, qualification, emergency_contact
          )
          VALUES (?, ?, ?, ?)
          `,
          [userId, role, qualification, emergencyContact]
        );
      }

      // ==========================================================
      // Step 3: Assign Role (Unchanged)
      // ==========================================================
      const roleMap = {
          "doctor": 3,
          "junior_nurse": 4,
          "senior_nurse": 5,
          "receptionist": 6,
          "lab technician": 7,
          "pharmacist": 8,
      };
      const role_id = roleMap[role?.toLowerCase()];
      console.log("Assigned role_id:", role_id);

      if (role_id) {
        await connection.query(
          `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`,
          [userId, role_id]
        );
      }

      // ==========================================================
      // Step 4: Handle All Doctor-Specific Details
      // ==========================================================
      if (role_id === 3) { // 3 is the role_id for 'Doctor'
        // Insert specialization into doctor_details
        await connection.query(
          `
          INSERT INTO doctor_details (user_id, specialization)
          VALUES (?, ?)
          `,
          [userId, specialization]
        );


        // Parse and save the doctor's service fees
        if (services) {
          let parsedServices = [];
          try {
            parsedServices = JSON.parse(services);
          } catch (parseError) {
            throw new Error("Invalid format for service fees.");
          }

          if (Array.isArray(parsedServices) && parsedServices.length > 0) {
            for (const service of parsedServices) {
              if (service.service_id && typeof service.fee === 'number' && service.fee >= 0) {
                await connection.query(
                  `INSERT INTO doctor_services (user_id, service_id, fee) VALUES (?, ?, ?)`,
                  [userId, service.service_id, service.fee]
                );
              }
            }
          }
        }
      }

      // --- If all queries succeed, commit the transaction ---
      await connection.commit();

      res.status(201).json({
        message: "User, profiles, permissions, and fees created successfully",
        userId,
      });
    } catch (error) {
      // --- If any query fails, roll back all previous queries ---
      await connection.rollback();
      console.error("❌ Error creating user:", error);

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
    const role = req.query.role || ""; // 1. Get role from query
    const offset = (page - 1) * limit;

    // Base Query
    let baseQuery = `
      FROM users u
      LEFT JOIN staff_profiles sp ON u.id = sp.user_id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.hospital_id = ?
      AND (r.name IS NULL OR r.name != 'hospital_admin')
    `;

    let queryParams = [hospitalId];

    // 2. Add Role Filter Logic
    if (role && role !== "all") {
      baseQuery += ` AND r.name = ?`;
      queryParams.push(role);
    }

    // 3. Add Search Filter Logic (Existing)
    if (search) {
      const searchTerm = `%${search}%`;
      baseQuery += ` 
        AND (
          u.first_name LIKE ? OR
          u.last_name LIKE ? OR
          u.email LIKE ? OR
          u.phone LIKE ? OR
          sp.department LIKE ?
        )
      `;
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Main Data Query
    const dataQuery = `
      SELECT 
        u.id,
        u.first_name,
        u.last_name,
        u.gender,
        u.phone,
        u.email,
        sp.department,
        r.name AS role_name
      ${baseQuery}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `;

    // Count Query
    const countQuery = `SELECT COUNT(*) AS totalStaffs ${baseQuery}`;

    // Execute
    const dataParams = [...queryParams, limit, offset];
    const [rows] = await pool.query(dataQuery, dataParams);
    const [[countResult]] = await pool.query(countQuery, queryParams);

    const totalStaffs = countResult.totalStaffs || 0;
    const totalPages = Math.ceil(totalStaffs / limit);

    res.json({
      staffMembers: rows,
      pagination: {
        totalStaffs,
        totalPages,
        currentPage: page,
      },
    });
  } catch (err) {
    console.error(err);
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
