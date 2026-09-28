/**
 * WhatsApp Business Calling — calls both ways (the Inbox's Call button, and
 * customers calling the business: utils/whatsappCallEvents.js), call
 * settings, call log / stats, call buttons + links and recordings, per
 * Meta's Cloud API Calling docs
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
import { waRecipient, isBsuid } from "../utils/whatsappIdentity.js";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { emitToAgency, emitToConversation } from "../utils/socket.js";
import { saveMessage } from "../utils/messageProcessor.js";
import axios from "axios";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requireModule, requireLimit } from "../utils/entitlements.js";
import { META_API_VERSION, GRAPH_URL } from "../utils/metaApi.js";

const router = express.Router();
router.use("/calls", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), requireModule("feature_whatsapp_calling"));


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

    let metaActions = null;
    if (req.query.refresh === "1") {
      try {
        // Exact response shape per Meta's Calling API reference:
        // { permission: { status: "no_permission"|"temporary"|"permanent", expiration_time?: <unix seconds> }, actions: [...] }
        const url = `https://graph.facebook.com/${META_API_VERSION}/${integration.wa_phone_number_id}/call_permissions`;
        const metaRes = await axios.get(url, {
          headers: { Authorization: `Bearer ${integration.access_token}` },
          params: isBsuid(contact.external_id) ? { recipient: contact.external_id } : { user_wa_id: contact.external_id },
        });
        metaActions = metaRes.data?.actions || null;
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
    return res.json({ success: true, permission: row || { status: "UNKNOWN" }, actions: metaActions });
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
      ...waRecipient(contact.external_id),
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
        ...waRecipient(contact.external_id),
        action: "connect",
        session: { sdp_type: "offer", sdp: sdpOffer },
        biz_opaque_callback_data: bizOpaqueData,
      }, { headers: { Authorization: `Bearer ${integration.access_token}`, "Content-Type": "application/json" } });

      const wacid = metaRes.data?.calls?.[0]?.id || null;
      await pool.query("UPDATE whatsapp_calls SET wacid = ?, biz_opaque_callback_data = ? WHERE id = ?", [wacid, bizOpaqueData, callDbId]);

      const prefs = await loadPrefs(integration.id);
      return res.status(201).json({ success: true, callDbId, wacid, recordCalls: prefs.recordCalls });
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

// ─── helpers for the Calling tab ─────────────────────────────────────────────
const graphHeaders = (integration) => ({ Authorization: `Bearer ${integration.access_token}`, "Content-Type": "application/json" });
const metaError = (err, fallback) => err.response?.data?.error?.error_user_msg || err.response?.data?.error?.message || fallback;
const agencyOf = (req) => req.tenant?.agencyId ?? req.user.agencyId;

const RECORDINGS_DIR = path.resolve("private_uploads", "call-recordings");
const recordingUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 }, // ~1h of Opus audio
  fileFilter: (req, file, cb) => cb(null, /^audio\/(webm|ogg|mp4|mpeg|wav)/i.test(file.mimetype)),
});
const voicemailUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^audio\/ogg/i.test(file.mimetype) || /\.ogg$/i.test(file.originalname)),
});

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const HHMM = /^([01]\d|2[0-3])[0-5]\d$/;

/** Validates + trims the `calling` object sent from the Calling tab to what Meta accepts. */
function cleanCallingSettings(input = {}) {
  const out = {};
  const err = (message) => { const e = new Error(message); e.status = 400; throw e; };
  if (input.status !== undefined) out.status = input.status === "ENABLED" ? "ENABLED" : "DISABLED";
  if (input.call_icon_visibility !== undefined) out.call_icon_visibility = input.call_icon_visibility === "DISABLE_ALL" ? "DISABLE_ALL" : "DEFAULT";
  if (input.call_icons !== undefined) {
    const countries = (input.call_icons?.restrict_to_user_countries || []).map((c) => String(c).trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));
    out.call_icons = { restrict_to_user_countries: [...new Set(countries)] };
  }
  if (input.callback_permission_status !== undefined) out.callback_permission_status = input.callback_permission_status === "ENABLED" ? "ENABLED" : "DISABLED";
  if (input.call_hours !== undefined) {
    const h = input.call_hours || {};
    const hours = { status: h.status === "ENABLED" ? "ENABLED" : "DISABLED" };
    if (hours.status === "ENABLED") {
      if (!h.timezone_id) err("Pick a time zone for the call hours");
      hours.timezone_id = String(h.timezone_id);
      const weekly = (h.weekly_operating_hours || []).map((w) => ({ day_of_week: String(w.day_of_week).toUpperCase(), open_time: String(w.open_time), close_time: String(w.close_time) }));
      for (const w of weekly) {
        if (!DAYS.includes(w.day_of_week) || !HHMM.test(w.open_time) || !HHMM.test(w.close_time)) err("Call hours need a day and times like 0900");
        if (w.open_time >= w.close_time) err(`${w.day_of_week}: the closing time must be after the opening time`);
      }
      for (const d of DAYS) {
        const slots = weekly.filter((w) => w.day_of_week === d).sort((a, b) => a.open_time.localeCompare(b.open_time));
        if (slots.length > 2) err(`${d}: at most 2 time ranges per day`);
        if (slots.length === 2 && slots[1].open_time < slots[0].close_time) err(`${d}: the two time ranges overlap`);
      }
      if (!weekly.length) err("Add at least one day with call hours, or turn call hours off");
      hours.weekly_operating_hours = weekly;
      const holidays = (h.holiday_schedule || []).map((x) => ({ date: String(x.date), start_time: String(x.start_time || "0000"), end_time: String(x.end_time || "2359") }));
      if (holidays.length > 20) err("At most 20 holidays");
      const today = new Date().toISOString().slice(0, 10);
      for (const x of holidays) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date) || !HHMM.test(x.start_time) || !HHMM.test(x.end_time)) err("Holidays need a date and times like 0900");
        if (x.date < today) err(`The holiday ${x.date} is in the past — Meta only accepts future dates`);
      }
      hours.holiday_schedule = holidays;
    }
    out.call_hours = hours;
  }
  if (input.audio !== undefined) {
    const codecs = (input.audio?.additional_codecs || []).filter((c) => ["PCMA", "PCMU"].includes(c));
    out.audio = { additional_codecs: codecs };
  }
  if (input.voicemail !== undefined) {
    const v = input.voicemail || {};
    const vm = { status: v.status === "ENABLED" ? "ENABLED" : "DISABLED" };
    if (vm.status === "ENABLED") {
      vm.triggers = (v.triggers || []).filter((t) => ["REJECT", "TIMEOUT"].includes(t));
      if (!vm.triggers.length) err("Pick when voicemail starts (declined and/or not answered)");
      const mediaId = v.audio?.default?.announcement_media_id;
      const timeout = Math.min(30, Math.max(0, Number(v.audio?.default?.timeout_seconds ?? 20)));
      if (mediaId) vm.audio = { default: { announcement_media_id: String(mediaId), timeout_seconds: timeout } };
    }
    out.voicemail = vm;
  }
  if (input.sip !== undefined) {
    const s = input.sip || {};
    const sip = { status: s.status === "ENABLED" ? "ENABLED" : "DISABLED" };
    if (sip.status === "ENABLED") {
      const servers = (s.servers || []).filter((x) => x.hostname).map((x) => ({ hostname: String(x.hostname).trim(), port: Number(x.port) || 5061 }));
      if (!servers.length) err("Add your SIP server's hostname");
      sip.servers = servers;
    }
    out.sip = sip;
  }
  return out;
}

async function loadPrefs(integrationId) {
  const [[row]] = await pool.query("SELECT * FROM whatsapp_call_prefs WHERE integration_id = ?", [integrationId]);
  return {
    recordCalls: Boolean(row?.record_calls),
    missedCallReplyEnabled: Boolean(row?.missed_call_reply_enabled),
    missedCallReply: row?.missed_call_reply || "Sorry we missed your call! Reply here and we'll get back to you, or call us again during our call hours.",
  };
}

// ─── CALL SETTINGS (Meta's /<PHONE_NUMBER_ID>/settings + our own prefs) ──────
router.get("/calls/settings/:integrationId", async (req, res) => {
  try {
    const integration = await getWhatsAppIntegration(agencyOf(req), req.params.integrationId);
    if (!integration) return res.status(404).json({ success: false, message: "WhatsApp account not found" });
    const prefs = await loadPrefs(integration.id);
    try {
      const { data } = await axios.get(`${GRAPH_URL}/${integration.wa_phone_number_id}/settings`, { headers: graphHeaders(integration) });
      const calling = { ...(data?.calling || {}) };
      if (calling.sip?.servers) calling.sip.servers = calling.sip.servers.map(({ sip_user_password: _pw, ...rest }) => rest);
      return res.json({ success: true, calling, prefs, phoneNumber: integration.wa_display_phone || null });
    } catch (metaErr) {
      return res.json({ success: true, calling: null, prefs, phoneNumber: integration.wa_display_phone || null, metaError: metaError(metaErr, "Could not read the call settings from Meta") });
    }
  } catch (err) {
    console.error("Get call settings error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/calls/settings/:integrationId", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const integration = await getWhatsAppIntegration(agencyId, req.params.integrationId);
    if (!integration) return res.status(404).json({ success: false, message: "WhatsApp account not found" });

    if (req.body?.calling && Object.keys(req.body.calling).length) {
      const calling = cleanCallingSettings(req.body.calling);
      try {
        await axios.post(`${GRAPH_URL}/${integration.wa_phone_number_id}/settings`, { calling }, { headers: graphHeaders(integration) });
      } catch (metaErr) {
        console.error("[WA Calling] settings update error:", metaErr.response?.data || metaErr.message);
        return res.status(400).json({ success: false, message: metaError(metaErr, "Meta refused the call settings") });
      }
    }
    if (req.body?.prefs) {
      const p = req.body.prefs;
      await pool.query(
        `INSERT INTO whatsapp_call_prefs (integration_id, agency_id, record_calls, missed_call_reply_enabled, missed_call_reply)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE record_calls = VALUES(record_calls), missed_call_reply_enabled = VALUES(missed_call_reply_enabled), missed_call_reply = VALUES(missed_call_reply)`,
        [integration.id, agencyId, p.recordCalls ? 1 : 0, p.missedCallReplyEnabled ? 1 : 0, String(p.missedCallReply || "").slice(0, 1000) || null]
      );
    }
    return res.json({ success: true, message: "Call settings saved" });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, message: err.message });
    console.error("Save call settings error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Voicemail greeting: an .ogg (Opus) file under 60 s, uploaded to Meta → media id.
router.post("/calls/settings/:integrationId/voicemail-audio", voicemailUpload.single("file"), async (req, res) => {
  try {
    const integration = await getWhatsAppIntegration(agencyOf(req), req.params.integrationId);
    if (!integration) return res.status(404).json({ success: false, message: "WhatsApp account not found" });
    if (!req.file) return res.status(400).json({ success: false, message: "Upload an .ogg audio file (Opus codec, under 60 seconds)" });
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", "audio/ogg");
    form.append("file", new Blob([req.file.buffer], { type: "audio/ogg" }), "voicemail.ogg");
    const metaRes = await fetch(`${GRAPH_URL}/${integration.wa_phone_number_id}/media`, {
      method: "POST", headers: { Authorization: `Bearer ${integration.access_token}` }, body: form,
    });
    const data = await metaRes.json();
    if (!metaRes.ok || !data.id) return res.status(400).json({ success: false, message: data?.error?.message || "Meta refused the audio file" });
    return res.json({ success: true, mediaId: data.id });
  } catch (err) {
    console.error("Voicemail upload error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CALL LOG + STATS ─────────────────────────────────────────────────────────
router.get("/calls/log", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize) || 25));
    const where = ["wc.agency_id = ?"];
    const params = [agencyId];
    if (req.query.integrationId) { where.push("wc.integration_id = ?"); params.push(req.query.integrationId); }
    if (["USER_INITIATED", "BUSINESS_INITIATED"].includes(req.query.direction)) { where.push("wc.direction = ?"); params.push(req.query.direction); }
    if (req.query.status === "MISSED") where.push("wc.status IN ('MISSED','REJECTED')");
    else if (req.query.status === "ANSWERED") where.push("wc.status = 'COMPLETED'");
    else if (req.query.status === "RECORDED") where.push("wc.recording_path IS NOT NULL");
    if (req.query.q) {
      where.push("(c.name LIKE ? OR c.phone LIKE ? OR wc.caller_number LIKE ?)");
      const like = `%${String(req.query.q).trim()}%`;
      params.push(like, like, like);
    }
    const whereSql = where.join(" AND ");
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) total FROM whatsapp_calls wc JOIN contacts c ON c.id = wc.contact_id WHERE ${whereSql}`, params);
    const [rows] = await pool.query(
      `SELECT wc.id, wc.integration_id, wc.conversation_id, wc.contact_id, wc.direction, wc.status, wc.started_at, wc.connected_at, wc.ended_at,
              wc.duration_seconds, wc.caller_number, wc.cta_payload, wc.deeplink_payload, wc.end_reason, wc.error_message,
              wc.recording_path IS NOT NULL AS has_recording, wc.recording_seconds,
              c.name AS contact_name, c.phone AS contact_phone, c.wa_username AS contact_username, c.external_id AS contact_external_id,
              COALESCE(ua.name, uc.name) AS agent_name, i.name AS integration_name
         FROM whatsapp_calls wc
         JOIN contacts c ON c.id = wc.contact_id
         LEFT JOIN integrations i ON i.id = wc.integration_id
         LEFT JOIN users ua ON ua.id = wc.answered_by
         LEFT JOIN users uc ON uc.id = wc.created_by
        WHERE ${whereSql}
        ORDER BY wc.started_at DESC, wc.id DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize]
    );
    return res.json({ success: true, calls: rows, total, page, pageSize });
  } catch (err) {
    console.error("Call log error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/calls/stats", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const params = [agencyId, days];
    let extra = "";
    if (req.query.integrationId) { extra = " AND integration_id = ?"; params.push(req.query.integrationId); }
    const [[s]] = await pool.query(
      `SELECT
         SUM(direction = 'USER_INITIATED') AS incoming,
         SUM(direction = 'BUSINESS_INITIATED') AS outgoing,
         SUM(status = 'COMPLETED') AS answered,
         SUM(direction = 'USER_INITIATED' AND status IN ('MISSED','REJECTED')) AS missed,
         SUM(direction = 'BUSINESS_INITIATED' AND status IN ('FAILED','REJECTED','TERMINATED') AND connected_at IS NULL) AS unanswered_outgoing,
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN duration_seconds END), 0) AS talk_seconds,
         COALESCE(AVG(CASE WHEN status = 'COMPLETED' THEN duration_seconds END), 0) AS avg_seconds,
         COALESCE(SUM(CASE WHEN direction = 'BUSINESS_INITIATED' AND status = 'COMPLETED' THEN CEIL(duration_seconds / 6) * 6 END), 0) AS billable_outgoing_seconds,
         SUM(recording_path IS NOT NULL) AS recorded
       FROM whatsapp_calls
       WHERE agency_id = ? AND started_at >= NOW() - INTERVAL ? DAY${extra}`,
      params
    );
    const n = (v) => Number(v) || 0;
    return res.json({
      success: true,
      days,
      stats: {
        incoming: n(s.incoming), outgoing: n(s.outgoing), answered: n(s.answered), missed: n(s.missed),
        unansweredOutgoing: n(s.unanswered_outgoing), talkSeconds: n(s.talk_seconds), avgSeconds: Math.round(n(s.avg_seconds)),
        billableOutgoingSeconds: n(s.billable_outgoing_seconds), recorded: n(s.recorded),
        answerRate: n(s.incoming) ? Math.round(((n(s.incoming) - n(s.missed)) / n(s.incoming)) * 100) : null,
      },
    });
  } catch (err) {
    console.error("Call stats error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CALL BUTTON + CALL LINK ──────────────────────────────────────────────────
// Interactive voice_call message: a "Call us" button that expires after ttlMinutes.
router.post("/calls/button", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const [[conv]] = await pool.query(
      `SELECT cv.id, cv.contact_id, cv.integration_id, c.external_id FROM conversations cv
       JOIN contacts c ON c.id = cv.contact_id WHERE cv.id = ? AND cv.agency_id = ?`,
      [req.body?.conversationId, agencyId]
    );
    if (!conv) return res.status(404).json({ success: false, message: "Conversation not found" });
    const integration = await getWhatsAppIntegration(agencyId, conv.integration_id);
    if (!integration) return res.status(400).json({ success: false, message: "This conversation isn't on an active WhatsApp number" });
    const bodyText = String(req.body?.body || "You can call us on WhatsApp now.").slice(0, 1024);
    const displayText = String(req.body?.displayText || "Call on WhatsApp").slice(0, 20);
    const ttl = Math.min(43200, Math.max(1, Number(req.body?.ttlMinutes) || 10080));
    const parameters = { display_text: displayText, ttl_minutes: ttl };
    if (req.body?.payload) parameters.payload = String(req.body.payload).slice(0, 512);
    let wamid = null;
    try {
      const { data } = await axios.post(`${GRAPH_URL}/${integration.wa_phone_number_id}/messages`, {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        ...waRecipient(conv.external_id),
        type: "interactive",
        interactive: { type: "voice_call", body: { text: bodyText }, action: { name: "voice_call", parameters } },
      }, { headers: graphHeaders(integration) });
      wamid = data?.messages?.[0]?.id || null;
    } catch (metaErr) {
      return res.status(400).json({ success: false, message: metaError(metaErr, "Meta refused the call button") });
    }
    const message = await saveMessage(conv.id, "OUTBOUND", "TEXT", `${bodyText}\n[📞 ${displayText}]`, wamid, null, {
      senderType: "AGENT", senderName: req.user?.name, userId: req.user?.id, callButton: { displayText, ttlMinutes: ttl },
    });
    await pool.query("UPDATE conversations SET last_message_at = NOW() WHERE id = ?", [conv.id]);
    emitToAgency(agencyId, "new_message", { conversationId: conv.id, message });
    emitToConversation(conv.id, "new_message", { conversationId: conv.id, message });
    return res.json({ success: true, message });
  } catch (err) {
    console.error("Call button error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// wa.me/call link for websites, emails, QR codes. `biz_payload` comes back as deeplink_payload on the call.
router.get("/calls/link/:integrationId", async (req, res) => {
  try {
    const integration = await getWhatsAppIntegration(agencyOf(req), req.params.integrationId);
    if (!integration) return res.status(404).json({ success: false, message: "WhatsApp account not found" });
    const digits = String(integration.wa_display_phone || "").replace(/[^0-9]/g, "");
    if (!digits) return res.status(400).json({ success: false, message: "This number's phone number isn't known yet — reconnect it or refresh its details" });
    const payload = req.query.payload ? `?biz_payload=${encodeURIComponent(String(req.query.payload).slice(0, 512))}` : "";
    return res.json({ success: true, link: `https://wa.me/call/${digits}${payload}` });
  } catch (err) {
    console.error("Call link error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── ANSWER / DECLINE A CUSTOMER'S CALL ──────────────────────────────────────
// Every agent's browser rings; the first accept claims the call atomically.
router.post("/calls/:id/accept", async (req, res) => {
  const { sdpAnswer } = req.body || {};
  if (!sdpAnswer) return res.status(400).json({ success: false, message: "sdpAnswer is required" });
  try {
    const agencyId = agencyOf(req);
    const [claim] = await pool.query(
      "UPDATE whatsapp_calls SET status = 'ACCEPTED', answered_by = ?, sdp_answer = ? WHERE id = ? AND agency_id = ? AND direction = 'USER_INITIATED' AND status = 'RINGING'",
      [req.user.id, sdpAnswer, req.params.id, agencyId]
    );
    if (!claim.affectedRows) return res.status(409).json({ success: false, message: "This call was already answered or has ended" });
    const [[call]] = await pool.query(
      "SELECT wc.*, i.wa_phone_number_id, i.access_token FROM whatsapp_calls wc JOIN integrations i ON i.id = wc.integration_id WHERE wc.id = ?",
      [req.params.id]
    );
    const body = (action) => ({ messaging_product: "whatsapp", call_id: call.wacid, action, session: { sdp_type: "answer", sdp: sdpAnswer } });
    try {
      // pre_accept lets the media path come up before the call is picked up (Meta's recommended order).
      await axios.post(`${GRAPH_URL}/${call.wa_phone_number_id}/calls`, body("pre_accept"), { headers: graphHeaders(call) }).catch((e) => {
        console.warn("[WA Calling] pre_accept warning:", e.response?.data || e.message);
      });
      await axios.post(`${GRAPH_URL}/${call.wa_phone_number_id}/calls`, { ...body("accept"), biz_opaque_callback_data: `call_${call.id}` }, { headers: graphHeaders(call) });
    } catch (metaErr) {
      const msg = metaError(metaErr, "Meta refused to connect the call");
      await pool.query("UPDATE whatsapp_calls SET status = 'FAILED', error_message = ?, ended_at = NOW() WHERE id = ?", [msg, call.id]);
      emitToAgency(agencyId, "whatsapp_call_claimed", { callDbId: call.id, by: req.user.id, failed: true });
      return res.status(400).json({ success: false, message: msg });
    }
    await pool.query("UPDATE whatsapp_calls SET status = 'CONNECTED', connected_at = NOW() WHERE id = ?", [call.id]);
    emitToAgency(agencyId, "whatsapp_call_claimed", { callDbId: call.id, by: req.user.id, byName: req.user.name || null });
    const prefs = await loadPrefs(call.integration_id);
    return res.json({ success: true, callDbId: call.id, recordCalls: prefs.recordCalls });
  } catch (err) {
    console.error("Accept call error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/calls/:id/reject", async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const [[call]] = await pool.query(
      `SELECT wc.*, i.wa_phone_number_id, i.access_token FROM whatsapp_calls wc JOIN integrations i ON i.id = wc.integration_id
       WHERE wc.id = ? AND wc.agency_id = ? AND wc.direction = 'USER_INITIATED'`,
      [req.params.id, agencyId]
    );
    if (!call) return res.status(404).json({ success: false, message: "Call not found" });
    if (call.status !== "RINGING") return res.status(409).json({ success: false, message: "This call was already answered or has ended" });
    await pool.query("UPDATE whatsapp_calls SET status = 'REJECTED', answered_by = ? WHERE id = ? AND status = 'RINGING'", [req.user.id, call.id]);
    await axios.post(`${GRAPH_URL}/${call.wa_phone_number_id}/calls`, { messaging_product: "whatsapp", call_id: call.wacid, action: "reject" }, { headers: graphHeaders(call) })
      .catch((e) => console.warn("[WA Calling] reject warning:", e.response?.data || e.message));
    emitToAgency(agencyId, "whatsapp_call_claimed", { callDbId: call.id, by: req.user.id, rejected: true });
    return res.json({ success: true });
  } catch (err) {
    console.error("Reject call error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── RECORDINGS (recorded in the agent's browser, stored privately) ──────────
router.post("/calls/:id/recording", recordingUpload.single("file"), async (req, res) => {
  try {
    const agencyId = agencyOf(req);
    const [[call]] = await pool.query("SELECT id, integration_id, recording_path FROM whatsapp_calls WHERE id = ? AND agency_id = ?", [req.params.id, agencyId]);
    if (!call) return res.status(404).json({ success: false, message: "Call not found" });
    if (!req.file) return res.status(400).json({ success: false, message: "No audio received" });
    const prefs = await loadPrefs(call.integration_id);
    if (!prefs.recordCalls) return res.status(403).json({ success: false, message: "Call recording is turned off for this number" });
    const ext = /ogg/.test(req.file.mimetype) ? "ogg" : /mp4/.test(req.file.mimetype) ? "m4a" : "webm";
    const dir = path.join(RECORDINGS_DIR, String(agencyId));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${call.id}-${crypto.randomBytes(8).toString("hex")}.${ext}`);
    fs.writeFileSync(file, req.file.buffer);
    if (call.recording_path) fs.promises.unlink(path.resolve(call.recording_path)).catch(() => {});
    await pool.query(
      "UPDATE whatsapp_calls SET recording_path = ?, recording_seconds = ?, recording_bytes = ? WHERE id = ?",
      [path.relative(process.cwd(), file), Number(req.body?.seconds) || null, req.file.size, call.id]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error("Upload recording error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/calls/:id/recording", async (req, res) => {
  try {
    const [[call]] = await pool.query("SELECT recording_path FROM whatsapp_calls WHERE id = ? AND agency_id = ?", [req.params.id, agencyOf(req)]);
    if (!call?.recording_path) return res.status(404).json({ success: false, message: "No recording for this call" });
    const full = path.resolve(call.recording_path);
    if (!full.startsWith(RECORDINGS_DIR) || !fs.existsSync(full)) return res.status(404).json({ success: false, message: "Recording file is missing" });
    const type = full.endsWith(".ogg") ? "audio/ogg" : full.endsWith(".m4a") ? "audio/mp4" : "audio/webm";
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "private, no-store");
    if (req.query.download === "1") res.setHeader("Content-Disposition", `attachment; filename="call-${req.params.id}${path.extname(full)}"`);
    return fs.createReadStream(full).pipe(res);
  } catch (err) {
    console.error("Get recording error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/calls/:id/recording", async (req, res) => {
  try {
    const [[call]] = await pool.query("SELECT id, recording_path FROM whatsapp_calls WHERE id = ? AND agency_id = ?", [req.params.id, agencyOf(req)]);
    if (!call) return res.status(404).json({ success: false, message: "Call not found" });
    if (call.recording_path) {
      const full = path.resolve(call.recording_path);
      if (full.startsWith(RECORDINGS_DIR)) await fs.promises.unlink(full).catch(() => {});
    }
    await pool.query("UPDATE whatsapp_calls SET recording_path = NULL, recording_seconds = NULL, recording_bytes = NULL WHERE id = ?", [call.id]);
    return res.json({ success: true });
  } catch (err) {
    console.error("Delete recording error:", err);
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
