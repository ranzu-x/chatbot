import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { fetchMessageMediaBytes } from "../utils/mediaFetcher.js";

const router = express.Router();

/**
 * GET /media/whatsapp/:messageId
 * Streams incoming WhatsApp media (images, videos, audio, documents) securely without saving files on disk.
 * Automatically refreshes temporary lookaside URLs from Meta Graph API if expired — the fetch-with-refresh
 * logic itself lives in utils/mediaFetcher.js, shared with the AI Reply vision fallback (Phase 6).
 *
 * SECURITY: this used to have no auth check at all, and messageId is a
 * plain sequential integer — anyone could enumerate ids and pull any
 * agency's media. Now requires login AND that the message's conversation
 * belongs to the caller's own agency, same ownership shape as
 * routes/conversations.js.
 */
router.get("/media/whatsapp/:messageId", authMiddleware, async (req, res) => {
  try {
    const { messageId } = req.params;

    const [rows] = await pool.query(
      `SELECT m.media_url, c.agency_id
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.id = ?`,
      [messageId]
    );
    if (!rows.length || !rows[0].media_url) {
      return res.status(404).json({ success: false, message: "Media not found" });
    }
    if (Number(rows[0].agency_id) !== Number(req.user.agencyId)) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    if (rows[0].media_url.startsWith("/uploads/")) {
      return res.redirect(rows[0].media_url);
    }

    const mediaData = await fetchMessageMediaBytes(Number(messageId));
    if (!mediaData || !mediaData.buffer) {
      return res.status(404).send("Unable to retrieve media from Meta");
    }

    res.setHeader("Content-Type", mediaData.mime);
    res.setHeader("Cache-Control", "private, max-age=86400");
    return res.end(mediaData.buffer);
  } catch (err) {
    console.error("[WhatsApp Media Proxy] Error:", err.message);
    res.status(500).send("Error streaming WhatsApp media");
  }
});

export default router;
