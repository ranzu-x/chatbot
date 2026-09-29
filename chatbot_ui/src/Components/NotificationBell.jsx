import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Bell, BellRing, BellOff, CheckCheck, Settings, ExternalLink } from 'lucide-react';
import { useNotification } from '../Provider/NotificationContext';
import { myNotificationsAPI } from '../services/api';
import { toast } from '../lib/alerts';
import { pushState, enablePush, disablePush } from '../utils/browserPush';

// Top-bar bell: the signed-in user's in-app notifications (sent by the Super
// Admin from User Manager → Selected users → Send notification). Data and the
// live socket listener live in NotificationContext; this is only the UI. The
// old "Notification settings" modal the bell used to open is the footer link.

function timeAgo(value) {
  const secs = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 7 * 86400) return `${Math.floor(secs / 86400)}d ago`;
  return new Date(value).toLocaleDateString();
}

// "Desktop notifications" switch for this browser (utils/browserPush.js):
// alerts for new messages in your assigned chats, @mentions, assigned chats
// and follow-ups — only sent while no dashboard tab is open.
function DesktopAlertsRow() {
  const [state, setState] = useState('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => { pushState().then(setState).catch(() => setState('off')); }, []);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = state === 'on' ? await disablePush() : await enablePush();
      setState(next);
      if (next === 'on') {
        await myNotificationsAPI.pushTest().catch(() => {});
        toast.success('Desktop notifications are on', { description: "You'll be alerted here when the dashboard is closed." });
      } else if (next === 'denied') {
        toast.warning('Notifications are blocked', { description: 'Allow notifications for this site in your browser settings, then try again.' });
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Could not change desktop notifications');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'loading') return null;
  const note = {
    unsupported: 'Not available in this browser (needs HTTPS).',
    denied: 'Blocked in your browser settings.',
    on: 'On for this browser — alerts when the dashboard is closed.',
    off: 'Get alerts for your chats when the dashboard is closed.',
  }[state];
  const canToggle = state === 'on' || state === 'off';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
      {state === 'on' ? <BellRing size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} /> : <BellOff size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>Desktop notifications</span>
        <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{note}</span>
      </span>
      {canToggle && (
        <button
          type="button"
          role="switch"
          aria-checked={state === 'on'}
          onClick={toggle}
          disabled={busy}
          style={{
            width: 34, height: 20, borderRadius: 999, border: 'none', padding: 2, cursor: busy ? 'wait' : 'pointer', flexShrink: 0,
            background: state === 'on' ? 'var(--primary)' : 'var(--border)', transition: 'background 0.15s',
          }}
        >
          <span style={{ display: 'block', width: 16, height: 16, borderRadius: '50%', background: '#fff', transform: state === 'on' ? 'translateX(14px)' : 'none', transition: 'transform 0.15s' }} />
        </button>
      )}
    </div>
  );
}

export default function NotificationBell() {
  const { inbox, unreadCount, markNotificationRead, markAllNotificationsRead, openSettingsModal, refreshInbox } = useNotification();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    refreshInbox();
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const openItem = (n) => {
    markNotificationRead(n.id);
    if (!n.link) return;
    if (/^https?:\/\//i.test(n.link)) {
      window.open(n.link, '_blank', 'noopener,noreferrer');
    } else {
      setOpen(false);
      navigate(n.link);
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={unreadCount ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'Notifications'}
        style={{
          position: 'relative', width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)',
          background: open ? 'var(--bg-hover)' : 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
        }}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999,
            background: 'var(--danger)', color: '#fff', fontSize: '0.62rem', fontWeight: 700, lineHeight: '17px', textAlign: 'center',
            border: '2px solid var(--bg-surface)', boxSizing: 'content-box',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 42, right: 0, zIndex: 1000, width: 360, maxWidth: 'calc(100vw - 32px)',
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.14)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <strong style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>Notifications</strong>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllNotificationsRead} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>

          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {inbox.length === 0 ? (
              <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>
                <Bell size={22} style={{ opacity: 0.4, marginBottom: 6 }} />
                <div>You're all caught up</div>
              </div>
            ) : inbox.map((n) => {
              const unread = !n.read_at;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => openItem(n)}
                  style={{
                    display: 'flex', gap: 10, width: '100%', textAlign: 'left', padding: '11px 14px', border: 'none',
                    borderBottom: '1px solid var(--border)', cursor: n.link || unread ? 'pointer' : 'default',
                    background: unread ? 'var(--bg-selected)' : 'transparent',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = unread ? 'var(--bg-selected)' : 'transparent'; }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0, background: unread ? '#3b82f6' : 'transparent' }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.82rem', fontWeight: unread ? 700 : 600, color: 'var(--text-primary)' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                      {n.link && <ExternalLink size={11} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />}
                    </span>
                    {n.body && (
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.45, whiteSpace: 'pre-line' }}>
                        {n.body}
                      </span>
                    )}
                    <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-tertiary)', marginTop: 4 }}>{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <DesktopAlertsRow />

          <button
            type="button"
            onClick={() => { setOpen(false); openSettingsModal(); }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', border: 'none', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer' }}
          >
            <Settings size={13} /> Notification settings
          </button>
        </div>
      )}
    </div>
  );
}
