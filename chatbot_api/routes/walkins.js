// routes/walkins.js
router.post("/walkins", authMiddleWare, async (req, res) => {
  try {
    const {
      patient_name,
      phone,
      reason,
      urgency = 'normal'
    } = req.body;

    const hospitalId = req.user.hospital_id;

    // Generate walk-in reference
    const walkinRef = `WALKIN-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    // Create walk-in record (no slot association)
    const [result] = await pool.query(
      `INSERT INTO walkin_appointments (
        hospital_id, patient_name, phone, reason, urgency,
        walkin_reference, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'waiting', NOW())`,
      [hospitalId, patient_name, phone, reason, urgency, walkinRef]
    );

    res.json({
      success: true,
      message: "Walk-in registered successfully",
      walkin_reference: walkinRef,
      walkin_id: result.insertId,
      estimated_wait: "15-30 minutes"
    });

  } catch (error) {
    console.error("Walk-in registration error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});