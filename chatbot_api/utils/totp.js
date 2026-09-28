import crypto from "crypto";

/**
 * Time-based one-time passwords (RFC 6238 / RFC 4226) for two-factor login —
 * the 6-digit codes from Google Authenticator, Microsoft Authenticator,
 * Authy, 1Password… SHA-1, 30-second steps, 6 digits (what every app
 * supports by default). No dependency: HMAC from node:crypto.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = String(str || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random secret (160 bits), base32 — what the user's app stores. */
export function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

export function hotp(secretBase32, counter, digits = 6, algorithm = "sha1") {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac(algorithm, base32Decode(secretBase32)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export function totp(secretBase32, timeMs = Date.now(), opts = {}) {
  return hotp(secretBase32, Math.floor(timeMs / 1000 / STEP_SECONDS), opts.digits, opts.algorithm);
}

/**
 * Checks a code, allowing one step either side for clock drift. Returns the
 * matched time step (store it: the same step must never be accepted twice —
 * `lastStep`), or null.
 */
export function verifyTotp(secretBase32, code, { window = 1, lastStep = null, timeMs = Date.now() } = {}) {
  const clean = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const current = Math.floor(timeMs / 1000 / STEP_SECONDS);
  for (let i = -window; i <= window; i += 1) {
    const step = current + i;
    if (lastStep !== null && step <= Number(lastStep)) continue; // replay
    const expected = hotp(secretBase32, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))) return step;
  }
  return null;
}

/** otpauth:// link an authenticator app reads from the QR code. */
export function otpauthUri({ secret, account, issuer }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

/** 10 one-time backup codes like "4f7k-9q2m" (shown once) + their hashes (stored). */
export function generateBackupCodes(count = 10) {
  const codes = [];
  for (let i = 0; i < count; i += 1) {
    const raw = crypto.randomBytes(5).toString("hex"); // 10 hex chars
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return { codes, hashes: codes.map(hashBackupCode) };
}

export function hashBackupCode(code) {
  return crypto.createHash("sha256").update(String(code).toLowerCase().replace(/[^a-z0-9]/g, "")).digest("hex");
}
