/**
 * White-label settings: custom domain, platform subdomain, branding (logos,
 * favicon, name, colours, support email) and sign-up switch.
 *
 * Who: a Reseller (account_type RESELLER) for its own brand, and the Super
 * Admin (PLATFORM) for the main domain's branding. End User workspaces and a
 * reseller's customers have no white-label settings.
 *
 *   GET    /agency/domain                        settings + live domain status + DNS records
 *   PUT    /agency/domain                        { customDomain, subdomain, allowUserRegistration, branding }
 *   POST   /agency/domain/verify                 check now (Cloudflare / DNS)
 *   DELETE /agency/domain/custom                 remove the custom domain
 *   POST   /agency/domain/branding/:kind         upload logo | logoIcon | favicon (multipart "file")
 *   DELETE /agency/domain/branding/:kind         remove it
 *   GET    /admin/custom-domains/setup           Super Admin: Cloudflare for SaaS setup check
 *
 * Domain logic: utils/customDomains.js (Cloudflare: utils/cloudflareSaas.js).
 */
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import {
  normalizeHostname, setWorkspaceDomain, refreshWorkspaceDomain, appRootDomain, cnameTarget, isApexDomain, buildDnsRecords, planDomainSetup,
} from "../utils/customDomains.js";
import { isCloudflareConfigured, getFallbackOrigin } from "../utils/cloudflareSaas.js";

const router = express.Router();
const owner = [authMiddleware, roleMiddleware("RESELLER", "ADMIN")];

const agencyOf = (req) => req.tenant?.agencyId ?? req.user.agencyId;
const fail = (res, err, fallback = "Server error") => {
  if (!err.status) console.error("[domains]", err);
  return res.status(err.status || 500).json({ success: false, message: err.status ? err.message : fallback });
};
const httpError = (status, message) => Object.assign(new Error(message), { status });

const RESERVED_SUBDOMAINS = new Set([
  "www", "app", "api", "admin", "mail", "smtp", "ftp", "cdn", "static", "assets", "dashboard", "login", "auth",
  "support", "help", "docs", "blog", "forum", "status", "customers", "webhook", "webhooks", "ns1", "ns2",
]);

const BRANDING_KEYS = ["brandName", "tagline", "logoUrl", "logoIconUrl", "faviconUrl", "primaryColor", "supportEmail", "copyrightText"];
const ASSET_KEYS = { logo: "logoUrl", logoIcon: "logoIconUrl", favicon: "faviconUrl" };

function parseJson(v, fallback) {
  if (!v) return fallback;
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

/** The caller's workspace, and whether it may use white-label settings. */
async function loadWorkspace(req) {
  const [[agency]] = await pool.query("SELECT * FROM agencies WHERE id = ?", [agencyOf(req)]);
  if (!agency) throw httpError(404, "Workspace not found");
  const isPlatform = agency.account_type === "PLATFORM";
  if (agency.account_type !== "RESELLER" && !isPlatform) {
    throw httpError(403, "Custom domains and branding are available to reseller accounts.");
  }
  return { agency, isPlatform };
}

function cleanBranding(input = {}, current = {}) {
  const out = { ...current };
  for (const key of BRANDING_KEYS) {
    if (input[key] === undefined) continue;
    const v = String(input[key] ?? "").trim();
    if (key === "primaryColor") {
      if (v && !/^#[0-9a-f]{6}$/i.test(v)) throw httpError(400, "Brand colour must be a hex colour like #2563eb");
      out[key] = v || null;
    } else if (key.endsWith("Url")) {
      // Only our own uploads or an https image link.
      if (v && !/^\/uploads\/branding\/[\w.-]+$/.test(v) && !/^https:\/\/[^\s"'<>]+$/i.test(v)) throw httpError(400, "Upload the image, or use an https:// link");
      out[key] = v || null;
    } else if (key === "supportEmail") {
      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw httpError(400, "Support email isn't a valid address");
      out[key] = v || null;
    } else {
      out[key] = v.slice(0, key === "copyrightText" ? 200 : 120) || null;
    }
  }
  return out;
}

function toConfig(agency, isPlatform) {
  const branding = parseJson(agency.custom_branding, {});
  const root = appRootDomain();
  return {
    agencyId: agency.id,
    agencyName: agency.name,
    accountType: agency.account_type,
    isPlatform,
    customDomain: agency.custom_domain,
    subdomain: agency.subdomain,
    subdomainHost: root && agency.subdomain ? `${agency.subdomain}.${root}` : null,
    appRootDomain: root,
    domainStatus: agency.domain_status || "NONE",
    sslStatus: agency.domain_ssl_status,
    domainError: agency.domain_error,
    domainCheckedAt: agency.domain_checked_at,
    domainVerified: Boolean(agency.domain_verified),
    dnsRecords: parseJson(agency.domain_dns_records, null) || (agency.custom_domain ? buildDnsRecords(agency.custom_domain) : []),
    isApex: agency.custom_domain ? isApexDomain(agency.custom_domain) : false,
    cnameTarget: cnameTarget(),
    cloudflareConfigured: isCloudflareConfigured(),
    allowUserRegistration: agency.allow_user_registration !== 0,
    branding: {
      brandName: branding.brandName || agency.name || "",
      tagline: branding.tagline || "",
      logoUrl: branding.logoUrl || agency.logo || "",
      logoIconUrl: branding.logoIconUrl || "",
      faviconUrl: branding.faviconUrl || "",
      primaryColor: branding.primaryColor || "#2563eb",
      supportEmail: branding.supportEmail || "",
      copyrightText: branding.copyrightText || "",
    },
  };
}

// ─── Settings ────────────────────────────────────────────────────────────────
router.get("/agency/domain", ...owner, async (req, res) => {
  try {
    const { agency, isPlatform } = await loadWorkspace(req);
    return res.json({ success: true, domainConfig: toConfig(agency, isPlatform) });
  } catch (err) {
    return fail(res, err);
  }
});

// What the reseller must set up at their DNS for the domain they're typing
// (subdomain vs root domain, their DNS provider, what's live right now).
// Nothing is saved. The saved domain also gets its Cloudflare TXT records.
router.get("/agency/domain/dns-preview", ...owner, async (req, res) => {
  try {
    const { agency, isPlatform } = await loadWorkspace(req);
    if (isPlatform) throw httpError(400, "The main domain is set in the server configuration");
    let host;
    try {
      host = normalizeHostname(req.query.domain);
    } catch (err) {
      return res.json({ success: true, valid: false, message: err.message });
    }
    if (!host) return res.json({ success: true, valid: false, message: "" });
    const [[taken]] = await pool.query("SELECT id FROM agencies WHERE custom_domain = ? AND id <> ?", [host, agency.id]);
    if (taken) return res.json({ success: true, valid: false, message: `"${host}" is already connected to another workspace.` });
    const saved = host === agency.custom_domain ? parseJson(agency.domain_dns_records, []) : [];
    const plan = await planDomainSetup(host, { cfRecords: saved });
    return res.json({ success: true, valid: true, saved: host === agency.custom_domain, plan });
  } catch (err) {
    return fail(res, err);
  }
});

router.put("/agency/domain", ...owner, async (req, res) => {
  try {
    let { agency, isPlatform } = await loadWorkspace(req);
    const body = req.body || {};

    // Platform subdomain (<sub>.APP_ROOT_DOMAIN) — resellers only.
    let subdomain = agency.subdomain;
    if (!isPlatform && body.subdomain !== undefined) {
      subdomain = String(body.subdomain || "").toLowerCase().trim().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "") || null;
      if (subdomain && (subdomain.length < 3 || subdomain.length > 40)) throw httpError(400, "Subdomain must be 3–40 letters, numbers or dashes");
      if (subdomain && RESERVED_SUBDOMAINS.has(subdomain)) throw httpError(400, `"${subdomain}" is reserved — choose another`);
      if (subdomain) {
        const [[clash]] = await pool.query("SELECT id FROM agencies WHERE (subdomain = ? OR slug = ?) AND id <> ?", [subdomain, subdomain, agency.id]);
        if (clash) throw httpError(400, `Subdomain "${subdomain}" is already in use. Please choose another.`);
      }
    }

    const branding = cleanBranding(body.branding || {}, parseJson(agency.custom_branding, {}));
    await pool.query(
      "UPDATE agencies SET subdomain = ?, custom_branding = ?, allow_user_registration = ? WHERE id = ?",
      [subdomain, JSON.stringify(branding), body.allowUserRegistration === false ? 0 : 1, agency.id]
    );

    // Custom domain — resellers only (the main domain is the platform's own, set in the server config).
    let domainResult = null;
    if (!isPlatform && body.customDomain !== undefined) {
      const host = normalizeHostname(body.customDomain);
      if (host !== (agency.custom_domain || null)) {
        if (host) {
          const [[taken]] = await pool.query("SELECT id FROM agencies WHERE custom_domain = ? AND id <> ?", [host, agency.id]);
          if (taken) throw httpError(400, `Domain "${host}" is already connected to another workspace.`);
        }
        domainResult = await setWorkspaceDomain(agency, host);
      }
    }

    [[agency]] = await pool.query("SELECT * FROM agencies WHERE id = ?", [agency.id]);
    return res.json({
      success: true,
      message: domainResult?.records?.length
        ? "Saved. Add the DNS record below at your domain provider — your domain goes live automatically once it's detected."
        : "White-label settings saved.",
      domainConfig: toConfig(agency, isPlatform),
      domainVerified: Boolean(agency.domain_verified),
    });
  } catch (err) {
    return fail(res, err, "Failed to update domain settings");
  }
});

router.post("/agency/domain/verify", ...owner, async (req, res) => {
  try {
    const { agency, isPlatform } = await loadWorkspace(req);
    if (isPlatform || !agency.custom_domain) throw httpError(400, "No custom domain configured to check");
    const r = await refreshWorkspaceDomain(agency, { retrigger: true });
    const [[fresh]] = await pool.query("SELECT * FROM agencies WHERE id = ?", [agency.id]);
    return res.json({
      success: true,
      isVerified: r.status === "ACTIVE",
      message: r.status === "ACTIVE"
        ? `🎉 ${agency.custom_domain} is live with SSL.`
        : r.error || "Not live yet — the DNS record hasn't been detected. It usually takes a few minutes after you add it.",
      domainConfig: toConfig(fresh, isPlatform),
    });
  } catch (err) {
    return fail(res, err, "Verification check failed");
  }
});

router.delete("/agency/domain/custom", ...owner, async (req, res) => {
  try {
    const { agency, isPlatform } = await loadWorkspace(req);
    if (isPlatform) throw httpError(400, "The main domain is set in the server configuration");
    await setWorkspaceDomain(agency, null);
    const [[fresh]] = await pool.query("SELECT * FROM agencies WHERE id = ?", [agency.id]);
    return res.json({ success: true, message: "Custom domain removed", domainConfig: toConfig(fresh, isPlatform) });
  } catch (err) {
    return fail(res, err);
  }
});

// ─── Logos & favicon ─────────────────────────────────────────────────────────
const brandingUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

/** Real image type from the file's first bytes (never trust the name / mime). No SVG: it can carry script. */
function sniffImage(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buf.length > 4 && buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return "ico";
  return null;
}

router.post("/agency/domain/branding/:kind", ...owner, (req, res, next) => {
  brandingUpload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.code === "LIMIT_FILE_SIZE" ? "The image must be 2 MB or smaller" : err.message });
    return next();
  });
}, async (req, res) => {
  try {
    const key = ASSET_KEYS[req.params.kind];
    if (!key) throw httpError(404, "Unknown image type");
    const { agency } = await loadWorkspace(req);
    if (!req.file?.buffer?.length) throw httpError(400, "Choose an image to upload");
    const ext = sniffImage(req.file.buffer);
    if (!ext) throw httpError(400, "Use a PNG, JPG, WEBP or ICO image");
    if (req.params.kind !== "favicon" && ext === "ico") throw httpError(400, "Use a PNG, JPG or WEBP image for logos");

    const dir = path.resolve("uploads", "branding");
    fs.mkdirSync(dir, { recursive: true });
    const name = `${agency.id}-${req.params.kind}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
    fs.writeFileSync(path.join(dir, name), req.file.buffer);

    const branding = parseJson(agency.custom_branding, {});
    const previous = branding[key];
    branding[key] = `/uploads/branding/${name}`;
    await pool.query("UPDATE agencies SET custom_branding = ? WHERE id = ?", [JSON.stringify(branding), agency.id]);
    removeOwnAsset(previous, agency.id);
    return res.json({ success: true, url: branding[key], key });
  } catch (err) {
    return fail(res, err, "Upload failed");
  }
});

router.delete("/agency/domain/branding/:kind", ...owner, async (req, res) => {
  try {
    const key = ASSET_KEYS[req.params.kind];
    if (!key) throw httpError(404, "Unknown image type");
    const { agency } = await loadWorkspace(req);
    const branding = parseJson(agency.custom_branding, {});
    const previous = branding[key];
    delete branding[key];
    await pool.query("UPDATE agencies SET custom_branding = ? WHERE id = ?", [JSON.stringify(branding), agency.id]);
    removeOwnAsset(previous, agency.id);
    return res.json({ success: true });
  } catch (err) {
    return fail(res, err);
  }
});

/** Deletes a replaced image — only this workspace's own uploads. */
function removeOwnAsset(url, agencyId) {
  const m = /^\/uploads\/branding\/([\w.-]+)$/.exec(url || "");
  if (!m || !m[1].startsWith(`${agencyId}-`)) return;
  fs.promises.unlink(path.resolve("uploads", "branding", m[1])).catch(() => {});
}

// ─── Super Admin: Cloudflare for SaaS setup check ────────────────────────────
router.get("/admin/custom-domains/setup", authMiddleware, roleMiddleware("ADMIN"), async (req, res) => {
  const out = {
    success: true,
    cloudflareConfigured: isCloudflareConfigured(),
    appRootDomain: appRootDomain(),
    cnameTarget: cnameTarget(),
    fallbackOrigin: null,
    error: null,
  };
  if (out.cloudflareConfigured) {
    try {
      out.fallbackOrigin = await getFallbackOrigin();
    } catch (err) {
      out.error = err.message;
    }
  }
  const [[counts]] = await pool.query(
    "SELECT SUM(domain_status = 'ACTIVE') AS active, SUM(domain_status = 'PENDING') AS pending, SUM(domain_status = 'FAILED') AS failed FROM agencies WHERE custom_domain IS NOT NULL AND account_type = 'RESELLER'"
  );
  out.domains = { active: Number(counts.active || 0), pending: Number(counts.pending || 0), failed: Number(counts.failed || 0) };
  return res.json(out);
});

export default router;
