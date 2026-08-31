import express from "express";
import dns from "dns/promises";
import axios from "axios";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = express.Router();

// ─── GET CURRENT AGENCY DOMAIN & WHITE-LABEL CONFIG ──────────────────────────
router.get("/agency/domain", authMiddleware, roleMiddleware("AGENCY", "ADMIN"), async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query(
      `SELECT id, name, slug, custom_domain, subdomain, domain_verified, custom_branding, allow_user_registration
       FROM agencies WHERE id = ?`,
      [agencyId]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "Agency not found" });
    }

    const agency = rows[0];
    let branding = {};
    try {
      branding = typeof agency.custom_branding === "string"
        ? JSON.parse(agency.custom_branding || "{}")
        : agency.custom_branding || {};
    } catch {
      branding = {};
    }

    return res.json({
      success: true,
      domainConfig: {
        agencyId: agency.id,
        agencyName: agency.name,
        slug: agency.slug,
        customDomain: agency.custom_domain,
        subdomain: agency.subdomain,
        domainVerified: Boolean(agency.domain_verified),
        allowUserRegistration: Boolean(agency.allow_user_registration),
        branding: {
          brandName: branding.brandName || agency.name || "My Workspace",
          tagline: branding.tagline || "Multi-channel AI Chatbot & Live Support",
          logoUrl: branding.logoUrl || agency.logo || "",
          faviconUrl: branding.faviconUrl || "",
          primaryColor: branding.primaryColor || "#2563eb",
          supportEmail: branding.supportEmail || "",
          copyrightText: branding.copyrightText || `© ${new Date().getFullYear()} ${agency.name}. All rights reserved.`,
        },
      },
    });
  } catch (err) {
    console.error("Get agency domain error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── UPDATE AGENCY DOMAIN & WHITE-LABEL CONFIG ───────────────────────────────
router.put("/agency/domain", authMiddleware, roleMiddleware("AGENCY", "ADMIN"), async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const {
      customDomain,
      subdomain,
      allowUserRegistration = true,
      branding = {},
    } = req.body;

    // Clean domains
    const cleanCustomDomain = customDomain ? customDomain.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/+$/, "") : null;
    const cleanSubdomain = subdomain ? subdomain.toLowerCase().trim().replace(/[^a-z0-9-]/g, "") : null;

    // Check custom domain collision
    if (cleanCustomDomain) {
      const [existingDomain] = await pool.query(
        "SELECT id FROM agencies WHERE custom_domain = ? AND id != ?",
        [cleanCustomDomain, agencyId]
      );
      if (existingDomain.length) {
        return res.status(400).json({ success: false, message: `Domain "${cleanCustomDomain}" is already connected to another workspace.` });
      }
    }

    // Check subdomain collision
    if (cleanSubdomain) {
      const [existingSub] = await pool.query(
        "SELECT id FROM agencies WHERE subdomain = ? AND id != ?",
        [cleanSubdomain, agencyId]
      );
      if (existingSub.length) {
        return res.status(400).json({ success: false, message: `Subdomain "${cleanSubdomain}" is already in use. Please choose another.` });
      }
    }

    // Reset verified status if domain changed
    const [current] = await pool.query("SELECT custom_domain, domain_verified FROM agencies WHERE id = ?", [agencyId]);
    let verified = current.length ? current[0].domain_verified : 0;
    if (current.length && current[0].custom_domain !== cleanCustomDomain) {
      verified = 0; // Requires re-verification
    }

    await pool.query(
      `UPDATE agencies
       SET custom_domain = ?, subdomain = ?, domain_verified = ?, custom_branding = ?, allow_user_registration = ?
       WHERE id = ?`,
      [
        cleanCustomDomain,
        cleanSubdomain,
        verified,
        JSON.stringify(branding),
        allowUserRegistration ? 1 : 0,
        agencyId,
      ]
    );

    return res.json({
      success: true,
      message: "Custom domain and branding settings saved successfully!",
      domainVerified: Boolean(verified),
    });
  } catch (err) {
    console.error("Update agency domain error:", err);
    return res.status(500).json({ success: false, message: "Failed to update domain settings" });
  }
});

// ─── VERIFY CUSTOM DOMAIN DNS ────────────────────────────────────────────────
router.post("/agency/domain/verify", authMiddleware, roleMiddleware("AGENCY", "ADMIN"), async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query("SELECT custom_domain FROM agencies WHERE id = ?", [agencyId]);

    if (!rows.length || !rows[0].custom_domain) {
      return res.status(400).json({ success: false, message: "No custom domain configured to verify" });
    }

    const domain = rows[0].custom_domain;
    let isVerified = false;
    let verifyMsg = "";

    try {
      // 1. Attempt CNAME or A record DNS lookup
      const cnames = await dns.resolveCname(domain).catch(() => []);
      const aRecords = await dns.resolve4(domain).catch(() => []);

      if (cnames.length > 0 || aRecords.length > 0) {
        isVerified = true;
        verifyMsg = `Domain ${domain} resolved successfully (${cnames.length > 0 ? 'CNAME' : 'A record'} detected)!`;
      } else {
        // Fallback HTTP check
        const httpRes = await axios.get(`http://${domain}`, { timeout: 4000 }).catch(() => null);
        if (httpRes) {
          isVerified = true;
          verifyMsg = `Domain ${domain} responded over HTTP!`;
        } else {
          verifyMsg = `DNS records for ${domain} not detected yet. DNS changes can take a few minutes to propagate worldwide.`;
        }
      }
    } catch (e) {
      verifyMsg = `DNS lookup for ${domain} returned: ${e.code || e.message}. Please ensure your CNAME record is configured.`;
    }

    if (isVerified) {
      await pool.query("UPDATE agencies SET domain_verified = 1 WHERE id = ?", [agencyId]);
    }

    return res.json({
      success: true,
      isVerified,
      message: verifyMsg,
    });
  } catch (err) {
    console.error("Domain verify error:", err);
    return res.status(500).json({ success: false, message: "Verification check failed" });
  }
});

export default router;
