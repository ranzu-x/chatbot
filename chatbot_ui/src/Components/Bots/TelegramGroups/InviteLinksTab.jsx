import { useCallback, useEffect, useState } from 'react';
import { Loader2, Copy, RefreshCw, Link2, XCircle } from 'lucide-react';
import { tgGroupsAPI } from '../../../services/api';
import { notify, showAlert } from '../../../utils/alerts';
import { Switch } from './ui';
import { box, hint, lbl, fmtDate } from './groupUi';

const copy = async (text) => {
  try { await navigator.clipboard.writeText(text); notify.success('Link copied'); } catch { notify.error('Copy failed'); }
};

export default function InviteLinksTab({ groupId }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ name: '', expireHours: '', memberLimit: '', joinRequest: false });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    tgGroupsAPI.inviteLinks(groupId).then((res) => setData(res.data)).catch((err) => notify.error(err.response?.data?.message || 'Could not load links'));
  }, [groupId]);
  useEffect(() => { load(); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await tgGroupsAPI.createInviteLink(groupId, {
        name: form.name, expireHours: Number(form.expireHours) || 0, memberLimit: Number(form.memberLimit) || 0, joinRequest: form.joinRequest,
      });
      await copy(res.data.link.invite_link);
      setForm({ name: '', expireHours: '', memberLimit: '', joinRequest: false });
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not create the link');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (l) => {
    const ok = await showAlert.confirm({ title: 'Revoke this link?', text: 'Nobody can join with it any more.', confirmButtonText: 'Revoke' });
    if (!ok) return;
    try { await tgGroupsAPI.revokeInviteLink(groupId, l.id); load(); } catch (err) { notify.error(err.response?.data?.message || 'Could not revoke it'); }
  };

  const newPrimary = async () => {
    const ok = await showAlert.confirm({ title: 'Make a new main link?', text: "The bot's current main link stops working.", confirmButtonText: 'New link' });
    if (!ok) return;
    try { await tgGroupsAPI.newPrimaryLink(groupId); load(); notify.success('New main link ready'); } catch (err) { notify.error(err.response?.data?.message || 'Could not make a new link'); }
  };

  if (!data) return <div style={{ padding: 30, textAlign: 'center' }}><Loader2 className="animate-spin" size={20} /></div>;

  return (
    <div>
      <div style={box}>
        <strong style={{ fontSize: '0.88rem', display: 'flex', gap: 6, alignItems: 'center' }}><Link2 size={15} /> Main invite link</strong>
        <p style={hint}>Telegram gives every admin their own links; this is the bot's.</p>
        {data.primary && <code style={{ display: 'block', fontSize: '0.8rem', margin: '8px 0', wordBreak: 'break-all' }}>{data.primary}</code>}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {data.primary && <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(data.primary)}><Copy size={12} /> Copy</button>}
          <button type="button" className="btn btn-secondary btn-sm" onClick={newPrimary}><RefreshCw size={12} /> {data.primary ? 'New link' : 'Create link'}</button>
        </div>
      </div>

      <form onSubmit={create} style={box}>
        <strong style={{ fontSize: '0.88rem' }}>New tracked link</strong>
        <p style={hint}>Give each campaign or place its own link and see how many people joined through it.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginTop: 10 }}>
          <label><span style={lbl}>Name</span><input className="form-input w-full" maxLength={32} value={form.name} placeholder="e.g. Instagram bio" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label><span style={lbl}>Expires after (hours)</span><input type="number" min={0} className="form-input w-full" value={form.expireHours} placeholder="never" onChange={(e) => setForm({ ...form, expireHours: e.target.value })} /></label>
          <label><span style={lbl}>Member limit</span><input type="number" min={0} max={99999} disabled={form.joinRequest} className="form-input w-full" value={form.joinRequest ? '' : form.memberLimit} placeholder="no limit" onChange={(e) => setForm({ ...form, memberLimit: e.target.value })} /></label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <Switch checked={form.joinRequest} onChange={(v) => setForm({ ...form, joinRequest: v })} label="People must be approved (join request)" />
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : 'Create & copy'}</button>
        </div>
      </form>

      {data.links.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.links.map((l) => {
            const dead = l.is_revoked || l.is_expired;
            return (
              <div key={l.id} style={{ ...box, marginBottom: 0, padding: 12, display: 'flex', gap: 10, alignItems: 'center', opacity: dead ? 0.6 : 1 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>{l.name || 'Unnamed link'} {dead && <span style={{ fontSize: '0.7rem', color: '#dc2626' }}>{l.is_revoked ? 'revoked' : 'expired'}</span>}</div>
                  <code style={{ fontSize: '0.74rem', wordBreak: 'break-all' }}>{l.invite_link}</code>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                    <b>{l.joins}</b> joined · created {fmtDate(l.created_at)}{l.expire_at ? ` · expires ${fmtDate(l.expire_at)}` : ''}{l.member_limit ? ` · limit ${l.member_limit}` : ''}{l.creates_join_request ? ' · needs approval' : ''}
                  </div>
                </div>
                {!dead && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(l.invite_link)} aria-label="Copy link"><Copy size={12} /></button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => revoke(l)} aria-label="Revoke link"><XCircle size={12} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
