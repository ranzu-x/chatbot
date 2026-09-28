import { useCallback, useEffect, useState } from 'react';
import { alert } from '../../../lib/alerts';
import { Loader2, Search, Crown, ShieldAlert, VolumeX, Volume2, UserX, Ban, Undo2, AlertTriangle, MinusCircle } from 'lucide-react';
import { tgGroupsAPI } from '../../../services/api';
import { notify, showAlert } from '../../../utils/alerts';
import { box, hint, fmtDate, personName } from './groupUi';

const FILTERS = [
  { value: 'active', label: 'In the group' },
  { value: 'all', label: 'Everyone seen' },
  { value: 'muted', label: 'Muted' },
  { value: 'warned', label: 'Warned' },
  { value: 'captcha', label: 'Waiting for captcha' },
  { value: 'banned', label: 'Banned' },
  { value: 'left', label: 'Left' },
];

const MUTE_CHOICES = { 60: '1 hour', 360: '6 hours', 1440: '1 day', 10080: '1 week', 43200: '30 days' };

function StatusChip({ m }) {
  let text = m.status;
  let color = 'var(--text-muted)';
  if (m.is_admin) { text = 'admin'; color = '#7c3aed'; }
  else if (m.captcha_pending) { text = 'captcha'; color = '#d97706'; }
  else if (m.muted_until) { text = 'muted'; color = '#d97706'; }
  else if (m.status === 'kicked') { text = 'banned'; color = '#dc2626'; }
  else if (m.status === 'member' || m.status === 'restricted') { text = 'member'; color = '#16a34a'; }
  return <span style={{ fontSize: '0.7rem', fontWeight: 700, color, border: `1px solid ${color}`, borderRadius: 999, padding: '1px 7px', textTransform: 'uppercase' }}>{text}</span>;
}

export default function MembersTab({ groupId, warnLimit }) {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('active');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    tgGroupsAPI.members(groupId, { q: query, filter, page, pageSize: 25 })
      .then((res) => setData(res.data))
      .catch((err) => notify.error(err.response?.data?.message || 'Could not load members'));
  }, [groupId, query, filter, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setTimeout(() => { setQuery(q.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [q]);

  const act = async (m, action) => {
    const name = personName(m);
    let payload = { action };
    if (action === 'MUTE') {
      const value = await alert.prompt({
        title: `Mute ${name}`, label: 'For how long', input: 'select', options: MUTE_CHOICES, value: '1440',
        confirm: 'Mute',
      });
      if (!value) return;
      payload.minutes = Number(value);
    } else if (['KICK', 'BAN'].includes(action)) {
      const ok = await showAlert.confirm({
        title: action === 'BAN' ? `Ban ${name}?` : `Remove ${name}?`,
        text: action === 'BAN' ? "They're removed and can't come back until unbanned." : 'They are removed from the group but can join again.',
        confirmButtonText: action === 'BAN' ? 'Ban' : 'Remove',
      });
      if (!ok) return;
    }
    setBusy(`${m.id}:${action}`);
    try {
      await tgGroupsAPI.memberAction(groupId, m.id, payload);
      notify.success('Done');
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Telegram refused that');
    } finally {
      setBusy(null);
    }
  };

  const btn = (m, action, Icon, title) => (
    <button type="button" className="btn btn-secondary btn-sm" title={title} aria-label={`${title} ${personName(m)}`} disabled={Boolean(busy)} onClick={() => act(m, action)} style={{ padding: '4px 7px' }}>
      {busy === `${m.id}:${action}` ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
    </button>
  );

  const pages = data ? Math.max(1, Math.ceil(data.total / 25)) : 1;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="form-input w-full" style={{ paddingLeft: 30 }} placeholder="Search name, @username or id" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="form-input" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
          {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>
      <p style={{ ...hint, marginTop: 0, marginBottom: 10 }}>
        Telegram doesn't let bots list every member — this is everyone the bot has seen join, post or be moderated since it was added.
      </p>

      {!data ? (
        <div style={{ padding: 30, textAlign: 'center' }}><Loader2 className="animate-spin" size={20} /></div>
      ) : data.members.length === 0 ? (
        <div style={{ ...box, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>No one here.</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: 640 }}>
            <thead>
              <tr style={{ background: 'var(--bg-base)', textAlign: 'left' }}>
                {['Member', 'Status', 'Messages', 'Warnings', 'Joined', 'Last message', ''].map((h) => (
                  <th key={h} style={{ padding: '9px 12px', fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.74rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => {
                const inGroup = ['member', 'restricted', 'administrator', 'creator'].includes(m.status);
                return (
                  <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ fontWeight: 600, display: 'flex', gap: 5, alignItems: 'center' }}>
                        {m.is_admin && <Crown size={13} style={{ color: '#7c3aed' }} />}{personName(m)}{m.is_bot ? ' 🤖' : ''}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{m.username ? `@${m.username} · ` : ''}{m.tg_user_id}</div>
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <StatusChip m={m} />
                      {m.muted_until && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>until {fmtDate(m.muted_until)}</div>}
                    </td>
                    <td style={{ padding: '8px 12px' }}>{m.messages_count}</td>
                    <td style={{ padding: '8px 12px' }}>{m.warnings > 0 ? <span style={{ color: '#d97706', fontWeight: 700 }}>{m.warnings}/{warnLimit}</span> : '—'}</td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{fmtDate(m.joined_at)}</td>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{fmtDate(m.last_message_at)}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {!m.is_admin && (
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          {inGroup && btn(m, 'WARN', AlertTriangle, 'Warn')}
                          {m.warnings > 0 && btn(m, 'UNWARN', MinusCircle, 'Remove a warning')}
                          {inGroup && (m.muted_until || m.captcha_pending ? btn(m, 'UNMUTE', Volume2, 'Unmute') : btn(m, 'MUTE', VolumeX, 'Mute'))}
                          {inGroup && btn(m, 'KICK', UserX, 'Remove')}
                          {m.status === 'kicked' ? btn(m, 'UNBAN', Undo2, 'Unban') : btn(m, 'BAN', Ban, 'Ban')}
                        </div>
                      )}
                      {m.is_admin && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}><ShieldAlert size={12} /> admin</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: '0.8rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>{data.total} people</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span>{page} / {pages}</span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
