import { encryptSecret, decryptSecret, maskSecret } from "./cryptoVault.js";

/**
 * Developer-app secrets at rest (Meta app secret + system-user token in
 * meta_app_pool, TikTok client secret in tiktok_app_settings).
 *
 * Stored as "enc:v1:<cryptoVault ciphertext>" (AES-256-GCM, ENCRYPTION_KEY).
 * A value without the prefix is a legacy plain-text one and is read as is,
 * so rows written before this existed keep working until
 * migrate_encrypt_app_secrets.js seals them. Rows are opened where they are
 * loaded (utils/appCredentials.js and the few direct lookups), so every
 * caller keeps getting plain values. Secrets are never sent to the browser:
 * the settings screens get maskAppSecret() and a masked value coming back
 * unchanged means "keep the stored one" (keepOrSeal).
 */
const PREFIX = "enc:v1:";
export const APP_SECRET_FIELDS = ["app_secret", "system_user_token", "client_secret"];

export const isSealed = (value) => typeof value === "string" && value.startsWith(PREFIX);

export function sealAppSecret(value) {
  if (value === null || value === undefined || value === "") return value ?? null;
  if (isSealed(value)) return value;
  return PREFIX + encryptSecret(String(value));
}

export function openAppSecret(value) {
  if (!isSealed(value)) return value ?? null;
  try {
    return decryptSecret(value.slice(PREFIX.length));
  } catch (err) {
    console.error("[App secrets] could not decrypt a stored secret (ENCRYPTION_KEY changed?):", err.message);
    return null;
  }
}

/** A row with every secret field opened (a new object; null stays null). */
export function openAppRow(row) {
  if (!row) return row;
  const out = { ...row };
  for (const f of APP_SECRET_FIELDS) if (f in out) out[f] = openAppSecret(out[f]);
  return out;
}

/** What the settings screens get: the row with every secret masked. */
export function maskAppRow(row) {
  if (!row) return row;
  const out = { ...row };
  for (const f of APP_SECRET_FIELDS) {
    // Only the last 4 characters show — enough to recognise which secret is saved.
    if (f in out && out[f]) out[f] = maskSecret(openAppSecret(out[f]) || "", 0, 4) || "••••••••";
  }
  return out;
}

/** A value the settings screen sent back masked (unchanged). */
export const isMaskedInput = (value) => typeof value === "string" && value.includes("•");

/**
 * The value to store for a secret field: a masked / empty input keeps the
 * stored value; anything else is the new secret, sealed.
 */
export function keepOrSeal(input, storedValue, { keepWhenEmpty = true } = {}) {
  const v = typeof input === "string" ? input.trim() : input;
  if (isMaskedInput(v)) return storedValue ?? null;
  if ((v === undefined || v === null || v === "") && keepWhenEmpty) return storedValue ?? null;
  return sealAppSecret(v || null);
}
