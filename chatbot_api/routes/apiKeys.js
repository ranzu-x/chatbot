/**
 * API Developer — an agency's own API keys for the narrow external REST
 * surface at /api/v1/public/* (routes/publicApi.js). Management here is
 * JWT-authenticated like every other dashboard route; the keys THEMSELVES
 * authenticate against publicApi.js via middleware/apiKeyMiddleware.js.
 */
import express from "express";
import crypto from "crypto";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { requireModule, assertLimit } from "../utils/entitlements.js";
import { hashApiKey } from "../middleware/apiKeyMiddleware.js";

const router = express.Router();
router.use("/api-keys", authMiddleware, roleMiddleware("RESELLER", "ADMIN"), requireModule("feature_api_developer"));

const AVAILABLE_SCOPES = ["contacts:read", "messages:send"];

// ─── LIST (key_prefix only — the full key is never retrievable again) ───────
router.get("/api-keys", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, label, key_prefix, scopes, last_used_at, is_active, created_at FROM api_keys WHERE agency_id = ? ORDER BY created_at DESC",
      [req.user.agencyId]
    );
    return res.json({ success: true, apiKeys: rows, availableScopes: AVAILABLE_SCOPES });
  } catch (err) {
    console.error("List API keys error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── CREATE (full key shown exactly once) ────────────────────────────────────
router.post("/api-keys", async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const { label, scopes } = req.body || {};
    if (!label || !String(label).trim()) {
      return res.status(400).json({ success: false, message: "A label is required" });
    }
    const chosenScopes = Array.isArray(scopes) && scopes.length
      ? scopes.filter((s) => AVAILABLE_SCOPES.includes(s))
      : AVAILABLE_SCOPES;

    await assertLimit(agencyId, "max_api_keys", 1, req.user?.id);

    const rawKey = `nexa_${crypto.randomBytes(24).toString("hex")}`;
    const keyPrefix = rawKey.slice(0, 12);
    const keyHash = hashApiKey(rawKey);

    const [result] = await pool.query(
      "INSERT INTO api_keys (agency_id, created_by, label, key_prefix, key_hash, scopes) VALUES (?, ?, ?, ?, ?, ?)",
      [agencyId, req.user.id, label.trim(), keyPrefix, keyHash, JSON.stringify(chosenScopes)]
    );

    return res.status(201).json({
      success: true,
      message: "API key created — copy it now, it will never be shown again.",
      apiKeyId: result.insertId,
      apiKey: rawKey,
      keyPrefix,
    });
  } catch (err) {
    console.error("Create API key error:", err);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Server error", code: err.code });
  }
});

// ─── REVOKE ───────────────────────────────────────────────────────────────────
router.delete("/api-keys/:id", async (req, res) => {
  try {
    await pool.query(
      "UPDATE api_keys SET is_active = 0, revoked_at = NOW() WHERE id = ? AND agency_id = ?",
      [req.params.id, req.user.agencyId]
    );
    return res.json({ success: true, message: "API key revoked" });
  } catch (err) {
    console.error("Revoke API key error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
