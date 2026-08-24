import pool from "../db.js";
import { sendPlatformMessage } from "./platformSender.js";
import { emitToAgency, emitToConversation } from "./socket.js";

/**
 * Find or create a Contact in DB
 */
export async function findOrCreateContact(agencyId, platform, externalId, name, phone) {
  const [existingContact] = await pool.query(
    "SELECT * FROM contacts WHERE agency_id = ? AND platform = ? AND external_id = ?",
    [agencyId, platform, externalId]
  );
  if (existingContact.length) {
    return existingContact[0];
  }

  const [newContact] = await pool.query(
    "INSERT INTO contacts (agency_id, platform, external_id, name, phone, created_at) VALUES (?, ?, ?, ?, ?, NOW())",
    [agencyId, platform, externalId, name || externalId, phone || null]
  );

  const [createdContact] = await pool.query("SELECT * FROM contacts WHERE id = ?", [newContact.insertId]);
  return createdContact[0];
}

/**
 * Find or create an open Conversation in DB
 */
export async function findOrCreateConversation(agencyId, contactId, integrationId, platform) {
  const [existingConv] = await pool.query(
    `SELECT * FROM conversations 
     WHERE agency_id = ? AND contact_id = ? AND integration_id = ? AND status != 'RESOLVED'
     LIMIT 1`,
    [agencyId, contactId, integrationId]
  );

  if (existingConv.length) {
    const conversation = existingConv[0];
    await pool.query(
      "UPDATE conversations SET unread_count = unread_count + 1, last_message_at = NOW() WHERE id = ?",
      [conversation.id]
    );
    conversation.unread_count += 1;
    conversation.last_message_at = new Date();
    return { conversation, isNew: false };
  }

  const [newConv] = await pool.query(
    `INSERT INTO conversations (agency_id, contact_id, integration_id, status, unread_count, last_message_at, created_at) 
     VALUES (?, ?, ?, 'OPEN', 1, NOW(), NOW())`,
    [agencyId, contactId, integrationId]
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
export async function saveMessage(conversationId, direction, type, body, externalMsgId) {
  const [msgResult] = await pool.query(
    `INSERT INTO messages (conversation_id, direction, type, body, external_msg_id, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [conversationId, direction, type, body, externalMsgId || null, direction === "INBOUND" ? 0 : 1]
  );

  const [savedMsg] = await pool.query("SELECT * FROM messages WHERE id = ?", [msgResult.insertId]);
  return savedMsg[0];
}

/**
 * Match keyword-based bot auto-reply rules and send response if matched
 */
export async function matchBotRules(agencyId, platform, conversation, contact, incomingMsgBody, integration) {
  try {
    const textBody = (incomingMsgBody || "").trim().toLowerCase();
    
    // Find active bot for platform
    const [bots] = await pool.query(
      "SELECT * FROM bots WHERE agency_id = ? AND platform = ? AND is_active = 1 LIMIT 1",
      [agencyId, platform]
    );

    if (!bots.length) return false;
    const bot = bots[0];

    // Find rules sorted by sort_order
    const [rules] = await pool.query(
      "SELECT * FROM bot_rules WHERE bot_id = ? ORDER BY sort_order ASC",
      [bot.id]
    );

    for (const rule of rules) {
      let isMatch = false;
      const trigger = rule.trigger_keyword.toLowerCase().trim();

      if (rule.is_exact_match) {
        isMatch = textBody === trigger;
      } else {
        isMatch = textBody.includes(trigger);
      }

      if (isMatch) {
        console.log(`🤖 Match found for rule: ${rule.trigger_keyword} -> ${rule.reply_message}`);
        
        // Send auto-reply via channel
        let externalMsgId = null;
        try {
          externalMsgId = await sendPlatformMessage(platform, integration, contact.external_id, {
            type: "TEXT",
            body: rule.reply_message,
          });
        } catch (apiErr) {
          console.error("API bot reply failed:", apiErr.message);
        }

        // Save bot message to DB
        const [msgResult] = await pool.query(
          `INSERT INTO messages (conversation_id, direction, type, body, external_msg_id, created_at)
           VALUES (?, 'OUTBOUND', 'TEXT', ?, ?, NOW())`,
          [conversation.id, rule.reply_message, externalMsgId]
        );

        // Update conversation last_message_at
        await pool.query(
          "UPDATE conversations SET last_message_at = NOW() WHERE id = ?",
          [conversation.id]
        );

        const [savedMsg] = await pool.query("SELECT * FROM messages WHERE id = ?", [msgResult.insertId]);
        const message = savedMsg[0];

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

    return false; // No rule matched
  } catch (err) {
    console.error("Bot matching error:", err);
    return false;
  }
}
