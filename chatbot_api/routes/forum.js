/**
 * Community Forum — Bug Reports / Feature Requests / Discussions +
 * admin-authored Announcements. See migrate_forum.js for the table shapes
 * and CLAUDE.md for the full design.
 *
 * Deliberately NOT tenant-isolated content, unlike almost every other
 * route file in this app. The forum is one shared, cross-tenant public
 * community: a DIRECT_CUSTOMER at Agency A can read and reply to a
 * RESELLER's thread at Agency B. `author_agency_id` is stored on every
 * thread/reply for audit purposes only — it is NEVER used to filter a
 * read query. Only WHO may post is gated (utils/tenantEligibility.js +
 * a verified email, middleware/forumAccess.js); WHAT is visible is either
 * "approved" (public) or "mine/admin" (moderation-scoped), never
 * tenant-scoped. `npm run lint:tenant` will flag the public read routes
 * below as having no workspace filter — that's correct here, not a bug.
 */
import express from "express";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requireForumEligible, requireVerifiedEmail, requireUserPermission } from "../middleware/forumAccess.js";
import { isEligibleAccountType } from "../utils/tenantEligibility.js";
import { isValidCategory, isValidStatusForCategory, STATUS_OPTIONS_BY_CATEGORY, CATEGORIES } from "../utils/forumStatus.js";
import { emitToAgency, emitToUser } from "../utils/socket.js";
import { logAuditEvent } from "../utils/auditLog.js";

const router = express.Router();

const MAX_TITLE = 200;
const MAX_BODY = 10000;

/** Decodes the token if present, without rejecting when it's absent/invalid
 * — this route needs to know "who, if anyone" for one visibility check
 * (a pending thread is visible to its author/admins only), everything
 * else on the public read side is fully anonymous. Same swallow-on-failure
 * shape middleware/tenant.js's tenantContext already uses. */
function getOptionalUser(req) {
  const token = req.cookies?.token || req.headers?.authorization?.split(" ")[1];
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

/** A Reseller's own customer (RESELLER_CUSTOMER) must not see anything in
 * the forum. That's only enforceable when the request identifies them (a
 * bearer token/cookie with their accountType) — a fully anonymous visitor
 * has no tenant to check, which is inherent to the forum being publicly
 * readable. Returns true (and has already responded) when blocked. */
function blockIneligibleViewer(req, res) {
  const viewer = getOptionalUser(req);
  if (viewer?.accountType === "RESELLER_CUSTOMER") {
    res.status(403).json({ success: false, code: "FORUM_NOT_ELIGIBLE", message: "The forum isn't available for this account." });
    return true;
  }
  return false;
}

async function getPlatformAgencyId() {
  const [[row]] = await pool.query("SELECT id FROM agencies WHERE account_type = 'PLATFORM' LIMIT 1");
  return row?.id || null;
}

function cleanText(raw, max) {
  return String(raw ?? "").trim().slice(0, max);
}

// ─── PUBLIC READS ───────────────────────────────────────────────────────────

router.get("/forum/threads", async (req, res) => {
  try {
    if (blockIneligibleViewer(req, res)) return;
    const { category, status, sort = "newest", search, section } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;

    let where = "WHERE ft.moderation_status = 'APPROVED'";
    const params = [];
    if (category && CATEGORIES.includes(category)) {
      where += " AND ft.category = ?";
      params.push(category);
    } else if (section === "announcements") {
      // The forum has two sections: the community board (bugs / feature
      // requests / discussions) and Announcements.
      where += " AND ft.category = 'ANNOUNCEMENT'";
    } else if (section === "community") {
      where += " AND ft.category <> 'ANNOUNCEMENT'";
    }
    if (status) {
      where += " AND ft.status = ?";
      params.push(status);
    }
    const searchTerm = search ? cleanText(search, 100) : "";
    if (searchTerm) {
      where += " AND (MATCH(ft.title, ft.body) AGAINST (? IN NATURAL LANGUAGE MODE) OR ft.title LIKE ?)";
      params.push(searchTerm, `%${searchTerm}%`);
    }

    const orderBy =
      sort === "top" ? "ft.is_pinned DESC, ft.upvote_count DESC, ft.created_at DESC" :
      sort === "active" ? "ft.is_pinned DESC, COALESCE(ft.last_activity_at, ft.created_at) DESC" :
      "ft.is_pinned DESC, ft.created_at DESC";

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM forum_threads ft ${where}`, params);
    const [rows] = await pool.query(
      `SELECT ft.id, ft.category, ft.title, LEFT(ft.body, 240) AS excerpt, ft.status, ft.is_pinned, ft.upvote_count, ft.reply_count,
              ft.last_activity_at, ft.created_at, u.name AS authorName
       FROM forum_threads ft
       JOIN users u ON u.id = ft.author_user_id
       ${where}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({ success: true, threads: rows, pagination: { page, limit, total } });
  } catch (err) {
    console.error("GET /forum/threads error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/forum/threads/:id", async (req, res) => {
  try {
    if (blockIneligibleViewer(req, res)) return;
    const viewer = getOptionalUser(req);
    const [[thread]] = await pool.query(
      `SELECT ft.*, u.name AS authorName, a.name AS authorAgencyName
       FROM forum_threads ft
       JOIN users u ON u.id = ft.author_user_id
       JOIN agencies a ON a.id = ft.author_agency_id
       WHERE ft.id = ?`,
      [req.params.id]
    );
    if (!thread) return res.status(404).json({ success: false, message: "Thread not found" });

    if (thread.moderation_status !== "APPROVED") {
      const canSeePending = viewer && (viewer.role === "ADMIN" || Number(viewer.id) === thread.author_user_id);
      if (!canSeePending) return res.status(404).json({ success: false, message: "Thread not found" });
    }

    const [replies] = await pool.query(
      `SELECT fr.*, u.name AS authorName
       FROM forum_replies fr
       JOIN users u ON u.id = fr.author_user_id
       WHERE fr.thread_id = ?
       ORDER BY fr.created_at ASC`,
      [req.params.id]
    );

    let hasUpvoted = false;
    if (viewer?.id) {
      const [[uv]] = await pool.query("SELECT 1 AS x FROM forum_thread_upvotes WHERE thread_id = ? AND user_id = ?", [req.params.id, viewer.id]);
      hasUpvoted = Boolean(uv);
    }

    return res.json({
      success: true,
      thread: { ...thread, hasUpvoted },
      replies,
      statusOptions: STATUS_OPTIONS_BY_CATEGORY[thread.category] || [],
    });
  } catch (err) {
    console.error("GET /forum/threads/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/forum/stats", async (req, res) => {
  try {
    if (blockIneligibleViewer(req, res)) return;
    const [rows] = await pool.query(
      `SELECT category, status, COUNT(*) AS count
       FROM forum_threads WHERE moderation_status = 'APPROVED'
       GROUP BY category, status`
    );
    return res.json({ success: true, breakdown: rows });
  } catch (err) {
    console.error("GET /forum/stats error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── AUTHENTICATED (eligible tenant + verified email to post) ─────────────

router.use("/forum", authMiddleware);

// ADMIN (Platform staff) is the one exception to eligibility/verification —
// staff activity, not a customer post — so they can start a thread in any
// category and it publishes immediately (no moderation queue for the
// moderator). Announcements are ADMIN-only. Everyone else is checked
// inline here rather than via the shared middleware the routes below use.
router.post("/forum/threads", requireUserPermission("can_forum_post"), async (req, res) => {
  try {
    const category = String(req.body?.category || "").toUpperCase();
    if (!isValidCategory(category)) {
      return res.status(400).json({ success: false, message: "Invalid category" });
    }
    const title = cleanText(req.body?.title, MAX_TITLE);
    const body = cleanText(req.body?.body, MAX_BODY);
    if (!title) return res.status(400).json({ success: false, message: "Title is required" });
    if (!body) return res.status(400).json({ success: false, message: "Body is required" });

    let moderationStatus = "PENDING_REVIEW";
    let approvedBy = null;
    let approvedAt = null;

    const isAdmin = req.user.role === "ADMIN";
    if (category === "ANNOUNCEMENT" && !isAdmin) {
      return res.status(403).json({ success: false, message: "Only the Super Admin can post announcements." });
    }

    if (isAdmin) {
      moderationStatus = "APPROVED";
      approvedBy = req.user.id;
      approvedAt = new Date();
    } else {
      if (!isEligibleAccountType(req.tenant?.accountType)) {
        return res.status(403).json({ success: false, message: "The forum is only available to End User and Reseller accounts.", code: "FORUM_NOT_ELIGIBLE" });
      }
      const [[u]] = await pool.query("SELECT email_verified_at FROM users WHERE id = ?", [req.user.id]);
      if (!u?.email_verified_at) {
        return res.status(403).json({ success: false, message: "Please verify your email address before posting to the forum.", code: "EMAIL_NOT_VERIFIED" });
      }
    }

    const [result] = await pool.query(
      `INSERT INTO forum_threads
        (category, title, body, author_user_id, author_agency_id, moderation_status, approved_by, approved_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [category, title, body, req.user.id, req.tenant.agencyId, moderationStatus, approvedBy, approvedAt]
    );

    if (moderationStatus === "PENDING_REVIEW") {
      const platformAgencyId = await getPlatformAgencyId();
      if (platformAgencyId) {
        emitToAgency(platformAgencyId, "forum_thread:new", { threadId: result.insertId, title, category, authorName: req.user.name });
      }
    }

    return res.status(201).json({ success: true, threadId: result.insertId, moderationStatus });
  } catch (err) {
    console.error("POST /forum/threads error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/forum/threads/:id/replies", requireForumEligible, requireVerifiedEmail, requireUserPermission("can_comment"), async (req, res) => {
  try {
    const body = cleanText(req.body?.body, MAX_BODY);
    if (!body) return res.status(400).json({ success: false, message: "Reply body is required" });

    const [[thread]] = await pool.query("SELECT id, moderation_status, author_user_id FROM forum_threads WHERE id = ?", [req.params.id]);
    if (!thread) return res.status(404).json({ success: false, message: "Thread not found" });
    if (thread.moderation_status !== "APPROVED") {
      return res.status(400).json({ success: false, message: "This thread isn't open for replies yet." });
    }

    const [result] = await pool.query(
      `INSERT INTO forum_replies (thread_id, author_user_id, author_agency_id, body, is_admin_reply)
       VALUES (?, ?, ?, ?, ?)`,
      [req.params.id, req.user.id, req.tenant.agencyId, body, req.user.role === "ADMIN" ? 1 : 0]
    );
    await pool.query("UPDATE forum_threads SET reply_count = reply_count + 1, last_activity_at = NOW() WHERE id = ?", [req.params.id]);

    if (Number(thread.author_user_id) !== Number(req.user.id)) {
      emitToUser(thread.author_user_id, "forum_thread:reply", { threadId: Number(req.params.id), replyId: result.insertId, authorName: req.user.name });
    }

    return res.status(201).json({ success: true, replyId: result.insertId });
  } catch (err) {
    console.error("POST /forum/threads/:id/replies error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/forum/threads/:id/upvote", requireForumEligible, requireVerifiedEmail, async (req, res) => {
  try {
    const [result] = await pool.query(
      "INSERT IGNORE INTO forum_thread_upvotes (thread_id, user_id) VALUES (?, ?)",
      [req.params.id, req.user.id]
    );
    if (result.affectedRows) {
      await pool.query("UPDATE forum_threads SET upvote_count = upvote_count + 1 WHERE id = ?", [req.params.id]);
    }
    const [[{ upvote_count: upvoteCount }]] = await pool.query("SELECT upvote_count FROM forum_threads WHERE id = ?", [req.params.id]);
    return res.json({ success: true, upvoted: true, upvoteCount });
  } catch (err) {
    console.error("POST /forum/threads/:id/upvote error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/forum/threads/:id/upvote", requireForumEligible, requireVerifiedEmail, async (req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM forum_thread_upvotes WHERE thread_id = ? AND user_id = ?", [req.params.id, req.user.id]);
    if (result.affectedRows) {
      await pool.query("UPDATE forum_threads SET upvote_count = GREATEST(upvote_count - 1, 0) WHERE id = ?", [req.params.id]);
    }
    const [[{ upvote_count: upvoteCount }]] = await pool.query("SELECT upvote_count FROM forum_threads WHERE id = ?", [req.params.id]);
    return res.json({ success: true, upvoted: false, upvoteCount });
  } catch (err) {
    console.error("DELETE /forum/threads/:id/upvote error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/forum/my-threads", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, category, title, moderation_status, status, rejection_reason, upvote_count, reply_count, created_at
       FROM forum_threads WHERE author_user_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );
    return res.json({ success: true, threads: rows });
  } catch (err) {
    console.error("GET /forum/my-threads error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── ADMIN MODERATION ───────────────────────────────────────────────────────

router.use("/admin/forum", authMiddleware, roleMiddleware("ADMIN"));

router.get("/admin/forum/pending", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ft.id, ft.category, ft.title, ft.body, ft.created_at,
              u.name AS authorName, u.email AS authorEmail, a.name AS authorAgencyName
       FROM forum_threads ft
       JOIN users u ON u.id = ft.author_user_id
       JOIN agencies a ON a.id = ft.author_agency_id
       WHERE ft.moderation_status = 'PENDING_REVIEW'
       ORDER BY ft.created_at ASC`
    );
    return res.json({ success: true, threads: rows });
  } catch (err) {
    console.error("GET /admin/forum/pending error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/admin/forum/threads/:id/approve", async (req, res) => {
  try {
    const [result] = await pool.query(
      "UPDATE forum_threads SET moderation_status = 'APPROVED', approved_by = ?, approved_at = NOW() WHERE id = ? AND moderation_status = 'PENDING_REVIEW'",
      [req.user.id, req.params.id]
    );
    if (!result.affectedRows) return res.status(400).json({ success: false, message: "Thread isn't pending review" });

    const [[thread]] = await pool.query("SELECT title, author_user_id FROM forum_threads WHERE id = ?", [req.params.id]);
    await logAuditEvent({
      agencyId: req.tenant.agencyId, actor: req.user, action: "forum_thread.approve",
      entityType: "forum_thread", entityId: Number(req.params.id), entityLabel: thread?.title,
      summary: `Approved forum thread "${thread?.title}"`,
    });
    if (thread) emitToUser(thread.author_user_id, "forum_thread:approved", { threadId: Number(req.params.id), title: thread.title });

    return res.json({ success: true });
  } catch (err) {
    console.error("POST /admin/forum/threads/:id/approve error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/admin/forum/threads/:id/reject", async (req, res) => {
  try {
    const reason = cleanText(req.body?.reason, 500);
    const [result] = await pool.query(
      "UPDATE forum_threads SET moderation_status = 'REJECTED', rejection_reason = ? WHERE id = ? AND moderation_status = 'PENDING_REVIEW'",
      [reason || null, req.params.id]
    );
    if (!result.affectedRows) return res.status(400).json({ success: false, message: "Thread isn't pending review" });

    const [[thread]] = await pool.query("SELECT title, author_user_id FROM forum_threads WHERE id = ?", [req.params.id]);
    await logAuditEvent({
      agencyId: req.tenant.agencyId, actor: req.user, action: "forum_thread.reject",
      entityType: "forum_thread", entityId: Number(req.params.id), entityLabel: thread?.title,
      summary: `Rejected forum thread "${thread?.title}"${reason ? `: ${reason}` : ""}`,
    });
    if (thread) emitToUser(thread.author_user_id, "forum_thread:rejected", { threadId: Number(req.params.id), title: thread.title, reason });

    return res.json({ success: true });
  } catch (err) {
    console.error("POST /admin/forum/threads/:id/reject error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.patch("/admin/forum/threads/:id/status", async (req, res) => {
  try {
    const status = String(req.body?.status || "").toUpperCase();
    const [[thread]] = await pool.query("SELECT category, status AS oldStatus, title, author_user_id FROM forum_threads WHERE id = ?", [req.params.id]);
    if (!thread) return res.status(404).json({ success: false, message: "Thread not found" });
    if (!isValidStatusForCategory(thread.category, status)) {
      return res.status(400).json({ success: false, message: `"${status}" isn't a valid status for ${thread.category}` });
    }

    await pool.query("UPDATE forum_threads SET status = ? WHERE id = ?", [status, req.params.id]);
    await logAuditEvent({
      agencyId: req.tenant.agencyId, actor: req.user, action: "forum_thread.status_change",
      entityType: "forum_thread", entityId: Number(req.params.id), entityLabel: thread.title,
      summary: `Changed forum thread "${thread.title}" status: ${thread.oldStatus} → ${status}`,
      changes: { before: { status: thread.oldStatus }, after: { status } },
    });
    emitToUser(thread.author_user_id, "forum_thread:status_changed", { threadId: Number(req.params.id), title: thread.title, status });

    return res.json({ success: true });
  } catch (err) {
    console.error("PATCH /admin/forum/threads/:id/status error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.patch("/admin/forum/threads/:id/pin", async (req, res) => {
  try {
    const pinned = Boolean(req.body?.pinned);
    const [result] = await pool.query("UPDATE forum_threads SET is_pinned = ? WHERE id = ?", [pinned ? 1 : 0, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Thread not found" });
    return res.json({ success: true, pinned });
  } catch (err) {
    console.error("PATCH /admin/forum/threads/:id/pin error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/admin/forum/threads/:id", async (req, res) => {
  try {
    const [[thread]] = await pool.query("SELECT title FROM forum_threads WHERE id = ?", [req.params.id]);
    if (!thread) return res.status(404).json({ success: false, message: "Thread not found" });

    await pool.query("DELETE FROM forum_threads WHERE id = ?", [req.params.id]);
    await logAuditEvent({
      agencyId: req.tenant.agencyId, actor: req.user, action: "forum_thread.delete",
      entityType: "forum_thread", entityId: Number(req.params.id), entityLabel: thread.title,
      summary: `Deleted forum thread "${thread.title}"`,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /admin/forum/threads/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/admin/forum/replies/:id", async (req, res) => {
  try {
    const [[reply]] = await pool.query("SELECT thread_id FROM forum_replies WHERE id = ?", [req.params.id]);
    if (!reply) return res.status(404).json({ success: false, message: "Reply not found" });

    await pool.query("DELETE FROM forum_replies WHERE id = ?", [req.params.id]);
    await pool.query("UPDATE forum_threads SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = ?", [reply.thread_id]);
    await logAuditEvent({
      agencyId: req.tenant.agencyId, actor: req.user, action: "forum_reply.delete",
      entityType: "forum_reply", entityId: Number(req.params.id),
      summary: `Deleted a reply on forum thread #${reply.thread_id}`,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /admin/forum/replies/:id error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/admin/forum/stats", async (req, res) => {
  try {
    const [[pending]] = await pool.query("SELECT COUNT(*) AS count FROM forum_threads WHERE moderation_status = 'PENDING_REVIEW'");
    const [byCategory] = await pool.query("SELECT category, moderation_status, COUNT(*) AS count FROM forum_threads GROUP BY category, moderation_status");
    return res.json({ success: true, pendingCount: pending.count, byCategory });
  } catch (err) {
    console.error("GET /admin/forum/stats error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
