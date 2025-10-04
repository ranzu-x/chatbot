import express from "express";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";
import { generatePatientCode } from "../utility/generatePatientCode.js";

const router = express.Router();

// ✅ Get all patients
router.get("/patients", authMiddleWare, async (req, res) => {
  try {
    const hospitalId = req.user.hospital_id;
    const [rows] = await pool.query(
      "SELECT * FROM patients WHERE hospital_id = ?",
      [hospitalId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
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

    res.json({ success: true, patient_id, insertId: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
