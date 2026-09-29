/**
 * Growth tools (utils/growthLinks.js, Bot Manager → Engagement → Growth Tools):
 * trackable links + QR codes that open a chat with one bot account and start
 * one of its flows.
 *
 *   growth_links   one per link: bot account, flow to start, optional label,
 *                  WhatsApp pre-filled text, a unique code, and counters —
 *                  clicks (the /go/<code> redirect; QR scans land there too),
 *                  starts (chats opened through it), new_subscribers.
 *
 * Safe to re-run. Run: node migrate_growth_links.js   (or: npm run migrate)
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS growth_links (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        agency_id        INT NOT NULL,
        integration_id   INT NOT NULL,
        flow_id          INT NULL,
        label_id         INT NULL,
        name             VARCHAR(120) NOT NULL,
        code             VARCHAR(16) NOT NULL,
        prefill_text     VARCHAR(500) NULL,
        is_active        TINYINT(1) NOT NULL DEFAULT 1,
        clicks           INT NOT NULL DEFAULT 0,
        starts           INT NOT NULL DEFAULT 0,
        new_subscribers  INT NOT NULL DEFAULT 0,
        last_click_at    DATETIME NULL,
        created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_growth_code (code),
        KEY idx_growth_integration (agency_id, integration_id),
        CONSTRAINT fk_growth_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
        CONSTRAINT fk_growth_integ FOREIGN KEY (integration_id, agency_id) REFERENCES integrations(id, agency_id) ON DELETE CASCADE,
        CONSTRAINT fk_growth_flow FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ growth_links ready");
    await recordMigration(pool, "migrate_growth_links.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
