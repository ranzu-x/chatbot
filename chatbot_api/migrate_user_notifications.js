import pool from './db.js';

/**
 * Migration: user_notifications — the in-app notification inbox behind the
 * top-bar bell (chatbot_ui/src/Components/NotificationBell.jsx). Rows are
 * written by the Super Admin's "Send notification" on the User Manager
 * (POST /admin/users/bulk-notify) and read by their recipient only
 * (routes/userNotifications.js). Safe to re-run.
 */
async function run() {
  console.log('Running user notifications migration...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      user_id        INT NOT NULL,
      title          VARCHAR(200) NOT NULL,
      body           TEXT NULL,
      link           VARCHAR(500) NULL,
      sender_user_id INT NULL,
      read_at        DATETIME NULL,
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_notifications_user (user_id, read_at, created_at),
      CONSTRAINT fk_user_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_user_notifications_sender FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('✅ user_notifications table ready');
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
