import { useCallback, useEffect, useState } from 'react';
import { Loader2, Send, CalendarClock, PinOff, XCircle } from 'lucide-react';
import { tgGroupsAPI } from '../../../services/api';
import { notify, showAlert } from '../../../utils/alerts';
import { Switch, UrlButtonsEditor } from './ui';
import { box, hint, lbl, TEMPLATE_HELP, fmtDate } from './groupUi';

const STATUS_COLORS = { SCHEDULED: '#2563eb', SENT: '#16a34a', FAILED: '#dc2626', CANCELLED: 'var(--text-muted)' };
const EMPTY = { text: '', buttons: [], pin: false, silent: false, schedule: false, scheduledAt: '' };

/** A datetime-local value 10 minutes from now (the input's own format). */
const soon = () => {
  const d = new Date(Date.now() + 10 * 60000);
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function PostsTab({ groupId, refreshKey }) {
  const [form, setForm] = useState(EMPTY);
  const [posts, setPosts] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    tgGroupsAPI.posts(groupId).then((res) => setPosts(res.data.posts)).catch((err) => notify.error(err.response?.data?.message || 'Could not load posts'));
  }, [groupId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.text.trim()) return;
    if (form.schedule && (!form.scheduledAt || new Date(form.scheduledAt).getTime() < Date.now() + 60000)) {
      notify.error('Pick a time at least a minute from now.');
      return;
    }
    setBusy(true);
    try {
      await tgGroupsAPI.createPost(groupId, {
        text: form.text,
        buttons: form.buttons,
        pin: form.pin,
        silent: form.silent,
        scheduledAt: form.schedule ? new Date(form.scheduledAt).toISOString() : null,
      });
      notify.success(form.schedule ? 'Post scheduled' : 'Posted to the group');
      setForm(EMPTY);
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not post');
      load();
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (p) => {
    const ok = await showAlert.confirm({ title: 'Cancel this scheduled post?', confirmButtonText: 'Cancel post' });
    if (!ok) return;
    try { await tgGroupsAPI.cancelPost(groupId, p.id); load(); } catch (err) { notify.error(err.response?.data?.message || 'Could not cancel'); }
  };

  const unpinAll = async () => {
    const ok = await showAlert.confirm({ title: 'Unpin every message?', text: 'All pinned messages in the group are unpinned.', confirmButtonText: 'Unpin all' });
    if (!ok) return;
    try { await tgGroupsAPI.unpinAll(groupId); notify.success('All messages unpinned'); } catch (err) { notify.error(err.response?.data?.message || 'Could not unpin'); }
  };

  return (
    <div>
      <form onSubmit={submit} style={box}>
        <strong style={{ fontSize: '0.88rem' }}>Post to the group</strong>
        <label style={{ display: 'block', marginTop: 10 }}>
          <span style={lbl}>Message</span>
          <textarea className="form-input w-full" rows={5} maxLength={4000} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder="📣 Big news for everyone…" />
        </label>
        <p style={hint}>{TEMPLATE_HELP.replace('{first_name} {full_name} {username} {mention} ', '')}</p>
        <div style={{ marginTop: 10 }}>
          <span style={lbl}>Link buttons</span>
          <UrlButtonsEditor value={form.buttons} onChange={(buttons) => setForm({ ...form, buttons })} />
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
          <Switch checked={form.pin} onChange={(v) => setForm({ ...form, pin: v })} label="Pin it" />
          <Switch checked={form.silent} onChange={(v) => setForm({ ...form, silent: v })} label="Send silently" />
          <Switch checked={form.schedule} onChange={(v) => setForm({ ...form, schedule: v, scheduledAt: v ? (form.scheduledAt || soon()) : '' })} label="Schedule" />
          {form.schedule && (
            <input type="datetime-local" className="form-input" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} aria-label="Send at" />
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button type="submit" className="btn btn-primary" disabled={busy || !form.text.trim()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : form.schedule ? <CalendarClock size={14} /> : <Send size={14} />} {form.schedule ? 'Schedule' : 'Post now'}
          </button>
        </div>
      </form>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 10px' }}>
        <strong style={{ fontSize: '0.88rem' }}>Posts</strong>
        <button type="button" className="btn btn-secondary btn-sm" onClick={unpinAll}><PinOff size={12} /> Unpin all</button>
      </div>
      {!posts ? (
        <div style={{ padding: 30, textAlign: 'center' }}><Loader2 className="animate-spin" size={20} /></div>
      ) : posts.length === 0 ? (
        <div style={{ ...box, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>Nothing posted yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {posts.map((p) => (
            <div key={p.id} style={{ ...box, marginBottom: 0, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: STATUS_COLORS[p.status] }}>
                  {p.status}{p.pin ? ' · PINNED' : ''}{p.silent ? ' · SILENT' : ''}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {p.status === 'SCHEDULED' ? `for ${fmtDate(p.scheduled_at)}` : fmtDate(p.sent_at || p.created_at)}
                </span>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.84rem', marginTop: 6 }}>{p.text}</div>
              {p.error && <div style={{ fontSize: '0.76rem', color: '#dc2626', marginTop: 6 }}>{p.error}</div>}
              {p.status === 'SCHEDULED' && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => cancel(p)}><XCircle size={12} /> Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
