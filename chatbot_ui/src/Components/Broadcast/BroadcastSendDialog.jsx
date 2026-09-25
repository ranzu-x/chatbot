import { useState, useEffect } from 'react';
import { broadcastAPI } from '../../services/api';
import { useBroadcastCampaignContext } from './useBroadcastCampaign';
import { Segmented } from './BroadcastStartNodeProperties';
import { confirmBroadcastAudience, showSendStarted, showBroadcastError, canScheduleBroadcast } from './broadcastDialogs';
import { X, Send, CalendarClock, Zap, Loader2, Lock, Users, FileText, MessagesSquare, AlertTriangle, CircleCheck } from 'lucide-react';

/** Date → value for <input type="datetime-local"> in the viewer's local time. */
function toLocalInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Row({ icon, label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-muted)', display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, flexShrink: 0 }}>{label}</span>
      <span style={{ marginLeft: 'auto', fontSize: '0.82rem', fontWeight: 700, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
    </div>
  );
}

/**
 * The Flow Builder's "Review & Send" for a broadcast. The builder has already
 * saved the flow before opening this; here the campaign itself is saved and
 * the server says whether it's ready (readyErrors) and how many subscribers it
 * reaches. Send now / Schedule then go through the same audience
 * confirmations as the Broadcasting page (the server re-checks all of it).
 * `onDone` runs after a successful send/schedule (the builder redirects).
 */
export default function BroadcastSendDialog({ platform, onClose, onDone }) {
  const bc = useBroadcastCampaignContext();
  const campaign = bc?.campaign;
  const [check, setCheck] = useState(null); // server readiness, null while loading
  const [checkError, setCheckError] = useState('');
  const schedulable = canScheduleBroadcast(platform, bc?.mode);
  const [timingChoice, setTiming] = useState(campaign?.scheduled_at ? 'SCHEDULE' : 'INSTANT');
  const timing = schedulable ? timingChoice : 'INSTANT';
  const [scheduleAt, setScheduleAt] = useState(toLocalInput(campaign?.scheduled_at));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    bc?.persist()
      .then((data) => { if (alive) setCheck(data); })
      .catch((err) => { if (alive) setCheckError(err?.response?.data?.message || 'Could not check this broadcast.'); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- check once per opening
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  if (!campaign) return null;
  const readyErrors = check?.readyErrors || [];
  const count = check?.audienceCount ?? 0;
  const blocked = !check || readyErrors.length > 0 || count === 0;

  const handleConfirm = async () => {
    if (busy || blocked) return;
    let whenIso = null;
    if (timing === 'SCHEDULE') {
      if (!scheduleAt) { showBroadcastError({ message: 'Pick a date and time to schedule this broadcast.' }); return; }
      if (new Date(scheduleAt).getTime() < Date.now() + 60 * 1000) { showBroadcastError({ message: 'Pick a time at least a minute from now.' }); return; }
      whenIso = new Date(scheduleAt).toISOString();
    }
    setBusy(true);
    try {
      const ok = await confirmBroadcastAudience({ audience: check, action: whenIso ? 'schedule' : 'send', accountLabel: bc.accountLabel, scheduledAt: whenIso });
      if (!ok) return;
      if (whenIso) await broadcastAPI.schedule(campaign.id, whenIso, { confirmAudience: true });
      else await broadcastAPI.sendNow(campaign.id, { confirmAudience: true });
      await showSendStarted({ scheduledAt: whenIso, rescheduled: Boolean(whenIso) && campaign.status === 'SCHEDULED' });
      onDone();
    } catch (err) {
      showBroadcastError(err, 'Could not send this broadcast');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bc-send-title"
        style={{ width: 480, maxWidth: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-card, #fff)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.25)' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--primary-soft)', color: 'var(--primary)', flexShrink: 0 }}><Send size={17} /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div id="bc-send-title" style={{ fontWeight: 800, fontSize: '1rem' }}>Review &amp; Send</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{campaign.name}</div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} disabled={busy} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ padding: '6px 18px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <Row icon={<Lock size={14} />} label="Sending from">{bc.accountLabel || 'Account no longer connected'}</Row>
            {platform === 'WHATSAPP' && (
              <Row icon={bc.mode === 'TEMPLATE' ? <FileText size={14} /> : <MessagesSquare size={14} />} label="Type">
                {bc.mode === 'TEMPLATE' ? 'Anytime (template)' : 'Inside 24 hours'}
              </Row>
            )}
            <Row icon={<Users size={14} />} label="Audience">
              {check ? `${count.toLocaleString()} ${count === 1 ? 'subscriber' : 'subscribers'}${check.noFilter ? ' · no filter' : ''}` : (checkError ? '—' : <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />)}
            </Row>
          </div>

          {checkError && (
            <div style={{ padding: '9px 11px', borderRadius: 9, background: 'rgba(239,68,68,.07)', border: '1px solid rgba(239,68,68,.2)', fontSize: '0.78rem', color: 'var(--danger)' }}>{checkError}</div>
          )}
          {check && (readyErrors.length > 0 || count === 0) && (
            <div style={{ display: 'flex', gap: 8, padding: '9px 11px', borderRadius: 9, background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.3)', fontSize: '0.78rem', lineHeight: 1.5 }}>
              <AlertTriangle size={15} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
              <div>
                <strong>Not ready to send yet</strong>
                <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                  {readyErrors.map((e) => <li key={e}>{e}</li>)}
                  {count === 0 && !readyErrors.length && <li>No subscriber matches this audience.</li>}
                </ul>
              </div>
            </div>
          )}
          {check && !blocked && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.78rem', color: 'var(--success, #16a34a)', fontWeight: 600 }}>
              <CircleCheck size={15} /> Ready to send
            </div>
          )}

          {!schedulable ? (
            <div style={{ display: 'flex', gap: 8, padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-hover)', fontSize: '0.78rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
              <Zap size={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--primary)' }} />
              <span>Sends now. An Inside 24 hours broadcast can&apos;t be scheduled — who is inside the window changes by the hour. To schedule, switch the Broadcast element to Anytime (template).</span>
            </div>
          ) : (
          <div className="fb-field" style={{ margin: 0 }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: 6 }}>When to send</label>
            <Segmented
              ariaLabel="When to send"
              value={timing}
              onChange={setTiming}
              options={[
                { value: 'INSTANT', label: 'Send now', icon: <Zap size={13} /> },
                { value: 'SCHEDULE', label: 'Schedule', icon: <CalendarClock size={13} /> },
              ]}
            />
            {timing === 'SCHEDULE' && (
              <input
                type="datetime-local"
                aria-label="Send date and time"
                className="form-input"
                value={scheduleAt}
                min={toLocalInput(Date.now() + 60 * 1000)}
                onChange={(e) => setScheduleAt(e.target.value)}
                style={{ marginTop: 8, width: '100%' }}
              />
            )}
          </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--border)', background: 'var(--bg-base)' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={busy || blocked} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            {busy ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : (timing === 'SCHEDULE' ? <CalendarClock size={14} /> : <Send size={14} />)}
            {timing === 'SCHEDULE' ? (campaign.status === 'SCHEDULED' ? 'Reschedule' : 'Schedule') : 'Send now'}
          </button>
        </div>
      </div>
    </div>
  );
}
