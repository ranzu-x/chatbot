/**
 * HTTP API Campaigns — the actual outbound call. Resolves {{field_key}}
 * templates in the campaign's url/headers/body via flowEngine.js's own
 * replaceVariables (same {{...}} syntax used for message text everywhere
 * else in the app, so campaign authors don't learn a second templating
 * syntax), sends the request via axios (the only outbound HTTP client used
 * anywhere in this codebase), and — if the campaign has response_mappings —
 * extracts values from the JSON response and writes them onto the contact's
 * custom fields, mirroring flowEngine.js's own collectInput write pattern
 * exactly (same INSERT ... ON DUPLICATE KEY UPDATE, same
 * contact_custom_field_updated socket event).
 *
 * Never throws — every caller (the manual "Test" button, and the Flow
 * Builder's "httpApi" node) gets a result object back, matching the
 * established convention in webhookExecutor.js/outboundWebhook.js: an
 * outbound HTTP failure must never block a subscriber's flow or a test
 * request in the UI.
 */
import axios from "axios";
import pool from "../db.js";
import { emitToAgency } from "../utils/socket.js";

const MAX_LOG_BODY_LENGTH = 4000;

function truncate(value) {
  if (value === null || value === undefined) return null;
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return str.length > MAX_LOG_BODY_LENGTH ? str.slice(0, MAX_LOG_BODY_LENGTH) + "…" : str;
}

/** Reads a dot-path (e.g. "data.user.name" or "items.0.price") out of a parsed JSON object. */
function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  return path.split(".").reduce((acc, key) => (acc === null || acc === undefined ? undefined : acc[key]), obj);
}

/**
 * @param {object} campaign - a row from http_api_campaigns
 * @param {object} opts - { agencyId, contact, variables, replaceVariables, flowId, nodeId }
 *   `replaceVariables` is passed in (rather than imported) to avoid a
 *   circular import between this service and utils/flowEngine.js, which
 *   already exports it and is the only real caller during flow execution;
 *   the manual "Test" route supplies a lightweight equivalent instead.
 */
export async function executeHttpApiCampaign(campaign, opts = {}) {
  const { agencyId, contact = {}, variables = {}, replaceVariables, flowId = null, nodeId = null } = opts;
  const resolve = (text) => (replaceVariables ? replaceVariables(text, variables, contact) : text || "");

  const startedAt = Date.now();
  const url = resolve(campaign.url);
  const method = (campaign.method || "POST").toUpperCase();

  let headers = {};
  try {
    const headersTemplate = typeof campaign.headers_json === "string" ? JSON.parse(campaign.headers_json || "{}") : (campaign.headers_json || {});
    for (const [key, value] of Object.entries(headersTemplate)) {
      headers[key] = resolve(String(value));
    }
  } catch {
    headers = {};
  }

  let bodyPayload;
  const resolvedBodyStr = campaign.body_template ? resolve(campaign.body_template) : null;
  if (resolvedBodyStr && method !== "GET") {
    try { bodyPayload = JSON.parse(resolvedBodyStr); }
    catch { bodyPayload = resolvedBodyStr; } // not valid JSON — send as raw text
  }

  let result = { success: false, status: null, responseBody: null, updatedFields: [], errorMessage: null };

  try {
    const axiosConfig = {
      method,
      url,
      headers: { "Content-Type": "application/json", ...headers },
      timeout: campaign.timeout_ms || 10000,
      validateStatus: () => true,
    };
    if (method === "GET" || method === "DELETE") {
      // no body on GET/DELETE — nothing further to set
    } else {
      axiosConfig.data = bodyPayload;
    }

    const res = await axios(axiosConfig);
    result.status = res.status;
    result.responseBody = res.data;
    result.success = res.status >= 200 && res.status < 300;

    // Response -> Custom Field mappings (works for any successful response,
    // whether the campaign is conceptually "collecting" or "sending" data —
    // e.g. a SEND campaign whose API replies with an order id worth saving).
    let responseMappings = [];
    try {
      responseMappings = typeof campaign.response_mappings === "string"
        ? JSON.parse(campaign.response_mappings || "[]")
        : (campaign.response_mappings || []);
    } catch { responseMappings = []; }

    if (result.success && Array.isArray(responseMappings) && responseMappings.length && contact?.id) {
      for (const mapping of responseMappings) {
        if (!mapping?.fieldId || !mapping?.jsonPath) continue;
        const value = getByPath(res.data, mapping.jsonPath);
        if (value === undefined) continue;
        const stringValue = typeof value === "string" ? value : JSON.stringify(value);
        try {
          await pool.query(
            `INSERT INTO contact_custom_field_values (contact_id, field_id, value)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = NOW()`,
            [contact.id, mapping.fieldId, stringValue]
          );
          if (mapping.fieldKey) variables[mapping.fieldKey] = stringValue;
          if (agencyId) {
            emitToAgency(agencyId, "contact_custom_field_updated", { contactId: contact.id, fieldId: Number(mapping.fieldId), value: stringValue });
          }
          result.updatedFields.push({ fieldId: mapping.fieldId, value: stringValue });
        } catch (cfErr) {
          console.warn(`[HTTP API Campaign] Failed to save mapped field ${mapping.fieldId}:`, cfErr.message);
        }
      }
    }
  } catch (err) {
    result.errorMessage = err.message;
    console.warn(`[HTTP API Campaign] Request failed for campaign #${campaign.id}:`, err.message);
  }

  const durationMs = Date.now() - startedAt;

  try {
    await pool.query(
      `INSERT INTO http_api_campaign_logs
        (campaign_id, agency_id, flow_id, node_id, contact_id, request_url, request_method, request_headers, request_body, response_status, response_body, is_success, error_message, execution_time_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        campaign.id, agencyId || campaign.agency_id, flowId, nodeId, contact?.id || null,
        url, method, JSON.stringify(headers), truncate(bodyPayload),
        result.status, truncate(result.responseBody), result.success ? 1 : 0, result.errorMessage, durationMs,
      ]
    );
  } catch (logErr) {
    console.warn("[HTTP API Campaign] Failed to write execution log:", logErr.message);
  }

  return { ...result, durationMs };
}
