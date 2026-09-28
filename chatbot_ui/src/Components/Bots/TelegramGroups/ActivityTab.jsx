import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { tgGroupsAPI } from '../../../services/api';
import { notify } from '../../../utils/alerts';
import { box, fmtDate } from './groupUi';

const ACTIONS = {
  JOIN: 'Joined', LEAVE: 'Left', WARN: 'Warned', UNWARN: 'Warning removed', MUTE: 'Muted', UNMUTE: 'Unmuted',
  KICK: 'Removed', BAN: 'Banned', UNBAN: 'Unbanned', DELETE: 'Message deleted', REPORT: 'Reported',
  CAPTCHA_SENT: 'Captcha sent', CAPTCHA_PASSED: 'Passed captcha', CAPTCHA_FAILED: 'Failed captcha',
  JOIN_REQUEST: 'Asked to join', JOIN_APPROVED: 'Request approved', JOIN_DECLINED: 'Request declined',
  POST: 'Posted', PIN: 'Pinned', UNPIN: 'Unpinned', INVITE_LINK: 'Invite link', PERMISSIONS: 'Permissions changed',
  BOT_ADDED: 'Bot added', BOT_REMOVED: 'Bot removed', BOT_PROMOTED: 'Bot made admin', BOT_DEMOTED: 'Bot no longer admin',
  BOT_RIGHTS_CHANGED: 'Bot rights changed', ERROR: 'Problem',
};
const TONE = { WARN: '#d97706', MUTE: '#d97706', KICK: '#dc2626', BAN: '#dc2626', DELETE: '#d97706', REPORT: '#dc2626', CAPTCHA_FAILED: '#dc2626', ERROR: '#dc2626', JOIN: '#16a34a', CAPTCHA_PASSED: '#16a34a', JOIN_APPROVED: '#16a34a' };
const FILTERS = ['', 'REPORT', 'WARN', 'MUTE', 'KICK', 'BAN', 'DELETE', 'JOIN', 'LEAVE', 'CAPTCHA_FAILED', 'ERROR'];

export default function ActivityTab({ groupId, refreshKey }) {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    tgGroupsAPI.logs(groupId, { action: action || undefined, page, pageSize: 50 })
      .then((res) => setData(res.data))
      .catch((err) => notify.error(err.response?.data?.message || 'Could not load activity'));
  }, [groupId, action, page]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const pages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1;

  return (
    <div>
      <select className="form-input" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} style={{ marginBottom: 12 }}>
        {FILTERS.map((f) => <option key={f} value={f}>{f ? ACTIONS[f] : 'Everything'}</option>)}
      </select>
      {!data ? (
        <div style={{ padding: 30, textAlign: 'center' }}><Loader2 className="animate-spin" size={20} /></div>
      ) : data.logs.length === 0 ? (
        <div style={{ ...box, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>Nothing yet.</div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          {data.logs.map((l, i) => (
            <div key={l.id} style={{ display: 'flex', gap: 12, padding: '9px 12px', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: '0.82rem', alignItems: 'flex-start' }}>
              <span style={{ fontWeight: 700, color: TONE[l.action] || 'var(--text-secondary)', minWidth: 130 }}>{ACTIONS[l.action] || l.action}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                {l.user_name && <b>{l.user_name} </b>}
                {l.detail && <span style={{ color: 'var(--text-secondary)' }}>{l.detail}</span>}
                {l.actor && <span style={{ color: 'var(--text-muted)' }}> · by {l.actor}</span>}
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(l.created_at)}</span>
            </div>
          ))}
        </div>
      )}
      {data && pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center', marginTop: 10, fontSize: '0.8rem' }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>{page} / {pages}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
