// Helpers for WhatsApp Message Template configuration (see MessageTemplateFields.jsx & SendMenuPanel.jsx).

/** Placeholders in order of appearance: ["1","2"] or named ones. Mirrors the server's templatePlaceholders. */
export function templatePlaceholders(text) {
  const out = [];
  for (const m of String(text || '').matchAll(/{{\s*([A-Za-z0-9_]+)\s*}}/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

const parseJson = (v, fallback) => {
  if (v === null || v === undefined) return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fallback; }
};

/** What the element / composer needs to know about a template (mirrors the server's describeTemplate). */
export function describeTemplateForElement(tpl) {
  const buttons = parseJson(tpl.buttons_json, []).map((b, index) => {
    const type = String(b.type || '').toUpperCase();
    return {
      index,
      type,
      text: b.text || b.title || `Button ${index + 1}`,
      url: b.url || null,
      dynamic: type === 'URL' && /{{\s*1\s*}}/.test(b.url || ''),
      isCopyCode: type === 'COPY_CODE' || type === 'OTP',
      isFlow: type === 'FLOW',
      isCatalog: type === 'CATALOG',
    };
  });

  const isCarousel = (tpl.template_type || '').toUpperCase() === 'CAROUSEL' || Boolean(tpl.carousel_cards_json && tpl.carousel_cards_json !== '[]');
  const rawCards = isCarousel ? parseJson(tpl.carousel_cards_json, []) : [];
  const cards = rawCards.map((c, cardIndex) => {
    const comps = Array.isArray(c?.components) ? c.components : [];
    const headerComp = comps.find((x) => (x.type || '').toUpperCase() === 'HEADER');
    const bodyComp = comps.find((x) => (x.type || '').toUpperCase() === 'BODY');
    const btnComp = comps.find((x) => (x.type || '').toUpperCase() === 'BUTTONS');
    const headerType = headerComp ? (headerComp.format || 'IMAGE').toUpperCase() : null;
    const cardButtons = (btnComp?.buttons || []).map((b, bIdx) => {
      const bType = String(b.type || '').toUpperCase();
      return {
        index: bIdx,
        type: bType,
        text: b.text || b.title || `Button ${bIdx + 1}`,
        url: b.url || null,
        dynamic: bType === 'URL' && /{{\s*1\s*}}/.test(b.url || ''),
        isCopyCode: bType === 'COPY_CODE' || bType === 'OTP',
      };
    });

    return {
      cardIndex,
      headerType,
      headerPlaceholders: headerType === 'TEXT' && headerComp?.text ? templatePlaceholders(headerComp.text) : [],
      headerMediaUrl: headerComp?.example?.header_handle?.[0] || null,
      bodyText: bodyComp?.text || '',
      body: templatePlaceholders(bodyComp?.text || ''),
      buttons: cardButtons,
    };
  });

  const headerType = (tpl.header_type || '').toUpperCase();

  return {
    isCarousel,
    cards,
    headerType,
    header: headerType === 'TEXT' ? templatePlaceholders(tpl.header_text) : [],
    headerText: headerType === 'TEXT' ? (tpl.header_text || '') : '',
    bodyText: tpl.body_text || '',
    footerText: tpl.footer_text || '',
    body: templatePlaceholders(tpl.body_text),
    buttons,
    // A media header can fall back to the file stored with the template (see the server's buildTemplateComponents).
    hasHeaderSample: /^https?:\/\//.test(tpl.header_media_url || ''),
  };
}

/** One entry per template button, keeping options already set for the same button. */
export function syncTemplateButtons(meta, current = []) {
  return (meta?.buttons || []).map((b) => {
    const prev = current[b.index];
    const keep = prev && prev.title === b.text && prev.type === b.type ? prev : {};
    return { action: 'flow', ...keep, title: b.text, type: b.type };
  });
}

/** Validation message for the builder's save check, or null. */
export function validateMessageTemplate(data = {}) {
  if (!data.templateId) return 'Select an approved message template';
  const meta = data.templateMeta;
  if (!meta) return null;
  const params = data.params || {};
  const empty = (v) => v === undefined || v === null || String(v).trim() === '';

  for (const ph of meta.header || []) if (empty(params.header?.[ph])) return `Fill in the header parameter {{${ph}}}`;
  if (meta.headerType === 'LOCATION') {
    if (empty(params.location?.latitude) || empty(params.location?.longitude)) {
      return 'Fill in the header location coordinates (latitude and longitude)';
    }
  }

  for (const ph of meta.body || []) if (empty(params.body?.[ph])) return `Fill in the body parameter {{${ph}}}`;

  for (const b of (meta.buttons || [])) {
    if (b.dynamic && empty(params.buttons?.[b.index])) return `Fill in the link parameter of button "${b.text}"`;
    if (b.isCopyCode && empty(params.buttons?.[b.index])) return `Fill in the code for copy button "${b.text}"`;
  }

  if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(meta.headerType) && !meta.hasHeaderSample && empty(params.headerMedia)) {
    return `Add the header ${meta.headerType.toLowerCase()}`;
  }

  // Validate carousel cards
  if (meta.isCarousel && meta.cards?.length) {
    for (let i = 0; i < meta.cards.length; i++) {
      const card = meta.cards[i];
      const cp = params.cards?.[i] || {};
      if (['IMAGE', 'VIDEO'].includes(card.headerType) && empty(cp.headerMedia)) {
        return `Add an image/media for Card ${i + 1} of the carousel`;
      }
      for (const ph of card.body || []) {
        if (empty(cp.body?.[ph])) return `Fill in Card ${i + 1} body parameter {{${ph}}}`;
      }
      for (const b of (card.buttons || [])) {
        if (b.dynamic && empty(cp.buttons?.[b.index])) return `Fill in Card ${i + 1} link parameter of button "${b.text}"`;
        if (b.isCopyCode && empty(cp.buttons?.[b.index])) return `Fill in Card ${i + 1} code for copy button "${b.text}"`;
      }
    }
  }

  return null;
}
