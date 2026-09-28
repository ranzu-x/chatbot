/**
 * Documentation platform (migrate_docs_and_sites.js).
 *
 * Structure: Category → Section → Article. Public on every domain (the main
 * site and reseller sites both link to /docs); written by the Super Admin and
 * platform team members whose role has admin.docs.manage.
 *
 * Public (no login — mounted early in index.js):
 *   GET /docs/home                      categories + a few articles each
 *   GET /docs/categories/:slug/nav      one category's sidebar (titles only)
 *   GET /docs/articles/:slug            article + breadcrumbs + previous / next
 *   GET /docs/search?q=                 ranked search (FULLTEXT), max 20
 * Admin (/admin/docs/*): categories, sections, articles CRUD, reorder, image upload.
 *
 * Built to grow: the public side never loads article bodies in lists, the
 * sidebar is loaded one category at a time, and admin lists are paged.
 */
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { buildSearch } from "../utils/searchQuery.js";

const router = express.Router();

// ─── helpers ──────────────────────────────────────────────────────────────
export function slugify(text, max = 120) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, max);
}
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const cleanText = (v, max) => String(v ?? "").trim().slice(0, max);
const bad = (res, message, status = 400) => res.status(status).json({ success: false, message });

async function uniqueSlug(table, base, excludeId = null) {
  const root = base || "item";
  for (let i = 0; i < 200; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const [[row]] = await pool.query(`SELECT id FROM ${table} WHERE slug = ? ${excludeId ? "AND id <> ?" : ""} LIMIT 1`, excludeId ? [candidate, excludeId] : [candidate]);
    if (!row) return candidate;
  }
  return `${root}-${Date.now()}`;
}

// ─── PUBLIC ───────────────────────────────────────────────────────────────
router.get("/docs/home", async (req, res) => {
  try {
    const [categories] = await pool.query(
      `SELECT c.id, c.name, c.slug, c.description, c.icon,
              (SELECT COUNT(*) FROM docs_articles a JOIN docs_sections s ON s.id = a.section_id
                WHERE s.category_id = c.id AND a.status = 'PUBLISHED') AS articleCount
         FROM docs_categories c ORDER BY c.sort_order ASC, c.id ASC`
    );
    const visible = categories.filter((c) => Number(c.articleCount) > 0);
    // First few articles of each category, in reading order — one query.
    const [top] = visible.length
      ? await pool.query(
          `SELECT * FROM (
             SELECT a.title, a.slug, s.category_id,
                    ROW_NUMBER() OVER (PARTITION BY s.category_id ORDER BY s.sort_order, s.id, a.sort_order, a.id) AS rn
               FROM docs_articles a JOIN docs_sections s ON s.id = a.section_id
              WHERE a.status = 'PUBLISHED' AND s.category_id IN (?)
           ) t WHERE rn <= 5`,
          [visible.map((c) => c.id)]
        )
      : [[]];
    return res.json({
      success: true,
      categories: visible.map((c) => ({
        ...c,
        articleCount: Number(c.articleCount),
        articles: top.filter((a) => a.category_id === c.id).map(({ title, slug }) => ({ title, slug })),
      })),
    });
  } catch (err) {
    console.error("GET /docs/home error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/docs/categories/:slug/nav", async (req, res) => {
  try {
    const [[category]] = await pool.query("SELECT id, name, slug, description FROM docs_categories WHERE slug = ?", [req.params.slug]);
    if (!category) return bad(res, "Category not found", 404);
    const [categories] = await pool.query(
      `SELECT c.name, c.slug FROM docs_categories c
        WHERE EXISTS (SELECT 1 FROM docs_sections s JOIN docs_articles a ON a.section_id = s.id WHERE s.category_id = c.id AND a.status = 'PUBLISHED')
        ORDER BY c.sort_order, c.id`
    );
    const [rows] = await pool.query(
      `SELECT s.id AS sectionId, s.name AS sectionName, a.title, a.slug
         FROM docs_sections s
         JOIN docs_articles a ON a.section_id = s.id AND a.status = 'PUBLISHED'
        WHERE s.category_id = ?
        ORDER BY s.sort_order, s.id, a.sort_order, a.id`,
      [category.id]
    );
    const sections = [];
    for (const r of rows) {
      let sec = sections[sections.length - 1];
      if (!sec || sec.id !== r.sectionId) sections.push((sec = { id: r.sectionId, name: r.sectionName, articles: [] }));
      sec.articles.push({ title: r.title, slug: r.slug });
    }
    res.set("Cache-Control", "public, max-age=60");
    return res.json({ success: true, category, categories, sections });
  } catch (err) {
    console.error("GET /docs nav error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/docs/articles/:slug", async (req, res) => {
  try {
    const [[article]] = await pool.query(
      `SELECT a.id, a.title, a.slug, a.excerpt, a.content, a.seo_title, a.seo_description, a.updated_at, a.published_at,
              a.section_id, a.sort_order, s.name AS sectionName, s.category_id, s.sort_order AS sectionOrder,
              c.name AS categoryName, c.slug AS categorySlug
         FROM docs_articles a
         JOIN docs_sections s ON s.id = a.section_id
         JOIN docs_categories c ON c.id = s.category_id
        WHERE a.slug = ? AND a.status = 'PUBLISHED'`,
      [req.params.slug]
    );
    if (!article) return bad(res, "Article not found", 404);

    // Previous / next in the category's reading order (section order, then article order).
    const order = "s.sort_order, s.id, a.sort_order, a.id";
    const [sequence] = await pool.query(
      `SELECT a.title, a.slug FROM docs_articles a JOIN docs_sections s ON s.id = a.section_id
        WHERE s.category_id = ? AND a.status = 'PUBLISHED' ORDER BY ${order}`,
      [article.category_id]
    );
    const i = sequence.findIndex((x) => x.slug === article.slug);
    const { category_id, sectionOrder, sort_order, section_id, ...pub } = article;
    res.set("Cache-Control", "public, max-age=60");
    return res.json({
      success: true,
      article: pub,
      breadcrumbs: [
        { label: "Docs", to: "/docs" },
        { label: article.categoryName, to: `/docs/${article.categorySlug}` },
        { label: article.sectionName, to: null },
      ],
      prev: i > 0 ? sequence[i - 1] : null,
      next: i >= 0 && i < sequence.length - 1 ? sequence[i + 1] : null,
    });
  } catch (err) {
    console.error("GET /docs article error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/docs/search", async (req, res) => {
  try {
    const q = cleanText(req.query.q, 120);
    if (q.length < 2) return res.json({ success: true, results: [] });
    const search = await buildSearch({
      term: q,
      fulltext: [{ table: "docs_articles", columns: ["title", "excerpt", "content"], expr: "a.title, a.excerpt, a.content", weight: 3 }],
      like: ["a.title", "a.excerpt", "a.content"],
      boost: { expr: "a.title", exact: 20, prefix: 10, contains: 4 },
    });
    if (!search.active) return res.json({ success: true, results: [] });
    const [rows] = await pool.query(
      `SELECT a.title, a.slug, a.excerpt, s.name AS sectionName, c.name AS categoryName, c.slug AS categorySlug,
              ${search.relevance} AS _relevance
         FROM docs_articles a
         JOIN docs_sections s ON s.id = a.section_id
         JOIN docs_categories c ON c.id = s.category_id
        WHERE a.status = 'PUBLISHED' AND ${search.where}
        ORDER BY _relevance DESC, a.title ASC
        LIMIT 20`,
      [...search.relevanceParams, ...search.whereParams]
    );
    return res.json({ success: true, results: rows.map(({ _relevance, ...r }) => r) });
  } catch (err) {
    console.error("GET /docs/search error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── ADMIN ────────────────────────────────────────────────────────────────
const admin = [authMiddleware, roleMiddleware("ADMIN"), requirePermission("admin.docs.manage")];

const docsUploadDir = "uploads/docs";
if (!fs.existsSync(docsUploadDir)) fs.mkdirSync(docsUploadDir, { recursive: true });
const docsUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, docsUploadDir),
    filename: (req, file, cb) => cb(null, `doc-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  // Images and video only — never SVG / HTML (they can carry script).
  fileFilter: (req, file, cb) => {
    const ok = /^\.(jpe?g|png|gif|webp|mp4|webm)$/.test(path.extname(file.originalname).toLowerCase()) && /^(image\/(jpeg|png|gif|webp)|video\/(mp4|webm))$/.test(file.mimetype);
    cb(ok ? null : new Error("Only JPG, PNG, GIF, WEBP images or MP4 / WEBM video"), ok);
  },
});

router.get("/admin/docs/tree", ...admin, async (req, res) => {
  try {
    const [categories] = await pool.query("SELECT id, name, slug, description, icon, sort_order FROM docs_categories ORDER BY sort_order, id");
    const [sections] = await pool.query("SELECT id, category_id, name, sort_order FROM docs_sections ORDER BY sort_order, id");
    const [counts] = await pool.query(
      "SELECT section_id, SUM(status = 'PUBLISHED') AS published, COUNT(*) AS total FROM docs_articles GROUP BY section_id"
    );
    const bySection = Object.fromEntries(counts.map((c) => [c.section_id, { published: Number(c.published), total: Number(c.total) }]));
    return res.json({
      success: true,
      categories: categories.map((c) => ({
        ...c,
        sections: sections.filter((s) => s.category_id === c.id).map((s) => ({ ...s, ...(bySection[s.id] || { published: 0, total: 0 }) })),
      })),
    });
  } catch (err) {
    console.error("GET /admin/docs/tree error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Categories
router.post("/admin/docs/categories", ...admin, async (req, res) => {
  try {
    const name = cleanText(req.body.name, 120);
    if (!name) return bad(res, "Name is required");
    const wanted = req.body.slug ? slugify(req.body.slug) : slugify(name);
    if (!wanted) return bad(res, "Enter a name with letters or numbers");
    const slug = await uniqueSlug("docs_categories", wanted);
    const [[{ next }]] = await pool.query("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM docs_categories");
    const [r] = await pool.query(
      "INSERT INTO docs_categories (name, slug, description, icon, sort_order) VALUES (?, ?, ?, ?, ?)",
      [name, slug, cleanText(req.body.description, 500) || null, cleanText(req.body.icon, 40) || null, next]
    );
    return res.status(201).json({ success: true, id: r.insertId, slug });
  } catch (err) {
    console.error("POST /admin/docs/categories error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/admin/docs/categories/:id", ...admin, async (req, res) => {
  try {
    const [[cur]] = await pool.query("SELECT * FROM docs_categories WHERE id = ?", [req.params.id]);
    if (!cur) return bad(res, "Category not found", 404);
    const name = req.body.name !== undefined ? cleanText(req.body.name, 120) : cur.name;
    if (!name) return bad(res, "Name is required");
    let slug = cur.slug;
    if (req.body.slug !== undefined && req.body.slug !== cur.slug) {
      const wanted = slugify(req.body.slug);
      if (!wanted || !SLUG_RE.test(wanted)) return bad(res, "The URL slug may only use a–z, 0–9 and dashes");
      slug = await uniqueSlug("docs_categories", wanted, cur.id);
    }
    await pool.query(
      "UPDATE docs_categories SET name = ?, slug = ?, description = ?, icon = ? WHERE id = ?",
      [name, slug,
        req.body.description !== undefined ? cleanText(req.body.description, 500) || null : cur.description,
        req.body.icon !== undefined ? cleanText(req.body.icon, 40) || null : cur.icon, cur.id]
    );
    return res.json({ success: true, slug });
  } catch (err) {
    console.error("PUT /admin/docs/categories error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/admin/docs/categories/:id", ...admin, async (req, res) => {
  try {
    const [[{ n }]] = await pool.query(
      "SELECT COUNT(*) AS n FROM docs_articles a JOIN docs_sections s ON s.id = a.section_id WHERE s.category_id = ?",
      [req.params.id]
    );
    if (Number(n)) return bad(res, `Move or delete its ${n} article(s) first.`, 409);
    const [r] = await pool.query("DELETE FROM docs_categories WHERE id = ?", [req.params.id]);
    if (!r.affectedRows) return bad(res, "Category not found", 404);
    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /admin/docs/categories error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Sections
router.post("/admin/docs/sections", ...admin, async (req, res) => {
  try {
    const name = cleanText(req.body.name, 120);
    if (!name) return bad(res, "Name is required");
    const [[cat]] = await pool.query("SELECT id FROM docs_categories WHERE id = ?", [req.body.categoryId]);
    if (!cat) return bad(res, "Choose a category");
    const [[{ next }]] = await pool.query("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM docs_sections WHERE category_id = ?", [cat.id]);
    const [r] = await pool.query("INSERT INTO docs_sections (category_id, name, sort_order) VALUES (?, ?, ?)", [cat.id, name, next]);
    return res.status(201).json({ success: true, id: r.insertId });
  } catch (err) {
    console.error("POST /admin/docs/sections error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/admin/docs/sections/:id", ...admin, async (req, res) => {
  try {
    const [[cur]] = await pool.query("SELECT * FROM docs_sections WHERE id = ?", [req.params.id]);
    if (!cur) return bad(res, "Section not found", 404);
    const name = req.body.name !== undefined ? cleanText(req.body.name, 120) : cur.name;
    if (!name) return bad(res, "Name is required");
    let categoryId = cur.category_id;
    if (req.body.categoryId !== undefined && Number(req.body.categoryId) !== cur.category_id) {
      const [[cat]] = await pool.query("SELECT id FROM docs_categories WHERE id = ?", [req.body.categoryId]);
      if (!cat) return bad(res, "Choose a category");
      categoryId = cat.id;
    }
    await pool.query("UPDATE docs_sections SET name = ?, category_id = ? WHERE id = ?", [name, categoryId, cur.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error("PUT /admin/docs/sections error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/admin/docs/sections/:id", ...admin, async (req, res) => {
  try {
    const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM docs_articles WHERE section_id = ?", [req.params.id]);
    if (Number(n)) return bad(res, `Move or delete its ${n} article(s) first.`, 409);
    const [r] = await pool.query("DELETE FROM docs_sections WHERE id = ?", [req.params.id]);
    if (!r.affectedRows) return bad(res, "Section not found", 404);
    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /admin/docs/sections error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Order: { type: 'categories' | 'sections' | 'articles', ids: [...] } — position = index.
router.put("/admin/docs/reorder", ...admin, async (req, res) => {
  const table = { categories: "docs_categories", sections: "docs_sections", articles: "docs_articles" }[req.body.type];
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger).slice(0, 2000) : [];
  if (!table || !ids.length) return bad(res, "Nothing to reorder");
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (let i = 0; i < ids.length; i++) await conn.query(`UPDATE ${table} SET sort_order = ? WHERE id = ?`, [i, ids[i]]);
    await conn.commit();
    return res.json({ success: true });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error("PUT /admin/docs/reorder error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  } finally {
    conn.release();
  }
});

// Articles
router.get("/admin/docs/articles", ...admin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const where = ["1=1"];
    const params = [];
    if (req.query.sectionId) { where.push("a.section_id = ?"); params.push(req.query.sectionId); }
    if (req.query.categoryId) { where.push("s.category_id = ?"); params.push(req.query.categoryId); }
    if (["DRAFT", "PUBLISHED"].includes(req.query.status)) { where.push("a.status = ?"); params.push(req.query.status); }
    const q = cleanText(req.query.search, 100);
    if (q) { where.push("a.title LIKE ?"); params.push(`%${q.replace(/[\\%_]/g, "\\$&")}%`); }
    const from = `FROM docs_articles a JOIN docs_sections s ON s.id = a.section_id JOIN docs_categories c ON c.id = s.category_id WHERE ${where.join(" AND ")}`;
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from}`, params);
    const [articles] = await pool.query(
      `SELECT a.id, a.title, a.slug, a.status, a.sort_order, a.updated_at, a.published_at, a.section_id,
              s.name AS sectionName, c.name AS categoryName, c.slug AS categorySlug
       ${from} ORDER BY c.sort_order, s.sort_order, a.sort_order, a.id LIMIT ? OFFSET ?`,
      [...params, limit, (page - 1) * limit]
    );
    return res.json({ success: true, articles, pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) } });
  } catch (err) {
    console.error("GET /admin/docs/articles error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/admin/docs/articles/:id", ...admin, async (req, res) => {
  try {
    const [[article]] = await pool.query(
      `SELECT a.*, s.category_id, c.slug AS categorySlug FROM docs_articles a
         JOIN docs_sections s ON s.id = a.section_id JOIN docs_categories c ON c.id = s.category_id WHERE a.id = ?`,
      [req.params.id]
    );
    if (!article) return bad(res, "Article not found", 404);
    return res.json({ success: true, article });
  } catch (err) {
    console.error("GET /admin/docs/article error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

async function articleValues(body, cur = null) {
  const title = body.title !== undefined ? cleanText(body.title, 200) : cur?.title;
  if (!title) return { error: "Title is required" };
  let sectionId = cur?.section_id;
  if (body.sectionId !== undefined || !cur) {
    const [[sec]] = await pool.query("SELECT id FROM docs_sections WHERE id = ?", [body.sectionId]);
    if (!sec) return { error: "Choose a section" };
    sectionId = sec.id;
  }
  const status = body.status === "PUBLISHED" ? "PUBLISHED" : body.status === "DRAFT" ? "DRAFT" : (cur?.status || "DRAFT");
  const content = body.content !== undefined ? String(body.content ?? "") : cur?.content;
  if (content && content.length > 2_000_000) return { error: "The article is too long" };
  let slug = cur?.slug;
  if (!cur || (body.slug !== undefined && body.slug !== cur.slug)) {
    const wanted = slugify(body.slug || title, 180);
    if (!wanted || !SLUG_RE.test(wanted)) return { error: "The URL slug may only use a–z, 0–9 and dashes" };
    slug = await uniqueSlug("docs_articles", wanted, cur?.id || null);
  }
  return {
    values: {
      title, slug, section_id: sectionId, status, content: content ?? null,
      excerpt: body.excerpt !== undefined ? cleanText(body.excerpt, 500) || null : cur?.excerpt ?? null,
      seo_title: body.seoTitle !== undefined ? cleanText(body.seoTitle, 200) || null : cur?.seo_title ?? null,
      seo_description: body.seoDescription !== undefined ? cleanText(body.seoDescription, 320) || null : cur?.seo_description ?? null,
    },
  };
}

router.post("/admin/docs/articles", ...admin, async (req, res) => {
  try {
    const { values, error } = await articleValues(req.body || {});
    if (error) return bad(res, error);
    const [[{ next }]] = await pool.query("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM docs_articles WHERE section_id = ?", [values.section_id]);
    const [r] = await pool.query(
      `INSERT INTO docs_articles (section_id, title, slug, excerpt, content, status, sort_order, seo_title, seo_description, author_id, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${values.status === "PUBLISHED" ? "NOW()" : "NULL"})`,
      [values.section_id, values.title, values.slug, values.excerpt, values.content, values.status, next, values.seo_title, values.seo_description, req.user.id]
    );
    return res.status(201).json({ success: true, id: r.insertId, slug: values.slug });
  } catch (err) {
    console.error("POST /admin/docs/articles error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/admin/docs/articles/:id", ...admin, async (req, res) => {
  try {
    const [[cur]] = await pool.query("SELECT * FROM docs_articles WHERE id = ?", [req.params.id]);
    if (!cur) return bad(res, "Article not found", 404);
    const { values, error } = await articleValues(req.body || {}, cur);
    if (error) return bad(res, error);
    const firstPublish = values.status === "PUBLISHED" && !cur.published_at;
    await pool.query(
      `UPDATE docs_articles SET section_id = ?, title = ?, slug = ?, excerpt = ?, content = ?, status = ?, seo_title = ?, seo_description = ?
        ${firstPublish ? ", published_at = NOW()" : ""} WHERE id = ?`,
      [values.section_id, values.title, values.slug, values.excerpt, values.content, values.status, values.seo_title, values.seo_description, cur.id]
    );
    return res.json({ success: true, slug: values.slug });
  } catch (err) {
    console.error("PUT /admin/docs/articles error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/admin/docs/articles/:id", ...admin, async (req, res) => {
  try {
    const [r] = await pool.query("DELETE FROM docs_articles WHERE id = ?", [req.params.id]);
    if (!r.affectedRows) return bad(res, "Article not found", 404);
    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /admin/docs/articles error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/admin/docs/upload", ...admin, (req, res) => {
  docsUpload.single("image")(req, res, (err) => {
    if (err) return bad(res, err.message);
    if (!req.file) return bad(res, "No file received");
    return res.json({ success: true, url: `/uploads/docs/${req.file.filename}` });
  });
});

export default router;
