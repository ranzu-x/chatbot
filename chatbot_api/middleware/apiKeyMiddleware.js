/**
 * Authenticates routes/publicApi.js's external endpoints via
 * `Authorization: Bearer <key>` — a separate auth path from the JWT cookie
 * every other route uses, for the API Developer feature. The presented key
 * is hashed and looked up by key_hash (never stored/logged in plaintext
 * after creation, matching the discipline already used for gateway
 * credentials — see utils/cryptoVault.js).
 */
import crypto from "crypto";
import pool from "../db.js";

export function hashApiKey(rawKey) {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export async function apiKeyMiddleware(req, res, next) {
  try {
    const header = req.headers?.authorization || "";
    const rawKey = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
    if (!rawKey) {
      return res.status(401).json({ success: false, message: "Missing API key. Send it as 'Authorization: Bearer <key>'." });
    }

    const keyHash = hashApiKey(rawKey);
    const [[row]] = await pool.query(
      "SELECT id, agency_id, scopes, is_active FROM api_keys WHERE key_hash = ? LIMIT 1",
      [keyHash]
    );

    if (!row || !row.is_active) {
      return res.status(401).json({ success: false, message: "Invalid or revoked API key." });
    }

    pool.query("UPDATE api_keys SET last_used_at = NOW() WHERE id = ?", [row.id]).catch(() => {});

    req.agencyId = row.agency_id;
    req.apiKeyId = row.id;
    req.apiKeyScopes = (() => {
      try { return typeof row.scopes === "string" ? JSON.parse(row.scopes) : row.scopes || []; }
      catch { return []; }
    })();

    next();
  } catch (err) {
    console.error("API key auth error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}

/** Requires one of `scopes` to be present on the authenticated API key. */
export function requireApiScope(...scopes) {
  return (req, res, next) => {
    const granted = req.apiKeyScopes || [];
    if (!scopes.some((s) => granted.includes(s))) {
      return res.status(403).json({ success: false, message: `This API key doesn't have the required scope: ${scopes.join(" or ")}` });
    }
    next();
  };
}
