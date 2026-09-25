import pool from './db.js';

/**
 * Migration: full option set for subscription packages and team roles.
 *
 * packages (Super Admin → Packages editor):
 *   is_public              — listed on the public pricing page / /billing/plans (default on)
 *   is_highlighted         — pre-selected + "Recommended" tag on the pricing page
 *   pay_per_use            — stored + shown only; there is no pay-per-use billing yet
 *   is_default_pay_per_use — same
 *   discount_percent / discount_terms / discount_starts_at / discount_ends_at /
 *   discount_timezone / discount_is_active
 *                          — stored + shown only; NOT applied at checkout yet
 *                            (Stripe checkout uses a fixed Price object — applying
 *                            a dated discount needs Stripe coupons; follow-up)
 *
 * roles.disabled_channels — JSON array of platforms ("WHATSAPP", "TELEGRAM",
 *   "FACEBOOK", "INSTAGRAM") a team role may never see. Enforced in
 *   utils/teamAccess.js integrationAccessClause (Inbox + import).
 *
 * modules — registry rows for every package feature that had none yet. Every
 *   new module is inserted ENABLED on every existing package (INSERT IGNORE),
 *   because a package with no package_modules row treats a module as disabled
 *   — without the backfill every existing customer would lose these features.
 *
 * permissions — new team-rule keys (Incoming Webhook, Google Calendar/
 *   Contacts, Telegram Group Manager, API Developer, Control Panel - Addon,
 *   AI Token, Live Chat Number Mask/Translator), granted to the full-access
 *   system roles. `live_chat.number_mask` is a restriction ("hide numbers from
 *   this role"), so it is granted to nobody.
 *
 * Safe to re-run.
 * Run: node migrate_package_role_options.js
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

const NEW_MODULES = [
  ['feature_connect_account', 'Connect Account', 'channels', 32],
  ['feature_bot_typing', 'Bot Typing On Display', 'automation', 33],
  ['feature_bot_message_insight', 'Bot Message Insight', 'automation', 34],
  ['feature_bot_conditional_reply', 'Bot Conditional Reply', 'automation', 35],
  ['feature_incoming_webhook', 'Incoming Message to Webhook URL', 'integrations', 36],
  ['feature_live_chat_widget', 'Live Chat - Widget', 'live_chat', 37],
  ['feature_live_chat_advanced', 'Live Chat - Advanced', 'live_chat', 38],
  ['feature_live_chat_restriction', 'Live Chat - Restriction', 'live_chat', 39],
  ['feature_whatsapp_embedded_signup', 'WhatsApp Embedded Signup', 'whatsapp', 40],
  ['feature_whatsapp_carousel', 'WhatsApp - Carousel Template', 'whatsapp', 41],
  ['feature_whatsapp_click_ads', 'WhatsApp - Click Ads', 'whatsapp', 42],
  ['feature_whatsapp_catalog', 'WhatsApp - Catalog', 'whatsapp', 43],
  ['feature_whatsapp_about_brand', 'WhatsApp About Field Brand Name', 'whatsapp', 44],
  ['feature_telegram_group_manager', 'Telegram - Group Manager', 'telegram', 45],
  ['feature_google_contacts', 'Google - Google Contacts', 'integrations', 46],
  ['feature_google_connect_account', 'Google - Connect Account', 'integrations', 47],
  ['feature_google_calendar', 'Google - Google Calendar', 'integrations', 48],
  ['feature_team_members', 'Team Member', 'management', 49],
  ['feature_data_retention', 'Data Delete Retention', 'management', 50],
  ['feature_ai_assistant', 'AI Assistant', 'ai', 51],
];

const crud = (key, name) => [
  [`${key}.create`, `${name}: Create`],
  [`${key}.update`, `${name}: Update`],
  [`${key}.delete`, `${name}: Delete`],
  [`${key}.special`, `${name}: Special`],
];

// [permission_key, label, category]
const NEW_PERMISSIONS = [
  ...crud('incoming_webhook', 'Incoming Message to Webhook URL').map((p) => [...p, 'Integrations & APIs']),
  ...crud('google_calendar', 'Google Calendar').map((p) => [...p, 'Integrations & APIs']),
  ...crud('google_contacts', 'Google Contacts').map((p) => [...p, 'Integrations & APIs']),
  ...crud('telegram_group_manager', 'Telegram Group Manager').map((p) => [...p, 'Integrations & APIs']),
  ...crud('api_developer', 'API Developer').map((p) => [...p, 'Integrations & APIs']),
  ...crud('control_panel_addon', 'Control Panel - Addon').map((p) => [...p, 'Control Panel']),
  ['ai_token.use', 'AI Token: Use AI tokens', 'AI & Intelligence'],
  ['live_chat.translator', 'Live Chat - Translator: Translate messages', 'Live Chat & Messaging'],
  ['live_chat.number_mask', 'Live Chat - Number Mask: Hide subscriber phone numbers', 'Live Chat & Messaging'],
];

const FULL_ACCESS_ROLES = ['owner', 'super_admin', 'reseller_owner', 'manager'];
const NEVER_GRANTED = new Set(['live_chat.number_mask']);

async function run() {
  console.log('Running package + role options migration...');

  await addColumn('packages', 'is_public', 'TINYINT(1) NOT NULL DEFAULT 1 AFTER is_default');
  await addColumn('packages', 'is_highlighted', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER is_public');
  await addColumn('packages', 'pay_per_use', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER is_highlighted');
  await addColumn('packages', 'is_default_pay_per_use', 'TINYINT(1) NOT NULL DEFAULT 0 AFTER pay_per_use');
  await addColumn('packages', 'discount_percent', 'DECIMAL(5,2) NULL');
  await addColumn('packages', 'discount_terms', 'VARCHAR(255) NULL');
  await addColumn('packages', 'discount_starts_at', 'DATETIME NULL');
  await addColumn('packages', 'discount_ends_at', 'DATETIME NULL');
  await addColumn('packages', 'discount_timezone', 'VARCHAR(64) NULL');
  await addColumn('packages', 'discount_is_active', 'TINYINT(1) NOT NULL DEFAULT 0');

  await addColumn('roles', 'disabled_channels', 'JSON NULL');

  for (const [key, name, category, sort] of NEW_MODULES) {
    const [ins] = await pool.query(
      'INSERT IGNORE INTO modules (`key`, display_name, module_type, category, is_active, sort_order) VALUES (?, ?, \'feature\', ?, 1, ?)',
      [key, name, category, sort]
    );
    console.log(ins.affectedRows ? `✅ module ${key}` : `ℹ️ module ${key} already exists`);
    const [bf] = await pool.query(
      'INSERT IGNORE INTO package_modules (package_id, module_key, is_enabled) SELECT id, ?, 1 FROM packages',
      [key]
    );
    if (bf.affectedRows) console.log(`   enabled on ${bf.affectedRows} existing package(s)`);
  }

  for (const [key, label, category] of NEW_PERMISSIONS) {
    await pool.query(
      `INSERT INTO permissions (permission_key, label, category, scope_type) VALUES (?, ?, ?, 'AGENCY')
       ON DUPLICATE KEY UPDATE label = VALUES(label), category = VALUES(category)`,
      [key, label, category]
    );
  }
  console.log(`✅ ${NEW_PERMISSIONS.length} team-rule permissions registered`);

  const [roles] = await pool.query('SELECT id, slug FROM roles WHERE agency_id IS NULL AND slug IN (?)', [FULL_ACCESS_ROLES]);
  const grantKeys = NEW_PERMISSIONS.map(([k]) => k).filter((k) => !NEVER_GRANTED.has(k));
  for (const role of roles) {
    for (const key of grantKeys) {
      await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)', [role.id, key]);
    }
    console.log(`✅ granted new rules to ${role.slug}`);
  }
  // The Live Chat agent role already translates in the Inbox — keep that.
  await pool.query(
    `INSERT IGNORE INTO role_permissions (role_id, permission_key)
     SELECT id, 'live_chat.translator' FROM roles WHERE agency_id IS NULL AND slug = 'agent'`
  );

  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
