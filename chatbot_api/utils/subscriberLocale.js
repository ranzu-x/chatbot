/**
 * Where a subscriber is and what time it is for them — for the Inbox's
 * subscriber banner (GET /conversations/:id → subscriberLocale). Nothing is
 * stored; it is worked out from what we already have, best source first:
 *
 *   timezone  1. the browser's own zone (webchat widget → platform_profile.timezoneName)
 *             2. Messenger's profile UTC offset (platform_profile.timezone, e.g. 6),
 *                matched to a zone of the subscriber's country when possible
 *             3. the country's zone (one zone → exact; several → its main one, "approximate")
 *   country   1. the phone number's country code   2. the profile's locale (en_US → US)
 *             3. the country of the browser zone
 *
 * Unknown stays null — the UI shows "Unknown", never a guess dressed up as fact.
 */
import ct from "countries-and-timezones";
import { countryFromPhone } from "./country.js";

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

// Main zone of countries that span several (by population).
const MAIN_ZONE = {
  US: "America/New_York", CA: "America/Toronto", BR: "America/Sao_Paulo", RU: "Europe/Moscow",
  AU: "Australia/Sydney", MX: "America/Mexico_City", ID: "Asia/Jakarta", KZ: "Asia/Almaty",
  AR: "America/Argentina/Buenos_Aires", CN: "Asia/Shanghai", ES: "Europe/Madrid", PT: "Europe/Lisbon",
  CL: "America/Santiago", DE: "Europe/Berlin", MN: "Asia/Ulaanbaatar", CD: "Africa/Kinshasa",
  EC: "America/Guayaquil", NZ: "Pacific/Auckland", UA: "Europe/Kyiv", MY: "Asia/Kuala_Lumpur",
  GL: "America/Nuuk", FR: "Europe/Paris", GB: "Europe/London", IN: "Asia/Kolkata",
};

export function isValidTimeZone(tz) {
  if (!tz || typeof tz !== "string" || tz.length > 64) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

const parseProfile = (raw) => {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try { return JSON.parse(raw) || {}; } catch { return {}; }
};

function countryName(code) {
  if (!code) return null;
  try { const n = regionNames.of(code); return n && n !== code ? n : code; } catch { return code; }
}

/** A zone's UTC offset in minutes at this moment (e.g. Asia/Kolkata → 330). */
export function currentOffsetMinutes(tz, at = new Date()) {
  try {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
      .formatToParts(at).find((p) => p.type === "timeZoneName")?.value || "";
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
    if (!m) return 0; // "GMT" alone = UTC
    return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
  } catch {
    return null;
  }
}

function zonesOf(country) {
  return country ? (ct.getCountry(country)?.timezones || []) : [];
}

/** { country, countryName, timezone, approximate, source } — every field may be null. */
export function resolveSubscriberLocale({ phone, platformProfile } = {}) {
  const profile = parseProfile(platformProfile);

  // Country
  let country = countryFromPhone(phone);
  if (!country && typeof profile.country === "string" && /^[A-Za-z]{2}$/.test(profile.country)) country = profile.country.toUpperCase();
  if (!country && typeof profile.locale === "string") {
    const m = /[_-]([A-Za-z]{2})$/.exec(profile.locale);
    if (m) country = m[1].toUpperCase();
  }

  // Timezone
  let timezone = null;
  let approximate = false;
  let source = null;
  if (isValidTimeZone(profile.timezoneName)) {
    timezone = profile.timezoneName;
    source = "browser";
    if (!country) country = ct.getTimezone(timezone)?.countries?.[0] || null;
  } else if (profile.timezone !== null && profile.timezone !== undefined && profile.timezone !== "" && Number.isFinite(Number(profile.timezone))) {
    // Messenger reports the offset as it was when fetched (daylight saving
    // included), so compare with each zone's offset right now.
    const offsetMin = Math.round(Number(profile.timezone) * 60);
    const candidates = zonesOf(country).filter((z) => currentOffsetMinutes(z) === offsetMin);
    if (candidates.length) {
      timezone = candidates.includes(MAIN_ZONE[country]) ? MAIN_ZONE[country] : candidates[0];
      approximate = candidates.length > 1;
    } else if (Number.isInteger(Number(profile.timezone)) && Math.abs(Number(profile.timezone)) <= 14) {
      // Etc/GMT zones have the sign inverted: UTC+6 is Etc/GMT-6.
      const n = Number(profile.timezone);
      timezone = n === 0 ? "Etc/UTC" : `Etc/GMT${n > 0 ? "-" : "+"}${Math.abs(n)}`;
    }
    source = timezone ? "profile" : null;
  }
  if (!timezone && country) {
    const zones = zonesOf(country);
    if (zones.length === 1) timezone = zones[0];
    else if (zones.length > 1) {
      timezone = MAIN_ZONE[country] && zones.includes(MAIN_ZONE[country]) ? MAIN_ZONE[country] : zones[0];
      approximate = true;
    }
    source = timezone ? "country" : null;
  }
  if (timezone && !isValidTimeZone(timezone)) { timezone = null; source = null; approximate = false; }

  return { country: country || null, countryName: countryName(country), timezone, approximate, source };
}
