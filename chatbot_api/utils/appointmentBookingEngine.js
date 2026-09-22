import pool from "../db.js";
import { sendPlatformMessage } from "./platformSender.js";
import { emitToAgency, emitToConversation } from "./socket.js";
import { saveMessage } from "./messageProcessor.js";

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
 * Format date nicely (e.g., "Wednesday, Sep 24, 2026")
 */
function formatDatePretty(dateStr) {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  } catch (e) {
    return dateStr;
  }
}

/**
 * Main Omnichannel Appointment Booking Handler
 * Returns true if handled, false otherwise
 */
export async function handleAppointmentBooking(agencyId, platform, conversation, contact, incomingMsgBody, integration, msgType, buttonRoute) {
  try {
    const cleanMsg = (incomingMsgBody || "").trim();
    const lowerMsg = cleanMsg.toLowerCase();
    const effectiveRoute = buttonRoute || (cleanMsg.startsWith("apt:") || cleanMsg.startsWith("apt_") ? cleanMsg : null);

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
      await pool.query(
        "UPDATE appointment_booking_sessions SET status = 'CANCELLED' WHERE id = ?",
        [session.id]
      );
      await sendBookingReply(agencyId, conversation, contact, integration, platform, {
        type: "TEXT",
        body: "🚫 Appointment booking has been cancelled. If you'd like to book in the future, just reply *book appointment*!",
      });
      return true;
    }

    // If no active session, check if message is a booking trigger
    if (!session) {
      if (!isAppointmentTrigger(incomingMsgBody, effectiveRoute)) {
        return false;
      }

      // Check if agency has feature_appointments enabled
      const [modules] = await pool.query(
        `SELECT is_active FROM agency_modules WHERE agency_id = ? AND module_key = 'feature_appointments' LIMIT 1`,
        [agencyId]
      );
      // If agency_modules row exists and is_active is 0, skip
      if (modules.length > 0 && modules[0].is_active === 0) {
        return false;
      }

      // Create new booking session with 15-minute expiry
      const [newSess] = await pool.query(
        `INSERT INTO appointment_booking_sessions (
          agency_id, conversation_id, contact_id, platform, step,
          customer_name, customer_phone, customer_email,
          status, expires_at
        ) VALUES (?, ?, ?, ?, 'SELECT_SERVICE', ?, ?, ?, 'ACTIVE', DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
        [
          agencyId,
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
    }

    // ── STEP 1: SELECT SERVICE ─────────────────────────────────────────────
    if (session.step === "SELECT_SERVICE") {
      const [services] = await pool.query(
        "SELECT id, name, description, duration_minutes, price, currency FROM appointment_services WHERE agency_id = ? AND is_active = 1 ORDER BY name ASC",
        [agencyId]
      );

      // If no custom services configured, use default consultation and jump to SELECT_DATE
      if (services.length === 0) {
        session.step = "SELECT_DATE";
        await pool.query("UPDATE appointment_booking_sessions SET step = 'SELECT_DATE' WHERE id = ?", [session.id]);
        // Fall through to SELECT_DATE below
      } else if (services.length === 1) {
        // Automatically select the only available service
        const singleSvc = services[0];
        session.service_id = singleSvc.id;
        session.step = "SELECT_DATE";
        await pool.query(
          "UPDATE appointment_booking_sessions SET service_id = ?, step = 'SELECT_DATE' WHERE id = ?",
          [singleSvc.id, session.id]
        );
        // Fall through to SELECT_DATE below
      } else {
        // Check if user already made a selection
        let selectedService = null;
        if (effectiveRoute && effectiveRoute.startsWith("apt:svc:")) {
          const svcId = parseInt(effectiveRoute.replace("apt:svc:", ""));
          selectedService = services.find((s) => s.id === svcId);
        } else if (/^\d+$/.test(cleanMsg)) {
          const idx = parseInt(cleanMsg) - 1;
          if (idx >= 0 && idx < services.length) {
            selectedService = services[idx];
          }
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
          // Fall through to SELECT_DATE
        } else {
          // Send Service Selection Options
          const serviceRows = services.slice(0, 10).map((s, idx) => ({
            id: `apt:svc:${s.id}`,
            title: `${s.name}`.slice(0, 24),
            description: `${s.duration_minutes}m • ${s.price > 0 ? `${s.currency} ${s.price}` : "Free"}`.slice(0, 72),
          }));

          if (platform === "WHATSAPP") {
            if (services.length <= 3) {
              const buttons = services.map((s) => ({
                id: `apt:svc:${s.id}`,
                title: s.name.slice(0, 20),
                type: "reply",
              }));
              await sendBookingReply(agencyId, conversation, contact, integration, platform, {
                type: "BUTTONS",
                body: "👋 Welcome! Please select the service you would like to book:",
                buttons,
              });
            } else {
              await sendBookingReply(agencyId, conversation, contact, integration, platform, {
                type: "LIST_MENU",
                body: "👋 Welcome! Please select the service you would like to book from the menu below:",
                listMenu: {
                  title: "Services",
                  buttonText: "Choose Service",
                  items: serviceRows,
                },
              });
            }
          } else {
            // Facebook, Instagram, Telegram, Webchat text/button fallback
            let text = "👋 Welcome! Please select a service to book by replying with the number:\n\n";
            services.forEach((s, idx) => {
              text += `${idx + 1}. *${s.name}* (${s.duration_minutes}m - ${s.price > 0 ? `${s.currency} ${s.price}` : "Free"})\n`;
            });
            text += "\n_Or reply CANCEL to stop._";

            await sendBookingReply(agencyId, conversation, contact, integration, platform, {
              type: "TEXT",
              body: text,
            });
          }
          return true;
        }
      }
    }

    // ── STEP 2: SELECT DATE ───────────────────────────────────────────────
    if (session.step === "SELECT_DATE") {
      // Find dates that have active available slots
      const [dates] = await pool.query(
        `SELECT DISTINCT slot_date
         FROM appointment_slots
         WHERE agency_id = ?
           AND is_active = 1
           AND slot_date >= CURDATE()
           AND (max_capacity - booked_count) > 0
         ORDER BY slot_date ASC
         LIMIT 6`,
        [agencyId]
      );

      if (dates.length === 0) {
        await pool.query("UPDATE appointment_booking_sessions SET status = 'CANCELLED' WHERE id = ?", [session.id]);
        await sendBookingReply(agencyId, conversation, contact, integration, platform, {
          type: "TEXT",
          body: "📅 Sorry, there are currently no open appointment dates available. Please check back soon or message our team for assistance!",
        });
        return true;
      }

      // Check if user selected a date
      let selectedDate = null;
      if (effectiveRoute && effectiveRoute.startsWith("apt:date:")) {
        selectedDate = effectiveRoute.replace("apt:date:", "");
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(cleanMsg)) {
        selectedDate = cleanMsg;
      } else if (/^\d+$/.test(cleanMsg)) {
        const idx = parseInt(cleanMsg) - 1;
        if (idx >= 0 && idx < dates.length) {
          selectedDate = dates[idx].slot_date.toISOString().split("T")[0];
        }
      } else if (lowerMsg === "today") {
        selectedDate = new Date().toISOString().split("T")[0];
      } else if (lowerMsg === "tomorrow") {
        const tom = new Date();
        tom.setDate(tom.getDate() + 1);
        selectedDate = tom.toISOString().split("T")[0];
      }

      const validDateObj = selectedDate ? dates.find((d) => {
        const dStr = typeof d.slot_date === "string" ? d.slot_date : d.slot_date.toISOString().split("T")[0];
        return dStr === selectedDate;
      }) : null;

      if (validDateObj) {
        const finalDateStr = typeof validDateObj.slot_date === "string" ? validDateObj.slot_date : validDateObj.slot_date.toISOString().split("T")[0];
        session.selected_date = finalDateStr;
        session.step = "SELECT_SLOT";
        await pool.query(
          "UPDATE appointment_booking_sessions SET selected_date = ?, step = 'SELECT_SLOT' WHERE id = ?",
          [finalDateStr, session.id]
        );
        // Fall through to SELECT_SLOT
      } else {
        // Send Date Selection
        const dateRows = dates.map((d, idx) => {
          const dStr = typeof d.slot_date === "string" ? d.slot_date : d.slot_date.toISOString().split("T")[0];
          return {
            id: `apt:date:${dStr}`,
            title: formatDatePretty(dStr).slice(0, 24),
            description: `Date: ${dStr}`,
          };
        });

        if (platform === "WHATSAPP") {
          if (dates.length <= 3) {
            const buttons = dateRows.map((d) => ({
              id: d.id,
              title: d.title.slice(0, 20),
              type: "reply",
            }));
            await sendBookingReply(agencyId, conversation, contact, integration, platform, {
              type: "BUTTONS",
              body: "📅 Please pick your preferred appointment date:",
              buttons,
            });
          } else {
            await sendBookingReply(agencyId, conversation, contact, integration, platform, {
              type: "LIST_MENU",
              body: "📅 Please choose an available date for your appointment:",
              listMenu: {
                title: "Available Dates",
                buttonText: "Select Date",
                items: dateRows,
              },
            });
          }
        } else {
          let text = "📅 Please select an available date by replying with the number:\n\n";
          dates.forEach((d, idx) => {
            const dStr = typeof d.slot_date === "string" ? d.slot_date : d.slot_date.toISOString().split("T")[0];
            text += `${idx + 1}. *${formatDatePretty(dStr)}* (${dStr})\n`;
          });
          text += "\n_Or reply CANCEL to stop._";

          await sendBookingReply(agencyId, conversation, contact, integration, platform, {
            type: "TEXT",
            body: text,
          });
        }
        return true;
      }
    }

    // ── STEP 3: SELECT TIME SLOT ──────────────────────────────────────────
    if (session.step === "SELECT_SLOT") {
      const targetDate = typeof session.selected_date === "string" ? session.selected_date : session.selected_date.toISOString().split("T")[0];

      const [slots] = await pool.query(
        `SELECT id, start_time, end_time, slot_duration, max_capacity, booked_count
         FROM appointment_slots
         WHERE agency_id = ?
           AND slot_date = ?
           AND is_active = 1
           AND (max_capacity - booked_count) > 0
         ORDER BY start_time ASC
         LIMIT 10`,
        [agencyId, targetDate]
      );

      if (slots.length === 0) {
        // No slots left for this date
        session.step = "SELECT_DATE";
        await pool.query("UPDATE appointment_booking_sessions SET step = 'SELECT_DATE' WHERE id = ?", [session.id]);
        await sendBookingReply(agencyId, conversation, contact, integration, platform, {
          type: "TEXT",
          body: `⚠️ All slots for ${formatDatePretty(targetDate)} are now booked. Please reply with another date:`,
        });
        return true;
      }

      // Check if user selected a slot
      let selectedSlot = null;
      if (effectiveRoute && effectiveRoute.startsWith("apt:slot:")) {
        const slotId = parseInt(effectiveRoute.replace("apt:slot:", ""));
        selectedSlot = slots.find((s) => s.id === slotId);
      } else if (/^\d+$/.test(cleanMsg)) {
        const idx = parseInt(cleanMsg) - 1;
        if (idx >= 0 && idx < slots.length) {
          selectedSlot = slots[idx];
        }
      } else {
        selectedSlot = slots.find((s) => {
          const st = s.start_time.substring(0, 5);
          return lowerMsg.includes(st);
        });
      }

      if (selectedSlot) {
        session.slot_id = selectedSlot.id;
        session.step = "CONFIRM";
        await pool.query(
          "UPDATE appointment_booking_sessions SET slot_id = ?, step = 'CONFIRM' WHERE id = ?",
          [selectedSlot.id, session.id]
        );
        // Fall through to CONFIRM
      } else {
        // Send Slot Options
        const slotRows = slots.map((s, idx) => ({
          id: `apt:slot:${s.id}`,
          title: `${s.start_time.substring(0, 5)} - ${s.end_time.substring(0, 5)}`,
          description: `${s.max_capacity - s.booked_count} slot(s) left`,
        }));

        if (platform === "WHATSAPP") {
          if (slots.length <= 3) {
            const buttons = slotRows.map((s) => ({
              id: s.id,
              title: s.title.slice(0, 20),
              type: "reply",
            }));
            await sendBookingReply(agencyId, conversation, contact, integration, platform, {
              type: "BUTTONS",
              body: `⏰ Available times for *${formatDatePretty(targetDate)}*:`,
              buttons,
            });
          } else {
            await sendBookingReply(agencyId, conversation, contact, integration, platform, {
              type: "LIST_MENU",
              body: `⏰ Please choose an available time window for *${formatDatePretty(targetDate)}*:`,
              listMenu: {
                title: "Available Slots",
                buttonText: "Choose Time",
                items: slotRows,
              },
            });
          }
        } else {
          let text = `⏰ Available times for *${formatDatePretty(targetDate)}*:\n\n`;
          slots.forEach((s, idx) => {
            text += `${idx + 1}. *${s.start_time.substring(0, 5)} - ${s.end_time.substring(0, 5)}*\n`;
          });
          text += "\n_Reply with the number of your choice, or reply CANCEL._";

          await sendBookingReply(agencyId, conversation, contact, integration, platform, {
            type: "TEXT",
            body: text,
          });
        }
        return true;
      }
    }

    // ── STEP 4: CONFIRMATION ──────────────────────────────────────────────
    if (session.step === "CONFIRM") {
      // Look up slot details
      const [slotRows] = await pool.query(
        "SELECT * FROM appointment_slots WHERE id = ? AND agency_id = ?",
        [session.slot_id, agencyId]
      );
      const slot = slotRows[0];

      // Look up service details
      let serviceName = "General Consultation";
      let fee = 0.0;
      let duration = 30;
      if (session.service_id) {
        const [svcRows] = await pool.query(
          "SELECT * FROM appointment_services WHERE id = ? AND agency_id = ?",
          [session.service_id, agencyId]
        );
        if (svcRows.length) {
          serviceName = svcRows[0].name;
          fee = svcRows[0].price;
          duration = svcRows[0].duration_minutes;
        }
      }

      const isConfirm =
        lowerMsg === "yes" ||
        lowerMsg === "confirm" ||
        lowerMsg === "1" ||
        effectiveRoute === "apt:confirm";

      const isCancel =
        lowerMsg === "no" ||
        lowerMsg === "cancel" ||
        effectiveRoute === "apt:cancel";

      if (isConfirm) {
        if (!slot) {
          await pool.query("UPDATE appointment_booking_sessions SET status = 'CANCELLED' WHERE id = ?", [session.id]);
          await sendBookingReply(agencyId, conversation, contact, integration, platform, {
            type: "TEXT",
            body: "⚠️ The selected slot is no longer valid. Please start again by replying *book appointment*.",
          });
          return true;
        }

        // Atomic booking transaction
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();

          const [lockSlots] = await conn.query(
            "SELECT id, booked_count, max_capacity FROM appointment_slots WHERE id = ? FOR UPDATE",
            [slot.id]
          );

          if (!lockSlots.length || lockSlots[0].booked_count >= lockSlots[0].max_capacity) {
            await conn.rollback();
            await pool.query("UPDATE appointment_booking_sessions SET status = 'CANCELLED' WHERE id = ?", [session.id]);
            await sendBookingReply(agencyId, conversation, contact, integration, platform, {
              type: "TEXT",
              body: "⚠️ Sorry, that slot was just filled by someone else! Please reply *book appointment* to pick another time.",
            });
            return true;
          }

          // Increment slot
          await conn.query("UPDATE appointment_slots SET booked_count = booked_count + 1 WHERE id = ?", [slot.id]);

          // Insert Appointment
          const targetDate = typeof slot.slot_date === "string" ? slot.slot_date : slot.slot_date.toISOString().split("T")[0];
          const [ins] = await conn.query(
            `INSERT INTO appointments (
              agency_id, service_id, contact_id, staff_id, slot_id,
              customer_name, customer_phone, customer_email,
              service_name, appointment_date, appointment_time,
              duration, fee, channel, status, booking_source
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', 'CHATBOT')`,
            [
              agencyId,
              session.service_id || null,
              contact.id,
              slot.staff_id || null,
              slot.id,
              contact.name || session.customer_name || "Client",
              contact.phone || contact.external_id || "",
              contact.email || null,
              serviceName,
              targetDate,
              slot.start_time,
              duration,
              fee,
              platform || "WHATSAPP",
            ]
          );

          // Mark session completed
          await conn.query("UPDATE appointment_booking_sessions SET status = 'COMPLETED' WHERE id = ?", [session.id]);

          await conn.commit();

          const aptId = ins.insertId;

          // Emit live dashboard event
          try {
            emitToAgency(agencyId, "new_appointment", {
              appointmentId: aptId,
              customerName: contact.name || "Client",
              date: targetDate,
              time: slot.start_time,
              service: serviceName,
              channel: platform,
            });
          } catch (e) {}

          // Confirmation message
          const confirmationText =
            `🎉 *Appointment Confirmed!*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📋 *Booking ID:* #APT-${aptId}\n` +
            `👤 *Client:* ${contact.name || "Valued Client"}\n` +
            `💼 *Service:* ${serviceName}\n` +
            `📅 *Date:* ${formatDatePretty(targetDate)}\n` +
            `⏰ *Time:* ${slot.start_time.substring(0, 5)} - ${slot.end_time.substring(0, 5)}\n` +
            (fee > 0 ? `💵 *Fee:* $${parseFloat(fee).toFixed(2)}\n` : "") +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Thank you for scheduling with us! We look forward to meeting you.`;

          await sendBookingReply(agencyId, conversation, contact, integration, platform, {
            type: "TEXT",
            body: confirmationText,
          });

          return true;
        } catch (txErr) {
          await conn.rollback();
          console.error("[APPOINTMENT TRANSACTION ERROR]", txErr);
          await sendBookingReply(agencyId, conversation, contact, integration, platform, {
            type: "TEXT",
            body: "❌ We experienced a technical error confirming your appointment. Please try again shortly.",
          });
          return true;
        } finally {
          conn.release();
        }
      } else if (isCancel) {
        await pool.query("UPDATE appointment_booking_sessions SET status = 'CANCELLED' WHERE id = ?", [session.id]);
        await sendBookingReply(agencyId, conversation, contact, integration, platform, {
          type: "TEXT",
          body: "🚫 Appointment booking cancelled. Feel free to message us again when you're ready to schedule!",
        });
        return true;
      } else {
        // Show Confirmation Prompt
        const targetDate = typeof slot.slot_date === "string" ? slot.slot_date : slot.slot_date.toISOString().split("T")[0];
        const summaryText =
          `🗓️ *Confirm Your Booking*\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `👤 *Name:* ${contact.name || "Valued Client"}\n` +
          `💼 *Service:* ${serviceName}\n` +
          `📅 *Date:* ${formatDatePretty(targetDate)}\n` +
          `⏰ *Time:* ${slot.start_time.substring(0, 5)} - ${slot.end_time.substring(0, 5)}\n` +
          (fee > 0 ? `💵 *Price:* $${parseFloat(fee).toFixed(2)}\n` : "") +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `Would you like to confirm this appointment?`;

        if (platform === "WHATSAPP") {
          await sendBookingReply(agencyId, conversation, contact, integration, platform, {
            type: "BUTTONS",
            body: summaryText,
            buttons: [
              { id: "apt:confirm", title: "✅ Confirm", type: "reply" },
              { id: "apt:cancel", title: "❌ Cancel", type: "reply" },
            ],
          });
        } else {
          await sendBookingReply(agencyId, conversation, contact, integration, platform, {
            type: "TEXT",
            body: `${summaryText}\n\nReply *CONFIRM* to book, or *CANCEL* to stop.`,
          });
        }
        return true;
      }
    }

    return false;
  } catch (err) {
    console.error("[APPOINTMENT BOOKING ENGINE ERROR]", err);
    return false;
  }
}
