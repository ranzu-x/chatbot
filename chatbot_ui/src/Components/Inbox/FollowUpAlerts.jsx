import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Bell, BellRing, X, Clock, MessageSquare } from 'lucide-react';
import { followupAPI } from '../../services/api';
import { useNotification } from '../../Provider/NotificationContext';
import { playNotificationSound } from '../../services/soundEffects';
import { getSocketUrl, socketAuth } from '../../utils/socketAuth';
import { SNOOZE_PRESETS, relativeDue, formatDue } from '../../utils/followUps';

// One shape for a reminder whether it came from the API list or the live socket event.
function normalize(x) {
  return {
    id: x.id,
    title: x.title || x.note || 'Follow-up',
    description: x.description ?? (x.title ? x.note : '') ?? '',
    dueAt: x.dueAt || x.due_at,
    contactId: x.contactId ?? x.contact_id,
    contactName: x.contactName || 'Subscriber',
    conversationId: x.conversationId ?? x.conversation_id ?? null,
    snoozeCount: x.snoozeCount ?? x.snooze_count ?? 0,
  };
}

const chip = { padding: '3px 8px', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', border: '1px solid #cbd5e1', background: '#fff', color: '#475569' };
const action = (color) => ({ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.74rem', fontWeight: 700, color, background: 'none', border: 'none', cursor: 'pointer', padding: 0 });

/**
 * Follow-up reminders inside the inbox.
 *  - A bell with a count of the reminders that need attention for the signed-in
 *    person (assigned to them, or unassigned and created by them), and a list
 *    to act on them.
 *  - A pop-up the moment one comes due, with a chime and (when the tab is in
 *    the background and the browser allows it) a desktop notification.
 * Each can be snoozed, marked done, or opened straight into its chat.
 */
export default function FollowUpAlerts({ user, onOpenConversation }) {
  const notif = useNotification() || {};
  const settingsRef = useRef(notif.settings || {});
  settingsRef.current = notif.settings || {};
  const openRef = useRef(onOpenConversation);
  openRef.current = onOpenConversation;

  const [due, setDue] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [open, setOpen] = useState(false);
  const [snoozeFor, setSnoozeFor] = useState(null);
  const [message, setMessage] = useState('');
  const [now, setNow] = useState(Date.now());
  const popRef = useRef(null);
  const btnRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const refresh = useCallback(() => (
    followupAPI.getAll({ mine: 1, status: 'OVERDUE', limit: 50 })
      .then((r) => setDue((r.data?.followUps || []).map(normalize)))
      .catch(() => {})
  ), []);

  const flash = (text) => { setMessage(text); setTimeout(() => setMessage(''), 3500); };
  const dropToast = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  // A reminder just came due.
  const onDue = useCallback((payload) => {
    const item = normalize(payload);
    setToasts((t) => (t.some((x) => x.id === item.id) ? t : [...t, item].slice(-3)));
    refresh();

    if (settingsRef.current.soundEnabled !== false) playNotificationSound('followup');

    try {
      const s = settingsRef.current;
      if (s.pushEnabled !== false && 'Notification' in window && Notification.permission === 'granted' && (document.hidden || !document.hasFocus())) {
        const n = new Notification(`Follow-up: ${item.title}`, {
          body: item.contactName + (item.description ? ` — ${item.description}` : ''),
          tag: `followup-${item.id}`,
          icon: '/favicon.ico',
        });
        n.onclick = () => { window.focus(); openRef.current?.(item); n.close(); };
      }
    } catch { /* notifications unavailable */ }
  }, [refresh]);

  useEffect(() => {
    if (!user) return undefined;
    refresh();
    const socket = io(getSocketUrl(), { auth: socketAuth(), transports: ['websocket', 'polling'] });
    socket.on('follow_up_due', onDue);
    socket.on('follow_up_updated', (d) => {
      // Finished, snoozed or removed somewhere else (another tab, another agent): stop nagging here.
      if (d && (d.deleted || d.snoozed || d.status === 'COMPLETED' || d.status === 'CANCELLED')) dropToast(d.followUpId);
      refresh();
    });
    socket.on('connect', refresh); // anything that came due while we were disconnected shows up in the bell
    return () => socket.disconnect();
  }, [user, onDue, refresh]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (popRef.current && !popRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const finish = (item) => {
    dropToast(item.id);
    setDue((d) => d.filter((x) => x.id !== item.id));
    setSnoozeFor(null);
  };
  const snooze = async (item, preset) => {
    try {
      await followupAPI.snooze(item.id, preset.minutes);
      finish(item);
      flash(`Snoozed "${item.title}" for ${preset.label}.`);
    } catch { flash('Could not snooze that. Please try again.'); }
  };
  const markDone = async (item) => {
    try {
      await followupAPI.setStatus(item.id, 'COMPLETED');
      finish(item);
      flash(`Marked "${item.title}" as done.`);
    } catch { flash('Could not update that. Please try again.'); }
  };
  const openChat = (item) => {
    dropToast(item.id);
    setOpen(false);
    openRef.current?.(item);
  };

  const canAskPermission = typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default';
  const count = due.length;

  const snoozeChips = (item, where) => (
    snoozeFor === `${where}:${item.id}` && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
        {SNOOZE_PRESETS.map((p) => (
          <button key={p.minutes} type="button" onClick={() => snooze(item, p)} style={chip} data-testid={`followup-${where}-snooze-${p.minutes}`}>{p.label}</button>
        ))}
      </div>
    )
  );

  const actionsRow = (item, where) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
      {item.conversationId ? (
        <button type="button" onClick={() => openChat(item)} style={action('#2563eb')} data-testid={`followup-${where}-open`}><MessageSquare size={12} /> Open chat</button>
      ) : null}
      <button type="button" onClick={() => setSnoozeFor(snoozeFor === `${where}:${item.id}` ? null : `${where}:${item.id}`)} style={action('#b45309')} data-testid={`followup-${where}-snooze`}><BellRing size={12} /> Snooze</button>
      <button type="button" onClick={() => markDone(item)} style={action('#10b981')} data-testid={`followup-${where}-done`}>Done</button>
    </div>
  );

  return (
    <>
      <div ref={popRef} style={{ position: 'relative' }}>
        <button
          type="button"
          ref={btnRef}
          onClick={() => {
            if (!open && btnRef.current) {
              // Fixed to the viewport (not the narrow list column, which would clip it) and kept fully on screen.
              const r = btnRef.current.getBoundingClientRect();
              const width = 330;
              setPos({ top: r.bottom + 8, left: Math.max(60, Math.min(r.right - width, window.innerWidth - width - 12)) });
            }
            setOpen((o) => !o);
          }}
          title={count ? `${count} follow-up${count === 1 ? '' : 's'} need attention` : 'Follow-up reminders'}
          data-testid="followup-bell"
          style={{ position: 'relative', width: 30, height: 30, borderRadius: 8, border: '1px solid #e2e8f0', background: count ? '#fffbeb' : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          {count ? <BellRing size={15} color="#d97706" /> : <Bell size={15} color="#64748b" />}
          {count > 0 && (
            <span data-testid="followup-bell-count" style={{ position: 'absolute', top: -6, right: -6, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999, background: '#ef4444', color: '#fff', fontSize: '0.64rem', fontWeight: 800, lineHeight: '17px', textAlign: 'center', boxShadow: '0 0 0 2px #fff' }}>
              {count > 9 ? '9+' : count}
            </span>
          )}
        </button>

        {open && (
          <div data-testid="followup-popover" style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 100001, width: 330, maxHeight: 'min(420px, calc(100vh - 100px))', overflowY: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.14)', padding: 12 }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Follow-ups that need you</div>
            {count === 0 ? (
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', padding: '8px 0' }}>Nothing is due right now.</div>
            ) : due.map((item) => (
              <div key={item.id} data-testid="followup-bell-item" style={{ padding: '9px 0', borderTop: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>{item.title}</div>
                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{item.contactName}</div>
                {item.description ? <div style={{ fontSize: '0.76rem', color: '#475569', marginTop: 2, whiteSpace: 'pre-wrap' }}>{item.description}</div> : null}
                <div style={{ fontSize: '0.7rem', color: '#ef4444', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} /> {relativeDue(item.dueAt, now)}{item.snoozeCount ? ` · snoozed ×${item.snoozeCount}` : ''}</div>
                {actionsRow(item, 'bell')}
                {snoozeChips(item, 'bell')}
              </div>
            ))}
            {canAskPermission && (
              <button type="button" onClick={() => notif.requestBrowserPermission?.()} style={{ ...action('#2563eb'), marginTop: 8 }}>Turn on desktop alerts</button>
            )}
          </div>
        )}
      </div>

      {(toasts.length > 0 || message) && (
        <div style={{ position: 'fixed', top: 74, right: 20, zIndex: 100000, display: 'flex', flexDirection: 'column', gap: 10, width: 360, maxWidth: 'calc(100vw - 40px)' }}>
          {toasts.map((item) => (
            <div key={item.id} role="alert" data-testid="followup-toast" style={{ background: '#0f172a', color: '#fff', borderRadius: 14, padding: '13px 15px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', border: '1px solid #334155' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><BellRing size={16} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: 0.4 }}>Follow-up due</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 800, marginTop: 1 }} data-testid="followup-toast-title">{item.title}</div>
                  <div style={{ fontSize: '0.74rem', color: '#cbd5e1' }}>{item.contactName} · {formatDue(item.dueAt)}</div>
                  {item.description ? <div style={{ fontSize: '0.76rem', color: '#e2e8f0', marginTop: 4, whiteSpace: 'pre-wrap' }}>{item.description}</div> : null}
                </div>
                <button type="button" onClick={() => dropToast(item.id)} title="Dismiss (it stays in the bell)" style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 2 }} data-testid="followup-toast-dismiss"><X size={15} /></button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
                {item.conversationId ? <button type="button" onClick={() => openChat(item)} style={action('#7dd3fc')} data-testid="followup-toast-open"><MessageSquare size={12} /> Open chat</button> : null}
                <button type="button" onClick={() => setSnoozeFor(snoozeFor === `toast:${item.id}` ? null : `toast:${item.id}`)} style={action('#fbbf24')} data-testid="followup-toast-snooze"><BellRing size={12} /> Snooze</button>
                <button type="button" onClick={() => markDone(item)} style={action('#4ade80')} data-testid="followup-toast-done">Done</button>
              </div>
              {snoozeChips(item, 'toast')}
            </div>
          ))}
          {message && <div style={{ background: '#0f172a', color: '#e2e8f0', borderRadius: 10, padding: '9px 12px', fontSize: '0.78rem', border: '1px solid #334155' }} data-testid="followup-message">{message}</div>}
        </div>
      )}
    </>
  );
}
