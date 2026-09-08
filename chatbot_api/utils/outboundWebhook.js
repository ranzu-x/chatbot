/**
 * Outbound webhook sender — used by User Input Flow completions to POST the
 * collected answers to a customer-provided URL.
 *
 * A slow or broken third-party endpoint must never block a subscriber's flow
 * from completing, so this never throws — failures are logged to
 * bot_error_logs (the same place every other delivery failure in this app
 * lands) and the caller just gets back a boolean.
 */
import axios from "axios";
import { logBotError } from "./botLogger.js";

const TIMEOUT_MS = 8000;

/**
 * @param {string} url - customer-provided destination
 * @param {object} payload - JSON body to send
 * @param {object} logContext - { agencyId, flowId, contactId, contactIdentifier } for error logging
 * @returns {Promise<boolean>} true if the endpoint responded with a 2xx
 */
export async function sendWebhook(url, payload, logContext = {}) {
  if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url.trim())) {
    return false;
  }

  try {
    const res = await axios.post(url.trim(), payload, {
      timeout: TIMEOUT_MS,
      headers: { "Content-Type": "application/json" },
      validateStatus: () => true, // handle non-2xx ourselves below
    });

    if (res.status >= 200 && res.status < 300) {
      return true;
    }

    await logBotError({
      agencyId: logContext.agencyId,
      flowId: logContext.flowId || null,
      contactId: logContext.contactId || null,
      contactIdentifier: logContext.contactIdentifier || null,
      platform: logContext.platform || "WHATSAPP",
      customMessage: `User Input Flow webhook to ${url} returned HTTP ${res.status}.`,
    });
    return false;
  } catch (err) {
    await logBotError({
      agencyId: logContext.agencyId,
      flowId: logContext.flowId || null,
      contactId: logContext.contactId || null,
      contactIdentifier: logContext.contactIdentifier || null,
      platform: logContext.platform || "WHATSAPP",
      error: err,
      customMessage: `User Input Flow webhook to ${url} failed: ${err.code === "ECONNABORTED" ? "timed out" : err.message}.`,
    });
    return false;
  }
}
