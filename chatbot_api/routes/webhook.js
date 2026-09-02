import express from "express";
import axios from "axios";
import pool from "../db.js";
import { processFlow } from "../utils/flowEngine.js";
import {
  findOrCreateContact,
  findOrCreateConversation,
  isDuplicateMessage,
  saveMessage,
  matchBotRules,
} from "../utils/messageProcessor.js";
import { emitToAgency, emitToConversation } from "../utils/socket.js";

const router = express.Router();

/**
 * Meta Webhook handler for WhatsApp, Facebook Messenger, and Instagram.
 * Meta sends ALL events to one webhook endpoint. We differentiate by integration.
 *
 * Webhook URL pattern: POST /api/v1/webhook/:agencyId/:integrationId
 * Verification URL:    GET  /api/v1/webhook/:agencyId/:integrationId
 */

// ─── AGENCY LEVEL WEBHOOK VERIFICATION (GET) ──────────────────────────────────
router.get("/webhook/:agencyId", async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log(`[Meta Webhook] Incoming GET verification on /webhook/${req.params.agencyId}:`, {
    mode,
    token,
    challenge,
  });

  if (mode !== "subscribe" || !token) {
    console.warn(`[Meta Webhook] Invalid request: mode=${mode}, token=${token}`);
    return res.status(400).send("Invalid mode or missing verify token");
  }

  try {
    // 1. Check in meta_app_settings for this agency
    const [metaRows] = await pool.query(
      "SELECT verify_token FROM meta_app_settings WHERE agency_id = ? ORDER BY id DESC LIMIT 1",
      [req.params.agencyId]
    );

    // 2. Check if token matches ANY verify_token in meta_app_settings
    const [allMeta] = await pool.query(
      "SELECT verify_token FROM meta_app_settings WHERE verify_token = ? LIMIT 1",
      [token]
    );

    // 3. Check if token matches ANY verify_token in integrations
    const [allInteg] = await pool.query(
      "SELECT verify_token FROM integrations WHERE verify_token = ? LIMIT 1",
      [token]
    );

    const envTokens = [
      process.env.META_WEBHOOK_VERIFY_TOKEN,
      process.env.META_VERIFY_TOKEN,
    ].filter(Boolean);

    const validTokens = [
      metaRows[0]?.verify_token,
      allMeta[0]?.verify_token,
      allInteg[0]?.verify_token,
      ...envTokens,
    ].filter(Boolean);

    console.log(`[Meta Webhook] Received token: "${token}". Valid registered tokens:`, validTokens);

    if (validTokens.includes(token)) {
      console.log(`✅ [Meta Webhook] Verification SUCCESS for agency ${req.params.agencyId}! Returning challenge:`, challenge);
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(String(challenge));
    }

    console.warn(`❌ [Meta Webhook] Verification FAILED: token "${token}" does not match any registered token for agency ${req.params.agencyId}`);
    return res.status(403).send("Verification token mismatch");
  } catch (err) {
    console.error("Agency Webhook verification error:", err);
    return res.status(500).send("Server error during verification");
  }
});

// ─── INTEGRATION LEVEL WEBHOOK VERIFICATION (GET) ────────────────────────────
router.get("/webhook/:agencyId/:integrationId", async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log(`[Meta Webhook] Incoming GET verification on /webhook/${req.params.agencyId}/${req.params.integrationId}:`, {
    mode,
    token,
    challenge,
  });

  if (mode !== "subscribe" || !token) {
    return res.status(400).send("Invalid mode or missing verify token");
  }

  try {
    const [rows] = await pool.query(
      "SELECT verify_token FROM integrations WHERE id = ? AND agency_id = ? AND is_active = 1",
      [req.params.integrationId, req.params.agencyId]
    );

    const [metaRows] = await pool.query(
      "SELECT verify_token FROM meta_app_settings WHERE agency_id = ? ORDER BY id DESC LIMIT 1",
      [req.params.agencyId]
    );

    const validTokens = [
      rows[0]?.verify_token,
      metaRows[0]?.verify_token,
      process.env.META_WEBHOOK_VERIFY_TOKEN,
      process.env.META_VERIFY_TOKEN,
    ].filter(Boolean);

    if (validTokens.includes(token)) {
      console.log(`✅ [Meta Webhook] Integration verification SUCCESS! Returning challenge:`, challenge);
      res.setHeader("Content-Type", "text/plain");
      return res.status(200).send(String(challenge));
    }

    console.warn(`❌ [Meta Webhook] Integration verification FAILED for integration ${req.params.integrationId}`);
    return res.status(403).send("Verification token mismatch");
  } catch (err) {
    console.error("Webhook verification error:", err);
    return res.status(500).send("Server error during verification");
  }
});

// ─── HELPER: FETCH META USER PROFILE (FACEBOOK / INSTAGRAM) ─────────────────
async function fetchMetaUserProfile(platform, externalId, accessToken) {
  if (!accessToken || !externalId) return { name: null, avatar: null };
  try {
    if (platform === "FACEBOOK") {
      const res = await axios.get(
        `https://graph.facebook.com/v21.0/${externalId}?fields=first_name,last_name,name,profile_pic&access_token=${accessToken}`,
        { timeout: 6000 }
      );
      const name = res.data?.name || `${res.data?.first_name || ""} ${res.data?.last_name || ""}`.trim() || null;
      const avatar = res.data?.profile_pic || null;
      return { name, avatar };
    } else if (platform === "INSTAGRAM") {
      const res = await axios.get(
        `https://graph.facebook.com/v21.0/${externalId}?fields=name,username,profile_pic&access_token=${accessToken}`,
        { timeout: 6000 }
      );
      const name = res.data?.name || res.data?.username || null;
      const avatar = res.data?.profile_pic || null;
      return { name, avatar };
    }
  } catch (err) {
    console.warn(`[Profile Fetch] Could not fetch profile for ${platform} user ${externalId}:`, err.response?.data?.error?.message || err.message);
  }
  return { name: null, avatar: null };
}

// ─── RECEIVE META INCOMING MESSAGES VIA AGENCY WEBHOOK (POST) ────────────────
router.post("/webhook/:agencyId", async (req, res) => {
  const { agencyId } = req.params;
  const body = req.body;

  console.log(`\n📨 [Webhook POST] /webhook/${agencyId} received:`, JSON.stringify(body, null, 2));

  // Always respond 200 immediately to Meta
  res.sendStatus(200);

  try {
    // 1. Check if WhatsApp payload
    const isWhatsApp =
      body?.object === "whatsapp_business_account" ||
      !!body?.entry?.[0]?.changes?.[0]?.value?.messaging_product ||
      !!body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

    if (isWhatsApp) {
      let waPhoneId = null;
      let wabaId = null;

      for (const entry of (body?.entry || [])) {
        if (entry.id) wabaId = entry.id;
        for (const change of (entry?.changes || [])) {
          if (change?.value?.metadata?.phone_number_id) {
            waPhoneId = change.value.metadata.phone_number_id;
            break;
          }
        }
        if (waPhoneId) break;
      }

      let integration = null;
      if (waPhoneId || wabaId) {
        const [waRows] = await pool.query(
          "SELECT * FROM integrations WHERE (wa_phone_number_id = ? OR wa_business_acc_id = ?) AND agency_id = ? AND is_active = 1 LIMIT 1",
          [waPhoneId || "", wabaId || "", agencyId]
        );
        integration = waRows[0];
      }

      if (!integration) {
        const [fallbackRows] = await pool.query(
          "SELECT * FROM integrations WHERE agency_id = ? AND platform = 'WHATSAPP' AND is_active = 1 LIMIT 1",
          [agencyId]
        );
        integration = fallbackRows[0];
      }

      if (integration) {
        console.log(`[Webhook POST] Routing to WhatsApp handler, integration=${integration.id}`);
        return handleWhatsAppPayload(body, agencyId, integration.id, integration);
      } else {
        console.warn(`[Webhook POST] ⚠️ No active WhatsApp integration found for agency ${agencyId}`);
      }
      return;
    }

    // 2. Check if Facebook / Instagram payload
    const fbEntry = body?.entry?.[0];
    const pageOrIgId = fbEntry?.id;

    if (pageOrIgId) {
      console.log(`[Webhook POST] Detected FB/IG payload, pageOrIgId=${pageOrIgId}`);
      const [fbRows] = await pool.query(
        "SELECT * FROM integrations WHERE (fb_page_id = ? OR ig_account_id = ?) AND agency_id = ? AND is_active = 1 LIMIT 1",
        [pageOrIgId, pageOrIgId, agencyId]
      );
      const integration = fbRows[0] || (await pool.query(
        "SELECT * FROM integrations WHERE agency_id = ? AND platform IN ('FACEBOOK','INSTAGRAM') AND is_active = 1 LIMIT 1",
        [agencyId]
      ))[0]?.[0];

      if (integration) {
        console.log(`[Webhook POST] Matched integration: id=${integration.id}, platform=${integration.platform}, name=${integration.name}`);
        if (integration.platform === "FACEBOOK") {
          return handleFacebookPayload(body, agencyId, integration.id, integration);
        } else if (integration.platform === "INSTAGRAM") {
          return handleInstagramPayload(body, agencyId, integration.id, integration);
        }
      } else {
        console.warn(`[Webhook POST] ⚠️ No matching integration found for pageOrIgId=${pageOrIgId}, agency=${agencyId}`);
      }
    } else {
      console.warn(`[Webhook POST] ⚠️ Could not determine payload type (no WA phone ID or FB page ID found)`);
    }
  } catch (err) {
    console.error("Agency Webhook POST processing error:", err);
  }
});

// ─── PAYLOAD HANDLERS ────────────────────────────────────────────────────────
async function handleWhatsAppPayload(body, agencyId, integrationId, integration) {
  try {
    const entries = body?.entry || [];
    for (const entry of entries) {
      const changes = entry?.changes || [];
      for (const change of changes) {
        const value = change?.value;
        if (!value) continue;

        // Handle message status updates (sent, delivered, read)
        if (Array.isArray(value.statuses)) {
          for (const statusObj of value.statuses) {
            const externalMsgId = statusObj.id;
            const status = statusObj.status; // "delivered", "read", "sent", "failed"
            if (externalMsgId && status) {
              if (status === "delivered") {
                await pool.query("UPDATE messages SET delivered_at = NOW() WHERE external_msg_id = ?", [externalMsgId]);
              } else if (status === "read") {
                await pool.query("UPDATE messages SET read_at = NOW(), is_read = 1 WHERE external_msg_id = ?", [externalMsgId]);
              }
            }
          }
        }

        const messages = value?.messages;
        if (!messages || !Array.isArray(messages) || messages.length === 0) continue;

        // Build contact map for profile names
        const contactMap = {};
        if (Array.isArray(value?.contacts)) {
          for (const c of value.contacts) {
            if (c.wa_id) contactMap[c.wa_id] = c.profile?.name;
          }
        }

        for (const msg of messages) {
          const externalId = msg.from; // sender's WA phone number
          const externalMsgId = msg.id;
          const msgType = (msg.type || "text").toUpperCase();
          let mediaUrl = null;

          let msgBody = "";
          if (msg.type === "text") {
            msgBody = msg.text?.body || "";
          } else if (msg.type === "button") {
            msgBody = msg.button?.text || "";
          } else if (msg.type === "interactive") {
            const type = msg.interactive?.type;
            if (type === "button_reply") {
              msgBody = msg.interactive?.button_reply?.title || "";
            } else if (type === "list_reply") {
              msgBody = msg.interactive?.list_reply?.title || "";
            }
          } else if (msg.type === "image") {
            msgBody = msg.image?.caption || "";
            mediaUrl = msg.image?.link || msg.image?.url || null;
          } else if (msg.type === "video") {
            msgBody = msg.video?.caption || "";
            mediaUrl = msg.video?.link || msg.video?.url || null;
          } else if (msg.type === "audio" || msg.type === "voice") {
            msgBody = "";
            mediaUrl = msg.audio?.link || msg.audio?.url || msg.voice?.link || null;
          } else if (msg.type === "document") {
            msgBody = msg.document?.filename || "";
            mediaUrl = msg.document?.link || msg.document?.url || null;
          } else {
            msgBody = msg.image?.caption || msg.video?.caption || msg.document?.filename || "";
          }

          const senderName = contactMap[externalId] || value?.contacts?.[0]?.profile?.name || externalId;

          await handleIncomingPayload({
            agencyId,
            integrationId,
            platform: "WHATSAPP",
            externalId,
            externalMsgId,
            msgType: msgType === "INTERACTIVE" || msgType === "BUTTON" ? "TEXT" : msgType,
            msgBody,
            mediaUrl,
            senderName,
            avatar: null,
            integration,
          });
        }
      }
    }
  } catch (err) {
    console.error("WhatsApp Webhook processing error:", err);
  }
}

// ─── HELPER: PROCESS COMMENT AUTOMATION (FB PAGE & INSTAGRAM) ────────────────
async function processCommentAutomation({ commentId, postId, senderId, senderName, commentText }, platform, agencyId, integrationId, integration) {
  try {
    if (!commentId || !commentText || !integration?.access_token) return;

    console.log(`\n💬 [Comment Automation] Incoming ${platform} comment (${commentId}) on post (${postId}) from ${senderName} (${senderId}): "${commentText}"`);

    // Do not reply to our own comments
    if (senderId && (senderId === integration.fb_page_id || senderId === integration.ig_account_id)) {
      console.log(`[Comment Automation] Skipping own comment from page/account (${senderId})`);
      return;
    }

    // Find all active comment rules for this agency and platform
    const [rules] = await pool.query(
      `SELECT * FROM comment_automation_rules
       WHERE agency_id = ? AND (integration_id = ? OR integration_id IS NULL)
         AND platform = ? AND is_active = 1`,
      [agencyId, integrationId, platform]
    );

    if (!rules.length) {
      console.log(`[Comment Automation] No active comment automation rules found for ${platform} (agency: ${agencyId})`);
      return;
    }

    // 1. Try to find a rule matching the specific post ID
    let selectedRule = null;
    const specificRules = rules.filter(r => r.post_id && r.post_id !== "ALL_POSTS");
    for (const r of specificRules) {
      if (
        r.post_id === postId ||
        (postId && (r.post_id.endsWith(`_${postId}`) || postId.endsWith(`_${r.post_id}`) || r.post_id.includes(postId) || postId.includes(r.post_id)))
      ) {
        selectedRule = r;
        break;
      }
    }

    // 2. Fallback to an ALL_POSTS rule if no post-specific rule was found
    if (!selectedRule) {
      selectedRule = rules.find(r => r.post_id === "ALL_POSTS" || !r.post_id);
    }

    if (!selectedRule) {
      console.log(`[Comment Automation] No matching rule found for post ${postId} on ${platform}`);
      return;
    }

    const rule = selectedRule;
    console.log(`[Comment Automation] 🎯 Matched campaign "${rule.campaign_name}" (Rule ID: ${rule.id}) for post ${rule.post_id}`);

    const lowerComment = commentText.toLowerCase().trim();

    // 1. Check Offensive Keywords Moderation
    if (rule.offensive_keywords && rule.offensive_action !== "NONE") {
      const offensiveList = rule.offensive_keywords.split(",").map(k => k.trim().toLowerCase()).filter(Boolean);
      const isOffensive = offensiveList.some(k => lowerComment.includes(k));

      if (isOffensive) {
        console.log(`[Comment Automation] 🚨 Offensive comment detected on ${platform} (${commentId}): "${commentText}"`);
        if (rule.offensive_action === "HIDE") {
          await axios.post(
            `https://graph.facebook.com/v21.0/${commentId}?is_hidden=true`,
            {},
            { headers: { Authorization: `Bearer ${integration.access_token}` } }
          ).catch(e => console.warn("Hide comment warning:", e.response?.data || e.message));
        } else if (rule.offensive_action === "DELETE") {
          await axios.delete(
            `https://graph.facebook.com/v21.0/${commentId}`,
            { headers: { Authorization: `Bearer ${integration.access_token}` } }
          ).catch(e => console.warn("Delete comment warning:", e.response?.data || e.message));
        }

        if (rule.offensive_reply_message) {
          const privateText = rule.offensive_reply_message
            .replace(/\{\{name\}\}/gi, senderName || "there")
            .replace(/\{\{first_name\}\}/gi, (senderName || "").split(" ")[0] || "there");

          await axios.post(
            `https://graph.facebook.com/v21.0/me/messages`,
            { recipient: { comment_id: commentId }, message: { text: privateText } },
            { headers: { Authorization: `Bearer ${integration.access_token}` } }
          ).catch(e => console.warn("Offensive DM warning:", e.response?.data || e.message));
        }

        await pool.query("UPDATE comment_automation_rules SET total_offensive_moderated = total_offensive_moderated + 1 WHERE id = ?", [rule.id]);
        emitToAgency(agencyId, "comment_automation_updated", { ruleId: rule.id, type: "OFFENSIVE_MODERATED" });
        return; // Halt further processing
      }
    }

    // 2. Check Exclude Keywords
    if (rule.exclude_keywords) {
      const excludeList = rule.exclude_keywords.split(",").map(k => k.trim().toLowerCase()).filter(Boolean);
      if (excludeList.some(k => lowerComment.includes(k))) {
        console.log(`[Comment Automation] Comment contains excluded keyword. Skipping automation.`);
        return;
      }
    }

    // 3. Check Trigger Keywords
    const triggerType = (rule.trigger_type || "ALL").toUpperCase();
    if (triggerType === "KEYWORDS" && rule.trigger_keywords) {
      const keywords = rule.trigger_keywords.split(",").map(k => k.trim().toLowerCase()).filter(Boolean);
      let matched = false;
      if ((rule.match_type || "CONTAINS").toUpperCase() === "EXACT") {
        matched = keywords.includes(lowerComment);
      } else {
        matched = keywords.some(k => lowerComment.includes(k));
      }
      if (!matched) {
        console.log(`[Comment Automation] Comment did not match required keywords "${rule.trigger_keywords}". Skipping.`);
        return;
      }
    }

    // 4. Auto-Like Comment (tries Page token, falls back to Page Owner token)
    if (rule.enable_like_comment) {
      const tokensToTry = [integration.access_token, integration.user_access_token].filter(Boolean);
      let liked = false;
      for (const tok of tokensToTry) {
        if (liked) break;
        try {
          await axios.post(
            `https://graph.facebook.com/v21.0/${commentId}/likes`,
            {},
            {
              headers: { Authorization: `Bearer ${tok}` },
              params: { access_token: tok },
            }
          );
          console.log(`[Comment Automation] ❤️ Auto-liked comment (${commentId})`);
          liked = true;
        } catch (e) {
          // If permission error and another token is available, loop continues
        }
      }
      if (!liked) {
        console.warn(`[Comment Automation] Could not like comment (${commentId}) due to permissions.`);
      }
    }

    // 5. Public Comment Reply (with rotating variations, tries Page token, falls back to Page Owner token)
    let replyText = rule.auto_reply_comment || "";
    let variations = [];
    try {
      variations = typeof rule.comment_variations === "string" ? JSON.parse(rule.comment_variations || "[]") : rule.comment_variations || [];
    } catch { variations = []; }

    if (variations.length > 0) {
      const randomVar = variations[Math.floor(Math.random() * variations.length)];
      if (randomVar) replyText = randomVar;
    }

    if (replyText) {
      const formattedReply = replyText
        .replace(/\{\{name\}\}/gi, senderName || "there")
        .replace(/\{\{first_name\}\}/gi, (senderName || "").split(" ")[0] || "there");

      const tokensToTry = [integration.access_token, integration.user_access_token].filter(Boolean);
      let replySuccess = false;

      for (const tok of tokensToTry) {
        if (replySuccess) break;
        try {
          await axios.post(
            `https://graph.facebook.com/v21.0/${commentId}/comments`,
            { message: formattedReply },
            {
              headers: {
                Authorization: `Bearer ${tok}`,
                "Content-Type": "application/json",
              },
              params: { access_token: tok },
            }
          );
          replySuccess = true;
        } catch (postErr) {
          // Try URL encoded params format
          try {
            await axios.post(
              `https://graph.facebook.com/v21.0/${commentId}/comments`,
              null,
              {
                params: {
                  message: formattedReply,
                  access_token: tok,
                },
              }
            );
            replySuccess = true;
          } catch (postErr2) {}
        }
      }

      if (replySuccess) {
        await pool.query("UPDATE comment_automation_rules SET total_comment_replies = total_comment_replies + 1 WHERE id = ?", [rule.id]);
        console.log(`[Comment Automation] ✅ Public comment reply sent on ${platform} (${commentId}): "${formattedReply}"`);
      } else {
        console.warn(`[Comment Automation] Public reply could not be sent for (${commentId}) due to token permissions.`);
      }
    }

    // 6. Private DM Reply
    if (rule.auto_reply_private_message) {
      const formattedPrivate = rule.auto_reply_private_message
        .replace(/\{\{name\}\}/gi, senderName || "there")
        .replace(/\{\{first_name\}\}/gi, (senderName || "").split(" ")[0] || "there");

      try {
        await axios.post(
          `https://graph.facebook.com/v21.0/me/messages`,
          { recipient: { comment_id: commentId }, message: { text: formattedPrivate } },
          { headers: { Authorization: `Bearer ${integration.access_token}` } }
        );
        await pool.query("UPDATE comment_automation_rules SET total_private_replies = total_private_replies + 1 WHERE id = ?", [rule.id]);
        console.log(`[Comment Automation] 📩 Private DM reply sent on ${platform} to ${senderName} (${commentId})`);
      } catch (e) {
        console.error("[Comment Automation] ❌ Private DM reply failed:", JSON.stringify(e.response?.data || e.message, null, 2));
      }
    }

    emitToAgency(agencyId, "comment_automation_updated", { ruleId: rule.id, type: "REPLIED" });
  } catch (err) {
    console.error("Comment automation processor error:", err);
  }
}

async function handleFacebookPayload(body, agencyId, integrationId, integration) {
  try {
    const entries = body?.entry || [];
    for (const entry of entries) {
      // 1. Check for Feed Changes (Comments on Posts)
      const changes = entry?.changes || [];
      for (const change of changes) {
        if (change.field === "feed") {
          const val = change.value;
          if (val && val.item === "comment" && (val.verb === "add" || val.verb === "edit")) {
            await processCommentAutomation({
              commentId: val.comment_id,
              postId: val.post_id || val.parent_id,
              senderId: val.from?.id || val.sender_id,
              senderName: val.from?.name || val.sender_name || "there",
              commentText: val.message || "",
            }, "FACEBOOK", agencyId, integrationId, integration);
          }
        }
      }

      // 2. Direct Messages
      const messaging = entry?.messaging || [];
      for (const event of messaging) {
        if (!event.message && !event.postback) continue;
        if (event.message?.is_echo) continue;

        const externalId = event.sender?.id;
        let externalMsgId = event.message?.mid || event.timestamp?.toString();
        let msgBody = "";
        let msgType = "TEXT";
        let mediaUrl = null;

        if (event.postback) {
          msgBody = event.postback.title || event.postback.payload || "";
        } else {
          msgBody = event.message?.quick_reply?.payload || event.message?.text || "";
          if (event.message?.attachments && event.message.attachments.length > 0) {
            const att = event.message.attachments[0];
            const attType = (att.type || "image").toUpperCase();
            msgType = attType === "VIDEO" ? "VIDEO" : (attType === "AUDIO" ? "AUDIO" : "IMAGE");
            mediaUrl = att.payload?.url || null;
          }
        }

        // Fetch real subscriber name and profile pic from Facebook Graph API
        let senderName = externalId;
        let avatar = null;
        if (integration?.access_token) {
          const profile = await fetchMetaUserProfile("FACEBOOK", externalId, integration.access_token);
          if (profile.name) senderName = profile.name;
          if (profile.avatar) avatar = profile.avatar;
        }

        await handleIncomingPayload({
          agencyId,
          integrationId,
          platform: "FACEBOOK",
          externalId,
          externalMsgId,
          msgType,
          msgBody,
          mediaUrl,
          senderName,
          avatar,
          integration,
        });
      }
    }
  } catch (err) {
    console.error("Facebook Webhook processing error:", err);
  }
}

async function handleInstagramPayload(body, agencyId, integrationId, integration) {
  try {
    const entries = body?.entry || [];
    for (const entry of entries) {
      // 1. Check for Instagram Comments Changes
      const changes = entry?.changes || [];
      for (const change of changes) {
        if (change.field === "comments") {
          const val = change.value;
          if (val && val.id) {
            await processCommentAutomation({
              commentId: val.id,
              postId: val.media?.id,
              senderId: val.from?.id,
              senderName: val.from?.username || "there",
              commentText: val.text || "",
            }, "INSTAGRAM", agencyId, integrationId, integration);
          }
        }
      }

      // 2. Direct Messages
      const messaging = entry?.messaging || [];
      for (const event of messaging) {
        if (!event.message && !event.postback) continue;

        const externalId = event.sender?.id;
        let externalMsgId = event.message?.mid || event.timestamp?.toString();
        let msgBody = "";
        let msgType = "TEXT";
        let mediaUrl = null;

        if (event.postback) {
          msgBody = event.postback.title || event.postback.payload || "";
        } else {
          msgBody = event.message?.quick_reply?.payload || event.message?.text || "";
          if (event.message?.attachments && event.message.attachments.length > 0) {
            const att = event.message.attachments[0];
            const attType = (att.type || "image").toUpperCase();
            msgType = attType === "VIDEO" ? "VIDEO" : (attType === "AUDIO" ? "AUDIO" : "IMAGE");
            mediaUrl = att.payload?.url || null;
          }
        }

        // Fetch subscriber name and profile pic from Instagram
        let senderName = externalId;
        let avatar = null;
        if (integration?.access_token) {
          const profile = await fetchMetaUserProfile("INSTAGRAM", externalId, integration.access_token);
          if (profile.name) senderName = profile.name;
          if (profile.avatar) avatar = profile.avatar;
        }

        await handleIncomingPayload({
          agencyId,
          integrationId,
          platform: "INSTAGRAM",
          externalId,
          externalMsgId,
          msgType,
          msgBody,
          mediaUrl,
          senderName,
          avatar,
          integration,
        });
      }
    }
  } catch (err) {
    console.error("Instagram Webhook processing error:", err);
  }
}

// ─── RECEIVE META INCOMING MESSAGES (POST) ──────────────────────────────────
router.post("/webhook/:agencyId/:integrationId", async (req, res) => {
  const { agencyId, integrationId } = req.params;
  const body = req.body;

  // Always respond 200 immediately to Meta
  res.sendStatus(200);

  try {
    const [integRows] = await pool.query(
      "SELECT * FROM integrations WHERE id = ? AND agency_id = ? AND is_active = 1",
      [integrationId, agencyId]
    );
    if (!integRows.length) return;
    const integration = integRows[0];

    if (integration.platform === "WHATSAPP") {
      return handleWhatsAppPayload(body, agencyId, integrationId, integration);
    } else if (integration.platform === "FACEBOOK") {
      return handleFacebookPayload(body, agencyId, integrationId, integration);
    } else if (integration.platform === "INSTAGRAM") {
      return handleInstagramPayload(body, agencyId, integrationId, integration);
    }
  } catch (err) {
    console.error("Meta Webhook processing error:", err);
  }
});

// ─── RECEIVE TELEGRAM INCOMING MESSAGES (POST) ──────────────────────────────
router.post("/webhook/telegram/:agencyId/:integrationId", async (req, res) => {
  const { agencyId, integrationId } = req.params;
  const update = req.body;

  // Always respond 200 immediately to Telegram
  res.sendStatus(200);

  try {
    const [integRows] = await pool.query(
      "SELECT * FROM integrations WHERE id = ? AND agency_id = ? AND is_active = 1",
      [integrationId, agencyId]
    );
    if (!integRows.length) return;
    const integration = integRows[0];

    const messageObj = update.message || update.callback_query?.message;
    if (!messageObj) return;

    const externalId = messageObj.chat?.id?.toString();
    const externalMsgId = (update.message?.message_id || update.callback_query?.id)?.toString();
    
    let msgBody = "";
    let msgType = "TEXT";

    if (update.callback_query) {
      msgBody = update.callback_query.data || "";
    } else {
      msgBody = update.message?.text || "";
      if (update.message?.photo) {
        msgType = "IMAGE";
        msgBody = update.message.caption || "[Photo]";
      }
    }

    const senderName = update.message?.from?.first_name || update.callback_query?.from?.first_name || externalId;

    await handleIncomingPayload({
      agencyId,
      integrationId,
      platform: "TELEGRAM",
      externalId,
      externalMsgId,
      msgType,
      msgBody,
      senderName,
      avatar: null,
      integration,
    });
  } catch (err) {
    console.error("Telegram Webhook processing error:", err);
  }
});

// ─── TIKTOK WEBHOOK VERIFICATION (GET) ───────────────────────────
router.get(["/webhook/tiktok/:agencyId", "/webhook/tiktok/:agencyId/:integrationId"], async (req, res) => {
  const challenge = req.query.challenge || req.query["hub.challenge"] || req.query.echostr;
  const token = req.query.token || req.query["hub.verify_token"];
  console.log(`[TikTok Webhook] Verification on /webhook/tiktok/${req.params.agencyId}:`, { challenge, token });

  if (challenge) {
    return res.send(challenge);
  }
  return res.json({ status: "ok", message: "TikTok webhook endpoint ready" });
});

// ─── RECEIVE TIKTOK INCOMING EVENTS (POST) ───────────────────────
router.post(["/webhook/tiktok/:agencyId", "/webhook/tiktok/:agencyId/:integrationId"], async (req, res) => {
  // Always respond 200 immediately to TikTok
  res.status(200).json({ status: "ok" });

  try {
    const agencyId = Number(req.params.agencyId);
    let integrationId = req.params.integrationId ? Number(req.params.integrationId) : null;

    let [integs] = [];
    if (integrationId) {
      [integs] = await pool.query("SELECT * FROM integrations WHERE id = ? AND platform = 'TIKTOK'", [integrationId]);
    }
    if (!integs || !integs.length) {
      [integs] = await pool.query("SELECT * FROM integrations WHERE agency_id = ? AND platform = 'TIKTOK' AND is_active = 1 LIMIT 1", [agencyId]);
    }
    const integration = integs?.[0] || null;
    if (!integration) return;
    integrationId = integration.id;

    const payload = req.body || {};
    const eventType = payload.event || payload.type || "message";
    const msgData = payload.data || payload.content || payload;

    const externalId = msgData.from_user_id || msgData.open_id || msgData.sender_id || payload.open_id || "tiktok_user";
    const externalMsgId = msgData.message_id || payload.msg_id || `tt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const msgBody = msgData.text || msgData.content || msgData.message || (typeof payload === 'string' ? payload : '');
    const senderName = msgData.nickname || msgData.user_name || "TikTok User";
    const avatar = msgData.avatar_url || null;

    if (!msgBody) return;

    await handleIncomingPayload({
      agencyId,
      integrationId,
      platform: "TIKTOK",
      externalId,
      externalMsgId,
      msgType: "TEXT",
      msgBody,
      senderName,
      avatar,
      integration,
    });
  } catch (err) {
    console.error("[TikTok Webhook processing error]:", err);
  }
});

/**
 * Handle incoming message payload, process flows, match bot rules, and notify socket
 */
async function handleIncomingPayload({
  agencyId,
  integrationId,
  platform,
  externalId,
  externalMsgId,
  msgType,
  msgBody,
  mediaUrl,
  senderName,
  avatar = null,
  integration,
}) {
  // 1. Prevent duplicate messages
  const isDup = await isDuplicateMessage(externalMsgId);
  if (isDup) return;

  // 2. Find or create contact with real name and avatar
  const contact = await findOrCreateContact(
    agencyId,
    platform,
    externalId,
    senderName,
    platform === "WHATSAPP" ? externalId : null,
    avatar
  );

  // 3. Find or create conversation
  const { conversation, isNew } = await findOrCreateConversation(agencyId, contact.id, integrationId, platform);

  // 4. Save incoming message with mediaUrl
  const message = await saveMessage(conversation.id, "INBOUND", msgType, msgBody, externalMsgId, mediaUrl);

  // Emit socket event to notify agents of new message/conversation
  emitToAgency(agencyId, "new_message", {
    conversationId: conversation.id,
    message,
  });
  emitToConversation(conversation.id, "new_message", {
    conversationId: conversation.id,
    message,
  });

  if (isNew) {
    emitToAgency(agencyId, "new_conversation", {
      conversation,
    });
  }

  // 5. Run Flow Execution Engine
  const flowRan = await processFlow(agencyId, platform, conversation, contact, msgBody, integration);
  if (flowRan) return;

  // 6. Fallback: Run standard bot rules
  await matchBotRules(agencyId, platform, conversation, contact, msgBody, integration);
}

export default router;

