import { useCallback, useEffect, useState } from 'react';
import { Loader2, Check, X } from 'lucide-react';
import { tgGroupsAPI } from '../../../services/api';
import { notify } from '../../../utils/alerts';
import { box, hint, fmtDate } from './groupUi';

const STATUSES = [
  { value: 'PENDING', label: 'Waiting' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'DECLINED', label: 'Declined' },
  { value: 'GONE', label: 'Handled elsewhere' },
];

export default function JoinRequestsTab({ groupId, refreshKey, onChanged }) {
  const [status, setStatus] = useState('PENDING');
  const [rows, setRows] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    tgGroupsAPI.joinRequests(groupId, status)
      .then((res) => { setRows(res.data.requests); setSelected(new Set()); })
      .catch((err) => notify.error(err.response?.data?.message || 'Could not load join requests'));
  }, [groupId, status]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const decide = async (ids, approve) => {
    setBusy(true);
    try {
      const res = await tgGroupsAPI.decideJoinRequests(groupId, ids, approve);
      const { done, failed } = res.data;
      if (done) notify.success(`${done} request${done === 1 ? '' : 's'} ${approve ? 'approved' : 'declined'}`);
      if (failed?.length) notify.error(`${failed.length} couldn't be handled: ${failed[0].message}`);
      load();
      onChanged?.();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Telegram refused that');
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pending = status === 'PENDING';

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {pending && selected.size > 0 && (
          <>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => decide([...selected], true)}><Check size={13} /> Approve {selected.size}</button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => decide([...selected], false)}><X size={13} /> Decline {selected.size}</button>
          </>
        )}
      </div>
      <p style={{ ...hint, marginTop: 0, marginBottom: 10 }}>
        Requests come from invite links that need approval, or a public group with "Approve new members" on. The bot needs the <b>Invite users</b> admin right to answer them.
      </p>

      {!rows ? (
        <div style={{ padding: 30, textAlign: 'center' }}><Loader2 className="animate-spin" size={20} /></div>
      ) : rows.length === 0 ? (
        <div style={{ ...box, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.84rem' }}>{pending ? 'No one is waiting to join.' : 'Nothing here.'}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pending && (
            <label style={{ fontSize: '0.78rem', display: 'flex', gap: 6, alignItems: 'center', color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={selected.size === rows.length} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /> Select all
            </label>
          )}
          {rows.map((r) => (
            <div key={r.id} style={{ ...box, marginBottom: 0, padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
              {pending && <input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>{r.name}{r.username && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> @{r.username}</span>}</div>
                {r.bio && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>{r.bio}</div>}
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {fmtDate(r.requested_at)}{r.invite_link_name ? ` · via "${r.invite_link_name}"` : ''}{r.decided_at && !pending ? ` · handled ${fmtDate(r.decided_at)}` : ''}
                </div>
              </div>
              {pending && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => decide([r.id], true)}><Check size={13} /> Approve</button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => decide([r.id], false)}><X size={13} /> Decline</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
