/**
 * WhatsApp template parameter helpers — shared by Store automation
 * (utils/commerceEvents.js) and the Flow Builder's Message Template element
 * (flowEngine.js, sequenceRunner.js, broadcastRunner.js via
 * utils/templateMessage.js). Moved out of commerceEvents.js so the flow
 * engine can use them without importing the commerce engine (circular import).
 */

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export const MEDIA_HEADER_TYPES = ["IMAGE", "VIDEO", "DOCUMENT"];

/** Placeholders in order of appearance: ["1","2"] or ["customer_name", ...] (named). */
export function templatePlaceholders(text) {
  const out = [];
  for (const m of String(text || "").matchAll(/{{\s*([A-Za-z0-9_]+)\s*}}/g)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

/** What a campaign editor or inbox composer needs to map: header / body placeholders, media, location, and buttons. */
export function describeTemplate(tpl) {
  const buttons = parseJson(tpl.buttons_json, []).map((b, index) => {
    const type = String(b.type || "").toUpperCase();
    return {
      index,
      type,
      text: b.text || b.title || `Button ${index + 1}`,
      url: b.url || null,
      dynamic: type === "URL" && /{{\s*1\s*}}/.test(b.url || ""),
      isCopyCode: type === "COPY_CODE" || type === "OTP",
      isFlow: type === "FLOW",
      isCatalog: type === "CATALOG",
    };
  });

  const isCarousel = (tpl.template_type || "").toUpperCase() === "CAROUSEL" || Boolean(tpl.carousel_cards_json && tpl.carousel_cards_json !== "[]");
  const rawCards = isCarousel ? parseJson(tpl.carousel_cards_json, []) : [];
  const cards = rawCards.map((c, cardIndex) => {
    const comps = Array.isArray(c?.components) ? c.components : [];
    const headerComp = comps.find((x) => (x.type || "").toUpperCase() === "HEADER");
    const bodyComp = comps.find((x) => (x.type || "").toUpperCase() === "BODY");
    const btnComp = comps.find((x) => (x.type || "").toUpperCase() === "BUTTONS");
    const headerType = headerComp ? (headerComp.format || "IMAGE").toUpperCase() : null;
    const cardButtons = (btnComp?.buttons || []).map((b, bIdx) => {
      const bType = String(b.type || "").toUpperCase();
      return {
        index: bIdx,
        type: bType,
        text: b.text || b.title || `Button ${bIdx + 1}`,
        url: b.url || null,
        dynamic: bType === "URL" && /{{\s*1\s*}}/.test(b.url || ""),
        isCopyCode: bType === "COPY_CODE" || bType === "OTP",
      };
    });

    return {
      cardIndex,
      headerType,
      headerPlaceholders: headerType === "TEXT" && headerComp?.text ? templatePlaceholders(headerComp.text) : [],
      headerMediaUrl: headerComp?.example?.header_handle?.[0] || null,
      bodyText: bodyComp?.text || "",
      body: templatePlaceholders(bodyComp?.text || ""),
      buttons: cardButtons,
    };
  });

  const headerType = (tpl.header_type || "").toUpperCase();

  return {
    isCarousel,
    cards,
    headerType,
    header: headerType === "TEXT" ? templatePlaceholders(tpl.header_text) : [],
    headerText: headerType === "TEXT" ? (tpl.header_text || "") : "",
    bodyText: tpl.body_text || "",
    footerText: tpl.footer_text || "",
    body: templatePlaceholders(tpl.body_text),
    buttons,
    quickReplyCount: buttons.filter((b) => b.type === "QUICK_REPLY").length,
    hasHeaderSample: /^https?:\/\//.test(tpl.header_media_url || ""),
  };
}

export function valueFor(source, fields) {
  if (!source) return "";
  const s = String(source);
  if (s.startsWith("text:")) return s.slice(5);
  return fields[s] ?? "";
}

// WhatsApp rejects empty text parameters and ones with newlines/tabs or 4+ spaces.
export function cleanParam(v) {
  const s = String(v ?? "").replace(/[\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim();
  return s || "-";
}

/**
 * Builds Meta's `components` for this template from the campaign's / composer's
 * variable_map ({ header: {ph: src}, body: {ph: src}, buttons: {index: src} })
 * plus quick-reply payloads, media URLs, location coordinates, document filenames, and carousel card params.
 */
export function buildTemplateComponents(tpl, variableMap, fields, {
  quickReplyPayloads = [],
  headerMediaUrl = null,
  documentFilename = null,
  location = null,
  cardParams = [],
} = {}) {
  const map = variableMap || {};
  const desc = describeTemplate(tpl);
  const components = [];
  const toParams = (placeholders, section, sourceMap = map) => placeholders.map((ph) => {
    const text = cleanParam(valueFor(sourceMap[section]?.[ph], fields));
    return /^\d+$/.test(ph) ? { type: "text", text } : { type: "text", parameter_name: ph, text };
  });

  // ─── Header Component ───
  if (desc.header.length) {
    components.push({ type: "header", parameters: toParams(desc.header, "header") });
  } else if (desc.headerType === "LOCATION") {
    const loc = location || map.location;
    if (loc && loc.latitude && loc.longitude) {
      components.push({
        type: "header",
        parameters: [{
          type: "location",
          location: {
            latitude: String(loc.latitude),
            longitude: String(loc.longitude),
            ...(loc.name ? { name: String(loc.name) } : {}),
            ...(loc.address ? { address: String(loc.address) } : {}),
          },
        }],
      });
    }
  } else if (MEDIA_HEADER_TYPES.includes(desc.headerType)) {
    const link = headerMediaUrl || (/^https?:\/\//.test(tpl.header_media_url || "") ? tpl.header_media_url : null);
    const kind = desc.headerType.toLowerCase();
    if (link) {
      const mediaObj = { link };
      if (desc.headerType === "DOCUMENT" && (documentFilename || map.documentFilename)) {
        mediaObj.filename = String(documentFilename || map.documentFilename);
      }
      components.push({ type: "header", parameters: [{ type: kind, [kind]: mediaObj }] });
    }
  }

  // ─── Body Component ───
  if (desc.body.length) {
    components.push({ type: "body", parameters: toParams(desc.body, "body") });
  }

  // ─── Buttons Component ───
  let qr = 0;
  for (const b of desc.buttons) {
    if (b.type === "QUICK_REPLY") {
      const payload = quickReplyPayloads[qr++];
      if (payload) {
        components.push({ type: "button", sub_type: "quick_reply", index: String(b.index), parameters: [{ type: "payload", payload }] });
      }
    } else if (b.dynamic) {
      const val = cleanParam(valueFor(map.buttons?.[b.index], fields));
      components.push({ type: "button", sub_type: "url", index: String(b.index), parameters: [{ type: "text", text: val }] });
    } else if (b.isCopyCode) {
      const codeVal = cleanParam(valueFor(map.buttons?.[b.index], fields));
      if (codeVal && codeVal !== "-") {
        components.push({ type: "button", sub_type: "copy_code", index: String(b.index), parameters: [{ type: "coupon_code", coupon_code: codeVal }] });
      }
    } else if (b.isFlow && map.buttons?.[b.index]) {
      const flowData = typeof map.buttons[b.index] === "object" ? map.buttons[b.index] : null;
      if (flowData) {
        components.push({
          type: "button",
          sub_type: "flow",
          index: String(b.index),
          parameters: [{
            type: "action",
            action: {
              ...(flowData.flow_token ? { flow_token: flowData.flow_token } : {}),
              ...(flowData.flow_action_data ? { flow_action_data: flowData.flow_action_data } : {}),
            },
          }],
        });
      }
    }
  }

  // ─── Carousel Component ───
  if (desc.isCarousel && desc.cards.length) {
    const cardsComponent = {
      type: "carousel",
      cards: desc.cards.map((card, idx) => {
        const cp = cardParams[idx] || {};
        const cardComps = [];

        // Card header (IMAGE / VIDEO)
        if (MEDIA_HEADER_TYPES.includes(card.headerType)) {
          const kind = card.headerType.toLowerCase();
          const link = cp.headerMedia || (/^https?:\/\//.test(card.headerMediaUrl || "") ? card.headerMediaUrl : null);
          if (link) {
            cardComps.push({
              type: "header",
              parameters: [{ type: kind, [kind]: { link } }],
            });
          }
        }

        // Card body placeholders
        if (card.body.length) {
          const bodyParams = card.body.map((ph) => {
            const text = cleanParam(valueFor(cp.body?.[ph], fields));
            return /^\d+$/.test(ph) ? { type: "text", text } : { type: "text", parameter_name: ph, text };
          });
          cardComps.push({ type: "body", parameters: bodyParams });
        }

        // Card buttons (dynamic URL, copy_code, quick_reply)
        for (const b of card.buttons) {
          if (b.dynamic) {
            cardComps.push({
              type: "button",
              sub_type: "url",
              index: String(b.index),
              parameters: [{ type: "text", text: cleanParam(valueFor(cp.buttons?.[b.index], fields)) }],
            });
          } else if (b.isCopyCode) {
            const cCode = cleanParam(valueFor(cp.buttons?.[b.index], fields));
            if (cCode && cCode !== "-") {
              cardComps.push({
                type: "button",
                sub_type: "copy_code",
                index: String(b.index),
                parameters: [{ type: "coupon_code", coupon_code: cCode }],
              });
            }
          }
        }

        return {
          card_index: idx,
          components: cardComps,
        };
      }),
    };
    components.push(cardsComponent);
  }

  const render = (text, section) => String(text || "").replace(/{{\s*([A-Za-z0-9_]+)\s*}}/g, (_, ph) => valueFor(map[section]?.[ph], fields) || `{{${ph}}}`);
  return {
    components,
    renderedBody: render(tpl.body_text, "body"),
    renderedHeader: desc.headerType === "TEXT" ? render(tpl.header_text, "header") : null,
    buttons: desc.buttons.map((b) => ({ title: b.text, type: b.type === "URL" ? "url" : "postback" })),
  };
}
