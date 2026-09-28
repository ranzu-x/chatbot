// WhatsApp CTA URL Button element — the builder's copy of the rules in
// chatbot_api/utils/whatsappCtaUrl.js (Meta's limits). The server checks
// again on the final values before sending; keep both in step.

export const CTA_LIMITS = { body: 1024, buttonText: 20, headerText: 60, footer: 60, url: 2000 };

const HAS_VAR = /\{\{\s*[^{}]+?\s*\}\}/;
const ALL_VARS = /\{\{\s*[^{}]+?\s*\}\}/g;

function isValidAbsoluteUrl(value) {
  try {
    const u = new URL(value);
    return (u.protocol === 'https:' || u.protocol === 'http:') && Boolean(u.hostname) && u.hostname.includes('.');
  } catch {
    return false;
  }
}

/** First problem with the element, or null. */
export function ctaUrlProblem(data = {}) {
  const body = String(data.body ?? '').trim();
  const buttonText = String(data.buttonText ?? '').trim();
  const url = String(data.url ?? '').trim();
  const headerType = String(data.headerType || 'none').toLowerCase();

  if (!body) return 'Message text is required';
  if (body.length > CTA_LIMITS.body) return `Message text can be at most ${CTA_LIMITS.body} characters`;
  if (!buttonText) return 'Button text is required';
  if (buttonText.length > CTA_LIMITS.buttonText) return `Button text can be at most ${CTA_LIMITS.buttonText} characters (WhatsApp's limit)`;
  if (HAS_VAR.test(buttonText)) return "Button text can't contain variables";
  if (!url || url === 'https://') return 'Button URL is required';
  if (url.length > CTA_LIMITS.url) return `The URL can be at most ${CTA_LIMITS.url} characters`;
  if (!/^https?:\/\//i.test(url)) return 'The URL must start with https://';
  if (/\s/.test(url.replace(ALL_VARS, ''))) return "The URL can't contain spaces";
  const origin = (/^https?:\/\/[^/?#]*/i.exec(url) || [''])[0];
  if (HAS_VAR.test(origin)) return 'Variables are only allowed after the domain (e.g. https://shop.com/order?id={{order_id}})';
  if (!isValidAbsoluteUrl(url.replace(ALL_VARS, 'x'))) return "That isn't a valid web address";
  if (headerType === 'text') {
    const ht = String(data.headerText ?? '').trim();
    if (!ht) return 'Header text is required when the header is Text';
    if (ht.length > CTA_LIMITS.headerText) return `Header text can be at most ${CTA_LIMITS.headerText} characters`;
  }
  if (['image', 'video', 'document'].includes(headerType)) {
    const media = String(data.headerMediaUrl ?? '').trim();
    if (!media) return `Add the header ${headerType}`;
    if (!/^(https:\/\/|\/uploads\/)/i.test(media)) return 'The header media must be an uploaded file or an https:// link';
  }
  if (String(data.footerText ?? '').trim().length > CTA_LIMITS.footer) return `Footer text can be at most ${CTA_LIMITS.footer} characters`;
  return null;
}
