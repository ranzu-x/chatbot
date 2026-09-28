import { useCallback, useEffect, useState } from 'react';
import { Loader2, ThumbsUp, ThumbsDown, UserCheck, BookOpen, AlertTriangle, ExternalLink } from 'lucide-react';
import { aiAgentAPI } from '../../services/api';
import { notify } from '../../utils/alerts';

/**
 * AI Agent → Answer Review (chatbot_api routes/aiAgents.js /answers).
 * Every answer with the customer's question and the knowledge it used. Mark
 * answers good / bad; a corrected answer is added to the Agent's knowledge so
 * the next customer gets it right.
 */
const FILTERS = [
  { id: 'unreviewed', label: 'To review' },
  { id: 'all', label: 'All' },
  { id: 'no_sources', label: 'No knowledge used' },
  { id: 'handoff', label: 'Handed to a person' },
  { id: 'bad', label: 'Marked wrong' },
  { id: 'good', label: 'Marked good' },
];

export default function AnswerReviewSection({ agentId }) {
  const [filter, setFilter] = useState('unreviewed');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null); // log id
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    aiAgentAPI.getAnswers(agentId, { filter, page })
      .then((res) => setData(res.data))
      .catch(() => notify.error('Failed to load answers'));
  }, [agentId, filter, page]);
  useEffect(() => { setData(null); load(); }, [load]);

  const save = async (log, body) => {
    setBusy(log.id);
    try {
      const res = await aiAgentAPI.reviewAnswer(agentId, log.id, body);
      notify.success(res.data?.message || 'Saved');
      setEditing(null);
      load();
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Failed to save');
    } finally {
      setBusy(null);
    }
  };

  const stats = data?.last30Days;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Answer Review</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, marginBottom: 14, maxWidth: 560 }}>
        What customers asked and what this Agent answered. Mark wrong answers and write the right one — it's added to the Agent's knowledge straight away.
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 14 }}>
          {[
            ['Answers (30 days)', stats.answered],
            ['Marked good', stats.good],
            ['Marked wrong', stats.bad],
            ['Handed to a person', stats.handoffs],
            ['No knowledge used', stats.noSources],
          ].map(([label, value]) => (
            <div key={label} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 700 }}>{label}</div>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={`btn btn-sm ${filter === f.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setFilter(f.id); setPage(1); }}>
            {f.label}
          </button>
        ))}
      </div>

      {!data ? (
        <div style={{ padding: 30, textAlign: 'center' }}><Loader2 size={18} className="animate-spin" /></div>
      ) : data.answers.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 10 }}>
          Nothing here yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data.answers.map((a) => (
            <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: '#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                <span>{a.contact_name || 'Customer'} · {new Date(a.created_at).toLocaleString()}</span>
                {a.review_rating && (
                  <span style={{ fontWeight: 800, color: a.review_rating === 'GOOD' ? '#16a34a' : '#dc2626' }}>{a.review_rating === 'GOOD' ? 'Good' : 'Wrong'}</span>
                )}
              </div>
              <div style={{ fontSize: 12.5, marginBottom: 6 }}><b>Question:</b> {a.question || <i>(not recorded)</i>}</div>
              {a.handed_off ? (
                <div style={{ fontSize: 12.5, color: '#b45309', display: 'flex', gap: 6, alignItems: 'center' }}><UserCheck size={13} /> Handed to a person (the Agent wasn't sure)</div>
              ) : (
                <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', background: 'var(--bg-base, #f8fafc)', borderRadius: 8, padding: '8px 10px' }}>{a.answer}</div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, fontSize: 11 }}>
                {a.sources.length === 0 ? (
                  <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', color: '#b45309' }}><AlertTriangle size={12} /> No knowledge matched — answered from instructions only</span>
                ) : a.sources.map((src, i) => (
                  <span key={`${src.chunkId}-${i}`} title={`Match ${Math.round((src.score || 0) * 100)}%`} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', padding: '2px 8px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8' }}>
                    <BookOpen size={11} /> {src.title}
                    {src.url && <a href={src.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}><ExternalLink size={10} /></a>}
                  </span>
                ))}
              </div>
              {a.correction && editing !== a.id && (
                <div style={{ marginTop: 8, fontSize: 12, borderLeft: '3px solid #16a34a', paddingLeft: 8 }}><b>Correct answer (in knowledge):</b> {a.correction}</div>
              )}
              {editing === a.id ? (
                <div style={{ marginTop: 8 }}>
                  <textarea className="form-input" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="The right answer to this question" style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy === a.id} onClick={() => save(a, { rating: 'BAD', correction: draft })}>
                      {busy === a.id ? <Loader2 size={13} className="animate-spin" /> : 'Save & teach the Agent'}
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  {!a.handed_off && (
                    <button type="button" className="btn btn-secondary btn-sm" disabled={busy === a.id} onClick={() => save(a, { rating: 'GOOD' })}><ThumbsUp size={12} /> Good</button>
                  )}
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy === a.id || !a.question} onClick={() => { setEditing(a.id); setDraft(a.correction || ''); }}>
                    <ThumbsDown size={12} /> {a.handed_off ? 'Teach the answer' : a.correction ? 'Edit correct answer' : 'Wrong — correct it'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {data && pages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 12, fontSize: 12 }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          Page {page} of {pages}
          <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </>
  );
}
