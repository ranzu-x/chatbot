/**
 * Builds a platform's official click-to-chat deep link from a connected
 * integration row. Shared by routes/channels.js (widget list — shows the
 * agent what the widget resolves to) and routes/webchat.js (public config
 * endpoint — what the embedded widget.js actually opens on click).
 *
 * Formats researched against each platform's current official docs (not
 * assumed) — see chatbot_ui/src/Components/Engagement/ChatWidgetManager.jsx
 * for the same set of formats used in the per-channel LinkCard:
 *   - WhatsApp: wa.me/<intl number>?text=<encoded>          (Meta's click-to-chat; ?text= prefills the message box)
 *   - Facebook Messenger: m.me/<page id>?text=<encoded>      (Meta's m.me; ?text= prefills the message box on business Pages)
 *   - Telegram: t.me/<bot username>?start=<payload>          (standard bot deep link; NOT free text — it's the /start payload the bot reads)
 *   - Instagram: ig.me/m/<username>                          (Meta's documented ig.me links; no prefill-text parameter exists today)
 */
export function buildDeepLink(integration, { prefillMessage } = {}) {
  if (!integration) return null;
  const platform = (integration.platform || "").toUpperCase();

  if (platform === "WHATSAPP") {
    const phone = (integration.wa_display_phone || "").replace(/[^\d]/g, "");
    if (!phone) return null;
    const base = `https://wa.me/${phone}`;
    return prefillMessage ? `${base}?text=${encodeURIComponent(prefillMessage)}` : base;
  }

  if (platform === "FACEBOOK") {
    const pageId = integration.fb_page_id;
    if (!pageId) return null;
    const base = `https://m.me/${pageId}`;
    return prefillMessage ? `${base}?text=${encodeURIComponent(prefillMessage)}` : base;
  }

  if (platform === "TELEGRAM") {
    const username = integration.tg_bot_username;
    if (!username) return null;
    const base = `https://t.me/${username}`;
    // Telegram deep-link start payloads are restricted to A-Z a-z 0-9 _ - (64 char max) —
    // not free text like WhatsApp/Messenger's ?text=.
    const payload = (prefillMessage || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
    return payload ? `${base}?start=${payload}` : base;
  }

  if (platform === "INSTAGRAM") {
    const username = integration.ig_username;
    if (!username) return null;
    return `https://ig.me/m/${username}`; // no prefill-text parameter exists for ig.me today
  }

  return null;
}

// Whether this platform's deep link supports a free-text prefilled message
// (as opposed to Telegram's constrained /start payload, or Instagram's none
// at all) — used by the frontend to decide whether to show an editable
// "prefill message" input or a plain "Start Chat" button.
export function supportsFreeTextPrefill(platform) {
  return ["WHATSAPP", "FACEBOOK"].includes((platform || "").toUpperCase());
}
