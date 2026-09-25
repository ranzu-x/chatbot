import pool from './db.js';

// Replaces the single-row-per-agency meta_app_settings with a multi-row pool
// table, split by platform_group (WHATSAPP vs MESSENGER_INSTAGRAM) and
// slot_role (ACTIVE vs STANDBY) — the foundation for per-platform app
// separation (Phase 1) and standby-app auto-failover (Phase 2/3).
// meta_app_settings is left untouched, not dropped. Idempotent — safe to
// re-run; re-seeding is guarded per agency+platform_group.

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS meta_app_pool (
        id                            INT AUTO_INCREMENT PRIMARY KEY,
        agency_id                     INT NOT NULL,
        platform_group                ENUM('WHATSAPP','MESSENGER_INSTAGRAM') NOT NULL,
        slot_role                     ENUM('ACTIVE','STANDBY') NOT NULL DEFAULT 'STANDBY',
        label                         VARCHAR(200) NULL,
        business_manager_label        VARCHAR(200) NULL,
        app_id                        VARCHAR(200) NULL,
        app_secret                    VARCHAR(500) NULL,
        system_user_token             TEXT NULL,
        whatsapp_config_id            VARCHAR(200) NULL,
        whatsapp_config_id_catalog    VARCHAR(200) NULL,
        verify_token                  VARCHAR(255) NULL,
        webhook_url                   VARCHAR(500) NULL,
        app_name                      VARCHAR(200) NULL,
        site_url                      VARCHAR(500) NULL,
        privacy_url                   VARCHAR(500) NULL,
        tos_url                       VARCHAR(500) NULL,
        is_configured                 TINYINT(1) NOT NULL DEFAULT 0,
        is_active                     TINYINT(1) NOT NULL DEFAULT 1,
        health_status                 ENUM('HEALTHY','DEGRADED','DISABLED','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
        last_health_check_at          DATETIME NULL,
        last_health_error             VARCHAR(500) NULL,
        new_onboarding_blocked        TINYINT(1) NOT NULL DEFAULT 0,
        new_onboarding_blocked_reason VARCHAR(500) NULL,
        new_onboarding_blocked_at     DATETIME NULL,
        created_at                    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at                    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_meta_app_pool_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        INDEX idx_meta_app_pool_lookup (agency_id, platform_group, slot_role, is_configured)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('meta_app_pool table ready.');

    const [configured] = await pool.query(
      'SELECT * FROM meta_app_settings WHERE is_configured = 1'
    );
    console.log(`Found ${configured.length} configured agency app(s) to seed.`);

    const groups = ['WHATSAPP', 'MESSENGER_INSTAGRAM'];
    for (const row of configured) {
      for (const group of groups) {
        const [existing] = await pool.query(
          'SELECT id FROM meta_app_pool WHERE agency_id = ? AND platform_group = ?',
          [row.agency_id, group]
        );
        if (existing.length) {
          console.log(`agency ${row.agency_id} / ${group}: already seeded (id=${existing[0].id}) — skipped`);
          continue;
        }
        const [ins] = await pool.query(
          `INSERT INTO meta_app_pool
             (agency_id, platform_group, slot_role, label, app_id, app_secret, system_user_token,
              whatsapp_config_id, whatsapp_config_id_catalog, verify_token, webhook_url,
              app_name, site_url, privacy_url, tos_url, is_configured, is_active)
           VALUES (?, ?, 'ACTIVE', 'Primary', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.agency_id, group, row.app_id, row.app_secret, row.system_user_token,
            row.whatsapp_config_id, row.whatsapp_config_id_catalog, row.verify_token, row.webhook_url,
            row.app_name, row.site_url, row.privacy_url, row.tos_url, row.is_configured, row.is_active,
          ]
        );
        console.log(`agency ${row.agency_id} / ${group}: seeded as pool id=${ins.insertId}`);
      }
    }
    console.log('Done. meta_app_settings left untouched.');
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
}
run();
