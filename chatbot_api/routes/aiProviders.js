/**
 * Settings → AI Providers (agency-wide BYOK AI credentials)
 *
 * Mirrors the existing agency_payment_gateways BYOK pattern
 * (routes/agencyPaymentGateways.js) exactly: credentials are AES-256-GCM
 * encrypted at rest (utils/cryptoVault.js) and NEVER echoed back to the
 * client in full — only a masked preview.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { encryptSecret, decryptSecret, maskSecret } from "../utils/cryptoVault.js";
import { PROVIDERS } from "../utils/aiProviders/registry.js";

const router = express.Router();

// Scoped to this router's own path prefix — see agencyPaymentGateways.js's
// comment on why a bare router.use(...) here would be dangerous (it would
// 403 every request on this whole Express app that happens to run after
// this router is mounted, not just requests to these routes).
router.use("/ai/providers", authMiddleware, roleMiddleware("RESELLER", "ADMIN"));

function getAgencyId(req) {
  const agencyId = req.user?.agencyId;
  if (!agencyId) throw Object.assign(new Error("No agency associated with this account"), { status: 400 });
  return agencyId;
}

function requireKnownProvider(providerId) {
  const meta = PROVIDERS[providerId];
  if (!meta) throw Object.assign(new Error(`Unknown provider "${providerId}"`), { status: 400 });
  return meta;
}

// ─── LIST ALL PROVIDERS (registry metadata + this agency's saved state) ──────
router.get("/ai/providers", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const [rows] = await pool.query("SELECT * FROM ai_providers WHERE agency_id = ?", [agencyId]);
    const byId = Object.fromEntries(rows.map((r) => [r.provider, r]));

    const providers = Object.values(PROVIDERS).map((meta) => {
      const row = byId[meta.id];
      let maskedKey = null;
      if (row) {
        try {
          const creds = JSON.parse(decryptSecret(row.credentials));
          maskedKey = maskSecret(creds.apiKey || "");
        } catch {
          maskedKey = null;
        }
      }
      return {
        id: meta.id,
        label: meta.label,
        capabilities: meta.capabilities,
        models: meta.models,
        connected: !!row,
        enabled: !!row?.enabled,
        maskedKey,
        defaultModel: row?.default_model || meta.defaultModel,
        lastVerifiedAt: row?.last_verified_at || null,
        lastVerifyStatus: row?.last_verify_status || null,
        lastVerifyError: row?.last_verify_error || null,
      };
    });

    return res.json({ success: true, providers });
  } catch (err) {
    const status = err.status || 500;
    console.error("List AI providers error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

// ─── SAVE (CREATE OR UPDATE) A PROVIDER — key is optional on update ──────────
// Body: { apiKey?, defaultModel?, enabled? }. Omitting apiKey keeps whatever
// key is already saved (so toggling `enabled` or changing the model alone
// doesn't force re-entering the key) — mirrors how a masked-key UI works.
router.put("/ai/providers/:provider", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const meta = requireKnownProvider(req.params.provider);
    const { apiKey, defaultModel, enabled } = req.body || {};

    const [[existing]] = await pool.query(
      "SELECT credentials FROM ai_providers WHERE agency_id = ? AND provider = ?",
      [agencyId, meta.id]
    );

    if (!existing && !apiKey) {
      return res.status(400).json({ success: false, message: "An API key is required to connect this provider." });
    }

    let credentials;
    if (apiKey && apiKey.trim()) {
      credentials = encryptSecret(JSON.stringify({ apiKey: apiKey.trim() }));
    } else {
      credentials = existing.credentials; // keep the existing encrypted key
    }

    // null (not undefined — mysql2 rejects undefined bind params) means
    // "don't touch this column" on the UPDATE branch below.
    const modelOverride = (defaultModel && meta.models.includes(defaultModel)) ? defaultModel : null;
    const enabledOverride = enabled === undefined ? null : (enabled ? 1 : 0);
    const insertModel = modelOverride ?? meta.defaultModel;
    const insertEnabled = enabledOverride ?? 1;

    await pool.query(
      `INSERT INTO ai_providers (agency_id, provider, enabled, credentials, default_model)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         credentials = VALUES(credentials),
         default_model = COALESCE(?, default_model),
         enabled = COALESCE(?, enabled),
         updated_at = NOW()`,
      [agencyId, meta.id, insertEnabled, credentials, insertModel, modelOverride, enabledOverride]
    );

    return res.json({ success: true, message: `${meta.label} saved.` });
  } catch (err) {
    const status = err.status || 500;
    console.error("Save AI provider error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error saving provider" : err.message });
  }
});

// ─── TEST CONNECTION — a real, minimal call against the provider's own API ──
router.post("/ai/providers/:provider/test", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const meta = requireKnownProvider(req.params.provider);

    const [[row]] = await pool.query(
      "SELECT credentials, default_model FROM ai_providers WHERE agency_id = ? AND provider = ?",
      [agencyId, meta.id]
    );
    if (!row) {
      return res.status(404).json({ success: false, message: `No ${meta.label} credentials saved yet.` });
    }

    const { apiKey } = JSON.parse(decryptSecret(row.credentials));
    const model = row.default_model || meta.defaultModel;

    try {
      await meta.adapter.generate({
        apiKey,
        model,
        messages: [{ role: "user", content: 'Reply with exactly one word: "ok".' }],
        maxTokens: 5,
      });
      await pool.query(
        "UPDATE ai_providers SET last_verified_at = NOW(), last_verify_status = 'ok', last_verify_error = NULL WHERE agency_id = ? AND provider = ?",
        [agencyId, meta.id]
      );
      return res.json({ success: true, message: `${meta.label} connection verified.` });
    } catch (callErr) {
      const message = callErr.message || "Connection test failed";
      await pool.query(
        "UPDATE ai_providers SET last_verified_at = NOW(), last_verify_status = 'error', last_verify_error = ? WHERE agency_id = ? AND provider = ?",
        [message.slice(0, 500), agencyId, meta.id]
      );
      return res.status(400).json({ success: false, message });
    }
  } catch (err) {
    const status = err.status || 500;
    console.error("Test AI provider error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

// ─── DISCONNECT A PROVIDER ────────────────────────────────────────────────
router.delete("/ai/providers/:provider", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const meta = requireKnownProvider(req.params.provider);
    await pool.query("DELETE FROM ai_providers WHERE agency_id = ? AND provider = ?", [agencyId, meta.id]);
    return res.json({ success: true, message: `${meta.label} disconnected.` });
  } catch (err) {
    const status = err.status || 500;
    console.error("Delete AI provider error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

export default router;
