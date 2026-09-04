import pool from "../db.js";
import axios from "axios";

const META_API_VERSION = "v21.0";

// ─── HELPER: PUBLISH TO FACEBOOK PAGE ──────────────────────────────────────────
async function publishToFacebook({ pageId, pageToken, userToken, postType, message, mediaUrls = [], linkUrl }) {
  const tokensToTry = [pageToken, userToken].filter(Boolean);
  let lastErr = null;

  for (const token of tokensToTry) {
    try {
      let endpoint = "";
      let payload = {};

      if (postType === "IMAGE" && mediaUrls.length > 0) {
        if (mediaUrls.length === 1) {
          endpoint = `https://graph.facebook.com/${META_API_VERSION}/${pageId}/photos`;
          payload = { url: mediaUrls[0], caption: message || "" };
        } else {
          const attachedMedia = [];
          for (const imgUrl of mediaUrls) {
            const upRes = await axios.post(
              `https://graph.facebook.com/${META_API_VERSION}/${pageId}/photos`,
              { url: imgUrl, published: false },
              { headers: { Authorization: `Bearer ${token}` }, params: { access_token: token } }
            );
            if (upRes.data?.id) attachedMedia.push({ media_fbid: upRes.data.id });
          }
          endpoint = `https://graph.facebook.com/${META_API_VERSION}/${pageId}/feed`;
          payload = { message: message || "", attached_media: attachedMedia };
        }
      } else if (postType === "VIDEO" && mediaUrls.length > 0) {
        endpoint = `https://graph.facebook.com/${META_API_VERSION}/${pageId}/videos`;
        payload = { file_url: mediaUrls[0], description: message || "" };
      } else if (postType === "LINK" && linkUrl) {
        endpoint = `https://graph.facebook.com/${META_API_VERSION}/${pageId}/feed`;
        payload = { link: linkUrl, message: message || "" };
      } else {
        endpoint = `https://graph.facebook.com/${META_API_VERSION}/${pageId}/feed`;
        payload = { message: message || "" };
      }

      const res = await axios.post(endpoint, payload, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        params: { access_token: token },
        timeout: 25000,
      });

      const postId = res.data?.id || res.data?.post_id;
      return { success: true, postId, permalink: `https://facebook.com/${postId}` };
    } catch (err) {
      lastErr = err;
      console.warn(`[FB Scheduled Publish] Token attempt failed for page ${pageId}:`, err.response?.data || err.message);
    }
  }

  throw lastErr || new Error("Failed to publish scheduled post to Facebook Page");
}

// ─── HELPER: PUBLISH TO INSTAGRAM ACCOUNT ────────────────────────────────────
async function publishToInstagram({ igAccountId, token, userToken, postType, message, mediaUrls = [] }) {
  if (!igAccountId) throw new Error("Instagram Account ID is missing");
  if (!mediaUrls || mediaUrls.length === 0) throw new Error("Instagram requires at least one image or video");

  const tokensToTry = [token, userToken].filter(Boolean);
  let lastErr = null;

  for (const activeToken of tokensToTry) {
    try {
      let creationId = null;

      if (postType === "VIDEO") {
        const containerRes = await axios.post(
          `https://graph.facebook.com/${META_API_VERSION}/${igAccountId}/media`,
          { media_type: "REELS", video_url: mediaUrls[0], caption: message || "" },
          { headers: { Authorization: `Bearer ${activeToken}` }, params: { access_token: activeToken } }
        );
        creationId = containerRes.data?.id;
      } else if (mediaUrls.length > 1) {
        const childIds = [];
        for (const imgUrl of mediaUrls) {
          const itemRes = await axios.post(
            `https://graph.facebook.com/${META_API_VERSION}/${igAccountId}/media`,
            { is_carousel_item: true, image_url: imgUrl },
            { headers: { Authorization: `Bearer ${activeToken}` }, params: { access_token: activeToken } }
          );
          if (itemRes.data?.id) childIds.push(itemRes.data.id);
        }
        const carRes = await axios.post(
          `https://graph.facebook.com/${META_API_VERSION}/${igAccountId}/media`,
          { media_type: "CAROUSEL", children: childIds, caption: message || "" },
          { headers: { Authorization: `Bearer ${activeToken}` }, params: { access_token: activeToken } }
        );
        creationId = carRes.data?.id;
      } else {
        const containerRes = await axios.post(
          `https://graph.facebook.com/${META_API_VERSION}/${igAccountId}/media`,
          { image_url: mediaUrls[0], caption: message || "" },
          { headers: { Authorization: `Bearer ${activeToken}` }, params: { access_token: activeToken } }
        );
        creationId = containerRes.data?.id;
      }

      if (!creationId) throw new Error("Failed to create Instagram media container");

      // Poll container status up to 5 times before publishing
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const statusRes = await axios.get(
            `https://graph.facebook.com/${META_API_VERSION}/${creationId}?fields=status_code`,
            { headers: { Authorization: `Bearer ${activeToken}` }, params: { access_token: activeToken } }
          );
          const statusCode = statusRes.data?.status_code;
          if (statusCode === "FINISHED") break;
          if (statusCode === "ERROR" || statusCode === "EXPIRED") {
            throw new Error(`Media container processing failed: ${statusCode}`);
          }
        } catch (statusErr) {
          // status_code may not be supported on all container types — proceed anyway
          break;
        }
      }

      const pubRes = await axios.post(
        `https://graph.facebook.com/${META_API_VERSION}/${igAccountId}/media_publish`,
        { creation_id: creationId },
        { headers: { Authorization: `Bearer ${activeToken}` }, params: { access_token: activeToken } }
      );

      const igMediaId = pubRes.data?.id;

      // Fetch the real permalink (shortcode-based URL) from the Graph API
      let igPermalink = `https://www.instagram.com/p/${igMediaId}/`;
      try {
        const permalinkRes = await axios.get(
          `https://graph.facebook.com/${META_API_VERSION}/${igMediaId}`,
          { params: { fields: "permalink", access_token: activeToken } }
        );
        if (permalinkRes.data?.permalink) igPermalink = permalinkRes.data.permalink;
      } catch (_) { /* fallback to numeric ID URL if fetch fails */ }

      return { success: true, postId: igMediaId, permalink: igPermalink };
    } catch (err) {
      lastErr = err;
      console.warn(`[IG Scheduled Publish] Token attempt failed:`, err.response?.data?.error?.message || err.message);
    }
  }

  throw lastErr || new Error("Failed to publish scheduled post to Instagram");
}

// ─── PROCESS DUE SCHEDULED POSTS ─────────────────────────────────────────────
export async function processScheduledSocialPosts() {
  try {
    // Find all SCHEDULED posts whose scheduled_at time has passed
    const [posts] = await pool.query(
      `SELECT sp.*, i.fb_page_id, i.ig_account_id, i.access_token, i.user_access_token
       FROM social_posts sp
       LEFT JOIN integrations i ON sp.integration_id = i.id
       WHERE sp.status = 'SCHEDULED' AND sp.scheduled_at <= NOW()
       LIMIT 20`
    );

    if (!posts.length) return;

    console.log(`[SocialScheduler] Processing ${posts.length} scheduled post(s)...`);

    for (const post of posts) {
      // Atomic optimistic lock: set scheduled_at = NULL so concurrent runs skip this post.
      // Only proceeds if the row still has status='SCHEDULED' (no other worker grabbed it).
      const [updated] = await pool.query(
        "UPDATE social_posts SET scheduled_at = NULL WHERE id = ? AND status = 'SCHEDULED' AND scheduled_at IS NOT NULL",
        [post.id]
      );

      // Another worker already grabbed this post — skip
      if (updated.affectedRows === 0) continue;

      const mediaUrls = typeof post.media_urls === "string"
        ? JSON.parse(post.media_urls || "[]")
        : post.media_urls || [];

      try {
        let publishResult;

        if (post.platform === "FACEBOOK") {
          publishResult = await publishToFacebook({
            pageId: post.fb_page_id,
            pageToken: post.access_token,
            userToken: post.user_access_token,
            postType: post.post_type,
            message: post.message,
            mediaUrls,
            linkUrl: post.link_url,
          });
        } else if (post.platform === "INSTAGRAM") {
          publishResult = await publishToInstagram({
            igAccountId: post.ig_account_id || post.fb_page_id,
            token: post.access_token,
            userToken: post.user_access_token,
            postType: post.post_type,
            message: post.message,
            mediaUrls,
          });
        } else {
          throw new Error(`Unsupported platform: ${post.platform}`);
        }

        // Mark as PUBLISHED
        await pool.query(
          `UPDATE social_posts
           SET status = 'PUBLISHED', published_at = NOW(),
               meta_post_id = ?, meta_permalink = ?, error_message = NULL
           WHERE id = ?`,
          [publishResult.postId, publishResult.permalink, post.id]
        );

        console.log(`[SocialScheduler] ✅ Post #${post.id} published to ${post.platform} (${publishResult.postId})`);
      } catch (postErr) {
        const errorMsg = postErr.response?.data?.error?.message || postErr.message;
        console.error(`[SocialScheduler] ❌ Post #${post.id} failed:`, errorMsg);

        // Mark as FAILED with error message
        await pool.query(
          "UPDATE social_posts SET status = 'FAILED', error_message = ? WHERE id = ?",
          [errorMsg, post.id]
        );
      }
    }
  } catch (err) {
    console.error("[SocialScheduler] Fatal error:", err);
  }
}

// ─── START SCHEDULER (runs every 60 seconds) ──────────────────────────────────
export function startSocialPostScheduler() {
  console.log("📅 Social Post Scheduler started (runs every 60 seconds)");
  // Run once immediately on startup to catch posts due while server was offline
  processScheduledSocialPosts();
  // Then run every minute
  setInterval(processScheduledSocialPosts, 60 * 1000);
}
