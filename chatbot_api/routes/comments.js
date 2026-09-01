import express from "express";
import axios from "axios";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();
router.use(authMiddleware, roleMiddleware("AGENCY", "ADMIN", "AGENT"));

const META_API_VERSION = process.env.META_API_VERSION || "v21.0";

// ─── GET POSTS & REELS FROM META (FB Page or Instagram) ─────────────────────
router.get("/comments/posts", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { integrationId, platform = "FACEBOOK" } = req.query;

    // Find integration
    let query = "SELECT * FROM integrations WHERE agency_id = ? AND is_active = 1";
    const params = [agencyId];

    if (integrationId && integrationId !== "all") {
      query += " AND id = ?";
      params.push(integrationId);
    } else {
      query += " AND platform = ?";
      params.push(platform.toUpperCase());
    }
    query += " ORDER BY id ASC LIMIT 1";

    const [integrations] = await pool.query(query, params);
    if (!integrations.length) {
      return res.json({
        success: true,
        posts: [],
        pageWideRule: null,
        message: `No active ${platform} account found. Please connect an account in Channels.`,
      });
    }

    const integration = integrations[0];
    const pageToken = integration.access_token;
    const isInstagram = (integration.platform || "").toUpperCase() === "INSTAGRAM";

    let rawPosts = [];

    if (isInstagram && integration.ig_account_id) {
      // Instagram Media (Posts, Reels, Carousel)
      const igMediaUrl = `https://graph.facebook.com/${META_API_VERSION}/${integration.ig_account_id}/media`;
      const igRes = await axios.get(igMediaUrl, {
        params: {
          fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
          limit: 100,
          access_token: pageToken,
        },
        timeout: 10000,
      }).catch((err) => {
        console.warn("Instagram media fetch warning:", err.response?.data || err.message);
        return { data: { data: [] } };
      });

      rawPosts = (igRes.data?.data || []).map((p) => ({
        id: p.id,
        message: p.caption || "No caption",
        picture: p.thumbnail_url || p.media_url || null,
        permalink: p.permalink || `https://instagram.com/p/${p.id}`,
        created_time: p.timestamp,
        likes_count: p.like_count || 0,
        comments_count: p.comments_count || 0,
        media_type: p.media_type,
        platform: "INSTAGRAM",
      }));
    } else if (integration.fb_page_id) {
      // Facebook: Fetch timeline feed posts (returns all 7+ photo, video, status, and published posts)
      const pageId = integration.fb_page_id;
      const feedRes = await axios.get(
        `https://graph.facebook.com/${META_API_VERSION}/${pageId}/feed?fields=id,message,story,created_time,full_picture,permalink_url,shares&limit=100&access_token=${pageToken}`,
        { timeout: 10000 }
      ).catch((err) => {
        console.warn("Facebook feed fetch warning:", err.response?.data || err.message);
        return { data: { data: [] } };
      });

      rawPosts = (feedRes.data?.data || []).map((p) => ({
        id: p.id,
        message: p.message || p.story || "Facebook Post",
        picture: p.full_picture || null,
        permalink: p.permalink_url || `https://facebook.com/${p.id}`,
        created_time: p.created_time,
        likes_count: 0,
        comments_count: 0,
        shares_count: p.shares?.count || 0,
        platform: "FACEBOOK",
      }));
    }

    // Fetch existing comment automation rules for this integration
    const [rules] = await pool.query(
      `SELECT * FROM comment_automation_rules WHERE agency_id = ? AND (integration_id = ? OR integration_id IS NULL)`,
      [agencyId, integration.id]
    );

    // Find Page-Wide / All Posts Rule
    const pageWideRule = rules.find((r) => r.post_id === "ALL_POSTS" && r.is_active === 1) || null;

    // Attach active rule to each post if assigned
    const postsWithRules = rawPosts.map((post) => {
      const specificRule = rules.find((r) =>
        r.post_id === post.id ||
        (post.id && (r.post_id.endsWith(`_${post.id}`) || post.id.endsWith(`_${r.post_id}`)))
      );
      return {
        ...post,
        rule: specificRule || (pageWideRule ? { ...pageWideRule, isInherited: true } : null),
      };
    });

    return res.json({
      success: true,
      account: {
        id: integration.id,
        name: integration.name,
        platform: integration.platform,
        fb_page_id: integration.fb_page_id,
        ig_account_id: integration.ig_account_id,
      },
      pageWideRule,
      posts: postsWithRules,
    });
  } catch (err) {
    console.error("Get posts error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch posts from Meta" });
  }
});

// ─── GET ALL COMMENT CAMPAIGNS ───────────────────────────────────────────────
router.get("/comments/campaigns", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { integrationId, platform } = req.query;

    let query = `
      SELECT r.*, i.name as account_name, i.platform as account_platform
      FROM comment_automation_rules r
      LEFT JOIN integrations i ON i.id = r.integration_id
      WHERE r.agency_id = ?
    `;
    const params = [agencyId];

    if (integrationId && integrationId !== "all") {
      query += " AND r.integration_id = ?";
      params.push(integrationId);
    }
    if (platform) {
      query += " AND r.platform = ?";
      params.push(platform.toUpperCase());
    }

    query += " ORDER BY r.created_at DESC";

    const [campaigns] = await pool.query(query, params);

    return res.json({ success: true, campaigns });
  } catch (err) {
    console.error("List campaigns error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE COMMENT AUTOMATION CAMPAIGN ───────────────────────────────────────
router.post("/comments/campaigns", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const {
      campaignName,
      integrationId,
      platform = "FACEBOOK",
      postId = "ALL_POSTS",
      postData,
      triggerType = "ALL",
      triggerKeywords,
      matchType = "CONTAINS",
      excludeKeywords,
      autoReplyComment,
      commentVariations = [],
      enableLikeComment = true,
      autoReplyPrivateMessage,
      privateReplyButtons = [],
      flowId,
      offensiveKeywords,
      offensiveAction = "NONE",
      offensiveReplyMessage,
      replyMultipleTimes = false,
    } = req.body;

    if (!campaignName) {
      return res.status(400).json({ success: false, message: "Campaign name is required" });
    }

    if (!autoReplyComment && !autoReplyPrivateMessage && offensiveAction === "NONE") {
      return res.status(400).json({
        success: false,
        message: "Please configure at least one action: Public Comment Reply, Private DM Reply, or Offensive Comment Moderation.",
      });
    }

    const [result] = await pool.query(
      `INSERT INTO comment_automation_rules (
        agency_id, integration_id, platform, campaign_name, post_id, post_data,
        trigger_type, trigger_keywords, match_type, exclude_keywords,
        auto_reply_comment, comment_variations, enable_like_comment,
        auto_reply_private_message, private_reply_buttons, flow_id,
        offensive_keywords, offensive_action, offensive_reply_message,
        reply_multiple_times, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
      [
        agencyId,
        integrationId && integrationId !== "all" ? integrationId : null,
        platform.toUpperCase(),
        campaignName.trim(),
        postId || "ALL_POSTS",
        postData ? JSON.stringify(postData) : null,
        triggerType,
        triggerKeywords || null,
        matchType,
        excludeKeywords || null,
        autoReplyComment || null,
        JSON.stringify(commentVariations || []),
        enableLikeComment ? 1 : 0,
        autoReplyPrivateMessage || null,
        JSON.stringify(privateReplyButtons || []),
        flowId || null,
        offensiveKeywords || null,
        offensiveAction || "NONE",
        offensiveReplyMessage || null,
        replyMultipleTimes ? 1 : 0,
      ]
    );

    const [newCampaign] = await pool.query("SELECT * FROM comment_automation_rules WHERE id = ?", [result.insertId]);

    return res.status(201).json({
      success: true,
      message: `Comment Automation Campaign "${campaignName}" created successfully!`,
      campaign: newCampaign[0],
    });
  } catch (err) {
    console.error("Create campaign error:", err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

// ─── UPDATE COMMENT AUTOMATION CAMPAIGN ───────────────────────────────────────
router.put("/comments/campaigns/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const {
      campaignName,
      triggerType,
      triggerKeywords,
      matchType,
      excludeKeywords,
      autoReplyComment,
      commentVariations = [],
      enableLikeComment,
      autoReplyPrivateMessage,
      privateReplyButtons = [],
      flowId,
      offensiveKeywords,
      offensiveAction,
      offensiveReplyMessage,
      replyMultipleTimes,
    } = req.body;

    const [rows] = await pool.query(
      "SELECT id FROM comment_automation_rules WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }

    await pool.query(
      `UPDATE comment_automation_rules SET
        campaign_name = COALESCE(?, campaign_name),
        trigger_type = COALESCE(?, trigger_type),
        trigger_keywords = ?,
        match_type = COALESCE(?, match_type),
        exclude_keywords = ?,
        auto_reply_comment = ?,
        comment_variations = ?,
        enable_like_comment = ?,
        auto_reply_private_message = ?,
        private_reply_buttons = ?,
        flow_id = ?,
        offensive_keywords = ?,
        offensive_action = COALESCE(?, offensive_action),
        offensive_reply_message = ?,
        reply_multiple_times = ?
      WHERE id = ? AND agency_id = ?`,
      [
        campaignName,
        triggerType,
        triggerKeywords || null,
        matchType,
        excludeKeywords || null,
        autoReplyComment || null,
        JSON.stringify(commentVariations || []),
        enableLikeComment ? 1 : 0,
        autoReplyPrivateMessage || null,
        JSON.stringify(privateReplyButtons || []),
        flowId || null,
        offensiveKeywords || null,
        offensiveAction || "NONE",
        offensiveReplyMessage || null,
        replyMultipleTimes ? 1 : 0,
        req.params.id,
        agencyId,
      ]
    );

    return res.json({ success: true, message: "Comment campaign updated successfully!" });
  } catch (err) {
    console.error("Update campaign error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── TOGGLE COMMENT AUTOMATION CAMPAIGN ───────────────────────────────────────
router.patch("/comments/campaigns/:id/toggle", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query(
      "SELECT is_active FROM comment_automation_rules WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }

    const nextState = rows[0].is_active ? 0 : 1;
    await pool.query(
      "UPDATE comment_automation_rules SET is_active = ? WHERE id = ? AND agency_id = ?",
      [nextState, req.params.id, agencyId]
    );

    return res.json({
      success: true,
      message: `Campaign ${nextState ? "activated" : "paused"}`,
      isActive: Boolean(nextState),
    });
  } catch (err) {
    console.error("Toggle campaign error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── HELPER: EXECUTE META GRAPH POST WITH DUAL TOKEN (PAGE & OWNER) ─────────
async function executeMetaCommentAction(url, data, pageToken, userToken, postAs = "PAGE") {
  if (postAs === "OWNER") {
    if (!userToken) {
      const err = new Error("Personal Facebook User Account is not linked yet. Please link your Facebook User Token to comment from your personal account.");
      err.status = 400;
      throw err;
    }
    // Directly post as Personal Account (Owner)
    try {
      const res = await axios.post(url, data, {
        headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
        params: { access_token: userToken },
      });
      return { success: true, data: res.data, as: "OWNER" };
    } catch (ownerErr) {
      console.error("[Comments API] Error posting as Personal Account:", ownerErr.response?.data || ownerErr.message);
      throw ownerErr;
    }
  }

  // Otherwise post as PAGE (with fallback to owner if permission denied)
  const primaryToken = pageToken || userToken;
  try {
    const res = await axios.post(url, data, {
      headers: { Authorization: `Bearer ${primaryToken}`, "Content-Type": "application/json" },
      params: { access_token: primaryToken },
    });
    return { success: true, data: res.data, as: "PAGE" };
  } catch (err1) {
    if (userToken && userToken !== primaryToken) {
      console.log("[Comments API] Page token returned error. Retrying as Personal Account (Owner)...");
      try {
        const res2 = await axios.post(url, data, {
          headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
          params: { access_token: userToken },
        });
        return { success: true, data: res2.data, as: "OWNER" };
      } catch (err2) {
        throw err2;
      }
    }
    throw err1;
  }
}

// ─── LINK PERSONAL FACEBOOK USER TOKEN TO INTEGRATION ───────────────────────
router.post("/comments/link-user-token", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { integrationId, userAccessToken } = req.body;

    if (!userAccessToken?.trim()) {
      return res.status(400).json({ success: false, message: "userAccessToken is required" });
    }

    // Verify token with Meta Graph API
    const testRes = await axios.get(`https://graph.facebook.com/${META_API_VERSION}/me`, {
      params: { fields: "id,name", access_token: userAccessToken.trim() },
    });

    const userData = testRes.data;
    if (!userData.id) {
      return res.status(400).json({ success: false, message: "Invalid Facebook User Token" });
    }

    let query = "UPDATE integrations SET user_access_token = ? WHERE agency_id = ? AND platform = 'FACEBOOK'";
    const params = [userAccessToken.trim(), agencyId];
    if (integrationId && integrationId !== "all") {
      query += " AND id = ?";
      params.push(integrationId);
    }

    await pool.query(query, params);

    return res.json({
      success: true,
      message: `Personal Facebook Account (${userData.name}) linked successfully! You can now comment from your personal account.`,
      userName: userData.name,
      userId: userData.id,
    });
  } catch (err) {
    console.error("Link user token error:", err.response?.data || err.message);
    return res.status(400).json({
      success: false,
      message: err.response?.data?.error?.message || err.message || "Failed to link personal Facebook token",
    });
  }
});

// ─── GET COMMENTS FOR A SPECIFIC POST ───────────────────────────────────────
router.get("/comments/post-comments", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { postId, integrationId, platform = "FACEBOOK" } = req.query;

    if (!postId) {
      return res.status(400).json({ success: false, message: "postId is required" });
    }

    let query = "SELECT * FROM integrations WHERE agency_id = ? AND is_active = 1";
    const params = [agencyId];
    if (integrationId && integrationId !== "all") {
      query += " AND id = ?";
      params.push(integrationId);
    } else {
      query += " AND platform = ?";
      params.push(platform.toUpperCase());
    }
    query += " LIMIT 1";

    const [integrations] = await pool.query(query, params);
    if (!integrations.length) {
      return res.status(404).json({ success: false, message: "No active channel integration found" });
    }

    const integration = integrations[0];
    const pageToken = integration.access_token;
    const userToken = integration.user_access_token;
    const isInstagram = (integration.platform || "").toUpperCase() === "INSTAGRAM";

    let comments = [];

    if (isInstagram) {
      const igRes = await axios.get(`https://graph.facebook.com/${META_API_VERSION}/${postId}/comments`, {
        params: {
          fields: "id,text,from,timestamp,like_count,replies{id,text,from,timestamp}",
          limit: 50,
          access_token: pageToken,
        },
        timeout: 10000,
      });
      comments = (igRes.data?.data || []).map((c) => ({
        id: c.id,
        message: c.text || "",
        from: c.from || { name: "Instagram User", id: c.from?.id },
        created_time: c.timestamp,
        like_count: c.like_count || 0,
        replies: (c.replies?.data || []).map((r) => ({
          id: r.id,
          message: r.text || "",
          from: r.from || { name: "Instagram User" },
          created_time: r.timestamp,
        })),
      }));
    } else {
      // Facebook Post Comments (Try Page Token, fallback to Owner User Token)
      let fbRes;
      try {
        fbRes = await axios.get(`https://graph.facebook.com/${META_API_VERSION}/${postId}/comments`, {
          params: {
            fields: "id,message,from,created_time,like_count,user_likes,can_comment,can_like,can_hide,is_hidden,comments{id,message,from,created_time}",
            limit: 50,
            access_token: pageToken,
          },
          timeout: 10000,
        });
      } catch (fbErr) {
        if (userToken && fbErr.response?.data?.error?.code === 200) {
          fbRes = await axios.get(`https://graph.facebook.com/${META_API_VERSION}/${postId}/comments`, {
            params: {
              fields: "id,message,from,created_time,like_count,user_likes,can_comment,can_like,can_hide,is_hidden,comments{id,message,from,created_time}",
              limit: 50,
              access_token: userToken,
            },
            timeout: 10000,
          });
        } else {
          throw fbErr;
        }
      }

      comments = (fbRes?.data?.data || []).map((c) => ({
        id: c.id,
        message: c.message || "",
        from: c.from || { name: "Facebook User", id: c.from?.id },
        created_time: c.created_time,
        like_count: c.like_count || 0,
        user_likes: Boolean(c.user_likes),
        can_comment: Boolean(c.can_comment),
        can_like: Boolean(c.can_like),
        can_hide: Boolean(c.can_hide),
        is_hidden: Boolean(c.is_hidden),
        replies: (c.comments?.data || []).map((r) => ({
          id: r.id,
          message: r.message || "",
          from: r.from || { name: "Facebook User" },
          created_time: r.created_time,
        })),
      }));
    }

    return res.json({ success: true, comments, count: comments.length, hasUserToken: Boolean(userToken) });
  } catch (err) {
    console.error("Get post comments error:", err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      success: false,
      message: err.response?.data?.error?.message || err.message || "Failed to fetch post comments",
      metaError: err.response?.data?.error || null,
    });
  }
});

// ─── POST A COMMENT DIRECTLY TO A POST (MANUAL COMMENT) ─────────────────────
router.post("/comments/post-comment", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { postId, integrationId, platform = "FACEBOOK", message, postAs = "PAGE" } = req.body;

    if (!postId || !message?.trim()) {
      return res.status(400).json({ success: false, message: "postId and message are required" });
    }

    let query = "SELECT * FROM integrations WHERE agency_id = ? AND is_active = 1";
    const params = [agencyId];
    if (integrationId && integrationId !== "all") {
      query += " AND id = ?";
      params.push(integrationId);
    } else {
      query += " AND platform = ?";
      params.push(platform.toUpperCase());
    }
    query += " LIMIT 1";

    const [integrations] = await pool.query(query, params);
    if (!integrations.length) {
      return res.status(404).json({ success: false, message: "No active channel integration found" });
    }

    const integration = integrations[0];
    const pageToken = integration.access_token;
    const userToken = integration.user_access_token;

    // Send comment to Meta Graph API with postAs preference (PAGE vs OWNER)
    const result = await executeMetaCommentAction(
      `https://graph.facebook.com/${META_API_VERSION}/${postId}/comments`,
      { message: message.trim() },
      pageToken,
      userToken,
      postAs
    );

    return res.status(201).json({
      success: true,
      message: `Comment published successfully as ${result.as === "OWNER" ? "Facebook User Account" : "Facebook Page"}!`,
      data: result.data,
      publishedAs: result.as,
    });
  } catch (err) {
    console.error("Manual post comment error:", err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      success: false,
      message: err.response?.data?.error?.message || err.message || "Failed to publish comment",
      metaError: err.response?.data?.error || null,
    });
  }
});

// ─── REPLY TO A SPECIFIC COMMENT (MANUAL REPLY) ──────────────────────────────
router.post("/comments/reply-comment", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { commentId, integrationId, platform = "FACEBOOK", message, replyAs = "PAGE" } = req.body;

    if (!commentId || !message?.trim()) {
      return res.status(400).json({ success: false, message: "commentId and message are required" });
    }

    let query = "SELECT * FROM integrations WHERE agency_id = ? AND is_active = 1";
    const params = [agencyId];
    if (integrationId && integrationId !== "all") {
      query += " AND id = ?";
      params.push(integrationId);
    } else {
      query += " AND platform = ?";
      params.push(platform.toUpperCase());
    }
    query += " LIMIT 1";

    const [integrations] = await pool.query(query, params);
    if (!integrations.length) {
      return res.status(404).json({ success: false, message: "No active channel integration found" });
    }

    const integration = integrations[0];
    const pageToken = integration.access_token;
    const userToken = integration.user_access_token;

    const result = await executeMetaCommentAction(
      `https://graph.facebook.com/${META_API_VERSION}/${commentId}/comments`,
      { message: message.trim() },
      pageToken,
      userToken,
      replyAs
    );

    return res.status(201).json({
      success: true,
      message: `Reply published successfully as ${result.as === "OWNER" ? "Facebook User Account" : "Facebook Page"}!`,
      data: result.data,
      publishedAs: result.as,
    });
  } catch (err) {
    console.error("Manual reply comment error:", err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      success: false,
      message: err.response?.data?.error?.message || err.message || "Failed to publish reply",
      metaError: err.response?.data?.error || null,
    });
  }
});

// ─── LIKE A COMMENT MANUALLY ────────────────────────────────────────────────
router.post("/comments/like-comment", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { commentId, integrationId, platform = "FACEBOOK" } = req.body;

    if (!commentId) {
      return res.status(400).json({ success: false, message: "commentId is required" });
    }

    let query = "SELECT * FROM integrations WHERE agency_id = ? AND is_active = 1";
    const params = [agencyId];
    if (integrationId && integrationId !== "all") {
      query += " AND id = ?";
      params.push(integrationId);
    } else {
      query += " AND platform = ?";
      params.push(platform.toUpperCase());
    }
    query += " LIMIT 1";

    const [integrations] = await pool.query(query, params);
    if (!integrations.length) {
      return res.status(404).json({ success: false, message: "No active channel integration found" });
    }

    const integration = integrations[0];
    const pageToken = integration.access_token;
    const userToken = integration.user_access_token;

    await executeMetaCommentAction(
      `https://graph.facebook.com/${META_API_VERSION}/${commentId}/likes`,
      {},
      pageToken,
      userToken
    );

    return res.json({ success: true, message: "Comment liked successfully!" });
  } catch (err) {
    console.error("Manual like comment error:", err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      success: false,
      message: err.response?.data?.error?.message || err.message || "Failed to like comment",
      metaError: err.response?.data?.error || null,
    });
  }
});

// ─── HIDE / UNHIDE A COMMENT ────────────────────────────────────────────────
router.post("/comments/hide-comment", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { commentId, integrationId, isHidden = true, platform = "FACEBOOK" } = req.body;

    if (!commentId) {
      return res.status(400).json({ success: false, message: "commentId is required" });
    }

    let query = "SELECT * FROM integrations WHERE agency_id = ? AND is_active = 1";
    const params = [agencyId];
    if (integrationId && integrationId !== "all") {
      query += " AND id = ?";
      params.push(integrationId);
    } else {
      query += " AND platform = ?";
      params.push(platform.toUpperCase());
    }
    query += " LIMIT 1";

    const [integrations] = await pool.query(query, params);
    if (!integrations.length) {
      return res.status(404).json({ success: false, message: "No active channel integration found" });
    }

    const integration = integrations[0];
    const pageToken = integration.access_token;

    await axios.post(
      `https://graph.facebook.com/${META_API_VERSION}/${commentId}`,
      null,
      {
        params: {
          is_hidden: isHidden,
          access_token: pageToken,
        },
      }
    );

    return res.json({
      success: true,
      message: isHidden ? "Comment hidden successfully" : "Comment unhidden successfully",
    });
  } catch (err) {
    console.error("Hide comment error:", err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      success: false,
      message: err.response?.data?.error?.message || err.message || "Failed to update comment visibility",
      metaError: err.response?.data?.error || null,
    });
  }
});

// ─── DELETE A COMMENT MANUALLY ──────────────────────────────────────────────
router.delete("/comments/delete-comment/:commentId", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { commentId } = req.params;
    const { integrationId, platform = "FACEBOOK" } = req.query;

    let query = "SELECT * FROM integrations WHERE agency_id = ? AND is_active = 1";
    const params = [agencyId];
    if (integrationId && integrationId !== "all") {
      query += " AND id = ?";
      params.push(integrationId);
    } else {
      query += " AND platform = ?";
      params.push(platform.toUpperCase());
    }
    query += " LIMIT 1";

    const [integrations] = await pool.query(query, params);
    if (!integrations.length) {
      return res.status(404).json({ success: false, message: "No active channel integration found" });
    }

    const integration = integrations[0];
    const pageToken = integration.access_token;

    await axios.delete(`https://graph.facebook.com/${META_API_VERSION}/${commentId}`, {
      params: { access_token: pageToken },
    });

    return res.json({ success: true, message: "Comment deleted successfully" });
  } catch (err) {
    console.error("Delete comment error:", err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      success: false,
      message: err.response?.data?.error?.message || err.message || "Failed to delete comment",
      metaError: err.response?.data?.error || null,
    });
  }
});

export default router;
