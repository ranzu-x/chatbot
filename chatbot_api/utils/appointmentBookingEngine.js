import pool from "../db.js";
import { sendPlatformMessage } from "./platformSender.js";
import { emitToAgency, emitToConversation } from "./socket.js";
import { saveMessage } from "./messageProcessor.js";
import {
  getBookingSettings, listAvailableDates, listAvailableSlots, reserveSlot, convertHold,
  releaseHold, extendHold, holdIsLive, expireSlotHolds, buildListPage, wallClock, isValidTimezone,
} from "./appointmentAvailability.js";

const BOOKING_KEYWORDS = [
  "book appointment",
  "book an appointment",
  "appointment",
  "schedule appointment",
  "schedule",
  "book slot",
  "book a slot",
  "booking",
  "reserve slot",
  "take appointment",
  "make appointment",
  "book a demo",
  "book demo",
  "demo",
];

/**
 * Checks if incoming text or payload is an appointment trigger
 */
export function isAppointmentTrigger(text, buttonRoute) {
  if (buttonRoute && (buttonRoute.startsWith("apt:") || buttonRoute.startsWith("apt_") || buttonRoute === "book_appointment")) {
    return true;
  }
  const clean = (text || "").trim().toLowerCase();
  if (!clean) return false;
  return BOOKING_KEYWORDS.some((kw) => clean === kw || clean.startsWith(kw));
}

/**
 * Helper to send bot reply and save message
 */
async function sendBookingReply(agencyId, conversation, contact, integration, platform, messagePayload) {
  let externalMsgId = null;
  const contactExternalId = contact?.external_id || contact?.phone;
  try {
    externalMsgId = await sendPlatformMessage(platform, integration, contactExternalId, messagePayload);
  } catch (err) {
    console.error(`[Appointment Bot] Failed to send ${platform} message:`, err.message);
  }

  const botMetadata = { senderType: "BOT", senderName: "Appointment Manager" };
  if (messagePayload.listMenu) botMetadata.listMenu = messagePayload.listMenu;
  if (messagePayload.buttons) botMetadata.buttons = messagePayload.buttons;
  const textBody = messagePayload.body || messagePayload.text || "";

  const savedMsg = await saveMessage(
    conversation.id,
    "OUTBOUND",
    messagePayload.type || "TEXT",
    textBody,
    externalMsgId,
    messagePayload.mediaUrl || null,
    botMetadata
  );

  emitToAgency(agencyId, "new_message", { conversationId: conversation.id, message: savedMsg });
  emitToConversation(conversation.id, "new_message", { conversationId: conversation.id, message: savedMsg });

  return savedMsg;
}

/**
 * Format date nicely (e.g., "Wed, Sep 24")
 */
function formatDatePretty(dateStr) {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  } catch (e) {
    return dateStr;
  }
}

/** "Monday, October 5" — for list row titles (≤ 24 chars, Meta's limit). */
function formatDateLong(dateStr) {
  try {
    const d = new Date(dateStr + "T00:00:00");
    const long = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    return long.length <= 24 ? long : formatDatePretty(dateStr);
  } catch (e) {
    return dateStr;
  }
}

/** "09:30:00" → "09:30 AM" */
function formatTime12(t) {
  const [h, m] = String(t || "").split(":").map(Number);
  if (!Number.isFinite(h)) return String(t || "");
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${String(m || 0).padStart(2, "0")} ${suffix}`;
}

const toDateStr = (d) => (typeof d === "string" ? d.slice(0, 10) : d instanceof Date
  ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  : "");

const money = (amount, currency) => `${String(currency || "USD").toUpperCase()} ${Number(amount || 0).toFixed(2)}`;

/**
 * After a booking session ends (COMPLETED or CANCELLED), resume the parent flow session
 * by advancing to the appropriate handle ("confirmed" or "cancelled").
 *
 * This is done by updating the flow_sessions.current_node_id to the node AFTER the
 * appointment node, resolved via the handle. The flow engine will pick it up on the
 * next message if it's parked, or we directly advance the session.
 * Returns the next node id (or null).
 */
async function resumeParentFlow(session, outcome) {
  if (!session.flow_session_id || !session.flow_node_id) return null;

  try {
    // Load the flow session
    const [[flowSession]] = await pool.query(
      "SELECT * FROM flow_sessions WHERE id = ? AND status = 'ACTIVE'",
      [session.flow_session_id]
    );
    if (!flowSession) return null;

    // Load the flow graph to find the next node
    const [[flowRow]] = await pool.query("SELECT * FROM flows WHERE id = ?", [flowSession.flow_id]);
    if (!flowRow) return null;

    let edges = [];
    try { edges = JSON.parse(flowRow.edges_json || "[]"); } catch {}

    // Resolve next node ID based on outcome handle: "confirmed" or "cancelled"
    const handle = outcome === "COMPLETED" ? "confirmed" : "cancelled";
    const nextEdge = edges.find(
      (e) => e.source === session.flow_node_id && e.sourceHandle === handle
    );
    // Fallback: any edge from this node (if user didn't wire both handles)
    const fallbackEdge = !nextEdge ? edges.find((e) => e.source === session.flow_node_id) : null;
    const nextNodeId = nextEdge?.target || fallbackEdge?.target || null;

    if (nextNodeId) {
      await pool.query(
        "UPDATE flow_sessions SET current_node_id = ?, variables = ? WHERE id = ?",
        [nextNodeId, flowSession.variables, flowSession.id]
      );
      console.log(`[Appointment Engine] Resumed flow session ${flowSession.id} → node ${nextNodeId} (${handle})`);
      return nextNodeId;
    }
    // No next node — end the flow session
    await pool.query(
      "UPDATE flow_sessions SET status = 'COMPLETED', current_node_id = ? WHERE id = ?",
      [session.flow_node_id, flowSession.id]
    );
    console.log(`[Appointment Engine] Flow session ${flowSession.id} completed (no next node after appointment)`);
  } catch (err) {
    console.error("[Appointment Engine] Failed to resume parent flow:", err.message);
  }
  return null;
}

/**
 * Resumes the parent flow and, when the booking ended outside a user message
 * (payment webhook, hold expiry), runs its next steps right away.
 */
async function resumeAndRunParentFlow(session, outcome, ctx) {
  const nextNodeId = await resumeParentFlow(session, outcome);
  if (!nextNodeId || !ctx?.contact) return;
  try {
    const [[flowSession]] = await pool.query("SELECT * FROM flow_sessions WHERE id = ? AND status = 'ACTIVE'", [session.flow_session_id]);
    if (!flowSession) return;
    const { processFlow } = await import("./flowEngine.js");
    await processFlow(session.agency_id, ctx.platform, ctx.conversation, ctx.contact, "", ctx.integration, "TEXT", null, {
      session: flowSession,
      skipDelayForNodeId: null,
    });
  } catch (err) {
    console.error("[Appointment Engine] Failed to continue the flow:", err.message);
  }
}

/** Closes a booking session: releases its hold and any unpaid checkout. */
async function closeSession(session, status, outcome) {
  await pool.query(
    "UPDATE appointment_booking_sessions SET status = ?, flow_outcome = ? WHERE id = ?",
    [status, outcome, session.id]
  );
  if (session.hold_id) {
    await releaseHold(session.hold_id);
    await pool.query(
      "UPDATE chat_orders SET status = 'CANCELLED' WHERE appointment_hold_id = ? AND status = 'PENDING'",
      [session.hold_id]
    );
  }
}

async function loadService(agencyId, serviceId) {
  if (!serviceId) return { serviceName: "General Consultation", fee: 0, duration: 30, currency: "USD" };
  const [[svc]] = await pool.query("SELECT * FROM appointment_services WHERE id = ? AND agency_id = ?", [serviceId, agencyId]);
  if (!svc) return { serviceName: "General Consultation", fee: 0, duration: 30, currency: "USD" };
  return { serviceName: svc.name, fee: Number(svc.price) || 0, duration: svc.duration_minutes || 30, currency: svc.currency || "USD" };
}

/** Today / tomorrow in the workspace timezone (falls back to the server clock). */
function relativeDate(settings, days) {
  if (isValidTimezone(settings.timezone)) return wallClock(settings.timezone, days * 1440).slice(0, 10);
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

function confirmationText({ aptId, contact, session, serviceName, date, slot, fee, currency, paymentLine }) {
  return (
    `🎉 *Appointment Confirmed!*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📋 *Booking ID:* #APT-${aptId}\n` +
    `👤 *Client:* ${contact?.name || session?.customer_name || "Valued Client"}\n` +
    `💼 *Service:* ${serviceName}\n` +
    `📅 *Date:* ${formatDatePretty(date)}\n` +
    `⏰ *Time:* ${formatTime12(slot.start_time)} - ${formatTime12(slot.end_time)}\n` +
    (fee > 0 ? `💵 *Fee:* ${money(fee, currency)}${paymentLine ? ` (${paymentLine})` : ""}\n` : "") +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `Thank you for scheduling with us! We look forward to meeting you.`
  );
}

/**
 * Main Omnichannel Appointment Booking Handler
 * @param {number} agencyId
 * @param {string} platform
 * @param {object} conversation
 * @param {object} contact
 * @param {string} incomingMsgBody
 * @param {object} integration
 * @param {string} msgType
 * @param {string|null} buttonRoute
 * @param {number|null} campaignId  - If called from a flow node, the selected campaign ID
 * @param {object|null} flowContext - { flowSessionId, flowNodeId } for flow resume
 * Returns true if handled, false otherwise
 */
export async function handleAppointmentBooking(
  agencyId, platform, conversation, contact,
  incomingMsgBody, integration, msgType, buttonRoute,
  campaignId = null, flowContext = null
) {
  try {
    const cleanMsg = (incomingMsgBody || "").trim();
    const lowerMsg = cleanMsg.toLowerCase();
    const effectiveRoute = buttonRoute || (cleanMsg.startsWith("apt:") || cleanMsg.startsWith("apt_") ? cleanMsg : null);
    const reply = (payload) => sendBookingReply(agencyId, conversation, contact, integration, platform, payload);
    const isWhatsApp = platform === "WHATSAPP";

    // 1. Look for active booking session for this conversation
    const [activeSessions] = await pool.query(
      `SELECT * FROM appointment_booking_sessions
       WHERE conversation_id = ? AND status = 'ACTIVE' AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [conversation.id]
    );

    let session = activeSessions[0] || null;

    // Check if user wants to cancel an ongoing session
    if (session && (lowerMsg === "cancel" || lowerMsg === "exit" || lowerMsg === "quit" || lowerMsg === "stop" || effectiveRoute === "apt:cancel")) {
      await closeSession(session, "CANCELLED", "CANCELLED");
      await reply({
        type: "TEXT",
        body: "🚫 Appointment booking has been cancelled. If you'd like to book in the future, just reply *book appointment*!",
      });
      await resumeParentFlow(session, "CANCELLED");
      return true;
    }

    // If no active session, check if message is a booking trigger
    if (!session) {
      if (!isAppointmentTrigger(incomingMsgBody, effectiveRoute) && !flowContext) {
        return false;
      }

      // Is the Appointments module in this workspace's plan? (This used to read
      // an `agency_modules` table that doesn't exist, so the query threw and
      // every new booking silently failed.)
      const { assertModuleAccess } = await import("./entitlements.js");
      try {
        await assertModuleAccess(agencyId, "feature_appointments");
      } catch (err) {
        if (err.code === "MODULE_DISABLED") return false;
        throw err;
      }

      // Load campaign if provided
      let campaign = null;
      if (campaignId) {
        const [[cam]] = await pool.query(
          "SELECT * FROM appointment_campaigns WHERE id = ? AND agency_id = ? AND is_active = 1",
          [campaignId, agencyId]
        );
        campaign = cam || null;
      }

      // Create new booking session with 30-minute expiry
      const [newSess] = await pool.query(
        `INSERT INTO appointment_booking_sessions (
          agency_id, campaign_id, flow_session_id, flow_node_id,
          conversation_id, contact_id, platform, step,
          customer_name, customer_phone, customer_email,
          status, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'SELECT_SERVICE', ?, ?, ?, 'ACTIVE', DATE_ADD(NOW(), INTERVAL 30 MINUTE))`,
        [
          agencyId,
          campaign?.id || null,
          flowContext?.flowSessionId || null,
          flowContext?.flowNodeId || null,
          conversation.id,
          contact.id,
          platform || "WHATSAPP",
          contact.name || "Valued Client",
          contact.phone || contact.external_id || "",
          contact.email || null,
        ]
      );

      const [loaded] = await pool.query("SELECT * FROM appointment_booking_sessions WHERE id = ?", [newSess.insertId]);
      session = loaded[0];

      // Send campaign greeting if present
      if (campaign?.greeting_message) {
        await reply({ type: "TEXT", body: campaign.greeting_message });
      }
    }

    const settings = await getBookingSettings(agencyId, session.campaign_id);
    // Slots are workspace-wide for the chatbot (as before); no staff filter.
    const staffId = null;

    // Load campaign for service filtering
    let campaignServiceIds = null;
    if (session.campaign_id) {
      const [[cam]] = await pool.query(
        "SELECT service_ids, staff_id FROM appointment_campaigns WHERE id = ?",
        [session.campaign_id]
      );
      if (cam?.service_ids) {
        try {
          campaignServiceIds = typeof cam.service_ids === "string"
            ? JSON.parse(cam.service_ids)
            : cam.service_ids;
        } catch {}
      }
    }

    // Helper: build service WHERE clause
    const buildServiceFilter = (agencyId, campaignServiceIds) => {
      if (campaignServiceIds && campaignServiceIds.length > 0) {
        const placeholders = campaignServiceIds.map(() => "?").join(",");
        return {
          sql: `SELECT id, name, description, duration_minutes, price, currency FROM appointment_services WHERE agency_id = ? AND is_active = 1 AND id IN (${placeholders}) ORDER BY name ASC`,
          params: [agencyId, ...campaignServiceIds],
        };
      }
      return {
        sql: `SELECT id, name, description, duration_minutes, price, currency FROM appointment_services WHERE agency_id = ? AND is_active = 1 ORDER BY name ASC`,
        params: [agencyId],
      };
    };

    const setStep = async (fields) => {
      Object.assign(session, fields);
      const cols = Object.keys(fields);
      await pool.query(
        `UPDATE appointment_booking_sessions SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`,
        [...cols.map((c) => fields[c]), session.id]
      );
    };

    // ── NAVIGATION FROM AN OLDER LIST ─────────────────────────────────────
    // A subscriber may tap a row of a list sent earlier (another day, another
    // time). Move the session back to the matching step; the hold, if any, is
    // replaced (reserveSlot) or released below.
    if (effectiveRoute && session.step !== "AWAITING_PAYMENT" && session.step !== "SELECT_SERVICE") {
      if (/^apt:(date|dpage):/.test(effectiveRoute) && session.step !== "SELECT_DATE") {
        if (session.hold_id) await releaseHold(session.hold_id);
        await setStep({ step: "SELECT_DATE", slot_id: null, hold_id: null });
      } else if ((/^apt:(slot|spage):/.test(effectiveRoute) || effectiveRoute === "apt:back" || effectiveRoute === "apt:times") && session.step === "CONFIRM") {
        await setStep({ step: "SELECT_SLOT" });
      }
    }

    // ── STEP 1: SELECT SERVICE ─────────────────────────────────────────────
    if (session.step === "SELECT_SERVICE") {
      const { sql, params } = buildServiceFilter(agencyId, campaignServiceIds);
      const [services] = await pool.query(sql, params);

      if (services.length === 0) {
        session.step = "SELECT_DATE";
        await pool.query("UPDATE appointment_booking_sessions SET step = 'SELECT_DATE' WHERE id = ?", [session.id]);
      } else if (services.length === 1) {
        const singleSvc = services[0];
        session.service_id = singleSvc.id;
        session.step = "SELECT_DATE";
        await pool.query(
          "UPDATE appointment_booking_sessions SET service_id = ?, step = 'SELECT_DATE' WHERE id = ?",
          [singleSvc.id, session.id]
        );
      } else {
        let selectedService = null;
        if (effectiveRoute && effectiveRoute.startsWith("apt:svc:")) {
          const svcId = parseInt(effectiveRoute.replace("apt:svc:", ""));
          selectedService = services.find((s) => s.id === svcId);
        } else if (/^\d+$/.test(cleanMsg)) {
          const idx = parseInt(cleanMsg) - 1;
          if (idx >= 0 && idx < services.length) selectedService = services[idx];
        } else {
          selectedService = services.find((s) => s.name.toLowerCase() === lowerMsg);
        }

        if (selectedService) {
          session.service_id = selectedService.id;
          session.step = "SELECT_DATE";
          await pool.query(
            "UPDATE appointment_booking_sessions SET service_id = ?, step = 'SELECT_DATE' WHERE id = ?",
            [selectedService.id, session.id]
          );
        } else {
          const serviceRows = services.slice(0, 10).map((s) => ({
            id: `apt:svc:${s.id}`,
            title: `${s.name}`.slice(0, 24),
            description: `${s.duration_minutes}m • ${s.price > 0 ? `${s.currency} ${s.price}` : "Free"}`.slice(0, 72),
          }));

          if (isWhatsApp) {
            if (services.length <= 3) {
              const buttons = services.map((s) => ({
                id: `apt:svc:${s.id}`,
                title: s.name.slice(0, 20),
                type: "reply",
              }));
              await reply({
                type: "BUTTONS",
                body: "👋 Welcome! Please select the service you would like to book:",
                buttons,
              });
            } else {
              await reply({
                type: "LIST_MENU",
                body: "👋 Welcome! Please select the service you would like to book from the menu below:",
                listMenu: { title: "Services", buttonText: "Choose Service", items: serviceRows },
              });
            }
          } else {
            let text = "👋 Welcome! Please select a service to book by replying with the number:\n\n";
            services.forEach((s, idx) => {
              text += `${idx + 1}. *${s.name}* (${s.duration_minutes}m - ${s.price > 0 ? `${s.currency} ${s.price}` : "Free"})\n`;
            });
            text += "\n_Or reply CANCEL to stop._";
            await reply({ type: "TEXT", body: text });
          }
          return true;
        }
      }
    }

    // ── STEP 2: SELECT DAY ─────────────────────────────────────────────────
    // Only days that still have a bookable slot (capacity minus bookings minus
    // live holds, inside the booking window, after the minimum notice).
    if (session.step === "SELECT_DATE") {
      const dates = await listAvailableDates(agencyId, settings, { staffId });

      if (dates.length === 0) {
        await closeSession(session, "CANCELLED", "CANCELLED");
        await reply({
          type: "TEXT",
          body: "📅 Sorry, there are currently no open appointment dates available. Please check back soon or message our team for assistance!",
        });
        await resumeParentFlow(session, "CANCELLED");
        return true;
      }

      let selectedDate = null;
      let pageOffset = 0;
      if (effectiveRoute && effectiveRoute.startsWith("apt:dpage:")) {
        pageOffset = parseInt(effectiveRoute.slice("apt:dpage:".length)) || 0;
      } else if (effectiveRoute && effectiveRoute.startsWith("apt:date:")) {
        selectedDate = effectiveRoute.replace("apt:date:", "");
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(cleanMsg)) {
        selectedDate = cleanMsg;
      } else if (/^\d+$/.test(cleanMsg)) {
        const idx = parseInt(cleanMsg) - 1;
        if (idx >= 0 && idx < dates.length) selectedDate = dates[idx].date;
      } else if (lowerMsg === "today") {
        selectedDate = relativeDate(settings, 0);
      } else if (lowerMsg === "tomorrow") {
        selectedDate = relativeDate(settings, 1);
      }

      const valid = selectedDate ? dates.find((d) => d.date === selectedDate) : null;

      if (valid) {
        await setStep({ selected_date: valid.date, step: "SELECT_SLOT" });
      } else {
        const prefix = selectedDate ? "⚠️ That day is fully booked now. " : "";
        if (isWhatsApp) {
          const page = buildListPage(
            dates, pageOffset,
            (d) => ({
              id: `apt:date:${d.date}`,
              title: formatDateLong(d.date),
              description: `${d.openSlots} time${d.openSlots === 1 ? "" : "s"} available`,
            }),
            { prevId: (o) => `apt:dpage:${o}`, nextId: (o) => `apt:dpage:${o}` }
          );
          await reply({
            type: "LIST_MENU",
            body: `${prefix}📅 Please select a day for your appointment:`,
            listMenu: { buttonText: "Select a day", sections: [{ title: "Available days", rows: page.rows }] },
          });
        } else {
          let text = `${prefix}📅 Please select an available date by replying with the number:\n\n`;
          dates.slice(0, 10).forEach((d, idx) => {
            text += `${idx + 1}. *${formatDatePretty(d.date)}* (${d.date})\n`;
          });
          text += "\n_Or reply CANCEL to stop._";
          await reply({ type: "TEXT", body: text });
        }
        return true;
      }
    }

    // ── STEP 3: SELECT TIME SLOT (and hold it) ─────────────────────────────
    if (session.step === "SELECT_SLOT") {
      if (effectiveRoute === "apt:back") {
        if (session.hold_id) await releaseHold(session.hold_id);
        await setStep({ step: "SELECT_DATE", slot_id: null, hold_id: null });
        return handleAppointmentBooking(agencyId, platform, conversation, contact, "", integration, msgType, null, campaignId, flowContext);
      }

      const targetDate = toDateStr(session.selected_date);
      const slots = await listAvailableSlots(agencyId, targetDate, settings, { staffId, excludeHoldId: session.hold_id || null });

      let chosenId = null;
      let pageOffset = 0;
      if (effectiveRoute && effectiveRoute.startsWith("apt:spage:")) {
        pageOffset = parseInt(effectiveRoute.slice("apt:spage:".length)) || 0;
      } else if (effectiveRoute && effectiveRoute.startsWith("apt:slot:")) {
        // The id from the tapped row — re-checked by reserveSlot, never trusted.
        chosenId = parseInt(effectiveRoute.replace("apt:slot:", "")) || null;
      } else if (/^\d+$/.test(cleanMsg)) {
        const idx = parseInt(cleanMsg) - 1;
        if (idx >= 0 && idx < slots.length) chosenId = slots[idx].id;
      } else if (cleanMsg) {
        const hit = slots.find((s) => lowerMsg.includes(s.start_time.substring(0, 5)) || lowerMsg === formatTime12(s.start_time).toLowerCase());
        if (hit) chosenId = hit.id;
      }

      let notice = "";
      if (chosenId) {
        const res = await reserveSlot({
          agencyId, slotId: chosenId, sessionId: session.id, contactId: contact.id,
          conversationId: conversation.id, serviceId: session.service_id || null, settings, staffId,
        });
        if (res.ok) {
          const slotDate = toDateStr(res.slot.slot_date);
          await setStep({ slot_id: res.slot.id, hold_id: res.holdId, selected_date: slotDate, step: "CONFIRM" });
          // Keep the session alive at least as long as the hold.
          await pool.query(
            "UPDATE appointment_booking_sessions SET expires_at = GREATEST(expires_at, (SELECT expires_at FROM appointment_slot_holds WHERE id = ?)) WHERE id = ?",
            [res.holdId, session.id]
          );
        } else {
          session.hold_id = null;
          notice = res.reason === "DAY_FULL"
            ? "⚠️ Sorry, that day just filled up. "
            : "⚠️ Sorry, that time was just taken by someone else. ";
        }
      }

      if (session.step === "SELECT_SLOT") {
        const fresh = notice
          ? await listAvailableSlots(agencyId, targetDate, settings, { staffId })
          : slots;
        if (fresh.length === 0) {
          await setStep({ step: "SELECT_DATE", slot_id: null, hold_id: null });
          const dates = await listAvailableDates(agencyId, settings, { staffId });
          if (!dates.length) {
            await closeSession(session, "CANCELLED", "CANCELLED");
            await reply({ type: "TEXT", body: `${notice}📅 There are no open appointment times left right now. Please check back soon!` });
            await resumeParentFlow(session, "CANCELLED");
            return true;
          }
          await reply({ type: "TEXT", body: `${notice}All times on ${formatDatePretty(targetDate)} are booked. Please choose another day.` });
          return handleAppointmentBooking(agencyId, platform, conversation, contact, "", integration, msgType, null, campaignId, flowContext);
        }

        if (isWhatsApp) {
          const multi = fresh.some((s) => s.max_capacity > 1);
          const page = buildListPage(
            fresh, pageOffset,
            (s) => ({
              id: `apt:slot:${s.id}`,
              title: formatTime12(s.start_time),
              description: multi
                ? `${formatTime12(s.start_time)} - ${formatTime12(s.end_time)} · ${s.free} left`
                : `${formatTime12(s.start_time)} - ${formatTime12(s.end_time)}`,
            }),
            { prevId: (o) => `apt:spage:${o}`, nextId: (o) => `apt:spage:${o}`, maxRows: 9 }
          );
          const rows = [...page.rows, { id: "apt:back", title: "📅 Change day", description: "Pick a different day" }];
          await reply({
            type: "LIST_MENU",
            body: `${notice}⏰ Available times on *${formatDateLong(targetDate)}*:`,
            listMenu: { buttonText: "Select a time", sections: [{ title: "Available times", rows }] },
          });
        } else {
          let text = `${notice}⏰ Available times for *${formatDatePretty(targetDate)}*:\n\n`;
          fresh.slice(0, 10).forEach((s, idx) => {
            text += `${idx + 1}. *${formatTime12(s.start_time)} - ${formatTime12(s.end_time)}*\n`;
          });
          text += "\n_Reply with the number of your choice, or reply CANCEL._";
          await reply({ type: "TEXT", body: text });
        }
        return true;
      }
      // Slot held → fall through to the confirmation prompt.
      return showConfirmPrompt();
    }

    // ── STEP 4: CONFIRMATION ──────────────────────────────────────────────
    if (session.step === "CONFIRM") {
      const isConfirm = lowerMsg === "yes" || lowerMsg === "confirm" || lowerMsg === "1" || effectiveRoute === "apt:confirm";
      const isCancel = lowerMsg === "no" || effectiveRoute === "apt:cancel";

      if (isCancel) {
        await closeSession(session, "CANCELLED", "CANCELLED");
        await reply({
          type: "TEXT",
          body: "🚫 Appointment booking cancelled. Feel free to message us again when you're ready to schedule!",
        });
        await resumeParentFlow(session, "CANCELLED");
        return true;
      }
      if (!isConfirm) return showConfirmPrompt();

      const { serviceName, fee, duration, currency } = await loadService(agencyId, session.service_id);
      const paymentMode = fee > 0 ? settings.payment_mode : "NONE";
      const customer = {
        name: contact.name || session.customer_name || "Client",
        phone: contact.phone || contact.external_id || session.customer_phone || "",
        email: contact.email || session.customer_email || null,
      };

      // Hold gone (expired, or an older session)? Try to get the same slot back.
      if (!session.hold_id || !(await holdIsLive(session.hold_id))) {
        const again = session.slot_id
          ? await reserveSlot({
              agencyId, slotId: session.slot_id, sessionId: session.id, contactId: contact.id,
              conversationId: conversation.id, serviceId: session.service_id || null, settings, staffId,
            })
          : { ok: false };
        if (!again.ok) return slotLost();
        await setStep({ hold_id: again.holdId });
      }

      if (paymentMode === "REQUIRED") {
        return startRequiredPayment({ serviceName, fee, currency, customer });
      }

      const conv = await convertHold(session.hold_id, {
        customer, serviceName, fee, duration, channel: platform || "WHATSAPP",
        paymentStatus: paymentMode === "PAY_LATER" ? "pending" : "unpaid",
      });
      if (!conv.ok) return slotLost();

      await setStep({ status: "COMPLETED", flow_outcome: "CONFIRMED" });
      const [[slot]] = await pool.query("SELECT * FROM appointment_slots WHERE id = ?", [session.slot_id]);
      const date = toDateStr(slot.slot_date);
      emitNewAppointment(agencyId, conv.appointmentId, customer.name, date, slot.start_time, serviceName, platform);

      let payButton = null;
      if (paymentMode === "PAY_LATER") {
        const order = await createAppointmentOrder({
          agencyId, contact, conversation, integration, platform, serviceName, fee, currency, customer,
          appointmentId: conv.appointmentId, date, slot,
        });
        if (order) {
          await pool.query("UPDATE appointments SET chat_order_id = ? WHERE id = ? AND agency_id = ?", [order.orderId, conv.appointmentId, agencyId]);
          payButton = { id: `pay_${order.orderId}`, title: "💳 Pay now", type: "URL", url: order.paymentUrl };
        }
      }

      const text = confirmationText({
        aptId: conv.appointmentId, contact, session, serviceName, date, slot, fee, currency,
        paymentLine: paymentMode === "PAY_LATER" ? "pay now or at your visit" : null,
      });
      await reply(payButton && payButton.url ? { type: "BUTTONS", body: text, buttons: [payButton] } : { type: "TEXT", body: text });

      // Resume parent flow at "confirmed" handle
      await resumeParentFlow(session, "COMPLETED");
      return true;
    }

    // ── STEP 5: WAITING FOR PAYMENT ───────────────────────────────────────
    if (session.step === "AWAITING_PAYMENT") {
      const [[order]] = await pool.query(
        "SELECT * FROM chat_orders WHERE appointment_hold_id = ? AND agency_id = ? ORDER BY id DESC LIMIT 1",
        [session.hold_id, agencyId]
      );
      if (order?.status === "PAID") return true; // confirmation is on its way (payment webhook)
      if (session.hold_id && (await holdIsLive(session.hold_id)) && order?.status === "PENDING") {
        await reply({
          type: "BUTTONS",
          body: `⏳ Your time is reserved until payment is completed. Please pay *${money(order.amount, order.currency)}* to confirm your appointment, or reply CANCEL.`,
          buttons: [{ id: `pay_${order.id}`, title: "💳 Pay now", type: "URL", url: order.payment_url }],
        });
        return true;
      }
      // Reservation ran out before payment.
      if (order?.status === "PENDING") {
        await pool.query("UPDATE chat_orders SET status = 'EXPIRED' WHERE id = ? AND status = 'PENDING'", [order.id]);
      }
      if (session.hold_id) await releaseHold(session.hold_id, "EXPIRED");
      await setStep({ step: "SELECT_DATE", slot_id: null, hold_id: null });
      await reply({ type: "TEXT", body: "⌛ The reserved time was released because payment wasn't completed in time. Please choose a time again." });
      return handleAppointmentBooking(agencyId, platform, conversation, contact, "", integration, msgType, null, campaignId, flowContext);
    }

    return false;

    // ── helpers that need this conversation's context ──────────────────────
    async function showConfirmPrompt() {
      const [[slot]] = await pool.query("SELECT * FROM appointment_slots WHERE id = ? AND agency_id = ?", [session.slot_id, agencyId]);
      const { serviceName, fee, currency } = await loadService(agencyId, session.service_id);
      const [[hold]] = session.hold_id
        ? await pool.query("SELECT GREATEST(0, TIMESTAMPDIFF(MINUTE, NOW(), expires_at)) AS mins FROM appointment_slot_holds WHERE id = ? AND status = 'ACTIVE'", [session.hold_id])
        : [[null]];
      const date = toDateStr(slot?.slot_date);
      const payNote = fee > 0 && settings.payment_mode === "REQUIRED"
        ? "Payment is required to confirm.\n"
        : fee > 0 && settings.payment_mode === "PAY_LATER" ? "You can pay now or later.\n" : "";
      const summaryText =
        `🗓️ *Confirm Your Booking*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *Name:* ${contact.name || "Valued Client"}\n` +
        `💼 *Service:* ${serviceName}\n` +
        `📅 *Date:* ${formatDatePretty(date)}\n` +
        `⏰ *Time:* ${slot ? `${formatTime12(slot.start_time)} - ${formatTime12(slot.end_time)}` : "TBD"}\n` +
        (fee > 0 ? `💵 *Price:* ${money(fee, currency)}\n` : "") +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        payNote +
        (hold ? `This time is reserved for you for ${Math.max(1, Number(hold.mins))} minute(s).\n` : "") +
        `Would you like to confirm this appointment?`;

      if (isWhatsApp) {
        await reply({
          type: "BUTTONS",
          body: summaryText,
          buttons: [
            { id: "apt:confirm", title: "✅ Confirm", type: "reply" },
            { id: "apt:times", title: "⏰ Change time", type: "reply" },
            { id: "apt:cancel", title: "❌ Cancel", type: "reply" },
          ],
        });
      } else {
        await reply({ type: "TEXT", body: `${summaryText}\n\nReply *CONFIRM* to book, or *CANCEL* to stop.` });
      }
      return true;
    }

    async function slotLost() {
      if (session.hold_id) await releaseHold(session.hold_id, "EXPIRED");
      await setStep({ step: "SELECT_SLOT", slot_id: null, hold_id: null });
      await reply({ type: "TEXT", body: "⚠️ Sorry, your reserved time ran out and was taken by someone else. Please choose another time." });
      return handleAppointmentBooking(agencyId, platform, conversation, contact, "", integration, msgType, null, campaignId, flowContext);
    }

    async function startRequiredPayment({ serviceName, fee, currency, customer }) {
      const { stripe } = await import("../services/stripeService.js");
      // A Stripe Checkout session can't expire sooner than 30 minutes, so the
      // hold must last at least that long or someone could pay for a slot that
      // was already given away.
      const payMinutes = Math.max(Number(settings.hold_minutes) || 15, stripe ? 30 : 1);
      const expiresAt = await extendHold(session.hold_id, payMinutes);
      if (!expiresAt) return slotLost();
      const [[slot]] = await pool.query("SELECT * FROM appointment_slots WHERE id = ?", [session.slot_id]);
      const date = toDateStr(slot.slot_date);
      const order = await createAppointmentOrder({
        agencyId, contact, conversation, integration, platform, serviceName, fee, currency, customer,
        holdId: session.hold_id, date, slot, expiresInMinutes: payMinutes,
      });
      if (!order) {
        await reply({ type: "TEXT", body: "❌ We couldn't start the payment right now. Please try again in a moment, or reply CANCEL." });
        return true;
      }
      await setStep({ step: "AWAITING_PAYMENT" });
      await pool.query(
        "UPDATE appointment_booking_sessions SET expires_at = GREATEST(expires_at, NOW() + INTERVAL ? MINUTE) WHERE id = ?",
        [payMinutes + 10, session.id]
      );
      await reply({
        type: "BUTTONS",
        body:
          `💳 *Payment required*\n` +
          `${serviceName} · ${formatDatePretty(date)} ${formatTime12(slot.start_time)}\n` +
          `Amount: *${money(fee, currency)}*\n\n` +
          `Your time is reserved for ${payMinutes} minutes. Your appointment is confirmed as soon as the payment goes through.`,
        buttons: [{ id: `pay_${order.orderId}`, title: "💳 Pay now", type: "URL", url: order.paymentUrl }],
      });
      return true;
    }
  } catch (err) {
    console.error("[APPOINTMENT BOOKING ENGINE ERROR]", err);
    return false;
  }
}

function emitNewAppointment(agencyId, appointmentId, customerName, date, time, service, channel) {
  try {
    emitToAgency(agencyId, "new_appointment", { appointmentId, customerName, date, time, service, channel });
  } catch (e) {}
}

/** In-chat order (services/chatPaymentService.js) for an appointment fee. */
async function createAppointmentOrder({ agencyId, contact, conversation, integration, platform, serviceName, fee, currency, customer, holdId = null, appointmentId = null, date, slot, expiresInMinutes = null }) {
  try {
    const { createChatPaymentLink } = await import("../services/chatPaymentService.js");
    return await createChatPaymentLink({
      agencyId,
      subscriberId: contact?.id || null,
      conversationId: conversation?.id || null,
      integrationId: integration?.id || null,
      productName: `${serviceName} — ${formatDatePretty(date)} ${formatTime12(slot.start_time)}`.slice(0, 250),
      amount: fee,
      currency: currency || "USD",
      customerName: customer?.name || null,
      customerEmail: customer?.email || null,
      customerPhone: customer?.phone || null,
      channel: platform || "WHATSAPP",
      provider: "STRIPE",
      appointmentHoldId: holdId,
      appointmentId,
      expiresInMinutes,
    });
  } catch (err) {
    console.error("[Appointment Engine] Could not create the payment:", err.message);
    return null;
  }
}

async function loadChatContext(agencyId, conversationId) {
  const [[conversation]] = await pool.query("SELECT * FROM conversations WHERE id = ? AND agency_id = ?", [conversationId, agencyId]);
  if (!conversation) return null;
  const [[contact]] = await pool.query("SELECT * FROM contacts WHERE id = ? AND agency_id = ?", [conversation.contact_id, agencyId]);
  const [[integration]] = await pool.query("SELECT * FROM integrations WHERE id = ? AND agency_id = ?", [conversation.integration_id, agencyId]);
  return { conversation, contact, integration, platform: integration?.platform || contact?.platform || "WHATSAPP" };
}

/**
 * A verified payment (chatPaymentService.markOrderPaid) for an appointment order.
 * - Payment-required booking: the hold becomes the appointment (paid, confirmed).
 * - Pay-later booking: the existing appointment is marked paid.
 */
export async function handleAppointmentOrderPaid(order) {
  const agencyId = order.agency_id;
  const ctx = order.conversation_id ? await loadChatContext(agencyId, order.conversation_id) : null;
  const send = (payload) => (ctx?.contact ? sendBookingReply(agencyId, ctx.conversation, ctx.contact, ctx.integration, ctx.platform, payload) : null);

  if (order.appointment_id) {
    const [r] = await pool.query(
      "UPDATE appointments SET payment_status = 'paid', chat_order_id = COALESCE(chat_order_id, ?) WHERE id = ? AND agency_id = ? AND payment_status <> 'paid'",
      [order.id, order.appointment_id, agencyId]
    );
    if (r.affectedRows) {
      emitToAgency(agencyId, "appointment_updated", { id: order.appointment_id, paymentStatus: "paid" });
      await send({ type: "TEXT", body: `✅ Payment received for booking #APT-${order.appointment_id}. Thank you!` });
    }
    return;
  }
  if (!order.appointment_hold_id) return;

  const [[hold]] = await pool.query("SELECT * FROM appointment_slot_holds WHERE id = ? AND agency_id = ?", [order.appointment_hold_id, agencyId]);
  if (!hold) return;
  const [[session]] = hold.booking_session_id
    ? await pool.query("SELECT * FROM appointment_booking_sessions WHERE id = ? AND agency_id = ?", [hold.booking_session_id, agencyId])
    : [[null]];
  const { serviceName, fee, duration, currency } = await loadService(agencyId, hold.service_id);
  const contact = ctx?.contact;
  const customer = {
    name: contact?.name || session?.customer_name || order.customer_name || "Client",
    phone: contact?.phone || contact?.external_id || session?.customer_phone || order.customer_phone || "",
    email: contact?.email || session?.customer_email || order.customer_email || null,
  };
  const conv = await convertHold(hold.id, {
    customer, serviceName, fee: Number(order.amount) || fee, duration, channel: ctx?.platform || order.channel || "WHATSAPP",
    paymentStatus: "paid", chatOrderId: order.id, status: "confirmed", force: true,
  });
  if (!conv.ok) {
    console.error(`[Appointment Engine] Paid order #${order.id} could not be booked: ${conv.reason}`);
    emitToAgency(agencyId, "appointment_attention", { orderId: order.id, reason: conv.reason });
    return;
  }
  await pool.query("UPDATE chat_orders SET appointment_id = ? WHERE id = ?", [conv.appointmentId, order.id]);
  if (conv.alreadyConverted) return;

  const [[slot]] = await pool.query("SELECT * FROM appointment_slots WHERE id = ?", [hold.slot_id]);
  const date = toDateStr(slot.slot_date);
  emitNewAppointment(agencyId, conv.appointmentId, customer.name, date, slot.start_time, serviceName, ctx?.platform);
  if (conv.overbooked) emitToAgency(agencyId, "appointment_attention", { appointmentId: conv.appointmentId, reason: "OVERBOOKED" });

  await send({
    type: "TEXT",
    body: confirmationText({ aptId: conv.appointmentId, contact, session, serviceName, date, slot, fee: Number(order.amount) || fee, currency: order.currency || currency, paymentLine: "paid" }),
  });
  if (session && session.status === "ACTIVE") {
    await pool.query(
      "UPDATE appointment_booking_sessions SET status = 'COMPLETED', flow_outcome = 'CONFIRMED' WHERE id = ?",
      [session.id]
    );
    await resumeAndRunParentFlow(session, "COMPLETED", ctx);
  }
}

/**
 * A payment that failed / whose checkout expired / was cancelled
 * (chatPaymentService.markOrderUnpaid). Frees the held time and tells the customer.
 */
export async function handleAppointmentOrderUnpaid(order, status) {
  const agencyId = order.agency_id;
  if (order.appointment_id) {
    const pay = status === "FAILED" ? "failed" : "pending";
    await pool.query(
      "UPDATE appointments SET payment_status = ? WHERE id = ? AND agency_id = ? AND payment_status IN ('pending','unpaid','failed')",
      [pay, order.appointment_id, agencyId]
    );
    emitToAgency(agencyId, "appointment_updated", { id: order.appointment_id, paymentStatus: pay });
    return;
  }
  if (!order.appointment_hold_id) return;
  const released = await releaseHold(order.appointment_hold_id, status === "EXPIRED" ? "EXPIRED" : "RELEASED");
  const [[hold]] = await pool.query("SELECT booking_session_id FROM appointment_slot_holds WHERE id = ?", [order.appointment_hold_id]);
  if (hold?.booking_session_id) await endAwaitingPaymentSession(agencyId, hold.booking_session_id, released
    ? (status === "FAILED" ? "❌ The payment didn't go through, so the reserved time was released." : "⌛ The payment wasn't completed in time, so the reserved time was released.")
    : null);
}

async function endAwaitingPaymentSession(agencyId, sessionId, message) {
  const [[session]] = await pool.query(
    "SELECT * FROM appointment_booking_sessions WHERE id = ? AND agency_id = ? AND status = 'ACTIVE' AND step = 'AWAITING_PAYMENT'",
    [sessionId, agencyId]
  );
  if (!session) return;
  const [upd] = await pool.query(
    "UPDATE appointment_booking_sessions SET status = 'EXPIRED', flow_outcome = 'CANCELLED' WHERE id = ? AND status = 'ACTIVE'",
    [session.id]
  );
  if (!upd.changedRows) return;
  const ctx = await loadChatContext(agencyId, session.conversation_id);
  const { isWorkspaceExpired } = await import("./subscriptionStatus.js");
  if (message && ctx?.contact && !(await isWorkspaceExpired(agencyId))) {
    await sendBookingReply(agencyId, ctx.conversation, ctx.contact, ctx.integration, ctx.platform, {
      type: "TEXT",
      body: `${message} Reply *book appointment* to choose another time.`,
    });
  }
  await resumeAndRunParentFlow(session, "CANCELLED", ctx);
}

/**
 * Scheduled (utils/appointmentHoldScheduler.js): expires holds past their time.
 * A hold waiting for payment also closes its checkout and tells the customer.
 */
export async function processExpiredHolds() {
  const expired = await expireSlotHolds();
  for (const h of expired) {
    try {
      const [[order]] = await pool.query(
        "SELECT * FROM chat_orders WHERE appointment_hold_id = ? AND status = 'PENDING' ORDER BY id DESC LIMIT 1",
        [h.id]
      );
      if (order) await pool.query("UPDATE chat_orders SET status = 'EXPIRED' WHERE id = ? AND status = 'PENDING'", [order.id]);
      if (h.booking_session_id && order) {
        await endAwaitingPaymentSession(order.agency_id, h.booking_session_id, "⌛ The payment wasn't completed in time, so the reserved time was released.");
      }
    } catch (err) {
      console.error(`[Appointment Holds] Expiring hold ${h.id} failed:`, err.message);
    }
  }
  return expired.length;
}
