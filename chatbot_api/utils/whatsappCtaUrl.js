/**
 * WhatsApp "CTA URL Button" element (flow node `whatsappCtaUrl`) — Meta's
 * interactive Call-to-Action URL button message. Checked against Meta's
 * documentation (Cloud API → Messages → Interactive CTA URL button messages,
 * shown for v25.0; this app sends with META_API_VERSION, utils/metaApi.js):
 *
 *   type: "interactive", interactive: {
 *     type: "cta_url",
 *     header?: { type: "text", text } | { type: "image"|"video"|"document", <type>: { link } },
 *     body:    { text },                          required, max 1024 chars
 *     footer?: { text },                          max 60 chars
 *     action:  { name: "cta_url", parameters: { display_text, url } }
 *   }
 *   display_text max 20 chars · header text max 60 chars · exactly ONE button.
 *
 * It is a free-form (service) message, so it can only be sent inside the
 * 24-hour customer service window — outside it only templates are allowed.
 * The URL is a literal string to Meta: {{variables}} are filled in by us before
 * sending (URL-encoded), and only after the domain, so the link always goes to
 * the site the bot owner typed. Validated on save (builder) and again, on the
 * final values, right before sending — an invalid payload is never sent.
 */

export const CTA_LIMITS = { body: 1024, buttonText: 20, headerText: 60, footer: 60, url: 2000 };
export const CTA_HEADER_TYPES = ["none", "text", "image", "video", "document"];

const VAR_RE = /\{\{\s*[^{}]+?\s*\}\}/g; // for replace()
const HAS_VAR_RE = /\{\{\s*[^{}]+?\s*\}\}/; // for test() — no lastIndex state

/** The part of a URL template before its path — must be literal (no variables). */
function originPart(url) {
  const m = /^https?:\/\/[^/?#]*/i.exec(url);
  return m ? m[0] : "";
}

/**
 * Checks the element as saved (templates may still hold {{variables}}).
 * Returns a list of human-readable problems (empty = valid).
 */
export function validateCtaConfig(data = {}) {
  const errors = [];
  const body = String(data.body ?? "").trim();
  const buttonText = String(data.buttonText ?? "").trim();
  const url = String(data.url ?? "").trim();
  const headerType = String(data.headerType || "none").toLowerCase();

  if (!body) errors.push("Message text is required.");
  else if (body.length > CTA_LIMITS.body) errors.push(`Message text can be at most ${CTA_LIMITS.body} characters.`);
  if (!buttonText) errors.push("Button text is required.");
  else if (buttonText.length > CTA_LIMITS.buttonText) errors.push(`Button text can be at most ${CTA_LIMITS.buttonText} characters (WhatsApp's limit).`);
  else if (HAS_VAR_RE.test(buttonText)) errors.push("Button text can't contain variables.");

  if (!url) errors.push("Button URL is required.");
  else if (url.length > CTA_LIMITS.url) errors.push(`The URL can be at most ${CTA_LIMITS.url} characters.`);
  else if (!/^https?:\/\//i.test(url)) errors.push("The URL must start with https:// (or http://).");
  else if (/\s/.test(url.replace(VAR_RE, ""))) errors.push("The URL can't contain spaces.");
  else {
    const origin = originPart(url);
    if (HAS_VAR_RE.test(origin)) errors.push("Variables are only allowed after the domain (in the path or query), e.g. https://shop.com/order?id={{order_id}}.");
    else if (!isValidAbsoluteUrl(url.replace(VAR_RE, "x"))) errors.push("That isn't a valid web address.");
  }

  if (!CTA_HEADER_TYPES.includes(headerType)) errors.push("Unknown header type.");
  if (headerType === "text") {
    const ht = String(data.headerText ?? "").trim();
    if (!ht) errors.push("Header text is required when the header is Text.");
    else if (ht.length > CTA_LIMITS.headerText) errors.push(`Header text can be at most ${CTA_LIMITS.headerText} characters.`);
  }
  if (["image", "video", "document"].includes(headerType)) {
    const media = String(data.headerMediaUrl ?? "").trim();
    if (!media) errors.push(`Add the header ${headerType} (upload it or paste an https link).`);
    else if (!/^(https:\/\/|\/uploads\/)/i.test(media)) errors.push("The header media must be an uploaded file or an https:// link.");
  }
  const footer = String(data.footerText ?? "").trim();
  if (footer.length > CTA_LIMITS.footer) errors.push(`Footer text can be at most ${CTA_LIMITS.footer} characters.`);
  return errors;
}

export function isValidAbsoluteUrl(value) {
  try {
    const u = new URL(value);
    return (u.protocol === "https:" || u.protocol === "http:") && Boolean(u.hostname) && u.hostname.includes(".");
  } catch {
    return false;
  }
}

/**
 * Fills a URL template: each {{token}} is resolved with `resolveToken` (the flow
 * engine's replaceVariables) and URL-encoded. The domain part is never touched.
 */
export function fillCtaUrl(template, resolveToken) {
  const url = String(template || "").trim();
  const origin = originPart(url);
  const rest = url.slice(origin.length).replace(VAR_RE, (tok) => encodeURIComponent(String(resolveToken(tok) ?? "")));
  return origin + rest;
}

/** Problems with FINAL values (variables filled in) — relative /uploads/ media is fine here. */
export function validateFinalCta(cta) {
  const problems = validateCtaConfig(cta);
  if (!problems.length && (/[{}]/.test(cta.url) || !isValidAbsoluteUrl(cta.url))) problems.push("The link isn't a valid address after filling in the variables.");
  return problems;
}

/**
 * Builds the `interactive` object from FINAL values (variables already filled,
 * media links already public). Throws with every problem when anything is off,
 * so a broken payload can never reach Meta.
 */
export function buildCtaUrlInteractive({ body, buttonText, url, headerType = "none", headerText, headerMediaUrl, footerText }) {
  const type = String(headerType || "none").toLowerCase();
  const problems = validateFinalCta({ body, buttonText, url, headerType: type, headerText, headerMediaUrl: type === "none" || type === "text" ? "" : headerMediaUrl, footerText });
  if (["image", "video", "document"].includes(type) && headerMediaUrl && !/^https:\/\//i.test(headerMediaUrl)) {
    problems.push("The header media link must be public https://.");
  }
  if (problems.length) throw Object.assign(new Error(problems.join(" ")), { code: "INVALID_CTA_URL", problems });

  const interactive = {
    type: "cta_url",
    body: { text: String(body).trim() },
    action: { name: "cta_url", parameters: { display_text: String(buttonText).trim(), url: String(url).trim() } },
  };
  if (type === "text") interactive.header = { type: "text", text: String(headerText).trim() };
  else if (type !== "none") interactive.header = { type, [type]: { link: headerMediaUrl } };
  if (String(footerText || "").trim()) interactive.footer = { text: String(footerText).trim() };
  return interactive;
}
