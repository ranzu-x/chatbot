/**
 * Anthropic Messages API adapter. Anthropic has no embeddings endpoint of
 * its own — embed() always throws CapabilityNotSupportedError, which is
 * exactly the signal resolveCapability() (registry.js) uses to fall back to
 * a different configured provider for embeddings, per the plan's capability
 * fallback design (this is the expected case, not a bug).
 *
 * Same pure-request-builder-vs-network-call split as openAICompatibleAdapter.js,
 * for the same reason (testable request shape, no live network needed).
 */
import axios from "axios";
import { ProviderCallError, CapabilityNotSupportedError } from "./errors.js";

const TIMEOUT_MS = 20000;
const API_VERSION = "2023-06-01";
const BASE_URL = "https://api.anthropic.com/v1";

/**
 * Anthropic keeps the system prompt as its own top-level field, not a
 * message with role "system" — split any such messages out of the generic
 * OpenAI-shaped `messages` array this adapter is called with.
 */
// Normalized image content (see openAICompatibleAdapter.js's normalizeMessages
// doc comment) translates to Anthropic's `{type:'image', source:{type:'base64', ...}}`
// block shape; plain string content is left untouched. Anthropic's Messages
// API has no audio input at all (registry.js never advertises
// audio_transcription for it, so resolveCapability never routes an audio
// message here) — an 'audio' part is defensively swapped for a text note
// instead of silently dropping the customer's message if this is ever
// reached some other way.
function toAnthropicContent(content) {
  if (typeof content === "string" || !Array.isArray(content)) return content;
  return content.map((part) => {
    if (part.type === "image") return { type: "image", source: { type: "base64", media_type: part.mimeType, data: part.base64 } };
    if (part.type === "audio") return { type: "text", text: "[The customer sent an audio message, which this provider can't listen to.]" };
    if (part.type === "video") return { type: "text", text: "[The customer sent a video, which this provider can't watch.]" };
    return { type: "text", text: part.text };
  });
}

export function splitSystemMessages(messages) {
  const systemParts = [];
  const rest = [];
  for (const m of messages || []) {
    if (m.role === "system") systemParts.push(m.content);
    else rest.push({ role: m.role, content: toAnthropicContent(m.content) });
  }
  return { system: systemParts.join("\n\n") || undefined, messages: rest };
}

export function buildGenerateRequest({ apiKey, model, messages, tools, maxTokens }) {
  const { system, messages: rest } = splitSystemMessages(messages);
  const body = { model, max_tokens: maxTokens || 1024, messages: rest };
  if (system) body.system = system;
  if (tools && tools.length > 0) {
    // Anthropic's tool shape: { name, description, input_schema } — translate
    // from the OpenAI-shaped { type:'function', function:{name,description,parameters} }
    // tools this adapter is called with, so every call site can pass one tool
    // shape regardless of which provider ends up handling the request.
    body.tools = tools.map((t) => ({
      name: t.function?.name || t.name,
      description: t.function?.description || t.description,
      input_schema: t.function?.parameters || t.input_schema || { type: "object", properties: {} },
    }));
  }
  return {
    url: `${BASE_URL}/messages`,
    headers: { "x-api-key": apiKey, "anthropic-version": API_VERSION, "content-type": "application/json" },
    body,
  };
}

export function parseGenerateResponse(data) {
  const blocks = data?.content || [];
  const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
  const toolCalls = blocks
    .filter((b) => b.type === "tool_use")
    .map((b) => ({ id: b.id, name: b.name, arguments: b.input || {} }));
  return {
    text,
    toolCalls,
    usage: {
      inputTokens: data?.usage?.input_tokens ?? null,
      outputTokens: data?.usage?.output_tokens ?? null,
    },
  };
}

async function generate({ apiKey, model, messages, tools, maxTokens }) {
  const { url, headers, body } = buildGenerateRequest({ apiKey, model, messages, tools, maxTokens });
  let res;
  try {
    res = await axios.post(url, body, { headers, timeout: TIMEOUT_MS, validateStatus: () => true });
  } catch (err) {
    throw new ProviderCallError("anthropic", err.code === "ECONNABORTED" ? "Request timed out" : err.message, { cause: err });
  }
  if (res.status < 200 || res.status >= 300) {
    throw new ProviderCallError("anthropic", res.data?.error?.message || `HTTP ${res.status}`, { status: res.status });
  }
  return parseGenerateResponse(res.data);
}

// eslint-disable-next-line no-unused-vars
async function embed({ apiKey, model, texts }) {
  throw new CapabilityNotSupportedError("anthropic", "embeddings");
}

// eslint-disable-next-line no-unused-vars
async function transcribe({ apiKey, model, buffer, mimeType }) {
  throw new CapabilityNotSupportedError("anthropic", "audio_transcription");
}

// eslint-disable-next-line no-unused-vars
async function uploadAndWaitForFile({ apiKey, buffer, mimeType, displayName }) {
  throw new CapabilityNotSupportedError("anthropic", "video_understanding");
}

export const anthropicAdapter = { generate, embed, transcribe, uploadAndWaitForFile };
