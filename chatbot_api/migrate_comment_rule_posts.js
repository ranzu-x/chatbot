/**
 * Comment Automation: one campaign can now run on several posts (decided with
 * the user — "use an existing campaign" on a post shares that campaign).
 *
 * comment_rule_posts links a campaign (comment_automation_rules) to each post
 * it runs on. A post is in at most one campaign per bot account
 * (uq_crp_post), so an incoming comment always has exactly one campaign.
 * Page-wide campaigns (post_id = 'ALL_POSTS') have no links — they still
 * apply to every post without its own campaign.
 *
 * Backfill: every existing post campaign gets a link for its own post_id, so
 * everything keeps working exactly as before. If two old campaigns named the
 * same post, the older one (lowest id) keeps it — the same one the webhook
 * picked before. Nothing is deleted.
 *
 * Safe to re-run. Undo: DROP TABLE comment_rule_posts (campaigns are untouched).
 * Run: node migrate_comment_rule_posts.js   (or: npm run migrate)
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS comment_rule_posts (
        id INT NOT NULL AUTO_INCREMENT,
        agency_id INT NOT NULL,
        integration_id INT NULL,
        rule_id INT NOT NULL,
        post_id VARCHAR(255) NOT NULL,
        post_data JSON NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_crp_post (agency_id, integration_id, post_id),
        KEY idx_crp_rule (rule_id),
        CONSTRAINT fk_crp_rule FOREIGN KEY (rule_id) REFERENCES comment_automation_rules (id) ON DELETE CASCADE,
        CONSTRAINT fk_crp_agency FOREIGN KEY (agency_id) REFERENCES agencies (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    const [result] = await pool.query(`
      INSERT IGNORE INTO comment_rule_posts (agency_id, integration_id, rule_id, post_id, post_data)
      SELECT r.agency_id, r.integration_id, r.id, r.post_id, r.post_data
        FROM comment_automation_rules r
        JOIN agencies a ON a.id = r.agency_id
       WHERE r.post_id IS NOT NULL AND r.post_id <> '' AND r.post_id <> 'ALL_POSTS'
       ORDER BY r.id
    `);
    console.log(`✅ comment_rule_posts ready — linked ${result.affectedRows} existing post campaign(s) to their post`);
    await recordMigration(pool, "migrate_comment_rule_posts.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
