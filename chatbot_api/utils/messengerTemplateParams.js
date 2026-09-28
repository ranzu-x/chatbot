/**
 * Messenger Utility templates — the pure part (no DB, no network), shared by
 * utils/messengerUtility.js, the routes and the tests.
 *
 * A Messenger Utility template (POST /<PAGE_ID>/message_templates, category
 * UTILITY) is Meta's replacement for the removed ACCOUNT_UPDATE /
 * POST_PURCHASE_UPDATE / CONFIRMED_EVENT_UPDATE message tags: the only
 * automated message a Page may send after the 24-hour window. Components:
 *   HEADER  (optional) — format TEXT (≤ 1 variable) or IMAGE
 *   BODY    (required)
 *   BUTTONS (optional) — URL (variable URL ending) or POSTBACK (variable payload)
 * Variables are positional {{1}} {{2}} or, with parameter_format NAMED,
 * {{order_id}}. Button variables are always positional.
 *
 * Sent as POST /<PAGE_ID>/messages with messaging_type "UTILITY" and
 * message.template { name, language: { code }, components: [...] }.
 */

export const MESSENGER_TEMPLATE_NODE_TYPE = "messengerTemplate";
export const MAX_TEMPLATE_BUTTONS = 3;
export const BODY_MAX = 1024;
export const HEADER_TEXT_MAX = 60;
export const BUTTON_TEXT_MAX = 20;

const VAR_RE = /{{\s*([^{}]*?)\s*}}/g;
const NAMED_RE = /^[a-z][a-z0-9_]*$/;

export function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/** Placeholder names in order of first appearance: ["1","2"] or ["order_id"]. */
export function placeholdersOf(text) {
  const out = [];
  for (const m of String(text || "").matchAll(VAR_RE)) if (m[1] && !out.includes(m[1])) out.push(m[1]);
  return out;
}

function hasVariable(text) {
  return /{{\s*[^{}]*?\s*}}/.test(String(text || ""));
}

/** What an element / composer / campaign editor needs to know about one stored template row. */
export function describeMessengerTemplate(tpl) {
  const components = parseJson(tpl?.components_json, []) || [];
  const find = (type) => components.find((c) => String(c?.type || "").toUpperCase() === type);
  const header = find("HEADER");
  const body = find("BODY");
  const buttonsComp = find("BUTTONS");
  const headerType = header ? String(header.format || "TEXT").toUpperCase() : null;
  const headerText = headerType === "TEXT" ? header.text || "" : "";

  const buttons = (buttonsComp?.buttons || []).map((b, index) => {
    const type = String(b.type || "").toUpperCase();
    const url = b.url || null;
    const payload = b.payload || null;
    return {
      index,
      type,
      text: b.text || b.title || `Button ${index + 1}`,
      url,
      payload,
      dynamic: type === "URL" ? hasVariable(url) : type === "POSTBACK" ? hasVariable(payload) : false,
      // A payload that is nothing but one variable can carry our own routing
      // token, so a tap runs that button's flow options (see flowEngine step 0).
      routable: type === "POSTBACK" && /^\s*{{\s*[^{}]+\s*}}\s*$/.test(payload || ""),
    };
  });

  return {
    parameterFormat: String(tpl?.parameter_format || "POSITIONAL").toUpperCase() === "NAMED" ? "NAMED" : "POSITIONAL",
    headerType,
    headerText,
    header: headerType === "TEXT" ? placeholdersOf(headerText) : [],
    bodyText: body?.text || "",
    body: placeholdersOf(body?.text || ""),
    buttons,
    // An IMAGE header falls back to the image stored with the template.
    hasHeaderSample: headerType === "IMAGE" && (Boolean(tpl?.header_media_url) || Boolean(header?.example?.header_handle?.length)),
  };
}

const empty = (v) => v === undefined || v === null || String(v).trim() === "";

/** Parameters a send still needs (["body {{1}}", …]); `params` = { header, body, buttons, headerImage }. */
export function missingMessengerParams(tpl, params = {}) {
  const d = describeMessengerTemplate(tpl);
  const missing = [];
  d.header.forEach((ph) => { if (empty(params.header?.[ph])) missing.push(`header {{${ph}}}`); });
  d.body.forEach((ph) => { if (empty(params.body?.[ph])) missing.push(`body {{${ph}}}`); });
  d.buttons.forEach((b) => {
    // A routable POSTBACK button is filled with the routing token when sent from a flow.
    if (b.dynamic && !b.routable && empty(params.buttons?.[b.index])) missing.push(`button "${b.text}"`);
  });
  if (d.headerType === "IMAGE" && !d.hasHeaderSample && empty(params.headerImage)) missing.push("header image");
  return missing;
}

function fill(text, values) {
  return String(text || "").replace(VAR_RE, (whole, name) => (values[name] !== undefined ? values[name] : whole));
}

/**
 * The components array for the Send API plus what to show in the Inbox.
 *   params          { header: {ph: text}, body: {ph: text}, buttons: {index: text}, headerImage }
 *   render(text)    substitutes subscriber variables ({{contact.name}}, …)
 *   routeFor(i)     routing token for button i (flows / broadcasts), or null
 *   payloadFor(i)   fixed payload for button i (COD confirm/cancel), wins over routeFor
 *   resolveImage(u) turns an uploaded /uploads/… path into a public URL
 */
export function buildMessengerTemplateSend(tpl, params = {}, render = (t) => t, { routeFor = null, payloadFor = null, resolveImage = (u) => u } = {}) {
  const d = describeMessengerTemplate(tpl);
  const named = d.parameterFormat === "NAMED";
  const value = (section, key) => render(String(params?.[section]?.[key] ?? ""));
  const param = (name, text) => ({ type: "text", ...(named ? { parameter_name: name } : {}), text });

  const components = [];
  const headerValues = {};
  if (d.headerType === "TEXT" && d.header.length) {
    components.push({ type: "header", parameters: d.header.map((ph) => { headerValues[ph] = value("header", ph); return param(ph, headerValues[ph]); }) });
  } else if (d.headerType === "IMAGE") {
    const raw = String(params?.headerImage || "").trim();
    const link = raw ? resolveImage(render(raw).trim()) : "";
    if (link) components.push({ type: "header", parameters: [{ type: "image", image: { link } }] });
  }

  const bodyValues = {};
  if (d.body.length) {
    components.push({ type: "body", parameters: d.body.map((ph) => { bodyValues[ph] = value("body", ph); return param(ph, bodyValues[ph]); }) });
  }

  const buttonParams = [];
  const shownButtons = [];
  for (const b of d.buttons) {
    let filled = null;
    if (b.dynamic) {
      if (b.type === "POSTBACK") {
        const fixed = payloadFor ? payloadFor(b.index) : null;
        const route = !fixed && b.routable && routeFor ? routeFor(b.index) : null;
        filled = fixed || route || value("buttons", b.index) || b.text;
        buttonParams.push({ type: "POSTBACK", payload: String(filled).slice(0, 1000) });
      } else if (b.type === "URL") {
        filled = value("buttons", b.index);
        buttonParams.push({ type: "URL", url: filled });
      }
    }
    shownButtons.push({
      id: `mtb_${b.index}`,
      title: b.text,
      type: b.type === "URL" ? "URL" : "POSTBACK",
      ...(b.type === "URL" ? { url: b.dynamic ? fill(b.url, { [placeholdersOf(b.url)[0]]: filled ?? "" }) : b.url } : {}),
    });
  }
  if (buttonParams.length) components.push({ type: "buttons", parameters: buttonParams });

  const renderedHeader = d.headerType === "TEXT" ? fill(d.headerText, headerValues) : "";
  const renderedBody = fill(d.bodyText, bodyValues);
  return {
    components,
    renderedHeader,
    renderedBody,
    buttons: shownButtons,
    headerImage: components.find((c) => c.type === "header" && c.parameters?.[0]?.type === "image")?.parameters[0].image.link || tpl?.header_media_url || null,
  };
}

// ─── Pre-checks before a template is sent to Meta ────────────────────────────
// The same reasons Meta rejects with (INCORRECT_PARAMS,
// PARAMS_TO_WORD_RATIO_EXCEED_LIMIT, TAG_SHOULD_BE_MARKETING), caught before
// the call so the user gets a precise message.

const MARKETING_HINTS = [
  /\b\d{1,3}\s?% off\b/i, /\bdiscount/i, /\bsale\b/i, /\bpromo(tion|code)?\b/i, /\bcoupon/i, /\bbuy now\b/i,
  /\blimited[- ]time\b/i, /\bspecial offer\b/i, /\bshop now\b/i, /\bdeal(s)?\b/i, /\bnew arrivals?\b/i, /\bfree shipping\b/i,
];
const SENSITIVE_HINTS = [/\bcard number\b/i, /\bcvv\b/i, /\bsocial security\b/i, /\bssn\b/i, /\bpassport number\b/i, /\bnational id\b/i];

function checkVariables(text, where, format, errors) {
  const s = String(text || "");
  const opens = (s.match(/{{/g) || []).length;
  const closes = (s.match(/}}/g) || []).length;
  if (opens !== closes) { errors.push(`${where}: every variable needs double braces on both sides, like {{1}}`); return []; }
  const withoutVars = s.replace(VAR_RE, "");
  if (/[{}]/.test(withoutVars)) errors.push(`${where}: stray "{" or "}" — variables are written {{1}}${format === "NAMED" ? " or {{order_id}}" : ""}`);

  const names = [...s.matchAll(VAR_RE)].map((m) => m[1]);
  for (const n of names) {
    if (format === "NAMED") {
      if (!NAMED_RE.test(n)) errors.push(`${where}: "{{${n}}}" — named variables use lowercase letters, numbers and underscores, starting with a letter`);
    } else if (!/^\d+$/.test(n)) {
      errors.push(`${where}: "{{${n}}}" — use numbers {{1}}, {{2}}… (or switch the template to named variables)`);
    }
  }
  const trimmed = s.trim();
  if (names.length && (/^{{/.test(trimmed) || /}}[.!?]?$/.test(trimmed)) && where === "Body") {
    errors.push("Body: the text can't start or end with a variable — add words before and after it");
  }
  if (/}}\s*{{/.test(s)) errors.push(`${where}: two variables can't sit side by side — put words between them`);
  return names;
}

/**
 * Checks a custom template draft; returns { errors: [..], warnings: [..] }.
 * draft = { name, language, parameterFormat, header: { type: 'NONE'|'TEXT'|'IMAGE', text, examples: {ph: ex} },
 *           body: { text, examples: {ph: ex} }, buttons: [{ type: 'URL'|'POSTBACK', text, url, urlExample }] }
 */
export function validateTemplateDraft(draft = {}) {
  const errors = [];
  const warnings = [];
  const format = draft.parameterFormat === "NAMED" ? "NAMED" : "POSITIONAL";
  const name = String(draft.name || "").trim();
  if (!name) errors.push("Template name is required");
  else if (!/^[a-z0-9_]+$/.test(name)) errors.push("Template name: lowercase letters, numbers and underscores only");
  else if (name.length > 512) errors.push("Template name is too long (max 512)");
  if (!String(draft.language || "").trim()) errors.push("Choose a language");

  const bodyText = String(draft.body?.text || "");
  if (!bodyText.trim()) errors.push("Body text is required");
  if (bodyText.length > BODY_MAX) errors.push(`Body is too long (${bodyText.length}/${BODY_MAX})`);
  const bodyVars = checkVariables(bodyText, "Body", format, errors);

  const headerType = String(draft.header?.type || "NONE").toUpperCase();
  let headerVars = [];
  if (headerType === "TEXT") {
    const ht = String(draft.header?.text || "");
    if (!ht.trim()) errors.push("Header text is empty — remove the header or write one");
    if (ht.length > HEADER_TEXT_MAX) errors.push(`Header is too long (${ht.length}/${HEADER_TEXT_MAX})`);
    headerVars = checkVariables(ht, "Header", format, errors);
    if (new Set(headerVars).size > 1) errors.push("Header: at most one variable");
  } else if (headerType === "IMAGE") {
    if (!draft.header?.imageUrl && !draft.header?.handle) errors.push("Upload the header image");
  } else if (headerType !== "NONE") {
    errors.push("Header must be none, text or image");
  }

  if (format === "POSITIONAL") {
    for (const [where, vars] of [["Body", bodyVars], ["Header", headerVars]]) {
      const nums = [...new Set(vars.filter((v) => /^\d+$/.test(v)).map(Number))].sort((a, b) => a - b);
      if (nums.length && nums.some((n, i) => n !== i + 1)) errors.push(`${where}: numbers must go 1, 2, 3… with no gaps (found ${nums.map((n) => `{{${n}}}`).join(", ")})`);
    }
  }
  for (const v of [...new Set([...headerVars, ...bodyVars])]) {
    const ex = (headerVars.includes(v) ? draft.header?.examples?.[v] : undefined) ?? draft.body?.examples?.[v];
    if (empty(ex)) errors.push(`Give an example value for {{${v}}} — Meta reviews the template with it`);
  }

  // Too many variables for the text around them.
  const varCount = bodyVars.length;
  const words = bodyText.replace(VAR_RE, " ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  if (varCount && words < varCount * 2 + 1) errors.push(`Body has too many variables for its length (${varCount} variables, ${words} words) — add more text`);

  const buttons = Array.isArray(draft.buttons) ? draft.buttons : [];
  if (buttons.length > MAX_TEMPLATE_BUTTONS) errors.push(`At most ${MAX_TEMPLATE_BUTTONS} buttons`);
  buttons.forEach((b, i) => {
    const label = `Button ${i + 1}`;
    const type = String(b.type || "").toUpperCase();
    const text = String(b.text || "").trim();
    if (!text) errors.push(`${label}: text is required`);
    if (text.length > BUTTON_TEXT_MAX) errors.push(`${label}: text is too long (${text.length}/${BUTTON_TEXT_MAX})`);
    if (type === "URL") {
      const url = String(b.url || "").trim();
      if (!/^https?:\/\/[^\s]+$/i.test(url.replace(/{{\s*1\s*}}/, "x"))) errors.push(`${label}: enter a full link starting with https://`);
      const vars = placeholdersOf(url);
      if (vars.length > 1 || (vars.length && vars[0] !== "1")) errors.push(`${label}: a link can only end with {{1}}`);
      if (vars.length && !/{{\s*1\s*}}$/.test(url)) errors.push(`${label}: {{1}} must be at the very end of the link`);
      if (vars.length && empty(b.urlExample)) errors.push(`${label}: give an example link ending for {{1}}`);
    } else if (type !== "POSTBACK") {
      errors.push(`${label}: type must be URL or POSTBACK`);
    }
  });

  const allText = [draft.header?.text, bodyText, ...buttons.map((b) => b.text)].filter(Boolean).join(" ");
  if (MARKETING_HINTS.some((re) => re.test(allText))) {
    warnings.push("This reads like marketing (discount, sale, offer…). Utility templates must only be order / account / appointment updates — Meta will reject it as TAG_SHOULD_BE_MARKETING.");
  }
  if (SENSITIVE_HINTS.some((re) => re.test(allText))) {
    errors.push("Utility templates may not ask for sensitive identifiers (full card numbers, national ID, SSN, passport numbers)");
  }
  return { errors, warnings };
}

/** Meta's create-template request body for a validated draft. `headerHandle` = Resumable Upload handle for an IMAGE header. */
export function buildCreatePayload(draft, { headerHandle = null } = {}) {
  const format = draft.parameterFormat === "NAMED" ? "NAMED" : "POSITIONAL";
  const named = format === "NAMED";
  const components = [];
  const headerType = String(draft.header?.type || "NONE").toUpperCase();

  if (headerType === "TEXT") {
    const text = String(draft.header.text).trim();
    const vars = placeholdersOf(text);
    const h = { type: "HEADER", format: "TEXT", text };
    if (vars.length) {
      h.example = named
        ? { header_text_named_params: vars.map((v) => ({ param_name: v, example: String(draft.header.examples?.[v] ?? draft.body?.examples?.[v]) })) }
        : { header_text: vars.map((v) => String(draft.header.examples?.[v] ?? draft.body?.examples?.[v])) };
    }
    components.push(h);
  } else if (headerType === "IMAGE") {
    components.push({ type: "HEADER", format: "IMAGE", example: { header_handle: [headerHandle] } });
  }

  const bodyText = String(draft.body.text).trim();
  const bodyVars = placeholdersOf(bodyText);
  const body = { type: "BODY", text: bodyText };
  if (bodyVars.length) {
    body.example = named
      ? { body_text_named_params: bodyVars.map((v) => ({ param_name: v, example: String(draft.body.examples[v]) })) }
      : { body_text: [bodyVars.map((v) => String(draft.body.examples[v]))] };
  }
  components.push(body);

  const buttons = (draft.buttons || []).map((b) => {
    const type = String(b.type).toUpperCase();
    if (type === "URL") {
      const url = String(b.url).trim();
      const out = { type: "URL", text: String(b.text).trim(), url };
      if (/{{\s*1\s*}}$/.test(url)) out.example = { url_suffix_example: url.replace(/{{\s*1\s*}}$/, String(b.urlExample).trim()) };
      return out;
    }
    // A POSTBACK payload is a single variable, filled when sending — with the
    // flow's routing token, so each button can lead to its own next step.
    return { type: "POSTBACK", text: String(b.text).trim(), payload: "{{1}}" };
  });
  if (buttons.length) components.push({ type: "BUTTONS", buttons });

  return {
    name: String(draft.name).trim(),
    language: String(draft.language).trim(),
    category: "UTILITY",
    ...(named ? { parameter_format: "NAMED" } : {}),
    components,
  };
}

// ─── Messaging windows (Messenger + Instagram) ───────────────────────────────

export const STANDARD_WINDOW_HOURS = 24;
export const HUMAN_AGENT_WINDOW_HOURS = 24 * 7;

/**
 * Which kind of message may go to this person now.
 *   OPEN         — inside 24 h: anything (messaging_type RESPONSE)
 *   HUMAN_AGENT  — 24 h – 7 days and the account has Human Agent on: a person's reply, tagged HUMAN_AGENT
 *   CLOSED       — only a Utility template (Messenger) — Instagram has nothing
 */
export function messengerWindowState(lastInboundAt, { humanAgentEnabled = false, now = Date.now() } = {}) {
  const last = lastInboundAt ? new Date(lastInboundAt).getTime() : null;
  const hours = last ? (now - last) / 3_600_000 : Infinity;
  const hourMs = 3_600_000;
  if (hours <= STANDARD_WINDOW_HOURS) {
    return { state: "OPEN", lastInboundAt: last ? new Date(last).toISOString() : null, windowEndsAt: new Date(last + STANDARD_WINDOW_HOURS * hourMs).toISOString(), humanAgentEndsAt: last ? new Date(last + HUMAN_AGENT_WINDOW_HOURS * hourMs).toISOString() : null };
  }
  if (hours <= HUMAN_AGENT_WINDOW_HOURS) {
    return {
      state: humanAgentEnabled ? "HUMAN_AGENT" : "CLOSED",
      lastInboundAt: new Date(last).toISOString(),
      windowEndsAt: null,
      humanAgentEndsAt: new Date(last + HUMAN_AGENT_WINDOW_HOURS * hourMs).toISOString(),
      humanAgentAvailable: true,
    };
  }
  return { state: "CLOSED", lastInboundAt: last ? new Date(last).toISOString() : null, windowEndsAt: null, humanAgentEndsAt: null };
}

/** Meta error → a message a user can act on. */
export function friendlyMessengerError(metaError, platform = "FACEBOOK") {
  if (!metaError) return null;
  const channel = platform === "INSTAGRAM" ? "Instagram" : "Messenger";
  const code = Number(metaError.code);
  const sub = Number(metaError.error_subcode);
  const msg = String(metaError.message || "");
  if (sub === 2018278 || /outside of allowed window/i.test(msg)) {
    return `${channel}: this person's messaging window is closed.${platform === "FACEBOOK" ? " Send a Utility template instead." : ""}`;
  }
  if (code === 551 || sub === 1545041) return `${channel}: this person isn't available right now (they may have blocked the Page or deleted their account).`;
  if (code === 10 && /human.?agent/i.test(msg)) return `${channel}: this app isn't approved for Human Agent yet — request the Human Agent feature in Meta App Review, or turn it off for this account.`;
  if (code === 100 && /tag/i.test(msg)) return `${channel}: Meta refused the message tag (${msg}). ACCOUNT_UPDATE, POST_PURCHASE_UPDATE and CONFIRMED_EVENT_UPDATE were removed on 27 Apr 2026 — use a Utility template.`;
  if (code === 190) return `${channel}: the Page's access token expired or was revoked — reconnect the account.`;
  if (/template/i.test(msg) && /(not found|does not exist|approved|paused|disabled)/i.test(msg)) return `${channel}: the Utility template isn't usable (${msg}). Sync templates and pick an approved one.`;
  if ((code === 10 || code === 200) && /permission/i.test(msg)) return `${channel}: permission missing (${msg}). Reconnect the Page and grant utility messaging.`;
  return msg || `${channel} refused the message`;
}
