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
    models: ["claude-sonnet-5", "claude-haiku-4-5-20251001"],
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
 * Loads this agency's enabled, credentialed providers from the DB.
 * Returns [{ id, model, apiKey }] — apiKey already decrypted, never logged.
 *
 * Reseller-customer inheritance (approved SaaS hierarchy plan §11): a
 * RESELLER_CUSTOMER with none of its own configured providers falls back to
 * its parent RESELLER's own providers, but ONLY when BOTH gates pass —
 * the platform-wide `custom_ai_api_for_resellers` toggle (platform_settings)
 * AND the reseller's own package having the `custom_ai_api` module enabled
 * (package_modules). Platform-level credentials are never involved either
 * way — a reseller customer either uses its own keys, its reseller's keys
 * (if both gates allow), or gets nothing, exactly like every other BYOK
 * surface in this app.
 */
async function loadAgencyProviders(agencyId) {
  const own = await loadAgencyProvidersRaw(agencyId);
  if (own.length) return own;

  try {
    const [[agency]] = await pool.query("SELECT account_type, parent_agency_id FROM agencies WHERE id = ?", [agencyId]);
    if (agency?.account_type !== "RESELLER_CUSTOMER" || !agency.parent_agency_id) return own;

    const [[platformGate]] = await pool.query("SELECT value FROM platform_settings WHERE setting_key = 'custom_ai_api_for_resellers'");
    const platformEnabled = platformGate ? Boolean((typeof platformGate.value === "string" ? JSON.parse(platformGate.value) : platformGate.value)?.enabled) : false;
    if (!platformEnabled) return own;

    // getAgencyEntitlements is defined in utils/entitlements.js, which
    // itself never imports this file — safe to import lazily here to avoid
    // a circular import between the two utils modules.
    const { getAgencyEntitlements } = await import("../entitlements.js");
    const resellerEntitlements = await getAgencyEntitlements(agency.parent_agency_id, null);
    const packageGateEnabled = Boolean(resellerEntitlements.modulesMap?.custom_ai_api?.isEnabled);
    if (!packageGateEnabled) return own;

    return await loadAgencyProvidersRaw(agency.parent_agency_id);
  } catch (err) {
    console.error("AI provider reseller-inheritance check failed:", err.message);
    return own;
  }
}

/**
 * Finds the best configured, enabled provider for a capability.
 * @param {number} agencyId
 * @param {'text_generation'|'vision'|'audio_transcription'|'video_understanding'|'embeddings'|'tool_calling'} capability
 * @param {string|null} preferredProviderId - tried first if it also has the capability
 * @returns {Promise<{ providerId: string, model: string, apiKey: string, adapter: object, meta: object } | null>}
 */
export async function resolveCapability(agencyId, capability, preferredProviderId = null) {
  const configured = await loadAgencyProviders(agencyId);
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
    adapter: meta.adapter,
    meta,
  };
}
