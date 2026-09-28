import { useMemo, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { box, hint } from './groupUi';

/** Rights the bot needs, what each one unlocks (Bot API ChatMemberAdministrator). */
const RIGHTS = [
  { key: 'can_delete_messages', label: 'Delete messages', needFor: 'protection filters, captcha, cleaning service messages' },
  { key: 'can_restrict_members', label: 'Ban users', needFor: 'mute / remove / ban, captcha, warnings' },
  { key: 'can_invite_users', label: 'Invite users via link', needFor: 'invite links and join requests' },
  { key: 'can_pin_messages', label: 'Pin messages', needFor: 'pinning announcements' },
  { key: 'can_change_info', label: 'Change group info', needFor: 'title, description and member permissions' },
];

function lastDays(stats, n = 30) {
  const byDay = new Map((stats || []).map((s) => [s.day, s]));
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const row = byDay.get(key) || {};
    out.push({ day: key, date: d, messages: Number(row.messages) || 0, joins: Number(row.joins) || 0, leaves: Number(row.leaves) || 0, actions: Number(row.actions) || 0 });
  }
  return out;
}

/** Messages per day, one series: bars with rounded tops, a 2px gap, a tooltip per bar. */
function MessagesChart({ days }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...days.map((d) => d.messages));
  const W = 600;
  const H = 150;
  const slot = W / days.length;
  const barW = Math.max(2, slot - 2);
  const h = hover !== null ? days[hover] : null;
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" role="img" aria-label={`Messages per day, last ${days.length} days, up to ${max} a day`} style={{ display: 'block' }}>
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--border)" strokeWidth="1" />
        {days.map((d, i) => {
          const bh = d.messages ? Math.max(3, (d.messages / max) * (H - 8)) : 0;
          const x = i * slot + 1;
          const r = Math.min(4, barW / 2, bh);
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * slot} y="0" width={slot} height={H} fill="transparent" />
              {bh > 0 && (
                <path
                  d={`M${x},${H} V${H - bh + r} Q${x},${H - bh} ${x + r},${H - bh} H${x + barW - r} Q${x + barW},${H - bh} ${x + barW},${H - bh + r} V${H} Z`}
                  fill="var(--primary)"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {(i === 0 || i === days.length - 1 || i === Math.floor(days.length / 2)) && (
                <text x={i === 0 ? x : i === days.length - 1 ? x + barW : x + barW / 2} y={H + 14} textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'} fontSize="10" fill="var(--text-muted)">
                  {d.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {h && (
        <div style={{
          position: 'absolute', top: 0, left: `${Math.min(80, Math.max(0, (hover / days.length) * 100 - 8))}%`, pointerEvents: 'none',
          background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: '0.74rem',
          boxShadow: '0 4px 14px rgba(0,0,0,.12)', color: 'var(--text-primary)', whiteSpace: 'nowrap',
        }}>
          <div style={{ fontWeight: 700 }}>{h.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
          <div>{h.messages} messages · {h.joins} joined · {h.leaves} left · {h.actions} moderation</div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, sub }) {
  return (
    <div style={{ ...box, marginBottom: 0, padding: 14 }}>
      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
}

export default function OverviewTab({ detail, bot }) {
  const { group, counts, stats, commands } = detail;
  const days = useMemo(() => lastDays(stats, 30), [stats]);
  const sum = (k) => days.reduce((a, d) => a + d[k], 0);
  const isAdmin = group.bot_status === 'administrator';
  const rights = group.bot_rights || {};
  const needsSupergroup = group.type === 'group';

  return (
    <div>
      {!isAdmin && (
        <div style={{ ...box, borderColor: '#f59e0b', background: 'rgba(245, 158, 11, 0.08)', display: 'flex', gap: 10 }}>
          <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0 }} />
          <div style={{ fontSize: '0.84rem' }}>
            <strong>Make the bot an admin of this group.</strong>
            <p style={hint}>
              As a regular member the bot can't delete, mute or ban{bot && !bot.canReadAllGroupMessages ? ', and with privacy mode on it only sees commands and replies to it' : ''}.
              In Telegram: group → Edit → Administrators → Add admin → pick the bot.
            </p>
          </div>
        </div>
      )}
      {needsSupergroup && (
        <div style={{ ...box, display: 'flex', gap: 10 }}>
          <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0 }} />
          <p style={{ ...hint, margin: 0 }}>
            This is a basic group. Muting (captcha, mute, warnings that mute) only works in supergroups — Telegram converts a group automatically when you make it public or change an admin's rights.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 14 }}>
        <Tile label="Members" value={group.member_count ?? '—'} sub={`${counts.known_members} seen by the bot`} />
        <Tile label="Messages (30 days)" value={sum('messages')} />
        <Tile label="Joined / left (30 days)" value={`${sum('joins')} / ${sum('leaves')}`} />
        <Tile label="Moderation (30 days)" value={sum('actions')} sub={`${counts.muted} muted · ${counts.warned} warned · ${counts.banned} banned`} />
        <Tile label="Join requests" value={counts.pending_requests} sub="waiting" />
      </div>

      <div style={box}>
        <strong style={{ fontSize: '0.88rem' }}>Messages per day</strong>
        <p style={{ ...hint, marginBottom: 10 }}>Last 30 days. Hover a bar for joins, leaves and moderation that day.</p>
        <MessagesChart days={days} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 14 }}>
        <div style={box}>
          <strong style={{ fontSize: '0.88rem' }}>Bot permissions in this group</strong>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {RIGHTS.map((r) => {
              const ok = isAdmin && rights[r.key];
              return (
                <div key={r.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.82rem' }}>
                  {ok ? <CheckCircle2 size={15} style={{ color: '#16a34a', flexShrink: 0, marginTop: 1 }} /> : <XCircle size={15} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />}
                  <span><b>{r.label}</b> <span style={{ color: 'var(--text-muted)' }}>— {r.needFor}</span></span>
                </div>
              );
            })}
          </div>
        </div>
        <div style={box}>
          <strong style={{ fontSize: '0.88rem' }}>Commands in the group</strong>
          <p style={hint}>Members can use /rules and /report. The others work for group admins only — reply to someone's message with the command.</p>
          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px', fontSize: '0.8rem' }}>
            {(commands || []).map((c) => (
              <div key={c.command} style={{ display: 'contents' }}>
                <code style={{ fontWeight: 700 }}>/{c.command}</code>
                <span style={{ color: 'var(--text-muted)' }}>{c.description}{c.admin ? '' : ' · everyone'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
