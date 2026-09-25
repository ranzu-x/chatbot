/**
 * Password reset — forgot-password email link → choose a new password
 * (routes/auth.js; table from migrate_password_reset.js).
 *
 * - The emailed token is 32 random bytes; only its SHA-256 is stored.
 * - 1 hour, single use; a successful reset consumes every open token of the user.
 * - Requests are throttled per account (1/minute, 5/hour) on top of the IP
 *   rate limit in index.js, and the caller is never told whether the email
 *   exists (same neutral-answer rule as the reseller flows).
 * - A reset bumps users.token_version; middleware/tenant.js rejects login
 *   tokens carrying an older version, so every other session is signed out.
 */
import crypto from "crypto";
import bcrypt from "bcrypt";
import pool from "../db.js";
import { sendPasswordResetEmail } from "./emailNotifications.js";
import { invalidateTenantCache } from "../middleware/tenant.js";

const TOKEN_TTL_MINUTES = 60;
export const MIN_PASSWORD_LENGTH = 8;

const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");
const frontendBase = () => (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");

/** Emails a reset link if the address belongs to an active account. Always resolves; never reveals which. */
export async function requestPasswordReset(email, ip = null) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return;
  const [[user]] = await pool.query("SELECT id, name, email, is_active FROM users WHERE email = ? LIMIT 1", [normalized]);
  if (!user || !user.is_active) return;

  const [[recent]] = await pool.query(
    `SELECT SUM(created_at > NOW() - INTERVAL 1 MINUTE) AS lastMinute, COUNT(*) AS lastHour
     FROM password_reset_tokens WHERE user_id = ? AND created_at > NOW() - INTERVAL 1 HOUR`,
    [user.id]
  );
  if (Number(recent.lastMinute) > 0 || Number(recent.lastHour) >= 5) return;

  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(
    // Expiry computed by MySQL, the same clock that checks it (NOW() in resetPassword).
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requested_ip)
     VALUES (?, ?, NOW() + INTERVAL ${TOKEN_TTL_MINUTES} MINUTE, ?)`,
    [user.id, hashToken(token), ip ? String(ip).slice(0, 64) : null]
  );
  await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl: `${frontendBase()}/reset-password?token=${token}` });
}

/** Sets the new password. Returns { ok } or { ok: false, message }. */
export async function resetPassword(token, newPassword) {
  if (!token) return { ok: false, message: "This reset link is missing its token." };
  if (!newPassword || String(newPassword).length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  const [[row]] = await pool.query(
    "SELECT id, user_id FROM password_reset_tokens WHERE token_hash = ? AND consumed_at IS NULL AND expires_at > NOW()",
    [hashToken(String(token).trim())]
  );
  if (!row) return { ok: false, message: "This reset link is invalid or has expired. Request a new one." };

  // Claim the token first so two parallel submits can't both use it.
  const [claim] = await pool.query("UPDATE password_reset_tokens SET consumed_at = NOW() WHERE id = ? AND consumed_at IS NULL", [row.id]);
  if (!claim.affectedRows) return { ok: false, message: "This reset link was already used." };

  const hash = await bcrypt.hash(String(newPassword), 10);
  await pool.query("UPDATE users SET password = ?, password_changed_at = NOW(), token_version = token_version + 1 WHERE id = ?", [hash, row.user_id]);
  await pool.query("UPDATE password_reset_tokens SET consumed_at = NOW() WHERE user_id = ? AND consumed_at IS NULL", [row.user_id]);
  invalidateTenantCache();
  return { ok: true, userId: row.user_id };
}
