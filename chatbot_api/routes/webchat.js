import express from "express";
import pool from "../db.js";
import { processFlow } from "../utils/flowEngine.js";
import { runAIReply } from "../utils/aiReplyEngine.js";
import {
  findOrCreateContact,
  findOrCreateConversation,
  saveMessage,
  matchBotRules,
} from "../utils/messageProcessor.js";
import { emitToAgency, emitToConversation } from "../utils/socket.js";
import { buildDeepLink } from "../utils/deepLinkBuilder.js";

const router = express.Router();

// A Chat Widget only ever works on the website(s) configured in its own
// `allowed_domains` (comma-separated) — enforced here, server-side, because
// the embed <script> and its public widgetKey are copyable by anyone; CORS
// on these routes intentionally allows any origin (see index.js) precisely
// because THIS check, not CORS, is the real authorization boundary.
//
// Every widget must have a website configured — an empty `allowed_domains`
// is treated as "not yet set up", not "any site allowed" (see
// checkWidgetOrigin below). Subdomains of a listed domain match too (e.g.
// "example.com" allows "shop.example.com") — a deliberate, existing product
// decision, not an oversight, and disclosed to the widget owner when they
// configure the domain (see ChatWidgetManager.jsx's creation prompt).
function isOriginAllowed(req, allowedDomainsRaw) {
  const list = (allowedDomainsRaw || "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);

  const sourceUrl = req.get("origin") || req.get("referer") || "";
  let host = "";
  try {
    host = new URL(sourceUrl).hostname.toLowerCase();
  } catch {
    host = "";
  }

  // Always permit local development / loopback origins so widgets can be tested locally
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return true;
  }

  if (!list.length) return false; // no domains configured -> deny by default
  if (!host) return false; // no usable Origin/Referer but domains ARE restricted — reject

  return list.some((d) => host === d || host.endsWith(`.${d}`));
}

// Shared gate for every public widget route: distinguishes "nobody has
// configured a website for this widget yet" (a setup gap the owner needs to
// fix) from "a website IS configured, but this request didn't come from it"
// (someone using a copied embed snippet on the wrong site) — same 403 status,
// different message, so the widget owner isn't left guessing which case it is.
function checkWidgetOrigin(req, widget) {
  if (!widget.allowed_domains || !widget.allowed_domains.trim()) {
    return { ok: false, status: 403, message: "This Chat Widget has not been configured with an authorized website yet." };
  }
  if (!isOriginAllowed(req, widget.allowed_domains)) {
    return { ok: false, status: 403, message: "This Chat Widget is not authorized for this website." };
  }
  return { ok: true };
}

async function resolveWidgetPrefill(widget) {
  if (widget.prefill_message && widget.prefill_message.trim()) {
    return widget.prefill_message.trim();
  }
  if (widget.flow_id) {
    try {
      const [[flow]] = await pool.query("SELECT nodes_json FROM flows WHERE id = ?", [widget.flow_id]);
      if (flow?.nodes_json) {
        const nodes = JSON.parse(flow.nodes_json || "[]");
        const start = nodes.find((n) => n.type === "start");
        const prefill = (start?.data?.prefillMessage || "").trim();
        if (prefill) return prefill;
      }
    } catch {}
  }
  return "";
}

// Shared shape between GET /webchat/config (styling only, fired on page load
// so the closed-state launcher button can be styled correctly before the
// visitor ever interacts) and POST /webchat/init's `widget` field below.
// `deepLink` is only populated for a DEEPLINK widget (see buildDeepLink) —
// null for an ordinary WEBCHAT widget, which has no external hand-off.
function serializeWidgetConfig(widget, deepLink = null, effectivePrefill = null) {
  return {
    widgetType: widget.widget_type || "WEBCHAT",
    targetPlatform: widget.target_platform || null,
    deepLink,
    name: widget.name,
    primaryColor: widget.primary_color,
    logoUrl: widget.logo_url,
    displayName: widget.display_name || widget.name,
    headerBgColor: widget.header_bg_color || widget.primary_color,
    headerTextColor: widget.header_text_color || "#ffffff",
    greetingMessage: widget.greeting_message,
    placeholderText: widget.placeholder_text,
    prefillMessage: effectivePrefill !== null ? effectivePrefill : widget.prefill_message,
    position: widget.position || "BOTTOM_RIGHT",
    openOnStartup: Boolean(widget.open_on_startup),
    offsetX: widget.offset_x ?? 20,
    offsetY: widget.offset_y ?? 20,
    buttonText: widget.button_text,
    buttonBgColor: widget.button_bg_color || widget.primary_color,
    buttonTextColor: widget.button_text_color || "#ffffff",
    buttonSize: widget.button_size || "MEDIUM",
  };
}

// Loads the integration a DEEPLINK widget points at (WhatsApp/Facebook/
// Telegram/Instagram) so its deep link can be computed — includes the
// Telegram bot_username join the same way routes/flows.js and
// routes/channels.js already do.
async function loadTargetIntegration(integrationId) {
  if (!integrationId) return null;
  const [[row]] = await pool.query(
    `SELECT i.platform, i.wa_display_phone, i.fb_page_id, i.ig_username, tb.bot_username AS tg_bot_username
     FROM integrations i
     LEFT JOIN telegram_bots tb ON tb.integration_id = i.id
     WHERE i.id = ?`,
    [integrationId]
  );
  return row || null;
}

// ─── GET ACTIVE WIDGETS FOR PUBLIC MARKETING / LANDING PAGES ─────────────────
router.get("/webchat/landing-widgets", async (req, res) => {
  try {
    // Public and unauthenticated, so it may only ever expose the PLATFORM's own
    // widgets (the ones the marketing site is meant to embed). It used to list
    // every active widget of every workspace, publishing each customer's widget
    // key and name to anyone and putting their chatbots on the platform's site.
    const [widgets] = await pool.query(
      `SELECT w.id, w.widget_key, w.name, w.widget_type, w.position
       FROM webchat_widgets w
       JOIN agencies a ON a.id = w.agency_id AND a.account_type = 'PLATFORM'
       WHERE w.is_active = 1 ORDER BY w.id ASC`
    );
    const widgetKeys = widgets.map((w) => w.widget_key);
    return res.json({ success: true, widgetKeys, widgets });
  } catch (err) {
    console.error("Landing widgets error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── WIDGET STYLING CONFIG (PUBLIC, no contact/conversation side-effects) ────
// Fired immediately on page load (before the visitor ever clicks anything)
// so the closed-state launcher button can be positioned/colored/labeled
// correctly from the start. Deliberately separate from POST /webchat/init
// below, which creates a contact+conversation — that stays lazy, firing only
// once the visitor actually opens the window, so simply loading a page that
// embeds the widget never creates a phantom conversation.
router.get("/webchat/config", async (req, res) => {
  try {
    const { widgetKey } = req.query;
    if (!widgetKey) return res.status(400).json({ success: false, message: "Widget key is required" });

    const [widgets] = await pool.query(
      "SELECT * FROM webchat_widgets WHERE widget_key = ? AND is_active = 1 LIMIT 1",
      [widgetKey]
    );
    if (!widgets.length) return res.status(404).json({ success: false, message: "Widget not found or inactive" });
    const widget = widgets[0];

    const originCheck = checkWidgetOrigin(req, widget);
    if (!originCheck.ok) return res.status(originCheck.status).json({ success: false, message: originCheck.message });

    const effectivePrefill = await resolveWidgetPrefill(widget);
    let deepLink = null;
    if (widget.widget_type === "DEEPLINK") {
      const target = await loadTargetIntegration(widget.integration_id);
      deepLink = buildDeepLink(target, { prefillMessage: effectivePrefill || widget.prefill_message });
    }

    return res.json({ success: true, widget: serializeWidgetConfig(widget, deepLink, effectivePrefill) });
  } catch (err) {
    console.error("Webchat config error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── INITIALIZE WEBCHAT SESSION (PUBLIC) ──────────────────────────────────────
router.post("/webchat/init", async (req, res) => {
  try {
    const { widgetKey, visitorId } = req.body;
    if (!widgetKey) {
      return res.status(400).json({ success: false, message: "Widget key is required" });
    }

    // Find webchat widget config
    const [widgets] = await pool.query(
      "SELECT * FROM webchat_widgets WHERE widget_key = ? AND is_active = 1 LIMIT 1",
      [widgetKey]
    );

    if (!widgets.length) {
      return res.status(404).json({ success: false, message: "Widget not found or inactive" });
    }
    const widget = widgets[0];

    const originCheck = checkWidgetOrigin(req, widget);
    if (!originCheck.ok) return res.status(originCheck.status).json({ success: false, message: originCheck.message });
    if (widget.widget_type === "DEEPLINK") {
      // A deep-link widget never runs a conversation on our side — widget.js
      // hands off straight to wa.me/m.me/t.me/ig.me instead of calling this
      // route at all. Guarded here too in case it's ever hit directly.
      return res.status(400).json({ success: false, message: "This widget hands off to an external app and has no chat session to initialize." });
    }
    const agencyId = widget.agency_id;
    const integrationId = widget.integration_id;

    // Load integration details
    const [integrations] = await pool.query(
      "SELECT * FROM integrations WHERE id = ? LIMIT 1",
      [integrationId]
    );
    const integration = integrations[0];

    // Generate session ID if not exists
    const sessId = visitorId || `visitor_${widgetKey}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Create or get contact
    const contact = await findOrCreateContact(
      agencyId,
      "WEBCHAT",
      sessId,
      `Webchat Visitor (${sessId.slice(-4)})`,
      null
    );

    // Create or get conversation
    const { conversation, isNew } = await findOrCreateConversation(
      agencyId,
      contact.id,
      integrationId,
      "WEBCHAT",
      contact._overLimit
    );

    // If new conversation, we can optionally send the greeting message
    if (isNew && widget.greeting_message) {
      // Save welcome message as bot message
      await pool.query(
        `INSERT INTO messages (conversation_id, direction, type, body, created_at)
         VALUES (?, 'OUTBOUND', 'TEXT', ?, NOW())`,
        [conversation.id, widget.greeting_message]
      );
    }

    // Load existing messages for this conversation
    const [messages] = await pool.query(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC",
      [conversation.id]
    );

    const effectivePrefill = await resolveWidgetPrefill(widget);

    return res.json({
      success: true,
      visitorId: sessId,
      conversationId: conversation.id,
      widget: serializeWidgetConfig(widget, null, effectivePrefill),
      messages,
    });
  } catch (err) {
    console.error("Webchat init error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── SEND VISITOR MESSAGE (PUBLIC) ────────────────────────────────────────────
router.post("/webchat/message", async (req, res) => {
  try {
    const { widgetKey, visitorId, conversationId, body } = req.body;
    if (!widgetKey || !visitorId || !conversationId || !body) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    // Verify widget
    const [widgets] = await pool.query(
      "SELECT * FROM webchat_widgets WHERE widget_key = ? AND is_active = 1 LIMIT 1",
      [widgetKey]
    );
    if (!widgets.length) {
      return res.status(404).json({ success: false, message: "Widget not found" });
    }
    const widget = widgets[0];

    // Previously only /webchat/config and /webchat/init checked this —
    // meaning once a conversation existed (via init), anyone holding the
    // widgetKey could keep sending messages into it from any origin. Same
    // gate as the other two public routes.
    const originCheck = checkWidgetOrigin(req, widget);
    if (!originCheck.ok) return res.status(originCheck.status).json({ success: false, message: originCheck.message });

    const agencyId = widget.agency_id;
    const integrationId = widget.integration_id;

    const [integrations] = await pool.query(
      "SELECT * FROM integrations WHERE id = ? LIMIT 1",
      [integrationId]
    );
    const integration = integrations[0];

    // Verify conversation
    const [convs] = await pool.query(
      "SELECT * FROM conversations WHERE id = ? AND agency_id = ? AND status != 'RESOLVED'",
      [conversationId, agencyId]
    );
    if (!convs.length) {
      return res.status(404).json({ success: false, message: "Conversation not found or resolved" });
    }
    const conversation = convs[0];

    // Get contact
    const [contacts] = await pool.query("SELECT * FROM contacts WHERE id = ?", [conversation.contact_id]);
    const contact = contacts[0];

    // A blocked visitor's messages are dropped before saving or any
    // bot/AI/agent notification — see migrate_block_subscriber.js.
    if (contact?.is_blocked) {
      return res.status(403).json({ success: false, message: "This conversation is no longer available." });
    }

    // Save message
    const message = await saveMessage(conversationId, "INBOUND", "TEXT", body, null);

    // Emit sockets
    emitToAgency(agencyId, "new_message", {
      conversationId,
      message,
    });
    emitToConversation(conversationId, "new_message", {
      conversationId,
      message,
    });

    const effectivePrefill = await resolveWidgetPrefill(widget);

    // Run Flow engine
    const flowRan = await processFlow(agencyId, "WEBCHAT", conversation, contact, body, integration, "TEXT", null, null, {
      widgetId: widget.id,
      widgetFlowId: widget.flow_id,
      widgetPrefillMessage: effectivePrefill || widget.prefill_message,
    });
    if (!flowRan) {
      // AI Reply "Always trigger" mode gets first refusal (no-op unless
      // this bot's trigger mode is actually ALWAYS — see aiReplyEngine.js).
      const aiRanEarly = await runAIReply(agencyId, "WEBCHAT", conversation, contact, body, integration, "TEXT", "always");
      if (!aiRanEarly) {
        // Run bot rules fallback
        const ruleRan = await matchBotRules(agencyId, "WEBCHAT", conversation, contact, body, integration);
        if (!ruleRan) {
          // AI Reply "Only when nothing else matches" mode (the default).
          await runAIReply(agencyId, "WEBCHAT", conversation, contact, body, integration, "TEXT", "fallback");
        }
      }
    }

    return res.json({ success: true, message });
  } catch (err) {
    console.error("Webchat message error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
