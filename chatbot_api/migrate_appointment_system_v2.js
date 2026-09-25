import pool from './db.js';

const sql1 = `
CREATE TABLE IF NOT EXISTS appointment_services (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  agency_id        INT NOT NULL,
  name             VARCHAR(150) NOT NULL,
  description      TEXT NULL,
  duration_minutes INT DEFAULT 30,
  price            DECIMAL(10,2) DEFAULT 0.00,
  currency         VARCHAR(10) DEFAULT 'USD',
  color            VARCHAR(20) DEFAULT '#6366f1',
  is_active        TINYINT(1) DEFAULT 1,
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_asvc_agency (agency_id),
  CONSTRAINT fk_asvc_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const sql2 = `
CREATE TABLE IF NOT EXISTS appointment_booking_sessions (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  agency_id           INT NOT NULL,
  conversation_id     INT NOT NULL,
  contact_id          INT NOT NULL,
  platform            VARCHAR(50) DEFAULT 'WHATSAPP',
  step                VARCHAR(50) NOT NULL,
  service_id          INT NULL,
  selected_date       DATE NULL,
  slot_id             INT NULL,
  customer_name       VARCHAR(150) NULL,
  customer_phone      VARCHAR(50) NULL,
  customer_email      VARCHAR(255) NULL,
  notes               TEXT NULL,
  status              ENUM('ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED') DEFAULT 'ACTIVE',
  expires_at          DATETIME NOT NULL,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_abs_conv_status (conversation_id, status),
  INDEX idx_abs_agency (agency_id),
  CONSTRAINT fk_abs_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_abs_conv   FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_abs_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

async function run() {
  try {
    console.log('Running appointment system v2 migration...');
    await pool.query(sql1);
    console.log('✅ appointment_services table ready');

    await pool.query(sql2);
    console.log('✅ appointment_booking_sessions table ready');

    // Add service_id and cancellation_reason columns to appointments if they don't exist
    try {
      await pool.query(`ALTER TABLE appointments ADD COLUMN service_id INT NULL AFTER staff_id;`);
      console.log('✅ Added service_id to appointments');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('ℹ️ service_id already exists in appointments');
      } else {
        console.warn('Column add warning (service_id):', e.message);
      }
    }

    try {
      await pool.query(`ALTER TABLE appointments ADD COLUMN cancellation_reason VARCHAR(255) NULL AFTER notes;`);
      console.log('✅ Added cancellation_reason to appointments');
    } catch (e) {
      if (e.code === 'ER_DUP_FIELDNAME') {
        console.log('ℹ️ cancellation_reason already exists in appointments');
      } else {
        console.warn('Column add warning (cancellation_reason):', e.message);
      }
    }

    try {
      await pool.query(`ALTER TABLE appointments ADD CONSTRAINT fk_apt_service FOREIGN KEY (service_id) REFERENCES appointment_services(id) ON DELETE SET NULL;`);
      console.log('✅ Added fk_apt_service constraint');
    } catch (e) {
      // Constraint might already exist
      console.log('ℹ️ fk_apt_service constraint check:', e.message);
    }

    console.log('🎉 Appointment System V2 Migration completed successfully!');
  } catch (err) {
    console.error('Migration error:', err);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
}

run();
