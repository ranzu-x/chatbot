import pool from './db.js';

/**
 * Migration: fields for the Super Admin's full-page User editor
 * (chatbot_ui/src/Pages/SuperAdmin/UserEditPage.jsx, PUT /admin/users/:id).
 *
 *   users.special_coupon     — stored + shown only; not applied at checkout yet
 *   users.discount_percent   — same
 *   users.can_forum_post     — may start Community Forum threads (default on)
 *   users.can_comment        — may reply in the forum (and comment on the blog,
 *                              once blog comments exist) (default on)
 *   agencies.usage_reset_at  — "Reset monthly usage": monthly counters in
 *                              utils/entitlements.js only count activity after
 *                              this moment when it falls in the current month
 *
 * Safe to re-run.
 */
async function addColumn(table, column, ddl) {
  try {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    console.log(`✅ Added ${table}.${column}`);
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') console.log(`ℹ️ ${table}.${column} already exists`);
    else throw e;
  }
}

async function run() {
  console.log('Running user manager fields migration...');
  await addColumn('users', 'special_coupon', 'VARCHAR(64) NULL AFTER address');
  await addColumn('users', 'discount_percent', 'DECIMAL(5,2) NULL AFTER special_coupon');
  await addColumn('users', 'can_forum_post', 'TINYINT(1) NOT NULL DEFAULT 1 AFTER discount_percent');
  await addColumn('users', 'can_comment', 'TINYINT(1) NOT NULL DEFAULT 1 AFTER can_forum_post');
  await addColumn('agencies', 'usage_reset_at', 'DATETIME NULL');
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
