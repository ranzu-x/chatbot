/**
 * Declares every supported AI provider's identity, capabilities, and which
 * adapter implementation handles it — OpenAI, DeepSeek, Xiaomi MiMo and xAI
 * Grok all share one OpenAI-Chat-Completions-compatible adapter (just a
 * different base URL + model list); Anthropic and Gemini each have their
 * own adapter (see ./anthropicAdapter.js, ./geminiAdapter.js).
 *
 * `resolveCapability()` is the one function the rest of the AI Reply system
 * calls to actually get a usable, ready-to-call provider for a given
 * capability — it's what makes the "this provider can't see images, fall
 * back to one that can" behavior from the plan a single reusable call
 * instead of scattered per-feature logic.
 */
import pool from "../../db.js";
import { decryptSecret } from "../cryptoVault.js";
import { createOpenAICompatibleAdapter } from "./openAICompatibleAdapter.js";
import { anthropicAdapter } from "./anthropicAdapter.js";
import { geminiAdapter } from "./geminiAdapter.js";
import { resolveAiResource } from "../aiCredits/resource.js";
import { meterAdapter } from "../aiCredits/meter.js";

export const PROVIDERS = {
  openai: {
    id: "openai",
    label: "OpenAI",
    capabilities: ["text_generation", "vision", "audio_transcription", "embeddings", "tool_calling"],
    defaultModel: "gpt-4o-mini",
    models: ["gpt-4o-mini", "gpt-4o"],
    embeddingModel: "text-embedding-3-small",
    transcriptionModel: "whisper-1",
    adapter: createOpenAICompatibleAdapter({ baseUrl: "https://api.openai.com/v1", providerId: "openai", capabilities: ["text_generation", "vision", "audio_transcription", "embeddings", "tool_calling"] }),
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    capabilities: ["text_generation", "vision", "tool_calling"],
    defaultModel: "claude-sonnet-5",
    models: ["claude-sonnet-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-haiku-4-5-20251001"],
    embeddingModel: null,
    transcriptionModel: null,
    adapter: anthropicAdapter,
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    // The only provider with real video understanding (its own File API —
    // upload, poll, reference; see geminiAdapter.js's uploadAndWaitForFile).
    // Neither OpenAI-compatible providers nor Anthropic have anything like
    // it, so this capability is Gemini-exclusive by design, not an oversight.
    capabilities: ["text_generation", "vision", "audio_transcription", "video_understanding", "embeddings", "tool_calling"],
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
    embeddingModel: "text-embedding-004",
    transcriptionModel: "gemini-2.5-flash", // no separate transcription model — reuses its own chat model via inline audio, see geminiAdapter.js's transcribe()
    adapter: geminiAdapter,
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    capabilities: ["text_generation", "vision", "tool_calling"],
    defaultModel: "deepseek-v4-pro",
    models: ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp"],
    embeddingModel: null,
    adapter: createOpenAICompatibleAdapter({ baseUrl: "https://api.deepseek.com/v1", providerId: "deepseek", capabilities: ["text_generation", "vision", "tool_calling"] }),
  },
  mimo: {
    id: "mimo",
    label: "Xiaomi MiMo",
    capabilities: ["text_generation", "tool_calling"],
    defaultModel: "mimo-v2.5-pro",
    models: ["mimo-v2.5-pro", "mimo-v2.5"],
    embeddingModel: null,
    adapter: createOpenAICompatibleAdapter({ baseUrl: "https://api.xiaomimimo.com/v1", providerId: "mimo", capabilities: ["text_generation", "tool_calling"] }),
  },
  grok: {
    id: "grok",
    label: "xAI Grok",
    capabilities: ["text_generation", "vision", "tool_calling"],
    defaultModel: "grok-4.1-fast",
    models: ["grok-4.1-fast", "grok-4.3", "grok-4.6"],
    embeddingModel: null,
    adapter: createOpenAICompatibleAdapter({ baseUrl: "https://api.x.ai/v1", providerId: "grok", capabilities: ["text_generation", "vision", "tool_calling"] }),
  },
};

// Fallback priority when the caller has no preference — widest-capability,
// generally-cheapest-per-capability providers first.
const DEFAULT_PRIORITY = ["openai", "gemini", "anthropic", "deepseek", "grok", "mimo"];

export function providerSupports(providerId, capability) {
  return PROVIDERS[providerId]?.capabilities.includes(capability) ?? false;
}

async function loadAgencyProvidersRaw(agencyId) {
  const [rows] = await pool.query(
    "SELECT provider, credentials, default_model FROM ai_providers WHERE agency_id = ? AND enabled = 1",
    [agencyId]
  );
  return rows
    .filter((r) => PROVIDERS[r.provider]) // ignore any row for a provider id we no longer recognize
    .map((r) => {
      let apiKey = null;
      try {
        const decrypted = JSON.parse(decryptSecret(r.credentials));
        apiKey = decrypted?.apiKey || null;
      } catch {
        apiKey = null;
      }
      return { id: r.provider, model: r.default_model || PROVIDERS[r.provider].defaultModel, apiKey };
    })
    .filter((r) => r.apiKey);
}

/**
 * Finds the best configured, enabled provider for a capability.
 *
 * AI resource (utils/aiCredits/resource.js): this release serves every
 * workspace from the PLATFORM resource — the Super Admin's own providers
 * (the Platform workspace's ai_providers rows) — and meters every call in AI
 * credits (utils/aiCredits/meter.js): the returned adapter reserves credits
 * before calling the provider and throws AiCreditError when the workspace or
 * the platform pool can't cover it. Workspaces' own keys are kept but unused
 * (decided with the user). The old reseller-customer key inheritance
 * (custom_ai_api_for_resellers) is not used; a future RESELLER_API resource
 * would be resolved in resource.js instead.
 *
 * @param {number} agencyId - the workspace the call is FOR (its credits are spent)
 * @param {'text_generation'|'vision'|'audio_transcription'|'video_understanding'|'embeddings'|'tool_calling'} capability
 * @param {string|null} preferredProviderId - tried first if it also has the capability
 * @param {{ feature?: string, userId?: number, integrationId?: number, agentId?: number, conversationId?: number }} [context] - for the usage history
 * @returns {Promise<{ providerId: string, model: string, apiKey: string, adapter: object, meta: object, resource: string } | null>}
 */
export async function resolveCapability(agencyId, capability, preferredProviderId = null, context = {}) {
  const resource = await resolveAiResource(agencyId);
  if (!resource.providerAgencyId) return null;
  const configured = await loadAgencyProvidersRaw(resource.providerAgencyId);
  if (configured.length === 0) return null;

  const eligible = configured.filter((c) => providerSupports(c.id, capability));
  if (eligible.length === 0) return null;

  const ordered = preferredProviderId
    ? [...eligible.filter((c) => c.id === preferredProviderId), ...eligible.filter((c) => c.id !== preferredProviderId)]
    : [...eligible].sort((a, b) => DEFAULT_PRIORITY.indexOf(a.id) - DEFAULT_PRIORITY.indexOf(b.id));

  const chosen = ordered[0];
  const meta = PROVIDERS[chosen.id];
  const model = capability === "embeddings" ? (meta.embeddingModel || chosen.model)
    : capability === "audio_transcription" ? (meta.transcriptionModel || chosen.model)
    : chosen.model;
  return {
    providerId: chosen.id,
    model,
    apiKey: chosen.apiKey,
    adapter: resource.metered
      ? meterAdapter(meta.adapter, { agencyId, capability, providerId: chosen.id, model, resource: resource.type, context })
      : meta.adapter,
    meta,
    resource: resource.type,
  };
}

/** The providers the platform resource offers (for pickers such as an agent's preferred provider). No keys. */
export async function listResourceProviders(agencyId) {
  const resource = await resolveAiResource(agencyId);
  if (!resource.providerAgencyId) return [];
  return (await loadAgencyProvidersRaw(resource.providerAgencyId)).map((c) => ({ id: c.id, model: c.model }));
}
