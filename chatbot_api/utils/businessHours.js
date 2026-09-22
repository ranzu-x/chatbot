/**
 * Business Hours — per-bot-account (per-integration) weekly schedule that
 * gates automated replies outside opening hours. See migrate_business_hours.js
 * for the two tables. Wired into the inbound message pipeline from
 * routes/webhook.js and routes/webchat.js; the actual "run a different flow"
 * mechanics live in utils/flowEngine.js (findMatchingFlow's offHoursFlowId /
 * suppressNewTrigger handling on extraContext).
 *
 * Fully backward compatible: with no settings row, or `enabled = 0`, every
 * bot behaves exactly as it did before this feature existed — always
 * "within hours", nothing gated.
 */
import pool from "../db.js";

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_TO_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// A curated list for the UI's timezone picker — the backend itself accepts any
// valid IANA zone (validated with Intl below), this is just a friendly subset.
export const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Sao_Paulo", "America/Mexico_City", "America/Toronto",
  "Europe/London", "Europe/Dublin", "Europe/Lisbon", "Europe/Madrid", "Europe/Paris",
  "Europe/Berlin", "Europe/Rome", "Europe/Amsterdam", "Europe/Athens", "Europe/Moscow",
  "Africa/Cairo", "Africa/Lagos", "Africa/Johannesburg", "Africa/Nairobi",
  "Asia/Istanbul", "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Dhaka",
  "Asia/Bangkok", "Asia/Jakarta", "Asia/Singapore", "Asia/Hong_Kong", "Asia/Shanghai",
  "Asia/Manila", "Asia/Tokyo", "Asia/Seoul",
  "Australia/Sydney", "Australia/Perth", "Pacific/Auckland",
];

export function isValidTimezone(tz) {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** { weekday: 0-6 (Sun..Sat), minutes: 0-1439 } for "now" in the given IANA timezone. */
function nowInZone(timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const weekday = WEEKDAY_TO_INDEX[get("weekday")];
  // hour comes back as "24" at midnight in some ICU builds instead of "00" — normalize.
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  return { weekday, minutes: hour * 60 + minute };
}

function toMinutes(timeStr) {
  if (!timeStr) return null;
  const [h, m] = String(timeStr).split(":").map(Number);
  return h * 60 + (m || 0);
}

/** True if `nowMinutes` falls inside [openMinutes, closeMinutes), wrapping past midnight when close <= open. */
export function isWithinWindow(nowMinutes, openMinutes, closeMinutes) {
  if (openMinutes === null || closeMinutes === null) return true; // incomplete data — fail open, never block traffic
  if (openMinutes === closeMinutes) return true; // open 24 hours
  if (closeMinutes > openMinutes) return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
  return nowMinutes >= openMinutes || nowMinutes < closeMinutes; // overnight, e.g. 22:00–06:00
}

/**
 * The gate every inbound-message entry point checks before running automation.
 * @returns {Promise<{enabled:boolean, withinHours:boolean, allowBotReplies:boolean, allowAiReplies:boolean, offHoursFlowId:number|null}>}
 */
export async function getBusinessHoursStatus(agencyId, integrationId) {
  const OPEN = { enabled: false, withinHours: true, allowBotReplies: true, allowAiReplies: true, offHoursFlowId: null };
  if (!integrationId) return OPEN;

  const [[settings]] = await pool.query(
    "SELECT * FROM business_hours_settings WHERE integration_id = ? AND agency_id = ?",
    [integrationId, agencyId]
  );
  if (!settings || !settings.enabled) return OPEN;

  const [days] = await pool.query(
    "SELECT day_of_week, is_off, open_time, close_time FROM business_hours_days WHERE integration_id = ?",
    [integrationId]
  );

  const { weekday, minutes } = nowInZone(settings.timezone || "UTC");
  const today = days.find((d) => d.day_of_week === weekday);

  // No row for today (shouldn't happen once the settings page has saved once) — fail open rather than
  // silently blocking every reply because of incomplete data.
  const withinHours = !today ? true : (today.is_off ? false : isWithinWindow(minutes, toMinutes(today.open_time), toMinutes(today.close_time)));

  return {
    enabled: true,
    withinHours,
    allowBotReplies: !!settings.bot_replies_off_hours,
    allowAiReplies: !!settings.ai_replies_off_hours,
    offHoursFlowId: settings.off_hours_flow_id || null,
  };
}
