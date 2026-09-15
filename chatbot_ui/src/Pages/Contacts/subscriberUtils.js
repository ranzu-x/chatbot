import { MessageCircle, Facebook, Instagram, Send, Globe, Radio } from 'lucide-react';

// ─── Platform Config ────────────────────────────────────────────────────────
// Deliberately no per-platform brand colors — every badge on this page is
// neutral (border + muted text), differentiated by icon and label only, not
// by color. See PLATFORM_IMPORT_EXPORT below for what each channel actually
// supports and why.

export const PLATFORM_MAP = {
  WHATSAPP:  { label: 'WhatsApp',  icon: MessageCircle },
  FACEBOOK:  { label: 'Facebook',  icon: Facebook },
  INSTAGRAM: { label: 'Instagram', icon: Instagram },
  TELEGRAM:  { label: 'Telegram',  icon: Send },
  WEBCHAT:   { label: 'Webchat',   icon: Globe },
};

export const PLATFORM_ORDER = ['WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'WEBCHAT'];

export function getPlatform(p) {
  const norm = (p || 'WHATSAPP').toUpperCase();
  return PLATFORM_MAP[norm] || { label: norm, icon: Radio };
}

/**
 * What each channel actually supports for import/export, grounded in each
 * platform's own messaging rules (not a guess):
 *  - WhatsApp: a business can import numbers it already has consent for and
 *    reach them with an approved Template message even with no prior chat
 *    (Meta's WhatsApp opt-in policy) — import + export both work.
 *  - Telegram: the Bot API flatly refuses to message a user who hasn't
 *    started a chat with the bot ("bot can't initiate conversation with a
 *    user") — there's no phone-number-based import. What DOES work is
 *    importing already-known Telegram Chat IDs (e.g. migrating subscriber
 *    records from another system after they'd already started a chat) —
 *    so import is offered, keyed on Chat ID rather than phone.
 *  - Facebook Messenger / Instagram: Meta only ever issues a PSID/IGSID once
 *    a person messages the Page first (Messenger Platform policy) — there is
 *    no identifier to import against, so these are export-only.
 *  - Webchat: a contact only exists for the lifetime of an actual widget
 *    session on the visitor's browser — nothing external to import, and no
 *    way to proactively reach a "cold" imported row. Export-only.
 */
export const PLATFORM_IMPORT_EXPORT = {
  WHATSAPP:  { canImport: true,  canExport: true,  importField: 'phone',  importLabel: 'Phone Number' },
  TELEGRAM:  { canImport: true,  canExport: true,  importField: 'chatId', importLabel: 'Telegram Chat ID' },
  FACEBOOK:  { canImport: false, canExport: true,  reason: "Meta only issues a Messenger ID once someone messages your Page first — there's no identifier to import against." },
  INSTAGRAM: { canImport: false, canExport: true,  reason: "Meta only issues an Instagram ID once someone messages your account first — there's no identifier to import against." },
  WEBCHAT:   { canImport: false, canExport: true,  reason: 'A Webchat visitor only exists for the life of their browser session — there’s nothing external to import.' },
};

export const STATUS_OPTIONS = [
  { value: '', label: 'Any status' },
  { value: 'SUBSCRIBED', label: 'Subscribed' },
  { value: 'UNSUBSCRIBED', label: 'Unsubscribed' },
  { value: 'RETAINED', label: 'Retained' },
  { value: 'NOT_RETAINED', label: 'Not retained' },
];

export function getInitials(name = '') {
  return (name || '').trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

export function resolveMediaUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  const cleanUrl = url.startsWith('/') ? url : `/${url}`;
  const apiUrl = import.meta.env.VITE_API_URL || '';
  if (apiUrl.startsWith('http')) {
    const baseUrl = apiUrl.replace('/api/v1', '').replace(/\/+$/, '');
    return `${baseUrl}${cleanUrl}`;
  }
  return cleanUrl;
}

export function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function formatSubscriberId(id) {
  if (!id) return '315900';
  return String(315900 + Number(id));
}

/** Minimal RFC4180-ish CSV parser: handles quoted fields, escaped quotes
 * ("") inside quotes, and commas/newlines inside quotes. Good enough for a
 * subscriber-list export/import round trip without pulling in a dependency. */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\n') {
      pushRow();
    } else if (ch === '\r') {
      // skip — paired \n handles the row break
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

/** Turns parsed CSV rows (first row = header) into objects keyed by a
 * lower-cased, space-stripped version of the header — so "Phone Number",
 * "phone", "Phone" all resolve to the same `phonenumber`/`phone` key. */
export function csvRowsToObjects(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, ''));
  return rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (r[idx] ?? '').trim(); });
    return obj;
  });
}

export function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
