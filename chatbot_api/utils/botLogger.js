import pool from "../db.js";
import { emitToAgency } from "./socket.js";

/**
 * Extract clean, human-readable error summary from various error formats (Meta, Telegram, Axios, JS Error)
 */
export function extractErrorMessage(err) {
  if (!err) return "Unknown error occurred";
  if (typeof err === "string") return err;

  // Meta Cloud API / Facebook Graph API error structure:
  // err.response.data.error = { message: "...", type: "...", code: 131030, ... }
  if (err.response?.data?.error?.message) {
    const metaErr = err.response.data.error;
    const codePrefix = metaErr.code ? `[Code ${metaErr.code}] ` : "";
    return `${codePrefix}${metaErr.message}`;
  }

  // Telegram Bot API error structure:
  // err.response.data = { ok: false, error_code: 403, description: "..." }
  if (err.response?.data?.description) {
    const codePrefix = err.response.data.error_code ? `[Code ${err.response.data.error_code}] ` : "";
    return `${codePrefix}${err.response.data.description}`;
  }

  // Axios or API response message
  if (err.response?.data?.message) {
    return err.response.data.message;
  }

  // Standard JS Error message
  if (err.message) {
    return err.message;
  }

  try {
    return JSON.stringify(err);
  } catch {
    return "Bot response failed";
  }
}

/**
 * Initialize the bot_error_logs table if it does not exist
 */
export async function initBotErrorLogsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bot_error_logs (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        agency_id           INT NOT NULL,
        bot_id              INT NULL,
        flow_id             INT NULL,
        integration_id      INT NULL,
        platform            VARCHAR(50) NOT NULL DEFAULT 'WHATSAPP',
        contact_id          INT NULL,
        contact_identifier  VARCHAR(255) NULL,
        node_id             VARCHAR(100) NULL,
        error_message       TEXT NOT NULL,
        error_details       LONGTEXT NULL,
        created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_agency_created (agency_id, created_at),
        INDEX idx_bot_id (bot_id),
        INDEX idx_flow_id (flow_id),
        INDEX idx_integration_id (integration_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✅ bot_error_logs table ready");
  } catch (err) {
    console.error("Failed to initialize bot_error_logs table:", err.message);
  }
}

/**
 * Log a bot error when a bot is unable to reply
 */
export async function logBotError({
  agencyId,
  botId = null,
  flowId = null,
  integrationId = null,
  platform = "WHATSAPP",
  contactId = null,
  contactIdentifier = null,
  nodeId = null,
  error = null,
  customMessage = null,
}) {
  if (!agencyId) return null;

  try {
    const errorMessage = customMessage || extractErrorMessage(error);

    let errorDetails = null;
    if (error) {
      if (typeof error === "string") {
        errorDetails = error;
      } else {
        const detailsObj = {
          message: error.message || null,
          name: error.name || null,
          code: error.code || null,
          stack: error.stack || null,
          responseData: error.response?.data || null,
          status: error.response?.status || null,
        };
        errorDetails = JSON.stringify(detailsObj);
      }
    }

    const [res] = await pool.query(
      `INSERT INTO bot_error_logs 
        (agency_id, bot_id, flow_id, integration_id, platform, contact_id, contact_identifier, node_id, error_message, error_details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        agencyId,
        botId || null,
        flowId || null,
        integrationId || null,
        (platform || "WHATSAPP").toUpperCase(),
        contactId || null,
        contactIdentifier ? String(contactIdentifier).slice(0, 255) : null,
        nodeId || null,
        errorMessage,
        errorDetails,
      ]
    );

    const logEntry = {
      id: res.insertId,
      agency_id: agencyId,
      bot_id: botId,
      flow_id: flowId,
      integration_id: integrationId,
      platform,
      contact_id: contactId,
      contact_identifier: contactIdentifier,
      node_id: nodeId,
      error_message: errorMessage,
      error_details: errorDetails,
      created_at: new Date().toISOString(),
    };

    // Emit live event to dashboard / BotManager
    try {
      emitToAgency(agencyId, "bot_error", logEntry);
    } catch (sockErr) {
      // Non-blocking socket error
    }

    console.log(`⚠️ [Bot Error Logged] Agency: ${agencyId} | Platform: ${platform} | Message: ${errorMessage}`);
    return logEntry;
  } catch (logErr) {
    console.error("Failed to write to bot_error_logs:", logErr);
    return null;
  }
}
