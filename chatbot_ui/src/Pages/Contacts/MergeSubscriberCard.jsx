import { useState, useEffect } from 'react';
import { GitMerge, Search, Loader2 } from 'lucide-react';
import { contactAPI } from '../../services/api';
import { notify, showAlert } from '../../utils/alerts';
import { contactIdentifier } from './subscriberUtils';

/**
 * "Merge with another subscriber" — keeps this subscriber and moves
 * everything of the chosen one into it (POST /contacts/:id/merge).
 * Mainly for WhatsApp: someone who first wrote with their number hidden
 * (username) and also exists as a phone subscriber, when WhatsApp itself
 * never told us both belong to one person.
 */
export default function MergeSubscriberCard({ contact, onMerged }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return undefined; }
    const t = setTimeout(() => {
      setSearching(true);
      contactAPI.search(term, 8)
        .then((res) => setResults((res.data?.contacts || []).filter((c) => c.id !== contact.id && c.platform === contact.platform)))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, contact.id, contact.platform]);

  const merge = async (other) => {
    const ok = await showAlert.confirm({
      title: `Merge "${other.name || contactIdentifier(other)}" into this subscriber?`,
      text: 'Their conversations, messages, labels, custom fields, sequences and orders move here, and the other subscriber is removed. This cannot be undone.',
      confirmButtonText: 'Yes, merge',
    });
    if (!ok) return;
    setMerging(true);
    try {
      await contactAPI.merge(contact.id, other.id);
      notify.success('Subscribers merged');
      setQ('');
      setResults([]);
      onMerged?.(other.id);
    } catch (err) {
      notify.error(err.response?.data?.message || 'Merge failed');
    } finally {
      setMerging(false);
    }
  };

  return (
    <div style={{ gridColumn: '1 / -1', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
        <GitMerge size={14} /> Merge with another subscriber
      </div>
      <p style={{ margin: '0 0 10px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        Same person listed twice (e.g. once by WhatsApp username, once by phone number)? Find the other one and merge it into this subscriber.
      </p>
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          className="form-input w-full"
          style={{ paddingLeft: 30 }}
          placeholder="Search by name or phone…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          disabled={merging}
        />
      </div>
      {(searching || results.length > 0 || (q.trim().length >= 2 && !searching)) && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {searching && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={12} className="animate-spin" /> Searching…</div>}
          {!searching && results.length === 0 && q.trim().length >= 2 && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No other subscriber of this channel matches.</div>
          )}
          {results.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface)' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || 'Unnamed'}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{contactIdentifier(r)}</div>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => merge(r)} disabled={merging}>
                {merging ? <Loader2 size={12} className="animate-spin" /> : <GitMerge size={12} />} Merge here
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
