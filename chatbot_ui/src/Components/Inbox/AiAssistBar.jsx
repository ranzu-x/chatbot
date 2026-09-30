import { useEffect, useState } from 'react';
import { Sparkles, ListChecks, Loader2, X, BookOpen } from 'lucide-react';
import { conversationAPI } from '../../services/api';
import { toast } from '../../lib/alerts';

/**
 * Inbox → above the composer: AI help for the person replying.
 *   Suggest replies  three replies to pick from — a pick only fills the reply
 *                    box (it's never sent automatically)
 *   Summarize        a few bullets about the chat, for a quick handover
 * Backed by POST /conversations/:id/ai/suggest-replies | /ai/summary
 * (chatbot_api/utils/inboxAssist.js). Resets when another chat is opened.
 */
const chip = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999,
  border: '1px solid var(--border, #e2e8f0)', background: 'var(--bg-card, #fff)', color: 'var(--text-secondary, #475569)',
  fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer',
};

export default function AiAssistBar({ conversationId, onUseReply, disabled }) {
  const [suggesting, setSuggesting] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [replies, setReplies] = useState(null); // { replies, usedKnowledge }
  const [summary, setSummary] = useState(null); // string[]

  useEffect(() => { setReplies(null); setSummary(null); }, [conversationId]);

  const failed = (err, fallback) => {
    const data = err?.response?.data;
    if (data?.code === 'AI_NOT_CONFIGURED') {
      toast.warning("AI isn't available yet", { description: data.message });
    } else if (data?.code === 'INSUFFICIENT_AI_CREDITS' || data?.code === 'PLATFORM_AI_CREDITS_EXHAUSTED') {
      // AI Credits (chatbot_api/utils/aiCredits) — the message says what to do.
      toast.warning('Not enough AI credits', {
        description: data.message,
        duration: 10000,
        ...(data.code === 'INSUFFICIENT_AI_CREDITS' ? { action: { label: 'AI Credits', onClick: () => window.location.assign('/ai-credits') } } : {}),
      });
    } else if (data?.code === 'AI_PROVIDER_ERROR') {
      // e.g. out of credit / invalid key — the provider's own reason, so it can be fixed
      toast.error('Your AI provider refused the request', { description: data.message, duration: 12000 });
    } else {
      toast.error(data?.message || fallback);
    }
  };

  const suggest = async () => {
    if (suggesting) return;
    setSuggesting(true);
    try {
      const res = await conversationAPI.aiSuggestReplies(conversationId);
      setReplies({ replies: res.data.replies || [], usedKnowledge: res.data.usedKnowledge });
    } catch (err) {
      failed(err, 'Could not get suggestions');
    } finally {
      setSuggesting(false);
    }
  };

  const summarize = async () => {
    if (summarizing) return;
    setSummarizing(true);
    try {
      const res = await conversationAPI.aiSummary(conversationId);
      setSummary(res.data.bullets || []);
    } catch (err) {
      failed(err, 'Could not summarize this chat');
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div style={{ padding: '6px 20px 0' }}>
      {summary && (
        <div style={{ marginBottom: 6, padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border, #e2e8f0)', background: 'var(--bg-hover, #f8fafc)', position: 'relative' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-tertiary, #64748b)', marginBottom: 3 }}>Chat summary</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.78rem', color: 'var(--text-primary, #0f172a)', lineHeight: 1.45 }}>
            {summary.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
          <button type="button" aria-label="Close summary" onClick={() => setSummary(null)} style={{ position: 'absolute', top: 6, right: 6, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary, #94a3b8)' }}><X size={14} /></button>
        </div>
      )}

      {replies && (
        <div style={{ marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {replies.replies.map((r, i) => (
            <button
              key={i}
              type="button"
              disabled={disabled}
              title={disabled ? 'Join the chat to reply' : 'Put this in the reply box (you can edit it before sending)'}
              onClick={() => { onUseReply(r); setReplies(null); }}
              style={{
                textAlign: 'left', padding: '7px 11px', borderRadius: 10, border: '1px solid var(--primary-light, #93c5fd)',
                background: 'var(--primary-soft, #eff6ff)', color: 'var(--text-primary, #0f172a)', fontSize: '0.8rem', lineHeight: 1.4,
                cursor: disabled ? 'not-allowed' : 'pointer', whiteSpace: 'pre-wrap',
              }}
            >
              {r}
            </button>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem', color: 'var(--text-tertiary, #94a3b8)' }}>
            <span>{replies.usedKnowledge ? <><BookOpen size={11} style={{ verticalAlign: -1 }} /> Uses your AI agent's knowledge · </> : ''}Pick one to edit before sending.</span>
            <button type="button" onClick={() => setReplies(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary, #94a3b8)', fontSize: '0.7rem' }}>Dismiss</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" style={chip} onClick={suggest} disabled={suggesting}>
          {suggesting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Suggest replies
        </button>
        <button type="button" style={chip} onClick={summarize} disabled={summarizing}>
          {summarizing ? <Loader2 size={12} className="animate-spin" /> : <ListChecks size={12} />} Summarize
        </button>
      </div>
    </div>
  );
}
