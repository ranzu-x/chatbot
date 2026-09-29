import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildListPage, cleanBookingSettings, wallClock, bookableWindowSql, isValidTimezone,
} from "../utils/appointmentAvailability.js";

const row = (n) => ({ id: `apt:date:${n}`, title: `Day ${n}`, description: "x" });
const nav = { prevId: (o) => `apt:dpage:${o}`, nextId: (o) => `apt:dpage:${o}` };

/** Walks every page forward and back; checks Meta's list limits on each. */
function walk(total, maxRows = 10) {
  const items = Array.from({ length: total }, (_, i) => i);
  const seen = [];
  let offset = 0;
  const offsets = [];
  for (let guard = 0; guard < 100; guard++) {
    const page = buildListPage(items, offset, row, { ...nav, maxRows });
    assert.ok(page.rows.length <= maxRows, `≤ ${maxRows} rows (had ${page.rows.length})`);
    assert.ok(page.rows.every((r) => r.title.length <= 24 && r.id.length <= 200), "row title/id within Meta limits");
    assert.equal(new Set(page.rows.map((r) => r.id)).size, page.rows.length, "row ids are unique");
    seen.push(...page.pageItems);
    offsets.push(page.start);
    if (!page.hasNext) break;
    offset = Number(page.rows[page.rows.length - 1].id.split(":").pop());
  }
  assert.deepEqual(seen, items, "every item shown exactly once, in order");
  // Going back from each page lands exactly on the previous page.
  for (let i = offsets.length - 1; i > 0; i--) {
    const page = buildListPage(items, offsets[i], row, { ...nav, maxRows });
    assert.equal(page.rows[0].id, `apt:dpage:${offsets[i - 1]}`);
  }
  return offsets;
}

test("list pages: never more than 10 rows, every item reachable, back/forward consistent", () => {
  for (const total of [0, 1, 9, 10, 11, 17, 18, 19, 45, 60]) walk(total);
  for (const total of [8, 9, 10, 30]) walk(total, 9); // slot lists leave a row for "Change day"
});

test("list pages: up to 10 items fit on one page with no navigation rows", () => {
  const page = buildListPage([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0, row, nav);
  assert.equal(page.rows.length, 10);
  assert.equal(page.hasNext, false);
  assert.equal(page.hasPrev, false);
});

test("list pages: a stale / out-of-range offset snaps to a real page", () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  const page = buildListPage(items, 999, row, nav);
  assert.equal(page.hasNext, false);
  assert.ok(page.pageItems.includes(24));
  const mid = buildListPage(items, 12, row, nav); // 12 is inside the page starting at 9
  assert.equal(mid.start, 9);
});

test("booking settings are validated", () => {
  assert.deepEqual(cleanBookingSettings({ payment_mode: "REQUIRED", hold_minutes: 20 }).settings, { payment_mode: "REQUIRED", hold_minutes: 20 });
  assert.ok(cleanBookingSettings({ payment_mode: "LATER" }).errors.length);
  assert.ok(cleanBookingSettings({ hold_minutes: 0 }).errors.length);
  assert.ok(cleanBookingSettings({ hold_minutes: 2.5 }).errors.length);
  assert.ok(cleanBookingSettings({ booking_window_days: 400 }).errors.length);
  assert.equal(cleanBookingSettings({ max_bookings_per_day: 0 }).settings.max_bookings_per_day, null);
  assert.equal(cleanBookingSettings({ max_bookings_per_day: "" }).settings.max_bookings_per_day, null);
  assert.ok(cleanBookingSettings({ timezone: "Mars/Olympus" }).errors.length);
  assert.equal(cleanBookingSettings({ timezone: "Asia/Dhaka" }).settings.timezone, "Asia/Dhaka");
  assert.equal(cleanBookingSettings({ timezone: "" }).settings.timezone, null);
});

test("wall clock in a timezone", () => {
  const now = new Date("2026-10-05T23:30:00Z");
  assert.equal(wallClock("Asia/Dhaka", 0, now), "2026-10-06 05:30:00");
  assert.equal(wallClock("America/New_York", 0, now), "2026-10-05 19:30:00");
  assert.equal(wallClock("UTC", 90, now), "2026-10-06 01:00:00");
  assert.equal(isValidTimezone("Nope/Nowhere"), false);
});

test("bookable window: timezone → fixed wall-clock bounds; none → database clock", () => {
  const now = new Date("2026-10-05T23:30:00Z");
  const tz = bookableWindowSql({ timezone: "Asia/Dhaka", min_notice_minutes: 60, booking_window_days: 7 }, "s", now);
  assert.deepEqual(tz.params, ["2026-10-06", "2026-10-13", "2026-10-06 06:30:00"]);
  const db = bookableWindowSql({ timezone: null, min_notice_minutes: 0, booking_window_days: 30 }, "s", now);
  assert.match(db.sql, /NOW\(\)/);
  assert.deepEqual(db.params, [30, 0]);
});

after(() => setTimeout(() => process.exit(0), 50));
