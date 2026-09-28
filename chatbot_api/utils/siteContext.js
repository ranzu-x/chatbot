/**
 * Which website a public request comes from — the platform's main domain or a
 * workspace's white-label address (routes/auth.js resolveAgencyFromDomain).
 *
 * The browser app calls the API cross-site from reseller domains, so the API's
 * own Host says nothing: the page's host is taken from `?host=` (sent by the
 * app), else the Origin / Referer header. Used to keep the main-domain blog off
 * reseller domains and to serve a reseller's landing page. This is about what
 * a site shows, not access control — everything served here is public.
 */
import { resolveAgencyFromDomain } from "../routes/auth.js";

const TTL_MS = 60_000;
const cache = new Map(); // host -> { agency, ts }

const hostOf = (value) => {
  try { return new URL(value).hostname.toLowerCase(); } catch { return null; }
};

export function requestSiteHost(req) {
  const q = String(req.query?.host || "").trim().toLowerCase();
  if (q && /^[a-z0-9.-]{1,253}(:\d+)?$/.test(q)) return q.replace(/:\d+$/, "");
  return hostOf(req.headers?.origin) || hostOf(req.headers?.referer) || null;
}

/** The workspace row a site host belongs to, or null for the main domain. */
export async function siteAgencyFor(host) {
  if (!host) return null;
  const hit = cache.get(host);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.agency;
  const agency = await resolveAgencyFromDomain(host).catch(() => null);
  cache.set(host, { agency, ts: Date.now() });
  if (cache.size > 5000) cache.delete(cache.keys().next().value);
  return agency;
}

/** True when the request comes from the platform's main domain (or can't tell). */
export async function isMainDomainRequest(req) {
  return !(await siteAgencyFor(requestSiteHost(req)));
}
