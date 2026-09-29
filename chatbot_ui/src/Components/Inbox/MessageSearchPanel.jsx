import { useEffect, useRef, useState, Fragment } from 'react';
import { Search, X, Loader2, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { conversationAPI } from '../../services/api';
import { highlightParts } from './highlightParts';

const DEBOUNCE_MS = 300;

const fmtWhen = (ts) => {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }), hour: 'numeric', minute: '2-digit',
  });
};

/**
 * Search inside the open conversation's history (server-side,
 * GET /conversations/:id/messages/search). Selecting a result calls
 * onJump(messageId, tokens); the Inbox loads the messages around it.
 * Remount per conversation (key) so results never leak between chats.
 */
export default function MessageSearchPanel({ conversationId, onJump, onClose, retentionDays }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [tokens, setTokens] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => () => abortRef.current?.abort(), []);

  const run = async (term, before = null) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError('');
    try {
      const res = await conversationAPI.searchMessages(
        conversationId,
        { q: term, limit: 20, ...(before ? { before } : {}) },
        { signal: ctrl.signal }
      );
      const rows = res.data?.results || [];
      setTokens(res.data?.tokens || []);
      setResults((prev) => (before ? [...prev, ...rows] : rows));
      setHasMore(Boolean(res.data?.hasMore));
    } catch (err) {
      if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      setError(err?.response?.data?.message || 'Search failed. Please try again.');
    } finally {
      if (abortRef.current === ctrl) setLoading(false);
    }
  };

  // Debounced search as you type; nothing is sent below 2 characters.
  useEffect(() => {
    const term = q.trim();
    if (term.replace(/"/g, '').length < 2) {
      abortRef.current?.abort();
      setResults([]);
      setHasMore(false);
      setLoading(false);
      setError('');
      return undefined;
    }
    const t = setTimeout(() => run(term), DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, conversationId]);

  const term = q.trim();
  const searched = term.replace(/"/g, '').length >= 2;

  return (
    <div
      style={{
        borderBottom: '1px solid var(--border, #e2e8f0)',
        background: 'var(--bg-card, #fff)',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '45%',
        minHeight: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px' }}>
        <Search size={15} color="#64748b" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && results[0]) { setActiveId(results[0].id); onJump(results[0].id, tokens); }
          }}
          placeholder="Search messages..."
          aria-label="Search messages in this conversation"
          style={{
            flex: 1, border: 'none', outline: 'none', fontSize: '0.84rem', background: 'transparent',
            color: 'var(--text-primary)', padding: '4px 0',
          }}
        />
        {loading && <Loader2 size={14} className="animate-spin" color="#64748b" />}
        {searched && !loading && (
          <span style={{ fontSize: '0.72rem', color: '#64748b', whiteSpace: 'nowrap' }}>
            {results.length}{hasMore ? '+' : ''} result{results.length === 1 && !hasMore ? '' : 's'}
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          title="Close search (Esc)"
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', padding: 2 }}
        >
          <X size={15} />
        </button>
      </div>

      {searched && (
        <div style={{ overflowY: 'auto', minHeight: 0, borderTop: '1px solid var(--border, #e2e8f0)' }}>
          {error && <div style={{ padding: '10px 16px', fontSize: '0.78rem', color: '#b91c1c' }}>{error}</div>}
          {!error && !loading && results.length === 0 && (
            <div style={{ padding: '12px 16px', fontSize: '0.78rem', color: '#64748b' }}>
              No messages match “{term}”.
              {retentionDays > 0 && ` Messages older than ${retentionDays} days are deleted automatically.`}
            </div>
          )}
          {results.map((r) => {
            const inbound = r.direction === 'INBOUND';
            const who = inbound ? 'Subscriber' : r.senderType === 'AGENT' ? 'Team' : r.senderType === 'AI' ? 'AI' : 'Bot';
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => { setActiveId(r.id); onJump(r.id, tokens); }}
                style={{
                  display: 'flex', gap: 10, width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer',
                  padding: '8px 16px', borderBottom: '1px solid var(--border, #f1f5f9)',
                  background: activeId === r.id ? 'var(--bg-selected, #eef2ff)' : 'transparent',
                }}
              >
                <span style={{ color: inbound ? '#2563eb' : '#64748b', marginTop: 2, flexShrink: 0 }}>
                  {inbound ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.7rem', color: '#64748b', marginBottom: 2 }}>
                    <span style={{ fontWeight: 600 }}>{who}</span>
                    <span>{fmtWhen(r.created_at)}</span>
                  </span>
                  <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.35, wordBreak: 'break-word' }}>
                    {highlightParts(r.snippet || '(no text)', tokens).map((p, i) => (
                      <Fragment key={i}>
                        {p.match
                          ? <mark style={{ background: '#fef08a', color: 'inherit', borderRadius: 2, padding: '0 1px' }}>{p.text}</mark>
                          : p.text}
                      </Fragment>
                    ))}
                  </span>
                </span>
              </button>
            );
          })}
          {hasMore && (
            <div style={{ textAlign: 'center', padding: 8 }}>
              <button
                type="button"
                disabled={loading}
                onClick={() => run(term, results[results.length - 1]?.id)}
                style={{ fontSize: '0.74rem', color: 'var(--primary-light, #2563eb)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              >
                Show older results
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
