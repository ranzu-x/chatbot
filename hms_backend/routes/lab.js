import express from "express";
import pool from "../db.js";
import { authMiddleWare } from "../middleware/authmiddleware.js";

const router = express.Router();

// GET pending lab reports for the hospital
router.get("/lab/pending", authMiddleWare, async (req, res) => {
  try {
    const hospitalId = req.user.hospital_id;
    const [rows] = await pool.query(`
      SELECT 
        lr.*, 
        p.first_name AS patient_first_name, p.last_name AS patient_last_name,
        u.first_name AS doctor_first_name, u.last_name AS doctor_last_name,
        s.service_name AS test_name
      FROM lab_reports lr
      JOIN patients p ON lr.patient_id = p.id
      JOIN users u ON lr.doctor_id = u.id
      LEFT JOIN services s ON lr.test_id = s.id
      WHERE lr.hospital_id = ? AND lr.status = 'pending'
      ORDER BY lr.created_at DESC
    `, [hospitalId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching pending tests" });
  }
});

// SUBMIT lab report results
router.put("/lab/reports/:id", authMiddleWare, async (req, res) => {
  const { id } = req.params;
  const { result_data, observations } = req.body;
  const labAssistantId = req.user.id;
  const hospitalId = req.user.hospital_id;

  try {
    const [result] = await pool.query(
      `UPDATE lab_reports 
       SET result_data = ?, observations = ?, status = 'completed', lab_assistant_id = ? 
       WHERE id = ? AND hospital_id = ?`,
      [JSON.stringify(result_data), observations, labAssistantId, id, hospitalId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Lab report not found" });
    }

    res.json({ message: "Lab report submitted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error submitting lab report" });
  }
});

// GET completed reports (History)
router.get("/lab/history", authMiddleWare, async (req, res) => {
  try {
    const hospitalId = req.user.hospital_id;
    const [rows] = await pool.query(`
      SELECT 
        lr.*, 
        p.first_name AS patient_first_name, p.last_name AS patient_last_name,
        u.first_name AS doctor_first_name, u.last_name AS doctor_last_name,
        s.service_name AS test_name
      FROM lab_reports lr
      JOIN patients p ON lr.patient_id = p.id
      JOIN users u ON lr.doctor_id = u.id
      LEFT JOIN services s ON lr.test_id = s.id
      WHERE lr.hospital_id = ? AND lr.status = 'completed'
      ORDER BY lr.updated_at DESC
    `, [hospitalId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching lab history" });
  }
});

export default router;
