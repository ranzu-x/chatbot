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
      // Instagram Media
      const igMediaUrl = `https://graph.facebook.com/${META_API_VERSION}/${integration.ig_account_id}/media`;
      const igRes = await axios.get(igMediaUrl, {
        params: {
          fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
          limit: 30,
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
      // Facebook Published Posts
      const fbPostsUrl = `https://graph.facebook.com/${META_API_VERSION}/${integration.fb_page_id}/published_posts`;
      const fbRes = await axios.get(fbPostsUrl, {
        params: {
          fields: "id,message,story,created_time,full_picture,permalink_url,shares,comments.summary(true),likes.summary(true)",
          limit: 30,
          access_token: pageToken,
        },
        timeout: 10000,
      }).catch((err) => {
        console.warn("Facebook posts fetch warning:", err.response?.data || err.message);
        return { data: { data: [] } };
      });

      rawPosts = (fbRes.data?.data || []).map((p) => ({
        id: p.id,
        message: p.message || p.story || "Facebook Post",
        picture: p.full_picture || null,
        permalink: p.permalink_url || `https://facebook.com/${p.id}`,
        created_time: p.created_time,
        likes_count: p.likes?.summary?.total_count || 0,
        comments_count: p.comments?.summary?.total_count || 0,
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
      const specificRule = rules.find((r) => r.post_id === post.id);
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

// ─── DELETE COMMENT AUTOMATION CAMPAIGN ───────────────────────────────────────
router.delete("/comments/campaigns/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    await pool.query("DELETE FROM comment_automation_rules WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    return res.json({ success: true, message: "Campaign deleted successfully" });
  } catch (err) {
    console.error("Delete campaign error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
