import pool from "../db.js";

// ✅ Safe, infinite, transaction-based ID generator
export async function generatePatientCode(hospital_id) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Lock sequence row for this hospital
    const [rows] = await connection.query(
      "SELECT last_number FROM patient_sequences WHERE hospital_id = ? FOR UPDATE",
      [hospital_id]
    );

    let newNumber = 1;

    if (rows.length > 0) {
      newNumber = rows[0].last_number + 1;
      await connection.query(
        "UPDATE patient_sequences SET last_number = ? WHERE hospital_id = ?",
        [newNumber, hospital_id]
      );
    } else {
      await connection.query(
        "INSERT INTO patient_sequences (hospital_id, last_number) VALUES (?, ?)",
        [hospital_id, newNumber]
      );
    }

    const hospitalPart = String(hospital_id).padStart(3, "0");
    const patientPart = String(newNumber).padStart(8, "0"); // allows 99,999,999+
    const patientCode = `H${hospitalPart}-P${patientPart}`;

    await connection.commit();
    return patientCode;
  } catch (err) {
    await connection.rollback();
    console.error("❌ Error generating patient code:", err);
    throw err;
  } finally {
    connection.release();
  }
}
