/**
 * The Flow Builder's "Message Template" element (node type `whatsappTemplate`)
 * — sends one approved WhatsApp template, the only kind of message WhatsApp
 * accepts outside the 24-hour customer-service window. Used wherever a flow
 * runs: normal flows (flowEngine.js), Sequences (sequenceRunner.js),
 * Broadcasts (broadcastRunner.js, incl. "Anytime" mode), and the Live Inbox.
 *
 * Node data: { templateId, templateName, language, params: { header: {ph: text},
 * body: {ph: text}, buttons: {index: text}, headerMedia: url, documentFilename,
 * location: { latitude, longitude, name, address } }, cards: [...], buttons: [] }
 * — each param text may contain the usual flow variables ({{contact.name}},
 * {{my_field}}, …). `headerMedia` is the image/video/document sent in a media
 * header. `buttons[i]` holds template button i's tap options (same shape as a
 * flow button: action flow|goToFlow, labelIds, sequenceId, …); its canvas
 * handle is `btn-<i>`.
 *
 * Bot scope: a template belongs to the WhatsApp account it was synced from
 * (whatsapp_templates.integration_id); a flow may only send its own
 * account's templates, same rule as every other bot component.
 */
import pool from "../db.js";
import { describeTemplate, buildTemplateComponents, MEDIA_HEADER_TYPES } from "./whatsappTemplateParams.js";

export const TEMPLATE_NODE_TYPE = "whatsappTemplate";

export async function loadApprovedTemplate(agencyId, integrationId, templateId) {
  if (!templateId || !integrationId) return null;
  const [[tpl]] = await pool.query(
    "SELECT * FROM whatsapp_templates WHERE id = ? AND agency_id = ? AND integration_id = ? AND status = 'APPROVED'",
    [templateId, agencyId, integrationId]
  );
  return tpl || null;
}

/** Placeholders the template needs that the element leaves empty (["body {{1}}", …]). */
export function missingTemplateParams(tpl, params = {}) {
  const desc = describeTemplate(tpl);
  const missing = [];
  const empty = (v) => v === undefined || v === null || String(v).trim() === "";

  // Header placeholders or location
  desc.header.forEach((ph) => { if (empty(params.header?.[ph])) missing.push(`header {{${ph}}}`); });
  if (desc.headerType === "LOCATION") {
    if (empty(params.location?.latitude) || empty(params.location?.longitude)) {
      missing.push("header location coordinates");
    }
  }

  // Body placeholders
  desc.body.forEach((ph) => { if (empty(params.body?.[ph])) missing.push(`body {{${ph}}}`); });

  // Buttons
  desc.buttons.forEach((b) => {
    if (b.dynamic && empty(params.buttons?.[b.index])) {
      missing.push(`button "${b.text}"`);
    } else if (b.isCopyCode && empty(params.buttons?.[b.index])) {
      missing.push(`coupon code for "${b.text}"`);
    }
  });

  // A media header needs a file: the element's own, or the template's stored sample.
  if (MEDIA_HEADER_TYPES.includes(desc.headerType) && empty(params.headerMedia) && !/^https?:\/\//.test(tpl.header_media_url || "")) {
    missing.push(`header ${String(desc.headerType).toLowerCase()}`);
  }

  // Carousel cards
  if (desc.isCarousel && desc.cards.length) {
    desc.cards.forEach((card, idx) => {
      const cp = params.cards?.[idx] || {};
      if (MEDIA_HEADER_TYPES.includes(card.headerType) && empty(cp.headerMedia) && !/^https?:\/\//.test(card.headerMediaUrl || "")) {
        missing.push(`card ${idx + 1} header ${card.headerType.toLowerCase()}`);
      }
      card.body.forEach((ph) => {
        if (empty(cp.body?.[ph])) missing.push(`card ${idx + 1} body {{${ph}}}`);
      });
      card.buttons.forEach((b) => {
        if (b.dynamic && empty(cp.buttons?.[b.index])) {
          missing.push(`card ${idx + 1} button "${b.text}"`);
        } else if (b.isCopyCode && empty(cp.buttons?.[b.index])) {
          missing.push(`card ${idx + 1} coupon code for "${b.text}"`);
        }
      });
    });
  }

  return missing;
}

/**
 * sendMsg() arguments for one recipient. `render(text)` substitutes flow
 * variables (the caller passes flowEngine's replaceVariables bound to the
 * contact) — taken as a parameter so this module never imports flowEngine.
 */
export function buildTemplateSend(tpl, params = {}, render = (t) => t, { routeFor = null } = {}) {
  const map = { header: {}, body: {}, buttons: {} };
  for (const section of ["header", "body", "buttons"]) {
    for (const [key, value] of Object.entries(params?.[section] || {})) {
      map[section][key] = `text:${render(String(value ?? ""))}`;
    }
  }

  // Each quick-reply button carries the flow's routing token for its own
  // index, so a tap runs that button's options (next step, labels, …) exactly
  // like a normal flow button — see flowEngine.js decodeButtonRoute.
  const quickReplyPayloads = routeFor
    ? describeTemplate(tpl).buttons.filter((b) => b.type === "QUICK_REPLY").map((b) => routeFor(b.index))
    : [];
  const headerMedia = String(params?.headerMedia || "").trim();
  const documentFilename = params?.documentFilename ? render(String(params.documentFilename)).trim() : null;

  let location = null;
  if (params?.location && (params.location.latitude || params.location.longitude)) {
    location = {
      latitude: render(String(params.location.latitude ?? "")).trim(),
      longitude: render(String(params.location.longitude ?? "")).trim(),
      ...(params.location.name ? { name: render(String(params.location.name)).trim() } : {}),
      ...(params.location.address ? { address: render(String(params.location.address)).trim() } : {}),
    };
  }

  // Carousel card parameters
  const cardParams = (params?.cards || []).map((cp) => {
    const cardMap = { body: {}, buttons: {} };
    for (const [k, v] of Object.entries(cp?.body || {})) cardMap.body[k] = `text:${render(String(v ?? ""))}`;
    for (const [k, v] of Object.entries(cp?.buttons || {})) cardMap.buttons[k] = `text:${render(String(v ?? ""))}`;
    const media = String(cp?.headerMedia || "").trim();
    return {
      headerMedia: media ? render(media).trim() : null,
      ...cardMap,
    };
  });

  const built = buildTemplateComponents(tpl, map, {}, {
    quickReplyPayloads,
    headerMediaUrl: headerMedia ? render(headerMedia).trim() : null,
    documentFilename,
    location,
    cardParams,
  });

  return {
    bodyText: built.renderedBody || `[Template: ${tpl.template_name}]`,
    extraFields: {
      whatsappTemplate: { name: tpl.template_name, language: tpl.language, components: built.components },
      buttons: built.buttons,
    },
  };
}
