import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

// ─── Blog Image Upload (separate subfolder from chat media) ───────────────────
const blogUploadDir = "uploads/blog";
if (!fs.existsSync(blogUploadDir)) {
  fs.mkdirSync(blogUploadDir, { recursive: true });
}

const blogStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, blogUploadDir),
  filename: (req, file, cb) => {
    const uid = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `blog-${uid}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const blogUpload = multer({
  storage: blogStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|svg|mp4|webm|pdf|doc|docx/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) return cb(null, true);
    cb(new Error("File type not supported for blog uploads"));
  },
});

// ─── DB Migration ──────────────────────────────────────────────────────────────
export async function initBlogTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        title           VARCHAR(255)  NOT NULL,
        slug            VARCHAR(255)  NOT NULL UNIQUE,
        excerpt         TEXT,
        content         LONGTEXT,
        cover_image     VARCHAR(512),
        author_name     VARCHAR(100)  DEFAULT 'Admin',
        author_avatar   VARCHAR(512),
        category        VARCHAR(100)  DEFAULT 'General',
        tags            TEXT          DEFAULT '[]',
        status          ENUM('DRAFT','PUBLISHED','SCHEDULED') DEFAULT 'DRAFT',
        is_featured     TINYINT(1)    DEFAULT 0,
        scheduled_at    DATETIME,
        published_at    DATETIME,
        views           INT           DEFAULT 0,
        read_time       INT           DEFAULT 1,
        meta_title      VARCHAR(255),
        meta_description TEXT,
        og_image        VARCHAR(512),
        canonical_url   VARCHAR(512),
        faqs            TEXT          DEFAULT '[]',
        created_by      INT,
        created_at      DATETIME      DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("✅ blog_posts table ready");
  } catch (err) {
    console.error("❌ Blog table init error:", err.message);
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .substring(0, 100);
}

function estimateReadTime(html = "") {
  const wordCount = html.replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}

function safeJson(str, fallback = []) {
  try { return JSON.parse(str || "[]"); } catch { return fallback; }
}

// ─── PUBLIC ROUTES (no auth) ───────────────────────────────────────────────────

// GET /blog — paginated list of published posts
router.get("/blog", async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page)  || 1);
    const limit    = Math.min(50, parseInt(req.query.limit) || 9);
    const offset   = (page - 1) * limit;
    const category = req.query.category || null;
    const search   = req.query.search   || null;
    const featured = req.query.featured === "true" ? 1 : null;

    let where = "WHERE status = 'PUBLISHED'";
    const params = [];

    if (category) { where += " AND category = ?"; params.push(category); }
    if (search)   {
      where += " AND (title LIKE ? OR excerpt LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }
    if (featured !== null) { where += " AND is_featured = ?"; params.push(featured); }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM blog_posts ${where}`, params
    );
    const [posts] = await pool.query(
      `SELECT id, title, slug, excerpt, cover_image, author_name, author_avatar,
              category, tags, is_featured, published_at, views, read_time, created_at
       FROM blog_posts ${where}
       ORDER BY is_featured DESC, published_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      posts,
      pagination: { page, limit, total: Number(total), pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("Blog list error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /blog/categories — distinct categories for published posts
router.get("/blog/categories", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT DISTINCT category FROM blog_posts WHERE status = 'PUBLISHED' AND category IS NOT NULL ORDER BY category"
    );
    return res.json({ success: true, categories: rows.map((r) => r.category) });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /blog/:slug — single post + related posts + view increment
router.get("/blog/:slug", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM blog_posts WHERE slug = ? AND status = 'PUBLISHED' LIMIT 1",
      [req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Post not found" });

    const post = rows[0];
    await pool.query("UPDATE blog_posts SET views = views + 1 WHERE id = ?", [post.id]);

    const [related] = await pool.query(
      `SELECT id, title, slug, excerpt, cover_image, author_name, published_at, read_time, category
       FROM blog_posts
       WHERE status = 'PUBLISHED' AND category = ? AND id != ?
       ORDER BY published_at DESC LIMIT 3`,
      [post.category, post.id]
    );

    return res.json({ success: true, post: { ...post, views: post.views + 1 }, related });
  } catch (err) {
    console.error("Blog detail error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── ADMIN ROUTES (ADMIN role only) ───────────────────────────────────────────
const adminOnly = [authMiddleware, roleMiddleware("ADMIN")];

// GET /admin/blog/posts — all posts for management table
router.get("/admin/blog/posts", ...adminOnly, async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const status = req.query.status || null;
    const search = req.query.search || null;

    let where = "WHERE 1=1";
    const params = [];
    if (status) { where += " AND status = ?"; params.push(status); }
    if (search) { where += " AND title LIKE ?"; params.push(`%${search}%`); }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM blog_posts ${where}`, params
    );
    const [posts] = await pool.query(
      `SELECT id, title, slug, cover_image, category, tags, status, is_featured,
              published_at, views, read_time, author_name, created_at, updated_at
       FROM blog_posts ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({
      success: true,
      posts,
      pagination: { page, limit, total: Number(total), pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("Admin blog list error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /admin/blog/posts/:id — single post (full, for editor)
router.get("/admin/blog/posts/:id", ...adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM blog_posts WHERE id = ? LIMIT 1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Post not found" });
    return res.json({ success: true, post: rows[0] });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /admin/blog/posts — create
router.post("/admin/blog/posts", ...adminOnly, async (req, res) => {
  try {
    const {
      title, excerpt, content, coverImage, authorName, authorAvatar,
      category, tags, status, isFeatured, scheduledAt,
      metaTitle, metaDescription, ogImage, canonicalUrl, faqs,
    } = req.body;

    if (!title?.trim()) return res.status(400).json({ success: false, message: "Title is required" });

    let slug = generateSlug(title);
    const [slugCheck] = await pool.query("SELECT id FROM blog_posts WHERE slug = ?", [slug]);
    if (slugCheck.length) slug = `${slug}-${Date.now()}`;

    const finalStatus  = status || "DRAFT";
    const readTime     = estimateReadTime(content || "");
    const publishedAt  = finalStatus === "PUBLISHED" ? new Date() : (scheduledAt || null);

    const [result] = await pool.query(
      `INSERT INTO blog_posts
         (title, slug, excerpt, content, cover_image, author_name, author_avatar,
          category, tags, status, is_featured, scheduled_at, published_at, read_time,
          meta_title, meta_description, og_image, canonical_url, faqs, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        title.trim(), slug, excerpt || null, content || null,
        coverImage || null, authorName || "Admin", authorAvatar || null,
        category || "General", JSON.stringify(Array.isArray(tags) ? tags : []),
        finalStatus, isFeatured ? 1 : 0, scheduledAt || null, publishedAt,
        readTime,
        metaTitle || title, metaDescription || excerpt || null,
        ogImage || coverImage || null, canonicalUrl || null,
        JSON.stringify(Array.isArray(faqs) ? faqs : []),
        req.user?.id || null,
      ]
    );

    const [newPost] = await pool.query("SELECT * FROM blog_posts WHERE id = ?", [result.insertId]);
    return res.status(201).json({ success: true, post: newPost[0], message: "Post created successfully" });
  } catch (err) {
    console.error("Blog create error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// PUT /admin/blog/posts/:id — update
router.put("/admin/blog/posts/:id", ...adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.query("SELECT * FROM blog_posts WHERE id = ?", [id]);
    if (!existing.length) return res.status(404).json({ success: false, message: "Post not found" });
    const cur = existing[0];

    const {
      title, slug: customSlug, excerpt, content, coverImage, authorName, authorAvatar,
      category, tags, status, isFeatured, scheduledAt,
      metaTitle, metaDescription, ogImage, canonicalUrl, faqs,
    } = req.body;

    const newTitle = title?.trim() || cur.title;
    let   newSlug  = customSlug || (title ? generateSlug(title) : cur.slug);
    const [slugCheck] = await pool.query("SELECT id FROM blog_posts WHERE slug = ? AND id != ?", [newSlug, id]);
    if (slugCheck.length) newSlug = `${newSlug}-${Date.now()}`;

    const newStatus   = status || cur.status;
    const readTime    = estimateReadTime(content ?? cur.content ?? "");
    let   publishedAt = cur.published_at;
    if (newStatus === "PUBLISHED" && cur.status !== "PUBLISHED") publishedAt = new Date();
    if (scheduledAt) publishedAt = scheduledAt;

    const newTags = Array.isArray(tags) ? tags : safeJson(cur.tags);
    const newFaqs = Array.isArray(faqs) ? faqs : safeJson(cur.faqs);

    await pool.query(
      `UPDATE blog_posts SET
         title=?, slug=?, excerpt=?, content=?, cover_image=?,
         author_name=?, author_avatar=?, category=?, tags=?,
         status=?, is_featured=?, scheduled_at=?, published_at=?, read_time=?,
         meta_title=?, meta_description=?, og_image=?, canonical_url=?, faqs=?,
         updated_at=NOW()
       WHERE id=?`,
      [
        newTitle, newSlug,
        excerpt  !== undefined ? excerpt  : cur.excerpt,
        content  !== undefined ? content  : cur.content,
        coverImage   !== undefined ? coverImage   : cur.cover_image,
        authorName   || cur.author_name,
        authorAvatar !== undefined ? authorAvatar : cur.author_avatar,
        category || cur.category,
        JSON.stringify(newTags),
        newStatus,
        isFeatured !== undefined ? (isFeatured ? 1 : 0) : cur.is_featured,
        scheduledAt || null, publishedAt, readTime,
        metaTitle        !== undefined ? metaTitle        : cur.meta_title,
        metaDescription  !== undefined ? metaDescription  : cur.meta_description,
        ogImage          !== undefined ? ogImage          : cur.og_image,
        canonicalUrl     !== undefined ? canonicalUrl     : cur.canonical_url,
        JSON.stringify(newFaqs),
        id,
      ]
    );

    const [updated] = await pool.query("SELECT * FROM blog_posts WHERE id = ?", [id]);
    return res.json({ success: true, post: updated[0], message: "Post updated successfully" });
  } catch (err) {
    console.error("Blog update error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE /admin/blog/posts/:id
router.delete("/admin/blog/posts/:id", ...adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id FROM blog_posts WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Post not found" });
    await pool.query("DELETE FROM blog_posts WHERE id = ?", [req.params.id]);
    return res.json({ success: true, message: "Post deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /admin/blog/posts/:id/publish — toggle publish status
router.post("/admin/blog/posts/:id/publish", ...adminOnly, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM blog_posts WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: "Post not found" });
    const post      = rows[0];
    const newStatus = post.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
    const publishedAt = newStatus === "PUBLISHED" ? new Date() : post.published_at;
    await pool.query("UPDATE blog_posts SET status=?, published_at=? WHERE id=?", [newStatus, publishedAt, post.id]);
    return res.json({ success: true, status: newStatus, message: `Post ${newStatus === "PUBLISHED" ? "published" : "moved to draft"}` });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /admin/blog/upload-image — TipTap image/file upload
router.post("/admin/blog/upload-image", ...adminOnly, blogUpload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "No file received" });
  const url = `/uploads/blog/${req.file.filename}`;
  return res.json({ success: true, url, filename: req.file.originalname, mimeType: req.file.mimetype });
});

export default router;
