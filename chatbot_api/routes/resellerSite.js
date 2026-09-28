/**
 * Reseller landing pages (migrate_docs_and_sites.js → reseller_sites).
 *
 *   GET /public/site?host=      public: what the address shows — the main
 *                               platform site, or a Reseller's own landing page
 *                               (its brand, its content and ITS OWN plans from
 *                               agency_packages; the platform's pricing is
 *                               never mixed in).
 *   GET/PUT /reseller/site      the Reseller owner edits its landing page.
 *
 * Only a RESELLER workspace has a landing page. Scope comes from req.tenant,
 * never from the request body.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { brandOf } from "./auth.js";
import { requestSiteHost, siteAgencyFor } from "../utils/siteContext.js";
import { appRootDomain } from "../utils/customDomains.js";

const router = express.Router();

const DEFAULTS = {
  isEnabled: true,
  headline: "",
  subheadline: "",
  heroImage: "",
  ctaLabel: "Get started",
  features: [],
  faqs: [],
  showPricing: true,
  showDocs: true,
  docsUrl: "",
  footerText: "",
};
const LIMITS = { features: 12, faqs: 20 };

const parseJson = (v, fallback) => { if (!v) return fallback; if (typeof v === "object") return v; try { return JSON.parse(v); } catch { return fallback; } };
const text = (v, max) => String(v ?? "").trim().slice(0, max);

function toSite(row) {
  if (!row) return { ...DEFAULTS };
  return {
    isEnabled: Boolean(row.is_enabled),
    headline: row.headline || "",
    subheadline: row.subheadline || "",
    heroImage: row.hero_image || "",
    ctaLabel: row.cta_label || DEFAULTS.ctaLabel,
    features: parseJson(row.features, []),
    faqs: parseJson(row.faqs, []),
    showPricing: Boolean(row.show_pricing),
    showDocs: Boolean(row.show_docs),
    docsUrl: row.docs_url || "",
    footerText: row.footer_text || "",
  };
}

const safeLink = (v) => {
  const s = text(v, 512);
  if (!s) return "";
  if (s.startsWith("/uploads/") || /^https:\/\/[^\s]+$/i.test(s)) return s;
  return null;
};

function cleanSite(body = {}) {
  const errors = [];
  const heroImage = safeLink(body.heroImage);
  if (heroImage === null) errors.push("The hero image must be an uploaded image or an https:// link.");
  const docsUrl = safeLink(body.docsUrl);
  if (docsUrl === null) errors.push("The documentation link must start with https://.");
  const features = (Array.isArray(body.features) ? body.features : [])
    .map((f) => ({ title: text(f?.title, 80), description: text(f?.description, 300) }))
    .filter((f) => f.title)
    .slice(0, LIMITS.features);
  const faqs = (Array.isArray(body.faqs) ? body.faqs : [])
    .map((f) => ({ q: text(f?.q, 200), a: text(f?.a, 1000) }))
    .filter((f) => f.q && f.a)
    .slice(0, LIMITS.faqs);
  return {
    errors,
    values: {
      is_enabled: body.isEnabled === false ? 0 : 1,
      headline: text(body.headline, 160) || null,
      subheadline: text(body.subheadline, 400) || null,
      hero_image: heroImage || null,
      cta_label: text(body.ctaLabel, 40) || null,
      features: JSON.stringify(features),
      faqs: JSON.stringify(faqs),
      show_pricing: body.showPricing === false ? 0 : 1,
      show_docs: body.showDocs === false ? 0 : 1,
      docs_url: docsUrl || null,
      footer_text: text(body.footerText, 300) || null,
    },
  };
}

/** The Reseller's public plans — its own agency_packages, cheapest first. */
async function publicPlans(agencyId) {
  const [rows] = await pool.query(
    `SELECT id, name, slug, description, price, currency, billing_cycle, is_default,
            max_bot_accounts, max_subscribers, max_team_members, max_monthly_messages, features_summary
       FROM agency_packages WHERE agency_id = ? AND is_active = 1
      ORDER BY price ASC, id ASC LIMIT 12`,
    [agencyId]
  );
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    price: Number(p.price),
    currency: p.currency,
    billingCycle: p.billing_cycle,
    isDefault: Boolean(p.is_default),
    limits: {
      botAccounts: p.max_bot_accounts, subscribers: p.max_subscribers,
      teamMembers: p.max_team_members, monthlyMessages: p.max_monthly_messages,
    },
    features: parseJson(p.features_summary, []),
  }));
}

// ── PUBLIC ────────────────────────────────────────────────────────
router.get("/public/site", async (req, res) => {
  try {
    const agency = await siteAgencyFor(requestSiteHost(req));
    if (!agency || agency.account_type !== "RESELLER") {
      return res.json({ success: true, kind: "MAIN" });
    }
    const [[row]] = await pool.query("SELECT * FROM reseller_sites WHERE agency_id = ?", [agency.id]);
    const site = toSite(row);
    const brand = brandOf(agency);
    return res.json({
      success: true,
      kind: "RESELLER",
      brand,
      site: site.isEnabled ? site : { ...DEFAULTS, isEnabled: false },
      plans: site.isEnabled && site.showPricing ? await publicPlans(agency.id) : [],
      allowRegistration: agency.allow_user_registration !== 0,
    });
  } catch (err) {
    console.error("GET /public/site error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ── RESELLER OWNER ────────────────────────────────────────────────
async function resellerOwnerOnly(req, res, next) {
  const t = req.tenant;
  if (t?.role === "RESELLER" && t?.accountType === "RESELLER") return next();
  return res.status(403).json({ success: false, message: "Only a Reseller's owner can edit its landing page." });
}

router.get("/reseller/site", authMiddleware, resellerOwnerOnly, async (req, res) => {
  try {
    const agencyId = req.tenant.agencyId;
    const [[row]] = await pool.query("SELECT * FROM reseller_sites WHERE agency_id = ?", [agencyId]);
    const [[agency]] = await pool.query("SELECT * FROM agencies WHERE id = ?", [agencyId]);
    return res.json({
      success: true,
      site: toSite(row),
      brand: brandOf(agency),
      plans: await publicPlans(agencyId),
      addresses: {
        subdomain: agency.subdomain || null,
        subdomainHost: agency.subdomain && appRootDomain() ? `${agency.subdomain}.${appRootDomain()}` : null,
        customDomain: agency.domain_verified ? agency.custom_domain : null,
      },
      limits: LIMITS,
    });
  } catch (err) {
    console.error("GET /reseller/site error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/reseller/site", authMiddleware, resellerOwnerOnly, async (req, res) => {
  try {
    const { values, errors } = cleanSite(req.body || {});
    if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });
    const cols = Object.keys(values);
    await pool.query(
      `INSERT INTO reseller_sites (agency_id, ${cols.join(", ")}) VALUES (?, ${cols.map(() => "?").join(", ")})
       ON DUPLICATE KEY UPDATE ${cols.map((c) => `${c} = VALUES(${c})`).join(", ")}`,
      [req.tenant.agencyId, ...cols.map((c) => values[c])]
    );
    const [[row]] = await pool.query("SELECT * FROM reseller_sites WHERE agency_id = ?", [req.tenant.agencyId]);
    return res.json({ success: true, site: toSite(row), message: "Landing page saved" });
  } catch (err) {
    console.error("PUT /reseller/site error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
