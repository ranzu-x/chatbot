import express from "express";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";
import { generatePatientCode } from "../utility/generatePatientCode.js";

const router = express.Router();

// ✅ Get patients with pagination
router.get("/patients", authMiddleWare, async (req, res) => {
  try {
    const hospitalId = req.user.hospital_id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;

    let query = `
      SELECT * FROM patients 
      WHERE hospital_id = ?
    `;
    let countQuery = `
      SELECT COUNT(*) as total FROM patients 
      WHERE hospital_id = ?
    `;
    let queryParams = [hospitalId];
    let countParams = [hospitalId];

    // Add search filter if provided
    if (search) {
      const searchTerm = `%${search}%`;
      query += ` AND (first_name LIKE ? OR last_name LIKE ? OR phone LIKE ?)`;
      countQuery += ` AND (first_name LIKE ? OR last_name LIKE ? OR phone LIKE ?)`;
      queryParams.push(searchTerm, searchTerm, searchTerm);
      countParams.push(searchTerm, searchTerm, searchTerm);
    }

     // ✅ ADD ORDER BY - Choose one of these options:
    query += ` ORDER BY id DESC`;  // Most recent first (recommended)
    // query += ` ORDER BY created_at DESC`;  // If you have created_at column
    // query += ` ORDER BY first_name ASC, last_name ASC`;  // Alphabetical
    // query += ` ORDER BY id ASC`;  // Oldest first

    // Add pagination
    query += ` LIMIT ? OFFSET ?`;
    queryParams.push(limit, offset);

    // Execute both queries in parallel
    const [patients] = await pool.query(query, queryParams);
    const [countResult] = await pool.query(countQuery, countParams);
    
    const totalPatients = countResult[0].total;
    const totalPages = Math.ceil(totalPatients / limit);

    res.json({
      patients,
      pagination: {
        currentPage: page,
        totalPages,
        totalPatients,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        limit
      }
    });
  } catch (err) {
    console.error("Error fetching patients:", err);
    res.status(500).json({ error: err.message });
  }
})

// Make sure this route comes BEFORE /patients/:id to avoid conflicts

// ✅ Get a single patient
router.get("/patients/:id", authMiddleWare, async (req, res) => {
    const { id } = req.params;
    const { hospital_id } = req.user;

    try {
        const [rows] = await pool.query(
            `SELECT * FROM patients WHERE id = ? AND hospital_id = ?`,
            [id, hospital_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Patient not found" });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("Error fetching patient:", error);
        res.status(500).json({ error: "Failed to fetch patient" });
    }
});

// ✅ Add a patient
router.post("/add_patients", authMiddleWare, async (req, res) => {
  const {
    firstName, lastName, gender, age, phoneNumber, presentAddress,
    fathersName, motherName, nid, bloodGroup, email,
    emergencyContactName, emergencyContactRelation, emergencyContactPhone,
    department, consultantDoctor, admissionDate, ward, bedNumber,
    pastConditions, currentMedications, allergies
  } = req.body;

  try {
    const hospitalId = req.user.hospital_id;

    // Check if the phone number is already exists for this hospital
    const [existingPatient] = await pool.query(
      `SELECT id FROM patients WHERE hospital_id = ? AND phone = ?`,
      [hospitalId, phoneNumber]
    );

    if (existingPatient.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: "This phone number is already registered for this hospital." });
    }

    //  Generate patient code (custom function)
    const patient_id = await generatePatientCode(hospitalId);

    const [result] = await pool.query(
      `INSERT INTO patients (
        hospital_id, patient_id, first_name, last_name, email, phone, age, gender, address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        hospitalId, patient_id, firstName, lastName, email,
        phoneNumber, age, gender, presentAddress
      ]
    );

    res.json({ success: true, message: "Patient added successfully", patient_id, insertId: result.insertId });
  }

  catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
