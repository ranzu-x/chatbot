import express from "express";
import axios from "axios";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { getPostsPage, POSTS_PAGE_SIZE } from "../utils/metaPosts.js";
import { loadRuleLinks, findRuleForPost, postBelongsToAccount, copyCampaign, SAVED_CAMPAIGN } from "../utils/commentRulePosts.js";
import { requireModule, requireLimit, assertLimit } from "../utils/entitlements.js";

const router = express.Router();
router.use("/comments", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), requireModule("feature_comment_automation"));

const META_API_VERSION = process.env.META_API_VERSION || "v21.0";

// ─── GET POSTS & REELS FROM META (FB Page or Instagram) ─────────────────────
// Posts & Reels list: newest first, never more than 12 per page (decided with
// the user), with real page numbers — utils/metaPosts.js lists the post ids
// (up to the latest 1000) for the total, then loads only the chosen page.

router.get("/comments/posts", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { integrationId, platform = "FACEBOOK" } = req.query;
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));

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
    // One page of posts, newest first — see utils/metaPosts.js. A Meta error
    // (expired token, missing permission) shows as an empty list, as before.
    let listing = { posts: [], page: 1, totalPages: 0, total: 0, truncated: false };
    try {
      listing = await getPostsPage(integration, META_API_VERSION, page);
    } catch (err) {
      console.warn("Posts fetch warning:", err.response?.data?.error?.message || err.message);
    }
    const rawPosts = listing.posts;

    // Fetch existing comment automation rules for this integration
    const [rules] = await pool.query(
      `SELECT * FROM comment_automation_rules WHERE agency_id = ? AND integration_id = ?`,
      [agencyId, integration.id]
    );

    // Find Page-Wide / All Posts Rule
    const pageWideRule = rules.find((r) => r.post_id === "ALL_POSTS" && r.is_active === 1) || null;

    // Attach the campaign running on each post (a campaign can run on several
    // posts — comment_rule_posts), else the page-wide one.
    const links = await loadRuleLinks(rules.map((r) => r.id));
    const postsWithRules = rawPosts.map((post) => {
      const specificRule = findRuleForPost(rules, links, post.id);
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
      pageSize: POSTS_PAGE_SIZE,
      page: listing.page,
      totalPages: listing.totalPages,
      total: listing.total,
      // Only the latest MAX_LISTED_POSTS posts are listed (see utils/metaPosts.js).
      truncated: listing.truncated,
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

    // The posts each campaign runs on (none for a page-wide campaign).
    const links = await loadRuleLinks(campaigns.map((c) => c.id));
    for (const c of campaigns) {
      c.posts = links.get(c.id) || [];
      c.post_count = c.posts.length;
    }

    return res.json({ success: true, campaigns });
  } catch (err) {
    console.error("List campaigns error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE COMMENT AUTOMATION CAMPAIGN ───────────────────────────────────────
router.post("/comments/campaigns", requireLimit("max_comment_rules"), async (req, res) => {
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
      autoReplyMediaUrl,
      replyMode = "STATIC",
      aiPromptInstruction,
      aiAgentId,
      enableLikeComment = true,
      autoReplyPrivateMessage,
      privateReplyButtons = [],
      privateReplyMode = "TEXT",
      flowId,
      offensiveKeywords,
      offensiveAction = "NONE",
      offensiveReplyMessage,
      replyMultipleTimes = false,
    } = req.body;

    if (!campaignName) {
      return res.status(400).json({ success: false, message: "Campaign name is required" });
    }

    if (!integrationId || integrationId === "all") {
      return res.status(400).json({ success: false, message: "An account must be selected before creating a comment automation rule." });
    }

    if (!autoReplyComment && !autoReplyPrivateMessage && !flowId && offensiveAction === "NONE") {
      return res.status(400).json({
        success: false,
        message: "Please configure at least one action: Public Comment Reply, Private DM Reply, or Offensive Comment Moderation.",
      });
    }

    // BOT SCOPE: a rule may only start a flow of its OWN bot account.
    if (flowId) {
      const [[ownFlow]] = await pool.query("SELECT id FROM flows WHERE id = ? AND agency_id = ? AND integration_id = ?", [flowId, agencyId, integrationId]);
      if (!ownFlow) {
        return res.status(403).json({ success: false, code: "BOT_SCOPE_VIOLATION", message: "That flow belongs to a different bot account." });
      }
    }

    // A post runs at most one campaign (per bot account), and only a post of
    // the campaign's OWN Page / Instagram account (its replies are written for it).
    const isPostCampaign = postId && postId !== "ALL_POSTS" && postId !== SAVED_CAMPAIGN;
    // "Also save as a campaign": a reusable copy kept in the list (runs on no post) — one more campaign.
    const alsoSave = Boolean(req.body.saveAsCampaign) && isPostCampaign;
    if (alsoSave) {
      try {
        await assertLimit(agencyId, "max_comment_rules", 2, req.user?.id);
      } catch (limitErr) {
        return res.status(limitErr.status || 403).json({ success: false, code: limitErr.code, message: `Saving it as a campaign too needs room for 2 campaigns. ${limitErr.message}` });
      }
    }
    if (isPostCampaign) {
      const [[account]] = await pool.query("SELECT * FROM integrations WHERE id = ? AND agency_id = ?", [integrationId, agencyId]);
      if (!account || !(await postBelongsToAccount(account, postId))) {
        return res.status(400).json({ success: false, code: "POST_OF_OTHER_ACCOUNT", message: "That post isn't one of this account's own posts, so a campaign for this account can't run on it." });
      }
      const current = await campaignOnPost(agencyId, integrationId, postId);
      if (current) {
        return res.status(409).json({ success: false, code: "POST_ALREADY_AUTOMATED", message: `This post already runs the campaign "${current.campaign_name}". Edit or delete it first.` });
      }
    }

    const [result] = await pool.query(
      `INSERT INTO comment_automation_rules (
        agency_id, integration_id, platform, campaign_name, post_id, post_data,
        trigger_type, trigger_keywords, match_type, exclude_keywords,
        auto_reply_comment, comment_variations, auto_reply_media_url,
        reply_mode, ai_prompt_instruction, ai_agent_id, enable_like_comment,
        auto_reply_private_message, private_reply_buttons, private_reply_mode, flow_id,
        offensive_keywords, offensive_action, offensive_reply_message,
        reply_multiple_times, is_active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())`,
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
        autoReplyMediaUrl || null,
        (replyMode || "STATIC").toUpperCase() === "AI" ? "AI" : "STATIC",
        aiPromptInstruction || null,
        aiAgentId || null,
        enableLikeComment ? 1 : 0,
        autoReplyPrivateMessage || null,
        JSON.stringify(privateReplyButtons || []),
        (privateReplyMode || "TEXT").toUpperCase() === "FLOW" ? "FLOW" : "TEXT",
        flowId || null,
        offensiveKeywords || null,
        offensiveAction || "NONE",
        offensiveReplyMessage || null,
        replyMultipleTimes ? 1 : 0,
      ]
    );

    // The post this campaign runs on.
    if (isPostCampaign) {
      await pool.query(
        "INSERT IGNORE INTO comment_rule_posts (agency_id, integration_id, rule_id, post_id, post_data) VALUES (?, ?, ?, ?, ?)",
        [agencyId, integrationId, result.insertId, postId, postData ? JSON.stringify(postData) : null]
      );
    }

    // "Also save as a campaign": a reusable copy of the same settings, on no post.
    let savedCopyId = null;
    if (alsoSave) {
      savedCopyId = await copyCampaign(pool, result.insertId, agencyId, { campaignName: campaignName.trim(), postId: SAVED_CAMPAIGN });
    }

    const [newCampaign] = await pool.query("SELECT * FROM comment_automation_rules WHERE id = ?", [result.insertId]);

    return res.status(201).json({
      success: true,
      message: savedCopyId
        ? `Campaign "${campaignName}" created for this post and saved as a reusable campaign.`
        : `Comment Automation Campaign "${campaignName}" created successfully!`,
      campaign: newCampaign[0],
      savedCampaignId: savedCopyId,
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
      autoReplyMediaUrl,
      replyMode,
      aiPromptInstruction,
      aiAgentId,
      enableLikeComment,
      autoReplyPrivateMessage,
      privateReplyButtons = [],
      privateReplyMode,
      flowId,
      offensiveKeywords,
      offensiveAction,
      offensiveReplyMessage,
      replyMultipleTimes,
    } = req.body;

    const [rows] = await pool.query(
      "SELECT id, integration_id FROM comment_automation_rules WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }

    // BOT SCOPE: a rule may only start a flow of its OWN bot account.
    if (flowId) {
      const [[ownFlow]] = await pool.query("SELECT id FROM flows WHERE id = ? AND agency_id = ? AND integration_id = ?", [flowId, agencyId, rows[0].integration_id]);
      if (!ownFlow) {
        return res.status(403).json({ success: false, code: "BOT_SCOPE_VIOLATION", message: "That flow belongs to a different bot account." });
      }
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
        auto_reply_media_url = ?,
        reply_mode = ?,
        ai_prompt_instruction = ?,
        ai_agent_id = ?,
        enable_like_comment = ?,
        auto_reply_private_message = ?,
        private_reply_buttons = ?,
        private_reply_mode = ?,
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
        autoReplyMediaUrl || null,
        (replyMode || "STATIC").toUpperCase() === "AI" ? "AI" : "STATIC",
        aiPromptInstruction || null,
        aiAgentId || null,
        enableLikeComment ? 1 : 0,
        autoReplyPrivateMessage || null,
        JSON.stringify(privateReplyButtons || []),
        (privateReplyMode || "TEXT").toUpperCase() === "FLOW" ? "FLOW" : "TEXT",
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

// ─── USE AN EXISTING CAMPAIGN ON A POST = COPY IT ─────────────────────────────
// Reusing a campaign on a post COPIES it into a new campaign of that post
// (decided with the user — campaigns are never shared, so editing one post's
// replies never changes another's). A post runs at most one campaign per bot
// account, and only a campaign of the post's OWN Page / Instagram account can
// be used (its replies are written for that page).

/** The post-specific campaign already running on this post of this bot account, or null. */
async function campaignOnPost(agencyId, integrationId, postId) {
  const [rules] = await pool.query(
    "SELECT id, campaign_name, post_id FROM comment_automation_rules WHERE agency_id = ? AND integration_id = ? AND post_id NOT IN ('ALL_POSTS', ?)",
    [agencyId, integrationId, SAVED_CAMPAIGN]
  );
  return findRuleForPost(rules, await loadRuleLinks(rules.map((r) => r.id)), postId);
}

router.post("/comments/campaigns/:id/copy", requireLimit("max_comment_rules"), async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { postId, postData } = req.body || {};
    if (!postId || typeof postId !== "string" || postId === "ALL_POSTS" || postId === SAVED_CAMPAIGN || postId.length > 255) {
      return res.status(400).json({ success: false, message: "Choose a post" });
    }
    const [[source]] = await pool.query(
      "SELECT id, integration_id, campaign_name FROM comment_automation_rules WHERE id = ? AND agency_id = ?",
      [req.params.id, agencyId]
    );
    if (!source) return res.status(404).json({ success: false, message: "Campaign not found" });

    const [[account]] = await pool.query("SELECT * FROM integrations WHERE id = ? AND agency_id = ?", [source.integration_id, agencyId]);
    if (!account || !(await postBelongsToAccount(account, postId))) {
      return res.status(400).json({ success: false, code: "POST_OF_OTHER_ACCOUNT", message: `"${source.campaign_name}" belongs to another Page / account, so it can't be used on this post.` });
    }
    const current = await campaignOnPost(agencyId, source.integration_id, postId);
    if (current) {
      return res.status(409).json({ success: false, code: "POST_ALREADY_AUTOMATED", message: `This post already runs the campaign "${current.campaign_name}". Edit or delete it first.` });
    }

    const newId = await copyCampaign(pool, source.id, agencyId, { campaignName: source.campaign_name, postId, postData });
    const [[campaign]] = await pool.query("SELECT * FROM comment_automation_rules WHERE id = ?", [newId]);
    return res.status(201).json({ success: true, message: `A copy of "${source.campaign_name}" now runs on this post — edit it without changing the original.`, campaign });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, code: "POST_ALREADY_AUTOMATED", message: "This post already runs a campaign." });
    console.error("Copy campaign to post error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});


// ─── DELETE A COMMENT AUTOMATION CAMPAIGN ────────────────────────────────────
// The UI's delete button always called this, but the route was missing. Its
// post links (comment_rule_posts) go with it (ON DELETE CASCADE).
router.delete("/comments/campaigns/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [result] = await pool.query("DELETE FROM comment_automation_rules WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Campaign not found" });
    return res.json({ success: true, message: "Campaign deleted" });
  } catch (err) {
    console.error("Delete campaign error:", err);
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
