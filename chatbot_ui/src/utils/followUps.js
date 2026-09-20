// Shared helpers for follow-up reminders (the drawer panel and the inbox alerts).

// Quick "due in N hours" shortcuts on the create/edit form.
export const DUE_PRESET_HOURS = [1, 2, 4, 6, 12, 24];

// Snooze choices on an alert or a list row.
export const SNOOZE_PRESETS = [
  { label: '15 min', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '2 hours', minutes: 120 },
  { label: '4 hours', minutes: 240 },
  { label: '6 hours', minutes: 360 },
  { label: '12 hours', minutes: 720 },
  { label: '24 hours', minutes: 1440 },
];

const pad = (n) => String(n).padStart(2, '0');

/** A Date as the two strings <input type="date"> and <input type="time"> want, in the user's own time zone. */
export function toLocalParts(date) {
  const d = new Date(date);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** "Now plus N hours", seconds dropped so it lines up with the time input. */
export function partsInHours(hours) {
  const d = new Date(Date.now() + hours * 3600000);
  d.setSeconds(0, 0);
  return toLocalParts(d);
}

/** The date + time inputs back into an ISO timestamp (null if either is missing or invalid). */
export function partsToIso(date, time) {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function unit(ms) {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'less than a minute';
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

/** "in 2 h" / "5 min overdue". */
export function relativeDue(iso, now = Date.now()) {
  const diff = new Date(iso).getTime() - now;
  if (Math.abs(diff) < 60000) return diff >= 0 ? 'due now' : 'just became due';
  return diff > 0 ? `in ${unit(diff)}` : `${unit(-diff)} overdue`;
}

export function formatDue(iso) {
  return new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
