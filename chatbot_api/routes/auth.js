import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db.js";

const router = express.Router();

// Helper to resolve agency from domain/hostname. Deliberately never resolves
// the reserved PLATFORM row — it isn't a customer-facing tenant, and (per
// the approved SaaS hierarchy plan §13) tenant assignment must only ever
// come from a VERIFIED domain/subdomain match, never a fallback that could
// land an anonymous visitor on the platform's own org.
async function resolveAgencyFromDomain(rawHost) {
  if (!rawHost) return null;
  const host = rawHost.toLowerCase().trim().replace(/:\d+$/, ""); // Strip port

  // 1. Direct match on custom_domain. A RESELLER's domain must be
  // DNS-verified to resolve at all — self-signup there creates a brand new
  // customer account (see POST /auth/register below), so an unverified
  // reseller domain claim must never be trusted for that. A DIRECT_CUSTOMER's
  // custom_domain can still resolve unverified (matches prior behavior —
  // it only affects login-page branding there, never account creation).
  const [domainRows] = await pool.query(
    "SELECT * FROM agencies WHERE custom_domain = ? AND is_active = 1 AND account_type != 'PLATFORM' AND (account_type != 'RESELLER' OR domain_verified = 1) LIMIT 1",
    [host]
  );
  if (domainRows.length) return domainRows[0];

  // 2. Subdomain match (e.g. "dynasty.nexachat.com" -> "dynasty")
  const parts = host.split(".");
  if (parts.length > 2) {
    const sub = parts[0];
    const [subRows] = await pool.query(
      "SELECT * FROM agencies WHERE (subdomain = ? OR slug = ?) AND is_active = 1 AND account_type != 'PLATFORM' LIMIT 1",
      [sub, sub]
    );
    if (subRows.length) return subRows[0];
  }

  return null;
}

// A brand-new install has no workspace at all except the reserved PLATFORM row.
// Only then may the first person to sign up become the owner of a new workspace.
async function isFreshInstall() {
  const [[row]] = await pool.query("SELECT COUNT(*) AS n FROM agencies WHERE account_type <> 'PLATFORM'");
  return row.n === 0;
}

const SIGNUP_UNAVAILABLE_MESSAGE = "Registration isn't available on this address. Please use the sign-up link your provider gave you.";

// ─── RESOLVE TENANT & WHITE-LABEL INFO (Public) ──────────────────────────────
router.get("/auth/tenant", async (req, res) => {
  try {
    const host = req.query.domain || req.query.host || req.headers.host || "";
    const matchedAgency = await resolveAgencyFromDomain(host);

    let agency = matchedAgency;
    let isCustomTenant = Boolean(matchedAgency);
    // Login/branding still fall back to the default workspace for an unrecognised
    // address, but sign-up does not: see POST /auth/register.
    const signupUnavailable = !matchedAgency && !(await isFreshInstall());

    // Fallback to default/main agency — never the reserved PLATFORM row,
    // which isn't a customer-facing tenant (see resolveAgencyFromDomain).
    if (!agency) {
      const [mainRows] = await pool.query(
        "SELECT * FROM agencies WHERE is_active = 1 AND account_type = 'DIRECT_CUSTOMER' ORDER BY id ASC LIMIT 1"
      );
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
        allowUserRegistration: !signupUnavailable && agency.allow_user_registration !== 0,
        signupUnavailable,
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
    // A RESELLER's own domain never gets *joined* as a team member — it
    // mints a brand-new RESELLER_CUSTOMER account instead (step below).
    const signingUpUnderReseller = targetAgency?.account_type === "RESELLER" ? targetAgency : null;

    if (!targetAgency && !(await isFreshInstall())) {
      // Not a recognised domain or subdomain. This used to drop the person into
      // the lowest-id DIRECT_CUSTOMER workspace as a team member, i.e. somebody
      // else's workspace (for example a reseller's user who visited an
      // unverified or mistyped domain). Refused instead: no account is created.
      return res.status(403).json({ success: false, code: "SIGNUP_NOT_AVAILABLE", message: SIGNUP_UNAVAILABLE_MESSAGE });
    }

    // Literally no agency exists yet anywhere (fresh install) — the
    // signing-up user becomes the OWNER of a brand-new Main Workspace
    // rather than an ownerless placeholder (agencies.owner_id is NOT NULL),
    // handled as its own branch below since it needs the user row created
    // first.
    const bootstrapNoAgency = !targetAgency;

    // Check registration allowed
    if (targetAgency && targetAgency.allow_user_registration === 0) {
      return res.status(403).json({
        success: false,
        message: "User registration is currently disabled for this workspace. Please contact support.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    let userId, jwtRole, finalAgencyId, finalAgencyName;

    if (bootstrapNoAgency) {
      const [userResult] = await pool.query(
        "INSERT INTO users (name, email, password, role, is_active, created_at) VALUES (?, ?, ?, 'RESELLER', 1, NOW())",
        [fullName, email.toLowerCase().trim(), hashedPassword]
      );
      userId = userResult.insertId;
      const [agResult] = await pool.query(
        "INSERT INTO agencies (name, slug, owner_id, is_active, account_type) VALUES ('Main Workspace', 'main-workspace', ?, 1, 'DIRECT_CUSTOMER')",
        [userId]
      );
      finalAgencyId = agResult.insertId;
      finalAgencyName = "Main Workspace";
      jwtRole = "RESELLER";
      const [[ownerRole]] = await pool.query("SELECT id FROM roles WHERE scope_type='AGENCY' AND agency_id IS NULL AND slug='owner'");
      if (ownerRole) {
        await pool.query(
          "INSERT INTO organization_members (user_id, agency_id, role_id, member_kind, chat_access) VALUES (?,?,?, 'OWNER', 'ALL')",
          [userId, finalAgencyId, ownerRole.id]
        );
      }
      console.log(`✅ [Bootstrap Registration] User "${fullName}" (${email}) created the first workspace (Agency ID ${finalAgencyId}) as its owner`);
    } else if (signingUpUnderReseller) {
      // ─── Reseller-domain signup: creates a NEW RESELLER_CUSTOMER account,
      // owned by the signing-up user — never a team member of the
      // reseller's own org. "Signup Domain → Identify Reseller → Create
      // Customer → customer.parent_agency_id = Reseller" per the approved plan.
      const [userResult] = await pool.query(
        "INSERT INTO users (name, email, password, role, is_active, created_at) VALUES (?, ?, ?, 'RESELLER', 1, NOW())",
        [fullName, email.toLowerCase().trim(), hashedPassword]
      );
      userId = userResult.insertId;
      const custSlug = `${fullName}-${Date.now().toString(36)}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const [agResult] = await pool.query(
        "INSERT INTO agencies (name, slug, owner_id, account_type, parent_agency_id) VALUES (?, ?, ?, 'RESELLER_CUSTOMER', ?)",
        [`${fullName}'s Workspace`, custSlug, userId, signingUpUnderReseller.id]
      );
      finalAgencyId = agResult.insertId;
      finalAgencyName = `${fullName}'s Workspace`;
      jwtRole = "RESELLER";
      const [[ownerRole]] = await pool.query("SELECT id FROM roles WHERE scope_type='AGENCY' AND agency_id IS NULL AND slug='owner'");
      if (ownerRole) {
        await pool.query(
          "INSERT INTO organization_members (user_id, agency_id, role_id, member_kind, chat_access) VALUES (?,?,?, 'OWNER', 'ALL')",
          [userId, finalAgencyId, ownerRole.id]
        );
      }
      console.log(`✅ [Reseller Signup] User "${fullName}" (${email}) created a new customer account (Agency ID ${finalAgencyId}) under Reseller ID ${signingUpUnderReseller.id} via domain "${targetHost}"`);
    } else {
      // ─── Unchanged prior behavior: joins the resolved workspace as a
      // team member (USER role) — now also backed by a real
      // organization_members row (previously missing entirely, which would
      // have failed every requirePermission-gated route post-signup).
      const [userResult] = await pool.query(
        "INSERT INTO users (name, email, password, role, is_active, created_at) VALUES (?, ?, ?, 'USER', 1, NOW())",
        [fullName, email.toLowerCase().trim(), hashedPassword]
      );
      userId = userResult.insertId;
      await pool.query(
        "INSERT INTO agent_profiles (user_id, agency_id, user_type, is_online, created_at) VALUES (?, ?, 'AGENCY_USER', 1, NOW())",
        [userId, targetAgency.id]
      );
      finalAgencyId = targetAgency.id;
      finalAgencyName = targetAgency.name;
      jwtRole = "USER";
      const [[agentRole]] = await pool.query("SELECT id FROM roles WHERE scope_type='AGENCY' AND agency_id IS NULL AND slug='agent'");
      if (agentRole) {
        await pool.query(
          "INSERT INTO organization_members (user_id, agency_id, role_id, member_kind, chat_access) VALUES (?,?,?, 'TEAM_MEMBER', 'ASSIGNED_ONLY')",
          [userId, finalAgencyId, agentRole.id]
        );
      }
      console.log(`✅ [Tenant Registration] User "${fullName}" (${email}) created under Agency ID ${finalAgencyId} ("${finalAgencyName}") via domain "${targetHost}"`);
    }

    // Generate JWT
    const [[registeredAccountType]] = await pool.query("SELECT account_type FROM agencies WHERE id = ?", [finalAgencyId]);
    const payload = {
      id: userId,
      name: fullName,
      email: email.toLowerCase().trim(),
      role: jwtRole,
      agencyId: finalAgencyId,
      accountType: registeredAccountType?.account_type || "DIRECT_CUSTOMER",
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
      message: `Account created successfully under ${finalAgencyName}!`,
      user: payload,
      token,
      agencyName: finalAgencyName,
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

    // home_agency_id is the authority (kept correct by database triggers, see
    // migrate_tenant_isolation.js); the older owner / agent-profile lookups only
    // matter for a user created before it existed.
    let resolvedAgencyId = user.home_agency_id || user.agencyId || user.agentAgencyId || null;
    if (!resolvedAgencyId) {
      // An orphaned user (no owned agency, no agent_profiles row — e.g.
      // created via the raw POST /admin/users endpoint). Never place them in
      // somebody else's workspace: this used to fall back to "the lowest active
      // DIRECT_CUSTOMER", i.e. another tenant's workspace. They get their own.
      const [agRows] = await pool.query(
        "SELECT id FROM agencies WHERE owner_id = ? ORDER BY id ASC LIMIT 1",
        [user.id]
      );
      if (agRows.length) {
        resolvedAgencyId = agRows[0].id;
      } else {
        const [newAg] = await pool.query(
          "INSERT INTO agencies (name, slug, owner_id, is_active, account_type) VALUES ('Main Workspace', 'main-workspace', ?, 1, 'DIRECT_CUSTOMER')",
          [user.id]
        );
        resolvedAgencyId = newAg.insertId;
      }
    }

    const [[accountTypeRow]] = await pool.query("SELECT account_type FROM agencies WHERE id = ?", [resolvedAgencyId]);

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      agencyId: resolvedAgencyId,
      accountType: accountTypeRow?.account_type || "DIRECT_CUSTOMER",
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
  res.clearCookie("token", {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
  });
  res.clearCookie("token", { path: "/" });
  res.clearCookie("token");
  return res.json({ success: true, message: "Logged out successfully" });
});

// ─── GET CURRENT USER ─────────────────────────────────────────────────────────
router.get("/auth/me", async (req, res) => {
  const token = req.cookies?.token || req.headers?.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, message: "Not authenticated" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Verify user exists and is active in database
    const [userRows] = await pool.query(
      "SELECT id, name, email, role, is_active FROM users WHERE id = ? LIMIT 1",
      [decoded.id]
    );
    if (!userRows.length || !userRows[0].is_active) {
      res.clearCookie("token", { httpOnly: true, secure: false, sameSite: "lax", path: "/" });
      res.clearCookie("token", { path: "/" });
      res.clearCookie("token");
      return res.status(401).json({ success: false, message: "Account is inactive or not found" });
    }

    const dbUser = userRows[0];
    decoded.name = dbUser.name;
    decoded.email = dbUser.email;
    decoded.role = dbUser.role;

    if (!decoded.agencyId) {
      const [agRows] = await pool.query(
        "SELECT id FROM agencies WHERE owner_id = ? OR (is_active = 1 AND account_type = 'DIRECT_CUSTOMER') ORDER BY (owner_id = ?) DESC, id ASC LIMIT 1",
        [decoded.id || 0, decoded.id || 0]
      );
      if (agRows.length) decoded.agencyId = agRows[0].id;
    }
    // Always refreshed from the DB (not just carried from the JWT) so an
    // older token issued before accountType existed still gets it, and so
    // an account_type change (e.g. Super Admin converts an agency to a
    // reseller) is reflected without waiting for re-login.
    if (decoded.agencyId) {
      const [[agencyRow]] = await pool.query("SELECT account_type FROM agencies WHERE id = ?", [decoded.agencyId]);
      decoded.accountType = agencyRow?.account_type || "DIRECT_CUSTOMER";
    }
    return res.json({ success: true, user: decoded });
  } catch {
    res.clearCookie("token", { httpOnly: true, secure: false, sameSite: "lax", path: "/" });
    res.clearCookie("token", { path: "/" });
    res.clearCookie("token");
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
});

export default router;