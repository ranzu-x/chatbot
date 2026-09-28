// Pure helpers for SubscriberInfoBanner (kept separate so they can be unit-tested).

/** "3:42 PM" in the given IANA zone, or null when the zone is missing / invalid. */
export function formatLocalTime(timeZone, now = new Date()) {
  if (!timeZone) return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(now);
  } catch {
    return null;
  }
}

/** "Mon" when the subscriber's day differs from ours, else null. */
export function localWeekdayIfDifferent(timeZone, now = new Date()) {
  if (!timeZone) return null;
  try {
    const theirs = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
    const ours = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(now);
    return theirs === ours ? null : theirs;
  } catch {
    return null;
  }
}

/** "GMT+6" for the zone right now. */
export function offsetLabel(timeZone, now = new Date()) {
  if (!timeZone) return null;
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(now).find((p) => p.type === 'timeZoneName');
    return part?.value || null;
  } catch {
    return null;
  }
}

/** "just now" · "5 min ago" · "3 h ago" · "2 days ago" · "12 Mar 2026"; null when never seen. */
export function lastSeenLabel(ts, now = Date.now()) {
  if (!ts) return null;
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return null;
  const mins = Math.floor((now - t) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "English" for "en-US" / "en_US"; null when unknown. */
export function languageName(code) {
  if (!code || typeof code !== 'string') return null;
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code.replace('_', '-').split('-')[0]);
    return name && name !== code ? name : null;
  } catch {
    return null;
  }
}

export function parseProfile(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw) || {}; } catch { return {}; }
}
