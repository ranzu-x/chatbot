import pool from "../db.js";
import fs from "fs";
import path from "path";
import axios from "axios";

/**
 * Fetch and permanently store a Telegram user's profile picture
 * @param {string|number} userId - Telegram user ID
 * @param {string} botToken - Telegram Bot Token
 * @returns {Promise<string|null>} - Relative URL /uploads/avatars/tg_xxx.jpg or null
 */
export async function fetchTelegramUserProfilePhoto(userId, botToken) {
  if (!userId || !botToken) return null;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/getUserProfilePhotos?user_id=${userId}&limit=1`,
      { signal: AbortSignal.timeout(6000) }
    );
    const data = await res.json();

    if (data.ok && data.result?.total_count > 0 && data.result.photos?.[0]?.length > 0) {
      const photos = data.result.photos[0];
      // Pick the best quality photo (last in the size variants array)
      const bestPhoto = photos[photos.length - 1];
      const fileId = bestPhoto.file_id;

      const fileRes = await fetch(
        `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`,
        { signal: AbortSignal.timeout(6000) }
      );
      const fileData = await fileRes.json();

      if (fileData.ok && fileData.result?.file_path) {
        return `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
      }
    }
  } catch (err) {
    console.warn(`[Telegram Avatar] Could not fetch photo for ${userId}:`, err.message);
  }
  return null;
}

/**
 * Fetch Meta (Facebook / Instagram) user profile picture
 */
export async function fetchMetaUserProfile(platform, externalId, accessToken) {
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
    console.warn(`[Meta Avatar] Could not fetch profile for ${platform} user ${externalId}:`, err.response?.data?.error?.message || err.message);
  }
  return { name: null, avatar: null };
}

/**
 * Sync and backfill avatars for all channel subscribers in an agency
 */
export async function syncAllSubscribersAvatars(agencyId) {
  let updatedCount = 0;

  try {
    // 1. Get contacts missing avatars
    const [contacts] = await pool.query(
      "SELECT id, platform, external_id, name, avatar FROM contacts WHERE agency_id = ?",
      [agencyId]
    );

    // Get active Telegram bot tokens
    const [tgBots] = await pool.query(
      "SELECT bot_token, integration_id FROM telegram_bots WHERE agency_id = ? AND is_active = 1",
      [agencyId]
    );
    const defaultTgToken = tgBots[0]?.bot_token;

    // Get active Meta integrations
    const [metaIntegs] = await pool.query(
      "SELECT id, platform, access_token FROM integrations WHERE agency_id = ? AND platform IN ('FACEBOOK','INSTAGRAM') AND is_active = 1",
      [agencyId]
    );

    for (const contact of contacts) {
      // If contact already has a working avatar, skip
      if (contact.avatar && contact.avatar.length > 5) continue;

      let newAvatar = null;

      if (contact.platform === "TELEGRAM" && defaultTgToken) {
        newAvatar = await fetchTelegramUserProfilePhoto(contact.external_id, defaultTgToken);
      } else if (contact.platform === "FACEBOOK" || contact.platform === "INSTAGRAM") {
        const integ = metaIntegs.find((i) => i.platform === contact.platform);
        if (integ?.access_token) {
          const prof = await fetchMetaUserProfile(contact.platform, contact.external_id, integ.access_token);
          newAvatar = prof.avatar;
        }
      }

      if (newAvatar) {
        await pool.query("UPDATE contacts SET avatar = ? WHERE id = ?", [newAvatar, contact.id]);
        updatedCount++;
      }
    }
  } catch (err) {
    console.error("[Sync Subscribers Avatars Error]:", err);
  }

  return { updatedCount };
}
