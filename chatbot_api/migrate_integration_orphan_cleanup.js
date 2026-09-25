import pool from './db.js';

async function run() {
  try {
    const [t] = await pool.query(
      "DELETE FROM whatsapp_templates WHERE id = 2 AND template_name = 'new_release' AND integration_id IS NULL"
    );
    console.log(t.affectedRows ? 'Removed orphaned template id=2 (new_release)' : 'Template id=2 already gone or no longer matches — skipped');

    const [f] = await pool.query(
      "DELETE FROM flows WHERE id = 53 AND name = 'Webchat Widget 2' AND trigger_type != 'BROADCAST' AND integration_id IS NULL"
    );
    console.log(f.affectedRows ? 'Removed orphaned flow id=53 (Webchat Widget 2)' : 'Flow id=53 already gone or no longer matches — skipped');
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
}
run();
