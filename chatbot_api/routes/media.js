import express from "express";
import pool from "../db.js";
import axios from "axios";

const router = express.Router();

/**
 * GET /media/whatsapp/:messageId
 * Streams incoming WhatsApp media (images, videos, audio, documents) securely without saving files on disk.
 * Automatically refreshes temporary lookaside URLs from Meta Graph API if expired.
 */
router.get("/media/whatsapp/:messageId", async (req, res) => {
  try {
    const { messageId } = req.params;

    const [rows] = await pool.query(`
      SELECT m.*, cv.integration_id, i.access_token, i.platform 
      FROM messages m 
      JOIN conversations cv ON cv.id = m.conversation_id 
      JOIN integrations i ON i.id = cv.integration_id 
      WHERE m.id = ?
    `, [messageId]);

    if (!rows.length || !rows[0].media_url) {
      return res.status(404).json({ success: false, message: "Media not found" });
    }

    const row = rows[0];
    let targetUrl = row.media_url;
    const token = row.access_token;

    // If already a local file path in /uploads/
    if (targetUrl.startsWith("/uploads/")) {
      return res.redirect(targetUrl);
    }

    // Helper to fetch from Meta
    const fetchFromMeta = async (url) => {
      const resp = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) {
        const err = new Error(`HTTP ${resp.status}`);
        err.status = resp.status;
        throw err;
      }
      const mime = resp.headers.get("content-type") || "image/jpeg";
      const buffer = await resp.arrayBuffer();
      return { buffer: Buffer.from(buffer), mime };
    };

    let mediaData = null;
    try {
      mediaData = await fetchFromMeta(targetUrl);
    } catch (err) {
      // If 401 / 403 or error, attempt automatic refresh from Meta Graph API
      const midMatch = targetUrl.match(/mid=([0-9]+)/);
      if (midMatch && token) {
        const mediaId = midMatch[1];
        try {
          const metaResp = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const metaData = await metaResp.json();

          if (metaData.url) {
            targetUrl = metaData.url;
            await pool.query("UPDATE messages SET media_url = ? WHERE id = ?", [targetUrl, messageId]);
            mediaData = await fetchFromMeta(targetUrl);
          }
        } catch (refreshErr) {
          console.error(`[WhatsApp Media Proxy] Failed to refresh media ID ${mediaId}:`, refreshErr.message);
        }
      }
    }

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
