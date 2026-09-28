import createDOMPurify from 'dompurify';

// Admin-written rich text shown on public pages (Documentation). Scripts,
// event handlers and unknown iframes are stripped; only YouTube / Vimeo embeds
// keep their iframe. Its own DOMPurify instance, so its hooks never affect
// other sanitisers in the app.
const EMBED_SRC = /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|player\.vimeo\.com)\//i;

let purifier = null;
function getPurifier() {
  if (purifier) return purifier;
  purifier = createDOMPurify(window);
  purifier.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'iframe' && !EMBED_SRC.test(node.getAttribute?.('src') || '')) node.parentNode?.removeChild(node);
  });
  purifier.addHook('afterSanitizeAttributes', (node) => {
    // Links that leave the site open in a new tab without handing over window.opener.
    if (node.tagName === 'A' && /^https?:\/\//i.test(node.getAttribute('href') || '')) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
  return purifier;
}

export function slugifyHeading(text) {
  return String(text || '').toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-').slice(0, 80) || 'section';
}

/**
 * Sanitises the HTML and gives every h2 / h3 a unique id.
 * Returns { html, toc: [{ id, text, level }] }.
 */
export function prepareArticleHtml(raw) {
  const clean = getPurifier().sanitize(raw || '', {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'target'],
  });
  const doc = new DOMParser().parseFromString(`<div id="dc-root">${clean}</div>`, 'text/html');
  const root = doc.getElementById('dc-root');
  const toc = [];
  const used = new Set();
  root.querySelectorAll('h2, h3').forEach((h) => {
    const text = h.textContent.trim();
    if (!text) return;
    let id = slugifyHeading(text);
    for (let i = 2; used.has(id); i++) id = `${slugifyHeading(text)}-${i}`;
    used.add(id);
    h.id = id;
    toc.push({ id, text, level: h.tagName === 'H2' ? 2 : 3 });
  });
  return { html: root.innerHTML, toc };
}
