import express from "express";
import pool from "../db.js";
import axios from "axios";
import { authMiddleware } from "../middleware/authmiddleware.js";

const router = express.Router();
const META_API_VERSION = "v21.0";

router.use(authMiddleware);

// ─── HELPER: PUBLISH TO FACEBOOK PAGE ─────────────────────────────────────────
async function publishToFacebook({ pageId, pageToken, userToken, postType, message, mediaUrls = [], linkUrl }) {
  const tokensToTry = [pageToken, userToken].filter(Boolean);
  let lastErr = null;

  for (const token of tokensToTry) {
    try {
      let endpoint = "";
      let payload = {};

      if (postType === "IMAGE" && mediaUrls.length > 0) {
        if (mediaUrls.length === 1) {
          // Single Photo
          endpoint = `https://graph.facebook.com/${META_API_VERSION}/${pageId}/photos`;
          payload = { url: mediaUrls[0], caption: message || "" };
        } else {
          // Multi-photo upload
          const attachedMedia = [];
          for (const imgUrl of mediaUrls) {
            const upRes = await axios.post(
              `https://graph.facebook.com/${META_API_VERSION}/${pageId}/photos`,
              { url: imgUrl, published: false },
              { headers: { Authorization: `Bearer ${token}` }, params: { access_token: token } }
            );
            if (upRes.data?.id) {
              attachedMedia.push({ media_fbid: upRes.data.id });
            }
          }
          endpoint = `https://graph.facebook.com/${META_API_VERSION}/${pageId}/feed`;
          payload = { message: message || "", attached_media: attachedMedia };
        }
      } else if (postType === "VIDEO" && mediaUrls.length > 0) {
        // Video Post
        endpoint = `https://graph.facebook.com/${META_API_VERSION}/${pageId}/videos`;
        payload = { file_url: mediaUrls[0], description: message || "" };
      } else if (postType === "LINK" && linkUrl) {
        // Link Post
        endpoint = `https://graph.facebook.com/${META_API_VERSION}/${pageId}/feed`;
        payload = { link: linkUrl, message: message || "" };
      } else {
        // Plain Text Status Post
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
      console.warn(`[FB Publish] Token attempt failed for page ${pageId}:`, err.response?.data || err.message);
    }
  }

  throw lastErr || new Error("Failed to publish post to Facebook Page");
}

// ─── HELPER: PUBLISH TO INSTAGRAM ACCOUNT ────────────────────────────────────
async function publishToInstagram({ igAccountId, token, userToken, postType, message, mediaUrls = [] }) {
  if (!igAccountId) {
    throw new Error("Instagram Account ID is missing or not connected");
  }
  if (!mediaUrls || mediaUrls.length === 0) {
    throw new Error("Instagram requires at least one image or video to publish a post. Please attach a photo or video.");
  }

  const tokensToTry = [token, userToken].filter(Boolean);
  let lastErr = null;

  for (const activeToken of tokensToTry) {
    try {
      let creationId = null;

      if (postType === "VIDEO") {
        // Instagram Reel / Video
        const containerRes = await axios.post(
          `https://graph.facebook.com/${META_API_VERSION}/${igAccountId}/media`,
          {
            media_type: "REELS",
            video_url: mediaUrls[0],
            caption: message || "",
          },
          { headers: { Authorization: `Bearer ${activeToken}` }, params: { access_token: activeToken } }
        );
        creationId = containerRes.data?.id;
      } else if (mediaUrls.length > 1) {
        // Carousel Post
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
        // Single Image Post
        const containerRes = await axios.post(
          `https://graph.facebook.com/${META_API_VERSION}/${igAccountId}/media`,
          { image_url: mediaUrls[0], caption: message || "" },
          { headers: { Authorization: `Bearer ${activeToken}` }, params: { access_token: activeToken } }
        );
        creationId = containerRes.data?.id;
      }

      if (!creationId) {
        throw new Error("Failed to create Instagram media container");
      }

      // Check media container processing status before publishing (poll up to 5 times)
      let readyToPublish = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const statusRes = await axios.get(
            `https://graph.facebook.com/${META_API_VERSION}/${creationId}?fields=status_code`,
            { headers: { Authorization: `Bearer ${activeToken}` }, params: { access_token: activeToken } }
          );
          const statusCode = statusRes.data?.status_code;
          if (statusCode === "FINISHED") {
            readyToPublish = true;
            break;
          } else if (statusCode === "ERROR" || statusCode === "EXPIRED") {
            throw new Error(`Media container processing failed with status: ${statusCode}`);
          }
        } catch (statusErr) {
          // If status_code field is not supported on this container type, proceed to publish
          readyToPublish = true;
          break;
        }
      }

      // Publish the container
      const pubRes = await axios.post(
        `https://graph.facebook.com/${META_API_VERSION}/${igAccountId}/media_publish`,
        { creation_id: creationId },
        { headers: { Authorization: `Bearer ${activeToken}` }, params: { access_token: activeToken } }
      );

      const igMediaId = pubRes.data?.id;
      return { success: true, postId: igMediaId, permalink: `https://instagram.com/p/${igMediaId}` };
    } catch (err) {
      lastErr = err;
      const errDetail = err.response?.data?.error?.message || err.message;
      console.warn(`[IG Publish Token Attempt] Failed with token:`, errDetail);
    }
  }

  // Format actionable error
  const fbErr = lastErr?.response?.data?.error;
  if (fbErr?.code === 10 || fbErr?.message?.includes("instagram_content_publish")) {
    const customErr = new Error(
      "Instagram requires 'instagram_content_publish' permission. Please reconnect your Facebook Page or Instagram in Connect Accounts to grant posting permission."
    );
    customErr.code = "PERMISSION_MISSING";
    throw customErr;
  }

  throw lastErr || new Error("Failed to publish post to Instagram account");
}


// ─── GET ALL SOCIAL POSTS ───────────────────────────────────────────────────
router.get("/social-posts", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { status, platform, limit = 50 } = req.query;

    let query = `
      SELECT p.*, i.name as account_name, i.fb_page_id, i.ig_account_id
      FROM social_posts p
      LEFT JOIN integrations i ON p.integration_id = i.id
      WHERE p.agency_id = ?
    `;
    const params = [agencyId];

    if (status && status !== "ALL") {
      query += " AND p.status = ?";
      params.push(status.toUpperCase());
    }

    if (platform && platform !== "ALL") {
      query += " AND p.platform = ?";
      params.push(platform.toUpperCase());
    }

    query += " ORDER BY p.created_at DESC LIMIT ?";
    params.push(parseInt(limit));

    const [rows] = await pool.query(query, params);

    const posts = rows.map((r) => ({
      ...r,
      media_urls: typeof r.media_urls === "string" ? JSON.parse(r.media_urls || "[]") : r.media_urls || [],
    }));

    return res.json({ success: true, posts, count: posts.length });
  } catch (err) {
    console.error("Get social posts error:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to fetch posts" });
  }
});

// ─── PUBLISH SOCIAL POST NOW ────────────────────────────────────────────────
router.post("/social-posts/publish", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const {
      integrationIds = [],
      postType = "TEXT",
      message = "",
      mediaUrls = [],
      linkUrl = "",
    } = req.body;

    if (!integrationIds.length) {
      return res.status(400).json({ success: false, message: "Please select at least one Facebook Page or Instagram account" });
    }

    if (!message.trim() && (!mediaUrls || !mediaUrls.length) && !linkUrl) {
      return res.status(400).json({ success: false, message: "Please provide a caption, media, or link for your post" });
    }

    const [integrations] = await pool.query(
      "SELECT * FROM integrations WHERE agency_id = ? AND id IN (?) AND is_active = 1",
      [agencyId, integrationIds]
    );

    if (!integrations.length) {
      return res.status(404).json({ success: false, message: "No active channel accounts found" });
    }

    const results = [];
    const errors = [];

    for (const integ of integrations) {
      const isFb = integ.platform === "FACEBOOK";
      const isIg = integ.platform === "INSTAGRAM";

      try {
        let publishResult;
        if (isFb) {
          publishResult = await publishToFacebook({
            pageId: integ.fb_page_id,
            pageToken: integ.access_token,
            userToken: integ.user_access_token,
            postType,
            message,
            mediaUrls,
            linkUrl,
          });
        } else if (isIg) {
          publishResult = await publishToInstagram({
            igAccountId: integ.ig_account_id || integ.fb_page_id,
            token: integ.access_token,
            userToken: integ.user_access_token,
            postType,
            message,
            mediaUrls,
          });
        }

        // Save record to DB
        const [ins] = await pool.query(
          `INSERT INTO social_posts (
            agency_id, integration_id, platform, post_type, message,
            media_urls, link_url, meta_post_id, meta_permalink, status, published_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED', NOW())`,
          [
            agencyId,
            integ.id,
            integ.platform,
            postType,
            message,
            JSON.stringify(mediaUrls || []),
            linkUrl || null,
            publishResult.postId,
            publishResult.permalink,
          ]
        );

        results.push({
          id: ins.insertId,
          account: integ.name,
          platform: integ.platform,
          postId: publishResult.postId,
          permalink: publishResult.permalink,
        });
      } catch (postErr) {
        const errorMsg = postErr.response?.data?.error?.message || postErr.message;
        errors.push({ account: integ.name, platform: integ.platform, error: errorMsg });

        // Save failed record
        await pool.query(
          `INSERT INTO social_posts (
            agency_id, integration_id, platform, post_type, message,
            media_urls, link_url, status, error_message
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'FAILED', ?)`,
          [
            agencyId,
            integ.id,
            integ.platform,
            postType,
            message,
            JSON.stringify(mediaUrls || []),
            linkUrl || null,
            errorMsg,
          ]
        );
      }
    }

    if (results.length === 0) {
      return res.status(400).json({
        success: false,
        message: errors[0]?.error || "Failed to publish post to selected accounts",
        errors,
      });
    }

    return res.status(201).json({
      success: true,
      message: `Post published successfully to ${results.length} account(s)!`,
      published: results,
      errors: errors.length ? errors : undefined,
    });
  } catch (err) {
    console.error("Publish post error:", err);
    return res.status(500).json({ success: false, message: err.message || "Server error publishing post" });
  }
});

// ─── SCHEDULE SOCIAL POST ───────────────────────────────────────────────────
router.post("/social-posts/schedule", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const {
      integrationIds = [],
      postType = "TEXT",
      message = "",
      mediaUrls = [],
      linkUrl = "",
      scheduledAt,
    } = req.body;

    if (!integrationIds.length) {
      return res.status(400).json({ success: false, message: "Please select at least one account" });
    }

    if (!scheduledAt) {
      return res.status(400).json({ success: false, message: "Scheduled date and time is required" });
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime()) || scheduledDate < new Date()) {
      return res.status(400).json({ success: false, message: "Please select a valid future date and time" });
    }

    for (const integId of integrationIds) {
      const [integ] = await pool.query("SELECT platform FROM integrations WHERE id = ? AND agency_id = ?", [integId, agencyId]);
      const platform = integ[0]?.platform || "FACEBOOK";

      await pool.query(
        `INSERT INTO social_posts (
          agency_id, integration_id, platform, post_type, message,
          media_urls, link_url, status, scheduled_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?)`,
        [
          agencyId,
          integId,
          platform,
          postType,
          message,
          JSON.stringify(mediaUrls || []),
          linkUrl || null,
          scheduledDate,
        ]
      );
    }

    return res.status(201).json({
      success: true,
      message: `Post scheduled successfully for ${scheduledDate.toLocaleString()}!`,
    });
  } catch (err) {
    console.error("Schedule post error:", err);
    return res.status(500).json({ success: false, message: err.message || "Server error scheduling post" });
  }
});

// ─── DELETE SOCIAL POST ─────────────────────────────────────────────────────
router.delete("/social-posts/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query("SELECT * FROM social_posts WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Post not found" });
    }

    await pool.query("DELETE FROM social_posts WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    return res.json({ success: true, message: "Post record deleted successfully" });
  } catch (err) {
    console.error("Delete social post error:", err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

export default router;
