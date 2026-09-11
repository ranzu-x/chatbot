/**
 * One adapter for every provider that speaks the OpenAI Chat Completions /
 * Embeddings wire format — OpenAI itself, DeepSeek, Xiaomi MiMo, and xAI
 * Grok are all compatible (same request/response JSON, different base URL
 * + model names), so this single implementation covers all four rather than
 * four near-duplicate adapters.
 *
 * Request-building is kept as pure functions (buildGenerateRequest/
 * buildEmbedRequest) separate from the actual axios call, specifically so
 * the request SHAPE can be unit-tested without a live network call or a
 * mocking library — see test_ai_provider_adapters.mjs.
 *
 * House style matches utils/outboundWebhook.js: fixed timeout,
 * validateStatus: () => true (handle non-2xx ourselves), never throw a raw
 * axios error — always a typed ProviderCallError.
 */
import axios from "axios";
import { ProviderCallError, CapabilityNotSupportedError } from "./errors.js";

const TIMEOUT_MS = 20000;

// Every adapter accepts the same normalized message shape: `content` is
// either a plain string, or an array of parts — `{type:'text', text}` /
// `{type:'image', mimeType, base64}` / `{type:'audio', mimeType, base64}` —
// for a multimodal call (see utils/aiReplyEngine.js's vision/audio
// fallback). This translates image/audio parts into OpenAI Chat
// Completions' own shapes; plain string content passes through untouched.
// (OpenAI's own audio-capable chat models want a plain format name rather
// than a full mime type — this only ever gets called by generate(), not
// transcribe(), which uses the real Whisper endpoint below instead.)
function audioFormatFromMime(mimeType) {
  if (/mp3|mpeg/.test(mimeType || "")) return "mp3";
  if (/wav/.test(mimeType || "")) return "wav";
  return "wav";
}
export function normalizeMessages(messages) {
  return (messages || []).map((m) => {
    if (typeof m.content === "string" || !Array.isArray(m.content)) return m;
    return {
      role: m.role,
      content: m.content.map((part) => {
        if (part.type === "image") return { type: "image_url", image_url: { url: `data:${part.mimeType};base64,${part.base64}` } };
        if (part.type === "audio") return { type: "input_audio", input_audio: { data: part.base64, format: audioFormatFromMime(part.mimeType) } };
        // No OpenAI-compatible provider understands video (registry.js only
        // ever grants video_understanding to Gemini) — defensive fallback,
        // not expected to be reached in practice.
        if (part.type === "video") return { type: "text", text: "[The customer sent a video, which this provider can't watch.]" };
        return { type: "text", text: part.text };
      }),
    };
  });
}

export function buildGenerateRequest({ baseUrl, apiKey, model, messages, tools, maxTokens }) {
  const body = {
    model,
    messages: normalizeMessages(messages),
    max_tokens: maxTokens || 1024,
  };
  if (tools && tools.length > 0) body.tools = tools;
  return {
    url: `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body,
  };
}

export function buildEmbedRequest({ baseUrl, apiKey, model, texts }) {
  return {
    url: `${baseUrl.replace(/\/$/, "")}/embeddings`,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: { model, input: texts },
  };
}

/** Normalizes a Chat Completions response into { text, toolCalls, usage }. */
export function parseGenerateResponse(data) {
  const choice = data?.choices?.[0];
  const message = choice?.message || {};
  return {
    text: message.content || "",
    toolCalls: (message.tool_calls || []).map((tc) => ({
      id: tc.id,
      name: tc.function?.name,
      arguments: safeJsonParse(tc.function?.arguments),
    })),
    usage: {
      inputTokens: data?.usage?.prompt_tokens ?? null,
      outputTokens: data?.usage?.completion_tokens ?? null,
    },
  };
}

/** Normalizes an Embeddings response into an array of float-array vectors, one per input text. */
export function parseEmbedResponse(data) {
  return (data?.data || []).map((row) => row.embedding);
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

/**
 * @param {{ baseUrl: string, providerId: string, capabilities: string[] }} config
 * @returns {{ generate: Function, embed: Function }}
 */
export function createOpenAICompatibleAdapter({ baseUrl, providerId, capabilities }) {
  const supports = (cap) => capabilities.includes(cap);

  async function generate({ apiKey, model, messages, tools, maxTokens }) {
    const { url, headers, body } = buildGenerateRequest({ baseUrl, apiKey, model, messages, tools, maxTokens });
    const res = await callWithTimeout(url, body, headers, providerId);
    return parseGenerateResponse(res.data);
  }

  async function embed({ apiKey, model, texts }) {
    if (!supports("embeddings")) throw new CapabilityNotSupportedError(providerId, "embeddings");
    const { url, headers, body } = buildEmbedRequest({ baseUrl, apiKey, model, texts });
    const res = await callWithTimeout(url, body, headers, providerId);
    return parseEmbedResponse(res.data);
  }

  // OpenAI's Whisper transcription is a SEPARATE REST endpoint from Chat
  // Completions (multipart file upload, not JSON) — only meaningful for
  // providers that actually declare audio_transcription (i.e. OpenAI itself;
  // DeepSeek/MiMo/Grok don't, so this throws for them exactly like embed()
  // does when unsupported).
  async function transcribe({ apiKey, model, buffer, mimeType }) {
    if (!supports("audio_transcription")) throw new CapabilityNotSupportedError(providerId, "audio_transcription");
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mimeType || "audio/ogg" }), "audio");
    form.append("model", model);
    let res;
    try {
      res = await axios.post(`${baseUrl.replace(/\/$/, "")}/audio/transcriptions`, form, {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: TIMEOUT_MS,
        validateStatus: () => true,
      });
    } catch (err) {
      throw new ProviderCallError(providerId, err.code === "ECONNABORTED" ? "Request timed out" : err.message, { cause: err });
    }
    if (res.status < 200 || res.status >= 300) {
      throw new ProviderCallError(providerId, res.data?.error?.message || `HTTP ${res.status}`, { status: res.status });
    }
    return { text: res.data?.text || "" };
  }

  // eslint-disable-next-line no-unused-vars
  async function uploadAndWaitForFile({ apiKey, buffer, mimeType, displayName }) {
    throw new CapabilityNotSupportedError(providerId, "video_understanding");
  }

  return { generate, embed, transcribe, uploadAndWaitForFile };
}

async function callWithTimeout(url, body, headers, providerId) {
  let res;
  try {
    res = await axios.post(url, body, { headers, timeout: TIMEOUT_MS, validateStatus: () => true });
  } catch (err) {
    throw new ProviderCallError(providerId, err.code === "ECONNABORTED" ? "Request timed out" : err.message, { cause: err });
  }
  if (res.status < 200 || res.status >= 300) {
    const msg = res.data?.error?.message || res.data?.message || `HTTP ${res.status}`;
    throw new ProviderCallError(providerId, msg, { status: res.status });
  }
  return res;
}
