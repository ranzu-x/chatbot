/**
 * Live Chat Translator — reuses the agency's already-configured AI provider
 * (utils/aiProviders/registry.js) via a plain translate-prompt, exactly like
 * routes/aiRewrite.js's "AI Rewrite" composer feature does, instead of
 * adding a dedicated translation SDK/vendor.
 */
import { resolveCapability } from "./aiProviders/registry.js";

const LANG_NAMES = {
  en: "English", es: "Spanish", fr: "French", de: "German", pt: "Portuguese",
  ar: "Arabic", hi: "Hindi", bn: "Bengali", ur: "Urdu", id: "Indonesian",
  zh: "Chinese", ja: "Japanese", ko: "Korean", ru: "Russian", tr: "Turkish",
};

/**
 * Translates `text` to `targetLang` (an ISO 639-1 code, e.g. "en") using the
 * agency's configured AI provider. Returns the translated string, or throws
 * a 400-status error if no AI provider is connected yet — the caller should
 * surface that as "connect an AI provider first", not a generic failure.
 */
export async function translateText(agencyId, text, targetLang) {
  const resolved = await resolveCapability(agencyId, "text_generation");
  if (!resolved) {
    const err = new Error("No AI provider is configured for this workspace yet. Connect one under Settings → AI Providers to use the translator.");
    err.status = 400;
    err.code = "AI_NOT_CONFIGURED";
    throw err;
  }

  const langLabel = LANG_NAMES[targetLang] || targetLang;
  const messages = [
    {
      role: "system",
      content: "You translate chat messages for a customer-support agent. Output ONLY the translated text — no preamble, no quotes, no explanation. If the text is already in the target language, return it unchanged.",
    },
    { role: "user", content: `Translate the following message to ${langLabel}:\n\n${text}` },
  ];

  const result = await resolved.adapter.generate({ apiKey: resolved.apiKey, model: resolved.model, messages, maxTokens: 500 });
  return (result?.text || "").trim();
}
