/**
 * The pure crypto core of Meta webhook signature verification (HMAC-SHA256
 * of the raw body, keyed by the receiving app's secret, compared against
 * the X-Hub-Signature-256 header) — split out from routes/webhook.js's
 * verifyMetaSignature() so this specific, security-critical comparison is
 * unit-testable without needing a database (resolving which app secret
 * belongs to which agency is a DB lookup and stays in webhook.js; this
 * function only does the signature math once a secret is already in hand).
 */
import crypto from "crypto";

/**
 * @param {Buffer|string} rawBody - the exact raw request bytes the signature was computed over
 * @param {string} header - the X-Hub-Signature-256 header value, e.g. "sha256=abcd..."
 * @param {string} appSecret - the Meta app secret for the app that should have signed this
 * @returns {boolean} true only if header is present, well-formed, and matches
 */
export function isValidMetaSignature(rawBody, header, appSecret) {
  if (!header || !appSecret || !rawBody) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
