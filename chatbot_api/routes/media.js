import express from "express";
import pool from "../db.js";
import { fetchMessageMediaBytes } from "../utils/mediaFetcher.js";

const router = express.Router();

/**
 * GET /media/whatsapp/:messageId
 * Streams incoming WhatsApp media (images, videos, audio, documents) securely without saving files on disk.
 * Automatically refreshes temporary lookaside URLs from Meta Graph API if expired — the fetch-with-refresh
 * logic itself lives in utils/mediaFetcher.js, shared with the AI Reply vision fallback (Phase 6).
 */
router.get("/media/whatsapp/:messageId", async (req, res) => {
  try {
    const { messageId } = req.params;

    const [rows] = await pool.query("SELECT media_url FROM messages WHERE id = ?", [messageId]);
    if (!rows.length || !rows[0].media_url) {
      return res.status(404).json({ success: false, message: "Media not found" });
    }
    if (rows[0].media_url.startsWith("/uploads/")) {
      return res.redirect(rows[0].media_url);
    }

    const mediaData = await fetchMessageMediaBytes(Number(messageId));
    if (!mediaData || !mediaData.buffer) {
      return res.status(404).send("Unable to retrieve media from Meta");
    }

    res.setHeader("Content-Type", mediaData.mime);
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.end(mediaData.buffer);
  } catch (err) {
    console.error("[WhatsApp Media Proxy] Error:", err.message);
    res.status(500).send("Error streaming WhatsApp media");
  }
});

export default router;
