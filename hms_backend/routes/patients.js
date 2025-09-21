import express from "express";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";

const router = express.Router();

// ✅ Get all patients
router.get("/patients", authMiddleWare, async (req, res) => {
  try {
    const hospitalId = req.user.hospital_id;
    const [rows] = await pool.query("SELECT * FROM patients WHERE hospital_id = ?",
      [hospitalId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// ✅ Add a patient
router.post("/", async (req, res) => {
  const {
    firstName, gender, age, phoneNumber, presentAddress, permanentAddress,
    fatherOrHusbandName, motherName, nid, bloodGroup, email,
    emergencyContactName, emergencyContactRelation, emergencyContactPhone,
    department, consultantDoctor, admissionDate, ward, bedNumber,
    pastConditions, currentMedications, allergies
  } = req.body;

  try {
    const [result] = await pool.query(
      "INSERT INTO patients (name, age, gender, phone, fatherOrHusbandName, motherName, nid, bloodGroup, email, permanentAddress, presentAddress, emergencyContactName, emergencyContactRelation, emergencyContactPhone, department, consultantDoctor, admissionDate, ward, bedNumber, pastConditions, CurrentMedications, KnownAllergies) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        firstName, age, gender, phoneNumber, fatherOrHusbandName, motherName, nid,
        bloodGroup, email, permanentAddress, presentAddress, emergencyContactName,
        emergencyContactRelation, emergencyContactPhone, department, consultantDoctor,
        admissionDate, ward, bedNumber, pastConditions, currentMedications, allergies
      ]
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
