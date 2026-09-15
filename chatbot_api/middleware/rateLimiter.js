/**
 * Rate limiting — there was none anywhere in the API before this, including
 * on /auth/login, which meant an unlimited scripted password-guessing run
 * against any known email address. Two tiers:
 *
 *   authLimiter — tight, IP-scoped, on login/register only.
 *   apiLimiter  — a much looser backstop over the rest of /api/v1, so a
 *                 runaway script or accidental hammering gets throttled
 *                 instead of free rein, without getting in the way of
 *                 normal dashboard use (the Inbox alone can legitimately
 *                 fire a burst of requests on page load).
 *
 * Both key on IP by default (express-rate-limit's standard behavior) — this
 * app sits behind no reverse proxy config today, so no trust-proxy setup
 * was added; if one is introduced later, `app.set('trust proxy', ...)`
 * needs to go with it for the IP key to stay accurate.
 */
import rateLimit from "express-rate-limit";

export const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts. Please wait a few minutes and try again." },
});

export const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please slow down." },
});
