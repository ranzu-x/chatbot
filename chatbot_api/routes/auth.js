import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db.js";

const router = express.Router();

// Helper to resolve agency from domain/hostname
async function resolveAgencyFromDomain(rawHost) {
  if (!rawHost) return null;
  const host = rawHost.toLowerCase().trim().replace(/:\d+$/, ""); // Strip port

  // 1. Direct match on custom_domain
  const [domainRows] = await pool.query(
    "SELECT * FROM agencies WHERE custom_domain = ? AND is_active = 1 LIMIT 1",
    [host]
  );
  if (domainRows.length) return domainRows[0];

  // 2. Subdomain match (e.g. "dynasty.nexachat.com" -> "dynasty")
  const parts = host.split(".");
  if (parts.length > 2) {
    const sub = parts[0];
    const [subRows] = await pool.query(
      "SELECT * FROM agencies WHERE (subdomain = ? OR slug = ?) AND is_active = 1 LIMIT 1",
      [sub, sub]
    );
    if (subRows.length) return subRows[0];
  }

  return null;
}

// ─── RESOLVE TENANT & WHITE-LABEL INFO (Public) ──────────────────────────────
router.get("/auth/tenant", async (req, res) => {
  try {
    const host = req.query.domain || req.query.host || req.headers.host || "";
    const matchedAgency = await resolveAgencyFromDomain(host);

    let agency = matchedAgency;
    let isCustomTenant = Boolean(matchedAgency);

    // Fallback to default/main agency
    if (!agency) {
      const [mainRows] = await pool.query("SELECT * FROM agencies WHERE is_active = 1 ORDER BY id ASC LIMIT 1");
      if (mainRows.length) agency = mainRows[0];
    }

    if (!agency) {
      return res.json({
        success: true,
        isCustomTenant: false,
        agency: {
          id: 1,
          name: "Nexa Chatbot",
          brandName: "Nexa Chatbot",
          tagline: "AI & Multi-channel Marketing Workspace",
          logoUrl: "",
          primaryColor: "#2563eb",
          allowUserRegistration: true,
        },
      });
    }

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
      isCustomTenant,
      agency: {
        id: agency.id,
        name: agency.name,
        slug: agency.slug,
        customDomain: agency.custom_domain,
        subdomain: agency.subdomain,
        brandName: branding.brandName || agency.name || "Nexa Chatbot",
        tagline: branding.tagline || "AI & Multi-channel Marketing Workspace",
        logoUrl: branding.logoUrl || agency.logo || "",
        faviconUrl: branding.faviconUrl || "",
        primaryColor: branding.primaryColor || "#2563eb",
        supportEmail: branding.supportEmail || "",
        allowUserRegistration: agency.allow_user_registration !== 0,
      },
    });
  } catch (err) {
    console.error("Tenant resolution error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── USER REGISTRATION UNDER TENANT DOMAIN ────────────────────────────────────
router.post(["/auth/register", "/hospital-admin/signup"], async (req, res) => {
  try {
    const {
      name,
      firstname,
      lastname,
      email,
      password,
      domain,
      host,
    } = req.body;

    const fullName = (name || `${firstname || ""} ${lastname || ""}`).trim();
    if (!fullName || !email || !password) {
      return res.status(400).json({ success: false, message: "Name, email, and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    // Check if email is already registered
    const [existing] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email.toLowerCase().trim()]);
    if (existing.length) {
      return res.status(400).json({ success: false, message: "An account with this email already exists" });
    }

    // 1. Resolve Target Agency from Domain / Host
    const targetHost = domain || host || req.headers.host || "";
    let targetAgency = await resolveAgencyFromDomain(targetHost);

    if (!targetAgency) {
      // Default to main agency
      const [mainRows] = await pool.query("SELECT * FROM agencies WHERE is_active = 1 ORDER BY id ASC LIMIT 1");
      if (mainRows.length) targetAgency = mainRows[0];
    }

    if (!targetAgency) {
      const [newAg] = await pool.query("INSERT INTO agencies (name, slug, is_active) VALUES ('Main Workspace', 'main-workspace', 1)");
      targetAgency = { id: newAg.insertId, name: "Main Workspace" };
    }

    // Check registration allowed
    if (targetAgency.allow_user_registration === 0) {
      return res.status(403).json({
        success: false,
        message: "User registration is currently disabled for this workspace. Please contact support.",
      });
    }

    // 2. Create User
    const hashedPassword = await bcrypt.hash(password, 10);
    const [userResult] = await pool.query(
      "INSERT INTO users (name, email, password, role, is_active, created_at) VALUES (?, ?, ?, 'AGENT', 1, NOW())",
      [fullName, email.toLowerCase().trim(), hashedPassword]
    );

    const userId = userResult.insertId;

    // 3. Create Agent Profile under the resolved Agency
    await pool.query(
      "INSERT INTO agent_profiles (user_id, agency_id, user_type, is_online, created_at) VALUES (?, ?, 'AGENCY_USER', 1, NOW())",
      [userId, targetAgency.id]
    );

    console.log(`✅ [Tenant Registration] User "${fullName}" (${email}) created under Agency ID ${targetAgency.id} ("${targetAgency.name}") via domain "${targetHost}"`);

    // 4. Generate JWT
    const payload = {
      id: userId,
      name: fullName,
      email: email.toLowerCase().trim(),
      role: "AGENT",
      agencyId: targetAgency.id,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.cookie("token", token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      success: true,
      message: `Account created successfully under ${targetAgency.name}!`,
      user: payload,
      token,
      agencyName: targetAgency.name,
    });
  } catch (err) {
    console.error("Registration error:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to register account" });
  }
});

// ─── LOGIN (All roles) ────────────────────────────────────────────────────────
router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ success: false, message: "Email and password are required" });

  try {
    const [rows] = await pool.query(
      `SELECT u.*, a.id as agencyId, a.name as agencyName, a.slug as agencySlug,
              ap.id as agentProfileId, ap.agency_id as agentAgencyId
       FROM users u
       LEFT JOIN agencies a ON a.owner_id = u.id
       LEFT JOIN agent_profiles ap ON ap.user_id = u.id
       WHERE u.email = ? AND u.is_active = 1 LIMIT 1`,
      [email]
    );

    if (rows.length === 0)
      return res.status(401).json({ success: false, message: "Invalid email or password" });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ success: false, message: "Invalid email or password" });

    let resolvedAgencyId = user.agencyId || user.agentAgencyId || null;
    if (!resolvedAgencyId) {
      const [agRows] = await pool.query("SELECT id FROM agencies WHERE owner_id = ? OR is_active = 1 ORDER BY id ASC LIMIT 1", [user.id]);
      if (agRows.length) {
        resolvedAgencyId = agRows[0].id;
      } else {
        const [newAg] = await pool.query("INSERT INTO agencies (name, slug, owner_id, is_active) VALUES ('Main Workspace', 'main-workspace', ?, 1)", [user.id]);
        resolvedAgencyId = newAg.insertId;
      }
    }

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      agencyId: resolvedAgencyId,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.cookie("token", token, {
      httpOnly: true,
      secure: false,          // keep false so HTTP ngrok tunnels work
      sameSite: "lax",        // was "strict" — strict blocks cookie on cross-domain nav
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      message: "Login successful",
      user: payload,
      token,
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
router.post("/auth/logout", (req, res) => {
  res.clearCookie("token");
  return res.json({ success: true, message: "Logged out successfully" });
});

// ─── GET CURRENT USER ─────────────────────────────────────────────────────────
router.get("/auth/me", async (req, res) => {
  const token = req.cookies?.token || req.headers?.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, message: "Not authenticated" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.agencyId) {
      const [agRows] = await pool.query("SELECT id FROM agencies WHERE owner_id = ? OR is_active = 1 ORDER BY id ASC LIMIT 1", [decoded.id || 0]);
      if (agRows.length) decoded.agencyId = agRows[0].id;
    }
    return res.json({ success: true, user: decoded });
  } catch {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
});

export default router;