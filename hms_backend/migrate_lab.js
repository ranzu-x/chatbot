import pool from './db.js';
async function migrate() { 
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS lab_reports (
      id INT AUTO_INCREMENT PRIMARY KEY,
      patient_id INT,
      doctor_id INT,
      prescription_id INT,
      test_id INT,
      lab_assistant_id INT,
      result_data JSON,
      observations TEXT,
      status ENUM('pending', 'completed') DEFAULT 'pending',
      hospital_id INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);
    console.log('✅ Created lab_reports table');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
} migrate();
