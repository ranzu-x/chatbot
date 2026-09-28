/**
 * Reseller white-label domains.
 *
 * Two ways a reseller's customers reach their brand:
 *   1. Subdomain of the platform — <sub>.APP_ROOT_DOMAIN. Live instantly
 *      (wildcard DNS + Cloudflare's wildcard certificate, one-time setup).
 *   2. Their own domain — e.g. app.resellerbrand.com. Added to Cloudflare as a
 *      custom hostname (utils/cloudflareSaas.js) the moment it is saved; the
 *      reseller adds one CNAME, Cloudflare issues SSL and it goes live. A
 *      background check (every minute while pending) flips it to ACTIVE, and
 *      only then does the domain resolve to the reseller (sign-up, branding).
 * Without Cloudflare configured the same flow runs in "manual" mode: the
 * CNAME is checked with a DNS lookup and SSL is the server admin's job.
 *
 * Env: APP_ROOT_DOMAIN (e.g. yourapp.com), CUSTOM_DOMAIN_CNAME_TARGET
 * (e.g. customers.yourapp.com), CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID.
 */
import dns from "dns/promises";
import net from "net";
import pool from "../db.js";
import { lockedJob } from "./jobLock.js";
import {
  isCloudflareConfigured, createCustomHostname, getCustomHostname, deleteCustomHostname, revalidateCustomHostname,
} from "./cloudflareSaas.js";

export const appRootDomain = () => String(process.env.APP_ROOT_DOMAIN || "").toLowerCase().replace(/^\.+|\.+$/g, "") || null;
export const cnameTarget = () => String(process.env.CUSTOM_DOMAIN_CNAME_TARGET || "").toLowerCase().replace(/\.+$/, "") || null;

// Two-part public suffixes, so "brand.co.uk" counts as a root (apex) domain.
const TWO_PART_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz", "com.bd", "net.bd", "org.bd",
  "co.in", "net.in", "org.in", "com.br", "com.mx", "co.za", "com.sg", "com.my", "com.pk", "com.ng", "co.jp", "com.tr", "com.cn",
]);

/** The root (apex) part of a hostname: app.brand.co.uk → brand.co.uk. */
export function registrableDomain(host) {
  const parts = host.split(".");
  const lastTwo = parts.slice(-2).join(".");
  return TWO_PART_SUFFIXES.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

export function isApexDomain(host) {
  return registrableDomain(host) === host;
}

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

/** Cleans what the reseller typed into a bare hostname, or throws a 400 with a readable reason. */
export function normalizeHostname(input) {
  let host = String(input || "").trim().toLowerCase();
  if (!host) return null;
  host = host.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/\.+$/, "");
  if (host.startsWith("*.")) throw badRequest("Wildcard domains aren't supported — enter one domain, e.g. app.yourbrand.com");
  if (net.isIP(host)) throw badRequest("Enter a domain name, not an IP address");
  if (host.length > 253 || !/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(host) || !/\.[a-z]{2,63}$/.test(host)) {
    throw badRequest(`"${input}" isn't a valid domain — use something like app.yourbrand.com`);
  }
  const root = appRootDomain();
  if (root && (host === root || host.endsWith(`.${root}`))) {
    throw badRequest(`That's part of the platform's own domain — use the subdomain field for ${root} addresses`);
  }
  const frontend = (() => { try { return new URL(process.env.FRONTEND_URL).hostname; } catch { return null; } })();
  if (host === "localhost" || (frontend && host === frontend)) throw badRequest("That domain belongs to the platform");
  return host;
}

/** The DNS records shown to the reseller for their domain. */
export function buildDnsRecords(host, cfHostname = null) {
  const target = cnameTarget();
  const apex = isApexDomain(host);
  const root = registrableDomain(host);
  const relative = (fqdn) => (fqdn === root ? "@" : fqdn.slice(0, -(root.length + 1)));
  const records = [];
  if (target) {
    records.push({
      type: "CNAME",
      name: relative(host),
      fqdn: host,
      value: target,
      required: true,
      purpose: apex
        ? "Points your domain to us. Your root domain needs a DNS provider that supports CNAME flattening / ALIAS (Cloudflare, Namecheap, DNSimple…). Otherwise use a subdomain like app."
        : "Points your domain to us",
    });
  }
  const own = cfHostname?.ownership_verification;
  if (own?.name && own?.value) {
    records.push({
      type: (own.type || "txt").toUpperCase(), name: relative(own.name), fqdn: own.name, value: own.value, required: false,
      purpose: "Proves you own the domain. Optional, but add it if your domain is on Cloudflare (orange cloud) or if activation takes long.",
    });
  }
  for (const r of cfHostname?.ssl?.validation_records || []) {
    if (r.txt_name && r.txt_value) {
      records.push({ type: "TXT", name: relative(r.txt_name), fqdn: r.txt_name, value: r.txt_value, required: false, purpose: "SSL certificate validation" });
    }
  }
  return records;
}

// ─── Tailored DNS setup (shown while the reseller types their domain) ─────────

/** Optional: fixed IPs a ROOT domain can point A records at (Cloudflare "Apex Proxying", or your server in manual mode). */
export const apexIps = () => String(process.env.CUSTOM_DOMAIN_APEX_IPS || "").split(",").map((s) => s.trim()).filter((s) => net.isIP(s));

// Where the domain's DNS is hosted, recognised from its nameservers. `apex`:
// how a ROOT domain can point at a hostname there — "flatten" (a CNAME on @
// is flattened automatically), "alias" (an ALIAS / ANAME record), or false.
const PROVIDERS = [
  { match: /\.ns\.cloudflare\.com$/, id: "cloudflare", name: "Cloudflare", apex: "flatten", where: "Cloudflare dashboard → your domain → DNS → Records → Add record" },
  { match: /domaincontrol\.com$/, id: "godaddy", name: "GoDaddy", apex: false, where: "GoDaddy → My Products → your domain → DNS → Add New Record" },
  { match: /registrar-servers\.com$/, id: "namecheap", name: "Namecheap", apex: "alias", where: "Namecheap → Domain List → Manage → Advanced DNS → Add New Record" },
  { match: /awsdns/, id: "route53", name: "Amazon Route 53", apex: false, where: "AWS console → Route 53 → Hosted zones → your domain → Create record" },
  { match: /(googledomains\.com|ns-cloud-[a-z0-9]+\.googledomains\.com)$/, id: "google", name: "Google Cloud DNS", apex: false, where: "Google Cloud console → Network services → Cloud DNS → your zone → Add standard" },
  { match: /digitalocean\.com$/, id: "digitalocean", name: "DigitalOcean", apex: false, where: "DigitalOcean → Networking → Domains → your domain" },
  { match: /azure-dns\./, id: "azure", name: "Azure DNS", apex: false, where: "Azure portal → DNS zones → your domain → + Record set" },
  { match: /dnsimple/, id: "dnsimple", name: "DNSimple", apex: "alias", where: "DNSimple → your domain → DNS → Add record" },
  { match: /porkbun\.com$/, id: "porkbun", name: "Porkbun", apex: "alias", where: "Porkbun → Domain Management → your domain → DNS" },
  { match: /name\.com$/, id: "namecom", name: "Name.com", apex: "alias", where: "Name.com → My Domains → your domain → Manage DNS Records" },
  { match: /nsone\.net$/, id: "ns1", name: "NS1", apex: "alias", where: "NS1 portal → Zones → your domain → Add record" },
  { match: /dnsmadeeasy\.com$/, id: "dnsmadeeasy", name: "DNS Made Easy", apex: "alias", where: "DNS Made Easy → your domain → Records" },
  { match: /vercel-dns\.com$/, id: "vercel", name: "Vercel", apex: "alias", where: "Vercel → Domains → your domain → DNS Records" },
  { match: /(dns-parking\.com|hostinger)/, id: "hostinger", name: "Hostinger", apex: null, where: "Hostinger hPanel → Domains → your domain → DNS / Nameservers" },
];

const resolver = new dns.Resolver({ timeout: 3000, tries: 1 });
resolver.setServers(["1.1.1.1", "8.8.8.8"]); // public resolvers: fresh answers, not this server's cache
const q = (fn, name) => resolver[fn](name).catch(() => []);

async function detectProvider(root) {
  const ns = (await q("resolveNs", root)).map((n) => n.toLowerCase().replace(/\.$/, ""));
  const p = PROVIDERS.find((x) => ns.some((n) => x.match.test(n)));
  return p ? { id: p.id, name: p.name, apex: p.apex, where: p.where, nameservers: ns } : { id: "unknown", name: null, apex: null, where: null, nameservers: ns };
}

const sameSet = (a, b) => a.length > 0 && b.length > 0 && a.every((x) => b.includes(x));

/**
 * Everything the reseller must set up at their DNS for `host`, checked
 * against what is live right now:
 *   { host, root, isApex, provider, method, records[{type,name,value,required,purpose,state,current}],
 *     steps[], warnings[], alternative }
 * `state`: ok | wrong | missing | unknown. `cfRecords` = the saved domain's
 * Cloudflare TXT records (known only after it's registered).
 */
export async function planDomainSetup(host, { cfRecords = [] } = {}) {
  const target = cnameTarget();
  const root = registrableDomain(host);
  const isApex = root === host;
  const relative = (fqdn) => (fqdn === root ? "@" : fqdn.slice(0, -(root.length + 1)));
  const provider = await detectProvider(root);
  const ips = apexIps();

  const [curCname, curA, targetA] = await Promise.all([q("resolveCname", host), q("resolve4", host), target ? q("resolve4", target) : []]);
  const cnameNow = curCname[0]?.toLowerCase().replace(/\.$/, "") || null;

  const records = [];
  const steps = [];
  const warnings = [];
  let method;
  let alternative = null;

  if (!target && !ips.length) {
    return { host, root, isApex, provider, method: "NOT_CONFIGURED", records, steps, alternative, warnings: ["The platform administrator hasn't set the DNS target for custom domains yet — contact support."] };
  }

  if (!isApex) {
    method = "CNAME";
    const state = cnameNow === target ? "ok" : cnameNow ? "wrong" : sameSet(curA, targetA) ? "ok" : curA.length ? "wrong" : "missing";
    records.push({
      type: "CNAME", name: relative(host), fqdn: host, value: target, required: true, state,
      current: cnameNow || (curA.length ? `A ${curA.join(", ")}` : null),
      purpose: "Points your domain to us",
    });
    if (curA.length && !cnameNow && state !== "ok") warnings.push(`${host} currently has an A record (${curA.join(", ")}). Delete it — a name can't have both an A and a CNAME record.`);
    const [mx, txt] = await Promise.all([q("resolveMx", host), q("resolveTxt", host)]);
    if ((mx.length || txt.length) && state !== "ok") {
      warnings.push(`${host} also has ${[mx.length ? "MX (email)" : null, txt.length ? "TXT" : null].filter(Boolean).join(" and ")} records. A CNAME can't share its name with other records — use a different subdomain (e.g. app.${root}) if you need them.`);
    }
  } else if (ips.length) {
    method = "A";
    const state = sameSet(curA, ips) && curA.length === ips.length ? "ok" : curA.length ? "wrong" : "missing";
    for (const ip of ips) {
      records.push({ type: "A", name: "@", fqdn: host, value: ip, required: true, state, current: curA.join(", ") || null, purpose: "Points your root domain to us" });
    }
    if (curA.some((ip) => !ips.includes(ip))) warnings.push(`Remove the other A records on @ (${curA.filter((ip) => !ips.includes(ip)).join(", ")}).`);
  } else if (provider.apex) {
    method = provider.apex === "flatten" ? "FLATTENED_CNAME" : "ALIAS";
    const state = sameSet(curA, targetA) ? "ok" : curA.length || cnameNow ? "wrong" : "missing";
    records.push({
      type: provider.apex === "flatten" ? "CNAME" : "ALIAS", name: "@", fqdn: host, value: target, required: true, state,
      current: cnameNow || (curA.length ? `A ${curA.join(", ")}` : null),
      purpose: provider.apex === "flatten"
        ? `${provider.name} flattens a CNAME on your root domain automatically`
        : `An ALIAS record (${provider.name} may call it ANAME) lets your root domain point at our hostname`,
    });
    if (curA.length && state !== "ok") warnings.push(`Delete the existing A records on @ (${curA.join(", ")}) first.`);
  } else {
    // This DNS host can't point a root domain at a hostname. Offer app.<root>.
    method = "UNSUPPORTED_APEX";
    const alt = `app.${root}`;
    alternative = {
      host: alt,
      reason: provider.name
        ? `${provider.name} can't point a root domain (${root}) at another hostname.`
        : `We couldn't tell whether your DNS provider can point a root domain (${root}) at another hostname — most can't.`,
    };
    records.push({
      type: "CNAME", name: "app", fqdn: alt, value: target, required: true, state: "missing", current: null,
      purpose: `Use ${alt} instead — works with every DNS provider`,
    });
    if (provider.apex === null) {
      records.push({
        type: "ALIAS", name: "@", fqdn: host, value: target, required: false, state: sameSet(curA, targetA) ? "ok" : "unknown", current: curA.join(", ") || null,
        purpose: "Only if your DNS provider offers ALIAS / ANAME / CNAME-flattening records",
      });
    }
  }

  // A root domain that shows a website today would stop showing it.
  if (isApex && curA.length && !sameSet(curA, targetA) && !(ips.length && sameSet(curA, ips))) {
    warnings.push(`${root} points somewhere else today (${curA.join(", ")}) — probably your website. Pointing it here replaces that website. To keep it, use a subdomain such as app.${root}.`);
  }

  for (const r of cfRecords.filter((x) => x.type === "TXT")) records.push({ ...r, state: "unknown", current: null });

  // Step-by-step, in the reseller's own DNS host's words.
  const place = provider.where || `your DNS provider's control panel (where ${root}'s DNS is managed)`;
  steps.push(`Open ${place}.`);
  if (method === "UNSUPPORTED_APEX") steps.push(`Add the CNAME record for app.${root} below, then enter app.${root} as your domain here.`);
  else steps.push(`Add the record${records.filter((r) => r.required).length > 1 ? "s" : ""} below exactly as shown${warnings.length ? ", after fixing the warnings" : ""}.`);
  if (provider.id === "cloudflare") steps.push("Set the record's Proxy status to “DNS only” (grey cloud) — the orange cloud stops us from issuing your SSL certificate.");
  if (cfRecords.some((r) => r.type === "TXT")) steps.push("The TXT record is optional — add it if the domain isn't live after 10–15 minutes.");
  steps.push("Come back here — we check every minute and your domain goes live with SSL automatically, usually within a few minutes (DNS changes can take up to a few hours at some providers).");

  return { host, root, isApex, provider, method, records, steps, warnings, alternative };
}

export function statusFromCloudflare(cf) {
  if (!cf) return { status: "FAILED", ssl: null, error: "The domain is no longer registered with Cloudflare — save it again." };
  const ssl = cf.ssl?.status || null;
  const errors = [
    ...(cf.verification_errors || []),
    ...((cf.ssl?.validation_errors || []).map((e) => e.message || e)),
  ].filter(Boolean);
  if (cf.status === "active" && ssl === "active") return { status: "ACTIVE", ssl, error: null };
  if (["blocked", "deleted", "moved"].includes(cf.status)) return { status: "FAILED", ssl, error: errors[0] || `Cloudflare status: ${cf.status}` };
  return { status: "PENDING", ssl, error: errors[0] || null };
}

async function saveStatus(agencyId, { status, ssl = null, error = null, records }) {
  const sets = ["domain_status = ?", "domain_ssl_status = ?", "domain_error = ?", "domain_checked_at = NOW()", "domain_verified = ?"];
  const values = [status, ssl, error ? String(error).slice(0, 500) : null, status === "ACTIVE" ? 1 : 0];
  if (records) { sets.push("domain_dns_records = ?"); values.push(JSON.stringify(records)); }
  await pool.query(`UPDATE agencies SET ${sets.join(", ")} WHERE id = ?`, [...values, agencyId]);
  invalidateCustomDomainCache();
}

/**
 * Saves a (new) custom domain for a workspace: removes the old Cloudflare
 * hostname, registers the new one and stores the records to show. A null
 * host removes the domain.
 */
export async function setWorkspaceDomain(agency, host) {
  if (agency.cf_hostname_id && isCloudflareConfigured()) {
    await deleteCustomHostname(agency.cf_hostname_id).catch((e) => console.error("[custom domain] remove old hostname:", e.message));
  }
  if (!host) {
    await pool.query(
      `UPDATE agencies SET custom_domain = NULL, cf_hostname_id = NULL, domain_status = 'NONE', domain_ssl_status = NULL,
         domain_dns_records = NULL, domain_error = NULL, domain_verified = 0 WHERE id = ?`,
      [agency.id]
    );
    invalidateCustomDomainCache();
    return { status: "NONE", records: [] };
  }

  let cf = null;
  if (isCloudflareConfigured()) cf = await createCustomHostname(host);
  const records = buildDnsRecords(host, cf);
  const s = cf ? statusFromCloudflare(cf) : { status: "PENDING", ssl: null, error: null };
  await pool.query(
    `UPDATE agencies SET custom_domain = ?, cf_hostname_id = ?, domain_status = ?, domain_ssl_status = ?, domain_dns_records = ?,
       domain_error = ?, domain_checked_at = NOW(), domain_verified = ? WHERE id = ?`,
    [host, cf?.id || null, s.status, s.ssl, JSON.stringify(records), s.error, s.status === "ACTIVE" ? 1 : 0, agency.id]
  );
  invalidateCustomDomainCache();
  return { status: s.status, sslStatus: s.ssl, error: s.error, records };
}

/** Manual mode: the domain is live when its CNAME points at the target (or it resolves to the same addresses). */
async function checkDnsManually(host) {
  const target = cnameTarget();
  const ips = apexIps();
  if (ips.length && isApexDomain(host)) {
    const current = await dns.resolve4(host).catch(() => []);
    return sameSet(current, ips) ? { ok: true } : { ok: false, error: `${host} doesn't point to ${ips.join(", ")} yet.` };
  }
  const cnames = await dns.resolveCname(host).catch(() => []);
  if (target && cnames.some((c) => c.toLowerCase().replace(/\.$/, "") === target)) return { ok: true };
  if (target) {
    const [mine, theirs] = await Promise.all([dns.resolve4(target).catch(() => []), dns.resolve4(host).catch(() => [])]);
    if (mine.length && theirs.length && theirs.every((ip) => mine.includes(ip))) return { ok: true };
    return { ok: false, error: cnames.length ? `${host} points to ${cnames[0]}, not ${target}` : `No CNAME record for ${host} yet — DNS changes can take a few minutes.` };
  }
  const any = cnames.length || (await dns.resolve4(host).catch(() => [])).length;
  return any ? { ok: true } : { ok: false, error: `${host} doesn't resolve yet — DNS changes can take a few minutes.` };
}

/** Re-checks one workspace's domain (Cloudflare, or DNS in manual mode). `retrigger` asks Cloudflare to validate again. */
export async function refreshWorkspaceDomain(agency, { retrigger = false } = {}) {
  if (!agency.custom_domain) return { status: "NONE" };
  if (agency.cf_hostname_id && isCloudflareConfigured()) {
    let cf = await getCustomHostname(agency.cf_hostname_id);
    if (cf && retrigger && cf.status !== "active") cf = await revalidateCustomHostname(agency.cf_hostname_id).catch(() => cf);
    const s = statusFromCloudflare(cf);
    const records = cf ? buildDnsRecords(agency.custom_domain, cf) : undefined;
    await saveStatus(agency.id, { status: s.status, ssl: s.ssl, error: s.error, records });
    return { status: s.status, sslStatus: s.ssl, error: s.error, records };
  }
  if (isCloudflareConfigured() && !agency.cf_hostname_id) {
    // Saved before Cloudflare was set up — register it now.
    return setWorkspaceDomain(agency, agency.custom_domain);
  }
  const dnsCheck = await checkDnsManually(agency.custom_domain);
  const status = dnsCheck.ok ? "ACTIVE" : "PENDING";
  await saveStatus(agency.id, { status, error: dnsCheck.error || null });
  return { status, error: dnsCheck.error || null };
}

// ─── Allowed browser origins (CORS) ──────────────────────────────────────────

let activeDomains = null;
let loadedAt = 0;
export function invalidateCustomDomainCache() {
  activeDomains = null;
}
async function loadActiveDomains() {
  if (activeDomains && Date.now() - loadedAt < 60_000) return activeDomains;
  const [rows] = await pool.query("SELECT custom_domain FROM agencies WHERE custom_domain IS NOT NULL AND domain_status = 'ACTIVE' AND is_active = 1");
  activeDomains = new Set(rows.map((r) => r.custom_domain.toLowerCase()));
  loadedAt = Date.now();
  return activeDomains;
}

/** A browser origin on a live reseller domain, or on a subdomain of the platform. */
export async function isWhiteLabelOrigin(origin) {
  let host;
  try { host = new URL(origin).hostname.toLowerCase(); } catch { return false; }
  const root = appRootDomain();
  if (root && (host === root || host.endsWith(`.${root}`))) return true;
  return (await loadActiveDomains()).has(host);
}

// ─── Background check ────────────────────────────────────────────────────────

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    // Pending: every minute. Active: every 6 hours (catches a removed CNAME).
    const [rows] = await pool.query(
      `SELECT * FROM agencies WHERE custom_domain IS NOT NULL AND is_active = 1 AND (
         (domain_status = 'PENDING' AND (domain_checked_at IS NULL OR domain_checked_at < NOW() - INTERVAL 50 SECOND))
         OR (domain_status = 'ACTIVE' AND cf_hostname_id IS NOT NULL AND (domain_checked_at IS NULL OR domain_checked_at < NOW() - INTERVAL 6 HOUR))
       ) ORDER BY domain_checked_at IS NULL DESC, domain_checked_at ASC LIMIT 25`
    );
    for (const agency of rows) {
      try {
        const before = agency.domain_status;
        const r = await refreshWorkspaceDomain(agency);
        if (before !== r.status) console.log(`🌐 Custom domain ${agency.custom_domain} (agency ${agency.id}): ${before} → ${r.status}`);
      } catch (err) {
        console.error(`[custom domain] check of ${agency.custom_domain} failed:`, err.message);
        await pool.query("UPDATE agencies SET domain_checked_at = NOW() WHERE id = ?", [agency.id]).catch(() => {});
      }
    }
  } catch (err) {
    console.error("[custom domain] scheduler error:", err.message);
  } finally {
    running = false;
  }
}

export function startCustomDomainScheduler() {
  console.log(`🌐 Custom domain checker started (${isCloudflareConfigured() ? "Cloudflare for SaaS" : "manual DNS mode — set CLOUDFLARE_API_TOKEN / CLOUDFLARE_ZONE_ID for automatic SSL"})`);
  setTimeout(lockedJob("custom-domains", tick), 20_000);
  setInterval(lockedJob("custom-domains", tick), 60_000);
}
