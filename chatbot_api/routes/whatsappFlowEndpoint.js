/**
 * WhatsApp Flows — key management (protected) + the encrypted data-exchange
 * endpoint itself (public — Meta's servers call it directly). See
 * utils/whatsappFlowCrypto.js for the encryption/decryption implementation
 * and migrate_whatsapp_flows_encryption.js for the schema/design notes.
 */
import express from "express";
import axios from "axios";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authmiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { encryptSecret, decryptSecret } from "../utils/cryptoVault.js";
import { generateFlowKeyPair, decryptFlowRequest, encryptFlowResponse, FlowDecryptionError } from "../utils/whatsappFlowCrypto.js";

const router = express.Router();
const META_API_VERSION = process.env.META_API_VERSION || "v21.0";

// ─── PROTECTED: key management (Settings → WhatsApp Flows) ─────────────────

router.get("/whatsapp-flow-keys/:integrationId", authMiddleware, roleMiddleware("RESELLER", "ADMIN"), async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [[integration]] = await pool.query("SELECT id FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'WHATSAPP'", [req.params.integrationId, agencyId]);
    if (!integration) return res.status(404).json({ success: false, message: "WhatsApp integration not found" });

    const [[key]] = await pool.query(
      "SELECT public_key_pem, key_uploaded_to_meta, created_at, updated_at FROM whatsapp_flow_encryption_keys WHERE integration_id = ?",
      [req.params.integrationId]
    );
    return res.json({ success: true, key: key || null });
  } catch (err) {
    console.error("GET /whatsapp-flow-keys error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// Generates a fresh RSA keypair, stores it (private key encrypted at rest —
// see utils/cryptoVault.js), and attempts to upload the public key to Meta
// via the WhatsApp Business Encryption API so the agency doesn't have to do
// it by hand. That upload can fail for reasons outside our control (a
// sandboxed/limited access token, Meta-side rate limiting) — the keypair is
// still saved either way, and the response tells the caller whether the
// upload actually succeeded so the UI can show a manual fallback.
router.post("/whatsapp-flow-keys/:integrationId", authMiddleware, roleMiddleware("RESELLER", "ADMIN"), async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [[integration]] = await pool.query(
      "SELECT id, access_token, wa_phone_number_id FROM integrations WHERE id = ? AND agency_id = ? AND platform = 'WHATSAPP'",
      [req.params.integrationId, agencyId]
    );
    if (!integration) return res.status(404).json({ success: false, message: "WhatsApp integration not found" });

    const { publicKeyPem, privateKeyPem } = generateFlowKeyPair();
    const privateKeyEncrypted = encryptSecret(privateKeyPem);

    let uploaded = false;
    let uploadError = null;
    if (integration.access_token && integration.wa_phone_number_id) {
      try {
        await axios.post(
          `https://graph.facebook.com/${META_API_VERSION}/${integration.wa_phone_number_id}/whatsapp_business_encryption`,
          new URLSearchParams({ business_public_key: publicKeyPem }),
          { headers: { Authorization: `Bearer ${integration.access_token}`, "Content-Type": "application/x-www-form-urlencoded" } }
        );
        uploaded = true;
      } catch (err) {
        uploadError = err.response?.data?.error?.message || err.message;
        console.warn(`[WA Flow Keys] Meta upload failed for integration ${integration.id}:`, uploadError);
      }
    }

    await pool.query(
      `INSERT INTO whatsapp_flow_encryption_keys (agency_id, integration_id, public_key_pem, private_key_encrypted, key_uploaded_to_meta)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE public_key_pem = VALUES(public_key_pem), private_key_encrypted = VALUES(private_key_encrypted), key_uploaded_to_meta = VALUES(key_uploaded_to_meta)`,
      [agencyId, integration.id, publicKeyPem, privateKeyEncrypted, uploaded ? 1 : 0]
    );

    return res.status(201).json({
      success: true,
      publicKeyPem,
      uploadedToMeta: uploaded,
      uploadError: uploaded ? null : (uploadError || "No access token on file for this integration — upload the public key manually in Meta Business Manager."),
    });
  } catch (err) {
    console.error("POST /whatsapp-flow-keys error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/whatsapp-flow-keys/:integrationId", authMiddleware, roleMiddleware("RESELLER", "ADMIN"), async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    await pool.query("DELETE FROM whatsapp_flow_encryption_keys WHERE integration_id = ? AND agency_id = ?", [req.params.integrationId, agencyId]);
    return res.json({ success: true, message: "Key pair removed" });
  } catch (err) {
    console.error("DELETE /whatsapp-flow-keys error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── PROTECTED: recent Flow sessions (visibility into submissions, mirrors
// user_input_flow_responses for this app's own Flow Builder) ──────────────
router.get("/whatsapp-flow-sessions", authMiddleware, roleMiddleware("RESELLER", "ADMIN", "USER"), async (req, res) => {
  try {
    const agencyId = req.user.agencyId;
    const [rows] = await pool.query(
      `SELECT s.*, c.name AS contact_name, c.phone AS contact_phone, r.name AS flow_name
       FROM whatsapp_flow_sessions s
       LEFT JOIN contacts c ON c.id = s.contact_id
       LEFT JOIN whatsapp_flow_refs r ON r.id = s.flow_ref_id
       WHERE s.agency_id = ? ORDER BY s.updated_at DESC LIMIT 100`,
      [agencyId]
    );
    return res.json({ success: true, sessions: rows });
  } catch (err) {
    console.error("GET /whatsapp-flow-sessions error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── PUBLIC: Meta's encrypted data-exchange endpoint ────────────────────────
// No authMiddleware — Meta's servers call this directly, authenticated
// implicitly by the encryption itself (only whoever holds our RSA private
// key, i.e. us, can ever produce a valid decrypt). A decryption failure of
// any kind returns HTTP 421 per Meta's spec — the signal to refresh the
// public key — never a 401/403/500 that would look like a config error.
router.post("/whatsapp-flow-endpoint/:integrationId", async (req, res) => {
  const { integrationId } = req.params;
  try {
    const [[keyRow]] = await pool.query("SELECT * FROM whatsapp_flow_encryption_keys WHERE integration_id = ?", [integrationId]);
    if (!keyRow) {
      console.warn(`[WA Flow Endpoint] no encryption key on file for integration ${integrationId}`);
      return res.status(421).end();
    }

    const privateKeyPem = decryptSecret(keyRow.private_key_encrypted);

    let decrypted;
    try {
      decrypted = decryptFlowRequest(req.body || {}, privateKeyPem);
    } catch (err) {
      if (err instanceof FlowDecryptionError) {
        console.warn(`[WA Flow Endpoint] decryption failed for integration ${integrationId}:`, err.message);
        return res.status(421).end();
      }
      throw err;
    }

    const { body, aesKey, flippedIv } = decrypted;
    const { action, flow_token, screen, data } = body || {};

    if (action === "ping") {
      const encrypted = encryptFlowResponse({ data: { status: "active" } }, aesKey, flippedIv);
      res.setHeader("Content-Type", "text/plain");
      return res.send(encrypted);
    }

    // flow_token was minted and recorded the moment this Flow message was
    // actually sent (utils/platformSender.js) — that's the only link back to
    // which agency/contact/relay this exchange belongs to.
    const [[session]] = await pool.query("SELECT * FROM whatsapp_flow_sessions WHERE flow_token = ?", [flow_token]);

    let responsePayload;
    if (session?.relay_webhook_url) {
      try {
        const relayRes = await axios.post(
          session.relay_webhook_url,
          { action, screen, data, flow_token, agencyId: session.agency_id, contactId: session.contact_id },
          { timeout: 8000 }
        );
        responsePayload = relayRes.data;
      } catch (relayErr) {
        console.error(`[WA Flow Endpoint] relay webhook failed for token ${flow_token}:`, relayErr.message);
        responsePayload = { screen: "SUCCESS", data: { extension_message_response: { params: { flow_token, status: "COMPLETED" } } } };
      }
    } else {
      // No relay configured for this Flow — a safe generic terminal
      // response so Meta's client always gets SOMETHING back rather than
      // hanging with no reply at all.
      responsePayload = { screen: "SUCCESS", data: { extension_message_response: { params: { flow_token, status: "COMPLETED" } } } };
    }

    if (session) {
      const isTerminal = responsePayload?.screen === "SUCCESS";
      let mergedData = {};
      try { mergedData = JSON.parse(session.response_data || "{}"); } catch { mergedData = {}; }
      mergedData = { ...mergedData, ...(data || {}) };
      await pool.query(
        "UPDATE whatsapp_flow_sessions SET status = ?, last_screen = ?, response_data = ? WHERE id = ?",
        [isTerminal ? "COMPLETED" : "IN_PROGRESS", screen || session.last_screen, JSON.stringify(mergedData), session.id]
      );
    }

    const encrypted = encryptFlowResponse(responsePayload, aesKey, flippedIv);
    res.setHeader("Content-Type", "text/plain");
    return res.send(encrypted);
  } catch (err) {
    console.error("[WA Flow Endpoint] unexpected error:", err.message);
    return res.status(500).end();
  }
});

export default router;
