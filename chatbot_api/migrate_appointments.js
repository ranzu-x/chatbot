import pool from './db.js';

const sql1 = `
CREATE TABLE IF NOT EXISTS appointment_slots (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  agency_id     INT NOT NULL,
  staff_id      INT NULL,
  slot_date     DATE NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  slot_duration INT DEFAULT 30,
  max_capacity  INT DEFAULT 1,
  booked_count  INT DEFAULT 0,
  is_active     TINYINT(1) DEFAULT 1,
  slot_type     ENUM('regular', 'walk_in') DEFAULT 'regular',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_as_agency_date (agency_id, slot_date),
  INDEX idx_as_staff_date (staff_id, slot_date),
  CONSTRAINT fk_as_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_as_staff  FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const sql2 = `
CREATE TABLE IF NOT EXISTS appointments (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  agency_id        INT NOT NULL,
  contact_id       INT NULL,
  staff_id         INT NULL,
  slot_id          INT NULL,
  customer_name    VARCHAR(150) NULL,
  customer_phone   VARCHAR(50) NULL,
  customer_email   VARCHAR(255) NULL,
  service_name     VARCHAR(200) DEFAULT 'General Consultation',
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  duration         INT DEFAULT 30,
  fee              DECIMAL(10,2) DEFAULT 0.00,
  payment_status   ENUM('unpaid', 'paid', 'refunded') DEFAULT 'unpaid',
  channel          ENUM('WHATSAPP','FACEBOOK','INSTAGRAM','TELEGRAM','WEBCHAT','MANUAL') DEFAULT 'WHATSAPP',
  status           ENUM('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show') DEFAULT 'scheduled',
  notes            TEXT NULL,
  booking_source   VARCHAR(100) DEFAULT 'DIRECT',
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_apt_agency_date (agency_id, appointment_date),
  INDEX idx_apt_contact (contact_id),
  CONSTRAINT fk_apt_agency  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  CONSTRAINT fk_apt_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  CONSTRAINT fk_apt_staff   FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_apt_slot    FOREIGN KEY (slot_id) REFERENCES appointment_slots(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const sql3 = `
INSERT INTO modules (\`key\`, display_name, category, module_type, description, icon, is_active, sort_order)
VALUES ('feature_appointments', 'Appointment & Booking Manager', 'Features', 'FEATURE', 'Omnichannel appointment scheduling, calendar slots management, and automated WhatsApp booking.', 'Calendar', 1, 15)
ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), description = VALUES(description);
`;

async function run() {
  try {
    await pool.query(sql1);
    await pool.query(sql2);
    await pool.query(sql3);
    console.log('✅ Appointment & Slots tables created and module registered successfully!');
  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    process.exit(0);
  }
}

run();
