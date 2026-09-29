/**
 * WhatsApp appointment booking (holds + payment) and Inbox message retention.
 *
 * Appointments (utils/appointmentAvailability.js, utils/appointmentBookingEngine.js):
 *   appointment_settings            one row per workspace (no row = defaults): payment
 *                                   mode, hold length, booking window, notice, daily cap,
 *                                   timezone
 *   appointment_campaigns.payment_mode  per-campaign override (NULL = workspace setting)
 *   appointment_slot_holds          a slot reserved for one subscriber while they confirm /
 *                                   pay. Counts against capacity only while ACTIVE and
 *                                   expires_at > NOW(), so an expired hold never blocks a
 *                                   slot even if the cleanup job is late.
 *   appointment_booking_sessions.hold_id
 *   appointments.payment_status     + 'pending','failed','cancelled' (payment state stays
 *                                   separate from appointments.status)
 *   appointments.chat_order_id      the in-chat order that pays for it
 *   chat_orders.appointment_hold_id / appointment_id / expires_at, status + FAILED, CANCELLED
 *
 * Inbox (utils/messageRetention.js):
 *   messages idx_msg_created (created_at)  the retention job's range scan
 *   conversations.history_pruned_at        when retention last removed messages of the chat
 *   conversations.inbound_pruned           retention removed at least one INBOUND message
 *                                          (so "first message" triggers don't re-fire)
 *
 * Safe to re-run. Run: node migrate_appointment_holds_and_retention.js (or: npm run migrate)
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";

async function columnInfo(table, column) {
  const [rows] = await pool.query(
    "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    [table, column]
  );
  return rows[0] || null;
}

async function addColumn(table, column, definition) {
  if (await columnInfo(table, column)) return;
  await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`✅ ${table}.${column} added`);
}

async function indexExists(table, name) {
  const [rows] = await pool.query(
    "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
    [table, name]
  );
  return rows.length > 0;
}

/** Adds values to an ENUM column, keeping every existing value (and its order). */
async function widenEnum(table, column, add, suffix) {
  const info = await columnInfo(table, column);
  if (!info) return;
  const current = [...info.COLUMN_TYPE.matchAll(/'((?:[^']|'')*)'/g)].map((m) => m[1]);
  const missing = add.filter((v) => !current.includes(v));
  if (!missing.length) return;
  const values = [...current, ...missing].map((v) => `'${v}'`).join(",");
  await pool.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ENUM(${values}) ${suffix}`);
  console.log(`✅ ${table}.${column} + ${missing.join(", ")}`);
}

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointment_settings (
        agency_id             INT NOT NULL PRIMARY KEY,
        payment_mode          ENUM('NONE','REQUIRED','PAY_LATER') NOT NULL DEFAULT 'NONE',
        hold_minutes          INT NOT NULL DEFAULT 15,
        booking_window_days   INT NOT NULL DEFAULT 30,
        min_notice_minutes    INT NOT NULL DEFAULT 0,
        max_bookings_per_day  INT NULL,
        timezone              VARCHAR(64) NULL,
        updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_apset_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ appointment_settings ready");

    await addColumn("appointment_campaigns", "payment_mode", "ENUM('NONE','REQUIRED','PAY_LATER') NULL AFTER staff_id");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS appointment_slot_holds (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        agency_id           INT NOT NULL,
        slot_id             INT NOT NULL,
        booking_session_id  INT NULL,
        contact_id          INT NULL,
        conversation_id     INT NULL,
        service_id          INT NULL,
        status              ENUM('ACTIVE','CONVERTED','RELEASED','EXPIRED') NOT NULL DEFAULT 'ACTIVE',
        expires_at          DATETIME NOT NULL,
        appointment_id      INT NULL,
        created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_ash_slot_active (slot_id, status, expires_at),
        KEY idx_ash_status_expiry (status, expires_at),
        KEY idx_ash_session (booking_session_id),
        KEY idx_ash_agency (agency_id),
        CONSTRAINT fk_ash_agency  FOREIGN KEY (agency_id)  REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_ash_slot    FOREIGN KEY (slot_id)    REFERENCES appointment_slots(id) ON DELETE CASCADE,
        CONSTRAINT fk_ash_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ appointment_slot_holds ready");

    await addColumn("appointment_booking_sessions", "hold_id", "INT NULL AFTER slot_id");

    await widenEnum("appointments", "payment_status", ["pending", "failed", "cancelled"], "DEFAULT 'unpaid'");
    await addColumn("appointments", "chat_order_id", "INT NULL AFTER payment_status");

    await addColumn("chat_orders", "appointment_hold_id", "INT NULL");
    await addColumn("chat_orders", "appointment_id", "INT NULL");
    await addColumn("chat_orders", "expires_at", "DATETIME NULL");
    await widenEnum("chat_orders", "status", ["FAILED", "CANCELLED"], "NOT NULL DEFAULT 'PENDING'");
    if (!(await indexExists("chat_orders", "idx_co_hold"))) {
      await pool.query("ALTER TABLE chat_orders ADD KEY idx_co_hold (appointment_hold_id)");
    }

    // Retention scans messages by age across all chats; the only existing index
    // leads with conversation_id. InnoDB builds this online (no table lock).
    if (!(await indexExists("messages", "idx_msg_created"))) {
      await pool.query("ALTER TABLE messages ADD INDEX idx_msg_created (created_at), ALGORITHM=INPLACE, LOCK=NONE");
      console.log("✅ messages.idx_msg_created added");
    }
    await addColumn("conversations", "history_pruned_at", "DATETIME NULL");
    await addColumn("conversations", "inbound_pruned", "TINYINT(1) NOT NULL DEFAULT 0");

    await recordMigration(pool, "migrate_appointment_holds_and_retention.js");
    console.log("🎉 Appointment holds + message retention migration complete");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
