import pool from './db.js';

/**
 * Migration: appointment_campaigns table + add campaign_id/flow_outcome to sessions
 */
async function run() {
  console.log('Running appointment campaigns migration...');

  // 1. Create appointment_campaigns table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointment_campaigns (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      agency_id        INT NOT NULL,
      name             VARCHAR(255) NOT NULL,
      description      TEXT NULL,
      greeting_message TEXT NULL,
      service_ids      JSON NULL,
      staff_id         INT NULL,
      is_active        TINYINT(1) DEFAULT 1,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_aptcamp_agency (agency_id),
      CONSTRAINT fk_aptcamp_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('✅ appointment_campaigns table ready');

  // 2. Add campaign_id to appointment_booking_sessions
  try {
    await pool.query(`ALTER TABLE appointment_booking_sessions ADD COLUMN campaign_id INT NULL AFTER agency_id;`);
    console.log('✅ Added campaign_id to appointment_booking_sessions');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️ campaign_id already exists in appointment_booking_sessions');
    } else {
      console.warn('Column add warning (campaign_id):', e.message);
    }
  }

  // 3. Add flow_outcome to appointment_booking_sessions
  try {
    await pool.query(`ALTER TABLE appointment_booking_sessions ADD COLUMN flow_outcome VARCHAR(30) NULL AFTER status;`);
    console.log('✅ Added flow_outcome to appointment_booking_sessions');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️ flow_outcome already exists in appointment_booking_sessions');
    } else {
      console.warn('Column add warning (flow_outcome):', e.message);
    }
  }

  // 4. Add flow_session_id to appointment_booking_sessions (so engine can resume the flow)
  try {
    await pool.query(`ALTER TABLE appointment_booking_sessions ADD COLUMN flow_session_id INT NULL AFTER campaign_id;`);
    console.log('✅ Added flow_session_id to appointment_booking_sessions');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️ flow_session_id already exists in appointment_booking_sessions');
    } else {
      console.warn('Column add warning (flow_session_id):', e.message);
    }
  }

  // 5. Add flow_node_id to appointment_booking_sessions (so engine knows which node to resume at)
  try {
    await pool.query(`ALTER TABLE appointment_booking_sessions ADD COLUMN flow_node_id VARCHAR(255) NULL AFTER flow_session_id;`);
    console.log('✅ Added flow_node_id to appointment_booking_sessions');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ️ flow_node_id already exists in appointment_booking_sessions');
    } else {
      console.warn('Column add warning (flow_node_id):', e.message);
    }
  }

  console.log('✅ Appointment campaigns migration complete');
  process.exit(0);
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
