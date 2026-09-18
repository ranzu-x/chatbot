import pool from './db.js';

// Adds ON DELETE CASCADE foreign keys from agency_id to agencies.id on the
// three tables that were missing one — comment_automation_rules,
// social_posts, labels. Every other agency-scoped table (integrations,
// contacts, flows, conversations, whatsapp_templates, sequences,
// broadcast_campaigns, webchat_widgets, bots, agent_profiles,
// organization_members) already has this; these three were the gap that let
// them survive as orphans when an agency row was deleted. Idempotent — skips
// any constraint that already exists, safe to re-run.

const TARGETS = [
  { table: 'comment_automation_rules', constraint: 'fk_car_agency' },
  { table: 'social_posts', constraint: 'fk_sp_agency' },
  { table: 'labels', constraint: 'fk_labels_agency' },
];

async function run() {
  try {
    for (const { table, constraint } of TARGETS) {
      const [existing] = await pool.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
        [table, constraint]
      );
      if (existing.length) {
        console.log(`${table}: ${constraint} already exists — skipped`);
        continue;
      }
      await pool.query(
        `ALTER TABLE ${table} ADD CONSTRAINT ${constraint} FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE`
      );
      console.log(`${table}: added ${constraint} (agency_id -> agencies.id, ON DELETE CASCADE)`);
    }
  } finally {
    process.exit(0);
  }
}
run();
