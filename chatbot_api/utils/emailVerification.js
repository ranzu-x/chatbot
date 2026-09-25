/**
 * Email verification — send-link/click-link flow for account signups (see
 * migrate_email_verification.js for the table shapes). Sent on self-signup
 * (routes/auth.js) and guest checkout (services/guestSignupService.js);
 * accounts an admin/reseller creates are marked verified directly instead.
 * Soft-enforced: nobody is blocked from logging in, a banner nags until
 * verified, and only some features (the Forum) require it — see
 * middleware/forumAccess.js. The verify/resend endpoints live in
 * routes/auth.js; the emailed link opens the app's /verify-email page.
 */
import crypto from "crypto";
import pool from "../db.js";
import { sendVerificationEmail as sendVerificationEmailRaw } from "./emailNotifications.js";

// Expiry is computed and compared in SQL (NOW() + INTERVAL) so the app
// server's and MySQL's clocks can never disagree about it.
const TOKEN_TTL_HOURS = 24;

function frontendBase() {
  return (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
}

/** Creates a fresh single-use token row for this user. Doesn't invalidate
 * older unconsumed tokens — each is independently valid until it expires
 * or is consumed, simplest correct behavior for "resend" (a user who
 * clicks an older email link after requesting a new one still works). */
export async function createVerificationToken(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (?, ?, NOW() + INTERVAL ? HOUR)",
    [userId, token, TOKEN_TTL_HOURS]
  );
  return token;
}

/** Creates a token and emails it. Never throws — same non-blocking posture
 * as every other email call site in this app (sendWelcomeEmail etc.). */
export async function sendVerificationEmail({ userId, to, name }) {
  try {
    const token = await createVerificationToken(userId);
    const verifyUrl = `${frontendBase()}/verify-email?token=${token}`;
    await sendVerificationEmailRaw({ to, name, verifyUrl });
  } catch (err) {
    console.error("[emailVerification] Failed to send verification email:", err.message);
  }
}

/**
 * Consumes a verification token: validates it's unexpired/unconsumed,
 * marks it consumed, and sets users.email_verified_at (write-once — a
 * second click on the same or another valid token for an already-verified
 * user is a harmless no-op, not an error).
 */
export async function consumeVerificationToken(token) {
  if (!token) return { success: false, reason: "missing_token" };

  const [[row]] = await pool.query(
    "SELECT id, user_id, consumed_at, (expires_at < NOW()) AS expired FROM email_verification_tokens WHERE token = ? LIMIT 1",
    [String(token).trim()]
  );
  if (!row) return { success: false, reason: "not_found" };
  if (row.consumed_at) return { success: true, alreadyConsumed: true };
  if (row.expired) return { success: false, reason: "expired" };

  await pool.query("UPDATE email_verification_tokens SET consumed_at = NOW() WHERE id = ?", [row.id]);
  await pool.query("UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?", [row.user_id]);

  return { success: true, userId: row.user_id };
}
