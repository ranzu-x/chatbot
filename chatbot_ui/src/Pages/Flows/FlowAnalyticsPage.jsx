import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Edit3, Loader2, Users, Send, CheckCheck, Eye, MousePointerClick, Shuffle } from 'lucide-react';
import AppLayout from '../../Layout/AppLayout';
import useUrlState from '../../hooks/useUrlState';
import { flowAPI } from '../../services/api';
import { notify } from '../../utils/alerts';

/**
 * Flow → Analytics: how each step of one flow performs — how many people
 * reached it, its messages sent / delivered / read, and which buttons (or
 * Randomizer branches) they took. Counters come from flow_step_stats
 * (chatbot_api/utils/flowStats.js), GET /flows/:id/analytics.
 */

const RANGES = [
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: 'all', label: 'All time' },
];

const TYPE_LABEL = {
  start: 'Start', text: 'Text', buttons: 'Text message', interactive: 'Interactive', image: 'Image', video: 'Video',
  audio: 'Audio', file: 'File', quickReplies: 'Quick replies', listMenu: 'List menu', card: 'Card', carousel: 'Carousel',
  collectInput: 'Collect input', question: 'Question', condition: 'Condition', randomizer: 'Randomizer', delay: 'Delay',
  webhook: 'Webhook', httpApi: 'HTTP API', payment: 'Payment', handoff: 'Agent handoff', end: 'End', actions: 'Actions',
  startAutomation: 'Start automation', messageBlock: 'Send message', appointment: 'Appointment booking',
  whatsappTemplate: 'Message template', messengerTemplate: 'Utility template', whatsappCtaUrl: 'CTA URL button',
  telegramPoll: 'Poll', telegramChecklist: 'Checklist', orderStatus: 'Order tracking', marketingOptIn: 'Marketing opt-in',
  runUserInputFlow: 'User input flow', startSequenceAction: 'Start sequence', stopSequenceAction: 'Stop sequence',
};

const pct = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');
const num = (n) => Number(n || 0).toLocaleString();
const titleOf = (x) => (typeof x === 'string' ? x : (x?.title || x?.label || ''));

/** Steps in the order people meet them (breadth-first from Start), then any unconnected ones. */
function orderSteps(nodes, edges) {
  const start = nodes.find((n) => n.type === 'start');
  const seen = new Set();
  const order = [];
  const queue = start ? [start.id] : [];
  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    const node = nodes.find((n) => n.id === id);
    if (!node) continue;
    order.push(node);
    edges.filter((e) => e.source === id).forEach((e) => queue.push(e.target));
  }
  nodes.forEach((n) => { if (!seen.has(n.id)) order.push(n); });
  return order;
}

/** A short description of what the step says or does. */
function describe(node) {
  const d = node.data || {};
  const text = d.message || d.text || d.body || d.caption || d.question || d.title || '';
  if (node.type === 'messageBlock') {
    const first = (d.items || [])[0]?.data;
    return first?.message || first?.caption || `${(d.items || []).length} message(s)`;
  }
  if (node.type === 'start') return d.keywords?.length ? `Keywords: ${d.keywords.slice(0, 4).join(', ')}` : 'Flow entry';
  return String(text).trim();
}

/** Output labels for the step's options: buttons / replies / list items, or Randomizer branches. */
function outputsOf(node) {
  const d = node.data || {};
  if (node.type === 'randomizer') {
    return (d.branches || []).map((b, i) => ({ key: `branch-${i}`, label: `${b.label || String.fromCharCode(65 + i)} (${Number(b.weight) || 0}%)` }));
  }
  let options = d.buttons || d.quickReplies || d.replies || [];
  if (node.type === 'listMenu') {
    options = (d.lists || [{ items: d.items || [] }]).flatMap((l) => (l.sections ? l.sections.flatMap((s) => s.items || []) : (l.items || [])));
  }
  return options.map((o, i) => ({ key: `opt-${i}`, label: titleOf(o) || `Option ${i + 1}` }));
}

function StatTile({ icon, label, value, sub }) {
  const Icon = icon;
  return (
    <div style={{ flex: '1 1 160px', minWidth: 150, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-tertiary)' }}>
        <Icon size={13} /> {label}
      </div>
      <div style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** Entries per day — one series, bars with a hover tooltip. */
function EntriesChart({ daily, days }) {
  const [hover, setHover] = useState(null);
  const series = useMemo(() => {
    const byDate = new Map(daily.map((d) => [d.date, d.entries]));
    const count = days > 0 ? days : Math.max(1, daily.length ? Math.ceil((Date.now() - new Date(daily[0].date).getTime()) / 86400000) + 1 : 1);
    const out = [];
    for (let i = Math.min(count, 120) - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      out.push({ date: key, entries: byDate.get(key) || 0 });
    }
    return out;
  }, [daily, days]);
  const max = Math.max(1, ...series.map((s) => s.entries));
  const total = series.reduce((a, s) => a + s.entries, 0);

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>People entering the flow per day</h3>
        <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>max {num(max)} / day</span>
      </div>
      {total === 0 ? (
        <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
          Nobody entered this flow in this period.
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <div
            role="img"
            aria-label={`Entries per day, ${num(total)} in total`}
            style={{ height: 120, display: 'flex', alignItems: 'flex-end', gap: 2, borderBottom: '1px solid var(--border)' }}
            onMouseLeave={() => setHover(null)}
          >
            {series.map((s, i) => (
              <div
                key={s.date}
                onMouseEnter={() => setHover(i)}
                style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', cursor: 'default' }}
              >
                <div
                  style={{
                    width: '100%', height: `${(s.entries / max) * 100}%`, minHeight: s.entries ? 2 : 0,
                    background: 'var(--primary)', opacity: hover === null || hover === i ? 1 : 0.55,
                    borderRadius: '4px 4px 0 0', transition: 'opacity .1s',
                  }}
                />
              </div>
            ))}
          </div>
          {hover !== null && (
            <div
              style={{
                position: 'absolute', bottom: 128, left: `${((hover + 0.5) / series.length) * 100}%`, transform: 'translateX(-50%)',
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 9px',
                fontSize: '0.74rem', color: 'var(--text-primary)', boxShadow: 'var(--shadow-md)', whiteSpace: 'nowrap', pointerEvents: 'none',
              }}
            >
              <strong>{num(series[hover].entries)}</strong> <span style={{ color: 'var(--text-tertiary)' }}>on {new Date(`${series[hover].date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
            <span>{new Date(`${series[0].date}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            <span>Today</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FlowAnalyticsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [range, setRange] = useUrlState('range', '30', { allowed: RANGES.map((r) => r.id) });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    flowAPI.analytics(id, range)
      .then((res) => { if (!cancelled) { setData(res.data); setError(''); } })
      .catch((err) => {
        if (cancelled) return;
        setError(err.response?.status === 404 ? 'This flow no longer exists.' : 'Could not load the analytics.');
        if (err.response?.status !== 404) notify.error('Could not load the analytics');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, range]);

  const steps = useMemo(() => (data ? orderSteps(data.flow.nodes || [], data.flow.edges || []) : []), [data]);
  const stats = data?.steps || {};
  const startNode = steps.find((n) => n.type === 'start');
  const entries = startNode ? (stats[startNode.id]?.reached || 0) : 0;
  const totals = Object.values(stats).reduce(
    (a, s) => ({ sent: a.sent + s.sent, delivered: a.delivered + s.delivered, read: a.read + s.read, clicked: a.clicked + s.clicked }),
    { sent: 0, delivered: 0, read: 0, clicked: 0 }
  );

  return (
    <AppLayout>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '20px 20px 40px' }}>
        <button type="button" onClick={() => navigate(-1)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', padding: 0, marginBottom: 12, color: 'var(--text-tertiary)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
          <ArrowLeft size={14} /> Back
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {data?.flow?.name || 'Flow'} — Analytics
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
              How each step performs. Counting started when analytics was switched on; messages sent earlier aren't included.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div role="tablist" aria-label="Date range" style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              {RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={range === r.id}
                  onClick={() => setRange(r.id)}
                  style={{ padding: '6px 12px', fontSize: '0.78rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: range === r.id ? 'var(--primary)' : 'var(--bg-card)', color: range === r.id ? '#fff' : 'var(--text-secondary)' }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <Link to={`/flows/${id}/edit`} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Edit3 size={13} /> Edit flow
            </Link>
          </div>
        </div>

        {loading && !data ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-tertiary)' }}><Loader2 size={18} className="animate-spin" /> Loading analytics…</div>
        ) : error && !data ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-tertiary)' }}>{error}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, opacity: loading ? 0.6 : 1 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <StatTile icon={Users} label="Entered the flow" value={num(entries)} />
              <StatTile icon={Send} label="Messages sent" value={num(totals.sent)} />
              <StatTile icon={CheckCheck} label="Delivered" value={pct(totals.delivered, totals.sent)} sub={`${num(totals.delivered)} of ${num(totals.sent)}`} />
              <StatTile icon={Eye} label="Read" value={pct(totals.read, totals.sent)} sub={`${num(totals.read)} of ${num(totals.sent)}`} />
              <StatTile icon={MousePointerClick} label="Button taps" value={num(totals.clicked)} />
            </div>

            <EntriesChart daily={data.daily || []} days={Number(data.days) || 0} />

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>Steps</h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>
                  "Reached" counts every time a step ran; the bar shows it against the people who entered. Delivered / read come from WhatsApp and Messenger receipts.
                </p>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 760 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)', textAlign: 'left' }}>
                      {['Step', 'Reached', 'Sent', 'Delivered', 'Read', 'Taps / branches'].map((h) => (
                        <th key={h} style={{ padding: '9px 14px', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {steps.map((node) => {
                      const s = stats[node.id] || { reached: 0, sent: 0, failed: 0, delivered: 0, read: 0, clicked: 0, outputs: {} };
                      const outputs = outputsOf(node);
                      const share = entries > 0 ? Math.min(1, s.reached / entries) : 0;
                      const text = describe(node);
                      return (
                        <tr key={node.id} style={{ borderTop: '1px solid var(--border)', verticalAlign: 'top' }}>
                          <td style={{ padding: '10px 14px', maxWidth: 300 }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                              {node.type === 'randomizer' && <Shuffle size={12} />}
                              {TYPE_LABEL[node.type] || node.type}
                            </div>
                            {text && <div style={{ color: 'var(--text-tertiary)', fontSize: '0.74rem', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={text}>{text}</div>}
                          </td>
                          <td style={{ padding: '10px 14px', minWidth: 130 }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{num(s.reached)}</div>
                            {node.type !== 'start' && entries > 0 && (
                              <div title={`${pct(s.reached, entries)} of the people who entered`} style={{ marginTop: 5, height: 6, borderRadius: 4, background: 'var(--bg-hover)', overflow: 'hidden' }}>
                                <div style={{ width: `${share * 100}%`, height: '100%', background: 'var(--primary)', borderRadius: 4 }} />
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>
                            {s.sent || s.failed ? num(s.sent) : '—'}
                            {s.failed > 0 && <div style={{ fontSize: '0.72rem', color: '#dc2626' }}>{num(s.failed)} failed</div>}
                          </td>
                          <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{s.sent ? `${pct(s.delivered, s.sent)} · ${num(s.delivered)}` : '—'}</td>
                          <td style={{ padding: '10px 14px', fontVariantNumeric: 'tabular-nums', color: 'var(--text-secondary)' }}>{s.sent ? `${pct(s.read, s.sent)} · ${num(s.read)}` : '—'}</td>
                          <td style={{ padding: '10px 14px', minWidth: 200 }}>
                            {outputs.length === 0 ? <span style={{ color: 'var(--text-tertiary)' }}>—</span> : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {outputs.map((o) => {
                                  const n = s.outputs?.[o.key] || 0;
                                  const base = node.type === 'randomizer' ? s.reached : (s.sent || s.reached);
                                  return (
                                    <div key={o.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                                      <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 170 }} title={o.label}>{o.label}</span>
                                      <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                        {num(n)} <span style={{ fontWeight: 500, color: 'var(--text-tertiary)' }}>{base ? `(${pct(n, base)})` : ''}</span>
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
