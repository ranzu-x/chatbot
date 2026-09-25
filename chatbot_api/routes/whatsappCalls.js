/**
 * WhatsApp Business Calling — business-initiated (outbound) calls from the
 * Live Inbox, per Meta's Cloud API Calling docs
 * (developers.facebook.com/documentation/business-messaging/whatsapp/calling).
 *
 * The actual call audio is real WebRTC between the agent's browser and
 * Meta's calling infrastructure — this file only handles the signaling
 * Meta's REST API expects (SDP offer in, SDP answer out via webhook) plus
 * the call-permission prerequisite. See utils/socket.js's emitToAgency calls
 * for how Meta's async webhook events (the SDP answer, ringing/accepted/
 * rejected, terminate) reach back to the agent's browser tab that placed
 * the call — routes/webhook.js is where those arrive.
 */
import express from "express";
import axios from "axios";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requireModule, requireLimit } from "../utils/entitlements.js";

const router = express.Router();
router.use("/calls", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), requireModule("feature_whatsapp_calling"));

const META_API_VERSION = "v21.0";

// A call always goes out on the SAME WhatsApp number the open conversation
// is already on — never an arbitrary "first active WhatsApp integration"
// pick. An agency can have more than one WhatsApp number connected, and
// picking the wrong one either calls from a number the subscriber doesn't
// recognize or (as found live) can hit a stale/disconnected integration
// entirely unrelated to the one actually in use. integrationId is required
// here, not defaulted — every caller (the Inbox's Call button) always has
// the open conversation's integration_id on hand.
async function getWhatsAppIntegration(agencyId, integrationId) {
  if (!integrationId) return null;
  const [[integration]] = await pool.query(
    "SELECT * FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'WHATSAPP' AND is_active = 1",
    [integrationId, agencyId]
  );
  return integration || null;
}

// ─── GET CALL PERMISSION STATE (cached; pass ?refresh=1 to re-check with Meta) ─
router.get("/calls/permission/:contactId", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [[contact]] = await pool.query("SELECT * FROM contacts WHERE id = ? AND agency_id = ?", [req.params.contactId, agencyId]);
    if (!contact) return res.status(404).json({ success: false, message: "Contact not found" });

    const integration = await getWhatsAppIntegration(agencyId, req.query.integrationId);
    if (!integration) return res.status(400).json({ success: false, message: "This conversation's WhatsApp account is missing or inactive" });

    if (req.query.refresh === "1") {
      try {
        // Exact response shape per Meta's Calling API reference:
        // { permission: { status: "no_permission"|"temporary"|"permanent", expiration_time?: <unix seconds> }, actions: [...] }
        const url = `https://graph.facebook.com/${META_API_VERSION}/${integration.wa_phone_number_id}/call_permissions`;
        const metaRes = await axios.get(url, {
          headers: { Authorization: `Bearer ${integration.access_token}` },
          params: { user_wa_id: contact.external_id },
        });
        const metaStatus = metaRes.data?.permission?.status || "no_permission";
        const isPermanent = metaStatus === "permanent";
        const localStatus = metaStatus === "no_permission" ? "REJECTED" : "GRANTED";
        const expiresAt = metaRes.data?.permission?.expiration_time ? new Date(metaRes.data.permission.expiration_time * 1000) : null;

        await pool.query(
          `INSERT INTO whatsapp_call_permissions (agency_id, contact_id, integration_id, status, is_permanent, expires_at, responded_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE status = VALUES(status), is_permanent = VALUES(is_permanent), expires_at = VALUES(expires_at), responded_at = NOW()`,
          [agencyId, contact.id, integration.id, localStatus, isPermanent ? 1 : 0, expiresAt]
        );
      } catch (refreshErr) {
        console.warn("[WA Calling] permission refresh warning:", refreshErr.response?.data || refreshErr.message);
      }
    }

    const [[row]] = await pool.query("SELECT * FROM whatsapp_call_permissions WHERE contact_id = ?", [contact.id]);
    return res.json({ success: true, permission: row || { status: "UNKNOWN" } });
  } catch (err) {
    console.error("Get call permission error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── REQUEST CALL PERMISSION (interactive message; 1/24h, max 2/7 days per contact) ─
router.post("/calls/permission/:contactId/request", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [[contact]] = await pool.query("SELECT * FROM contacts WHERE id = ? AND agency_id = ?", [req.params.contactId, agencyId]);
    if (!contact) return res.status(404).json({ success: false, message: "Contact not found" });

    const integration = await getWhatsAppIntegration(agencyId, req.body?.integrationId);
    if (!integration) return res.status(400).json({ success: false, message: "This conversation's WhatsApp account is missing or inactive" });

    const [[existing]] = await pool.query("SELECT * FROM whatsapp_call_permissions WHERE contact_id = ?", [contact.id]);
    if (existing?.requested_at) {
      const hoursSince = (Date.now() - new Date(existing.requested_at).getTime()) / 3_600_000;
      if (hoursSince < 24) {
        return res.status(429).json({ success: false, message: "Only one permission request can be sent per 24 hours to this subscriber." });
      }
    }

    const bodyText = req.body?.message?.trim() || "We'd like to call you to help with your query — is that okay?";
    const url = `https://graph.facebook.com/${META_API_VERSION}/${integration.wa_phone_number_id}/messages`;
    await axios.post(url, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: contact.external_id,
      type: "interactive",
      interactive: {
        type: "call_permission_request",
        action: { name: "call_permission_request" },
        body: { text: bodyText },
      },
    }, { headers: { Authorization: `Bearer ${integration.access_token}`, "Content-Type": "application/json" } });

    await pool.query(
      `INSERT INTO whatsapp_call_permissions (agency_id, contact_id, integration_id, status, requested_at)
       VALUES (?, ?, ?, 'PENDING', NOW())
       ON DUPLICATE KEY UPDATE status = 'PENDING', requested_at = NOW()`,
      [agencyId, contact.id, integration.id]
    );

    return res.json({ success: true, message: "Call permission request sent" });
  } catch (err) {
    const metaMsg = err.response?.data?.error?.message;
    console.error("Request call permission error:", err.response?.data || err.message);
    return res.status(err.response?.status === 400 ? 400 : 500).json({ success: false, message: metaMsg || "Failed to send permission request" });
  }
});

// ─── INITIATE A CALL (agent's browser has already built a complete SDP offer) ──
router.post("/calls/initiate", requireLimit("max_call_minutes_per_month", 0), async (req, res) => {
  const { contactId, sdpOffer, conversationId, integrationId } = req.body;
  if (!contactId || !sdpOffer) return res.status(400).json({ success: false, message: "contactId and sdpOffer are required" });

  try {
    const agencyId = req.user.agencyId;
    const [[contact]] = await pool.query("SELECT * FROM contacts WHERE id = ? AND agency_id = ?", [contactId, agencyId]);
    if (!contact) return res.status(404).json({ success: false, message: "Contact not found" });

    const integration = await getWhatsAppIntegration(agencyId, integrationId);
    if (!integration) return res.status(400).json({ success: false, message: "This conversation's WhatsApp account is missing or inactive" });

    const [callResult] = await pool.query(
      `INSERT INTO whatsapp_calls (agency_id, integration_id, conversation_id, contact_id, status, sdp_offer, created_by)
       VALUES (?, ?, ?, ?, 'INITIATING', ?, ?)`,
      [agencyId, integration.id, conversationId || null, contact.id, sdpOffer, req.user.id]
    );
    const callDbId = callResult.insertId;
    const bizOpaqueData = `call_${callDbId}`;

    try {
      const url = `https://graph.facebook.com/${META_API_VERSION}/${integration.wa_phone_number_id}/calls`;
      const metaRes = await axios.post(url, {
        messaging_product: "whatsapp",
        to: contact.external_id,
        action: "connect",
        session: { sdp_type: "offer", sdp: sdpOffer },
        biz_opaque_callback_data: bizOpaqueData,
      }, { headers: { Authorization: `Bearer ${integration.access_token}`, "Content-Type": "application/json" } });

      const wacid = metaRes.data?.calls?.[0]?.id || null;
      await pool.query("UPDATE whatsapp_calls SET wacid = ?, biz_opaque_callback_data = ? WHERE id = ?", [wacid, bizOpaqueData, callDbId]);

      return res.status(201).json({ success: true, callDbId, wacid });
    } catch (metaErr) {
      const code = metaErr.response?.data?.error?.code;
      const metaMsg = code === 138006
        ? "This subscriber hasn't granted call permission yet."
        : (metaErr.response?.data?.error?.message || "Failed to place the call");
      console.error("[WA Calling] initiate error:", metaErr.response?.data || metaErr.message);
      await pool.query(
        "UPDATE whatsapp_calls SET status = 'FAILED', error_message = ?, ended_at = NOW() WHERE id = ?",
        [metaMsg, callDbId]
      );
      return res.status(400).json({ success: false, message: metaMsg, callDbId, code });
    }
  } catch (err) {
    console.error("Initiate call error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── TERMINATE A CALL ───────────────────────────────────────────────────────
// Meta's docs: this must be called even if the browser's own RTCPeerConnection
// already dropped — it's what makes call billing/duration accurate on Meta's
// side, not just a courtesy.
router.post("/calls/:id/terminate", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [[call]] = await pool.query(
      `SELECT wc.*, i.wa_phone_number_id, i.access_token FROM whatsapp_calls wc
       JOIN integrations i ON i.id = wc.integration_id
       WHERE wc.id = ? AND wc.agency_id = ?`,
      [req.params.id, agencyId]
    );
    if (!call) return res.status(404).json({ success: false, message: "Call not found" });

    if (call.wacid && !["TERMINATED", "COMPLETED", "FAILED", "REJECTED"].includes(call.status)) {
      try {
        const url = `https://graph.facebook.com/${META_API_VERSION}/${call.wa_phone_number_id}/calls`;
        await axios.post(url, {
          messaging_product: "whatsapp",
          call_id: call.wacid,
          action: "terminate",
        }, { headers: { Authorization: `Bearer ${call.access_token}`, "Content-Type": "application/json" } });
      } catch (metaErr) {
        console.warn("[WA Calling] terminate warning (may have already ended):", metaErr.response?.data || metaErr.message);
      }
    }

    await pool.query(
      "UPDATE whatsapp_calls SET status = 'TERMINATED', ended_at = NOW() WHERE id = ? AND status NOT IN ('COMPLETED','FAILED','REJECTED')",
      [req.params.id]
    );
    return res.json({ success: true, message: "Call ended" });
  } catch (err) {
    console.error("Terminate call error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET CALL STATE (fallback poll if a socket event was missed) ──────────────
router.get("/calls/:id", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [[call]] = await pool.query("SELECT * FROM whatsapp_calls WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!call) return res.status(404).json({ success: false, message: "Call not found" });
    return res.json({ success: true, call });
  } catch (err) {
    console.error("Get call error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
