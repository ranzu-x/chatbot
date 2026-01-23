import express from "express";
import pool from "../db.js"; // your MySQL pool
import { authMiddleWare } from "../middleware/authmiddleware.js";

const router = express.Router();


router.get("/prescriptions", authMiddleWare, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM prescriptions");
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching prescriptions" });
  }
});








// Save a new prescription
// router.post("/prescriptions", authMiddleWare, async (req, res) => {
//   const { patient, doctor, medicines } = req.body;
// //   const { patient, doctor, hospitalId, medicines } = req.body;
//     // const { doctor_id } = req.params;
//     // const hospital_id = req.user.hospital_id;
//     const prescriptionDate = new Date().toISOString().split('T')[0];
//     const patientId = patient.patient_id;
//     const doctorId = doctor.id;
//     const hospitalId = doctor.clinic_id;

// //   console.log("HELLO prescriptions");
// //   console.log(req.body);
// //   console.log("this is from des: object");
// //   console.log( patient, doctor, medicines );
  
  

//   if (!patientId || !doctorId || !hospitalId || !medicines || medicines.length === 0) {
//     return res.status(400).json({ message: "Incomplete prescription data" });
//   }

//   const conn = await pool.getConnection();
//   try {
//     await conn.beginTransaction();

//     // Insert prescription
//     const [prescriptionResult] = await conn.query(
//       `INSERT INTO prescriptions (patient_id, doctor_user_id, hospital_id, prescription_date)
//        VALUES (?, ?, ?, ?)`,
//       [patientId, doctorId, hospitalId, prescriptionDate]
//     );

//     const prescriptionId = prescriptionResult.insertId;

//     // Insert medicines
//     for (const med of medicines) {
//       await conn.query(
//         `INSERT INTO prescription_items
//          (prescription_id, medicine_id, dosage, duration, instructions, frequency)
//          VALUES (?, ?, ?, ?, ?, ?)`,
//         [
//           prescriptionId,
//           med.medicationId,
//           med.dosage,
//           med.doseDuration,
//           med.time,
//           med.doseInterval
//         ]
//       );
//     }

//     await conn.commit();
//     res.status(201).json({ message: "Prescription saved successfully", prescriptionId });
//   } catch (error) {
//     await conn.rollback();
//     console.error("Error saving prescription:", error);
//     res.status(500).json({ message: "Failed to save prescription", error });
//   } finally {
//     conn.release();
//   }
// });

router.post("/prescriptions", authMiddleWare, async (req, res) => {
  const { patient, doctor, medicines } = req.body;
  const prescriptionDate = new Date().toISOString().split('T')[0];
  const patientId = patient.patient_id;
  const doctorId = doctor.id;
  const hospitalId = doctor.clinic_id;

  if (!patientId || !doctorId || !hospitalId || !medicines || medicines.length === 0) {
    return res.status(400).json({ message: "Incomplete prescription data" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Insert prescription
    const [prescriptionResult] = await conn.query(
      `INSERT INTO prescriptions (patient_id, doctor_user_id, hospital_id, prescription_date)
       VALUES (?, ?, ?, ?)`,
      [patientId, doctorId, hospitalId, prescriptionDate]
    );

    const prescriptionId = prescriptionResult.insertId;

    // Insert multiple medicines
    for (const med of medicines) {
      await conn.query(
        `INSERT INTO prescription_items
         (prescription_id, medicine_id, dosage, duration, instructions, frequency)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          prescriptionId,
          med.medicationId,
          med.dosage,
          med.doseDuration,
          med.time,
          med.doseInterval
        ]
      );
    }

    await conn.commit();
    res.status(201).json({ message: "Prescription saved successfully", prescriptionId });
  } catch (error) {
    await conn.rollback();
    console.error("Error saving prescription:", error);
    res.status(500).json({ message: "Failed to save prescription", error });
  } finally {
    conn.release();
  }
});


export default router;
