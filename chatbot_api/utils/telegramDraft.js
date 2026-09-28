import axios from "axios";

/**
 * Telegram "live" AI replies (Bot API sendMessageDraft). While the AI is
 * working, the customer sees a draft bubble: "Thinking…" first (a draft with
 * empty text), then the reply growing as the provider streams it. A draft is
 * only a preview — it disappears after ~30s and is never stored — so the
 * finished reply is still sent with the normal sendMessage (sendMsg), which
 * replaces it.
 *
 * Private chats only (positive chat ids). Every call is best-effort: a
 * refused draft never blocks or fails the real reply.
 */
const MIN_INTERVAL_MS = 900; // Telegram rate-limits edits; ~1 update per second is plenty
const KEEPALIVE_MS = 20000; // a draft lives ~30s; refresh it while the model is still thinking

export function createTelegramDraft(integration, chatId) {
  const token = integration?.access_token;
  const enabled = Boolean(token) && Number(chatId) > 0 && process.env.TELEGRAM_LIVE_DRAFTS !== "false";
  const draftId = 1 + Math.floor(Math.random() * 2_000_000_000);
  let lastText = null;
  let lastSentAt = 0;
  let pending = null;
  let timer = null;
  let keepAlive = null;
  let stopped = false;
  let failed = false;

  async function post(text) {
    if (!enabled || stopped || failed) return;
    lastSentAt = Date.now();
    lastText = text;
    try {
      await axios.post(
        `https://api.telegram.org/bot${token}/sendMessageDraft`,
        { chat_id: chatId, draft_id: draftId, text: text.slice(0, 4096) },
        { timeout: 5000 }
      );
    } catch (err) {
      // e.g. an older Bot API server or a group chat: stop trying for this reply.
      failed = true;
      console.warn("[Telegram draft] notice:", err.response?.data?.description || err.message);
    }
  }

  return {
    enabled,
    /** Shows the "Thinking…" bubble and keeps it alive until stop(). */
    start() {
      if (!enabled) return;
      post("");
      keepAlive = setInterval(() => post(lastText || ""), KEEPALIVE_MS);
    },
    /** The reply so far (the whole text, not just the new piece). Throttled. */
    update(textSoFar) {
      if (!enabled || stopped || failed || !textSoFar) return;
      pending = textSoFar;
      if (timer) return;
      const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastSentAt));
      timer = setTimeout(() => {
        timer = null;
        if (pending && pending !== lastText) post(pending);
      }, wait);
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (keepAlive) clearInterval(keepAlive);
    },
  };
}
