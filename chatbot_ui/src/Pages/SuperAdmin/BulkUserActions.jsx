import { useState, useEffect } from 'react';
import { Mail, Bell, X, Send, Link2, AlertTriangle } from 'lucide-react';
import { adminAPI } from '../../services/api';

// Bulk actions on the users ticked in the User Manager list (UsersPage.jsx →
// Options → Selected users): email, in-app notification, CSV download.
// Backend: POST /admin/users/bulk-email and /admin/users/bulk-notify
// (routes/admin.js). The notification lands in each user's top-bar bell
// (Components/NotificationBell.jsx).

// ─── Shared modal shell ──────────────────────────────────────────────────────

function Modal({ icon: IconCmp, title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  const Icon = IconCmp;
  return (
    <div onMouseDown={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: 520, maxWidth: '100%', maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 20px 48px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={16} />
          </span>
          <h3 style={{ margin: 0, flex: 1, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
          <button type="button" onClick={onClose} title="Close" style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', borderTop: '1px solid var(--border)' }}>{footer}</div>
      </div>
    </div>
  );
}

function Recipients({ users }) {
  const shown = users.slice(0, 6);
  return (
    <div>
      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
        To {users.length} user{users.length === 1 ? '' : 's'}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {shown.map((u) => (
          <span key={u.id} title={u.email} style={{ fontSize: '0.74rem', padding: '3px 9px', borderRadius: 999, background: 'var(--bg-hover)', color: 'var(--text-primary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {u.name || u.email}
          </span>
        ))}
        {users.length > shown.length && (
          <span style={{ fontSize: '0.74rem', padding: '3px 9px', borderRadius: 999, background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}>
            +{users.length - shown.length} more
          </span>
        )}
      </div>
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 };
const hintStyle = { fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 4 };
const cancelBtn = { padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer' };
const primaryBtn = (disabled) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '0.84rem', fontWeight: 600, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1 });

// ─── Email ───────────────────────────────────────────────────────────────────

export function BulkEmailModal({ users, onClose, onDone }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const noEmail = users.filter((u) => !u.email).length;
  const canSend = subject.trim() && message.trim() && !sending;

  const send = async () => {
    setSending(true);
    setError('');
    try {
      const res = await adminAPI.bulkEmailUsers({ userIds: users.map((u) => u.id), subject: subject.trim(), message: message.trim() });
      onDone(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Sending failed');
      setSending(false);
    }
  };

  return (
    <Modal
      icon={Mail}
      title="Send email"
      onClose={sending ? () => {} : onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={sending} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={send} disabled={!canSend} style={primaryBtn(!canSend)}>
            <Send size={14} /> {sending ? `Sending to ${users.length}…` : `Send to ${users.length}`}
          </button>
        </>
      )}
    >
      <Recipients users={users} />
      {noEmail > 0 && (
        <div style={{ fontSize: '0.74rem', color: '#b45309' }}>{noEmail} selected user{noEmail === 1 ? " has" : "s have"} no email address and will be skipped.</div>
      )}
      <div>
        <label style={labelStyle}>Subject</label>
        <input className="form-input w-full" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} placeholder="e.g. Scheduled maintenance this Sunday" autoFocus />
      </div>
      <div>
        <label style={labelStyle}>Message</label>
        <textarea className="form-input w-full" rows={8} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={'Hi {{name}},\n\n…'} style={{ resize: 'vertical', lineHeight: 1.5 }} />
        <div style={hintStyle}>Plain text. <code>{'{{name}}'}</code> is replaced with each user's name.</div>
      </div>
      {error && <div style={{ fontSize: '0.78rem', color: '#dc2626' }}>{error}</div>}
    </Modal>
  );
}

// ─── In-app notification ─────────────────────────────────────────────────────

export function BulkNotifyModal({ users, onClose, onDone }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const linkInvalid = link.trim() && !/^\/(?!\/)/.test(link.trim()) && !/^https?:\/\//i.test(link.trim());
  const canSend = title.trim() && !linkInvalid && !sending;

  const send = async () => {
    setSending(true);
    setError('');
    try {
      const res = await adminAPI.bulkNotifyUsers({ userIds: users.map((u) => u.id), title: title.trim(), message: message.trim(), link: link.trim() });
      onDone(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Sending failed');
      setSending(false);
    }
  };

  return (
    <Modal
      icon={Bell}
      title="Send notification"
      onClose={sending ? () => {} : onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={sending} style={cancelBtn}>Cancel</button>
          <button type="button" onClick={send} disabled={!canSend} style={primaryBtn(!canSend)}>
            <Send size={14} /> {sending ? 'Sending…' : `Send to ${users.length}`}
          </button>
        </>
      )}
    >
      <Recipients users={users} />
      <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
        Appears in the bell at the top of their dashboard — instantly if they're online, otherwise the next time they sign in.
      </div>
      <div>
        <label style={labelStyle}>Title</label>
        <input className="form-input w-full" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. New feature: Social Posting" autoFocus />
      </div>
      <div>
        <label style={labelStyle}>Message <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(optional)</span></label>
        <textarea className="form-input w-full" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} style={{ resize: 'vertical', lineHeight: 1.5 }} />
      </div>
      <div>
        <label style={labelStyle}>Link <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(optional)</span></label>
        <div style={{ position: 'relative' }}>
          <Link2 size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input className="form-input w-full" value={link} onChange={(e) => setLink(e.target.value)} placeholder="/billing  or  https://…" style={{ paddingLeft: 30 }} />
        </div>
        <div style={{ ...hintStyle, color: linkInvalid ? '#dc2626' : hintStyle.color }}>
          {linkInvalid ? 'Use a page path starting with / or a full http(s) URL.' : 'Where clicking the notification takes them.'}
        </div>
      </div>

      {title.trim() && (
        <div>
          <div style={{ ...labelStyle, marginBottom: 6 }}>Preview</div>
          <div style={{ display: 'flex', gap: 10, padding: '11px 14px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg-selected)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0, background: '#3b82f6' }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
              {message.trim() && <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'pre-line' }}>{message}</span>}
              <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-tertiary)', marginTop: 4 }}>just now</span>
            </span>
          </div>
        </div>
      )}
      {error && <div style={{ fontSize: '0.78rem', color: '#dc2626', display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14} /> {error}</div>}
    </Modal>
  );
}
