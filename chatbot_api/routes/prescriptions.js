import express from "express";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";
import { logAudit } from "../utils/logger.js";

const router = express.Router();

// GET all prescriptions (with patient & doctor names + item count)
router.get("/prescriptions", authMiddleWare, async (req, res) => {
  try {
    const hospital_id = req.user.hospital_id;
    const [rows] = await pool.query(
      `SELECT p.id, p.patient_id, p.doctor_user_id, p.hospital_id, p.prescription_date,
              p.bp, p.pulse, p.temperature, p.spo2, p.weight, p.height,
              p.chief_complaint, p.diagnosis, p.advice, p.follow_up, p.tests,
              CONCAT(pt.first_name, ' ', pt.last_name) AS patient_name,
              CONCAT(u.first_name, ' ', u.last_name) AS doctor_name,
              (SELECT COUNT(*) FROM prescription_items pi WHERE pi.prescription_id = p.id) AS item_count
       FROM prescriptions p
       LEFT JOIN patients pt ON p.patient_id = pt.id
       LEFT JOIN users u ON p.doctor_user_id = u.id
       WHERE p.hospital_id = ?
       ORDER BY p.id DESC`,
      [hospital_id]
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching prescriptions" });
  }
});

// GET single prescription with full details
router.get("/prescriptions/:id", authMiddleWare, async (req, res) => {
  try {
    const { id } = req.params;
    const hospital_id = req.user.hospital_id;

    // Get prescription + patient + doctor
    const [prescRows] = await pool.query(
      `SELECT p.*,
              CONCAT(pt.first_name, ' ', pt.last_name) AS patient_name,
              pt.age AS patient_age, pt.gender AS patient_gender,
              CONCAT(u.first_name, ' ', u.last_name) AS doctor_name,
              dd.specialization AS doctor_specialization
       FROM prescriptions p
       LEFT JOIN patients pt ON p.patient_id = pt.id
       LEFT JOIN users u ON p.doctor_user_id = u.id
       LEFT JOIN doctor_details dd ON u.id = dd.user_id
       WHERE p.id = ? AND p.hospital_id = ?`,
      [id, hospital_id]
    );

    if (prescRows.length === 0) {
      console.warn(`Prescription not found: ID ${id}, Hospital ID ${hospital_id}`);
      return res.status(404).json({ message: "Prescription not found" });
    }

    const presc = prescRows[0];

    // Get prescription items (medicines)
    const [items] = await pool.query(
      `SELECT pi.*, m.name AS medication_name
       FROM prescription_items pi
       LEFT JOIN medicines m ON pi.medicine_id = m.id
       WHERE pi.prescription_id = ?`,
      [id]
    );

    // Parse tests JSON
    let tests = [];
    try {
      tests = presc.tests ? JSON.parse(presc.tests) : [];
    } catch (e) {
      tests = [];
    }

    res.json({
      id: presc.id,
      prescription_date: presc.prescription_date,
      doctor: {
        id: presc.doctor_user_id,
        name: presc.doctor_name,
        specialization: presc.doctor_specialization,
        clinic: null,
      },
      patient: {
        id: presc.patient_id,
        name: presc.patient_name,
        age: presc.patient_age,
        gender: presc.patient_gender,
      },
      vitals: {
        bp: presc.bp || '',
        pulse: presc.pulse || '',
        temperature: presc.temperature || '',
        spo2: presc.spo2 || '',
        weight: presc.weight || '',
        height: presc.height || '',
        chief_complaint: presc.chief_complaint || '',
        diagnosis: presc.diagnosis || '',
        advice: presc.advice || '',
        follow_up: presc.follow_up || '',
      },
      tests,
      medicines: items.map(item => ({
        medication_name: item.medication_name || 'Medication',
        dosage: item.dosage,
        duration: item.duration,
        instructions: item.instructions,
        frequency: item.frequency,
      })),
    });
  } catch (error) {
    console.error("Error in GET /prescriptions/:id:", error);
    res.status(500).json({ message: "Error fetching prescription" });
  }
});

// POST — Save a new prescription (with vitals + tests)
router.post("/prescriptions", authMiddleWare, async (req, res) => {
  const { patient, doctor, medicines, vitals, tests } = req.body;
  const prescriptionDate = new Date().toISOString().split('T')[0];
  const patientId = patient.patient_id;
  const doctorId = req.user.id; // Use ID from session
  const hospitalId = req.user.hospital_id; // Use ID from session

  if (!patientId || !doctorId || !hospitalId || !medicines || medicines.length === 0) {
    console.error("Missing data for prescription:", { patientId, doctorId, hospitalId, medicinesCount: medicines?.length });
    return res.status(400).json({ message: "Incomplete prescription data" });
  }

  // Check if user is a doctor
  const isDoctor = req.user.roles.some(role => role.toLowerCase() === 'doctor');
  if (!isDoctor) {
    return res.status(403).json({ message: "Only doctors are allowed to create prescriptions" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Insert prescription with vitals
    const [prescriptionResult] = await conn.query(
      `INSERT INTO prescriptions 
       (patient_id, doctor_user_id, hospital_id, prescription_date, 
        bp, pulse, temperature, spo2, weight, height,
        chief_complaint, diagnosis, advice, follow_up, tests)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patientId, doctorId, hospitalId, prescriptionDate,
        vitals?.bp || null, vitals?.pulse || null, vitals?.temperature || null,
        vitals?.spo2 || null, vitals?.weight || null, vitals?.height || null,
        vitals?.chief_complaint || null, vitals?.diagnosis || null,
        vitals?.advice || null, vitals?.follow_up || null,
        tests && tests.length > 0 ? JSON.stringify(tests) : null,
      ]
    );

    const prescriptionId = prescriptionResult.insertId;

    // Insert medicines
    for (const med of medicines) {
      await conn.query(
        `INSERT INTO prescription_items
         (prescription_id, medicine_id, dosage, duration, instructions, frequency)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [prescriptionId, med.medicationId, med.dosage, med.doseDuration, med.time, med.doseInterval]
      );
    }

    // ==========================================
    // NEW: Automated Billing & Lab Reports
    // ==========================================
    
    // 1. Get Doctor's Consultation Fee
    const [doctorInfo] = await conn.query("SELECT consultation_fee FROM doctor_details WHERE user_id = ?", [doctorId]);
    const consultationFee = doctorInfo[0]?.consultation_fee || 0;
    
    let totalBillAmount = parseFloat(consultationFee);
    let billedServices = [{ name: 'Consultation Fee', price: consultationFee }];

    // 2. Process Tests
    if (tests && tests.length > 0) {
      for (const testName of tests) {
        // Try to find the test in services table to get its price and ID
        const [serviceInfo] = await conn.query("SELECT id, price FROM services WHERE service_name = ? AND is_active = 1", [testName]);
        
        const testPrice = serviceInfo[0]?.price || 0;
        const testId = serviceInfo[0]?.id || null;
        
        totalBillAmount += parseFloat(testPrice);
        billedServices.push({ name: testName, price: testPrice, service_id: testId });

        // Create Pending Lab Report
        await conn.query(
          `INSERT INTO lab_reports (patient_id, doctor_id, prescription_id, test_id, status, hospital_id) 
           VALUES (?, ?, ?, ?, 'pending', ?)`,
          [patientId, doctorId, prescriptionId, testId, hospitalId]
        );
      }
    }

    // 3. Create Automated Bill
    await conn.query(
      `INSERT INTO billing (patient_id, doctor_id, hospital_id, bill_date, total_amount, paid_amount, status, services) 
       VALUES (?, ?, ?, NOW(), ?, 0, 'unpaid', ?)`,
      [patientId, doctorId, hospitalId, totalBillAmount, JSON.stringify(billedServices)]
    );

    await conn.commit();

    // Audit Log
    await logAudit({
      userId: doctorId,
      action: 'CREATE_PRESCRIPTION',
      tableName: 'prescriptions',
      recordId: prescriptionId,
      newValues: { patientId, medicinesCount: medicines.length },
      hospitalId
    });

    res.status(201).json({ message: "Prescription saved successfully", prescriptionId });
  } catch (error) {
    await conn.rollback();
    console.error("Error saving prescription:", error);
    res.status(500).json({ message: "Failed to save prescription", error });
  } finally {
    conn.release();
  }
});

// DELETE prescription
router.delete("/prescriptions/:id", authMiddleWare, async (req, res) => {
  const { id } = req.params;
  const hospital_id = req.user.hospital_id;

  // Check if user is a doctor
  const isDoctor = req.user.roles.some(role => role.toLowerCase() === 'doctor');
  if (!isDoctor) {
    return res.status(403).json({ message: "Only doctors are allowed to delete prescriptions" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Delete items first
    await conn.query("DELETE FROM prescription_items WHERE prescription_id = ?", [id]);
    // Delete prescription
    const [result] = await conn.query(
      "DELETE FROM prescriptions WHERE id = ? AND hospital_id = ?", [id, hospital_id]
    );
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ message: "Prescription not found" });
    }
    await conn.commit();

    // Audit Log
    await logAudit({
      userId: req.user.id,
      action: 'DELETE_PRESCRIPTION',
      tableName: 'prescriptions',
      recordId: id,
      hospitalId: hospital_id
    });

    res.json({ message: "Prescription deleted successfully" });
  } catch (error) {
    await conn.rollback();
    console.error("Error deleting prescription:", error);
    res.status(500).json({ message: "Failed to delete prescription" });
  } finally {
    conn.release();
  }
});

export default router;
