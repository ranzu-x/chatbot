/**
 * CRM integrations — HubSpot, Salesforce, Zoho CRM (Settings → App
 * Integrations → CRM, routes/crm.js, migrate_crm_integrations.js).
 *
 * What it does with a connection (decided with the user — push only, no pull):
 *   - pushes subscribers: every subscriber with an email or a phone that is
 *     created / changed after the connection was made (or all of them after
 *     "Sync existing subscribers") is created / updated in the CRM by the sync
 *     job below, with the connection's field mapping (settings.autoSync)
 *   - the "Send to CRM" flow element (node type crmSync) pushes the subscriber
 *     right then, with extra fields from {{variables}}, an optional note, and a
 *     Success / Fail branch (runCrmFlowStep, called from utils/flowEngine.js)
 *   - a resolved chat is attached to the CRM record as a note / task with its
 *     transcript (settings.logChats, logResolvedChatToCrm, called from the
 *     conversation status routes)
 *
 * PROVIDERS is the whole extension point: a new CRM is one entry. Credentials
 * are API keys / tokens (no OAuth app of our own), stored encrypted
 * (utils/cryptoVault.js) and only ever returned masked.
 *
 * Matching a subscriber to a CRM record: the saved link (crm_contact_links),
 * else a search by email, then phone, else a new record. A push whose mapped
 * values are unchanged since the last one (last_hash) isn't sent again.
 * Failures are recorded on the link and the connection and retried after
 * 30 minutes; they never block a flow or the Inbox.
 */
import crypto from "crypto";
import axios from "axios";
import pool from "../db.js";
import { encryptSecret, decryptSecret } from "./cryptoVault.js";
import { lockedJob } from "./jobLock.js";
import { isWorkspaceExpired } from "./subscriptionStatus.js";
import { assertModuleAccess } from "./entitlements.js";

export const CRM_MODULE = "feature_crm_integrations";
const TIMEOUT_MS = 15_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SALESFORCE_API_VERSION = process.env.SALESFORCE_API_VERSION || "v62.0";
const ZOHO_API_VERSION = process.env.ZOHO_CRM_API_VERSION || "v8";
const ZOHO_DCS = { com: "US (zoho.com)", eu: "EU (zoho.eu)", in: "India (zoho.in)", "com.au": "Australia (zoho.com.au)", jp: "Japan (zoho.jp)", ca: "Canada (zohocloud.ca)", sa: "Saudi Arabia (zoho.sa)", uk: "UK (zoho.uk)", "com.cn": "China (zoho.com.cn)" };

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

/** One HTTP call to a CRM; redirects are never followed. Errors carry `providerStatus`. */
async function call(provider, config) {
  try {
    const res = await axios({ timeout: TIMEOUT_MS, maxRedirects: 0, ...config });
    return { data: res.data, status: res.status };
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    const first = Array.isArray(data) ? data[0] : null; // Salesforce answers [{ message, errorCode }]
    const zoho = Array.isArray(data?.data) ? data.data[0] : null;
    const detail = first?.message || zoho?.message || data?.message || data?.error_description || data?.error || err.message;
    const message = status === 401 || status === 403
      ? `${provider} rejected the credentials (${status}): ${String(detail).slice(0, 160)}`
      : `${provider} error${status ? ` (${status})` : ""}: ${String(detail).slice(0, 200)}`;
    throw Object.assign(new Error(message), { status: 400, providerStatus: status, providerData: data });
  }
}

// Short-lived access tokens (Salesforce / Zoho), per connection + credentials.
const tokenCache = new Map();
const cacheKey = (c) => crypto.createHash("sha1").update(JSON.stringify(c)).digest("hex");
async function cachedToken(c, fetcher) {
  const key = cacheKey(c);
  const hit = tokenCache.get(key);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.value;
  const value = await fetcher();
  tokenCache.set(key, { value, expiresAt: Date.now() + (value.ttlMs || 30 * 60_000) });
  return value;
}
const dropToken = (c) => tokenCache.delete(cacheKey(c));

/** Retries once with a fresh token when the CRM says the token expired. */
async function withSession(c, open, fn) {
  try {
    return await fn(await open(c));
  } catch (err) {
    if (err.providerStatus !== 401) throw err;
    dropToken(c);
    return fn(await open(c));
  }
}

const soqlString = (v) => `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

export const PROVIDERS = {
  hubspot: {
    label: "HubSpot",
    help: "HubSpot → Settings → Integrations → Private Apps → create an app with the scopes crm.objects.contacts.read, crm.objects.contacts.write and crm.schemas.contacts.read, then copy its access token.",
    fields: [{ key: "accessToken", label: "Private app access token", secret: true, required: true, placeholder: "pat-na1-…" }],
    objects: [{ id: "contacts", label: "Contact" }],
    noteLabel: "note",
    async clean(input) {
      const accessToken = String(input.accessToken || "").trim();
      if (!/^pat-[a-z0-9]+-/i.test(accessToken)) throw fail("That doesn't look like a HubSpot private app token (it starts with pat-).");
      return { accessToken };
    },
    headers: (c) => ({ Authorization: `Bearer ${c.accessToken}`, "Content-Type": "application/json" }),
    async listFields(c) {
      const { data } = await call("HubSpot", { method: "GET", url: "https://api.hubapi.com/crm/v3/properties/contacts", headers: this.headers(c) });
      return (data?.results || [])
        .filter((p) => p.modificationMetadata?.readOnlyValue !== true && !p.calculated && !p.hidden)
        .map((p) => ({ name: p.name, label: p.label, required: false }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },
    async test(c) {
      await call("HubSpot", { method: "GET", url: "https://api.hubapi.com/crm/v3/objects/contacts", params: { limit: 1 }, headers: this.headers(c) });
    },
    standard: (p) => ({
      ...(p.firstName ? { firstname: p.firstName } : {}),
      ...(p.lastName ? { lastname: p.lastName } : {}),
      ...(p.email ? { email: p.email } : {}),
      ...(p.phone ? { phone: p.phone } : {}),
    }),
    async find(c, settings, { email, phone }) {
      for (const [propertyName, value] of [["email", email], ["phone", phone]]) {
        if (!value) continue;
        const { data } = await call("HubSpot", {
          method: "POST", url: "https://api.hubapi.com/crm/v3/objects/contacts/search", headers: this.headers(c),
          data: { filterGroups: [{ filters: [{ propertyName, operator: "EQ", value }] }], properties: ["email"], limit: 1 },
        });
        if (data?.results?.[0]?.id) return String(data.results[0].id);
      }
      return null;
    },
    async create(c, settings, properties) {
      try {
        const { data } = await call("HubSpot", { method: "POST", url: "https://api.hubapi.com/crm/v3/objects/contacts", headers: this.headers(c), data: { properties } });
        return String(data.id);
      } catch (err) {
        // 409 "Contact already exists. Existing ID: 123" — use that record.
        const existing = err.providerStatus === 409 && String(err.providerData?.message || "").match(/Existing ID:\s*(\d+)/i);
        if (existing) { await this.update(c, settings, existing[1], properties); return existing[1]; }
        throw err;
      }
    },
    async update(c, settings, id, properties) {
      await call("HubSpot", { method: "PATCH", url: `https://api.hubapi.com/crm/v3/objects/contacts/${encodeURIComponent(id)}`, headers: this.headers(c), data: { properties } });
    },
    async addNote(c, settings, id, { title, body }) {
      await call("HubSpot", {
        method: "POST", url: "https://api.hubapi.com/crm/v3/objects/notes", headers: this.headers(c),
        data: {
          properties: { hs_timestamp: new Date().toISOString(), hs_note_body: `<b>${escapeHtml(title)}</b><br>${escapeHtml(body).replace(/\n/g, "<br>")}` },
          // 202 = note → contact (HUBSPOT_DEFINED)
          associations: [{ to: { id: String(id) }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }],
        },
      });
    },
  },

  salesforce: {
    label: "Salesforce",
    help: "Setup → App Manager → New Connected App (or External Client App) with OAuth, the Client Credentials Flow enabled and a Run As user, scopes api + refresh_token. Enter your My Domain URL and the app's consumer key and secret.",
    fields: [
      { key: "instanceUrl", label: "My Domain URL", secret: false, required: true, placeholder: "https://yourcompany.my.salesforce.com" },
      { key: "clientId", label: "Consumer key", secret: false, required: true },
      { key: "clientSecret", label: "Consumer secret", secret: true, required: true },
    ],
    objects: [{ id: "Lead", label: "Lead" }, { id: "Contact", label: "Contact" }],
    noteLabel: "completed task",
    async clean(input) {
      let raw = String(input.instanceUrl || "").trim();
      if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
      let url;
      try { url = new URL(raw); } catch { throw fail("The My Domain URL isn't a valid address"); }
      // Only Salesforce's own hosts: this address receives the app secret.
      if (url.protocol !== "https:" || !/(^|\.)(salesforce\.com|force\.com)$/i.test(url.hostname)) {
        throw fail("Use your Salesforce My Domain address, e.g. https://yourcompany.my.salesforce.com");
      }
      const clientId = String(input.clientId || "").trim();
      const clientSecret = String(input.clientSecret || "").trim();
      if (!clientId || !clientSecret) throw fail("Enter the connected app's consumer key and secret.");
      return { instanceUrl: url.origin, clientId, clientSecret };
    },
    session(c) {
      return cachedToken(c, async () => {
        const { data } = await call("Salesforce", {
          method: "POST", url: `${c.instanceUrl}/services/oauth2/token`,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          data: new URLSearchParams({ grant_type: "client_credentials", client_id: c.clientId, client_secret: c.clientSecret }).toString(),
        });
        if (!data?.access_token) throw fail("Salesforce didn't return an access token.");
        // Always talk to the configured My Domain (never an address from the response).
        return { token: data.access_token, base: `${c.instanceUrl}/services/data/${SALESFORCE_API_VERSION}`, ttlMs: 30 * 60_000 };
      });
    },
    async req(c, config) {
      return withSession(c, (x) => this.session(x), (s) => call("Salesforce", { ...config, url: `${s.base}${config.path}`, headers: { Authorization: `Bearer ${s.token}`, "Content-Type": "application/json" } }));
    },
    object: (settings) => (settings?.object === "Contact" ? "Contact" : "Lead"),
    async listFields(c, settings) {
      const { data } = await this.req(c, { method: "GET", path: `/sobjects/${this.object(settings)}/describe` });
      return (data?.fields || [])
        .filter((f) => f.createable || f.updateable)
        .map((f) => ({ name: f.name, label: f.label, required: !f.nillable && f.createable && !f.defaultedOnCreate }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },
    async test(c, settings) {
      await this.req(c, { method: "GET", path: `/sobjects/${this.object(settings)}/describe` });
    },
    standard: (p, settings) => ({
      ...(p.firstName ? { FirstName: p.firstName } : {}),
      LastName: p.lastName,
      ...(p.email ? { Email: p.email } : {}),
      ...(p.phone ? { Phone: p.phone } : {}),
      ...(settings?.object === "Contact" ? {} : { Company: String(settings?.company || "").trim() || p.name || "Chat subscriber" }),
    }),
    async find(c, settings, { email, phone }) {
      const obj = this.object(settings);
      for (const [field, value] of [["Email", email], ["Phone", phone]]) {
        if (!value) continue;
        const q = `SELECT Id FROM ${obj} WHERE ${field} = ${soqlString(value)}${obj === "Lead" ? " AND IsConverted = false" : ""} ORDER BY LastModifiedDate DESC LIMIT 1`;
        const { data } = await this.req(c, { method: "GET", path: `/query?q=${encodeURIComponent(q)}` });
        if (data?.records?.[0]?.Id) return data.records[0].Id;
      }
      return null;
    },
    async create(c, settings, properties) {
      const { data } = await this.req(c, { method: "POST", path: `/sobjects/${this.object(settings)}`, data: properties });
      if (!data?.id) throw fail("Salesforce didn't return the new record id.");
      return data.id;
    },
    async update(c, settings, id, properties) {
      await this.req(c, { method: "PATCH", path: `/sobjects/${this.object(settings)}/${encodeURIComponent(id)}`, data: properties });
    },
    async addNote(c, settings, id, { title, body }) {
      await this.req(c, {
        method: "POST", path: "/sobjects/Task",
        data: { WhoId: id, Subject: title.slice(0, 255), Description: body.slice(0, 32000), Status: "Completed", ActivityDate: new Date().toISOString().slice(0, 10) },
      });
    },
  },

  zoho: {
    label: "Zoho CRM",
    help: "api-console.zoho.com → Self Client → generate a code with the scope ZohoCRM.modules.ALL,ZohoCRM.settings.fields.READ, then exchange it for a refresh token. Enter the client id, client secret, refresh token and your Zoho data center.",
    fields: [
      { key: "dataCenter", label: "Data center", secret: false, required: true, options: Object.entries(ZOHO_DCS).map(([value, label]) => ({ value, label })) },
      { key: "clientId", label: "Client ID", secret: false, required: true },
      { key: "clientSecret", label: "Client secret", secret: true, required: true },
      { key: "refreshToken", label: "Refresh token", secret: true, required: true },
    ],
    objects: [{ id: "Leads", label: "Lead" }, { id: "Contacts", label: "Contact" }],
    noteLabel: "note",
    async clean(input) {
      const dataCenter = String(input.dataCenter || "com").trim();
      if (!ZOHO_DCS[dataCenter]) throw fail("Choose your Zoho data center.");
      const clientId = String(input.clientId || "").trim();
      const clientSecret = String(input.clientSecret || "").trim();
      const refreshToken = String(input.refreshToken || "").trim();
      if (!clientId || !clientSecret || !refreshToken) throw fail("Enter the client id, client secret and refresh token.");
      return { dataCenter, clientId, clientSecret, refreshToken };
    },
    accounts: (c) => (c.dataCenter === "ca" ? "https://accounts.zohocloud.ca" : `https://accounts.zoho.${c.dataCenter}`),
    apis: (c) => (c.dataCenter === "ca" ? "https://www.zohoapis.ca" : `https://www.zohoapis.${c.dataCenter}`),
    session(c) {
      return cachedToken(c, async () => {
        const { data } = await call("Zoho", {
          method: "POST", url: `${this.accounts(c)}/oauth/v2/token`,
          params: { refresh_token: c.refreshToken, client_id: c.clientId, client_secret: c.clientSecret, grant_type: "refresh_token" },
        });
        if (!data?.access_token) throw fail(`Zoho didn't return an access token${data?.error ? ` (${data.error})` : ""}. Check the refresh token and data center.`);
        return { token: data.access_token, base: `${this.apis(c)}/crm/${ZOHO_API_VERSION}`, ttlMs: Math.max(5 * 60_000, (Number(data.expires_in) || 3600) * 1000) };
      });
    },
    async req(c, config) {
      return withSession(c, (x) => this.session(x), (s) => call("Zoho", { ...config, url: `${s.base}${config.path}`, headers: { Authorization: `Zoho-oauthtoken ${s.token}`, "Content-Type": "application/json" } }));
    },
    module: (settings) => (settings?.object === "Contacts" ? "Contacts" : "Leads"),
    async listFields(c, settings) {
      const { data } = await this.req(c, { method: "GET", path: `/settings/fields?module=${this.module(settings)}` });
      return (data?.fields || [])
        .filter((f) => !f.read_only && f.data_type !== "lookup" && f.data_type !== "ownerlookup" && f.data_type !== "fileupload")
        .map((f) => ({ name: f.api_name, label: f.field_label || f.display_label || f.api_name, required: Boolean(f.system_mandatory) }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },
    async test(c, settings) {
      await this.req(c, { method: "GET", path: `/settings/fields?module=${this.module(settings)}` });
    },
    standard: (p) => ({
      ...(p.firstName ? { First_Name: p.firstName } : {}),
      Last_Name: p.lastName,
      ...(p.email ? { Email: p.email } : {}),
      ...(p.phone ? { Phone: p.phone } : {}),
    }),
    async find(c, settings, { email, phone }) {
      for (const [param, value] of [["email", email], ["phone", phone]]) {
        if (!value) continue;
        const { data } = await this.req(c, { method: "GET", path: `/${this.module(settings)}/search?${param}=${encodeURIComponent(value)}` });
        if (data?.data?.[0]?.id) return String(data.data[0].id); // 204 (no match) has no body
      }
      return null;
    },
    recordResult(data) {
      const row = data?.data?.[0];
      if (!row || row.status === "error") throw fail(`Zoho refused the record: ${row?.message || "unknown error"}${row?.details?.api_name ? ` (${row.details.api_name})` : ""}`);
      return String(row.details?.id || "");
    },
    async create(c, settings, properties) {
      const { data } = await this.req(c, { method: "POST", path: `/${this.module(settings)}`, data: { data: [properties], trigger: [] } });
      return this.recordResult(data);
    },
    async update(c, settings, id, properties) {
      const { data } = await this.req(c, { method: "PUT", path: `/${this.module(settings)}/${encodeURIComponent(id)}`, data: { data: [properties], trigger: [] } });
      this.recordResult(data);
    },
    async addNote(c, settings, id, { title, body }) {
      await this.req(c, { method: "POST", path: `/${this.module(settings)}/${encodeURIComponent(id)}/Notes`, data: { data: [{ Note_Title: title.slice(0, 120), Note_Content: body.slice(0, 32000) }] } });
    },
  },
};

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

// ─── Subscriber → CRM values ────────────────────────────────────────────────

/** What a mapping row may read (the UI builds its picker from this + custom fields). */
export const SOURCE_FIELDS = [
  { id: "contact.first_name", label: "First name" },
  { id: "contact.last_name", label: "Last name" },
  { id: "contact.name", label: "Full name" },
  { id: "contact.email", label: "Email" },
  { id: "contact.phone", label: "Phone" },
  { id: "contact.age", label: "Age" },
  { id: "contact.platform", label: "Channel" },
  { id: "contact.labels", label: "Labels (comma separated)" },
  { id: "contact.subscribed_at", label: "Subscribed on (date)" },
  { id: "contact.status", label: "Subscription status" },
];

const splitName = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
};

/** Digits-only WhatsApp numbers get their "+" back; anything else is sent as saved. */
const displayPhone = (v) => {
  const s = String(v || "").trim();
  return /^\d{8,15}$/.test(s) ? `+${s}` : s;
};

/** A subscriber's email / phone / name as the CRM should see them. */
export function personOf(contact) {
  const email = EMAIL_RE.test(String(contact?.email || "").trim()) ? String(contact.email).trim().toLowerCase() : "";
  let phone = String(contact?.phone || "").trim();
  if (!phone && contact?.platform === "WHATSAPP" && /^\d{8,15}$/.test(String(contact?.external_id || ""))) phone = contact.external_id;
  const rawName = String(contact?.name || "").trim();
  // Placeholder names ("Webchat Visitor", a bare number) aren't a person's name.
  const name = /^(webchat visitor|visitor|customer|unknown)\b/i.test(rawName) || /^\+?\d[\d\s-]{5,}$/.test(rawName) ? "" : rawName;
  const { firstName, lastName } = splitName(name);
  return {
    name,
    firstName: lastName ? firstName : "",
    // Salesforce / Zoho need a last name: fall back to the one word, the email, the phone.
    lastName: lastName || firstName || (email ? email.split("@")[0] : "") || displayPhone(phone) || "Subscriber",
    email,
    phone: displayPhone(phone),
  };
}

async function loadFieldValues(contactId) {
  const [rows] = await pool.query(
    `SELECT d.field_key, v.value FROM contact_custom_field_values v
       JOIN custom_field_definitions d ON d.id = v.field_id AND d.is_active = 1
      WHERE v.contact_id = ?`,
    [contactId]
  );
  return Object.fromEntries(rows.map((r) => [r.field_key, r.value]));
}

async function loadLabels(contactId) {
  const [rows] = await pool.query(
    "SELECT l.name FROM contact_labels cl JOIN labels l ON l.id = cl.label_id WHERE cl.contact_id = ? ORDER BY l.name",
    [contactId]
  ).catch(() => [[]]);
  return rows.map((r) => r.name).join(", ");
}

function sourceValue(source, contact, person, fieldValues, labels) {
  const s = String(source || "");
  if (s.startsWith("text:")) return s.slice(5);
  if (s.startsWith("field.")) return fieldValues[s.slice(6)] ?? "";
  switch (s) {
    case "contact.first_name": return person.firstName || person.name.split(/\s+/)[0] || "";
    case "contact.last_name": return person.lastName;
    case "contact.name": return person.name;
    case "contact.email": return person.email;
    case "contact.phone": return person.phone;
    case "contact.age": return contact.age ?? "";
    case "contact.platform": return contact.platform ? String(contact.platform).charAt(0) + String(contact.platform).slice(1).toLowerCase() : "";
    case "contact.labels": return labels;
    case "contact.subscribed_at": return contact.created_at ? new Date(contact.created_at).toISOString().slice(0, 10) : "";
    case "contact.status": return contact.subscription_status || "";
    default: return "";
  }
}

/** Standard fields + the connection's mapping (+ a flow element's extra fields, already filled in). */
async function buildProperties(provider, settings, contact, extra = {}) {
  const person = personOf(contact);
  const map = Array.isArray(settings?.fieldMap) ? settings.fieldMap : [];
  const needsFields = map.some((m) => String(m.source || "").startsWith("field."));
  const needsLabels = map.some((m) => m.source === "contact.labels");
  const fieldValues = needsFields ? await loadFieldValues(contact.id) : {};
  const labels = needsLabels ? await loadLabels(contact.id) : "";
  const props = { ...provider.standard(person, settings) };
  for (const m of map) {
    const target = String(m.target || "").trim();
    if (!target) continue;
    const value = sourceValue(m.source, contact, person, fieldValues, labels);
    if (value !== "" && value !== null && value !== undefined) props[target] = String(value);
  }
  for (const [k, v] of Object.entries(extra)) {
    if (k && v !== "" && v !== null && v !== undefined) props[k] = String(v);
  }
  return { props, person };
}

// ─── Connections ────────────────────────────────────────────────────────────

const parseJson = (v) => { if (!v) return {}; if (typeof v === "object") return v; try { return JSON.parse(v); } catch { return {}; } };
const openCredentials = (row) => { try { return JSON.parse(decryptSecret(row.credentials)); } catch { return null; } };
export const sealCredentials = (credentials) => encryptSecret(JSON.stringify(credentials));
const mask = (v) => { const s = String(v || ""); return s.length <= 4 ? "••••" : `••••••••${s.slice(-4)}`; };
const isMasked = (v) => typeof v === "string" && v.includes("•");

export const providerCatalog = () => Object.entries(PROVIDERS).map(([id, p]) => ({
  id, label: p.label, help: p.help, fields: p.fields, objects: p.objects, noteLabel: p.noteLabel,
}));

/** Settings a connection may hold — anything else is dropped. */
export function cleanSettings(providerId, input = {}) {
  const provider = PROVIDERS[providerId];
  const objectIds = (provider?.objects || []).map((o) => o.id);
  const fieldMap = (Array.isArray(input.fieldMap) ? input.fieldMap : [])
    .map((m) => ({ source: String(m?.source || "").slice(0, 120), target: String(m?.target || "").trim().slice(0, 120) }))
    .filter((m) => m.target && /^(contact\.[a-z_]+|field\.[A-Za-z0-9_-]+|text:.{0,255})$/s.test(m.source))
    .slice(0, 50);
  return {
    autoSync: input.autoSync !== false,
    logChats: Boolean(input.logChats),
    object: objectIds.includes(input.object) ? input.object : objectIds[0],
    company: String(input.company || "").trim().slice(0, 120),
    fieldMap,
  };
}

export function toClient(row) {
  const provider = PROVIDERS[row.provider];
  const creds = openCredentials(row) || {};
  const shown = {};
  for (const f of provider?.fields || []) shown[f.key] = f.secret ? (creds[f.key] ? mask(creds[f.key]) : "") : (creds[f.key] || "");
  return {
    id: row.id,
    provider: row.provider,
    providerLabel: provider?.label || row.provider,
    name: row.name,
    status: row.status,
    lastError: row.last_error,
    lastSuccessAt: row.last_success_at,
    syncSince: row.sync_since,
    settings: cleanSettings(row.provider, parseJson(row.settings)),
    credentials: shown,
    createdAt: row.created_at,
  };
}

/** Validates credentials and tests them live. On edit, a masked / empty secret keeps the stored one. */
export async function prepareConnection(providerId, input = {}, settingsInput = {}, existingRow = null) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw fail("Unknown CRM");
  const stored = existingRow ? openCredentials(existingRow) || {} : {};
  const merged = { ...input };
  for (const f of provider.fields) {
    if (f.secret && existingRow && (!merged[f.key] || isMasked(merged[f.key]))) merged[f.key] = stored[f.key];
  }
  const credentials = await provider.clean(merged);
  const settings = cleanSettings(providerId, settingsInput);
  await provider.test(credentials, settings);
  return { credentials, settings };
}

export async function getOwnedConnection(agencyId, id) {
  if (!/^\d+$/.test(String(id || ""))) return null;
  const [[row]] = await pool.query("SELECT * FROM crm_connections WHERE id = ? AND agency_id = ?", [id, agencyId]);
  return row || null;
}

export async function listCrmFields(row, objectOverride) {
  const provider = PROVIDERS[row.provider];
  const creds = openCredentials(row);
  if (!provider || !creds) throw fail("This connection's saved credentials can't be read — edit it and save the keys again.");
  const settings = { ...cleanSettings(row.provider, parseJson(row.settings)), ...(objectOverride ? { object: objectOverride } : {}) };
  return provider.listFields(creds, settings);
}

async function markConnection(rowId, error) {
  if (error) {
    await pool.query("UPDATE crm_connections SET status = 'ERROR', last_error = ? WHERE id = ?", [String(error).slice(0, 500), rowId]).catch(() => {});
  } else {
    await pool.query("UPDATE crm_connections SET status = 'CONNECTED', last_error = NULL, last_success_at = NOW() WHERE id = ?", [rowId]).catch(() => {});
  }
}

// ─── Push one subscriber ────────────────────────────────────────────────────

/**
 * Creates / updates the subscriber's record. `extra` = more CRM fields (flow
 * element), `force` = send even when nothing changed since the last push.
 * Returns { ok, externalId, created, skipped, error }. Never throws.
 */
export async function pushContact(row, contact, { extra = {}, force = false } = {}) {
  const provider = PROVIDERS[row.provider];
  const creds = openCredentials(row);
  const settings = cleanSettings(row.provider, parseJson(row.settings));
  const [[link]] = await pool.query("SELECT * FROM crm_contact_links WHERE connection_id = ? AND contact_id = ?", [row.id, contact.id]);
  try {
    if (!provider || !creds) throw fail("Saved credentials can't be read — edit the connection and save the keys again.");
    const { props, person } = await buildProperties(provider, settings, contact, extra);
    if (!person.email && !person.phone) {
      return { ok: false, error: "This subscriber has no email or phone to match in the CRM" };
    }
    const hash = crypto.createHash("sha1").update(JSON.stringify([settings.object, props])).digest("hex");
    if (!force && link?.external_id && link.last_hash === hash && !link.last_error) {
      await pool.query("UPDATE crm_contact_links SET last_synced_at = NOW(), last_attempt_at = NOW() WHERE id = ?", [link.id]);
      return { ok: true, externalId: link.external_id, skipped: true };
    }

    let externalId = link?.external_id && link.object_type === settings.object ? link.external_id : null;
    let created = false;
    if (externalId) {
      try {
        await provider.update(creds, settings, externalId, props);
      } catch (err) {
        if (err.providerStatus !== 404) throw err;
        externalId = null; // deleted in the CRM — match again below
      }
    }
    if (!externalId) {
      externalId = await provider.find(creds, settings, person);
      if (externalId) await provider.update(creds, settings, externalId, props);
      else { externalId = await provider.create(creds, settings, props); created = true; }
    }

    await pool.query(
      `INSERT INTO crm_contact_links (connection_id, contact_id, external_id, object_type, last_hash, last_synced_at, last_attempt_at, last_error)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW(), NULL)
       ON DUPLICATE KEY UPDATE external_id = VALUES(external_id), object_type = VALUES(object_type), last_hash = VALUES(last_hash),
                               last_synced_at = NOW(), last_attempt_at = NOW(), last_error = NULL`,
      [row.id, contact.id, externalId, settings.object, hash]
    );
    await markConnection(row.id, null);
    return { ok: true, externalId, created };
  } catch (err) {
    const message = String(err.message || err).slice(0, 500);
    await pool.query(
      `INSERT INTO crm_contact_links (connection_id, contact_id, last_attempt_at, last_error) VALUES (?, ?, NOW(), ?)
       ON DUPLICATE KEY UPDATE last_attempt_at = NOW(), last_error = VALUES(last_error)`,
      [row.id, contact.id, message]
    ).catch(() => {});
    // Credentials / permission problems mark the whole connection; a single bad record doesn't.
    if (err.providerStatus === 401 || err.providerStatus === 403 || !creds) await markConnection(row.id, message);
    return { ok: false, error: message };
  }
}

async function crmAllowed(agencyId) {
  if (await isWorkspaceExpired(agencyId)) return false;
  try { await assertModuleAccess(agencyId, CRM_MODULE); return true; } catch { return false; }
}

// ─── Flow element "Send to CRM" (crmSync) ───────────────────────────────────

/**
 * data: { connectionId, extraFields: [{ target, value }] ({{variables}} allowed),
 *         note: text ({{variables}} allowed, optional) }
 * `fill(text)` = the engine's replaceVariables for this subscriber.
 */
export async function runCrmFlowStep({ agencyId, contact, data, fill }) {
  if (!contact) return { ok: false, error: "No subscriber" };
  if (!(await crmAllowed(agencyId))) return { ok: false, error: "CRM integrations aren't available on this plan" };
  const row = await getOwnedConnection(agencyId, data?.connectionId);
  if (!row) return { ok: false, error: "The CRM connection was removed" };
  const extra = {};
  for (const f of Array.isArray(data?.extraFields) ? data.extraFields : []) {
    const target = String(f?.target || "").trim();
    if (!target) continue;
    const value = fill(String(f?.value ?? ""));
    if (!value.includes("{{")) extra[target] = value.trim();
  }
  const result = await pushContact(row, contact, { extra, force: Object.keys(extra).length > 0 });
  const noteText = String(data?.note || "").trim() ? fill(String(data.note)).trim() : "";
  if (result.ok && noteText) {
    try {
      const provider = PROVIDERS[row.provider];
      await provider.addNote(openCredentials(row), cleanSettings(row.provider, parseJson(row.settings)), result.externalId, { title: "Chatbot note", body: noteText });
    } catch (err) {
      console.error(`[CRM] note on ${row.provider} #${row.id} failed:`, err.message);
    }
  }
  return result;
}

// ─── Resolved chat → note / task ────────────────────────────────────────────

/** Fire-and-forget from the conversation status routes. */
export function logResolvedChatToCrm({ agencyId, conversationId }) {
  logResolvedChat(agencyId, conversationId).catch((err) => console.error("[CRM] chat log failed:", err.message));
}

async function logResolvedChat(agencyId, conversationId) {
  const [conns] = await pool.query("SELECT * FROM crm_connections WHERE agency_id = ?", [agencyId]);
  const logging = conns.filter((r) => cleanSettings(r.provider, parseJson(r.settings)).logChats);
  if (!logging.length || !(await crmAllowed(agencyId))) return;
  const [[conv]] = await pool.query(
    `SELECT cv.id, cv.contact_id, i.platform, i.name AS integration_name FROM conversations cv
       LEFT JOIN integrations i ON i.id = cv.integration_id
      WHERE cv.id = ? AND cv.agency_id = ?`,
    [conversationId, agencyId]
  );
  if (!conv?.contact_id) return;
  const [[contact]] = await pool.query("SELECT * FROM contacts WHERE id = ? AND agency_id = ?", [conv.contact_id, agencyId]);
  if (!contact) return;
  const { loadTranscript } = await import("./inboxAssist.js");
  const lines = await loadTranscript(conv.id);
  if (!lines.length) return;
  const channel = conv.platform ? String(conv.platform).charAt(0) + String(conv.platform).slice(1).toLowerCase() : "Chat";
  const title = `${channel} chat${conv.integration_name ? ` (${conv.integration_name})` : ""} — resolved ${new Date().toISOString().slice(0, 10)}`;
  const body = `${lines.join("\n")}\n\n(Last ${lines.length} messages, sent by the chatbot platform when the chat was resolved.)`;
  for (const row of logging) {
    const result = await pushContact(row, contact);
    if (!result.ok) continue;
    try {
      await PROVIDERS[row.provider].addNote(openCredentials(row), cleanSettings(row.provider, parseJson(row.settings)), result.externalId, { title, body });
    } catch (err) {
      await markConnection(row.id, `Logging a chat failed: ${err.message}`);
    }
  }
}

// ─── Background sync ────────────────────────────────────────────────────────

const SYNC_BATCH = 100;
const SYNC_TICK_BUDGET_MS = 45_000;
const RETRY_AFTER_MINUTES = 30;

// When the subscriber (or one of their field values) last changed.
const CHANGED_AT = `GREATEST(c.updated_at, COALESCE((SELECT MAX(v.updated_at) FROM contact_custom_field_values v WHERE v.contact_id = c.id), c.updated_at))`;
const HAS_IDENTITY = `((c.email IS NOT NULL AND c.email <> '') OR (c.phone IS NOT NULL AND c.phone <> '') OR (c.platform = 'WHATSAPP' AND c.external_id REGEXP '^[0-9]{8,15}$'))`;

/** Subscribers of this connection's workspace that need a push now. */
async function dueContacts(row, limit) {
  const [rows] = await pool.query(
    `SELECT c.* FROM contacts c
       LEFT JOIN crm_contact_links l ON l.connection_id = ? AND l.contact_id = c.id
      WHERE c.agency_id = ? AND ${HAS_IDENTITY}
        AND ${CHANGED_AT} >= ?
        AND (l.id IS NULL OR l.last_synced_at IS NULL OR ${CHANGED_AT} > l.last_synced_at)
        AND (l.last_error IS NULL OR l.last_attempt_at < NOW() - INTERVAL ${RETRY_AFTER_MINUTES} MINUTE)
      ORDER BY c.id ASC
      LIMIT ?`,
    [row.id, row.agency_id, row.sync_since, limit]
  );
  return rows;
}

export async function syncConnection(row, { limit = SYNC_BATCH, deadline = Date.now() + SYNC_TICK_BUDGET_MS } = {}) {
  const contacts = await dueContacts(row, limit);
  let pushed = 0; let failed = 0;
  for (const contact of contacts) {
    if (Date.now() > deadline) break;
    const r = await pushContact(row, contact);
    if (r.ok) pushed++; else failed++;
    // Credentials broken: stop this connection until the next tick.
    if (!r.ok && /rejected the credentials/.test(r.error || "")) break;
  }
  return { pushed, failed, due: contacts.length };
}

export async function runCrmSyncTick() {
  const [conns] = await pool.query("SELECT * FROM crm_connections ORDER BY id ASC");
  const deadline = Date.now() + SYNC_TICK_BUDGET_MS;
  const allowed = new Map();
  for (const row of conns) {
    if (Date.now() > deadline) break;
    if (!cleanSettings(row.provider, parseJson(row.settings)).autoSync) continue;
    if (!allowed.has(row.agency_id)) allowed.set(row.agency_id, await crmAllowed(row.agency_id));
    if (!allowed.get(row.agency_id)) continue;
    try {
      await syncConnection(row, { deadline });
    } catch (err) {
      console.error(`[CRM sync] connection ${row.id}:`, err.message);
    }
  }
}

/** Sync numbers for the settings screen. */
export async function connectionStats(row) {
  const [[stats]] = await pool.query(
    `SELECT SUM(external_id IS NOT NULL AND last_error IS NULL) AS synced, SUM(last_error IS NOT NULL) AS failed, MAX(last_synced_at) AS lastSyncedAt
       FROM crm_contact_links WHERE connection_id = ?`,
    [row.id]
  );
  const [[pending]] = await pool.query(
    `SELECT COUNT(*) AS n FROM contacts c LEFT JOIN crm_contact_links l ON l.connection_id = ? AND l.contact_id = c.id
      WHERE c.agency_id = ? AND ${HAS_IDENTITY} AND ${CHANGED_AT} >= ?
        AND (l.id IS NULL OR l.last_synced_at IS NULL OR ${CHANGED_AT} > l.last_synced_at)`,
    [row.id, row.agency_id, row.sync_since]
  );
  const [recentErrors] = await pool.query(
    `SELECT l.contact_id AS contactId, c.name, l.last_error AS error, l.last_attempt_at AS at
       FROM crm_contact_links l JOIN contacts c ON c.id = l.contact_id
      WHERE l.connection_id = ? AND l.last_error IS NOT NULL ORDER BY l.last_attempt_at DESC LIMIT 5`,
    [row.id]
  );
  return { synced: Number(stats?.synced || 0), failed: Number(stats?.failed || 0), pending: Number(pending?.n || 0), lastSyncedAt: stats?.lastSyncedAt || null, recentErrors };
}

export function startCrmSyncScheduler() {
  console.log("🔗 CRM sync scheduler started (runs every 60 seconds)");
  setInterval(lockedJob("crm-sync", async () => {
    try { await runCrmSyncTick(); } catch (err) { console.error("[CRM sync] tick failed:", err.message); }
  }), 60_000);
}
