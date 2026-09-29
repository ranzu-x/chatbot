/**
 * Bot export / import file format (Bot Manager → Keyword Based Bots →
 * Export / Import; routes/flowTransfer.js). Pure functions only — no DB — so
 * the format rules are unit-tested (test/flowTransfer.test.js).
 *
 * File shape (JSON):
 *   format            "chatbot-flow-export"
 *   version           the format version that wrote it (FORMAT_VERSION)
 *   minReaderVersion  the oldest reader that can import it. A reader imports
 *                     any file whose minReaderVersion <= its own version, so
 *                     a newer file that only ADDS things (new element types,
 *                     new fields) still imports; unknown element types are
 *                     kept as they are and reported.
 *   flow              { name, platform, triggerType, triggerKeyword, nodes, edges }
 *   components        what the flow points at, by the id it had in the source
 *                     workspace ("ref"): userInputFlows (bundled in full and
 *                     re-created), customFields + labels (matched by key / name
 *                     or created), sequences / flows / templates / campaigns
 *                     (matched by name on the target bot, else unlinked).
 *
 * Never exported: anything that looks like a credential (SECRET_KEY_RE) at any
 * depth, auth headers, and account-bound links (Google Sheet, auto responder
 * list) — those are re-chosen after import.
 */

export const FORMAT = "chatbot-flow-export";
export const FORMAT_VERSION = 1;
export const MIN_READER_VERSION = 1;
export const MAX_NODES = 2000;
export const MAX_EDGES = 5000;

// Element types this version understands (FlowBuilderPage.jsx nodeTypes).
export const KNOWN_NODE_TYPES = new Set([
  "start", "text", "interactive", "image", "video", "audio", "file", "buttons", "quickReplies", "listMenu",
  "card", "carousel", "collectInput", "condition", "randomizer", "delay", "webhook", "httpApi", "payment", "telegramPoll",
  "telegramChecklist", "orderStatus", "marketingOptIn", "handoff", "end", "runUserInputFlow", "question",
  "finalAnswer", "startSequenceAction", "stopSequenceAction", "wait", "actions", "startAutomation",
  "messageBlock", "appointment", "whatsappTemplate", "messengerTemplate", "whatsappCtaUrl",
  "quickActionStart", "broadcastStart", "chatWidgetStart",
]);

// Elements that only run on one channel.
export const CHANNEL_ONLY_NODE_TYPES = {
  whatsappTemplate: "WHATSAPP",
  whatsappCtaUrl: "WHATSAPP",
  messengerTemplate: "FACEBOOK",
  marketingOptIn: "FACEBOOK",
  telegramPoll: "TELEGRAM",
  telegramChecklist: "TELEGRAM",
};

export const IMPORTABLE_TRIGGER_TYPES = new Set(["KEYWORD", "ANY", "FIRST_CONTACT", "POSTBACK", "CHAT_WIDGET"]);

// node.data keys that point at another record → the component kind.
const REF_KEYS = {
  flowId: "flows",
  widgetFlowId: "flows",
  offHoursFlowId: "flows",
  sequenceId: "sequences",
  removeSequenceId: "sequences",
  attachSequenceId: "sequences",
  userInputFlowId: "userInputFlows",
  messengerTemplateId: "messengerTemplates",
  whatsappTemplateId: "whatsappTemplates",
  labelId: "labels",
  labelIds: "labels",
  removeLabelIds: "labels",
  customFieldId: "customFields",
  fieldId: "customFields",
  saveToFieldId: "customFields",
};
// Keys whose meaning depends on the element type.
const TYPED_REF_KEYS = {
  templateId: { whatsappTemplate: "whatsappTemplates" },
  campaignId: { httpApi: "httpApiCampaigns", appointment: "appointmentCampaigns" },
};
// Account-bound: never carried over (the importer re-chooses them).
const ACCOUNT_BOUND_KEYS = ["googleSheetId", "googleSheetTab", "autoResponderListId"];

export const SECRET_KEY_RE = /(pass(word|wd)?|secret|token|api[_-]?key|apikey|authorization|auth[_-]?header|credential|private[_-]?key|access[_-]?key|signing[_-]?key|bearer)/i;
const AUTH_HEADER_LINE_RE = /^\s*(authorization|proxy-authorization|x-api-key|api-key|x-auth-token|cookie)\s*:/i;

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const asId = (v) => (v !== null && v !== undefined && /^\d+$/.test(String(v)) ? Number(v) : null);

/**
 * Deep copy with credentials removed. Returns { value, removed: [paths] }.
 * Webhook custom headers keep only the lines that aren't auth headers.
 */
export function stripSecrets(input) {
  const removed = [];
  const walk = (v, path) => {
    if (Array.isArray(v)) return v.map((x, i) => walk(x, `${path}[${i}]`));
    if (!isPlainObject(v)) return v;
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      const p = path ? `${path}.${k}` : k;
      if (SECRET_KEY_RE.test(k) && (typeof val === "string" || typeof val === "number")) {
        if (String(val).trim()) removed.push(p);
        continue;
      }
      if (k === "customHeaders" && typeof val === "string") {
        const kept = val.split(/\r?\n/).filter((line) => !AUTH_HEADER_LINE_RE.test(line));
        if (kept.length !== val.split(/\r?\n/).length) removed.push(p);
        out[k] = kept.join("\n");
        continue;
      }
      if (k === "headers" && isPlainObject(val)) {
        out[k] = {};
        for (const [hk, hv] of Object.entries(val)) {
          if (AUTH_HEADER_LINE_RE.test(`${hk}:`) || SECRET_KEY_RE.test(hk)) removed.push(`${p}.${hk}`);
          else out[k][hk] = walk(hv, `${p}.${hk}`);
        }
        continue;
      }
      out[k] = walk(val, p);
    }
    return out;
  };
  return { value: walk(input, ""), removed };
}

/** Removes account-bound settings (sheet, auto responder list). Mutates `nodes`. Returns what was removed. */
export function stripAccountBound(nodes) {
  const removed = [];
  for (const n of nodes) {
    if (!isPlainObject(n?.data)) continue;
    for (const k of ACCOUNT_BOUND_KEYS) {
      if (n.data[k] !== undefined && n.data[k] !== null && n.data[k] !== "") {
        removed.push(`${n.id}.${k}`);
        n.data[k] = null;
      }
    }
  }
  return removed;
}

/**
 * Visits every reference in a node list: fn({ kind, id, key, holder, nodeType }).
 * `holder[key]` is the value; for array keys the callback gets each element and
 * may return a replacement. fn's return value replaces the id (undefined = keep).
 */
export function visitRefs(nodes, fn) {
  const replaceIn = (holder, key, kind, nodeType) => {
    const val = holder[key];
    if (Array.isArray(val)) {
      holder[key] = val
        .map((x) => {
          const id = asId(x);
          if (id === null) return x;
          const next = fn({ kind, id, key, holder, nodeType });
          return next === undefined ? x : next;
        })
        .filter((x) => x !== null && x !== undefined);
      return;
    }
    if (typeof val === "string" && val.startsWith("sys:")) return; // system field, not a record
    const id = asId(val);
    if (id === null) return;
    const next = fn({ kind, id, key, holder, nodeType });
    if (next !== undefined) holder[key] = next;
  };
  const walk = (v, nodeType) => {
    if (Array.isArray(v)) { v.forEach((x) => walk(x, nodeType)); return; }
    if (!isPlainObject(v)) return;
    // Message Block items carry their own element type.
    const localType = typeof v.type === "string" && isPlainObject(v.data) ? v.type : nodeType;
    for (const key of Object.keys(v)) {
      if (REF_KEYS[key]) replaceIn(v, key, REF_KEYS[key], localType);
      else if (TYPED_REF_KEYS[key]?.[localType]) replaceIn(v, key, TYPED_REF_KEYS[key][localType], localType);
      else walk(v[key], localType);
    }
  };
  for (const n of Array.isArray(nodes) ? nodes : []) walk(n?.data, n?.type);
}

/** { kind -> Set(ids) } referenced by the nodes. */
export function collectRefs(nodes) {
  const refs = {};
  visitRefs(nodes, ({ kind, id }) => { (refs[kind] ||= new Set()).add(id); return undefined; });
  return refs;
}

/**
 * Validates a parsed file. Returns { ok, error?, warnings, file } where `file`
 * is normalised (nodes/edges arrays, dangling edges dropped).
 */
export function validateExportFile(raw) {
  const warnings = [];
  if (!isPlainObject(raw)) return { ok: false, error: "The file isn't a bot export (expected a JSON object)." };
  if (raw.format !== FORMAT) return { ok: false, error: "This isn't a bot export file from this app." };
  const version = Number(raw.version);
  const minReader = Number(raw.minReaderVersion ?? raw.version);
  if (!Number.isInteger(version) || version < 1 || !Number.isInteger(minReader) || minReader < 1) {
    return { ok: false, error: "The file has no valid format version." };
  }
  if (minReader > FORMAT_VERSION) {
    return { ok: false, error: `This file needs a newer version of the app (format ${minReader}; this app reads up to ${FORMAT_VERSION}).` };
  }
  if (version > FORMAT_VERSION) warnings.push(`The file was made by a newer version (format ${version}). Anything this version doesn't know is kept as it is.`);

  const flow = raw.flow;
  if (!isPlainObject(flow)) return { ok: false, error: "The file has no bot in it." };
  const nodes = flow.nodes;
  const edges = flow.edges ?? [];
  if (!Array.isArray(nodes) || !nodes.length) return { ok: false, error: "The bot in the file has no elements." };
  if (!Array.isArray(edges)) return { ok: false, error: "The bot's connections are damaged." };
  if (nodes.length > MAX_NODES) return { ok: false, error: `The bot has too many elements (${nodes.length}, max ${MAX_NODES}).` };
  if (edges.length > MAX_EDGES) return { ok: false, error: `The bot has too many connections (${edges.length}, max ${MAX_EDGES}).` };

  const ids = new Set();
  for (const n of nodes) {
    if (!isPlainObject(n) || typeof n.id !== "string" || !n.id || n.id.length > 100 || typeof n.type !== "string") {
      return { ok: false, error: "An element in the file is damaged (missing id or type)." };
    }
    if (ids.has(n.id)) return { ok: false, error: `Two elements share the id "${n.id}".` };
    ids.add(n.id);
    if (n.data !== undefined && !isPlainObject(n.data)) return { ok: false, error: `Element "${n.id}" has damaged settings.` };
    if (!isPlainObject(n.position) || !Number.isFinite(Number(n.position.x)) || !Number.isFinite(Number(n.position.y))) {
      n.position = { x: 0, y: 0 };
    }
  }
  if (!nodes.some((n) => n.type === "start")) return { ok: false, error: "The bot has no Start element." };

  const unknown = [...new Set(nodes.map((n) => n.type).filter((t) => !KNOWN_NODE_TYPES.has(t)))];
  if (unknown.length) warnings.push(`Element type(s) this version doesn't know: ${unknown.join(", ")}. They were kept but won't run here.`);

  const keptEdges = edges.filter((e) => isPlainObject(e) && ids.has(e.source) && ids.has(e.target));
  if (keptEdges.length !== edges.length) warnings.push(`${edges.length - keptEdges.length} broken connection(s) were dropped.`);

  const name = String(flow.name || "").trim().slice(0, 180) || "Imported bot";
  const triggerType = IMPORTABLE_TRIGGER_TYPES.has(flow.triggerType) ? flow.triggerType : "KEYWORD";
  if (flow.triggerType && flow.triggerType !== triggerType) warnings.push(`The trigger "${flow.triggerType}" can't be imported; the bot starts by keyword instead.`);
  const triggerKeyword = typeof flow.triggerKeyword === "string" ? flow.triggerKeyword.slice(0, 300) : null;

  return {
    ok: true,
    warnings,
    file: {
      version,
      flow: { name, platform: String(flow.platform || "").toUpperCase() || null, triggerType, triggerKeyword, nodes, edges: keptEdges },
      components: isPlainObject(raw.components) ? raw.components : {},
    },
  };
}

/** Warnings for elements that can't run on the target channel. */
export function channelWarnings(nodes, platform) {
  const p = String(platform || "").toUpperCase();
  const bad = {};
  const walk = (n) => {
    const only = CHANNEL_ONLY_NODE_TYPES[n?.type];
    if (only && only !== p) bad[n.type] = only;
    if (n?.type === "messageBlock" && Array.isArray(n.data?.items)) n.data.items.forEach(walk);
  };
  (nodes || []).forEach(walk);
  return Object.entries(bad).map(([type, only]) => `"${type}" elements only work on ${only}; they won't send on ${p || "this channel"}.`);
}

/** Bundled component list → Map(ref -> item), ignoring junk. */
export function componentMap(list) {
  const map = new Map();
  for (const item of Array.isArray(list) ? list : []) {
    const ref = asId(item?.ref);
    if (ref !== null) map.set(ref, item);
  }
  return map;
}

/** "Welcome" taken → "Welcome (imported)", then "(imported 2)" … */
export function uniqueName(name, taken) {
  const lower = new Set([...taken].map((n) => String(n).toLowerCase()));
  if (!lower.has(name.toLowerCase())) return name;
  for (let i = 1; i < 1000; i++) {
    const candidate = `${name} (imported${i > 1 ? ` ${i}` : ""})`.slice(0, 200);
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
  return `${name} (${Date.now()})`;
}
