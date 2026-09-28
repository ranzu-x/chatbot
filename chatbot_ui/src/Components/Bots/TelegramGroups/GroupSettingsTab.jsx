import { useEffect, useState } from 'react';
import { Loader2, Save, LogOut, Trash2 } from 'lucide-react';
import { tgGroupsAPI } from '../../../services/api';
import { notify, showAlert } from '../../../utils/alerts';
import { Switch } from './ui';
import { box, hint, lbl } from './groupUi';

/** What regular members may do (setChatPermissions — Bot API ChatPermissions). */
const PERMISSIONS = [
  ['can_send_messages', 'Send text messages'],
  ['can_send_photos', 'Send photos'],
  ['can_send_videos', 'Send videos'],
  ['can_send_audios', 'Send music'],
  ['can_send_documents', 'Send files'],
  ['can_send_voice_notes', 'Send voice messages'],
  ['can_send_video_notes', 'Send video messages'],
  ['can_send_other_messages', 'Send stickers & GIFs'],
  ['can_send_polls', 'Send polls'],
  ['can_add_web_page_previews', 'Link previews'],
  ['can_react_to_messages', 'React to messages'],
  ['can_invite_users', 'Add members'],
  ['can_pin_messages', 'Pin messages'],
  ['can_change_info', 'Change group info'],
  ['can_manage_topics', 'Create topics'],
];

export default function GroupSettingsTab({ group, onChanged, onGone }) {
  const [info, setInfo] = useState({ title: group.title || '', description: group.description || '' });
  const [perms, setPerms] = useState(group.default_permissions || {});
  const [busy, setBusy] = useState(null);
  useEffect(() => { setInfo({ title: group.title || '', description: group.description || '' }); setPerms(group.default_permissions || {}); }, [group]);

  const saveInfo = async () => {
    setBusy('info');
    try { await tgGroupsAPI.saveInfo(group.id, info); notify.success('Group info updated'); onChanged(); } catch (err) { notify.error(err.response?.data?.message || 'Could not update'); } finally { setBusy(null); }
  };
  const savePerms = async () => {
    setBusy('perms');
    try { await tgGroupsAPI.savePermissions(group.id, perms); notify.success('Member permissions updated'); onChanged(); } catch (err) { notify.error(err.response?.data?.message || 'Could not update'); } finally { setBusy(null); }
  };
  const leave = async () => {
    const ok = await showAlert.confirm({ title: `Remove the bot from "${group.title}"?`, text: 'The bot leaves the group and stops managing it. You can add it back in Telegram any time.', confirmButtonText: 'Leave group' });
    if (!ok) return;
    setBusy('leave');
    try { await tgGroupsAPI.leave(group.id); notify.success('The bot left the group'); onChanged(); } catch (err) { notify.error(err.response?.data?.message || 'Could not leave'); } finally { setBusy(null); }
  };
  const forget = async () => {
    const ok = await showAlert.confirm({ title: 'Delete this group from the list?', text: 'Its members, activity log and settings here are deleted.', confirmButtonText: 'Delete' });
    if (!ok) return;
    try { await tgGroupsAPI.forget(group.id); notify.success('Group removed'); onGone(); } catch (err) { notify.error(err.response?.data?.message || 'Could not remove it'); }
  };

  const infoDirty = info.title !== (group.title || '') || info.description !== (group.description || '');
  const permsDirty = JSON.stringify(PERMISSIONS.map(([k]) => Boolean(perms[k]))) !== JSON.stringify(PERMISSIONS.map(([k]) => Boolean(group.default_permissions?.[k])));
  const isOut = Boolean(group.left_at);

  return (
    <div>
      {!isOut && (
        <>
          <div style={box}>
            <strong style={{ fontSize: '0.88rem' }}>Group info</strong>
            <p style={hint}>Changes the group in Telegram. Needs the bot's <b>Change group info</b> right.</p>
            <label style={{ display: 'block', marginTop: 10 }}>
              <span style={lbl}>Title</span>
              <input className="form-input w-full" maxLength={128} value={info.title} onChange={(e) => setInfo({ ...info, title: e.target.value })} />
            </label>
            <label style={{ display: 'block', marginTop: 10 }}>
              <span style={lbl}>Description</span>
              <textarea className="form-input w-full" rows={3} maxLength={255} value={info.description} onChange={(e) => setInfo({ ...info, description: e.target.value })} />
            </label>
            {infoDirty && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={saveInfo} disabled={busy === 'info'}>{busy === 'info' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save info</button>
              </div>
            )}
          </div>

          <div style={box}>
            <strong style={{ fontSize: '0.88rem' }}>What members can do</strong>
            <p style={hint}>The group's default permissions for everyone who isn't an admin (supergroups; needs <b>Ban users</b>).</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10, marginTop: 12 }}>
              {PERMISSIONS.map(([key, label]) => (
                <Switch key={key} checked={Boolean(perms[key])} onChange={(v) => setPerms((p) => ({ ...p, [key]: v }))} label={label} />
              ))}
            </div>
            {permsDirty && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={savePerms} disabled={busy === 'perms'}>{busy === 'perms' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save permissions</button>
              </div>
            )}
          </div>
        </>
      )}

      <div style={{ ...box, borderColor: 'rgba(220, 38, 38, 0.35)' }}>
        <strong style={{ fontSize: '0.88rem', color: '#dc2626' }}>{isOut ? 'The bot is no longer in this group' : 'Remove the bot'}</strong>
        <p style={hint}>{isOut ? 'Delete it from this list, or add the bot to the group again in Telegram to keep managing it.' : 'The bot leaves the group. Its history here is kept.'}</p>
        <div style={{ marginTop: 10 }}>
          {isOut
            ? <button type="button" className="btn btn-secondary btn-sm" onClick={forget}><Trash2 size={13} /> Delete from list</button>
            : <button type="button" className="btn btn-secondary btn-sm" onClick={leave} disabled={busy === 'leave'}>{busy === 'leave' ? <Loader2 size={13} className="animate-spin" /> : <LogOut size={13} />} Leave group</button>}
        </div>
      </div>
    </div>
  );
}
