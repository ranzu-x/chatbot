/**
 * Platform-owned Payment Gateways
 *
 * The Super Admin's own merchant credentials for selling `packages` to
 * agencies/end-users — Stripe (kept for symmetry; services/stripeService.js
 * still reads its key from STRIPE_SECRET_KEY, untouched), SSLCommerz,
 * PortWallet, AamarPay. Structurally cloned from the agency-owned BYOK
 * pattern (routes/agencyPaymentGateways.js) but scoped to ADMIN, not
 * per-agency — a distinct, platform-wide concern from that file, which is
 * about an agency billing its OWN sub-agency clients.
 */
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { encryptSecret } from "../utils/cryptoVault.js";

const router = express.Router();
router.use("/admin/payment-gateways", authMiddleware, roleMiddleware("ADMIN"));

// Per-provider shape of the credentials JSON blob before encryption.
// SSLCommerz/AamarPay/PortWallet field names follow each provider's real
// merchant-panel terminology as best known without live docs access —
// confirm against the provider's actual dashboard when wiring real
// credentials (see services/sslcommerzService.js etc. for the matching
// TODO markers at their actual API call sites).
const PROVIDER_FIELDS = {
  STRIPE: {
    required: ["secretKey"],
    optional: ["publishableKey", "webhookSecret"],
    publicRefField: "publishableKey",
  },
  SSLCOMMERZ: {
    required: ["storeId", "storePassword"],
    optional: [],
    publicRefField: "storeId",
  },
  AAMARPAY: {
    required: ["storeId", "signatureKey"],
    optional: [],
    publicRefField: "storeId",
  },
  PORTWALLET: {
    required: ["merchantId", "apiKey", "apiSecret"],
    optional: [],
    publicRefField: "merchantId",
  },
};

// ─── LIST CONFIGURED GATEWAYS (secrets masked) ───────────────────────────────
router.get("/admin/payment-gateways", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, provider, mode, public_ref, is_active, last_verified_at, created_at, updated_at
       FROM platform_payment_gateways ORDER BY provider`
    );
    return res.json({ success: true, gateways: rows });
  } catch (err) {
    console.error("List platform payment gateways error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── SAVE (CREATE OR UPDATE) CREDENTIALS FOR A PROVIDER ──────────────────────
router.put("/admin/payment-gateways/:provider", async (req, res) => {
  try {
    const provider = String(req.params.provider || "").toUpperCase();
    const spec = PROVIDER_FIELDS[provider];
    if (!spec) {
      return res.status(400).json({ success: false, message: `Unsupported provider "${provider}"` });
    }

    const { mode = "live", ...fields } = req.body || {};
    if (!["test", "live"].includes(mode)) {
      return res.status(400).json({ success: false, message: "mode must be 'test' or 'live'" });
    }

    const missing = spec.required.filter((f) => !fields[f] || !String(fields[f]).trim());
    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Missing required field(s) for ${provider}: ${missing.join(", ")}`,
      });
    }

    const credentialsPayload = {};
    for (const key of [...spec.required, ...spec.optional]) {
      if (fields[key] !== undefined && fields[key] !== "") credentialsPayload[key] = String(fields[key]).trim();
    }

    const encrypted = encryptSecret(credentialsPayload);
    const publicRef = credentialsPayload[spec.publicRefField] || null;

    await pool.query(
      `INSERT INTO platform_payment_gateways (provider, mode, credentials, public_ref, is_active)
       VALUES (?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE mode = VALUES(mode), credentials = VALUES(credentials),
         public_ref = VALUES(public_ref), is_active = 1, updated_at = NOW()`,
      [provider, mode, encrypted, publicRef]
    );

    return res.json({ success: true, message: `${provider} credentials saved.` });
  } catch (err) {
    console.error("Save platform payment gateway error:", err);
    return res.status(500).json({ success: false, message: "Server error saving credentials" });
  }
});

// ─── TOGGLE ACTIVE / INACTIVE (without deleting stored credentials) ──────────
router.patch("/admin/payment-gateways/:provider", async (req, res) => {
  try {
    const provider = String(req.params.provider || "").toUpperCase();
    const isActive = Boolean(req.body?.isActive);
    const [result] = await pool.query(
      `UPDATE platform_payment_gateways SET is_active = ? WHERE provider = ?`,
      [isActive ? 1 : 0, provider]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: `No ${provider} credentials saved yet` });
    }
    return res.json({ success: true, message: `${provider} ${isActive ? "enabled" : "disabled"}.` });
  } catch (err) {
    console.error("Toggle platform payment gateway error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── REMOVE CREDENTIALS FOR A PROVIDER ───────────────────────────────────────
router.delete("/admin/payment-gateways/:provider", async (req, res) => {
  try {
    const provider = String(req.params.provider || "").toUpperCase();
    await pool.query(`DELETE FROM platform_payment_gateways WHERE provider = ?`, [provider]);
    return res.json({ success: true, message: `${provider} disconnected.` });
  } catch (err) {
    console.error("Delete platform payment gateway error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
