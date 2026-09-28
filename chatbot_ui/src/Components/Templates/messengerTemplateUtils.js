// Messenger Utility templates in the UI — mirrors chatbot_api/utils/messengerTemplateParams.js
// (FacebookUtilityTemplateManager, MessengerTemplateFields, the Inbox Send Menu).

const VAR_RE = /{{\s*([^{}]*?)\s*}}/g;

export function placeholdersOf(text) {
  const out = [];
  for (const m of String(text || '').matchAll(VAR_RE)) if (m[1] && !out.includes(m[1])) out.push(m[1]);
  return out;
}

const hasVariable = (t) => /{{\s*[^{}]*?\s*}}/.test(String(t || ''));

/** Same shape as the server's describeMessengerTemplate (the API also returns it as `template.meta`). */
export function describeMessengerTemplate(tpl) {
  if (tpl?.meta) return tpl.meta;
  const components = Array.isArray(tpl?.components) ? tpl.components : [];
  const find = (type) => components.find((c) => String(c?.type || '').toUpperCase() === type);
  const header = find('HEADER');
  const body = find('BODY');
  const headerType = header ? String(header.format || 'TEXT').toUpperCase() : null;
  const headerText = headerType === 'TEXT' ? header.text || '' : '';
  const buttons = (find('BUTTONS')?.buttons || []).map((b, index) => {
    const type = String(b.type || '').toUpperCase();
    return {
      index,
      type,
      text: b.text || `Button ${index + 1}`,
      url: b.url || null,
      payload: b.payload || null,
      dynamic: type === 'URL' ? hasVariable(b.url) : type === 'POSTBACK' ? hasVariable(b.payload) : false,
      routable: type === 'POSTBACK' && /^\s*{{\s*[^{}]+\s*}}\s*$/.test(b.payload || ''),
    };
  });
  return {
    parameterFormat: String(tpl?.parameter_format || 'POSITIONAL').toUpperCase() === 'NAMED' ? 'NAMED' : 'POSITIONAL',
    headerType,
    headerText,
    header: headerType === 'TEXT' ? placeholdersOf(headerText) : [],
    bodyText: body?.text || '',
    body: placeholdersOf(body?.text || ''),
    buttons,
    hasHeaderSample: headerType === 'IMAGE' && (Boolean(tpl?.header_media_url) || Boolean(header?.example?.header_handle?.length)),
  };
}

/** Parameters still empty (same rules as the server's missingMessengerParams). `routable` = sent from a flow. */
export function missingMessengerParams(meta, params = {}, { routable = false } = {}) {
  if (!meta) return [];
  const empty = (v) => v === undefined || v === null || String(v).trim() === '';
  const missing = [];
  meta.header.forEach((ph) => { if (empty(params.header?.[ph])) missing.push(`header {{${ph}}}`); });
  meta.body.forEach((ph) => { if (empty(params.body?.[ph])) missing.push(`body {{${ph}}}`); });
  meta.buttons.forEach((b) => {
    if (b.dynamic && !(b.routable && routable) && empty(params.buttons?.[b.index])) missing.push(`button "${b.text}"`);
  });
  if (meta.headerType === 'IMAGE' && !meta.hasHeaderSample && empty(params.headerImage)) missing.push('header image');
  return missing;
}

/** Validation message for the Flow Builder's save check, or null. */
export function validateMessengerTemplate(data = {}) {
  if (!data.messengerTemplateId) return 'Select an approved Utility template';
  const missing = missingMessengerParams(data.templateMeta, data.params, { routable: true });
  return missing.length ? `Fill in the Utility template's ${missing[0]}` : null;
}

/** One entry per template button, keeping options already set for the same button (like syncTemplateButtons). */
export function syncMessengerButtons(meta, current = []) {
  return (meta?.buttons || []).map((b) => {
    const prev = current[b.index];
    const keep = prev && prev.title === b.text && prev.type === b.type ? prev : {};
    return { action: 'flow', ...keep, title: b.text, type: b.type };
  });
}

/** Fills the body / header text with the chosen values for a preview. */
export function fillPreview(text, values = {}) {
  return String(text || '').replace(VAR_RE, (whole, name) => (values[name] ? values[name] : whole));
}

export const STATUS_BADGE = {
  APPROVED: 'badge-success',
  PENDING: 'badge-warning',
  IN_APPEAL: 'badge-warning',
  REJECTED: 'badge-danger',
  DISABLED: 'badge-danger',
  PAUSED: 'badge-warning',
  DELETED: 'badge-muted',
  PENDING_DELETION: 'badge-muted',
  LIMIT_EXCEEDED: 'badge-danger',
};

// Plain-language reasons for Meta's rejection codes.
export const REJECTION_HELP = {
  INCORRECT_PARAMS: 'A variable is written wrongly — use {{1}}, {{2}}… in order (or lowercase named ones), never at the very start or end, and never two side by side.',
  PARAMS_TO_WORD_RATIO_EXCEED_LIMIT: 'Too many variables for the amount of text — add more words around them.',
  TAG_SHOULD_BE_MARKETING: 'Meta considers this marketing. Utility templates may only be order, account, appointment or event updates — remove offers, discounts and promotions.',
  INVALID_FORMAT: 'The template format is invalid — check the header, body and buttons.',
  ABUSIVE_CONTENT: 'Meta flagged the wording as abusive or threatening.',
};
