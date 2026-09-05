/**
 * Symmetric encryption helper for sensitive credentials at rest
 * (agency-supplied payment gateway secret keys, etc.).
 *
 * Uses AES-256-GCM with a per-value random IV. Requires ENCRYPTION_KEY
 * in .env — a 32-byte value, hex-encoded (64 hex chars).
 *
 * ⚠️ If ENCRYPTION_KEY is ever lost/rotated without migrating existing
 * ciphertext, everything encrypted with the old key becomes unreadable.
 * Back it up like you would a database password.
 */
import crypto from "crypto";

const ALGO = "aes-256-gcm";

function getKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY is missing or invalid in .env — expected a 64-character hex string (32 bytes)."
    );
  }
  return Buffer.from(raw, "hex");
}

/**
 * Encrypts a UTF-8 string (or JSON-stringifies an object first).
 * Returns a single string: "<ivHex>:<authTagHex>:<cipherTextHex>"
 */
export function encryptSecret(value) {
  const plaintext = typeof value === "string" ? value : JSON.stringify(value);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

/**
 * Decrypts a string produced by encryptSecret(). Returns the original
 * plaintext string (call JSON.parse yourself if you encrypted an object).
 */
export function decryptSecret(packedValue) {
  if (!packedValue || typeof packedValue !== "string") return null;
  const [ivHex, authTagHex, dataHex] = packedValue.split(":");
  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error("Malformed encrypted value — expected 'iv:authTag:cipherText' format.");
  }
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/** Masks a secret for safe display, e.g. "sk_live_5f...a9c1" -> "sk_l••••••••a9c1" */
export function maskSecret(value, visibleStart = 4, visibleEnd = 4) {
  if (!value || typeof value !== "string") return "";
  if (value.length <= visibleStart + visibleEnd) return "•".repeat(value.length);
  return value.slice(0, visibleStart) + "•".repeat(8) + value.slice(-visibleEnd);
}
