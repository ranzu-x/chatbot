import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanCreditSettings, creditsForUsage, ratesFor, allocate, estimateChatCredits, estimateChatInputTokens, DEFAULT_CREDIT_SETTINGS,
} from "../utils/aiCredits/pricing.js";

const S = cleanCreditSettings({});

test("defaults: 1 credit per token, package first", () => {
  assert.deepEqual(S.defaultRates, { inputPerToken: 1, outputPerToken: 1 });
  assert.deepEqual(S.consumptionOrder, ["PACKAGE", "PURCHASED"]);
  assert.equal(creditsForUsage(S, { provider: "openai", model: "gpt-4o-mini", inputTokens: 120, outputTokens: 30 }), 150);
});

test("model rate beats provider rate beats the default", () => {
  const s = cleanCreditSettings({
    modelRates: [
      { provider: "anthropic", model: "*", inputPerToken: 2, outputPerToken: 4 },
      { provider: "anthropic", model: "claude-opus-5-5", inputPerToken: 5, outputPerToken: 10 },
    ],
  });
  assert.deepEqual(ratesFor(s, "anthropic", "claude-opus-5-5"), { inputPerToken: 5, outputPerToken: 10 });
  assert.deepEqual(ratesFor(s, "anthropic", "claude-sonnet-5"), { inputPerToken: 2, outputPerToken: 4 });
  assert.deepEqual(ratesFor(s, "openai", "gpt-4o"), s.defaultRates);
  assert.equal(creditsForUsage(s, { provider: "anthropic", model: "claude-opus-5-5", inputTokens: 100, outputTokens: 10 }), 600);
});

test("bad settings fall back to safe values; consumption order always lists both buckets", () => {
  const s = cleanCreditSettings({
    defaultRates: { inputPerToken: -1, outputPerToken: "abc" },
    consumptionOrder: ["PURCHASED", "BOGUS"],
    modelRates: [{ provider: "", inputPerToken: 1, outputPerToken: 1 }, { provider: "x", inputPerToken: null, outputPerToken: 1 }],
    minimumCreditsPerCall: -5,
  });
  assert.deepEqual(s.defaultRates, DEFAULT_CREDIT_SETTINGS.defaultRates);
  assert.deepEqual(s.consumptionOrder, ["PURCHASED", "PACKAGE"]);
  assert.equal(s.modelRates.length, 0);
  assert.equal(s.minimumCreditsPerCall, DEFAULT_CREDIT_SETTINGS.minimumCreditsPerCall);
});

test("embeddings and transcription (no token counts from the provider)", () => {
  assert.equal(creditsForUsage(S, { kind: "embedding", inputTokens: 250 }), 250);
  assert.equal(creditsForUsage(S, { kind: "transcription" }), S.transcriptionCreditsPerCall);
  assert.equal(creditsForUsage(S, { kind: "chat", inputTokens: 0, outputTokens: 0 }), S.minimumCreditsPerCall);
});

test("reservation estimate covers input + the output cap", () => {
  const messages = [{ role: "system", content: "x".repeat(400) }, { role: "user", content: "y".repeat(80) }];
  const est = estimateChatCredits(S, { provider: "openai", model: "gpt-4o-mini", messages, maxTokens: 600 });
  assert.equal(est.inputTokens, estimateChatInputTokens(messages));
  assert.ok(est.credits >= est.inputTokens + 600);
  const withImage = estimateChatInputTokens([{ role: "user", content: [{ type: "text", text: "hi" }, { type: "image", base64: "…" }] }]);
  assert.ok(withImage >= 1500);
});

test("allocate: package first, then purchased; shortfall when both are short", () => {
  assert.deepEqual(allocate(["PACKAGE", "PURCHASED"], { PACKAGE: 50, PURCHASED: 500 }, 120), { PACKAGE: 50, PURCHASED: 70, shortfall: 0 });
  assert.deepEqual(allocate(["PURCHASED", "PACKAGE"], { PACKAGE: 50, PURCHASED: 500 }, 120), { PACKAGE: 0, PURCHASED: 120, shortfall: 0 });
  assert.deepEqual(allocate(["PACKAGE", "PURCHASED"], { PACKAGE: 10, PURCHASED: 5 }, 40), { PACKAGE: 10, PURCHASED: 5, shortfall: 25 });
  assert.deepEqual(allocate(["PACKAGE", "PURCHASED"], { PACKAGE: -3, PURCHASED: 0 }, 1), { PACKAGE: 0, PURCHASED: 0, shortfall: 1 });
});
