import test from "node:test";
import assert from "node:assert/strict";
import { isWithinWindow, isValidTimezone } from "../utils/businessHours.js";

test("a normal same-day window (09:00-17:00)", () => {
  assert.equal(isWithinWindow(9 * 60, 9 * 60, 17 * 60), true); // exactly at open
  assert.equal(isWithinWindow(12 * 60, 9 * 60, 17 * 60), true); // midday
  assert.equal(isWithinWindow(17 * 60, 9 * 60, 17 * 60), false); // exactly at close (exclusive)
  assert.equal(isWithinWindow(8 * 60 + 59, 9 * 60, 17 * 60), false); // one minute before open
});

test("an overnight window (22:00-06:00) wraps past midnight", () => {
  assert.equal(isWithinWindow(23 * 60, 22 * 60, 6 * 60), true); // 23:00, same evening
  assert.equal(isWithinWindow(1 * 60, 22 * 60, 6 * 60), true); // 01:00, after midnight
  assert.equal(isWithinWindow(6 * 60, 22 * 60, 6 * 60), false); // exactly at close
  assert.equal(isWithinWindow(12 * 60, 22 * 60, 6 * 60), false); // midday, outside
});

test("open === close means open 24 hours", () => {
  assert.equal(isWithinWindow(0, 9 * 60, 9 * 60), true);
  assert.equal(isWithinWindow(23 * 60 + 59, 9 * 60, 9 * 60), true);
});

test("missing open/close time fails open (never blocks traffic on bad data)", () => {
  assert.equal(isWithinWindow(12 * 60, null, 17 * 60), true);
  assert.equal(isWithinWindow(12 * 60, 9 * 60, null), true);
});

test("timezone validation accepts real IANA zones and rejects junk", () => {
  assert.equal(isValidTimezone("Asia/Dhaka"), true);
  assert.equal(isValidTimezone("UTC"), true);
  assert.equal(isValidTimezone("Not/AZone"), false);
  assert.equal(isValidTimezone(""), false);
  assert.equal(isValidTimezone(null), false);
});
