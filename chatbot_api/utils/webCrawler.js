import axios from "axios";
import dns from "node:dns/promises";
import net from "node:net";

/**
 * Website → AI knowledge. Fetches pages the owner points at, safely:
 * - only http(s), and every hop (including each redirect) must resolve to a
 *   public address — no reaching localhost / the cloud metadata service /
 *   internal networks through a URL someone typed (SSRF);
 * - HTML only, 2 MB per page, 15s per request;
 * - crawl = the site's sitemap.xml if it has one, else same-origin links,
 *   respecting robots.txt "Disallow" for all agents.
 * htmlToText keeps headings and paragraphs as lines, so utils/aiKnowledge.js
 * chunkText can keep sections together.
 */
const USER_AGENT = "Mozilla/5.0 (compatible; ChatbotKnowledgeBot/1.0)";
const MAX_BYTES = 2 * 1024 * 1024;
const SKIP_EXT = /\.(jpe?g|png|gif|webp|svg|ico|pdf|zip|rar|gz|mp4|mp3|wav|avi|mov|css|js|json|xml|woff2?|ttf|eot|docx?|xlsx?|pptx?)(\?|$)/i;

export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

export async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(new Error("That is not a valid web address"), { status: 400 });
  }
  if (!["http:", "https:"].includes(url.protocol)) throw Object.assign(new Error("Only http:// and https:// addresses can be read"), { status: 400 });
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw Object.assign(new Error(`Could not find ${host}`), { status: 400 });
  if (addresses.some((a) => isPrivateAddress(a.address))) throw Object.assign(new Error("That address points to a private network and can't be read"), { status: 400 });
  return url;
}

/** GET with every redirect hop re-checked. Returns { url, status, contentType, body }. */
export async function safeGet(rawUrl, { maxRedirects = 5, accept = "text/html" } = {}) {
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicUrl(current);
    const res = await axios.get(url.href, {
      headers: { "User-Agent": USER_AGENT, Accept: accept },
      timeout: 15000,
      maxRedirects: 0,
      maxContentLength: MAX_BYTES,
      responseType: "text",
      transformResponse: (d) => d,
      validateStatus: () => true,
    });
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      current = new URL(res.headers.location, url).href;
      continue;
    }
    return { url: url.href, status: res.status, contentType: String(res.headers["content-type"] || ""), body: typeof res.data === "string" ? res.data : "" };
  }
  throw Object.assign(new Error("Too many redirects"), { status: 400 });
}

const decodeEntities = (s) => s
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

/** Readable text with structure: "# heading" lines and blank lines between blocks. */
export function htmlToText(html) {
  let s = String(html || "");
  s = s.replace(/<(head|script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ");
  // Inline formatting joins words; it must not add spaces ("<b>word</b>." → "word.").
  s = s.replace(/<\/?(b|strong|i|em|u|span|a|code|small|mark|sup|sub|abbr)\b[^>]*>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  // Site chrome rarely answers questions.
  s = s.replace(/<(nav|footer|header|aside|form)\b[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, lvl, inner) => `\n\n${"#".repeat(Number(lvl))} ${inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}\n\n`);
  s = s.replace(/<li[^>]*>/gi, "\n- ");
  s = s.replace(/<(br)\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|section|article|li|tr|table|ul|ol|blockquote|pre)>/gi, "\n\n");
  s = s.replace(/<\/t[dh]>/gi, " | ");
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return s.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function pageTitle(html) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html || ""));
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim().slice(0, 200) : "";
}

export function extractLinks(html, baseUrl) {
  const out = new Set();
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)/gi;
  let m;
  while ((m = re.exec(String(html || "")))) {
    try {
      const u = new URL(decodeEntities(m[1]), baseUrl);
      u.hash = "";
      if (["http:", "https:"].includes(u.protocol)) out.add(u.href);
    } catch { /* skip */ }
  }
  return [...out];
}

/** robots.txt "User-agent: *" Disallow prefixes. */
export function parseRobots(txt) {
  const disallow = [];
  let applies = false;
  for (const line of String(txt || "").split(/\r?\n/)) {
    const [k, ...rest] = line.split(":");
    const key = k.trim().toLowerCase();
    const val = rest.join(":").split("#")[0].trim();
    if (key === "user-agent") applies = val === "*";
    else if (applies && key === "disallow" && val) disallow.push(val);
  }
  return disallow;
}

async function sitemapUrls(origin) {
  try {
    const res = await safeGet(`${origin}/sitemap.xml`, { accept: "application/xml,text/xml" });
    if (res.status !== 200) return [];
    const locs = [...res.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]));
    // A sitemap index: read the first few child sitemaps.
    if (/<sitemapindex/i.test(res.body)) {
      const nested = [];
      for (const child of locs.slice(0, 5)) {
        try {
          const r = await safeGet(child, { accept: "application/xml,text/xml" });
          if (r.status === 200) nested.push(...[...r.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decodeEntities(m[1])));
        } catch { /* skip */ }
      }
      return nested;
    }
    return locs;
  } catch {
    return [];
  }
}

/**
 * Reads up to `maxPages` pages of one site, starting at `startUrl`.
 * onPage({ url, title, text }) is called for each readable page as it's read.
 */
export async function crawlSite(startUrl, { maxPages = 25, onPage } = {}) {
  const start = await assertPublicUrl(startUrl);
  const origin = start.origin;
  let disallow = [];
  try {
    const robots = await safeGet(`${origin}/robots.txt`, { accept: "text/plain" });
    if (robots.status === 200) disallow = parseRobots(robots.body);
  } catch { /* no robots.txt */ }
  const allowed = (u) => {
    try {
      const url = new URL(u);
      return url.origin === origin && !SKIP_EXT.test(url.pathname) && !disallow.some((d) => url.pathname.startsWith(d));
    } catch {
      return false;
    }
  };

  const fromSitemap = (await sitemapUrls(origin)).filter(allowed);
  const queue = [start.href, ...fromSitemap];
  const seen = new Set();
  const pages = [];
  while (queue.length && pages.length < maxPages) {
    const next = queue.shift();
    const key = next.replace(/\/$/, "");
    if (seen.has(key) || !allowed(next)) continue;
    seen.add(key);
    let res;
    try {
      res = await safeGet(next);
    } catch {
      continue;
    }
    if (res.status !== 200 || !/text\/html|application\/xhtml/i.test(res.contentType)) continue;
    const text = htmlToText(res.body);
    if (text.length >= 80) {
      const page = { url: res.url, title: pageTitle(res.body) || new URL(res.url).pathname, text };
      pages.push(page);
      if (onPage) await onPage(page);
    }
    // Follow links only when the sitemap didn't already list the site.
    if (!fromSitemap.length) {
      for (const link of extractLinks(res.body, res.url)) if (allowed(link) && !seen.has(link.replace(/\/$/, ""))) queue.push(link);
    }
  }
  return pages;
}
