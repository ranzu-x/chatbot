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
export function parseCSV(text, delimiter = ',') {
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
    } else if (ch === delimiter) {
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

/** Excel writes ';' (many regional settings) or tabs instead of commas. Picks
 * whichever appears most in the header line — a comma wins any tie, so a
 * normal CSV is never misread. */
export function detectDelimiter(text) {
  const firstLine = String(text).split(/\r?\n/).find((l) => l.trim() !== '') || '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch]++;
  }
  let best = ',';
  for (const d of [';', '\t']) if (counts[d] > counts[best]) best = d;
  return best;
}

/** "Phone No.", "phone_number", "PHONE NUMBER" -> "phoneno" / "phonenumber". */
const normalizeHeader = (h) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Header spellings people really use, already normalized (see normalizeHeader).
const COLUMN_SYNONYMS = {
  phone: ['phone', 'phonenumber', 'phoneno', 'phonenum', 'mobile', 'mobilenumber', 'mobileno', 'mobilephone', 'cell', 'cellphone', 'contact', 'contactnumber', 'contactno', 'whatsapp', 'whatsappnumber', 'whatsappno', 'number', 'tel', 'telephone', 'msisdn', 'externalid'],
  chatId: ['chatid', 'telegramchatid', 'telegramid', 'telegramchat', 'userid', 'id', 'externalid'],
  name: ['name', 'fullname', 'subscribername', 'contactname', 'customername', 'username'],
  email: ['email', 'emailaddress', 'mail', 'emailid'],
};

const digitsIn = (v) => (String(v).match(/\d/g) || []).length;
// A whole cell that is just Excel's scientific notation, e.g. 8.8017E+12 —
// the number was already destroyed by Excel; importing it would create a bogus contact.
const isScientific = (v) => /^[-+]?\d+(\.\d+)?e[-+]?\d+$/i.test(String(v).trim());
const looksLikePhone = (v) => /^\+?[\d\s().-]+$/.test(String(v).trim()) && digitsIn(v) >= 7 && !isScientific(v);
const looksLikeChatId = (v) => /^-?\d{5,}$/.test(String(v).trim());

/** Text of an uploaded CSV/TSV -> a table (array of rows of strings). Tolerant of
 * a BOM and of ';' / tab separators (see detectDelimiter). */
export function parseImportText(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  return parseCSV(clean, detectDelimiter(clean));
}

/** A Google Sheet's cell grid -> the same shape as parseImportText: every cell a
 * string, every row the same width (the API trims trailing empty cells). */
export function tableFromSheetValues(values) {
  const rows = (values || []).map((r) => (r || []).map((c) => (c === null || c === undefined ? '' : String(c))));
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return rows
    .map((r) => (r.length < width ? [...r, ...Array(width - r.length).fill('')] : r))
    .filter((r) => r.some((c) => c.trim() !== ''));
}

const idIsValid = (platform, v) => (platform === 'WHATSAPP' ? looksLikePhone(v) : looksLikeChatId(v));

/** Splits a table into header + data. A file with no header row (its first row
 * already holds a phone number) is treated as all data. */
export function prepareTable(table, platform) {
  if (!table || table.length === 0) return { headers: [], dataRows: [], hasHeader: false, width: 0 };
  const hasHeader = !table[0].some((c) => idIsValid(platform, c) || isScientific(c));
  const dataRows = hasHeader ? table.slice(1) : table;
  const width = table.reduce((m, r) => Math.max(m, r.length), 0);
  const headers = Array.from({ length: width }, (_, i) => (hasHeader ? String(table[0][i] ?? '').trim() : ''));
  return { headers, dataRows, hasHeader, width };
}

/** What a column is imported as. `kind` is one of: id (phone / chat id), name,
 * email, field (an existing custom field, `fieldId`), new (a custom field
 * created from the header), skip. */
export const columnLabel = (prepared, c) => prepared.headers[c] || `Column ${c + 1}`;

/**
 * First-guess mapping so the common case needs no clicking: the phone/chat-id,
 * name and email columns are recognised by header (or, for the id and email, by
 * what the values look like); every other column with a header is matched to a
 * custom field of the same name, or offered as a new one — extra columns are
 * imported as custom fields unless the user says otherwise.
 */
export function guessMapping(prepared, platform, fields) {
  const { headers, dataRows, width } = prepared;
  const idKey = platform === 'WHATSAPP' ? 'phone' : 'chatId';
  const norm = headers.map(normalizeHeader);
  const find = (keys, taken) => norm.findIndex((h, i) => h && !taken.has(i) && keys.includes(h));
  const taken = new Set();
  const sample = dataRows.slice(0, 200);
  const cellsOf = (c) => sample.map((r) => String(r[c] ?? '').trim()).filter(Boolean);

  let idCol = find(COLUMN_SYNONYMS[idKey], taken);
  if (idCol === -1) {
    let best = { col: -1, hits: 0 };
    for (let c = 0; c < width; c++) {
      const cells = cellsOf(c);
      const hits = cells.filter((v) => idIsValid(platform, v)).length;
      if (cells.length && hits / cells.length >= 0.5 && hits > best.hits) best = { col: c, hits };
    }
    idCol = best.col;
  }
  if (idCol !== -1) taken.add(idCol);

  const nameCol = find(COLUMN_SYNONYMS.name, taken);
  if (nameCol !== -1) taken.add(nameCol);

  let emailCol = find(COLUMN_SYNONYMS.email, taken);
  if (emailCol === -1) {
    for (let c = 0; c < width && emailCol === -1; c++) {
      if (taken.has(c)) continue;
      const cells = cellsOf(c);
      const hits = cells.filter((v) => v.includes('@') && !v.includes(' ')).length;
      if (cells.length && hits / cells.length >= 0.8) emailCol = c;
    }
  }
  if (emailCol !== -1) taken.add(emailCol);

  const fieldByName = new Map();
  for (const f of fields || []) {
    fieldByName.set(normalizeHeader(f.name), f.id);
    fieldByName.set(normalizeHeader(f.field_key), f.id);
  }
  const usedFields = new Set();

  return Array.from({ length: width }, (_, c) => {
    if (c === idCol) return { kind: 'id' };
    if (c === nameCol) return { kind: 'name' };
    if (c === emailCol) return { kind: 'email' };
    if (!headers[c] || cellsOf(c).length === 0) return { kind: 'skip' };
    const fid = fieldByName.get(norm[c]);
    if (fid && !usedFields.has(fid)) { usedFields.add(fid); return { kind: 'field', fieldId: fid }; }
    return { kind: 'new' };
  });
}

/**
 * Applies the user's mapping to the table. Returns the rows to send, the
 * custom-field columns they refer to, and every row it had to drop with a
 * reason (line numbers match the user's file/sheet). `problem` explains why
 * nothing can be imported yet.
 */
export function buildImport(prepared, mapping, platform) {
  const isWA = platform === 'WHATSAPP';
  const idKey = isWA ? 'phone' : 'chatId';
  const idLabel = isWA ? 'Phone Number' : 'Telegram Chat ID';
  const out = { rows: [], skipped: [], customFields: [], problem: null };
  const colOf = (kind) => mapping.findIndex((m) => m?.kind === kind);
  const idCol = colOf('id');
  const nameCol = colOf('name');
  const emailCol = colOf('email');

  if (prepared.dataRows.length === 0) {
    out.problem = 'There are no subscriber rows below the header — add at least one.';
    return out;
  }
  if (idCol === -1) {
    out.problem = `Choose which column holds the ${idLabel}.`;
    return out;
  }

  mapping.forEach((m, c) => {
    if (m?.kind === 'field') out.customFields.push({ col: String(c), fieldId: m.fieldId });
    else if (m?.kind === 'new') out.customFields.push({ col: String(c), name: columnLabel(prepared, c) });
  });

  prepared.dataRows.forEach((r, i) => {
    const rowNumber = i + (prepared.hasHeader ? 2 : 1); // 1-based line number in the user's file
    const cell = (c) => String(r[c] ?? '').trim();
    const id = cell(idCol);
    if (!id) { out.skipped.push({ row: rowNumber, reason: `No ${idLabel}` }); return; }
    if (isWA && isScientific(id)) {
      out.skipped.push({ row: rowNumber, reason: `"${id}" is Excel scientific notation — the real number was already lost` });
      return;
    }
    if (isWA && digitsIn(id) < 7) { out.skipped.push({ row: rowNumber, reason: `"${id}" isn't a phone number` }); return; }
    if (!isWA && !looksLikeChatId(id)) { out.skipped.push({ row: rowNumber, reason: `"${id}" isn't a Telegram Chat ID (it must be a number)` }); return; }

    // row = the line in the user's file, so the server's messages point at it.
    const row = { row: rowNumber, name: nameCol === -1 ? '' : cell(nameCol), email: emailCol === -1 ? '' : cell(emailCol), [idKey]: id };
    let custom = null;
    for (const def of out.customFields) {
      const v = cell(Number(def.col));
      if (v) (custom ||= {})[def.col] = v;
    }
    if (custom) row.custom = custom;
    out.rows.push(row);
  });

  if (out.rows.length === 0) out.problem = `None of the ${prepared.dataRows.length} row(s) had a usable ${idLabel}.`;
  return out;
}

/** "contacts-march.csv" -> "contacts-march": the label used when the user doesn't pick one. */
export const labelNameFromFile = (fileName) => String(fileName || '').replace(/\.[^./]+$/, '').trim();

export function sampleImportCsv(platform) {
  return platform === 'WHATSAPP'
    ? 'name,email,phone,city\nJane Doe,jane@example.com,8801712345678,Dhaka\nJohn Smith,,8801812345678,Chittagong\n'
    : 'name,email,chatId,city\nJane Doe,jane@example.com,123456789,Dhaka\nJohn Smith,,987654321,Chittagong\n';
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
