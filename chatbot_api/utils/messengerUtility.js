/**
 * Messenger Utility Messages + HUMAN_AGENT — the DB / Graph API part.
 * Pure helpers (describe, pre-checks, send components, window state) live in
 * utils/messengerTemplateParams.js.
 *
 * Templates belong to one Facebook Page integration (bot scope). Meta keeps
 * the truth; `messenger_utility_templates` mirrors it (sync + the
 * `message_template_status_update` webhook).
 *
 * Message tags: since 27 Apr 2026 only HUMAN_AGENT is left (the others answer
 * error 100). It lets a person — never automation — reply up to 7 days after
 * the customer's last message, on Messenger and Instagram, once the app has
 * the Human Agent feature from Meta App Review. `integrations.human_agent_enabled`
 * records that the owner has it; routes/conversations.js decides per send.
 */
import axios from "axios";
import { META_API_VERSION } from "./metaApi.js";
import pool from "../db.js";
import { assertModuleAccess } from "./entitlements.js";
import {
  describeMessengerTemplate, buildMessengerTemplateSend, messengerWindowState, parseJson,
} from "./messengerTemplateParams.js";

export * from "./messengerTemplateParams.js";

// Utility templates need v25.0 or newer; they follow the app-wide version
// (utils/metaApi.js) unless MESSENGER_UTILITY_API_VERSION pins another.
export const MESSENGER_UTILITY_API_VERSION = process.env.MESSENGER_UTILITY_API_VERSION || META_API_VERSION;
const graph = (path) => `https://graph.facebook.com/${MESSENGER_UTILITY_API_VERSION}/${path}`;

function graphError(err) {
  const e = err.response?.data?.error;
  const out = new Error(e?.error_user_msg || e?.message || err.message || "Meta request failed");
  out.status = err.response?.status && err.response.status < 500 ? 400 : 502;
  out.metaError = e || null;
  return out;
}

// ─── Loading ────────────────────────────────────────────────────────────────

/**
 * The approved template, only if it is this Page's (bot scope) and this
 * workspace's plan includes Messenger Utility Messages — throws 403
 * MODULE_DISABLED otherwise, so every sender (Inbox, flows, sequences,
 * broadcasts, store automation) is gated in one place.
 */
export async function loadApprovedMessengerTemplate(agencyId, integrationId, templateId) {
  if (!templateId || !integrationId) return null;
  await assertModuleAccess(agencyId, "feature_messenger_utility");
  const [[tpl]] = await pool.query(
    "SELECT * FROM messenger_utility_templates WHERE id = ? AND agency_id = ? AND integration_id = ? AND status = 'APPROVED'",
    [templateId, agencyId, integrationId]
  );
  return tpl || null;
}

// ─── Graph API ──────────────────────────────────────────────────────────────

/** Every template on the Page (all categories are filtered to UTILITY by the caller's upsert). */
const TEMPLATE_FIELDS = "id,name,language,status,category,components,parameter_format,rejected_reason";
const BASIC_TEMPLATE_FIELDS = "id,name,language,status,category,components";

export async function fetchPageTemplates(integration) {
  try {
    return await fetchPageTemplatesWith(integration, TEMPLATE_FIELDS);
  } catch (err) {
    // parameter_format / rejected_reason are documented for WhatsApp templates;
    // if a Page's endpoint doesn't know one of them, list with the basic fields.
    if (err.metaError?.code === 100 && /field/i.test(err.message)) return fetchPageTemplatesWith(integration, BASIC_TEMPLATE_FIELDS);
    throw err;
  }
}

async function fetchPageTemplatesWith(integration, fields) {
  const out = [];
  let url = graph(`${integration.fb_page_id}/message_templates`);
  let params = { fields, limit: 100, access_token: integration.access_token };
  for (let page = 0; url && page < 20; page++) {
    try {
      const { data } = await axios.get(url, { params, timeout: 20000 });
      out.push(...(data.data || []));
      url = data.paging?.next || null;
      params = undefined; // the "next" link already carries them
    } catch (err) {
      throw graphError(err);
    }
  }
  return out;
}

export async function createPageTemplate(integration, body) {
  try {
    const { data } = await axios.post(graph(`${integration.fb_page_id}/message_templates`), body, {
      params: { access_token: integration.access_token },
      timeout: 30000,
    });
    return data; // { id, status, category }
  } catch (err) {
    throw graphError(err);
  }
}

export async function deletePageTemplate(integration, { name, metaTemplateId }) {
  try {
    await axios.delete(graph(`${integration.fb_page_id}/message_templates`), {
      params: { name, ...(metaTemplateId ? { hsm_id: metaTemplateId } : {}), access_token: integration.access_token },
      timeout: 20000,
    });
  } catch (err) {
    const e = graphError(err);
    // Already gone on Meta's side → deleting our copy is still right.
    if (/does not exist|not found/i.test(e.message)) return;
    throw e;
  }
}

/** Meta's pre-approved Utility template library. */
export async function searchTemplateLibrary(integration, { query = "", language = "en" } = {}) {
  try {
    const { data } = await axios.get(graph("message_template_library"), {
      params: { ...(query ? { name_or_content: query } : {}), language, access_token: integration.access_token },
      timeout: 20000,
    });
    return data.data || [];
  } catch (err) {
    throw graphError(err);
  }
}

/** Resumable Upload API → the `header_handle` an IMAGE header needs. */
export async function uploadHeaderImage(integration, buffer, mimeType) {
  try {
    const session = await axios.post(graph("app/uploads"), null, {
      params: { file_length: buffer.length, file_type: mimeType, access_token: integration.access_token },
      timeout: 15000,
    });
    const upload = await axios.post(graph(session.data.id), buffer, {
      headers: { Authorization: `OAuth ${integration.access_token}`, file_offset: 0, "Content-Type": mimeType },
      maxBodyLength: Infinity,
      timeout: 60000,
    });
    if (!upload.data?.h) throw new Error("Meta returned no upload handle");
    return upload.data.h;
  } catch (err) {
    throw err.response ? graphError(err) : err;
  }
}

/**
 * Can this Page send Utility messages? Looks at the token's granted scopes
 * (debug_token on itself) and tries a template list. Never throws.
 */
export async function checkUtilityAccess(integration) {
  const result = { ok: false, scopes: [], hasUtilityScope: null, canListTemplates: false, error: null };
  if (!integration?.access_token || !integration?.fb_page_id) {
    result.error = "This Page has no access token — reconnect it.";
    return result;
  }
  try {
    const { data } = await axios.get(graph("debug_token"), {
      params: { input_token: integration.access_token, access_token: integration.access_token },
      timeout: 15000,
    });
    result.scopes = data.data?.scopes || [];
    result.hasUtilityScope = result.scopes.some((s) => /utility_messaging/.test(s));
  } catch {
    result.hasUtilityScope = null; // unknown — the template list below decides
  }
  try {
    await axios.get(graph(`${integration.fb_page_id}/message_templates`), {
      params: { limit: 1, access_token: integration.access_token },
      timeout: 15000,
    });
    result.canListTemplates = true;
  } catch (err) {
    result.error = graphError(err).message;
  }
  result.ok = result.canListTemplates && result.hasUtilityScope !== false;
  if (!result.ok && !result.error) {
    result.error = "The Page's token doesn't include the utility messaging permission — reconnect the Page and allow it.";
  }
  return result;
}

// ─── Mirror ─────────────────────────────────────────────────────────────────

function statusOf(metaStatus) {
  return String(metaStatus || "PENDING").toUpperCase().slice(0, 30);
}

/** Saves one template as Meta returned it (GET list shape). Returns the row id. */
export async function upsertTemplateFromMeta(agencyId, integrationId, t, extra = {}) {
  const components = t.components || [];
  const format = String(t.parameter_format || "").toUpperCase() === "NAMED" ? "NAMED" : "POSITIONAL";
  await pool.query(
    `INSERT INTO messenger_utility_templates
       (agency_id, integration_id, meta_template_id, name, language, category, parameter_format, components_json, status, rejection_reason,
        source, library_template_name, header_media_url, created_by, last_synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE meta_template_id = VALUES(meta_template_id), category = VALUES(category),
       parameter_format = VALUES(parameter_format), components_json = VALUES(components_json), status = VALUES(status),
       rejection_reason = VALUES(rejection_reason), header_media_url = COALESCE(VALUES(header_media_url), header_media_url),
       last_synced_at = NOW()`,
    [
      agencyId, integrationId, t.id ? String(t.id) : null, t.name, t.language, String(t.category || "UTILITY").toUpperCase(), format,
      JSON.stringify(components), statusOf(t.status), t.rejected_reason && t.rejected_reason !== "NONE" ? String(t.rejected_reason).slice(0, 500) : null,
      extra.source || "SYNCED", extra.libraryTemplateName || null, extra.headerMediaUrl || null, extra.createdBy || null,
    ]
  );
  const [[row]] = await pool.query(
    "SELECT id FROM messenger_utility_templates WHERE integration_id = ? AND name = ? AND language = ?",
    [integrationId, t.name, t.language]
  );
  return row?.id || null;
}

/** Pulls the Page's Utility templates; removes local rows Meta no longer has. */
export async function syncPageTemplates(agencyId, integration) {
  const remote = (await fetchPageTemplates(integration)).filter((t) => String(t.category || "UTILITY").toUpperCase() === "UTILITY");
  const seen = new Set();
  for (const t of remote) {
    await upsertTemplateFromMeta(agencyId, integration.id, t);
    seen.add(`${t.name}|${t.language}`);
  }
  const [local] = await pool.query(
    "SELECT id, name, language FROM messenger_utility_templates WHERE agency_id = ? AND integration_id = ?",
    [agencyId, integration.id]
  );
  const gone = local.filter((r) => !seen.has(`${r.name}|${r.language}`)).map((r) => r.id);
  if (gone.length) await pool.query("DELETE FROM messenger_utility_templates WHERE id IN (?) AND agency_id = ?", [gone, agencyId]);
  return { synced: remote.length, removed: gone.length };
}

/**
 * `message_template_status_update` for a Page (entry.id = Page id). Meta's
 * WhatsApp-shaped value: { event, message_template_id, message_template_name,
 * message_template_language, reason }. Matched by Meta id, else by name +
 * language on that Page. Returns the updated rows (for socket events).
 */
export async function applyTemplateStatusUpdate(agencyId, pageId, value = {}) {
  const status = statusOf(value.event || value.status);
  const reason = value.reason && value.reason !== "NONE" ? String(value.reason).slice(0, 500) : null;
  const [rows] = await pool.query(
    `SELECT t.id, t.agency_id, t.integration_id FROM messenger_utility_templates t
     JOIN integrations i ON i.id = t.integration_id
     WHERE t.agency_id = ? AND i.fb_page_id = ? AND (
       (t.meta_template_id IS NOT NULL AND t.meta_template_id = ?) OR
       (t.name = ? AND (? IS NULL OR t.language = ?))
     )`,
    [agencyId, String(pageId), String(value.message_template_id || ""), value.message_template_name || "", value.message_template_language || null, value.message_template_language || null]
  );
  for (const r of rows) {
    await pool.query("UPDATE messenger_utility_templates SET status = ?, rejection_reason = ?, last_synced_at = NOW() WHERE id = ?", [status, reason, r.id]);
  }
  return rows.map((r) => ({ ...r, status, reason }));
}

// ─── Sending helpers ────────────────────────────────────────────────────────

/** sendMsg()/sendPlatformMessage() arguments for one Utility template send. */
export function buildMessengerUtilitySend(tpl, params, render, options = {}) {
  const built = buildMessengerTemplateSend(tpl, params, render, options);
  const d = describeMessengerTemplate(tpl);
  return {
    bodyText: built.renderedBody || `[Template: ${tpl.name}]`,
    built,
    extraFields: {
      messengerTemplate: { name: tpl.name, language: tpl.language, components: built.components },
      ...(built.buttons.length ? { buttons: built.buttons } : {}),
      ...(built.renderedHeader ? { headerType: "TEXT", headerText: built.renderedHeader } : {}),
      ...(d.headerType === "IMAGE" && built.headerImage ? { headerType: "IMAGE", headerMediaUrl: built.headerImage } : {}),
    },
  };
}

/** Last inbound time + the window state for a conversation (Messenger / Instagram). */
export async function conversationWindow(conversationId, integration) {
  const [[row]] = await pool.query(
    `SELECT COALESCE(cv.last_inbound_at, (SELECT MAX(m.created_at) FROM messages m WHERE m.conversation_id = cv.id AND m.direction = 'INBOUND')) AS last_inbound
     FROM conversations cv WHERE cv.id = ?`,
    [conversationId]
  );
  return messengerWindowState(row?.last_inbound || null, { humanAgentEnabled: Boolean(integration?.human_agent_enabled) });
}

export { parseJson };
