/**
 * WhatsApp appointment booking against the real DB — holds, races, expiry,
 * payment required / pay later, payment failure. Never calls Meta or Stripe
 * successfully (a throw-away WhatsApp integration with a fake token is used;
 * sends fail and are only logged). Everything it creates is removed, and the
 * workspace's booking settings are restored.
 * Run: npm run test:appointments
 */
import assert from "node:assert/strict";
import pool from "../db.js";
import {
  reserveSlot, convertHold, listAvailableSlots, listAvailableDates, getBookingSettings, freeCapacitySql, releaseHold,
} from "../utils/appointmentAvailability.js";
import { handleAppointmentBooking, processExpiredHolds } from "../utils/appointmentBookingEngine.js";
import { markOrderPaid, markOrderUnpaid } from "../services/chatPaymentService.js";

import { assertModuleAccess } from "../utils/entitlements.js";

const ok = (m) => console.log(`  ✔ ${m}`);
// An active End User / Reseller workspace whose plan includes Appointments.
const [candidates] = await pool.query(
  "SELECT a.id FROM agencies a WHERE a.account_type IN ('DIRECT_CUSTOMER','RESELLER','RESELLER_CUSTOMER') AND a.is_active = 1 ORDER BY a.id"
);
let agency = null;
for (const c of candidates) {
  if (await assertModuleAccess(c.id, "feature_appointments").then(() => true, () => false)) { agency = c; break; }
}
assert.ok(agency, "needs an active workspace whose plan includes the Appointments module");
const agencyId = agency.id;
const [[savedSettings]] = await pool.query("SELECT * FROM appointment_settings WHERE agency_id = ?", [agencyId]);
const [[{ d1, d2 }]] = await pool.query(
  "SELECT DATE_FORMAT(CURDATE() + INTERVAL 200 DAY, '%Y-%m-%d') d1, DATE_FORMAT(CURDATE() + INTERVAL 201 DAY, '%Y-%m-%d') d2"
);

const created = { slots: [], contacts: [], convs: [], appointments: [], orders: [] };
const [integ] = await pool.query(
  "INSERT INTO integrations (agency_id, platform, name, access_token, is_active) VALUES (?, 'WHATSAPP', 'appointment-test', 'fake-token', 1)",
  [agencyId]
);
const integration = { id: integ.insertId, agency_id: agencyId, platform: "WHATSAPP", access_token: "fake-token" };
const [svc] = await pool.query(
  "INSERT INTO appointment_services (agency_id, name, duration_minutes, price, currency, is_active) VALUES (?, 'Test Checkup', 30, 25.00, 'USD', 1)",
  [agencyId]
);
const serviceId = svc.insertId;
const [cam] = await pool.query(
  "INSERT INTO appointment_campaigns (agency_id, name, service_ids, is_active) VALUES (?, 'appointment-test', ?, 1)",
  [agencyId, JSON.stringify([serviceId])]
);
const campaignId = cam.insertId;

async function makeSubscriber(n) {
  const ext = `88017000${Date.now() % 100000}${n}`;
  const [c] = await pool.query(
    "INSERT INTO contacts (agency_id, platform, external_id, name, phone, source) VALUES (?, 'WHATSAPP', ?, ?, ?, 'MANUAL')",
    [agencyId, ext, `Apt Tester ${n}`, ext]
  );
  created.contacts.push(c.insertId);
  const [cv] = await pool.query(
    "INSERT INTO conversations (agency_id, contact_id, integration_id, status) VALUES (?, ?, ?, 'OPEN')",
    [agencyId, c.insertId, integration.id]
  );
  created.convs.push(cv.insertId);
  const [[contact]] = await pool.query("SELECT * FROM contacts WHERE id = ?", [c.insertId]);
  const [[conversation]] = await pool.query("SELECT * FROM conversations WHERE id = ?", [cv.insertId]);
  return { contact, conversation };
}

async function makeSlot(date, time, capacity = 1) {
  const [end] = [time.replace(/:00$/, ":30")];
  const [r] = await pool.query(
    "INSERT INTO appointment_slots (agency_id, slot_date, start_time, end_time, slot_duration, max_capacity) VALUES (?, ?, ?, ?, 30, ?)",
    [agencyId, date, time, end, capacity]
  );
  created.slots.push(r.insertId);
  return r.insertId;
}

async function setSettings(s) {
  await pool.query(
    `INSERT INTO appointment_settings (agency_id, payment_mode, hold_minutes, booking_window_days, min_notice_minutes, max_bookings_per_day, timezone)
     VALUES (?, ?, ?, 365, 0, ?, NULL)
     ON DUPLICATE KEY UPDATE payment_mode = VALUES(payment_mode), hold_minutes = VALUES(hold_minutes),
       booking_window_days = 365, min_notice_minutes = 0, max_bookings_per_day = VALUES(max_bookings_per_day), timezone = NULL`,
    [agencyId, s.payment_mode || "NONE", s.hold_minutes || 15, s.max_bookings_per_day ?? null]
  );
}

const session = async (conversationId) => {
  const [[s]] = await pool.query("SELECT * FROM appointment_booking_sessions WHERE conversation_id = ? ORDER BY id DESC LIMIT 1", [conversationId]);
  return s;
};
const say = (sub, text, route = null) =>
  handleAppointmentBooking(agencyId, "WHATSAPP", sub.conversation, sub.contact, text, integration, route ? "INTERACTIVE" : "TEXT", route, campaignId);

try {
  await setSettings({ payment_mode: "NONE" });
  const settings = await getBookingSettings(agencyId);

  // ── 1. Two (twenty) subscribers race for one place ─────────────────────────
  console.log("Race");
  const raceSlot = await makeSlot(d1, "09:00:00", 1);
  const racers = await Promise.all(Array.from({ length: 20 }, () =>
    reserveSlot({ agencyId, slotId: raceSlot, settings })
  ));
  assert.equal(racers.filter((r) => r.ok).length, 1, "exactly one hold wins a capacity-1 slot");
  assert.ok(racers.filter((r) => !r.ok).every((r) => r.reason === "FULL"));
  ok("20 concurrent reservations → exactly 1 hold");
  const winner = racers.find((r) => r.ok);
  assert.ok(!(await listAvailableSlots(agencyId, d1, settings)).some((s) => s.id === raceSlot), "held slot hidden from others");
  assert.ok((await listAvailableSlots(agencyId, d1, settings, { excludeHoldId: winner.holdId })).some((s) => s.id === raceSlot), "…but still shown to its holder");
  const [[pub]] = await pool.query(`SELECT ${freeCapacitySql("s")} AS free FROM appointment_slots s WHERE s.id = ?`, [raceSlot]);
  assert.equal(Number(pub.free), 0, "public availability counts the hold");
  ok("held slot hidden from other subscribers and the public booking page");

  // ── 2. Expiry frees the slot without the job; the job marks it EXPIRED ─────
  await pool.query("UPDATE appointment_slot_holds SET expires_at = NOW() - INTERVAL 1 SECOND WHERE id = ?", [winner.holdId]);
  assert.ok((await listAvailableSlots(agencyId, d1, settings)).some((s) => s.id === raceSlot), "expired hold no longer blocks");
  await processExpiredHolds();
  const [[expired]] = await pool.query("SELECT status FROM appointment_slot_holds WHERE id = ?", [winner.holdId]);
  assert.equal(expired.status, "EXPIRED");
  ok("expired hold frees the slot immediately; job marks it EXPIRED");

  // ── 3. Converting: once, idempotent; expired hold + slot taken ─────────────
  const h1 = await reserveSlot({ agencyId, slotId: raceSlot, settings });
  const conv1 = await convertHold(h1.holdId, { customer: { name: "A" }, serviceName: "X", fee: 0 });
  assert.ok(conv1.ok);
  created.appointments.push(conv1.appointmentId);
  const again = await convertHold(h1.holdId, { customer: { name: "A" }, serviceName: "X", fee: 0 });
  assert.equal(again.appointmentId, conv1.appointmentId);
  assert.ok(again.alreadyConverted);
  const [[bc]] = await pool.query("SELECT booked_count FROM appointment_slots WHERE id = ?", [raceSlot]);
  assert.equal(bc.booked_count, 1, "booked once");
  assert.equal((await reserveSlot({ agencyId, slotId: raceSlot, settings })).ok, false, "full after booking");
  ok("hold → appointment exactly once (booked_count 1), slot then full");

  const lateSlot = await makeSlot(d1, "09:30:00", 1);
  const late = await reserveSlot({ agencyId, slotId: lateSlot, settings });
  await pool.query("UPDATE appointment_slot_holds SET expires_at = NOW() - INTERVAL 1 SECOND WHERE id = ?", [late.holdId]);
  const other = await reserveSlot({ agencyId, slotId: lateSlot, settings });
  assert.ok(other.ok, "someone else takes the slot after the hold expired");
  assert.equal((await convertHold(late.holdId, { customer: {}, serviceName: "X" })).ok, false, "late confirm refused");
  const forced = await convertHold(late.holdId, { customer: {}, serviceName: "X", force: true, paymentStatus: "paid" });
  assert.ok(forced.ok && forced.overbooked, "a paid late booking is kept and flagged");
  created.appointments.push(forced.appointmentId);
  await releaseHold(other.holdId);
  ok("late confirm refused when the slot was taken; a verified payment is booked and flagged");

  // ── 4. Daily cap ──────────────────────────────────────────────────────────
  await setSettings({ payment_mode: "NONE", max_bookings_per_day: 1 });
  const capSettings = await getBookingSettings(agencyId);
  await makeSlot(d1, "10:00:00", 1);
  assert.ok(!(await listAvailableDates(agencyId, capSettings)).some((d) => d.date === d1), "day at its cap is hidden");
  assert.deepEqual(await listAvailableSlots(agencyId, d1, capSettings), []);
  await setSettings({ payment_mode: "NONE" });
  ok("maximum appointments per day hides a full day");

  // ── 5. Full engine: payment REQUIRED, paid via webhook ────────────────────
  console.log("Engine: payment required");
  await setSettings({ payment_mode: "REQUIRED", hold_minutes: 15 });
  const paySlot = await makeSlot(d2, "11:00:00", 1);
  const subA = await makeSubscriber("a");
  const subB = await makeSubscriber("b");
  assert.equal(await say(subA, "book appointment"), true);
  let sA = await session(subA.conversation.id);
  assert.equal(sA.step, "SELECT_DATE", "single campaign service auto-selected → day list");
  const [[dayList]] = await pool.query(
    "SELECT metadata FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1", [subA.conversation.id]
  );
  const meta = typeof dayList.metadata === "string" ? JSON.parse(dayList.metadata) : dayList.metadata;
  const rows = meta.listMenu.sections.flatMap((s) => s.rows);
  assert.ok(rows.length <= 10 && rows.every((r) => r.title.length <= 24));
  ok(`day list sent as a WhatsApp list (${rows.length} rows ≤ 10)`);

  await say(subA, "x", `apt:date:${d2}`);
  sA = await session(subA.conversation.id);
  assert.equal(sA.step, "SELECT_SLOT");
  await say(subA, "11:00 AM", `apt:slot:${paySlot}`);
  sA = await session(subA.conversation.id);
  assert.equal(sA.step, "CONFIRM");
  assert.ok(sA.hold_id, "slot held on selection");
  ok("day → time → slot held (step CONFIRM)");

  // B sees no such time and can't take it
  await say(subB, "book appointment");
  await say(subB, "x", `apt:date:${d2}`);
  let sB = await session(subB.conversation.id);
  if (sB.step === "SELECT_SLOT") {
    await say(subB, "x", `apt:slot:${paySlot}`); // tapped from a stale list
    sB = await session(subB.conversation.id);
    assert.notEqual(sB.step, "CONFIRM", "B never gets A's held slot");
    assert.equal(sB.hold_id, null);
  }
  ok("second subscriber cannot take the held slot (re-checked server-side)");

  await say(subA, "Confirm", "apt:confirm");
  sA = await session(subA.conversation.id);
  assert.equal(sA.step, "AWAITING_PAYMENT");
  const [[order]] = await pool.query("SELECT * FROM chat_orders WHERE appointment_hold_id = ?", [sA.hold_id]);
  created.orders.push(order.id);
  assert.equal(order.status, "PENDING");
  assert.equal(Number(order.amount), 25);
  const [[noApt]] = await pool.query("SELECT COUNT(*) n FROM appointments WHERE slot_id = ?", [paySlot]);
  assert.equal(noApt.n, 0, "no appointment before payment");
  ok("confirm → checkout created, appointment not yet booked");

  await markOrderPaid(order.id);
  await new Promise((r) => setTimeout(r, 500)); // continueAfterPayment runs in the background
  const [[apt]] = await pool.query("SELECT * FROM appointments WHERE slot_id = ? AND chat_order_id = ?", [paySlot, order.id]);
  assert.ok(apt, "appointment booked after payment");
  created.appointments.push(apt.id);
  assert.equal(apt.payment_status, "paid");
  assert.equal(apt.status, "confirmed");
  sA = await session(subA.conversation.id);
  assert.equal(sA.status, "COMPLETED");
  await markOrderPaid(order.id);
  const [[count]] = await pool.query("SELECT COUNT(*) n FROM appointments WHERE slot_id = ?", [paySlot]);
  assert.equal(count.n, 1, "a repeated payment report books nothing twice");
  ok("payment success → appointment confirmed + paid (once); payment status separate from appointment status");

  // ── 6. Payment failure / expiry releases the slot ─────────────────────────
  console.log("Engine: payment failure");
  const failSlot = await makeSlot(d2, "12:00:00", 1);
  await pool.query("UPDATE appointment_booking_sessions SET status = 'CANCELLED' WHERE conversation_id = ? AND status = 'ACTIVE'", [subB.conversation.id]);
  await say(subB, "book appointment");
  await say(subB, "x", `apt:date:${d2}`);
  await say(subB, "x", `apt:slot:${failSlot}`);
  await say(subB, "Confirm", "apt:confirm");
  sB = await session(subB.conversation.id);
  assert.equal(sB.step, "AWAITING_PAYMENT");
  const [[order2]] = await pool.query("SELECT * FROM chat_orders WHERE appointment_hold_id = ?", [sB.hold_id]);
  created.orders.push(order2.id);
  await markOrderUnpaid(order2.id, "EXPIRED");
  const [[hold2]] = await pool.query("SELECT status FROM appointment_slot_holds WHERE id = ?", [sB.hold_id]);
  assert.equal(hold2.status, "EXPIRED");
  assert.ok((await listAvailableSlots(agencyId, d2, await getBookingSettings(agencyId))).some((s) => s.id === failSlot), "slot free again");
  sB = await session(subB.conversation.id);
  assert.equal(sB.status, "EXPIRED");
  const [[o2]] = await pool.query("SELECT status FROM chat_orders WHERE id = ?", [order2.id]);
  assert.equal(o2.status, "EXPIRED");
  ok("expired/failed payment → hold released, slot bookable again, session closed");

  // ── 7. Pay later ──────────────────────────────────────────────────────────
  console.log("Engine: pay later");
  await setSettings({ payment_mode: "PAY_LATER" });
  const subC = await makeSubscriber("c");
  await say(subC, "book appointment");
  await say(subC, "x", `apt:date:${d2}`);
  await say(subC, "x", `apt:slot:${failSlot}`);
  await say(subC, "Confirm", "apt:confirm");
  const sC = await session(subC.conversation.id);
  assert.equal(sC.status, "COMPLETED");
  const [[aptC]] = await pool.query("SELECT * FROM appointments WHERE slot_id = ? AND status <> 'cancelled'", [failSlot]);
  created.appointments.push(aptC.id);
  assert.equal(aptC.status, "scheduled");
  assert.equal(aptC.payment_status, "pending");
  assert.ok(aptC.chat_order_id);
  created.orders.push(aptC.chat_order_id);
  await markOrderPaid(aptC.chat_order_id);
  await new Promise((r) => setTimeout(r, 300));
  const [[aptC2]] = await pool.query("SELECT payment_status, status FROM appointments WHERE id = ?", [aptC.id]);
  assert.equal(aptC2.payment_status, "paid");
  assert.equal(aptC2.status, "scheduled");
  ok("pay later → booked with payment pending; later payment marks it paid");

  // ── 8. Pagination of many slots in one day ────────────────────────────────
  const d3slots = [];
  for (let h = 8; h < 20; h++) d3slots.push(await makeSlot(d2, `${String(h).padStart(2, "0")}:15:00`, 1));
  const subD = await makeSubscriber("d");
  await say(subD, "book appointment");
  await say(subD, "x", `apt:date:${d2}`);
  const [[slotList]] = await pool.query("SELECT metadata FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1", [subD.conversation.id]);
  const slotRows = (typeof slotList.metadata === "string" ? JSON.parse(slotList.metadata) : slotList.metadata).listMenu.sections.flatMap((s) => s.rows);
  assert.ok(slotRows.length <= 10, "never more than 10 rows");
  assert.ok(slotRows.some((r) => r.id.startsWith("apt:spage:")), "a More row when times don't fit");
  assert.ok(slotRows.some((r) => r.id === "apt:back"), "a Change day row");
  ok(`${slotRows.length}-row time list with More / Change day for a busy day`);

  console.log("✅ Appointment booking: all checks passed");
} finally {
  if (created.orders.length) await pool.query("DELETE FROM chat_orders WHERE id IN (?)", [created.orders]);
  await pool.query("DELETE FROM chat_orders WHERE agency_id = ? AND integration_id = ?", [agencyId, integration.id]);
  await pool.query("DELETE FROM appointments WHERE agency_id = ? AND slot_id IN (?)", [agencyId, created.slots.length ? created.slots : [0]]);
  if (created.slots.length) await pool.query("DELETE FROM appointment_slots WHERE id IN (?)", [created.slots]); // cascades holds
  if (created.convs.length) {
    await pool.query("DELETE FROM appointment_booking_sessions WHERE conversation_id IN (?)", [created.convs]);
    await pool.query("DELETE FROM conversations WHERE id IN (?)", [created.convs]); // cascades messages
  }
  if (created.contacts.length) await pool.query("DELETE FROM contacts WHERE id IN (?)", [created.contacts]);
  await pool.query("DELETE FROM appointment_campaigns WHERE id = ?", [campaignId]);
  await pool.query("DELETE FROM appointment_services WHERE id = ?", [serviceId]);
  await pool.query("DELETE FROM integrations WHERE id = ?", [integration.id]);
  if (savedSettings) {
    const s = savedSettings;
    await pool.query(
      `UPDATE appointment_settings SET payment_mode = ?, hold_minutes = ?, booking_window_days = ?, min_notice_minutes = ?, max_bookings_per_day = ?, timezone = ? WHERE agency_id = ?`,
      [s.payment_mode, s.hold_minutes, s.booking_window_days, s.min_notice_minutes, s.max_bookings_per_day, s.timezone, agencyId]
    );
  } else {
    await pool.query("DELETE FROM appointment_settings WHERE agency_id = ?", [agencyId]);
  }
  await pool.end();
}
