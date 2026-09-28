/**
 * Public content: the Documentation platform, blog/docs permissions for the
 * Super Admin's team, and Reseller landing pages.
 *
 *   docs_categories / docs_sections / docs_articles
 *       Category → Section → Article (routes/docs.js). Public at /docs on every
 *       domain; written in the Super Admin panel. FULLTEXT index for search.
 *   permissions admin.blog.manage / admin.docs.manage (PLATFORM)
 *       Blog and Documentation management for Super Admin team roles; the
 *       super_admin role gets both.
 *   reseller_sites
 *       A Reseller's own landing page content (routes/resellerSite.js); its
 *       pricing is its own agency_packages, never the platform's.
 *
 * Safe to re-run.
 * Run: node migrate_docs_and_sites.js   (or: npm run migrate)
 */
import pool from "./db.js";
import { recordMigration } from "./utils/migrationLedger.js";

const PLATFORM_KEYS = [
  ["admin.blog.manage", "Write & publish blog posts"],
  ["admin.docs.manage", "Write & publish documentation"],
];

async function run() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS docs_categories (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        name         VARCHAR(120) NOT NULL,
        slug         VARCHAR(140) NOT NULL,
        description  VARCHAR(500) NULL,
        icon         VARCHAR(40) NULL,
        sort_order   INT NOT NULL DEFAULT 0,
        created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_docs_category_slug (slug),
        KEY idx_docs_category_order (sort_order)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS docs_sections (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        category_id  INT NOT NULL,
        name         VARCHAR(120) NOT NULL,
        sort_order   INT NOT NULL DEFAULT 0,
        created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_docs_section_category (category_id, sort_order),
        CONSTRAINT fk_docs_section_category FOREIGN KEY (category_id) REFERENCES docs_categories(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS docs_articles (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        section_id       INT NOT NULL,
        title            VARCHAR(200) NOT NULL,
        slug             VARCHAR(200) NOT NULL,
        excerpt          VARCHAR(500) NULL,
        content          LONGTEXT NULL,
        status           ENUM('DRAFT','PUBLISHED') NOT NULL DEFAULT 'DRAFT',
        sort_order       INT NOT NULL DEFAULT 0,
        seo_title        VARCHAR(200) NULL,
        seo_description  VARCHAR(320) NULL,
        author_id        INT NULL,
        published_at     DATETIME NULL,
        created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_docs_article_slug (slug),
        KEY idx_docs_article_section (section_id, status, sort_order),
        KEY idx_docs_article_status (status, updated_at),
        FULLTEXT KEY ft_docs_articles (title, excerpt, content),
        CONSTRAINT fk_docs_article_section FOREIGN KEY (section_id) REFERENCES docs_sections(id) ON DELETE RESTRICT,
        CONSTRAINT fk_docs_article_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ docs tables ready");

    await pool.query(`
      CREATE TABLE IF NOT EXISTS reseller_sites (
        agency_id      INT NOT NULL PRIMARY KEY,
        is_enabled     TINYINT(1) NOT NULL DEFAULT 1,
        headline       VARCHAR(160) NULL,
        subheadline    VARCHAR(400) NULL,
        hero_image     VARCHAR(512) NULL,
        cta_label      VARCHAR(40) NULL,
        features       JSON NULL,
        faqs           JSON NULL,
        show_pricing   TINYINT(1) NOT NULL DEFAULT 1,
        show_docs      TINYINT(1) NOT NULL DEFAULT 1,
        docs_url       VARCHAR(512) NULL,
        footer_text    VARCHAR(300) NULL,
        updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_reseller_site_agency FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ reseller_sites ready");

    // The public blog list sorts published posts by date — index it (blog_posts is created by routes/blog.js).
    const [[blogTable]] = await pool.query("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'blog_posts'");
    if (blogTable.n) {
      const [[idx]] = await pool.query("SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'blog_posts' AND INDEX_NAME = 'idx_blog_status_published'");
      if (!idx.n) {
        await pool.query("ALTER TABLE blog_posts ADD INDEX idx_blog_status_published (status, published_at)");
        console.log("✅ blog_posts status/published index added");
      }
    }

    for (const [key, label] of PLATFORM_KEYS) {
      await pool.query(
        `INSERT INTO permissions (permission_key, label, category, scope_type) VALUES (?, ?, 'Admin', 'PLATFORM')
         ON DUPLICATE KEY UPDATE label = VALUES(label)`,
        [key, label]
      );
    }
    const [roles] = await pool.query("SELECT id FROM roles WHERE agency_id IS NULL AND slug = 'super_admin'");
    for (const role of roles) {
      for (const [key] of PLATFORM_KEYS) {
        await pool.query("INSERT IGNORE INTO role_permissions (role_id, permission_key) VALUES (?, ?)", [role.id, key]);
      }
    }
    console.log(`✅ admin.blog.manage / admin.docs.manage registered (super_admin roles: ${roles.length})`);

    await recordMigration(pool, "migrate_docs_and_sites.js");
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
