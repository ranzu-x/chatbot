import { useState } from 'react';
import { FileAudio, Loader2 } from 'lucide-react';
import { conversationAPI } from '../../services/api';
import { notify } from '../../utils/alerts';

/**
 * Under a voice message: its transcript, or a "Transcribe" button
 * (POST /conversations/:id/messages/:messageId/transcribe — the workspace's
 * AI provider). A transcript made automatically arrives over the socket.
 */
export default function TranscriptLine({ conversationId, message, onTranscribed }) {
  const [busy, setBusy] = useState(false);
  if (message.transcript) {
    return (
      <div style={{ fontSize: '0.78rem', fontStyle: 'italic', color: 'inherit', opacity: 0.85, marginTop: 4, display: 'flex', gap: 4 }}>
        <FileAudio size={12} style={{ flexShrink: 0, marginTop: 2 }} /> <span>“{message.transcript}”</span>
      </div>
    );
  }
  if (!message.id || String(message.id).startsWith('temp')) return null;
  const run = async () => {
    setBusy(true);
    try {
      const res = await conversationAPI.transcribe(conversationId, message.id);
      onTranscribed?.(message.id, res.data.transcript);
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not transcribe this message');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={run} disabled={busy}
      style={{ marginTop: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '0.74rem', fontWeight: 600, color: '#2563eb', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      {busy ? <Loader2 size={12} className="animate-spin" /> : <FileAudio size={12} />} Transcribe
    </button>
  );
}
