/**
 * Loads a subscriber's custom-field values onto the contact object as
 * contact._fields = { <field_key>: value } so {{field.<key>}} tokens can be
 * filled synchronously (utils/personalize.js). Non-enumerable, so it never
 * leaks into JSON / socket payloads. One indexed query per send batch.
 */
import pool from "../db.js";

export async function attachContactFields(agencyId, contact) {
  if (!contact?.id) return contact;
  let fields = {};
  try {
    const [rows] = await pool.query(
      `SELECT d.field_key, v.value
         FROM contact_custom_field_values v
         JOIN custom_field_definitions d ON d.id = v.field_id AND d.agency_id = ? AND d.is_active = 1
        WHERE v.contact_id = ?`,
      [agencyId || contact.agency_id, contact.id]
    );
    fields = Object.fromEntries(rows.map((r) => [String(r.field_key).toLowerCase(), r.value]));
  } catch (err) {
    console.warn("[contactFields] load failed:", err.message);
  }
  Object.defineProperty(contact, "_fields", { value: fields, writable: true, configurable: true, enumerable: false });
  return contact;
}
