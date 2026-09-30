import pool from "../db.js";
import { resolveCapability } from "./aiProviders/registry.js";
import { fetchMessageMediaBytes } from "./mediaFetcher.js";
import { emitToAgency } from "./socket.js";

/**
 * Voice message → text with the workspace's transcription-capable AI
 * provider (OpenAI Whisper / Gemini — AI Providers page). Stored on
 * messages.transcript, pushed to the Inbox (`message_transcribed`). Used by
 * the Inbox "Transcribe" button and, when inbox_settings.auto_transcribe is
 * on, for every incoming voice message.
 */
export async function transcribeMessage(agencyId, messageId) {
  const [[msg]] = await pool.query(
    `SELECT m.id, m.type, m.transcript, m.conversation_id FROM messages m
     JOIN conversations cv ON cv.id = m.conversation_id
     WHERE m.id = ? AND cv.agency_id = ?`,
    [messageId, agencyId]
  );
  if (!msg) { const e = new Error("Message not found"); e.status = 404; throw e; }
  if (msg.transcript) return msg.transcript;
  if (msg.type !== "AUDIO") { const e = new Error("Only voice / audio messages can be transcribed"); e.status = 400; throw e; }

  const provider = await resolveCapability(agencyId, "audio_transcription", null, { feature: "transcription" });
  if (!provider) { const e = new Error("Connect an AI provider that can transcribe audio (OpenAI or Google Gemini) under AI Providers"); e.status = 400; throw e; }
  const media = await fetchMessageMediaBytes(msg.id);
  if (!media) { const e = new Error("Could not download the audio"); e.status = 502; throw e; }
  const result = await provider.adapter.transcribe({ apiKey: provider.apiKey, model: provider.model, buffer: media.buffer, mimeType: media.mime });
  const text = String(result?.text || "").trim() || "(no speech)";
  await pool.query("UPDATE messages SET transcript = ? WHERE id = ?", [text, msg.id]);
  emitToAgency(agencyId, "message_transcribed", { conversationId: msg.conversation_id, messageId: msg.id, transcript: text });
  return text;
}
