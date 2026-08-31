import axios from "axios";
import pool from "../db.js";

// ─── EXECUTE OUTBOUND WEBHOOK (FROM FLOW NODE) ──────────────────────────────
export async function executeOutboundWebhook({
  agencyId,
  flowId = null,
  nodeId = null,
  subscriber = {},
  url,
  method = "POST",
  customHeaders = {},
  payloadMode = "ALL_VARIABLES",
  customPayload = null,
}) {
  if (!url || !url.trim()) {
    throw new Error("Webhook destination URL is required");
  }

  const startTime = Date.now();
  let finalPayload = {};

  if (payloadMode === "CUSTOM_JSON" && customPayload) {
    try {
      finalPayload = typeof customPayload === "string" ? JSON.parse(customPayload) : customPayload;
    } catch {
      finalPayload = { raw: customPayload };
    }
  } else {
    // Bundle subscriber info & variables
    finalPayload = {
      event: "flow_webhook_trigger",
      timestamp: new Date().toISOString(),
      flowId,
      nodeId,
      subscriber: {
        id: subscriber.id || null,
        name: subscriber.name || null,
        phone: subscriber.phone || null,
        email: subscriber.email || null,
        platform: subscriber.platform || null,
        tags: subscriber.tags || [],
        customFields: subscriber.customFields || {},
      },
    };
  }

  let responseStatus = 0;
  let responseBody = "";
  let isSuccess = false;

  try {
    const config = {
      method: method.toUpperCase(),
      url: url.trim(),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "NexaBot-Flow-Webhook-Engine/1.0",
        ...customHeaders,
      },
      timeout: 12000,
    };

    if (["POST", "PUT", "PATCH"].includes(method.toUpperCase())) {
      config.data = finalPayload;
    } else {
      config.params = finalPayload;
    }

    const response = await axios(config);
    responseStatus = response.status;
    responseBody = typeof response.data === "object" ? JSON.stringify(response.data) : String(response.data || "");
    isSuccess = responseStatus >= 200 && responseStatus < 300;
  } catch (err) {
    responseStatus = err.response?.status || 500;
    responseBody = err.response?.data ? (typeof err.response.data === "object" ? JSON.stringify(err.response.data) : String(err.response.data)) : err.message;
    isSuccess = false;
  }

  const durationMs = Date.now() - startTime;

  // Log in flow_webhook_logs
  if (agencyId) {
    await pool.query(
      `INSERT INTO flow_webhook_logs (
        agency_id, flow_id, node_id, subscriber_id, target_url, http_method, request_payload,
        response_status, response_body, execution_time_ms, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        flowId,
        nodeId,
        subscriber.id || null,
        url.trim(),
        method.toUpperCase(),
        JSON.stringify(finalPayload),
        responseStatus,
        responseBody.slice(0, 2000),
        durationMs,
        isSuccess ? "SUCCESS" : "FAILED",
      ]
    );
  }

  return {
    success: isSuccess,
    status: responseStatus,
    responseBody: responseBody.slice(0, 1000),
    durationMs,
  };
}
