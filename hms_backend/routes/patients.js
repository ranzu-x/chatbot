import express from "express";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";
import { generatePatientCode } from "../utility/generatePatientCode.js";

const router = express.Router();

// ✅ Live patient search (for appointment form)
router.get("/patients/search", authMiddleWare, async (req, res) => {
  try {
    const hospitalId = req.user.hospital_id;
    const searchText = req.query.q;

    // Safety check
    if (!searchText || searchText.trim().length < 2) {
      return res.status(200).json([]);
    }

    const likeQuery = `%${searchText}%`;

    const sql = `
      SELECT 
        id,
        patient_id AS patient_code,
        first_name,
        last_name,
        phone
      FROM patients
      WHERE hospital_id = ?
        AND (
          first_name LIKE ?
          OR last_name LIKE ?
          OR phone LIKE ?
          OR patient_id LIKE ?
        )
      ORDER BY first_name ASC
      LIMIT 10
    `;

    const [rows] = await pool.query(sql, [
      hospitalId,
      likeQuery,
      likeQuery,
      likeQuery,
      likeQuery,
    ]);

    return res.status(200).json(rows);
  } catch (error) {
    console.error("❌ Patient search error:", error);
    res.status(500).json({
      message: "Failed to search patients",
    });
  }
});


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
      // console.log('Hello bro',id);

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
router.post("/patients", authMiddleWare, async (req, res) => {
  try {
    const {
      // Patient Information
      firstName, lastName, dateOfBirth, age, gender, bloodGroup,
      fathersName, spouseName, nid, maritalStatus, occupation,

      // Contact Information
      phoneNumber, email, emergencyContactName, emergencyContactRelation, emergencyContactPhone,

      // Present Address
      presentAddress, presentCity, presentState, presentZip, presentCountry,

      // Medical History
      allergies, currentMedications, pastConditions, chronicDiseases, surgicalHistory,

      // Insurance
      insuranceProvider, insuranceNumber
    } = req.body;

    const hospitalId = req.user.hospital_id;

    // Validation for required fields
    if (!firstName || !lastName || !phoneNumber || !email) {
      return res.status(400).json({
        success: false,
        message: "Name, phone number, and email are required"
      });
    }

    // Check if the phone number already exists for this hospital
    const [existingPatient] = await pool.query(
      `SELECT id FROM patients WHERE hospital_id = ? AND phone = ?`,
      [hospitalId, phoneNumber]
    );

    if (existingPatient.length > 0) {
      return res.status(400).json({
        success: false,
        message: "This phone number is already registered for this hospital."
      });
    }

    // Generate patient code (custom function)
    const patient_id = await generatePatientCode(hospitalId);

    // Insert patient with all fields
    const [result] = await pool.query(
      `INSERT INTO patients (
    hospital_id, patient_id, first_name, last_name, date_of_birth, age, gender, 
    blood_group, national_id, marital_status, occupation,
    phone, email, emergency_contact_name, emergency_contact_relation, emergency_contact_phone,
    address, state_or_div, city, zip_code, country, allergies, current_medications, past_conditions, chronic_diseases, surgical_history,
    insurance_provider, insurance_number
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        hospitalId,
        patient_id || null,
        firstName || null,
        lastName || null,
        dateOfBirth || null,
        age ? parseInt(age) : null,
        gender || null,
        bloodGroup || null,
        nid || null,
        maritalStatus || null,
        occupation || null,
        phoneNumber || null,
        email || null,
        emergencyContactName || null,
        emergencyContactRelation || null,
        emergencyContactPhone || null,
        presentAddress || null,
        presentState || null,
        presentCity || null,
        presentZip || null,
        presentCountry || null,
        allergies || null,
        currentMedications || null,
        pastConditions || null,
        chronicDiseases || null,
        surgicalHistory || null,
        insuranceProvider || null,
        insuranceNumber || null,
      ]
    );


    res.json({
      success: true,
      message: "Patient added successfully",
      patient_id,
      insertId: result.insertId
    });
  } catch (err) {
    console.error("Error creating patient:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});


// ✅ Update a patient
router.put("/patients/:id", authMiddleWare, async (req, res) => {
  try {
    const patientId = req.params.id;
    const hospitalId = req.user.hospital_id;
 

    const {
      // Patient Information
      firstName, lastName, dateOfBirth, age, gender, bloodGroup,
      fathersName, spouseName, nid, maritalStatus, occupation,

      // Contact Information
      phoneNumber, email, emergencyContactName, emergencyContactRelation, emergencyContactPhone,

      // Present Address
      address, city, state_or_division, zip_code, country,

      // Medical History
      allergies, currentMedications, pastConditions, chronicDiseases, surgicalHistory,

      // Insurance
      insuranceProvider, insuranceNumber
    } = req.body;

    const formattedDOB = dateOfBirth ? dateOfBirth.split("T")[0] : null;


    // ✅ Validate patient existence
    const [existingPatient] = await pool.query(
      "SELECT id FROM patients WHERE id = ? AND hospital_id = ?",
      [patientId, hospitalId]
    );

    if (existingPatient.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Patient not found"
      });
    }

    // ✅ Ensure unique phone number (excluding self)
    const [phoneExists] = await pool.query(
      "SELECT id FROM patients WHERE hospital_id = ? AND phone = ? AND id != ?",
      [hospitalId, phoneNumber, patientId]
    );

    if (phoneExists.length > 0) {
      return res.status(400).json({
        success: false,
        message: "This phone number is already registered for another patient."
      });
    }

    // ✅ Update patient data
    await pool.query(
      `UPDATE patients SET 
        first_name = ?, last_name = ?, date_of_birth = ?, age = ?, gender = ?, 
        blood_group = ?, national_id = ?, marital_status = ?, occupation = ?,
        phone = ?, email = ?, emergency_contact_name = ?, emergency_contact_relation = ?, emergency_contact_phone = ?,
        address = ?, city = ?, state_or_div = ?, zip_code = ?, country = ?,
        allergies = ?, current_medications = ?, past_conditions = ?, chronic_diseases = ?, surgical_history = ?,
        insurance_provider = ?, insurance_number = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND hospital_id = ?`,
      [
        firstName, lastName, formattedDOB, parseInt(age) || 0, gender,
        bloodGroup, nid, maritalStatus, occupation,
        phoneNumber, email, emergencyContactName, emergencyContactRelation, emergencyContactPhone,
        address, city, state_or_division, zip_code, country,
        allergies, currentMedications, pastConditions, chronicDiseases, surgicalHistory,
        insuranceProvider, insuranceNumber,
        patientId, hospitalId
      ]
    );

    res.json({
      success: true,
      message: "Patient updated successfully",
      patientId
    });

  } catch (error) {
    console.error("❌ Error updating patient:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ Delete a patient
router.delete("/patients/:id", authMiddleWare, async (req, res) => {
  try {
    const patientId = req.params.id;
    const hospitalId = req.user.hospital_id;

    // Check if patient exists and belongs to this hospital
    const [existingPatient] = await pool.query(
      "SELECT id FROM patients WHERE id = ? AND hospital_id = ?",
      [patientId, hospitalId]
    );

    if (existingPatient.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Patient not found or does not belong to your hospital",
      });
    }

    // Delete patient record
    await pool.query(
      "DELETE FROM patients WHERE id = ? AND hospital_id = ?",
      [patientId, hospitalId]
    );

    res.json({
      success: true,
      message: "Patient deleted successfully",
      patientId,
    });
  } catch (error) {
    console.error("Error deleting patient:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete patient",
      error: error.message,
    });
  }
});



export default router;
