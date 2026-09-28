import express from "express";
import { getMemberPermissionKeys } from "../middleware/permissionMiddleware.js";
import { canManageDeveloperApps } from "../middleware/developerAppsAccess.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { sendVerificationEmail, consumeVerificationToken } from "../utils/emailVerification.js";
import { createAccount } from "../utils/accountProvisioning.js";
import { assignDefaultCustomerPackage } from "../utils/resellerScope.js";
import { appRootDomain } from "../utils/customDomains.js";

// Labels under the platform domain that are never a workspace's subdomain.
const RESERVED_LABELS = new Set(["www", "app", "api", "admin", "mail", "customers", "dashboard", "login", "auth"]);
const frontendHost = () => { try { return new URL(process.env.FRONTEND_URL).hostname.toLowerCase(); } catch { return null; } };
import { requestPasswordReset, resetPassword } from "../utils/passwordReset.js";
import { getSubscriptionState } from "../utils/subscriptionStatus.js";
import crypto from "crypto";
import QRCode from "qrcode";
import { generateSecret, verifyTotp, otpauthUri, generateBackupCodes, hashBackupCode } from "../utils/totp.js";
import { encryptSecret, decryptSecret } from "../utils/cryptoVault.js";
import { invalidateTenantCache } from "../middleware/tenant.js";

const router = express.Router();
// The login cookie only travels over HTTPS in production (it carries the session).
const SECURE_COOKIES = process.env.NODE_ENV === "production";

// Helper to resolve agency from domain/hostname. Deliberately never resolves
// the reserved PLATFORM row — it isn't a customer-facing tenant, and (per
// the approved SaaS hierarchy plan §13) tenant assignment must only ever
// come from a VERIFIED domain/subdomain match, never a fallback that could
// land an anonymous visitor on the platform's own org.
export async function resolveAgencyFromDomain(rawHost) {
  if (!rawHost) return null;
  const host = rawHost.toLowerCase().trim().replace(/:\d+$/, ""); // Strip port
  // The platform's own app address is the Super Admin's: sign-up there always
  // creates a new End User workspace, never a seat in someone's workspace.
  if (host === frontendHost() || host === "localhost") return null;

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

  // 2. Subdomain match (e.g. "dynasty.nexachat.com" -> "dynasty"). With
  // APP_ROOT_DOMAIN set, only <label>.APP_ROOT_DOMAIN counts — a reseller's
  // not-yet-live custom domain "app.brand.com" must never match subdomain "app".
  const root = appRootDomain();
  const parts = host.split(".");
  const underRoot = root ? host.endsWith(`.${root}`) && host.split(".").length === root.split(".").length + 1 : parts.length > 2;
  if (underRoot && !RESERVED_LABELS.has(parts[0])) {
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


// ─── RESOLVE TENANT & WHITE-LABEL INFO (Public) ──────────────────────────────
/** A workspace's white-label brand (agencies.custom_branding), as the dashboard uses it. */
export function brandOf(agency) {
  let branding = {};
  try {
    branding = typeof agency.custom_branding === "string"
      ? JSON.parse(agency.custom_branding || "{}")
      : agency.custom_branding || {};
  } catch {
    branding = {};
  }
  return {
    id: agency.id,
    name: agency.name,
    slug: agency.slug,
    customDomain: agency.custom_domain,
    subdomain: agency.subdomain,
    brandName: branding.brandName || agency.name || "Nexa Chatbot",
    tagline: branding.tagline || "AI & Multi-channel Marketing Workspace",
    logoUrl: branding.logoUrl || agency.logo || "",
    logoIconUrl: branding.logoIconUrl || "",
    faviconUrl: branding.faviconUrl || "",
    primaryColor: branding.primaryColor || "#2563eb",
    supportEmail: branding.supportEmail || "",
    copyrightText: branding.copyrightText || "",
    isResellerBrand: agency.account_type === "RESELLER",
  };
}

/**
 * The brand a signed-in person sees wherever they open the app (the main
 * domain included): a Reseller's own, for the Reseller, its team and its
 * customers. Null for everyone else — the address's brand applies then.
 */
async function signedInBrand(agencyId, accountType) {
  let resellerId = null;
  if (accountType === "RESELLER") resellerId = agencyId;
  if (accountType === "RESELLER_CUSTOMER") {
    const [[row]] = await pool.query("SELECT parent_agency_id FROM agencies WHERE id = ?", [agencyId]);
    resellerId = row?.parent_agency_id || null;
  }
  if (!resellerId) return null;
  const [[reseller]] = await pool.query("SELECT * FROM agencies WHERE id = ? AND account_type = 'RESELLER'", [resellerId]);
  return reseller ? brandOf(reseller) : null;
}

router.get("/auth/tenant", async (req, res) => {
  try {
    const host = req.query.domain || req.query.host || req.headers.host || "";
    const matchedAgency = await resolveAgencyFromDomain(host);

    let agency = matchedAgency;
    let isCustomTenant = Boolean(matchedAgency);
    // Sign-up is open on every address (decided by the user): an
    // unrecognised one creates a brand-new End User workspace — see POST
    // /auth/register. Only a recognised workspace can turn it off, with its
    // own allow_user_registration switch.
    const allowUserRegistration = matchedAgency ? matchedAgency.allow_user_registration !== 0 : true;

    // Not a reseller / workspace address: the main domain shows the Super
    // Admin's own branding (the PLATFORM row's white-label settings). Used to
    // fall back to the lowest-id End User workspace's branding. Sign-up here
    // still creates a new End User workspace (see POST /auth/register).
    if (!agency) {
      const [mainRows] = await pool.query("SELECT * FROM agencies WHERE account_type = 'PLATFORM' ORDER BY id ASC LIMIT 1");
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

    return res.json({
      success: true,
      isCustomTenant,
      agency: {
        ...brandOf(agency),
        allowUserRegistration,
        signupUnavailable: false,
      },
    });
  } catch (err) {
    console.error("Tenant resolution error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── USER REGISTRATION UNDER TENANT DOMAIN ────────────────────────────────────
router.post("/auth/register", async (req, res) => {
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

    // Literally no agency exists yet anywhere (fresh install) — the
    // signing-up user becomes the OWNER of a brand-new Main Workspace
    // rather than an ownerless placeholder (agencies.owner_id is NOT NULL),
    // handled as its own branch below since it needs the user row created
    // first.
    const bootstrapNoAgency = !targetAgency && (await isFreshInstall());

    // Not a recognised domain or subdomain (e.g. the platform's own domain):
    // registration is open on every address, and the person gets a
    // brand-new End User (DIRECT_CUSTOMER) workspace of their own — the same
    // account shape guest checkout creates (utils/accountProvisioning.js).
    // Never a seat in somebody else's workspace: this path used to drop them
    // into the lowest-id DIRECT_CUSTOMER workspace as a team member.
    const newDirectCustomer = !targetAgency && !bootstrapNoAgency;

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
    } else if (newDirectCustomer) {
      const created = await createAccount({
        fullName,
        email,
        passwordHash: hashedPassword,
        affiliateCode: req.body.affiliateCode || req.body.ref || null,
        source: `Self-signup via "${targetHost}"`,
      });
      userId = created.userId;
      finalAgencyId = created.agencyId;
      finalAgencyName = created.agencyName;
      jwtRole = "RESELLER"; // workspace owners carry role RESELLER (see accountProvisioning.js)
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
      await assignDefaultCustomerPackage(signingUpUnderReseller.id, finalAgencyId).catch((e) => console.error("[Reseller Signup] default plan:", e.message));
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

    // Never blocks registration — same non-blocking posture as every other
    // email call site in this app (sendWelcomeEmail etc.).
    sendVerificationEmail({ userId, to: email.toLowerCase().trim(), name: fullName }).catch(() => {});

    // Generate JWT
    const [[registeredAccountType]] = await pool.query("SELECT account_type FROM agencies WHERE id = ?", [finalAgencyId]);
    const payload = {
      id: userId,
      name: fullName,
      email: email.toLowerCase().trim(),
      role: jwtRole,
      agencyId: finalAgencyId,
      accountType: registeredAccountType?.account_type || "DIRECT_CUSTOMER",
      emailVerified: false,
      tv: 0, // users.token_version — see middleware/tenant.js isTokenRevoked
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.cookie("token", token, {
      httpOnly: true,
      secure: SECURE_COOKIES,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      success: true,
      message: `Account created successfully under ${finalAgencyName}! We've sent a verification email to ${email.toLowerCase().trim()} — click the link in it to verify your account.`,
      verificationEmailSent: true,
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
const LOGIN_USER_SQL = `SELECT u.*, a.id as agencyId, a.name as agencyName, a.slug as agencySlug,
              ap.id as agentProfileId, ap.agency_id as agentAgencyId
       FROM users u
       LEFT JOIN agencies a ON a.owner_id = u.id
       LEFT JOIN agent_profiles ap ON ap.user_id = u.id
       WHERE %WHERE% AND u.is_active = 1 LIMIT 1`;

// Two-factor login (utils/totp.js, optional per user): the password step
// answers { twoFactorRequired, challengeToken } instead of a session; the
// code goes to POST /auth/login/2fa. A challenge lives 5 minutes and allows
// 5 wrong codes (plus the IP rate limit on /auth/login*).
const TWO_FA_CHALLENGE_TTL = "5m";
const challengeAttempts = new Map(); // challenge jti → wrong codes
// Signed with its own key, so a challenge (issued after the password alone) can never
// pass as a login token anywhere else (authMiddleware, tenantContext, sockets, /auth/me…).
const challengeKey = () => `${process.env.JWT_SECRET}:2fa-challenge`;

// The security routes below live under /auth/, which tenantContext skips — so they check
// themselves that the session wasn't ended by "sign out everywhere" / a password reset.
async function requireLiveSession(req, res, next) {
  const [[u]] = await pool.query("SELECT is_active, token_version FROM users WHERE id = ?", [req.user?.id]);
  if (!u || !u.is_active || Number(u.token_version || 0) !== Number(req.user?.tv || 0)) {
    return res.status(401).json({ success: false, code: "SESSION_REVOKED", message: "Please sign in again" });
  }
  return next();
}

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ success: false, message: "Email and password are required" });

  try {
    const [rows] = await pool.query(LOGIN_USER_SQL.replace("%WHERE%", "u.email = ?"), [email]);

    if (rows.length === 0)
      return res.status(401).json({ success: false, message: "Invalid email or password" });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ success: false, message: "Invalid email or password" });

    if (user.two_factor_enabled_at) {
      const jti = crypto.randomBytes(12).toString("hex");
      const challengeToken = jwt.sign({ id: user.id, purpose: "2fa", tv: Number(user.token_version || 0), jti }, challengeKey(), { expiresIn: TWO_FA_CHALLENGE_TTL });
      return res.json({ success: true, twoFactorRequired: true, challengeToken });
    }

    return finishLogin(res, user);
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Second step: the authenticator code (or a one-time backup code).
router.post("/auth/login/2fa", async (req, res) => {
  const { challengeToken, code, backupCode } = req.body || {};
  let decoded;
  try {
    decoded = jwt.verify(String(challengeToken || ""), challengeKey());
  } catch {
    return res.status(401).json({ success: false, code: "CHALLENGE_EXPIRED", message: "This sign-in took too long. Please enter your password again." });
  }
  if (decoded?.purpose !== "2fa" || !decoded.id) return res.status(401).json({ success: false, message: "Invalid sign-in" });
  if ((challengeAttempts.get(decoded.jti) || 0) >= 5) {
    return res.status(429).json({ success: false, code: "CHALLENGE_EXPIRED", message: "Too many wrong codes. Please enter your password again." });
  }
  try {
    const [rows] = await pool.query(LOGIN_USER_SQL.replace("%WHERE%", "u.id = ?"), [decoded.id]);
    const user = rows[0];
    if (!user || !user.two_factor_enabled_at || Number(user.token_version || 0) !== Number(decoded.tv || 0)) {
      return res.status(401).json({ success: false, code: "CHALLENGE_EXPIRED", message: "Please sign in again." });
    }
    const ok = await checkSecondFactor(user, { code, backupCode });
    if (!ok) {
      challengeAttempts.set(decoded.jti, (challengeAttempts.get(decoded.jti) || 0) + 1);
      if (challengeAttempts.size > 5000) challengeAttempts.clear();
      return res.status(401).json({ success: false, message: backupCode ? "That backup code isn't valid (each one works once)." : "That code isn't right. Check your authenticator app and try again." });
    }
    challengeAttempts.delete(decoded.jti);
    return finishLogin(res, user);
  } catch (err) {
    console.error("2FA login error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

/** Verifies an authenticator code (never the same one twice) or burns a backup code. */
async function checkSecondFactor(user, { code, backupCode }) {
  if (backupCode) {
    const hashes = parseJsonArray(user.two_factor_backup_codes);
    const h = hashBackupCode(backupCode);
    if (!hashes.includes(h)) return false;
    await pool.query("UPDATE users SET two_factor_backup_codes = ? WHERE id = ?", [JSON.stringify(hashes.filter((x) => x !== h)), user.id]);
    return true;
  }
  const secret = decryptSecret(user.two_factor_secret);
  const step = secret ? verifyTotp(secret, code, { lastStep: user.two_factor_last_step }) : null;
  if (step === null) return false;
  // Conditional update: two requests racing with the same code can't both win.
  const [r] = await pool.query(
    "UPDATE users SET two_factor_last_step = ? WHERE id = ? AND (two_factor_last_step IS NULL OR two_factor_last_step < ?)",
    [step, user.id, step]
  );
  return r.affectedRows > 0;
}

function parseJsonArray(v) {
  if (Array.isArray(v)) return v;
  try { return JSON.parse(v || "[]") || []; } catch { return []; }
}

async function finishLogin(res, user) {
  try {
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
      emailVerified: Boolean(user.email_verified_at),
      tv: Number(user.token_version || 0), // a password reset bumps it, killing older sessions
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.cookie("token", token, {
      httpOnly: true,
      secure: SECURE_COOKIES, // HTTPS-only in production; plain HTTP (ngrok, localhost) works in dev
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
}

// ─── TWO-FACTOR SETTINGS (My Account → Security) ─────────────────────────────
router.get("/auth/2fa", authMiddleware, requireLiveSession, async (req, res) => {
  try {
    const [[u]] = await pool.query("SELECT two_factor_enabled_at, two_factor_backup_codes FROM users WHERE id = ?", [req.user.id]);
    return res.json({ success: true, enabled: Boolean(u?.two_factor_enabled_at), enabledAt: u?.two_factor_enabled_at || null, backupCodesLeft: parseJsonArray(u?.two_factor_backup_codes).length });
  } catch (err) {
    console.error("2FA status error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Step 1: a new secret + QR code (not active until a code from the app confirms it).
router.post("/auth/2fa/setup", authMiddleware, requireLiveSession, async (req, res) => {
  try {
    const [[u]] = await pool.query("SELECT email, two_factor_enabled_at FROM users WHERE id = ?", [req.user.id]);
    if (u?.two_factor_enabled_at) return res.status(400).json({ success: false, message: "Two-factor sign-in is already on" });
    const secret = generateSecret();
    await pool.query("UPDATE users SET two_factor_pending_secret = ? WHERE id = ?", [encryptSecret(secret), req.user.id]);
    const [[brand]] = await pool.query("SELECT custom_branding FROM agencies WHERE account_type = 'PLATFORM' LIMIT 1").catch(() => [[null]]);
    let issuer = process.env.APP_NAME || "Chatbot";
    try { issuer = JSON.parse(brand?.custom_branding || "{}")?.brandName || issuer; } catch { /* keep default */ }
    const uri = otpauthUri({ secret, account: u.email, issuer });
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
    return res.json({ success: true, secret, uri, qr });
  } catch (err) {
    console.error("2FA setup error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Step 2: the first code from the app turns it on and returns the backup codes (shown once).
router.post("/auth/2fa/enable", authMiddleware, requireLiveSession, async (req, res) => {
  try {
    const [[u]] = await pool.query("SELECT two_factor_pending_secret FROM users WHERE id = ?", [req.user.id]);
    const secret = decryptSecret(u?.two_factor_pending_secret);
    if (!secret) return res.status(400).json({ success: false, message: "Start the setup again" });
    const step = verifyTotp(secret, req.body?.code);
    if (step === null) return res.status(400).json({ success: false, message: "That code isn't right. Check the time on your phone and try the newest code." });
    const { codes, hashes } = generateBackupCodes();
    await pool.query(
      `UPDATE users SET two_factor_secret = two_factor_pending_secret, two_factor_pending_secret = NULL, two_factor_enabled_at = NOW(),
              two_factor_backup_codes = ?, two_factor_last_step = ? WHERE id = ?`,
      [JSON.stringify(hashes), step, req.user.id]
    );
    return res.json({ success: true, backupCodes: codes });
  } catch (err) {
    console.error("2FA enable error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Turning it off, or new backup codes, needs the password AND a current code (or a backup code).
async function checkPasswordAndFactor(userId, { password, code, backupCode }) {
  const [[u]] = await pool.query("SELECT * FROM users WHERE id = ?", [userId]);
  if (!u || !(await bcrypt.compare(String(password || ""), u.password))) return { ok: false, message: "Your password is incorrect" };
  if (!u.two_factor_enabled_at) return { ok: false, message: "Two-factor sign-in is off" };
  if (!(await checkSecondFactor(u, { code, backupCode }))) return { ok: false, message: "That code isn't right" };
  return { ok: true };
}

router.post("/auth/2fa/disable", authMiddleware, requireLiveSession, async (req, res) => {
  try {
    const check = await checkPasswordAndFactor(req.user.id, req.body || {});
    if (!check.ok) return res.status(400).json({ success: false, message: check.message });
    await pool.query(
      `UPDATE users SET two_factor_secret = NULL, two_factor_pending_secret = NULL, two_factor_enabled_at = NULL,
              two_factor_backup_codes = NULL, two_factor_last_step = NULL WHERE id = ?`,
      [req.user.id]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error("2FA disable error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/auth/2fa/backup-codes", authMiddleware, requireLiveSession, async (req, res) => {
  try {
    const check = await checkPasswordAndFactor(req.user.id, req.body || {});
    if (!check.ok) return res.status(400).json({ success: false, message: check.message });
    const { codes, hashes } = generateBackupCodes();
    await pool.query("UPDATE users SET two_factor_backup_codes = ? WHERE id = ?", [JSON.stringify(hashes), req.user.id]);
    return res.json({ success: true, backupCodes: codes });
  } catch (err) {
    console.error("2FA backup codes error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── SIGN OUT EVERYWHERE ─────────────────────────────────────────────────────
// Bumps users.token_version (every existing login token dies — see
// middleware/tenant.js isTokenRevoked) and hands this browser a fresh token.
router.post("/auth/sessions/revoke-all", authMiddleware, requireLiveSession, async (req, res) => {
  try {
    await pool.query("UPDATE users SET token_version = token_version + 1 WHERE id = ?", [req.user.id]);
    invalidateTenantCache();
    const [rows] = await pool.query(LOGIN_USER_SQL.replace("%WHERE%", "u.id = ?"), [req.user.id]);
    if (!rows[0]) return res.status(401).json({ success: false, message: "Please sign in again" });
    return finishLogin(res, rows[0]);
  } catch (err) {
    console.error("Revoke sessions error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
router.post("/auth/logout", (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: SECURE_COOKIES,
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
      "SELECT id, name, email, role, is_active, email_verified_at, token_version, avatar FROM users WHERE id = ? LIMIT 1",
      [decoded.id]
    );
    // A token from before the last password reset is dead (see middleware/tenant.js isTokenRevoked).
    const revoked = userRows.length && Number(decoded.tv || 0) !== Number(userRows[0].token_version || 0);
    if (!userRows.length || !userRows[0].is_active || revoked) {
      res.clearCookie("token", { httpOnly: true, secure: SECURE_COOKIES, sameSite: "lax", path: "/" });
      res.clearCookie("token", { path: "/" });
      res.clearCookie("token");
      return res.status(401).json({ success: false, message: "Account is inactive or not found" });
    }

    const dbUser = userRows[0];
    decoded.name = dbUser.name;
    decoded.email = dbUser.email;
    decoded.role = dbUser.role;
    decoded.emailVerified = Boolean(dbUser.email_verified_at);
    decoded.avatar = dbUser.avatar || null; // null → the default avatar (UserAvatar.jsx)

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
      // Plan expiry → read-only banner in the dashboard (utils/subscriptionStatus.js).
      const sub = await getSubscriptionState(decoded.agencyId);
      decoded.subscription = { expired: sub.expired, endsAt: sub.endsAt, packageName: sub.packageName, source: sub.source };
      // A Reseller's brand follows the person, not only the address (BrandingContext.jsx).
      decoded.branding = await signedInBrand(decoded.agencyId, decoded.accountType);
      // Team members: their role's permission keys, for what the dashboard shows them.
      if (dbUser.role === "USER") {
        const keys = await getMemberPermissionKeys(dbUser.id, decoded.agencyId);
        decoded.permissionKeys = keys ? [...keys] : [];
      }
      decoded.canManageDeveloperApps = await canManageDeveloperApps(
        { id: dbUser.id, role: dbUser.role }, { agencyId: decoded.agencyId, accountType: decoded.accountType }
      );
      // Super Admin panel → Blog / Documentation (routes/blog.js, routes/docs.js).
      if (dbUser.role === "ADMIN") {
        const keys = await getMemberPermissionKeys(dbUser.id, decoded.agencyId);
        decoded.canManageBlog = Boolean(keys?.has("admin.blog.manage"));
        decoded.canManageDocs = Boolean(keys?.has("admin.docs.manage"));
      }
    }
    return res.json({ success: true, user: decoded });
  } catch {
    res.clearCookie("token", { httpOnly: true, secure: SECURE_COOKIES, sameSite: "lax", path: "/" });
    res.clearCookie("token", { path: "/" });
    res.clearCookie("token");
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
});

// ─── EMAIL VERIFICATION ─────────────────────────────────────────────────────
// Public — the link in the verification email carries the token itself; no
// login is needed to click it (a brand-new registrant may check their inbox
// from a different device/browser than the one they signed up on).
// ─── PASSWORD RESET (utils/passwordReset.js) ─────────────────────────────────
// Public. Always the same answer, whether or not the email has an account.
router.post("/auth/forgot-password", async (req, res) => {
  try {
    await requestPasswordReset(req.body?.email, req.ip);
  } catch (err) {
    console.error("Forgot password error:", err);
  }
  return res.json({ success: true, message: "If an account exists for that email, we've sent a link to reset the password." });
});

router.post("/auth/reset-password", async (req, res) => {
  try {
    const result = await resetPassword(req.body?.token, req.body?.password);
    if (!result.ok) return res.status(400).json({ success: false, message: result.message });
    // This browser's old session (if any) is no longer valid either.
    res.clearCookie("token", { httpOnly: true, secure: SECURE_COOKIES, sameSite: "lax", path: "/" });
    return res.json({ success: true, message: "Your password has been changed. Sign in with the new password." });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/auth/verify-email", async (req, res) => {
  try {
    const result = await consumeVerificationToken(req.body?.token);
    if (!result.success) {
      const messages = {
        missing_token: "Missing verification token.",
        not_found: "This verification link is invalid.",
        expired: "This verification link has expired. Please request a new one.",
      };
      return res.status(400).json({ success: false, code: (result.reason || "invalid").toUpperCase(), message: messages[result.reason] || "Invalid verification link." });
    }
    return res.json({ success: true, alreadyVerified: Boolean(result.alreadyConsumed) });
  } catch (err) {
    console.error("Verify email error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Authenticated — resend for whoever is signed in. Rate-limited per user
// (one email a minute) so the button can't be used to spam an inbox or burn
// through a free SMTP plan's daily quota. Age is computed in SQL so it uses
// the same clock/timezone as created_at regardless of the Node process's.
const RESEND_COOLDOWN_SECONDS = 60;
router.post("/auth/resend-verification", authMiddleware, async (req, res) => {
  try {
    const [[user]] = await pool.query("SELECT id, name, email, email_verified_at FROM users WHERE id = ?", [req.user.id]);
    if (!user) return res.status(404).json({ success: false, message: "Account not found" });
    if (user.email_verified_at) return res.json({ success: true, alreadyVerified: true });

    const [[last]] = await pool.query(
      "SELECT TIMESTAMPDIFF(SECOND, created_at, NOW()) AS ageSeconds FROM email_verification_tokens WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      [user.id]
    );
    if (last && last.ageSeconds < RESEND_COOLDOWN_SECONDS) {
      const wait = RESEND_COOLDOWN_SECONDS - last.ageSeconds;
      return res.status(429).json({ success: false, code: "RESEND_TOO_SOON", retryAfterSeconds: wait, message: `A verification email was just sent. Please wait ${wait}s before requesting another.` });
    }

    await sendVerificationEmail({ userId: user.id, to: user.email, name: user.name });
    return res.json({ success: true, retryAfterSeconds: RESEND_COOLDOWN_SECONDS });
  } catch (err) {
    console.error("Resend verification error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;