/**
 * AI Credits — the ONE place that turns AI usage into credits (pure, no DB).
 *
 * Rates come from platform_settings.ai_credit_settings (Super Admin → AI
 * Credits → Settings): credits per input / output token, per provider and
 * model when set, else the default. 1 credit = 1 token by default, so the
 * existing per-package monthly "AI Token" limits keep their meaning.
 *
 * Calls whose provider returns no token counts (embeddings, transcription,
 * a provider that omits usage) are estimated here too, and the usage row is
 * flagged `estimated`. Nothing else in the app should compute credits.
 */

export const DEFAULT_CREDIT_SETTINGS = Object.freeze({
  defaultRates: { inputPerToken: 1, outputPerToken: 1 },
  modelRates: [],
  embeddingPerToken: 1,
  transcriptionCreditsPerCall: 300,
  minimumCreditsPerCall: 1,
  consumptionOrder: ["PACKAGE", "PURCHASED"],
  lowPlatformBalanceWarning: 500_000,
});

const BUCKETS = ["PACKAGE", "PURCHASED"];
const num = (v, fallback, { min = 0, max = 1_000_000 } = {}) => {
  // A blank value is "not set" — never 0 (Number(null) is 0, which would make a model free).
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

/** Cleans settings from the DB or the admin form — anything invalid falls back to the default. */
export function cleanCreditSettings(input = {}) {
  const d = DEFAULT_CREDIT_SETTINGS;
  const src = input && typeof input === "object" ? input : {};
  const order = Array.isArray(src.consumptionOrder) ? src.consumptionOrder.map(String).filter((b) => BUCKETS.includes(b)) : [];
  const fullOrder = [...new Set([...order, ...BUCKETS])];
  return {
    defaultRates: {
      inputPerToken: num(src.defaultRates?.inputPerToken, d.defaultRates.inputPerToken, { max: 10_000 }),
      outputPerToken: num(src.defaultRates?.outputPerToken, d.defaultRates.outputPerToken, { max: 10_000 }),
    },
    modelRates: (Array.isArray(src.modelRates) ? src.modelRates : [])
      .map((r) => ({
        provider: String(r?.provider || "").trim().toLowerCase().slice(0, 40),
        model: String(r?.model || "*").trim().slice(0, 100) || "*",
        inputPerToken: num(r?.inputPerToken, null, { max: 10_000 }),
        outputPerToken: num(r?.outputPerToken, null, { max: 10_000 }),
      }))
      .filter((r) => r.provider && r.inputPerToken !== null && r.outputPerToken !== null)
      .slice(0, 100),
    embeddingPerToken: num(src.embeddingPerToken, d.embeddingPerToken, { max: 10_000 }),
    transcriptionCreditsPerCall: Math.round(num(src.transcriptionCreditsPerCall, d.transcriptionCreditsPerCall, { max: 10_000_000 })),
    minimumCreditsPerCall: Math.round(num(src.minimumCreditsPerCall, d.minimumCreditsPerCall, { max: 1_000_000 })),
    consumptionOrder: fullOrder,
    lowPlatformBalanceWarning: Math.round(num(src.lowPlatformBalanceWarning, d.lowPlatformBalanceWarning, { max: 1e15 })),
  };
}

/** Rates for one provider + model: exact model rule, else the provider's "*" rule, else the default. */
export function ratesFor(settings, provider, model) {
  const p = String(provider || "").toLowerCase();
  const rules = settings.modelRates || [];
  const exact = rules.find((r) => r.provider === p && r.model === model);
  const wildcard = rules.find((r) => r.provider === p && r.model === "*");
  const rule = exact || wildcard;
  return rule
    ? { inputPerToken: rule.inputPerToken, outputPerToken: rule.outputPerToken }
    : settings.defaultRates;
}

/** Rough token count of text (≈ 4 characters per token) — only used when the provider gives none. */
export function estimateTokens(text) {
  const s = typeof text === "string" ? text : JSON.stringify(text ?? "");
  return Math.ceil(s.length / 4);
}

/** Input tokens of a chat request (system + history + tools), estimated. Media parts count a fixed amount. */
export function estimateChatInputTokens(messages = [], tools = []) {
  let tokens = 0;
  for (const m of Array.isArray(messages) ? messages : []) {
    if (typeof m?.content === "string") tokens += estimateTokens(m.content);
    else if (Array.isArray(m?.content)) {
      for (const part of m.content) {
        if (part?.type === "text") tokens += estimateTokens(part.text || "");
        else tokens += 1500; // an image / video part — providers bill these as a block of tokens
      }
    }
    tokens += 4; // per-message overhead
  }
  if (Array.isArray(tools) && tools.length) tokens += estimateTokens(JSON.stringify(tools));
  return tokens;
}

const ceilCredits = (settings, value) => Math.max(settings.minimumCreditsPerCall, Math.ceil(value));

/**
 * Credits for one call. kind: 'chat' | 'embedding' | 'transcription'.
 * For chat, inputTokens/outputTokens are the provider's numbers (or estimates).
 */
export function creditsForUsage(settings, { kind = "chat", provider, model, inputTokens = 0, outputTokens = 0 }) {
  if (kind === "transcription") return ceilCredits(settings, settings.transcriptionCreditsPerCall);
  if (kind === "embedding") return ceilCredits(settings, (Number(inputTokens) || 0) * settings.embeddingPerToken);
  const r = ratesFor(settings, provider, model);
  return ceilCredits(settings, (Number(inputTokens) || 0) * r.inputPerToken + (Number(outputTokens) || 0) * r.outputPerToken);
}

/** The most a chat call can cost: estimated input + the output cap. Reserved before the call. */
export function estimateChatCredits(settings, { provider, model, messages, tools, maxTokens }) {
  const input = estimateChatInputTokens(messages, tools);
  const output = Number(maxTokens) > 0 ? Number(maxTokens) : 1024;
  return { inputTokens: input, credits: creditsForUsage(settings, { kind: "chat", provider, model, inputTokens: Math.ceil(input * 1.2), outputTokens: output }) };
}

/**
 * Splits `credits` over the buckets in the configured order, given what each
 * has available. Returns { PACKAGE, PURCHASED, shortfall }.
 */
export function allocate(order, available, credits) {
  const out = { PACKAGE: 0, PURCHASED: 0, shortfall: 0 };
  let left = Math.max(0, Math.ceil(credits));
  for (const bucket of order) {
    if (left <= 0) break;
    const room = Math.max(0, available[bucket] ?? 0);
    const take = Math.min(room, left);
    out[bucket] += take;
    left -= take;
  }
  out.shortfall = left;
  return out;
}
