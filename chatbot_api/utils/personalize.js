/**
 * Personalisation tokens in bot messages — filled per subscriber when a
 * message is sent (utils/flowEngine.js replaceVariables). Offered by the
 * Flow Builder's "Personalize" menu on every text field.
 *
 *   {{contact.name}}  {{contact.first_name}}  {{contact.last_name}}
 *   {{contact.email}} {{contact.phone}}       {{contact.age}}
 *   {{field.<custom field key>}}              a custom field's value
 *   any of them with a fallback: {{contact.first_name|there}}
 *
 * A plain {{contact.name}} keeps its old behaviour ("Customer" when empty).
 * With a fallback, a name that is only a placeholder (a number, the channel
 * id, "Webchat Visitor (…)") counts as empty. Custom-field values come from
 * contact._fields, loaded by attachContactFields (utils/contactFields.js).
 */

const TOKEN_RE = /\{\{\s*(contact|field)\.([a-z0-9_]+)\s*(?:\|([^{}]*))?\}\}/gi;

/** The subscriber's real name, or "" when we only have a placeholder. */
export function realName(contact) {
  const name = String(contact?.name ?? "").trim();
  if (!name) return "";
  if (/^[+\d\s()-]+$/.test(name)) return "";
  if (contact?.external_id && name === String(contact.external_id)) return "";
  if (/^webchat visitor\b/i.test(name)) return "";
  return name;
}

export function nameParts(contact) {
  const full = realName(contact);
  const parts = full.split(/\s+/).filter(Boolean);
  return { full, first: parts[0] || "", last: parts.slice(1).join(" ") };
}

function contactValue(contact, key, hasFallback) {
  const { full, first, last } = nameParts(contact);
  switch (key) {
    case "name":
      // No fallback given: exactly as before (the stored name, else "Customer").
      return hasFallback ? full : (contact?.name || "Customer");
    case "first_name": return first;
    case "last_name": return last;
    case "email": return contact?.email || "";
    case "phone": return contact?.phone || "";
    case "age": return contact?.age !== null && contact?.age !== undefined ? String(contact.age) : "";
    default: return null; // unknown → leave the token alone
  }
}

/** Replaces contact.* and field.* tokens. Unknown contact keys are left untouched. */
export function applyPersonalization(text, contact) {
  if (!text || typeof text !== "string" || !text.includes("{{")) return text || "";
  const fields = contact?._fields || {};
  return text.replace(TOKEN_RE, (whole, scope, rawKey, fallback) => {
    const key = rawKey.toLowerCase();
    const hasFallback = fallback !== undefined;
    let value;
    if (scope.toLowerCase() === "contact") {
      value = contactValue(contact, key, hasFallback);
      if (value === null) return whole;
    } else {
      value = fields[key];
      value = value === null || value === undefined ? "" : String(value);
    }
    return String(value).trim() === "" && hasFallback ? fallback.trim() : value;
  });
}
