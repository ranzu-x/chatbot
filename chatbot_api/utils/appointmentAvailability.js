/**
 * Appointment availability, temporary slot holds and booking conversion.
 *
 * A slot's free capacity is
 *     max_capacity - booked_count - (ACTIVE holds whose expires_at > NOW())
 * computed in SQL every time (FREE_CAPACITY). Holds therefore stop counting the
 * moment they expire, even if the cleanup job (expireSlotHolds) runs late.
 *
 * Every write that changes a slot's occupancy locks the slot row first
 * (SELECT … FOR UPDATE) and only then the hold row, so two subscribers picking
 * the same slot are serialised by the database and at most max_capacity of
 * them get it. The WhatsApp list a subscriber tapped is never trusted — the
 * slot is re-checked when it is picked (reserveSlot) and again when the
 * booking is confirmed (convertHold).
 */
import pool from "../db.js";

export const PAYMENT_MODES = ["NONE", "REQUIRED", "PAY_LATER"];

export const DEFAULT_BOOKING_SETTINGS = Object.freeze({
  payment_mode: "NONE",
  hold_minutes: 15,
  booking_window_days: 30,
  min_notice_minutes: 0,
  max_bookings_per_day: null,
  timezone: null,
});

const LIMITS = {
  hold_minutes: [1, 1440],
  booking_window_days: [1, 365],
  min_notice_minutes: [0, 43200],
  max_bookings_per_day: [1, 10000],
};

/** SQL: free capacity of slot alias `s` (optionally ignoring one hold). */
export function freeCapacitySql(alias = "s", excludeHold = false) {
  return `(${alias}.max_capacity - ${alias}.booked_count - (
    SELECT COUNT(*) FROM appointment_slot_holds h
     WHERE h.slot_id = ${alias}.id AND h.status = 'ACTIVE' AND h.expires_at > NOW()${excludeHold ? " AND h.id <> ?" : ""}
  ))`;
}

export function isValidTimezone(tz) {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Cleans a settings payload from the dashboard. Unknown / invalid values → error list. */
export function cleanBookingSettings(input = {}) {
  const out = {};
  const errors = [];
  if (input.payment_mode !== undefined) {
    if (!PAYMENT_MODES.includes(input.payment_mode)) errors.push("Payment must be NONE, REQUIRED or PAY_LATER.");
    else out.payment_mode = input.payment_mode;
  }
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    if (input[key] === undefined) continue;
    if (key === "max_bookings_per_day" && (input[key] === null || input[key] === "" || Number(input[key]) === 0)) {
      out[key] = null;
      continue;
    }
    const n = Number(input[key]);
    if (!Number.isInteger(n) || n < min || n > max) errors.push(`${key.replace(/_/g, " ")} must be a whole number from ${min} to ${max}.`);
    else out[key] = n;
  }
  if (input.timezone !== undefined) {
    if (input.timezone === null || input.timezone === "") out.timezone = null;
    else if (!isValidTimezone(input.timezone)) errors.push("Unknown timezone.");
    else out.timezone = String(input.timezone);
  }
  return { settings: out, errors };
}

/** Workspace settings merged over the defaults, with a campaign's payment override. */
export async function getBookingSettings(agencyId, campaignId = null, db = pool) {
  const [[row]] = await db.query("SELECT * FROM appointment_settings WHERE agency_id = ?", [agencyId]);
  const settings = { ...DEFAULT_BOOKING_SETTINGS, ...(row || {}) };
  if (campaignId) {
    const [[cam]] = await db.query(
      "SELECT payment_mode FROM appointment_campaigns WHERE id = ? AND agency_id = ?",
      [campaignId, agencyId]
    );
    if (cam?.payment_mode) settings.payment_mode = cam.payment_mode;
  }
  return settings;
}

export async function saveBookingSettings(agencyId, clean) {
  const merged = { ...(await getBookingSettings(agencyId)), ...clean };
  await pool.query(
    `INSERT INTO appointment_settings (agency_id, payment_mode, hold_minutes, booking_window_days, min_notice_minutes, max_bookings_per_day, timezone)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE payment_mode = VALUES(payment_mode), hold_minutes = VALUES(hold_minutes),
       booking_window_days = VALUES(booking_window_days), min_notice_minutes = VALUES(min_notice_minutes),
       max_bookings_per_day = VALUES(max_bookings_per_day), timezone = VALUES(timezone)`,
    [agencyId, merged.payment_mode, merged.hold_minutes, merged.booking_window_days, merged.min_notice_minutes, merged.max_bookings_per_day, merged.timezone]
  );
  return getBookingSettings(agencyId);
}

/** "YYYY-MM-DD HH:MM:SS" wall-clock time in `tz`, `plusMinutes` from now. */
export function wallClock(tz, plusMinutes = 0, now = new Date()) {
  const d = new Date(now.getTime() + plusMinutes * 60000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

/**
 * WHERE fragment: the slot starts after now + notice and falls inside the
 * booking window. Slots are stored as wall-clock date/time of the workspace;
 * without a timezone setting the database clock is used (as before).
 */
export function bookableWindowSql(settings, alias = "s", now = new Date()) {
  const notice = Number(settings.min_notice_minutes) || 0;
  const windowDays = Number(settings.booking_window_days) || DEFAULT_BOOKING_SETTINGS.booking_window_days;
  if (isValidTimezone(settings.timezone)) {
    const earliest = wallClock(settings.timezone, notice, now);
    const today = wallClock(settings.timezone, 0, now).slice(0, 10);
    const last = wallClock(settings.timezone, windowDays * 1440, now).slice(0, 10);
    return {
      sql: `${alias}.slot_date >= ? AND ${alias}.slot_date <= ? AND TIMESTAMP(${alias}.slot_date, ${alias}.start_time) > ?`,
      params: [today, last, earliest],
    };
  }
  return {
    sql: `${alias}.slot_date >= CURDATE() AND ${alias}.slot_date <= CURDATE() + INTERVAL ? DAY AND TIMESTAMP(${alias}.slot_date, ${alias}.start_time) > NOW() + INTERVAL ? MINUTE`,
    params: [windowDays, notice],
  };
}

const toDateStr = (d) => (typeof d === "string" ? d.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);

/** Booked (non-cancelled) appointments + live holds per date, for the daily cap. */
async function dailyLoad(db, agencyId, fromDate, toDate) {
  const [rows] = await db.query(
    `SELECT d, SUM(n) AS n FROM (
       SELECT appointment_date AS d, COUNT(*) AS n FROM appointments
        WHERE agency_id = ? AND appointment_date BETWEEN ? AND ? AND status <> 'cancelled'
        GROUP BY appointment_date
       UNION ALL
       SELECT s.slot_date AS d, COUNT(*) AS n FROM appointment_slot_holds h
         JOIN appointment_slots s ON s.id = h.slot_id
        WHERE h.agency_id = ? AND h.status = 'ACTIVE' AND h.expires_at > NOW() AND s.slot_date BETWEEN ? AND ?
        GROUP BY s.slot_date
     ) t GROUP BY d`,
    [agencyId, fromDate, toDate, agencyId, fromDate, toDate]
  );
  return new Map(rows.map((r) => [toDateStr(r.d), Number(r.n)]));
}

/** Dates that still have at least one bookable slot, oldest first. */
export async function listAvailableDates(agencyId, settings, { staffId = null, excludeHoldId = null, limit = 60 } = {}) {
  const win = bookableWindowSql(settings);
  const params = [];
  let sql = `SELECT s.slot_date, COUNT(*) AS open_slots
               FROM appointment_slots s
              WHERE s.agency_id = ? AND s.is_active = 1 AND ${win.sql}
                AND ${freeCapacitySql("s", Boolean(excludeHoldId))} > 0`;
  params.push(agencyId, ...win.params);
  if (excludeHoldId) params.push(excludeHoldId);
  if (staffId) { sql += " AND s.staff_id = ?"; params.push(staffId); }
  sql += " GROUP BY s.slot_date ORDER BY s.slot_date ASC LIMIT ?";
  params.push(limit);
  const [rows] = await pool.query(sql, params);
  let dates = rows.map((r) => ({ date: toDateStr(r.slot_date), openSlots: Number(r.open_slots) }));

  const cap = Number(settings.max_bookings_per_day) || 0;
  if (cap > 0 && dates.length) {
    const load = await dailyLoad(pool, agencyId, dates[0].date, dates[dates.length - 1].date);
    dates = dates.filter((d) => (load.get(d.date) || 0) < cap);
  }
  return dates;
}

/** Bookable slots of one date, earliest first. */
export async function listAvailableSlots(agencyId, date, settings, { staffId = null, excludeHoldId = null } = {}) {
  const cap = Number(settings.max_bookings_per_day) || 0;
  if (cap > 0) {
    const load = await dailyLoad(pool, agencyId, date, date);
    if ((load.get(date) || 0) >= cap) return [];
  }
  const win = bookableWindowSql(settings);
  const free = freeCapacitySql("s", Boolean(excludeHoldId));
  const params = [];
  let sql = `SELECT s.id, s.slot_date, s.start_time, s.end_time, s.staff_id, s.max_capacity, ${free} AS free
               FROM appointment_slots s
              WHERE s.agency_id = ? AND s.slot_date = ? AND s.is_active = 1 AND ${win.sql}`;
  if (excludeHoldId) params.push(excludeHoldId);
  params.push(agencyId, date, ...win.params);
  if (staffId) { sql += " AND s.staff_id = ?"; params.push(staffId); }
  sql += ` HAVING free > 0 ORDER BY s.start_time ASC LIMIT 200`;
  const [rows] = await pool.query(sql, params);
  return rows.map((r) => ({ ...r, free: Number(r.free) }));
}

/**
 * Reserves one place in a slot for a booking session (atomic). Any earlier
 * ACTIVE hold of the same session is released in the same transaction.
 * Returns { ok, holdId, expiresAt } or { ok: false, reason: 'FULL'|'GONE'|'DAY_FULL' }.
 */
export async function reserveSlot({ agencyId, slotId, sessionId = null, contactId = null, conversationId = null, serviceId = null, settings, staffId = null }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const win = bookableWindowSql(settings);
    const [[slot]] = await conn.query(
      `SELECT s.* FROM appointment_slots s
        WHERE s.id = ? AND s.agency_id = ? AND s.is_active = 1 AND ${win.sql}${staffId ? " AND s.staff_id = ?" : ""}
        FOR UPDATE`,
      [slotId, agencyId, ...win.params, ...(staffId ? [staffId] : [])]
    );
    if (!slot) {
      await conn.rollback();
      return { ok: false, reason: "GONE" };
    }
    if (sessionId) {
      await conn.query(
        "UPDATE appointment_slot_holds SET status = 'RELEASED' WHERE booking_session_id = ? AND status = 'ACTIVE'",
        [sessionId]
      );
    }
    const [[{ held }]] = await conn.query(
      "SELECT COUNT(*) AS held FROM appointment_slot_holds WHERE slot_id = ? AND status = 'ACTIVE' AND expires_at > NOW()",
      [slot.id]
    );
    if (slot.max_capacity - slot.booked_count - Number(held) <= 0) {
      await conn.rollback();
      return { ok: false, reason: "FULL" };
    }
    const cap = Number(settings.max_bookings_per_day) || 0;
    if (cap > 0) {
      const date = toDateStr(slot.slot_date);
      const load = await dailyLoad(conn, agencyId, date, date);
      if ((load.get(date) || 0) >= cap) {
        await conn.rollback();
        return { ok: false, reason: "DAY_FULL" };
      }
    }
    const minutes = Math.max(1, Number(settings.hold_minutes) || DEFAULT_BOOKING_SETTINGS.hold_minutes);
    const [ins] = await conn.query(
      `INSERT INTO appointment_slot_holds (agency_id, slot_id, booking_session_id, contact_id, conversation_id, service_id, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', NOW() + INTERVAL ? MINUTE)`,
      [agencyId, slot.id, sessionId, contactId, conversationId, serviceId, minutes]
    );
    const [[hold]] = await conn.query("SELECT expires_at FROM appointment_slot_holds WHERE id = ?", [ins.insertId]);
    await conn.commit();
    return { ok: true, holdId: ins.insertId, expiresAt: hold.expires_at, slot };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

/** Pushes an ACTIVE hold's expiry to NOW() + minutes (never shortens it). */
export async function extendHold(holdId, minutes) {
  const [r] = await pool.query(
    `UPDATE appointment_slot_holds SET expires_at = GREATEST(expires_at, NOW() + INTERVAL ? MINUTE)
      WHERE id = ? AND status = 'ACTIVE' AND expires_at > NOW()`,
    [minutes, holdId]
  );
  if (!r.affectedRows) return null;
  const [[row]] = await pool.query("SELECT expires_at FROM appointment_slot_holds WHERE id = ?", [holdId]);
  return row?.expires_at || null;
}

export async function releaseHold(holdId, status = "RELEASED") {
  if (!holdId) return false;
  const [r] = await pool.query(
    "UPDATE appointment_slot_holds SET status = ? WHERE id = ? AND status = 'ACTIVE'",
    [status, holdId]
  );
  return r.changedRows > 0;
}

/** Is the hold still ACTIVE and unexpired? */
export async function holdIsLive(holdId) {
  if (!holdId) return false;
  const [[row]] = await pool.query(
    "SELECT id FROM appointment_slot_holds WHERE id = ? AND status = 'ACTIVE' AND expires_at > NOW()",
    [holdId]
  );
  return Boolean(row);
}

/**
 * Turns a hold into an appointment (atomic, idempotent — converting the same
 * hold twice returns the first appointment).
 *
 * If the hold already expired, the slot is re-checked: it is booked only if
 * it still has room. `force` (a payment that already went through) books it
 * even when full, and flags the appointment so staff can reschedule/refund —
 * the customer paid, so the booking must never be silently dropped.
 *
 * Returns { ok, appointmentId, alreadyConverted, overbooked } or { ok:false, reason }.
 */
export async function convertHold(holdId, { customer, serviceName, fee, duration, channel, paymentStatus = "unpaid", chatOrderId = null, status = "scheduled", force = false }) {
  const [[peek]] = await pool.query("SELECT slot_id FROM appointment_slot_holds WHERE id = ?", [holdId]);
  if (!peek) return { ok: false, reason: "GONE" };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Lock order everywhere: slot row first, then the hold row.
    const [[slot]] = await conn.query("SELECT * FROM appointment_slots WHERE id = ? FOR UPDATE", [peek.slot_id]);
    const [[hold]] = await conn.query(
      "SELECT h.*, (h.status = 'ACTIVE' AND h.expires_at > NOW()) AS live FROM appointment_slot_holds h WHERE h.id = ? FOR UPDATE",
      [holdId]
    );
    if (!hold) {
      await conn.rollback();
      return { ok: false, reason: "GONE" };
    }
    if (hold.status === "CONVERTED" && hold.appointment_id) {
      await conn.commit();
      return { ok: true, appointmentId: hold.appointment_id, alreadyConverted: true };
    }
    if (!slot) {
      await conn.rollback();
      return { ok: false, reason: "GONE" };
    }
    let overbooked = false;
    if (!Number(hold.live)) {
      const [[{ held }]] = await conn.query(
        "SELECT COUNT(*) AS held FROM appointment_slot_holds WHERE slot_id = ? AND status = 'ACTIVE' AND expires_at > NOW() AND id <> ?",
        [slot.id, hold.id]
      );
      const room = slot.max_capacity - slot.booked_count - Number(held) > 0 && slot.is_active;
      if (!room) {
        if (!force) {
          await conn.query("UPDATE appointment_slot_holds SET status = 'EXPIRED' WHERE id = ? AND status = 'ACTIVE'", [hold.id]);
          await conn.commit();
          return { ok: false, reason: "EXPIRED" };
        }
        overbooked = true;
      }
    }

    await conn.query("UPDATE appointment_slots SET booked_count = booked_count + 1 WHERE id = ?", [slot.id]);
    const date = toDateStr(slot.slot_date);
    const notes = overbooked
      ? "Paid after the reserved time ran out and the slot had filled up meanwhile — please reschedule or refund."
      : null;
    const [ins] = await conn.query(
      `INSERT INTO appointments (
         agency_id, service_id, contact_id, staff_id, slot_id,
         customer_name, customer_phone, customer_email,
         service_name, appointment_date, appointment_time,
         duration, fee, payment_status, chat_order_id, channel, status, notes, booking_source
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CHATBOT')`,
      [
        hold.agency_id, hold.service_id || null, hold.contact_id || null, slot.staff_id || null, slot.id,
        customer?.name || "Client", customer?.phone || "", customer?.email || null,
        serviceName || "General Consultation", date, slot.start_time,
        duration || 30, fee || 0, paymentStatus, chatOrderId, channel || "WHATSAPP", status, notes,
      ]
    );
    await conn.query(
      "UPDATE appointment_slot_holds SET status = 'CONVERTED', appointment_id = ? WHERE id = ?",
      [ins.insertId, hold.id]
    );
    await conn.commit();
    return { ok: true, appointmentId: ins.insertId, overbooked, slot };
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

/** Marks holds past their expiry EXPIRED (housekeeping; availability already ignores them). */
export async function expireSlotHolds(batch = 500) {
  const [due] = await pool.query(
    "SELECT id, booking_session_id FROM appointment_slot_holds WHERE status = 'ACTIVE' AND expires_at <= NOW() ORDER BY expires_at LIMIT ?",
    [batch]
  );
  const expired = [];
  for (const h of due) {
    const [r] = await pool.query(
      "UPDATE appointment_slot_holds SET status = 'EXPIRED' WHERE id = ? AND status = 'ACTIVE' AND expires_at <= NOW()",
      [h.id]
    );
    if (r.changedRows) expired.push(h);
  }
  return expired;
}

/**
 * One page of a WhatsApp list (≤ 10 rows in total, Meta's limit). Reserves a
 * row for "Earlier" / "More" navigation when there are more items than fit.
 * `rowFor(item)` → { id, title, description }.
 */
function pageSize(total, start, maxRows) {
  let size = maxRows - (start > 0 ? 1 : 0);
  if (total - start > size) size -= 1;
  return size;
}

export function buildListPage(items, offset, rowFor, { prevId, nextId, maxRows = 10 } = {}) {
  // Page boundaries are fixed by the item count, so a stale offset from an
  // old list snaps to the page that contains it.
  const starts = [];
  for (let s = 0; s < items.length; s += pageSize(items.length, s, maxRows)) starts.push(s);
  if (!starts.length) starts.push(0);
  const wanted = Math.max(0, Number(offset) || 0);
  let pageIndex = 0;
  for (let i = 0; i < starts.length; i++) if (starts[i] <= wanted) pageIndex = i;
  const start = starts[pageIndex];
  const size = pageSize(items.length, start, maxRows);
  const hasPrev = pageIndex > 0;
  const hasNext = pageIndex < starts.length - 1;
  const pageItems = items.slice(start, start + size);
  const rows = [];
  if (hasPrev) rows.push({ id: prevId(starts[pageIndex - 1]), title: "⬅️ Earlier", description: "Show earlier options" });
  rows.push(...pageItems.map(rowFor));
  if (hasNext) rows.push({ id: nextId(start + size), title: "➡️ More", description: "Show more options" });
  return { rows, start, hasPrev, hasNext, pageItems };
}
