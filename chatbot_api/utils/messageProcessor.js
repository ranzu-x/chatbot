import pool from "../db.js";
import { sendPlatformMessage } from "./platformSender.js";
import { emitToAgency, emitToConversation } from "./socket.js";
import { logBotError, extractErrorMessage } from "./botLogger.js";
import { assertLimit } from "./entitlements.js";
import { broadcastAgentAlert } from "../services/notificationService.js";

/**
 * Find or create a Contact in DB.
 *
 * Subscriber-limit enforcement (max_subscribers, reseller-pool aware via
 * utils/entitlements.js's assertLimit — the same engine every other limit in
 * this app uses) only applies to a genuinely NEW contact, never to one
 * already found — an existing subscriber can never be locked out of their
 * own conversation. When a brand-new inbound message would push the agency
 * over its limit, the contact and message are still always created and
 * saved (a customer's first message is never dropped just because billing
 * caught up with them — see routes/webhook.js/webchat.js, which still call
 * saveMessage() right after this regardless), but the new contact is
 * created already bot_paused — reusing the exact same flag every existing
 * bot/AI check (flowEngine.js, this file's matchBotRules, aiReplyEngine.js)
 * already honors — so only a human agent can reply until the agency
 * upgrades. The agency is notified in real time via the existing
 * agent:alert mechanism.
 */
export async function findOrCreateContact(agencyId, platform, externalId, name, phone, avatar = null, platformProfile = null) {
  const [existingContact] = await pool.query(
    "SELECT * FROM contacts WHERE agency_id = ? AND platform = ? AND external_id = ?",
    [agencyId, platform, externalId]
  );
  if (existingContact.length) {
    const contact = existingContact[0];
    const isIdName = !contact.name || contact.name === externalId || /^\d+$/.test(contact.name);
    const hasBetterName = name && name !== externalId && !/^\d+$/.test(name);
    const hasNewAvatar = avatar && avatar !== contact.avatar;

    if ((isIdName && hasBetterName) || hasNewAvatar) {
      const updatedName = hasBetterName ? name : contact.name;
      const updatedAvatar = avatar || contact.avatar;
      await pool.query(
        "UPDATE contacts SET name = ?, avatar = COALESCE(?, avatar), phone = COALESCE(?, phone) WHERE id = ?",
        [updatedName, updatedAvatar, phone || null, contact.id]
      );
      contact.name = updatedName;
      contact.avatar = updatedAvatar;
    }

    // Merge in any freshly-fetched "System Fields" (read-only channel profile data)
    // rather than overwrite wholesale — a later fetch that came back with fewer
    // fields (e.g. a permission was revoked) shouldn't erase what we already had.
    if (platformProfile && Object.values(platformProfile).some((v) => v !== null && v !== undefined)) {
      let existingProfile = {};
      try {
        existingProfile = typeof contact.platform_profile === "string"
          ? JSON.parse(contact.platform_profile || "{}")
          : (contact.platform_profile || {});
      } catch { existingProfile = {}; }
      const merged = { ...existingProfile, ...Object.fromEntries(Object.entries(platformProfile).filter(([, v]) => v !== null && v !== undefined)) };
      await pool.query("UPDATE contacts SET platform_profile = ? WHERE id = ?", [JSON.stringify(merged), contact.id]);
      contact.platform_profile = merged;
    }

    return contact;
  }

  let overLimit = false;
  try {
    await assertLimit(agencyId, "max_subscribers", 1, null);
  } catch {
    overLimit = true;
  }

  const [newContact] = await pool.query(
    "INSERT INTO contacts (agency_id, platform, external_id, name, avatar, phone, platform_profile, bot_paused, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())",
    [agencyId, platform, externalId, name || externalId, avatar || null, phone || null, platformProfile ? JSON.stringify(platformProfile) : null, overLimit ? 1 : 0]
  );

  const [createdContact] = await pool.query("SELECT * FROM contacts WHERE id = ?", [newContact.insertId]);
  const contact = createdContact[0];
  contact._overLimit = overLimit; // non-persisted hint for findOrCreateConversation, below

  if (overLimit) {
    console.warn(`[Subscriber Limit] Tenant ${agencyId} is over its subscriber limit — new contact ${contact.id} (${platform}) created with Bot/AI paused.`);
    broadcastAgentAlert({
      agencyId,
      title: "Subscriber limit reached",
      body: `${name || externalId} just messaged in, but you're at your plan's subscriber limit. Bot/AI replies are paused for them until you upgrade — a human agent can still reply.`,
      eventType: "SUBSCRIBER_LIMIT_REACHED",
      channel: platform,
    }).catch(() => {}); // best-effort — must never block message ingestion
  }

  return contact;
}


/**
 * Find or create an open Conversation in DB. `contactOverLimit` (pass
 * `contact._overLimit` from findOrCreateContact, above) stamps a brand-new
 * conversation as already bot_paused/OVER_LIMIT so the Live Inbox shows why
 * — an existing conversation is never touched by this, only a new one.
 */
export async function findOrCreateConversation(agencyId, contactId, integrationId, platform, contactOverLimit = false) {
  const [existingConv] = await pool.query(
    `SELECT * FROM conversations
     WHERE agency_id = ? AND contact_id = ? AND integration_id = ? AND status != 'RESOLVED'
     LIMIT 1`,
    [agencyId, contactId, integrationId]
  );

  if (existingConv.length) {
    const conversation = existingConv[0];
    await pool.query(
      "UPDATE conversations SET unread_count = unread_count + 1, last_message_at = NOW(), last_inbound_at = NOW() WHERE id = ?",
      [conversation.id]
    );
    conversation.unread_count += 1;
    conversation.last_message_at = new Date();
    conversation.last_inbound_at = new Date();
    return { conversation, isNew: false };
  }

  // A RESOLVED conversation this subscriber has never written in — an
  // imported subscriber's placeholder, or a broadcast-only chat
  // (broadcastRunner.js keeps those RESOLVED). Their first reply re-opens it
  // so the broadcast they're answering stays in the same thread. A resolved
  // chat with real history still starts a fresh conversation, as before.
  const [neverReplied] = await pool.query(
    `SELECT * FROM conversations
     WHERE agency_id = ? AND contact_id = ? AND integration_id = ? AND status = 'RESOLVED' AND last_inbound_at IS NULL
     ORDER BY COALESCE(last_message_at, created_at) DESC, id DESC
     LIMIT 1`,
    [agencyId, contactId, integrationId]
  );
  if (neverReplied.length) {
    const conversation = neverReplied[0];
    await pool.query(
      "UPDATE conversations SET status = 'OPEN', unread_count = unread_count + 1, last_message_at = NOW(), last_inbound_at = NOW() WHERE id = ?",
      [conversation.id]
    );
    conversation.status = "OPEN";
    conversation.unread_count += 1;
    conversation.last_message_at = new Date();
    conversation.last_inbound_at = new Date();
    // isNew: to the Inbox this is a chat it has never listed as active, so
    // callers treat it like a brand-new conversation (new_conversation event,
    // welcome/auto-assign rules).
    return { conversation, isNew: true };
  }

  const [newConv] = await pool.query(
    `INSERT INTO conversations (agency_id, contact_id, integration_id, status, unread_count, last_message_at, last_inbound_at, bot_paused, pause_reason, created_at)
     VALUES (?, ?, ?, 'OPEN', 1, NOW(), NOW(), ?, ?, NOW())`,
    [agencyId, contactId, integrationId, contactOverLimit ? 1 : 0, contactOverLimit ? "OVER_LIMIT" : null]
  );

  const [createdConv] = await pool.query("SELECT * FROM conversations WHERE id = ?", [newConv.insertId]);
  return { conversation: createdConv[0], isNew: true };
}

/**
 * Check if message is already saved (duplicate check)
 */
export async function isDuplicateMessage(externalMsgId) {
  if (!externalMsgId) return false;
  const [rows] = await pool.query("SELECT id FROM messages WHERE external_msg_id = ?", [externalMsgId]);
  return rows.length > 0;
}

/**
 * Save incoming/outgoing message in DB
 */
export async function saveMessage(conversationId, direction, type, body, externalMsgId, mediaUrl = null, metadata = null) {
  const metadataJson = metadata ? (typeof metadata === "string" ? metadata : JSON.stringify(metadata)) : null;
  const [msgResult] = await pool.query(
    `INSERT INTO messages (conversation_id, direction, type, body, media_url, metadata, external_msg_id, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [conversationId, direction, type, body || "", mediaUrl || null, metadataJson, externalMsgId || null, direction === "INBOUND" ? 0 : 1]
  );

  const [savedMsg] = await pool.query("SELECT * FROM messages WHERE id = ?", [msgResult.insertId]);
  const msg = savedMsg[0];
  if (metadata) {
    msg.metadata = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
  }
  return msg;
}

/**
 * Match keyword-based bot auto-reply rules and send response if matched
 */
export async function matchBotRules(agencyId, platform, conversation, contact, incomingMsgBody, integration, msgType = "TEXT") {
  try {
    // Check if bot is paused for this conversation or contact
    if (conversation?.bot_paused || contact?.bot_paused) {
      console.log(`🤖 [Bot Matcher] Bot is paused for conversation ${conversation?.id} or contact ${contact?.id}`);
      return false;
    }

    // Message credit limit — checked once here, before any auto-reply is
    // dispatched, rather than at every individual sendPlatformMessage call
    // site below (fallback reply, keyword match, AI reply). Same silent
    // skip-and-log posture as the subscriber-limit check above (a bot reply
    // being skipped must never crash inbound message ingestion).
    try {
      await assertLimit(agencyId, "max_monthly_messages", 1, null);
    } catch {
      console.warn(`[Message Credit Limit] Tenant ${agencyId} is over its monthly message limit — skipping bot auto-reply.`);
      return false;
    }

    const textBody = (incomingMsgBody || "").trim().toLowerCase();
    const upperMsgType = (msgType || "TEXT").toUpperCase();
    const isMedia = ["IMAGE", "VIDEO", "AUDIO", "VOICE", "DOCUMENT", "FILE"].includes(upperMsgType);
    const integrationId = integration?.id || conversation?.integration_id;
    console.log(`🤖 [Bot Matcher] Checking rules for tenant=${agencyId}, platform=${platform}, type=${upperMsgType}, text="${textBody}"`);
    
    // Find active bot: prioritized by specific integration_id, then platform fallback
    const [bots] = await pool.query(
      `SELECT * FROM bots 
       WHERE agency_id = ? AND (integration_id = ? OR platform = ?) AND is_active = 1 
       ORDER BY (integration_id IS NOT NULL AND integration_id = ?) DESC, id DESC 
       LIMIT 1`,
      [agencyId, integrationId || 0, platform, integrationId || 0]
    );

    if (!bots.length) {
      console.log(`🤖 [Bot Matcher] No active bot found for tenant=${agencyId}, platform=${platform}`);
      return false;
    }
    const bot = bots[0];
    console.log(`🤖 [Bot Matcher] Using bot "${bot.name}" (ID: ${bot.id})`);

    // Find rules sorted by sort_order
    const [rules] = await pool.query(
      "SELECT * FROM bot_rules WHERE bot_id = ? ORDER BY sort_order ASC",
      [bot.id]
    );

    // ── Handle Media Without Text Caption ──────────────────────────
    if (isMedia && !textBody) {
      console.log(`🤖 [Bot Matcher] 📎 Received ${upperMsgType} without text caption. Skipping text keyword matching.`);
      
      // Check for Fallback rule (trigger_keyword is 'FALLBACK' or 'DEFAULT' or '*') or away_message
      const fallbackRule = rules.find((r) => {
        const kw = (r.trigger_keyword || "").trim().toUpperCase();
        return kw === "FALLBACK" || kw === "DEFAULT" || kw === "*";
      });
      const fallbackReply = fallbackRule?.reply_message || bot.away_message || null;

      if (fallbackReply) {
        console.log(`🤖 [Bot Matcher] Executing fallback bot response for media: "${fallbackReply}"`);
        let externalMsgId = null;
        try {
          externalMsgId = await sendPlatformMessage(platform, integration, contact.external_id, {
            type: "TEXT",
            body: fallbackReply,
          });
        } catch (apiErr) {
          console.error("API bot fallback reply failed:", apiErr.message || apiErr);
          await logBotError({
            agencyId,
            botId: bot?.id || null,
            integrationId: integration?.id || conversation?.integration_id || null,
            platform: platform || "WHATSAPP",
            contactId: contact?.id || conversation?.contact_id || null,
            contactIdentifier: contact?.external_id || contact?.phone || null,
            error: apiErr,
            customMessage: `Bot "${bot.name}" failed to deliver fallback reply: ${extractErrorMessage(apiErr)}`,
          });
        }

        const botMetadata = { senderType: "BOT", senderName: bot.name || "Bot" };
        const [msgResult] = await pool.query(
          `INSERT INTO messages (conversation_id, direction, type, body, metadata, external_msg_id, created_at)
           VALUES (?, 'OUTBOUND', 'TEXT', ?, ?, ?, NOW())`,
          [conversation.id, fallbackReply, JSON.stringify(botMetadata), externalMsgId]
        );

        await pool.query("UPDATE conversations SET last_message_at = NOW() WHERE id = ?", [conversation.id]);
        const [savedMsg] = await pool.query("SELECT * FROM messages WHERE id = ?", [msgResult.insertId]);
        const message = savedMsg[0];
        message.metadata = botMetadata;

        emitToAgency(agencyId, "new_message", { conversationId: conversation.id, message });
        emitToConversation(conversation.id, "new_message", { conversationId: conversation.id, message });
        return true;
      }

      return false; // No false keyword trigger
    }

    if (!rules.length) {
      console.log(`🤖 [Bot Matcher] Bot "${bot.name}" has no rules configured.`);
      return false;
    }

    // ── Keyword Rules Matching ─────────────────────────────────────
    for (const rule of rules) {
      let isMatch = false;
      const triggers = (rule.trigger_keyword || "")
        .toLowerCase()
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      for (const trigger of triggers) {
        if (rule.is_exact_match) {
          if (textBody === trigger) {
            isMatch = true;
            break;
          }
        } else {
          // Contains match: text must be non-empty and must include the keyword
          if (textBody && textBody.includes(trigger)) {
            isMatch = true;
            break;
          }
        }
      }

      if (isMatch) {
        console.log(`🤖 [Bot Matcher] ✅ Match found! Trigger="${rule.trigger_keyword}" -> Reply="${rule.reply_message}"`);
        
        // Send auto-reply via channel
        let externalMsgId = null;
        try {
          externalMsgId = await sendPlatformMessage(platform, integration, contact.external_id, {
            type: "TEXT",
            body: rule.reply_message,
          });
          console.log(`🤖 [Bot Matcher] Reply sent successfully to ${contact.external_id}`);
        } catch (apiErr) {
          console.error("API bot reply failed:", apiErr.message || apiErr);
          await logBotError({
            agencyId,
            botId: bot?.id || null,
            integrationId: integration?.id || conversation?.integration_id || null,
            platform: platform || "WHATSAPP",
            contactId: contact?.id || conversation?.contact_id || null,
            contactIdentifier: contact?.external_id || contact?.phone || null,
            error: apiErr,
            customMessage: `Bot "${bot.name}" failed to deliver reply for trigger "${rule.trigger_keyword}": ${extractErrorMessage(apiErr)}`,
          });
        }

        const botMetadata = { senderType: "BOT", senderName: bot.name || "Bot" };

        // Save bot message to DB
        const [msgResult] = await pool.query(
          `INSERT INTO messages (conversation_id, direction, type, body, metadata, external_msg_id, created_at)
           VALUES (?, 'OUTBOUND', 'TEXT', ?, ?, ?, NOW())`,
          [conversation.id, rule.reply_message, JSON.stringify(botMetadata), externalMsgId]
        );

        // Update conversation last_message_at
        await pool.query(
          "UPDATE conversations SET last_message_at = NOW() WHERE id = ?",
          [conversation.id]
        );

        const [savedMsg] = await pool.query("SELECT * FROM messages WHERE id = ?", [msgResult.insertId]);
        const message = savedMsg[0];
        message.metadata = botMetadata;

        // Emit sockets
        emitToAgency(agencyId, "new_message", {
          conversationId: conversation.id,
          message,
        });
        emitToConversation(conversation.id, "new_message", {
          conversationId: conversation.id,
          message,
        });

        return true; // Reply handled
      }
    }

    console.log(`🤖 [Bot Matcher] No rule trigger matched text: "${textBody}"`);
    return false; // No rule matched
  } catch (err) {
    console.error("Bot matching error:", err);
    await logBotError({
      agencyId,
      integrationId: integration?.id || conversation?.integration_id || null,
      platform: platform || "WHATSAPP",
      contactId: contact?.id || conversation?.contact_id || null,
      contactIdentifier: contact?.external_id || contact?.phone || null,
      error: err,
      customMessage: `Bot rule evaluation failed: ${extractErrorMessage(err)}`,
    });
    return false;
  }
}
