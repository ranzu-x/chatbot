/**
 * API Developer — the narrow external REST surface a third party can call
 * with an agency's own API key (middleware/apiKeyMiddleware.js), instead of
 * the JWT cookie every dashboard route uses. Deliberately small: read
 * contacts, send a message to an existing contact — not a mirror of every
 * internal route. Mounted at /api/v1/public/* (see index.js) and NOT behind
 * authMiddleware/roleMiddleware at all — apiKeyMiddleware is this router's
 * own, separate auth.
 */
import express from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import pool from "../db.js";
import { apiKeyMiddleware, requireApiScope } from "../middleware/apiKeyMiddleware.js";
import { assertLimit } from "../utils/entitlements.js";
import { sendPlatformMessage } from "../utils/platformSender.js";
import { emitToAgency, emitToConversation } from "../utils/socket.js";

const router = express.Router();

// Keyed by the authenticated API key (not IP) — a well-behaved integration
// polling on a schedule shouldn't be throttled by other tenants' traffic,
// and one leaked/misbehaving key shouldn't need an IP block to contain.
const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  // req.apiKeyId is always a plain number once apiKeyMiddleware has run — the
  // IP fallback only matters before that (or if it's ever missing), and must
  // go through express-rate-limit v8's ipKeyGenerator() to safely normalize
  // IPv6 addresses (a raw IPv6 string is rejected at startup as ERR_ERL_KEY_GEN_IPV6).
  keyGenerator: (req) => (req.apiKeyId ? String(req.apiKeyId) : ipKeyGenerator(req.ip)),
  message: { success: false, message: "Too many requests — please slow down." },
});

router.use("/public/v1", apiKeyMiddleware, publicApiLimiter);

// ─── LIST CONTACTS ────────────────────────────────────────────────────────────
router.get("/public/v1/contacts", requireApiScope("contacts:read"), async (req, res) => {
  try {
    const agencyId = req.agencyId;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const [rows] = await pool.query(
      `SELECT id, platform, external_id, name, phone, email, subscription_status, is_blocked, created_at
       FROM contacts WHERE agency_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`,
      [agencyId, limit, offset]
    );
    return res.json({ success: true, contacts: rows, limit, offset });
  } catch (err) {
    console.error("Public API list contacts error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── GET ONE CONTACT ──────────────────────────────────────────────────────────
router.get("/public/v1/contacts/:id", requireApiScope("contacts:read"), async (req, res) => {
  try {
    const [[contact]] = await pool.query(
      `SELECT id, platform, external_id, name, phone, email, subscription_status, is_blocked, tags, created_at
       FROM contacts WHERE id = ? AND agency_id = ? LIMIT 1`,
      [req.params.id, req.agencyId]
    );
    if (!contact) return res.status(404).json({ success: false, message: "Contact not found" });
    try { contact.tags = typeof contact.tags === "string" ? JSON.parse(contact.tags || "[]") : (contact.tags || []); } catch { contact.tags = []; }
    return res.json({ success: true, contact });
  } catch (err) {
    console.error("Public API get contact error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── SEND A MESSAGE TO AN EXISTING CONTACT ───────────────────────────────────
// Deliberately scoped to contacts that already have a conversation (created
// via an inbound message or the dashboard) — this endpoint sends into an
// existing thread, it does not onboard brand-new contacts.
router.post("/public/v1/messages/send", requireApiScope("messages:send"), async (req, res) => {
  try {
    const agencyId = req.agencyId;
    const { contactId, body } = req.body || {};
    if (!contactId || !body || !String(body).trim()) {
      return res.status(400).json({ success: false, message: "contactId and body are required" });
    }

    const [[conv]] = await pool.query(
      `SELECT cv.id as conversation_id, cv.integration_id, c.external_id as contactExternalId, i.platform
       FROM conversations cv
       JOIN contacts c ON c.id = cv.contact_id
       JOIN integrations i ON i.id = cv.integration_id
       WHERE cv.contact_id = ? AND cv.agency_id = ?
       ORDER BY cv.last_message_at DESC LIMIT 1`,
      [contactId, agencyId]
    );
    if (!conv) {
      return res.status(404).json({ success: false, message: "No existing conversation found for this contact — this endpoint sends into an existing thread only." });
    }

    await assertLimit(agencyId, "max_monthly_messages", 1, null);

    const [[integration]] = await pool.query("SELECT * FROM integrations WHERE id = ?", [conv.integration_id]);
    const externalMsgId = await sendPlatformMessage(conv.platform, integration, conv.contactExternalId, { type: "TEXT", body: String(body) });

    const [msgResult] = await pool.query(
      `INSERT INTO messages (conversation_id, direction, type, body, external_msg_id, created_at)
       VALUES (?, 'OUTBOUND', 'TEXT', ?, ?, NOW())`,
      [conv.conversation_id, body, externalMsgId]
    );
    await pool.query("UPDATE conversations SET last_message_at = NOW() WHERE id = ?", [conv.conversation_id]);

    const [[savedMsg]] = await pool.query("SELECT * FROM messages WHERE id = ?", [msgResult.insertId]);
    emitToAgency(agencyId, "new_message", { conversationId: conv.conversation_id, message: savedMsg });
    emitToConversation(conv.conversation_id, "new_message", { conversationId: conv.conversation_id, message: savedMsg });

    return res.status(201).json({ success: true, messageId: msgResult.insertId, externalMsgId });
  } catch (err) {
    console.error("Public API send message error:", err);
    return res.status(err.status || 500).json({ success: false, message: err.message || "Failed to send message", code: err.code });
  }
});

export default router;
