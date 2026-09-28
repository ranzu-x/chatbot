import { useEffect, useState, useCallback } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { inboxQualityAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import useUrlState from '../../hooks/useUrlState';
import { Timer, Star, Users, Save, Loader2, AlertTriangle, Clock } from 'lucide-react';

/**
 * Inbox Insights — response times (SLA), customer ratings (CSAT) and
 * automatic assignment (chatbot_api/utils/inboxQuality.js).
 */

const fmtDur = (s) => {
  if (s === null || s === undefined) return '—';
  const n = Math.round(s);
  if (n < 60) return `${n}s`;
  if (n < 3600) return `${Math.floor(n / 60)}m ${n % 60}s`;
  return `${Math.floor(n / 3600)}h ${Math.floor((n % 3600) / 60)}m`;
};

const card = { background: 'var(--bg-surface, #fff)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 };
const hint = { fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0' };

function Stat({ icon, label, value, sub, tone }) {
  return (
    <div style={{ ...card, display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: tone === 'bad' ? '#fee2e2' : 'var(--bg-hover)', color: tone === 'bad' ? '#b91c1c' : 'var(--primary)' }}>{icon}</div>
      <div>
        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{label}</div>
        <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{value}</div>
        {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{sub}</div>}
      </div>
    </div>
  );
}

function Reports() {
  const [days, setDays] = useUrlState('days', 30, { type: 'number' });
  const [m, setM] = useState(null);
  useEffect(() => {
    setM(null);
    inboxQualityAPI.getMetrics(days).then((res) => setM(res.data.metrics)).catch(() => notify.error('Could not load the reports'));
  }, [days]);
  if (!m) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" size={20} /></div>;
  const fr = m.firstResponse;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <select className="form-input" style={{ width: 'auto' }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
        <Stat icon={<Timer size={18} />} label="Team reply time (average)" value={fmtDur(fr.agentAvgSeconds)} sub={`median ${fmtDur(fr.agentMedianSeconds)} · ${fr.agentReplies ?? 0} replies`} />
        <Stat icon={<AlertTriangle size={18} />} label={`Replies slower than ${m.slaMinutes} min`} value={fr.slaBreaches} tone={fr.slaBreaches ? 'bad' : null} />
        <Stat icon={<Clock size={18} />} label="Waiting for a reply now" value={m.waitingNow.total} sub={m.waitingNow.overdue ? `${m.waitingNow.overdue} past the target` : 'none past the target'} tone={m.waitingNow.overdue ? 'bad' : null} />
        <Stat icon={<Star size={18} />} label="Customer rating (CSAT)" value={m.csat.average !== null ? `${m.csat.average} / 5` : '—'} sub={`${m.csat.answered} of ${m.csat.sent} answered${m.csat.satisfiedPercent !== null ? ` · ${m.csat.satisfiedPercent}% satisfied` : ''}`} />
        <Stat icon={<Timer size={18} />} label="Any reply (incl. bot / AI)" value={fmtDur(fr.allAvgSeconds)} sub={`${fr.allReplies ?? 0} replies`} />
      </div>
      <div style={card}>
        <strong style={{ fontSize: '0.9rem' }}>By team member</strong>
        {m.agents.length === 0 ? (
          <p style={hint}>No replies from team members in this period.</p>
        ) : (
          <div className="table-wrapper" style={{ marginTop: 10 }}>
            <table>
              <thead><tr><th>Team member</th><th>Replies</th><th>Average reply time</th><th>Slower than {m.slaMinutes} min</th><th>Rating</th></tr></thead>
              <tbody>
                {m.agents.map((a) => (
                  <tr key={a.userId}>
                    <td className="font-medium">{a.name}</td>
                    <td>{a.replies}</td>
                    <td>{fmtDur(a.avgSeconds)}</td>
                    <td>{a.breaches}</td>
                    <td>{a.csat !== null ? `${a.csat} / 5 (${a.csatCount})` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Settings() {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => inboxQualityAPI.getSettings().then((res) => setS(res.data.settings)).catch(() => notify.error('Could not load the settings')), []);
  useEffect(() => { load(); }, [load]);
  const set = (patch) => setS((x) => ({ ...x, ...patch }));
  const save = async () => {
    setSaving(true);
    try {
      await inboxQualityAPI.saveSettings(s);
      notify.success('Inbox settings saved');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };
  if (!s) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" size={20} /></div>;
  const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 760 }}>
      <div style={card}>
        <div style={row}>
          <strong style={{ fontSize: '0.92rem', display: 'flex', gap: 8, alignItems: 'center' }}><Timer size={16} /> Reply-time target (SLA)</strong>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.84rem' }}><input type="checkbox" checked={s.slaEnabled} onChange={(e) => set({ slaEnabled: e.target.checked })} /> On</label>
        </div>
        <p style={hint}>Every chat in the Inbox shows how long the customer has been waiting; with a target it turns amber near it and red past it.</p>
        {s.slaEnabled && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: '0.86rem' }}>
            Reply within <input type="number" min={1} max={10080} className="form-input" style={{ width: 90 }} value={s.slaMinutes} onChange={(e) => set({ slaMinutes: Number(e.target.value) })} /> minutes
          </div>
        )}
      </div>

      <div style={card}>
        <div style={row}>
          <strong style={{ fontSize: '0.92rem', display: 'flex', gap: 8, alignItems: 'center' }}><Star size={16} /> Customer satisfaction survey (CSAT)</strong>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.84rem' }}><input type="checkbox" checked={s.csatEnabled} onChange={(e) => set({ csatEnabled: e.target.checked })} /> On</label>
        </div>
        <p style={hint}>When a chat a team member took part in is marked Resolved, the customer is asked for a 1–5 rating. Their answer (within 24 hours) is saved to that chat and the team member's score — it doesn't open a new chat.</p>
        {s.csatEnabled && (
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Question
              <textarea className="form-input w-full" rows={2} maxLength={500} value={s.csatQuestion} onChange={(e) => set({ csatQuestion: e.target.value })} />
            </label>
            <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Thank-you reply (empty = none)
              <input className="form-input w-full" maxLength={500} value={s.csatThanks} onChange={(e) => set({ csatThanks: e.target.value })} />
            </label>
          </div>
        )}
      </div>

      <div style={card}>
        <strong style={{ fontSize: '0.92rem', display: 'flex', gap: 8, alignItems: 'center' }}><Users size={16} /> Automatic assignment</strong>
        <p style={hint}>Hand chats to team members automatically — only members who can see that channel (Team Members / Roles settings).</p>
        <div style={{ display: 'grid', gap: 10, marginTop: 10, fontSize: '0.86rem' }}>
          <select className="form-input" value={s.autoAssignMode} onChange={(e) => set({ autoAssignMode: e.target.value })}>
            <option value="OFF">Off — assign by hand</option>
            <option value="ROUND_ROBIN">Round robin — take turns</option>
            <option value="LEAST_BUSY">Least busy — fewest open chats</option>
          </select>
          {s.autoAssignMode !== 'OFF' && (
            <>
              <select className="form-input" value={s.autoAssignTrigger} onChange={(e) => set({ autoAssignTrigger: e.target.value })}>
                <option value="HANDOFF">When a flow hands the chat to a person (Handoff step)</option>
                <option value="NEW">Every new chat</option>
              </select>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={s.autoAssignOnlineOnly} onChange={(e) => set({ autoAssignOnlineOnly: e.target.checked })} />
                Only to team members who are online (dashboard open)
              </label>
            </>
          )}
        </div>
      </div>

      <div style={card}>
        <div style={row}>
          <strong style={{ fontSize: '0.92rem' }}>Transcribe voice messages automatically</strong>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.84rem' }}><input type="checkbox" checked={Boolean(s.autoTranscribe)} onChange={(e) => set({ autoTranscribe: e.target.checked })} /> On</label>
        </div>
        <p style={hint}>Every incoming voice message gets its text under it in the Inbox. Uses your AI provider (OpenAI or Google Gemini, AI Providers page) — each transcript uses provider credits. Off: a "Transcribe" button under each voice message.</p>
      </div>

      <div><button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save</button></div>
    </div>
  );
}

export default function InboxInsightsPage() {
  const [tab, setTab] = useUrlState('tab', 'reports', { allowed: ['reports', 'settings'] });
  return (
    <AppLayout>
      <div className="page-header">
        <h1 className="page-title">Inbox Insights</h1>
        <p className="page-subtitle">How fast your team replies, how customers rate it, and who gets new chats.</p>
      </div>
      <div className="page-body">
        <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
          {[['reports', 'Reports'], ['settings', 'Settings']].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)}
              style={{ padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', color: tab === id ? 'var(--primary)' : 'var(--text-secondary)', borderBottom: tab === id ? '2.5px solid var(--primary)' : '2.5px solid transparent' }}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'reports' ? <Reports /> : <Settings />}
      </div>
    </AppLayout>
  );
}
