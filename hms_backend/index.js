import express from "express";
import pool from "./db.js";

const app = express();
app.use(express.json());

// ✅ Get all patients
app.get("/patients", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM patients");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Add a patient
app.post("/patients", async (req, res) => {
  const { name, age } = req.body;
  try {
    const [result] = await pool.query(
      "INSERT INTO patients (name, age) VALUES (?, ?)",
      [name, age]
    );
    res.json({ id: result.insertId, name, age });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});
