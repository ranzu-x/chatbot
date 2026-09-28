/**
 * Auto Responders — push an email collected by a User Input Flow to the
 * workspace's email-marketing tool (Bot Settings → Auto Responder tab,
 * routes/autoResponders.js, migrate_bot_settings.js).
 *
 * PROVIDERS is the whole extension point: a new tool is one entry with its
 * credential fields and four functions (test, lists, subscribe + describe).
 * Nothing else in the app knows about individual providers.
 *
 * Credentials are stored encrypted (utils/cryptoVault.js, ENCRYPTION_KEY) in
 * auto_responder_integrations.credentials and never leave the server: the API
 * only ever returns a masked copy (maskCredentials).
 *
 * Where it runs: when a User Input Flow completes (utils/flowEngine.js
 * completeUserInputFlowResponse) and its Start element has an auto responder
 * + list chosen, the first email answer (else the subscriber's email) is
 * subscribed. Best-effort: a failure is logged on the integration
 * (status ERROR + last_error) and never blocks the subscriber's flow.
 */
import crypto from "crypto";
import axios from "axios";
import pool from "../db.js";
import { encryptSecret, decryptSecret } from "./cryptoVault.js";
import { assertPublicUrl } from "./webCrawler.js";

const TIMEOUT_MS = 12_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

/** A tenant-supplied base URL (ActiveCampaign / Mautic): http(s) only, and in production never a private address. */
async function cleanBaseUrl(raw, label) {
  let value = String(raw || "").trim();
  if (!value) throw fail(`${label} is required`);
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  let url;
  try { url = new URL(value); } catch { throw fail(`${label} is not a valid address`); }
  if (process.env.NODE_ENV === "production") {
    if (url.protocol !== "https:") throw fail(`${label} must start with https://`);
    await assertPublicUrl(url.href);
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

/** One HTTP call to a provider; redirects are not followed (they could point anywhere). */
async function call(config) {
  try {
    const res = await axios({ timeout: TIMEOUT_MS, maxRedirects: 0, ...config });
    return res.data;
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    const detail =
      data?.detail || data?.title || data?.message ||
      (Array.isArray(data?.errors) ? (data.errors[0]?.title || data.errors[0]?.message || data.errors[0]?.detail) : null) ||
      (typeof data?.error === "string" ? data.error : data?.error?.message) ||
      err.message;
    const message = status === 401 || status === 403
      ? `The ${config._provider || "provider"} rejected the credentials (${status}). Check the API key.`
      : `${config._provider || "Provider"} error${status ? ` (${status})` : ""}: ${String(detail).slice(0, 200)}`;
    throw Object.assign(new Error(message), { status: 400, providerStatus: status });
  }
}

const splitName = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] || "", lastName: parts.slice(1).join(" ") };
};

export const PROVIDERS = {
  mailchimp: {
    label: "Mailchimp",
    help: "Account → Extras → API keys. The key ends with your data center, e.g. -us21.",
    fields: [{ key: "apiKey", label: "API key", secret: true, required: true, placeholder: "xxxxxxxxxxxxxxxx-us21" }],
    options: [{ key: "doubleOptIn", label: "Send Mailchimp's confirmation email (double opt-in)", type: "boolean" }],
    listLabel: "Audience",
    async clean(input) {
      const apiKey = String(input.apiKey || "").trim();
      if (!/^[0-9a-f]{32}-[a-z]{2,4}\d{1,3}$/i.test(apiKey)) throw fail("That doesn't look like a Mailchimp API key (it ends with -us21 or similar).");
      return { credentials: { apiKey }, settings: {} };
    },
    base: (c) => `https://${c.apiKey.split("-").pop()}.api.mailchimp.com/3.0`,
    auth: (c) => ({ username: "anystring", password: c.apiKey }),
    async test(c) {
      await call({ _provider: "Mailchimp", method: "GET", url: `${this.base(c)}/ping`, auth: this.auth(c) });
    },
    async lists(c) {
      const data = await call({ _provider: "Mailchimp", method: "GET", url: `${this.base(c)}/lists`, params: { count: 200, fields: "lists.id,lists.name" }, auth: this.auth(c) });
      return (data?.lists || []).map((l) => ({ id: String(l.id), name: l.name }));
    },
    async subscribe(c, settings, person, listId) {
      const hash = crypto.createHash("md5").update(person.email.toLowerCase()).digest("hex");
      const { firstName, lastName } = splitName(person.name);
      await call({
        _provider: "Mailchimp", method: "PUT", url: `${this.base(c)}/lists/${encodeURIComponent(listId)}/members/${hash}`, auth: this.auth(c),
        data: {
          email_address: person.email,
          // Never re-subscribe someone who unsubscribed: status_if_new only applies to new members.
          status_if_new: settings?.doubleOptIn ? "pending" : "subscribed",
          merge_fields: { ...(firstName ? { FNAME: firstName } : {}), ...(lastName ? { LNAME: lastName } : {}) },
        },
      });
    },
  },

  brevo: {
    label: "Brevo",
    help: "Brevo → SMTP & API → API keys (a v3 key, starts with xkeysib-).",
    fields: [{ key: "apiKey", label: "API key", secret: true, required: true, placeholder: "xkeysib-…" }],
    options: [],
    listLabel: "List",
    async clean(input) {
      const apiKey = String(input.apiKey || "").trim();
      if (apiKey.length < 20) throw fail("Enter your Brevo API key.");
      return { credentials: { apiKey }, settings: {} };
    },
    headers: (c) => ({ "api-key": c.apiKey, accept: "application/json" }),
    async test(c) {
      await call({ _provider: "Brevo", method: "GET", url: "https://api.brevo.com/v3/account", headers: this.headers(c) });
    },
    async lists(c) {
      const data = await call({ _provider: "Brevo", method: "GET", url: "https://api.brevo.com/v3/contacts/lists", params: { limit: 50, offset: 0 }, headers: this.headers(c) });
      return (data?.lists || []).map((l) => ({ id: String(l.id), name: l.name }));
    },
    async subscribe(c, settings, person, listId) {
      const { firstName, lastName } = splitName(person.name);
      await call({
        _provider: "Brevo", method: "POST", url: "https://api.brevo.com/v3/contacts", headers: this.headers(c),
        data: {
          email: person.email,
          updateEnabled: true,
          listIds: [Number(listId)],
          attributes: { ...(firstName ? { FIRSTNAME: firstName } : {}), ...(lastName ? { LASTNAME: lastName } : {}) },
        },
      });
    },
  },

  activecampaign: {
    label: "ActiveCampaign",
    help: "Settings → Developer: your API URL (https://<account>.api-us1.com) and API key.",
    fields: [
      { key: "apiUrl", label: "API URL", secret: false, required: true, placeholder: "https://youraccount.api-us1.com" },
      { key: "apiKey", label: "API key", secret: true, required: true },
    ],
    options: [],
    listLabel: "List",
    async clean(input) {
      const apiUrl = await cleanBaseUrl(input.apiUrl, "API URL");
      const apiKey = String(input.apiKey || "").trim();
      if (apiKey.length < 20) throw fail("Enter your ActiveCampaign API key.");
      return { credentials: { apiKey, apiUrl }, settings: {} };
    },
    headers: (c) => ({ "Api-Token": c.apiKey, accept: "application/json" }),
    async test(c) {
      await call({ _provider: "ActiveCampaign", method: "GET", url: `${c.apiUrl}/api/3/users/me`, headers: this.headers(c) });
    },
    async lists(c) {
      const data = await call({ _provider: "ActiveCampaign", method: "GET", url: `${c.apiUrl}/api/3/lists`, params: { limit: 100 }, headers: this.headers(c) });
      return (data?.lists || []).map((l) => ({ id: String(l.id), name: l.name }));
    },
    async subscribe(c, settings, person, listId) {
      const { firstName, lastName } = splitName(person.name);
      const synced = await call({
        _provider: "ActiveCampaign", method: "POST", url: `${c.apiUrl}/api/3/contact/sync`, headers: this.headers(c),
        data: { contact: { email: person.email, ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}), ...(person.phone ? { phone: person.phone } : {}) } },
      });
      const contactId = synced?.contact?.id;
      if (!contactId) throw fail("ActiveCampaign didn't return the contact.");
      await call({
        _provider: "ActiveCampaign", method: "POST", url: `${c.apiUrl}/api/3/contactLists`, headers: this.headers(c),
        data: { contactList: { list: Number(listId), contact: Number(contactId), status: 1 } },
      });
    },
  },

  mautic: {
    label: "Mautic",
    help: "Your Mautic address plus an API user. In Mautic → Configuration → API Settings, enable the API and HTTP basic auth.",
    fields: [
      { key: "baseUrl", label: "Mautic URL", secret: false, required: true, placeholder: "https://mautic.example.com" },
      { key: "username", label: "API username", secret: false, required: true },
      { key: "password", label: "API password", secret: true, required: true },
    ],
    options: [],
    listLabel: "Segment",
    async clean(input) {
      const baseUrl = await cleanBaseUrl(input.baseUrl, "Mautic URL");
      const username = String(input.username || "").trim();
      const password = String(input.password || "");
      if (!username || !password) throw fail("Enter the Mautic API username and password.");
      return { credentials: { baseUrl, username, password }, settings: {} };
    },
    auth: (c) => ({ username: c.username, password: c.password }),
    async test(c) {
      await call({ _provider: "Mautic", method: "GET", url: `${c.baseUrl}/api/segments`, params: { limit: 1 }, auth: this.auth(c) });
    },
    async lists(c) {
      const data = await call({ _provider: "Mautic", method: "GET", url: `${c.baseUrl}/api/segments`, params: { limit: 200 }, auth: this.auth(c) });
      const lists = data?.lists || {};
      return Object.values(lists).map((l) => ({ id: String(l.id), name: l.name }));
    },
    async subscribe(c, settings, person, listId) {
      const { firstName, lastName } = splitName(person.name);
      const created = await call({
        _provider: "Mautic", method: "POST", url: `${c.baseUrl}/api/contacts/new`, auth: this.auth(c),
        data: { email: person.email, ...(firstName ? { firstname: firstName } : {}), ...(lastName ? { lastname: lastName } : {}), ...(person.phone ? { phone: person.phone } : {}) },
      });
      const contactId = created?.contact?.id;
      if (!contactId) throw fail("Mautic didn't return the contact.");
      await call({ _provider: "Mautic", method: "POST", url: `${c.baseUrl}/api/segments/${encodeURIComponent(listId)}/contact/${contactId}/add`, auth: this.auth(c) });
    },
  },
};

export const providerCatalog = () =>
  Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label, help: p.help, fields: p.fields, options: p.options, listLabel: p.listLabel }));

const openCredentials = (row) => {
  try { return JSON.parse(decryptSecret(row.credentials)); } catch { return null; }
};
const parseJson = (v) => { if (!v) return {}; if (typeof v === "object") return v; try { return JSON.parse(v); } catch { return {}; } };

const mask = (v) => {
  const s = String(v || "");
  return s.length <= 4 ? "••••" : `••••••••${s.slice(-4)}`;
};

/** Safe-to-send shape: secret fields masked, non-secret fields (URLs, usernames) shown. */
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
    settings: parseJson(row.settings),
    credentials: shown,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const isMasked = (v) => typeof v === "string" && v.includes("•");

/**
 * Validates provider input and tests it live. On edit, a masked / empty secret
 * means "keep the stored one". Returns { credentials, settings } (plain).
 */
export async function prepareConnection(providerId, input = {}, existingRow = null) {
  const provider = PROVIDERS[providerId];
  if (!provider) throw fail("Unknown auto responder");
  const stored = existingRow ? openCredentials(existingRow) || {} : {};
  const merged = { ...input };
  for (const f of provider.fields) {
    if (f.secret && existingRow && (!merged[f.key] || isMasked(merged[f.key]))) merged[f.key] = stored[f.key];
  }
  const { credentials } = await provider.clean(merged);
  const settings = {};
  for (const o of provider.options || []) {
    if (o.type === "boolean") settings[o.key] = Boolean(input.settings?.[o.key]);
  }
  await provider.test(credentials);
  return { credentials, settings };
}

export const sealCredentials = (credentials) => encryptSecret(JSON.stringify(credentials));

export async function getOwnedAutoResponder(agencyId, id) {
  if (!/^\d+$/.test(String(id || ""))) return null;
  const [[row]] = await pool.query("SELECT * FROM auto_responder_integrations WHERE id = ? AND agency_id = ?", [id, agencyId]);
  return row || null;
}

export async function listProviderLists(row) {
  const provider = PROVIDERS[row.provider];
  const creds = openCredentials(row);
  if (!provider || !creds) throw fail("This connection's saved credentials can't be read — edit it and save the key again.");
  return provider.lists(creds);
}

/** Pushes one person to the chosen list. Records the outcome on the integration. */
export async function subscribeToAutoResponder({ agencyId, autoResponderId, listId, person }) {
  const row = await getOwnedAutoResponder(agencyId, autoResponderId);
  if (!row) return { ok: false, error: "Auto responder not found" };
  const email = String(person?.email || "").trim();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "No valid email to send" };
  if (!listId) return { ok: false, error: "No list chosen" };
  const provider = PROVIDERS[row.provider];
  const creds = openCredentials(row);
  try {
    if (!provider || !creds) throw fail("Saved credentials can't be read");
    await provider.subscribe(creds, parseJson(row.settings), { ...person, email }, String(listId));
    await pool.query("UPDATE auto_responder_integrations SET status = 'CONNECTED', last_error = NULL, last_success_at = NOW() WHERE id = ?", [row.id]);
    return { ok: true };
  } catch (err) {
    await pool.query("UPDATE auto_responder_integrations SET status = 'ERROR', last_error = ? WHERE id = ?", [String(err.message).slice(0, 500), row.id]).catch(() => {});
    return { ok: false, error: err.message };
  }
}

/** The email to push from a finished User Input Flow: the first email answer, else the subscriber's own. */
export function pickCollectedEmail(answers, contact) {
  for (const a of Array.isArray(answers) ? answers : []) {
    const v = String(a?.value ?? "").trim();
    if ((a?.type === "email" || !a?.type) && EMAIL_RE.test(v)) return v;
  }
  const own = String(contact?.email || "").trim();
  return EMAIL_RE.test(own) ? own : null;
}
