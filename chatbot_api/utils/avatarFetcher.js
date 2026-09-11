import pool from "../db.js";
import fs from "fs";
import path from "path";
import axios from "axios";

const AVATAR_DIR = path.join(process.cwd(), "uploads", "avatars");

function ensureAvatarDir() {
  if (!fs.existsSync(AVATAR_DIR)) {
    fs.mkdirSync(AVATAR_DIR, { recursive: true });
  }
}

/**
 * Downloads an avatar image from a remote URL and saves it permanently to disk.
 * Returns the local web-accessible path (e.g. /uploads/avatars/ig_12345.jpg)
 */
export async function downloadAndSaveAvatar(prefix, externalId, remoteUrl) {
  if (!remoteUrl || !externalId) return null;
  try {
    ensureAvatarDir();
    const res = await fetch(remoteUrl, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });
    if (!res.ok) {
      console.warn(`[Avatar Download] HTTP ${res.status} from ${remoteUrl.slice(0, 60)}...`);
      return remoteUrl;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) {
      return remoteUrl;
    }
    const filename = `${prefix}_${externalId}.jpg`;
    const filePath = path.join(AVATAR_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    return `/uploads/avatars/${filename}`;
  } catch (err) {
    console.warn(`[Avatar Download Error] for ${prefix}_${externalId}:`, err.message);
    return remoteUrl;
  }
}

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
        const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
        const localPath = await downloadAndSaveAvatar("tg", userId, downloadUrl);
        return localPath;
      }
    }
  } catch (err) {
    console.warn(`[Telegram Avatar] Could not fetch photo for ${userId}:`, err.message);
  }
  return null;
}

/**
 * Fetch Meta (Facebook / Instagram) user profile picture and save permanently
 */
export async function fetchMetaUserProfile(platform, externalId, accessToken) {
  if (!accessToken || !externalId) return { name: null, avatar: null, systemFields: null };
  try {
    if (platform === "FACEBOOK") {
      const res = await axios.get(
        `https://graph.facebook.com/v21.0/${externalId}?fields=first_name,last_name,name,profile_pic,locale,timezone,gender&access_token=${accessToken}`,
        { timeout: 6000 }
      );
      const name = res.data?.name || `${res.data?.first_name || ""} ${res.data?.last_name || ""}`.trim() || null;
      let avatar = null;
      if (res.data?.profile_pic) {
        avatar = await downloadAndSaveAvatar("fb", externalId, res.data.profile_pic);
      }
      const systemFields = {
        first_name: res.data?.first_name || null,
        last_name: res.data?.last_name || null,
        locale: res.data?.locale || null,
        timezone: res.data?.timezone ?? null,
        gender: res.data?.gender || null,
      };
      return { name, avatar, systemFields };
    } else if (platform === "INSTAGRAM") {
      const res = await axios.get(
        `https://graph.facebook.com/v21.0/${externalId}?fields=name,username,profile_pic,is_verified_user,follower_count&access_token=${accessToken}`,
        { timeout: 6000 }
      );
      const name = res.data?.name || res.data?.username || null;
      let avatar = null;
      if (res.data?.profile_pic) {
        avatar = await downloadAndSaveAvatar("ig", externalId, res.data.profile_pic);
      }
      const systemFields = {
        username: res.data?.username || null,
        is_verified_user: res.data?.is_verified_user ?? null,
        follower_count: res.data?.follower_count ?? null,
      };
      return { name, avatar, systemFields };
    }
  } catch (err) {
    console.warn(`[Meta Avatar] Could not fetch profile for ${platform} user ${externalId}:`, err.response?.data?.error?.message || err.message);
  }
  return { name: null, avatar: null, systemFields: null };
}

/**
 * Sync and backfill avatars for all channel subscribers in an agency
 */
export async function syncAllSubscribersAvatars(agencyId) {
  let updatedCount = 0;

  try {
    ensureAvatarDir();

    // 1. Get contacts
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
      // If contact already has a working local avatar file, skip
      const isLocal = contact.avatar && contact.avatar.startsWith("/uploads/avatars/");
      if (isLocal) {
        const localFile = path.join(process.cwd(), contact.avatar.replace(/^\//, ""));
        if (fs.existsSync(localFile) && fs.statSync(localFile).size > 100) {
          continue;
        }
      }

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

      // If still no newAvatar but contact had an old remote URL, try to download and save it directly
      if (!newAvatar && contact.avatar && (contact.avatar.startsWith("http://") || contact.avatar.startsWith("https://"))) {
        const prefix = contact.platform === "TELEGRAM" ? "tg" : (contact.platform === "INSTAGRAM" ? "ig" : "fb");
        newAvatar = await downloadAndSaveAvatar(prefix, contact.external_id, contact.avatar);
      }

      if (newAvatar && newAvatar !== contact.avatar) {
        await pool.query("UPDATE contacts SET avatar = ? WHERE id = ?", [newAvatar, contact.id]);
        updatedCount++;
      }
    }
  } catch (err) {
    console.error("[Sync Subscribers Avatars Error]:", err);
  }

  return { updatedCount };
}
