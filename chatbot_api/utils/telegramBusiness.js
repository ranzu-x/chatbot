import pool from "../db.js";

/**
 * Telegram Business: a Telegram Premium user can connect this bot to their own
 * account (Settings → Telegram Business → Chatbots). The bot then receives
 * their private chats with customers as `business_message` updates and answers
 * on their behalf, with the connection's id on every send.
 *
 * A business chat is stored as its own subscriber with external id
 * "bc:<connection id>:<chat id>" — the same customer may also talk to the bot
 * directly (chat id = their user id), and the two must never be mixed up.
 * platformSender.parseTelegramChatId turns it back into chat_id +
 * business_connection_id.
 */
export function businessExternalId(connectionId, chatId) {
  return `bc:${connectionId}:${chatId}`;
}

/** `business_connection` update: connected, changed rights, or disconnected. */
export async function upsertBusinessConnection(integration, bc) {
  if (!bc?.id || !bc.user?.id) return;
  const name = [bc.user.first_name, bc.user.last_name].filter(Boolean).join(" ") || bc.user.username || String(bc.user.id);
  // Bot API 9.0+: `rights.can_reply`; older servers sent a top-level `can_reply`.
  const canReply = Boolean(bc.rights?.can_reply ?? bc.can_reply);
  await pool.query(
    `INSERT INTO telegram_business_connections (id, integration_id, agency_id, tg_user_id, tg_user_name, user_chat_id, can_reply, is_enabled, rights, connected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?))
     ON DUPLICATE KEY UPDATE tg_user_name = VALUES(tg_user_name), can_reply = VALUES(can_reply), is_enabled = VALUES(is_enabled), rights = VALUES(rights)`,
    [
      bc.id, integration.id, integration.agency_id, bc.user.id, name.slice(0, 255), bc.user_chat_id || null,
      canReply ? 1 : 0, bc.is_enabled ? 1 : 0, JSON.stringify(bc.rights || null), Number(bc.date) || Math.floor(Date.now() / 1000),
    ]
  );
  console.log(`[Telegram Business] ${bc.is_enabled ? "Connected" : "Disconnected"}: ${name} (bot #${integration.id}, can reply: ${canReply})`);
}

/**
 * Should the bot handle this business message? Returns the connection row,
 * or null for: an unknown / disabled connection, a connection without reply
 * rights, or a message the business owner wrote themselves.
 */
export async function resolveBusinessMessage(integration, message) {
  const connId = message?.business_connection_id;
  if (!connId) return null;
  const [[conn]] = await pool.query(
    "SELECT * FROM telegram_business_connections WHERE id = ? AND integration_id = ?",
    [connId, integration.id]
  );
  if (!conn || !conn.is_enabled) return null;
  if (message.from?.id && String(message.from.id) === String(conn.tg_user_id)) return null; // the owner typing in their own chat
  return conn;
}

export async function listBusinessConnections(agencyId, integrationId) {
  const [rows] = await pool.query(
    `SELECT id, tg_user_name, can_reply, is_enabled, connected_at, updated_at
     FROM telegram_business_connections WHERE agency_id = ? AND integration_id = ? ORDER BY updated_at DESC`,
    [agencyId, integrationId]
  );
  return rows;
}
