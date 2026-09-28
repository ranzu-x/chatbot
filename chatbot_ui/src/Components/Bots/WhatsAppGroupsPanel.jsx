import { useEffect, useState, useCallback, useRef } from 'react';
import io from 'socket.io-client';
import { Users, Plus, Loader2, Copy, RefreshCw, Trash2, Send, Check, X, ArrowLeft, Link2 } from 'lucide-react';
import { waGroupsAPI } from '../../services/api';
import { notify, showAlert } from '../../utils/alerts';
import { socketAuth, getSocketUrl } from '../../utils/socketAuth';

/**
 * Bot Manager → Groups (WhatsApp Groups API — chatbot_api/utils/whatsappGroups.js).
 * Create invite-link groups, share / reset the link, approve join requests,
 * remove members, post to the group and read its messages.
 */
const box = { background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 14 };
const hint = { fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0' };

function GroupDetail({ groupId, onBack, onDeleted }) {
  const [data, setData] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const feedRef = useRef(null);

  const load = useCallback(() => {
    waGroupsAPI.get(groupId).then((res) => setData(res.data)).catch((err) => notify.error(err.response?.data?.message || 'Could not load the group'));
  }, [groupId]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket = io(getSocketUrl(), { auth: socketAuth(), transports: ['websocket', 'polling'] });
    socket.on('wa_group_message', (evt) => {
      if (String(evt.groupId) !== String(groupId)) return;
      setData((d) => (d && !d.messages.some((m) => m.id === evt.message.id) ? { ...d, messages: [...d.messages, evt.message] } : d));
    });
    return () => socket.disconnect();
  }, [groupId]);

  useEffect(() => { feedRef.current?.scrollTo(0, feedRef.current.scrollHeight); }, [data?.messages?.length]);

  const copy = async (link) => { try { await navigator.clipboard.writeText(link); notify.success('Invite link copied'); } catch { notify.error('Copy failed'); } };
  const reset = async () => {
    const ok = await showAlert.confirm({ title: 'Make a new invite link?', text: 'The old link stops working.', confirmButtonText: 'New link' });
    if (!ok) return;
    try { await waGroupsAPI.resetLink(groupId); load(); notify.success('New invite link ready'); } catch (err) { notify.error(err.response?.data?.message || 'Could not reset the link'); }
  };
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      const res = await waGroupsAPI.send(groupId, text);
      setData((d) => ({ ...d, messages: d.messages.some((m) => m.id === res.data.message.id) ? d.messages : [...d.messages, res.data.message] }));
      setText('');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not send');
    } finally {
      setSending(false);
    }
  };
  const answer = async (ids, approve) => {
    try { await waGroupsAPI.joinRequests(groupId, ids, approve); load(); } catch (err) { notify.error(err.response?.data?.message || 'Could not answer the request'); }
  };
  const removeMember = async (waId) => {
    const ok = await showAlert.confirm({ title: `Remove ${waId} from the group?`, confirmButtonText: 'Remove' });
    if (!ok) return;
    try { await waGroupsAPI.removeMembers(groupId, [waId]); load(); } catch (err) { notify.error(err.response?.data?.message || 'Could not remove them'); }
  };
  const remove = async () => {
    const ok = await showAlert.confirm({ title: 'Delete this group?', text: 'The group is closed for everyone on WhatsApp.', confirmButtonText: 'Delete group' });
    if (!ok) return;
    try { await waGroupsAPI.remove(groupId); notify.success('Group deleted'); onDeleted(); } catch (err) { notify.error(err.response?.data?.message || 'Could not delete it'); }
  };

  if (!data) return <div style={{ padding: 30, textAlign: 'center' }}><Loader2 className="animate-spin" size={20} /></div>;
  const g = data.group;
  return (
    <div>
      <button type="button" onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 600, fontSize: '0.8rem', display: 'flex', gap: 4, alignItems: 'center', marginBottom: 10, padding: 0 }}>
        <ArrowLeft size={14} /> All groups
      </button>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 14 }} className="wa-group-grid">
        <div style={{ ...box, display: 'flex', flexDirection: 'column', minHeight: 420 }}>
          <strong>{g.subject}</strong>
          {g.suspended && <div style={{ color: '#dc2626', fontSize: '0.8rem' }}>WhatsApp suspended this group.</div>}
          <div ref={feedRef} style={{ flex: 1, overflowY: 'auto', margin: '12px 0', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420 }}>
            {data.messages.length === 0 && <p style={hint}>No messages yet.</p>}
            {data.messages.map((m) => (
              <div key={m.id} style={{ alignSelf: m.direction === 'OUTBOUND' ? 'flex-end' : 'flex-start', maxWidth: '80%', background: m.direction === 'OUTBOUND' ? '#dcfce7' : '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '6px 10px', fontSize: '0.84rem' }}>
                {m.direction === 'INBOUND' && <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#2563eb' }}>{m.sender_name || m.sender_id}</div>}
                <div style={{ whiteSpace: 'pre-wrap' }}>{m.body}</div>
                <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textAlign: 'right' }}>{new Date(m.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
          <form onSubmit={send} style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Message the group…" maxLength={4096} />
            <button type="submit" className="btn btn-primary" disabled={sending || !text.trim()}>{sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}</button>
          </form>
        </div>
        <div>
          <div style={box}>
            <strong style={{ fontSize: '0.86rem', display: 'flex', gap: 6, alignItems: 'center' }}><Link2 size={14} /> Invite link</strong>
            <p style={hint}>People join by opening this link.</p>
            {g.inviteLink && <code style={{ display: 'block', fontSize: '0.74rem', wordBreak: 'break-all', margin: '8px 0' }}>{g.inviteLink}</code>}
            <div style={{ display: 'flex', gap: 6 }}>
              {g.inviteLink && <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(g.inviteLink)}><Copy size={12} /> Copy</button>}
              <button type="button" className="btn btn-secondary btn-sm" onClick={reset}><RefreshCw size={12} /> New link</button>
            </div>
          </div>
          {data.group.joinRequests.length > 0 && (
            <div style={box}>
              <strong style={{ fontSize: '0.86rem' }}>Join requests ({data.group.joinRequests.length})</strong>
              {data.group.joinRequests.map((r) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', marginTop: 6 }}>
                  <span>{r.waId}</span>
                  <span style={{ display: 'flex', gap: 4 }}>
                    <button type="button" className="btn btn-secondary btn-sm" title="Approve" onClick={() => answer([r.id], true)}><Check size={12} /></button>
                    <button type="button" className="btn btn-secondary btn-sm" title="Reject" onClick={() => answer([r.id], false)}><X size={12} /></button>
                  </span>
                </div>
              ))}
            </div>
          )}
          <div style={box}>
            <strong style={{ fontSize: '0.86rem' }}>Members ({g.participantCount})</strong>
            {g.participants.map((p) => (
              <div key={p} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', marginTop: 6 }}>
                <span>{p}</span>
                <button type="button" className="btn btn-secondary btn-sm" title="Remove" onClick={() => removeMember(p)}><Trash2 size={11} /></button>
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-danger btn-sm" onClick={remove}><Trash2 size={12} /> Delete group</button>
        </div>
      </div>
      <style>{'@media (max-width: 900px) { .wa-group-grid { grid-template-columns: minmax(0, 1fr) !important; } }'}</style>
    </div>
  );
}

export default function WhatsAppGroupsPanel({ account }) {
  const [groups, setGroups] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ subject: '', description: '', joinApprovalMode: 'auto_approve' });
  const [busy, setBusy] = useState(false);

  const load = useCallback((sync) => {
    setGroups(null);
    waGroupsAPI.list(account.id, sync)
      .then((res) => { setGroups(res.data.groups); if (res.data.syncError) notify.error(`Meta: ${res.data.syncError}`); })
      .catch((err) => { setGroups([]); notify.error(err.response?.data?.message || 'Could not load groups'); });
  }, [account.id]);
  useEffect(() => { load(true); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await waGroupsAPI.create({ integrationId: account.id, ...form });
      notify.success('Group created — share its invite link');
      setCreating(false);
      setForm({ subject: '', description: '', joinApprovalMode: 'auto_approve' });
      setOpenId(res.data.id);
      load(false);
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not create the group');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bm-content-card">
      <div className="bm-card-header">
        <h3 className="bm-card-title">WhatsApp Groups</h3>
        <p className="bm-card-sub">Groups run by this number. People join with an invite link; you can post, approve join requests and remove members. Needs an Official Business Account (green tick).</p>
      </div>
      {openId ? (
        <GroupDetail groupId={openId} onBack={() => { setOpenId(null); load(false); }} onDeleted={() => { setOpenId(null); load(false); }} />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating((c) => !c)}><Plus size={13} /> New group</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => load(true)}><RefreshCw size={13} /> Refresh from WhatsApp</button>
          </div>
          {creating && (
            <form onSubmit={create} style={{ ...box, display: 'grid', gap: 10 }}>
              <input className="form-input" required maxLength={128} placeholder="Group name" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              <textarea className="form-input" rows={2} maxLength={2048} placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.82rem' }}>
                <input type="checkbox" checked={form.joinApprovalMode === 'approval_required'} onChange={(e) => setForm({ ...form, joinApprovalMode: e.target.checked ? 'approval_required' : 'auto_approve' })} />
                I approve each person who wants to join
              </label>
              <div><button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy && <Loader2 size={13} className="animate-spin" />} Create group</button></div>
            </form>
          )}
          {!groups ? (
            <div style={{ padding: 30, textAlign: 'center' }}><Loader2 className="animate-spin" size={20} /></div>
          ) : groups.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><Users size={26} /></div><div className="empty-title">No groups yet</div></div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {groups.map((g) => (
                <button key={g.id} type="button" onClick={() => setOpenId(g.id)}
                  style={{ ...box, marginBottom: 0, textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span><strong>{g.subject}</strong><span style={{ ...hint, display: 'block' }}>{g.participant_count} members{g.last_message_at ? ` · last message ${new Date(g.last_message_at).toLocaleString()}` : ''}</span></span>
                  <Users size={16} color="var(--text-muted)" />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
