/**
 * Wraps a provider adapter so every call made through resolveCapability() is
 * metered: reserve an upper-bound estimate → call the provider → settle the
 * real usage (or release on failure). AI Reply, AI Rewrite, Inbox assist,
 * translation, transcription, knowledge indexing, comment replies… all get it
 * without knowing about credits. An AiCreditError is thrown BEFORE the
 * provider is called when the credits aren't there.
 *
 * `context` (optional, from the caller): { feature, userId, integrationId,
 * agentId, conversationId } — shown in the usage history.
 */
import { reserveCredits, settleCredits, releaseHold, getCreditSettings } from "./service.js";
import { estimateChatCredits, estimateTokens, creditsForUsage } from "./pricing.js";

const FEATURE_BY_CAPABILITY = {
  text_generation: "ai_text", vision: "ai_vision", video_understanding: "ai_video",
  embeddings: "ai_embeddings", audio_transcription: "ai_transcription", tool_calling: "ai_text",
};

export function meterAdapter(adapter, { agencyId, capability, providerId, model, resource = "PLATFORM", context = {} }) {
  if (!adapter || !agencyId) return adapter;
  const feature = context.feature || FEATURE_BY_CAPABILITY[capability] || "ai";
  const base = {
    feature, capability, provider: providerId, resource,
    userId: context.userId || null, integrationId: context.integrationId || null,
    agentId: context.agentId || null, conversationId: context.conversationId || null,
  };

  const wrapped = { ...adapter };

  if (typeof adapter.generate === "function") {
    wrapped.generate = async (args = {}) => {
      const settings = await getCreditSettings();
      const usedModel = args.model || model;
      const est = estimateChatCredits(settings, { provider: providerId, model: usedModel, messages: args.messages, tools: args.tools, maxTokens: args.maxTokens });
      const hold = await reserveCredits({ agencyId, credits: est.credits, feature });
      let result;
      try {
        result = await adapter.generate(args);
      } catch (err) {
        await releaseHold(hold).catch(() => {});
        throw err;
      }
      const inTok = result?.usage?.inputTokens;
      const outTok = result?.usage?.outputTokens;
      const estimated = inTok === null || inTok === undefined || outTok === null || outTok === undefined;
      await settleCredits(hold, {
        ...base, kind: "chat", model: usedModel,
        inputTokens: inTok ?? est.inputTokens,
        outputTokens: outTok ?? estimateTokens(result?.text || ""),
        estimated,
      }).catch(async (err) => {
        // Never lose the reply over bookkeeping; the hold job releases the hold.
        console.error("[AI credits] settle failed:", err.message);
      });
      return result;
    };
  }

  if (typeof adapter.embed === "function") {
    wrapped.embed = async (args = {}) => {
      const settings = await getCreditSettings();
      const texts = Array.isArray(args.texts) ? args.texts : [];
      const tokens = texts.reduce((s, t) => s + estimateTokens(String(t || "")), 0);
      const hold = await reserveCredits({ agencyId, credits: creditsForUsage(settings, { kind: "embedding", inputTokens: tokens }), feature });
      let result;
      try {
        result = await adapter.embed(args);
      } catch (err) {
        await releaseHold(hold).catch(() => {});
        throw err;
      }
      await settleCredits(hold, { ...base, kind: "embedding", model: args.model || model, inputTokens: tokens, outputTokens: 0, estimated: true })
        .catch((err) => console.error("[AI credits] settle failed:", err.message));
      return result;
    };
  }

  if (typeof adapter.transcribe === "function") {
    wrapped.transcribe = async (args = {}) => {
      const settings = await getCreditSettings();
      const hold = await reserveCredits({ agencyId, credits: creditsForUsage(settings, { kind: "transcription" }), feature });
      let result;
      try {
        result = await adapter.transcribe(args);
      } catch (err) {
        await releaseHold(hold).catch(() => {});
        throw err;
      }
      await settleCredits(hold, { ...base, kind: "transcription", model: args.model || model, inputTokens: null, outputTokens: estimateTokens(result?.text || ""), estimated: true })
        .catch((err) => console.error("[AI credits] settle failed:", err.message));
      return result;
    };
  }

  // uploadAndWaitForFile (Gemini video upload) costs nothing by itself — the
  // generate() call that uses the file is what's metered.
  return wrapped;
}
