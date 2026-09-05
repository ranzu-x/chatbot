/**
 * Agency-owned Payment Gateways (BYOK)
 *
 * Lets an Agency plug in ITS OWN payment provider credentials (Stripe, PayPal, ...)
 * so it can bill its own sub-agencies/white-label clients directly — fully
 * separate from the platform's own Stripe billing (services/stripeService.js,
 * routes/billing.js), which is untouched by this file.
 *
 * Mirrors the existing per-agency BYOK pattern already used for Meta/TikTok apps
 * (routes/metaapp.js, routes/tiktokapp.js), but for payment providers.
 */
import express from "express";
import Stripe from "stripe";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { encryptSecret, decryptSecret } from "../utils/cryptoVault.js";

const router = express.Router();

// Only an Agency manages its own gateways (scoped to req.user.agencyId).
router.use(authMiddleware, roleMiddleware("AGENCY"));

// Per-provider shape of the credentials JSON blob before encryption, and
// which fields are safe to echo back in full vs must stay masked.
const PROVIDER_FIELDS = {
  STRIPE: {
    required: ["secretKey"],
    optional: ["publishableKey", "webhookSecret"],
    publicRefField: "publishableKey",
  },
  PAYPAL: {
    required: ["clientId", "clientSecret"],
    optional: [],
    publicRefField: "clientId",
  },
};

function getAgencyId(req) {
  const agencyId = req.user?.agencyId;
  if (!agencyId) throw Object.assign(new Error("No agency associated with this account"), { status: 400 });
  return agencyId;
}

// ─── LIST CONFIGURED GATEWAYS (secrets masked) ───────────────────────────────
router.get("/agency/payment-gateways", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const [rows] = await pool.query(
      `SELECT id, provider, mode, public_ref, is_active, last_verified_at, created_at, updated_at
       FROM agency_payment_gateways WHERE agency_id = ? ORDER BY provider`,
      [agencyId]
    );
    return res.json({ success: true, gateways: rows });
  } catch (err) {
    const status = err.status || 500;
    console.error("List agency payment gateways error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

// ─── SAVE (CREATE OR UPDATE) CREDENTIALS FOR A PROVIDER ──────────────────────
router.put("/agency/payment-gateways/:provider", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
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
      `INSERT INTO agency_payment_gateways (agency_id, provider, mode, credentials, public_ref, is_active)
       VALUES (?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE mode = VALUES(mode), credentials = VALUES(credentials),
         public_ref = VALUES(public_ref), is_active = 1, updated_at = NOW()`,
      [agencyId, provider, mode, encrypted, publicRef]
    );

    return res.json({ success: true, message: `${provider} credentials saved.` });
  } catch (err) {
    const status = err.status || 500;
    console.error("Save agency payment gateway error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error saving credentials" : err.message });
  }
});

// ─── TEST CONNECTION (verifies the stored credentials actually work) ─────────
router.post("/agency/payment-gateways/:provider/test", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const provider = String(req.params.provider || "").toUpperCase();

    const [rows] = await pool.query(
      `SELECT credentials FROM agency_payment_gateways WHERE agency_id = ? AND provider = ? LIMIT 1`,
      [agencyId, provider]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, message: `No ${provider} credentials saved yet` });
    }

    const creds = JSON.parse(decryptSecret(rows[0].credentials));

    if (provider === "STRIPE") {
      const stripe = new Stripe(creds.secretKey);
      const account = await stripe.accounts.retrieve();
      await pool.query(
        `UPDATE agency_payment_gateways SET last_verified_at = NOW() WHERE agency_id = ? AND provider = ?`,
        [agencyId, provider]
      );
      return res.json({
        success: true,
        message: "Stripe credentials are valid.",
        accountId: account.id,
        chargesEnabled: account.charges_enabled,
      });
    }

    return res.status(400).json({ success: false, message: `Connection test not yet implemented for ${provider}` });
  } catch (err) {
    console.error("Test agency payment gateway error:", err.response?.data || err.message);
    return res.status(400).json({
      success: false,
      message: err.message?.includes("Invalid API Key") ? "Invalid API key — please check and re-save." : (err.message || "Credential test failed"),
    });
  }
});

// ─── REMOVE CREDENTIALS FOR A PROVIDER ───────────────────────────────────────
router.delete("/agency/payment-gateways/:provider", async (req, res) => {
  try {
    const agencyId = getAgencyId(req);
    const provider = String(req.params.provider || "").toUpperCase();
    await pool.query(`DELETE FROM agency_payment_gateways WHERE agency_id = ? AND provider = ?`, [agencyId, provider]);
    return res.json({ success: true, message: `${provider} disconnected.` });
  } catch (err) {
    const status = err.status || 500;
    console.error("Delete agency payment gateway error:", err);
    return res.status(status).json({ success: false, message: status === 500 ? "Server error" : err.message });
  }
});

export default router;
