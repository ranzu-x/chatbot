/**
 * System fields — the protected subscriber fields every workspace has
 * (Subscriber Manager → Fields & Variables). They are real `contacts`
 * columns, not custom_field_definitions rows, so they can never be renamed,
 * deleted or retyped; everything that already reads contacts.name / email /
 * phone keeps working unchanged.
 *
 *   in messages     {{contact.name}} {{contact.email}} {{contact.phone}} {{contact.age}}
 *   in the builder  a Question / Collect Input "save to field" value "sys:<key>"
 */
import pool from "../db.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const SYSTEM_FIELDS = [
  { key: "name", label: "Name", column: "name", type: "TEXT", placeholder: "{{contact.name}}" },
  { key: "email", label: "Email", column: "email", type: "TEXT", placeholder: "{{contact.email}}" },
  { key: "phone", label: "Phone", column: "phone", type: "TEXT", placeholder: "{{contact.phone}}" },
  { key: "age", label: "Age", column: "age", type: "NUMBER", placeholder: "{{contact.age}}" },
];

const BY_KEY = Object.fromEntries(SYSTEM_FIELDS.map((f) => [f.key, f]));

/** "sys:age" → the field, anything else → null. */
export function systemFieldFromRef(ref) {
  const m = /^sys:([a-z_]+)$/.exec(String(ref ?? ""));
  return m ? BY_KEY[m[1]] || null : null;
}

/** A value cleaned for its column, or { error }. */
export function cleanSystemValue(field, raw) {
  const v = String(raw ?? "").trim();
  if (!v) return { value: null };
  switch (field.key) {
    case "email":
      return EMAIL_RE.test(v) && v.length <= 254 ? { value: v } : { error: "Not a valid email address" };
    case "age": {
      const n = Number(v);
      return Number.isInteger(n) && n >= 0 && n <= 150 ? { value: n } : { error: "Age must be a whole number between 0 and 150" };
    }
    case "phone":
      return /^[+\d][\d\s().-]{3,40}$/.test(v) ? { value: v.slice(0, 50) } : { error: "Not a valid phone number" };
    default:
      return { value: v.slice(0, 200) };
  }
}

/** Saves one answer into a system field (an explicit mapping, so it overwrites). */
export async function saveSystemField(agencyId, contactId, field, raw) {
  const { value, error } = cleanSystemValue(field, raw);
  if (error || value === null) return false;
  await pool.query(`UPDATE contacts SET ${field.column} = ? WHERE id = ? AND agency_id = ?`, [value, contactId, agencyId]);
  return true;
}
