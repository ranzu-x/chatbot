/**
 * Google Gemini (generativelanguage.googleapis.com) adapter. Unlike
 * OpenAI/Anthropic, the API key goes in the URL query string, not a header,
 * and role names differ ("model" instead of "assistant", no "system" role —
 * same system-prompt-splitting need as anthropicAdapter.js, plus a role
 * rename for the rest).
 */
import axios from "axios";
import { ProviderCallError } from "./errors.js";

const TIMEOUT_MS = 20000;
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// Normalized image/audio content (see openAICompatibleAdapter.js's
// normalizeMessages doc comment) translates to Gemini's
// `{inline_data:{mime_type, data}}` part — identical wire shape for any
// binary media type, Gemini just reads mime_type to know what it's looking
// at. A `video` part is different: video is too large to inline, so it's
// pre-uploaded via the File API (see uploadAndWaitForFile below) and
// referenced by URI instead — `{file_data:{mime_type, file_uri}}`. Plain
// string content becomes a single `{text}` part.
function toGeminiParts(content) {
  if (typeof content === "string" || !Array.isArray(content)) return [{ text: content }];
  return content.map((part) => {
    if (part.type === "image" || part.type === "audio") return { inline_data: { mime_type: part.mimeType, data: part.base64 } };
    if (part.type === "video") return { file_data: { mime_type: part.mimeType, file_uri: part.fileUri } };
    return { text: part.text };
  });
}

/** OpenAI-shaped {role:'system'|'user'|'assistant', content} -> Gemini's {systemInstruction, contents}. */
export function toGeminiContents(messages) {
  const systemParts = [];
  const contents = [];
  for (const m of messages || []) {
    if (m.role === "system") {
      systemParts.push(m.content);
    } else {
      contents.push({ role: m.role === "assistant" ? "model" : "user", parts: toGeminiParts(m.content) });
    }
  }
  return {
    systemInstruction: systemParts.length ? { parts: [{ text: systemParts.join("\n\n") }] } : undefined,
    contents,
  };
}

export function buildGenerateRequest({ apiKey, model, messages, tools, maxTokens }) {
  const { systemInstruction, contents } = toGeminiContents(messages);
  const body = { contents, generationConfig: { maxOutputTokens: maxTokens || 1024 } };
  if (systemInstruction) body.systemInstruction = systemInstruction;
  if (tools && tools.length > 0) {
    // OpenAI-shaped { type:'function', function:{name,description,parameters} } ->
    // Gemini's { functionDeclarations: [{name,description,parameters}] }.
    body.tools = [{
      functionDeclarations: tools.map((t) => ({
        name: t.function?.name || t.name,
        description: t.function?.description || t.description,
        parameters: t.function?.parameters || t.parameters || { type: "object", properties: {} },
      })),
    }];
  }
  return {
    url: `${BASE_URL}/models/${model}:generateContent?key=${apiKey}`,
    headers: { "Content-Type": "application/json" },
    body,
  };
}

export function buildEmbedRequest({ apiKey, model, texts }) {
  return {
    url: `${BASE_URL}/models/${model}:batchEmbedContents?key=${apiKey}`,
    headers: { "Content-Type": "application/json" },
    body: { requests: texts.map((t) => ({ model: `models/${model}`, content: { parts: [{ text: t }] } })) },
  };
}

export function parseGenerateResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.filter((p) => p.text).map((p) => p.text).join("");
  const toolCalls = parts
    .filter((p) => p.functionCall)
    .map((p, i) => ({ id: `${p.functionCall.name}_${i}`, name: p.functionCall.name, arguments: p.functionCall.args || {} }));
  return {
    text,
    toolCalls,
    usage: {
      inputTokens: data?.usageMetadata?.promptTokenCount ?? null,
      outputTokens: data?.usageMetadata?.candidatesTokenCount ?? null,
    },
  };
}

export function parseEmbedResponse(data) {
  return (data?.embeddings || []).map((e) => e.values);
}

async function callWithTimeout(url, body, headers) {
  let res;
  try {
    res = await axios.post(url, body, { headers, timeout: TIMEOUT_MS, validateStatus: () => true });
  } catch (err) {
    throw new ProviderCallError("gemini", err.code === "ECONNABORTED" ? "Request timed out" : err.message, { cause: err });
  }
  if (res.status < 200 || res.status >= 300) {
    throw new ProviderCallError("gemini", res.data?.error?.message || `HTTP ${res.status}`, { status: res.status });
  }
  return res;
}

async function generate({ apiKey, model, messages, tools, maxTokens }) {
  const { url, headers, body } = buildGenerateRequest({ apiKey, model, messages, tools, maxTokens });
  const res = await callWithTimeout(url, body, headers);
  return parseGenerateResponse(res.data);
}

async function embed({ apiKey, model, texts }) {
  const { url, headers, body } = buildEmbedRequest({ apiKey, model, texts });
  const res = await callWithTimeout(url, body, headers);
  return parseEmbedResponse(res.data);
}

// Gemini has no separate transcription endpoint — generateContent natively
// accepts audio as an inline_data part (the same mechanism images use), so
// transcription is just a generate() call asking for a literal transcript.
async function transcribe({ apiKey, model, buffer, mimeType }) {
  const { url, headers, body } = buildGenerateRequest({
    apiKey, model,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Transcribe this audio exactly, word for word. Reply with ONLY the transcript, no commentary." },
        { type: "audio", mimeType, base64: buffer.toString("base64") },
      ],
    }],
    maxTokens: 2000,
  });
  const res = await callWithTimeout(url, body, headers);
  return { text: parseGenerateResponse(res.data).text };
}

const UPLOAD_BASE_URL = "https://generativelanguage.googleapis.com";
const FILE_POLL_INTERVAL_MS = 3000;
const FILE_POLL_TIMEOUT_MS = 45000; // caps total wait — routes/webhook.js already ACKs the platform before this runs, but routes/webchat.js's own HTTP response is still held open on this, so this can't wait forever

/**
 * Video is too large to send inline like image/audio — Gemini's File API
 * needs it uploaded first (a 3-step resumable-upload protocol), then polled
 * until processing finishes, before it can be referenced in a
 * generateContent call. Only Gemini has anything like this — see
 * registry.js's `video_understanding` capability, which only Gemini
 * declares, and the openAI-compatible/Anthropic adapters' stubs below.
 * Returns `{ fileUri, mimeType }`, ready to drop into a `video` content part.
 */
async function uploadAndWaitForFile({ apiKey, buffer, mimeType, displayName }) {
  // Step 1: start the resumable upload session.
  let startRes;
  try {
    startRes = await axios.post(
      `${UPLOAD_BASE_URL}/upload/v1beta/files`,
      { file: { display_name: displayName || "video" } },
      {
        headers: {
          "x-goog-api-key": apiKey,
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(buffer.length),
          "X-Goog-Upload-Header-Content-Type": mimeType,
          "Content-Type": "application/json",
        },
        timeout: TIMEOUT_MS,
        validateStatus: () => true,
      }
    );
  } catch (err) {
    throw new ProviderCallError("gemini", err.code === "ECONNABORTED" ? "Upload start timed out" : err.message, { cause: err });
  }
  if (startRes.status < 200 || startRes.status >= 300) {
    throw new ProviderCallError("gemini", startRes.data?.error?.message || `Upload start failed: HTTP ${startRes.status}`, { status: startRes.status });
  }
  const uploadUrl = startRes.headers["x-goog-upload-url"];
  if (!uploadUrl) throw new ProviderCallError("gemini", "Upload session URL missing from Gemini's response");

  // Step 2: send the actual bytes, finalizing in the same call.
  let uploadRes;
  try {
    uploadRes = await axios.post(uploadUrl, buffer, {
      headers: {
        "Content-Length": String(buffer.length),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize",
      },
      timeout: 60000, // a real video upload can take longer than the usual 20s ceiling
      validateStatus: () => true,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  } catch (err) {
    throw new ProviderCallError("gemini", err.code === "ECONNABORTED" ? "Upload timed out" : err.message, { cause: err });
  }
  if (uploadRes.status < 200 || uploadRes.status >= 300) {
    throw new ProviderCallError("gemini", uploadRes.data?.error?.message || `Upload failed: HTTP ${uploadRes.status}`, { status: uploadRes.status });
  }
  const file = uploadRes.data?.file || uploadRes.data;
  if (!file?.name) throw new ProviderCallError("gemini", "Upload response had no file name to poll");

  // Step 3: poll until Gemini finishes processing the video.
  const deadline = Date.now() + FILE_POLL_TIMEOUT_MS;
  let state = file.state;
  let fileUri = file.uri;
  while (state !== "ACTIVE") {
    if (state === "FAILED") throw new ProviderCallError("gemini", "Gemini failed to process the video");
    if (Date.now() > deadline) throw new ProviderCallError("gemini", "Timed out waiting for Gemini to finish processing the video");
    await new Promise((resolve) => setTimeout(resolve, FILE_POLL_INTERVAL_MS));
    let pollRes;
    try {
      pollRes = await axios.get(`${BASE_URL}/${file.name}`, {
        headers: { "x-goog-api-key": apiKey },
        timeout: TIMEOUT_MS,
        validateStatus: () => true,
      });
    } catch (err) {
      throw new ProviderCallError("gemini", err.message, { cause: err });
    }
    if (pollRes.status < 200 || pollRes.status >= 300) {
      throw new ProviderCallError("gemini", pollRes.data?.error?.message || `File status check failed: HTTP ${pollRes.status}`, { status: pollRes.status });
    }
    state = pollRes.data?.state;
    fileUri = pollRes.data?.uri || fileUri;
  }

  return { fileUri, mimeType: file.mimeType || mimeType };
}

export const geminiAdapter = { generate, embed, transcribe, uploadAndWaitForFile };
