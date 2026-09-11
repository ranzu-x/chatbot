/**
 * Fetches the actual bytes of an inbound media message, refreshing
 * WhatsApp's short-lived signed "lookaside" URL via the Graph API when it's
 * expired — the exact same refresh dance routes/media.js's proxy endpoint
 * already does for the Inbox view, extracted here so utils/aiReplyEngine.js
 * (vision fallback) can reuse it instead of a second implementation.
 */
import pool from "../db.js";

async function fetchUrl(url, accessToken) {
  const resp = await fetch(url, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
  if (!resp.ok) {
    const err = new Error(`HTTP ${resp.status}`);
    err.status = resp.status;
    throw err;
  }
  const mime = resp.headers.get("content-type") || "application/octet-stream";
  const buffer = Buffer.from(await resp.arrayBuffer());
  return { buffer, mime };
}

/**
 * @param {number} messageId - the INBOUND messages.id row holding the media
 * @returns {Promise<{buffer: Buffer, mime: string} | null>}
 */
export async function fetchMessageMediaBytes(messageId) {
  const [rows] = await pool.query(
    `SELECT m.media_url, i.access_token, i.platform
     FROM messages m
     JOIN conversations cv ON cv.id = m.conversation_id
     JOIN integrations i ON i.id = cv.integration_id
     WHERE m.id = ?`,
    [messageId]
  );
  if (!rows.length || !rows[0].media_url) return null;

  const { media_url: mediaUrl, access_token: accessToken, platform } = rows[0];

  if (mediaUrl.startsWith("/uploads/")) {
    // Already a locally-hosted file — read it straight off disk rather than
    // looping the request back through our own HTTP server.
    const fs = await import("fs");
    const path = await import("path");
    const localPath = path.join(process.cwd(), mediaUrl.replace(/^\//, ""));
    if (!fs.existsSync(localPath)) return null;
    const buffer = fs.readFileSync(localPath);
    const ext = path.extname(localPath).toLowerCase();
    const mimeByExt = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };
    return { buffer, mime: mimeByExt[ext] || "application/octet-stream" };
  }

  if (platform !== "WHATSAPP") {
    // Facebook/Instagram/Telegram media URLs are already plain fetchable
    // links — no token-gated refresh dance needed.
    try {
      return await fetchUrl(mediaUrl, null);
    } catch {
      return null;
    }
  }

  // WhatsApp: try the URL as-is first, refresh via Graph API on failure
  // (mirrors routes/media.js's proxy endpoint exactly).
  try {
    return await fetchUrl(mediaUrl, accessToken);
  } catch {
    const midMatch = mediaUrl.match(/mid=([0-9]+)/);
    if (!midMatch || !accessToken) return null;
    try {
      const metaResp = await fetch(`https://graph.facebook.com/v21.0/${midMatch[1]}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const metaData = await metaResp.json();
      if (!metaData.url) return null;
      await pool.query("UPDATE messages SET media_url = ? WHERE id = ?", [metaData.url, messageId]);
      return await fetchUrl(metaData.url, accessToken);
    } catch (err) {
      console.error(`[Media Fetcher] Failed to refresh WhatsApp media for message ${messageId}:`, err.message);
      return null;
    }
  }
}
