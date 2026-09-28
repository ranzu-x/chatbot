import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, Mic, Save, Loader2, Plus, Trash2, Download,
  Play, Link2, Copy, RefreshCw, AlertTriangle, CheckCircle2, MessageSquare, Upload,
} from 'lucide-react';
import { whatsappCallAPI } from '../../services/api';
import { notify, showAlert } from '../../utils/alerts';
import useUrlState from '../../hooks/useUrlState';

/**
 * Bot Manager → Automation → WhatsApp Calling, for one WhatsApp number.
 * Built on Meta's Calling API (developers.facebook.com/documentation/
 * business-messaging/whatsapp/calling): call settings (on/off, call icon,
 * call hours + holidays, callback requests, voicemail, codecs, SIP), the call
 * log with recordings, stats, and call buttons / wa.me/call links.
 * Answering customers' calls happens anywhere in the dashboard
 * (Components/Calls/IncomingCallManager.jsx); placing calls, in the Inbox.
 */

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const DAY_LABEL = { MONDAY: 'Mon', TUESDAY: 'Tue', WEDNESDAY: 'Wed', THURSDAY: 'Thu', FRIDAY: 'Fri', SATURDAY: 'Sat', SUNDAY: 'Sun' };
const SECTIONS = [
  ['overview', 'Overview'],
  ['log', 'Call Log'],
  ['settings', 'Settings'],
  ['links', 'Call Buttons & Links'],
];

const toInput = (hhmm) => (hhmm && hhmm.length === 4 ? `${hhmm.slice(0, 2)}:${hhmm.slice(2)}` : '');
const fromInput = (v) => String(v || '').replace(':', '');
const fmtDur = (s) => {
  const n = Math.max(0, Math.round(Number(s) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const sec = n % 60;
  return h ? `${h}h ${m}m` : `${m}:${String(sec).padStart(2, '0')}`;
};
const fmtWhen = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');

const box = { background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 };
const label = { fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' };
const hint = { fontSize: '0.74rem', color: 'var(--text-muted)', margin: '4px 0 0' };

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 38, height: 22, borderRadius: 11, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0,
        background: checked ? 'var(--primary)' : 'var(--border)', position: 'relative', transition: 'background 0.15s', opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{ position: 'absolute', top: 3, left: checked ? 19 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
    </button>
  );
}

function Row({ title, desc, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
        {desc && <p style={hint}>{desc}</p>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function StatCard({ icon, label: text, value, sub, color }) {
  return (
    <div style={{ ...box, display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color}1a`, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{text}</div>
        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>{value}</div>
        {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────────────────────────
function Overview({ account, settings, onGo }) {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  useEffect(() => {
    setStats(null);
    whatsappCallAPI.getStats({ integrationId: account.id, days })
      .then((res) => setStats(res.data.stats))
      .catch(() => setStats({}));
  }, [account.id, days]);

  const calling = settings?.calling;
  const checks = [
    { ok: calling?.status === 'ENABLED', text: 'Calling is turned on for this number', fix: 'settings' },
    { ok: calling?.call_icon_visibility !== 'DISABLE_ALL', text: 'The call button shows in the WhatsApp chat', fix: 'settings' },
    { ok: calling?.sip?.status !== 'ENABLED', text: 'Calls ring in this dashboard (SIP is off)', fix: 'settings' },
    { ok: Boolean(settings?.prefs), text: 'Webhook field "calls" is subscribed in your Meta app (WhatsApp → Configuration)', info: true },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0, fontSize: '0.95rem' }}>Last {days} days</h4>
        <select className="form-input" style={{ width: 'auto' }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>
      {!stats ? (
        <div style={{ padding: 30, textAlign: 'center' }}><Loader2 className="animate-spin" size={20} /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 }}>
          <StatCard icon={<PhoneIncoming size={18} />} label="Incoming calls" value={stats.incoming ?? 0} sub={stats.answerRate != null ? `${stats.answerRate}% answered` : null} color="#16a34a" />
          <StatCard icon={<PhoneMissed size={18} />} label="Missed calls" value={stats.missed ?? 0} color="#dc2626" />
          <StatCard icon={<PhoneOutgoing size={18} />} label="Outgoing calls" value={stats.outgoing ?? 0} sub={stats.unansweredOutgoing ? `${stats.unansweredOutgoing} not answered` : null} color="#2563eb" />
          <StatCard icon={<Clock size={18} />} label="Talk time" value={fmtDur(stats.talkSeconds)} sub={stats.avgSeconds ? `avg ${fmtDur(stats.avgSeconds)} per call` : null} color="#7c3aed" />
          <StatCard icon={<PhoneOutgoing size={18} />} label="Billable outgoing time" value={fmtDur(stats.billableOutgoingSeconds)} sub="Meta bills business calls per 6 s; customer calls are free" color="#0891b2" />
          <StatCard icon={<Mic size={18} />} label="Recorded calls" value={stats.recorded ?? 0} color="#ea580c" />
        </div>
      )}

      <div style={box}>
        <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 8 }}>Setup checklist</div>
        {settings?.metaError && (
          <div style={{ fontSize: '0.8rem', color: '#b45309', marginBottom: 8, display: 'flex', gap: 6 }}>
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {settings.metaError}
          </div>
        )}
        {checks.map((c) => (
          <div key={c.text} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: '0.82rem' }}>
            {c.info ? <AlertTriangle size={15} color="#64748b" /> : c.ok ? <CheckCircle2 size={15} color="#16a34a" /> : <AlertTriangle size={15} color="#dc2626" />}
            <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{c.text}</span>
            {!c.ok && !c.info && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onGo(c.fix)}>Fix</button>}
          </div>
        ))}
        <p style={hint}>
          Meta also requires the number to be on the Cloud API with a messaging limit of at least 2,000 customers a day.
          Customers can call from the chat's call icon, a call button, or a wa.me/call link. To call a customer,
          open their chat in the Inbox and press the phone icon (they must allow calls first).
        </p>
      </div>
    </div>
  );
}

// ─── Call log ────────────────────────────────────────────────────────────────
function CallLog({ account }) {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({ direction: '', status: '', q: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ calls: [], total: 0, pageSize: 25 });
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState({}); // callId → blob url

  const load = useCallback(() => {
    setLoading(true);
    whatsappCallAPI.getLog({ integrationId: account.id, page, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) })
      .then((res) => setData(res.data))
      .catch(() => notify.error('Could not load the call log'))
      .finally(() => setLoading(false));
  }, [account.id, page, filters]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => Object.values(playing).forEach((u) => URL.revokeObjectURL(u)), [playing]);

  const fetchRecording = async (call, download) => {
    try {
      const res = await whatsappCallAPI.getRecording(call.id);
      const url = URL.createObjectURL(res.data);
      if (download) {
        const a = document.createElement('a');
        a.href = url;
        a.download = `call-${call.id}.${res.data.type.includes('ogg') ? 'ogg' : 'webm'}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        setPlaying((p) => ({ ...p, [call.id]: url }));
      }
    } catch {
      notify.error('Could not load the recording');
    }
  };

  const deleteRecording = async (call) => {
    const ok = await showAlert.confirm({ title: 'Delete this recording?', text: 'The call stays in the log; only the audio is removed.', confirmButtonText: 'Delete' });
    if (!ok) return;
    try {
      await whatsappCallAPI.deleteRecording(call.id);
      notify.success('Recording deleted');
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not delete the recording');
    }
  };

  const statusBadge = (c) => {
    const map = {
      COMPLETED: ['badge-success', 'Answered'], MISSED: ['badge-danger', 'Missed'], REJECTED: ['badge-danger', 'Declined'],
      FAILED: ['badge-danger', 'Failed'], RINGING: ['badge-warning', 'Ringing'], CONNECTED: ['badge-success', 'In progress'],
      ACCEPTED: ['badge-success', 'In progress'], INITIATING: ['badge-muted', 'Calling'], TERMINATED: ['badge-muted', 'Ended'],
    };
    const [cls, text] = map[c.status] || ['badge-muted', c.status];
    return <span className={`badge ${cls}`} title={c.end_reason || c.error_message || ''}>{text}</span>;
  };
  const who = (c) => c.contact_name || c.contact_phone || (c.contact_username ? `@${c.contact_username}` : c.caller_number) || 'Customer';
  const pages = Math.max(1, Math.ceil((data.total || 0) / (data.pageSize || 25)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input className="form-input" style={{ flex: '1 1 200px' }} placeholder="Search name or number…" value={filters.q} onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, q: e.target.value })); }} />
        <select className="form-input" style={{ width: 'auto' }} value={filters.direction} onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, direction: e.target.value })); }}>
          <option value="">All directions</option>
          <option value="USER_INITIATED">Incoming</option>
          <option value="BUSINESS_INITIATED">Outgoing</option>
        </select>
        <select className="form-input" style={{ width: 'auto' }} value={filters.status} onChange={(e) => { setPage(1); setFilters((f) => ({ ...f, status: e.target.value })); }}>
          <option value="">All calls</option>
          <option value="ANSWERED">Answered</option>
          <option value="MISSED">Missed / declined</option>
          <option value="RECORDED">With recording</option>
        </select>
        <button type="button" className="btn btn-secondary" onClick={load} title="Refresh"><RefreshCw size={14} /></button>
      </div>

      {loading ? (
        <div style={{ padding: 30, textAlign: 'center' }}><Loader2 className="animate-spin" size={20} /></div>
      ) : data.calls.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Phone size={26} /></div>
          <div className="empty-title">No calls yet</div>
          <div className="empty-desc">Calls to and from this number show up here.</div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr><th>When</th><th>Customer</th><th>Direction</th><th>Status</th><th>Duration</th><th>Agent</th><th>Recording</th><th /></tr>
            </thead>
            <tbody>
              {data.calls.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{fmtWhen(c.started_at)}</td>
                  <td>
                    <div className="font-medium">{who(c)}</div>
                    {(c.cta_payload || c.deeplink_payload) && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>via {c.cta_payload ? 'call button' : 'call link'}: {c.cta_payload || c.deeplink_payload}</div>}
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>
                    {c.direction === 'USER_INITIATED'
                      ? <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><PhoneIncoming size={13} color="#16a34a" /> Incoming</span>
                      : <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><PhoneOutgoing size={13} color="#2563eb" /> Outgoing</span>}
                  </td>
                  <td>{statusBadge(c)}</td>
                  <td style={{ fontSize: '0.8rem' }}>{c.duration_seconds ? fmtDur(c.duration_seconds) : '—'}</td>
                  <td style={{ fontSize: '0.8rem' }}>{c.agent_name || '—'}</td>
                  <td>
                    {c.has_recording ? (
                      playing[c.id] ? (
                        <audio src={playing[c.id]} controls autoPlay style={{ height: 32, maxWidth: 220 }} />
                      ) : (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button type="button" className="btn btn-secondary btn-sm" title="Play" onClick={() => fetchRecording(c, false)}><Play size={12} /></button>
                          <button type="button" className="btn btn-secondary btn-sm" title="Download" onClick={() => fetchRecording(c, true)}><Download size={12} /></button>
                          <button type="button" className="btn btn-secondary btn-sm" title="Delete recording" onClick={() => deleteRecording(c)}><Trash2 size={12} /></button>
                        </div>
                      )
                    ) : <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td>
                    {c.conversation_id && (
                      <button type="button" className="btn btn-secondary btn-sm" title="Open chat" onClick={() => navigate(`/inbox?conv=${c.conversation_id}`)}><MessageSquare size={12} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'center', fontSize: '0.8rem' }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {page} of {pages}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────
function emptyCalling() {
  return {
    status: 'DISABLED', call_icon_visibility: 'DEFAULT', call_icons: { restrict_to_user_countries: [] },
    callback_permission_status: 'DISABLED',
    call_hours: { status: 'DISABLED', timezone_id: Intl.DateTimeFormat().resolvedOptions().timeZone, weekly_operating_hours: [], holiday_schedule: [] },
    voicemail: { status: 'DISABLED', triggers: ['TIMEOUT'], audio: { default: { announcement_media_id: '', timeout_seconds: 20 } } },
    audio: { additional_codecs: [] },
    sip: { status: 'DISABLED', servers: [] },
  };
}

function Settings({ account, settings, onSaved, canEdit }) {
  const [calling, setCalling] = useState(() => ({ ...emptyCalling(), ...(settings?.calling || {}) }));
  const [prefs, setPrefs] = useState(settings?.prefs || {});
  const [countries, setCountries] = useState((settings?.calling?.call_icons?.restrict_to_user_countries || []).join(', '));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const timeZones = useMemo(() => {
    try { return Intl.supportedValuesOf('timeZone'); } catch { return [calling.call_hours?.timezone_id || 'UTC']; }
  }, [calling.call_hours?.timezone_id]);

  const set = (patch) => setCalling((c) => ({ ...c, ...patch }));
  const hours = calling.call_hours || emptyCalling().call_hours;
  const setHours = (patch) => set({ call_hours: { ...hours, ...patch } });
  const slotsFor = (day) => (hours.weekly_operating_hours || []).filter((w) => w.day_of_week === day);
  const setSlots = (day, slots) => setHours({ weekly_operating_hours: [...(hours.weekly_operating_hours || []).filter((w) => w.day_of_week !== day), ...slots.map((s) => ({ ...s, day_of_week: day }))] });
  const vm = calling.voicemail || emptyCalling().voicemail;
  const setVm = (patch) => set({ voicemail: { ...vm, ...patch } });
  const vmAudio = vm.audio?.default || { announcement_media_id: '', timeout_seconds: 20 };
  const sip = calling.sip || { status: 'DISABLED', servers: [] };

  const copyWeekdays = () => {
    const mon = slotsFor('MONDAY');
    if (!mon.length) { notify.error('Set Monday first'); return; }
    setHours({ weekly_operating_hours: [...['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].flatMap((d) => mon.map((s) => ({ ...s, day_of_week: d }))), ...(hours.weekly_operating_hours || []).filter((w) => ['SATURDAY', 'SUNDAY'].includes(w.day_of_week))] });
  };

  const uploadGreeting = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await whatsappCallAPI.uploadVoicemail(account.id, file);
      setVm({ audio: { default: { ...vmAudio, announcement_media_id: res.data.mediaId } } });
      notify.success('Greeting uploaded — save to use it');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...calling,
        call_icons: { restrict_to_user_countries: countries.split(/[\s,]+/).map((c) => c.trim().toUpperCase()).filter(Boolean) },
      };
      delete payload.restrictions;
      await whatsappCallAPI.saveSettings(account.id, { calling: payload, prefs });
      notify.success('Call settings saved');
      onSaved();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not save the call settings');
    } finally {
      setSaving(false);
    }
  };

  const restrictions = settings?.calling?.restrictions?.restrictions_list || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {settings?.metaError && (
        <div style={{ ...box, borderColor: '#f59e0b', fontSize: '0.82rem', display: 'flex', gap: 8 }}>
          <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
          <span>{settings.metaError}. You can still change the options below; saving sends them to Meta.</span>
        </div>
      )}
      {restrictions.length > 0 && (
        <div style={{ ...box, borderColor: '#dc2626', fontSize: '0.82rem' }}>
          <strong style={{ color: '#dc2626' }}>Meta has restricted calling on this number</strong>
          {restrictions.map((r) => (
            <div key={r.type} style={{ marginTop: 4 }}>{r.type.replace(/_/g, ' ').toLowerCase()}: {r.reason}{r.expiration ? ` (until ${fmtWhen(r.expiration * 1000)})` : ''}</div>
          ))}
        </div>
      )}

      <div style={box}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Calling</div>
        <Row title="Allow WhatsApp calls on this number" desc="Turns Meta's Calling API on for this number. Customers can then call you, and you can call customers who allowed it.">
          <Toggle checked={calling.status === 'ENABLED'} onChange={(v) => set({ status: v ? 'ENABLED' : 'DISABLED' })} disabled={!canEdit} />
        </Row>
        <Row title="Show the call button in the chat" desc="Off hides the phone icon in WhatsApp; customers can still call from a call button or call link you send.">
          <Toggle checked={calling.call_icon_visibility !== 'DISABLE_ALL'} onChange={(v) => set({ call_icon_visibility: v ? 'DEFAULT' : 'DISABLE_ALL' })} disabled={!canEdit} />
        </Row>
        <div style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={label}>Only show the call button to customers in these countries</span>
          <input className="form-input w-full" placeholder="e.g. BD, IN, AE — empty = everywhere" value={countries} onChange={(e) => setCountries(e.target.value)} disabled={!canEdit} />
          <p style={hint}>Two-letter country codes, comma separated.</p>
        </div>
        <Row title="Callback requests" desc="When nobody answers or it's outside call hours, WhatsApp offers the customer to ask for a call back — they are then permitted to receive your call.">
          <Toggle checked={calling.callback_permission_status === 'ENABLED'} onChange={(v) => set({ callback_permission_status: v ? 'ENABLED' : 'DISABLED' })} disabled={!canEdit} />
        </Row>
      </div>

      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Call hours</div>
          <Toggle checked={hours.status === 'ENABLED'} onChange={(v) => setHours({ status: v ? 'ENABLED' : 'DISABLED' })} disabled={!canEdit} />
        </div>
        <p style={hint}>Outside these hours WhatsApp tells customers you're closed instead of ringing (and offers a callback if that's on). Up to 2 time ranges per day.</p>
        {hours.status === 'ENABLED' && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <span style={label}>Time zone</span>
              <select className="form-input" value={hours.timezone_id || ''} onChange={(e) => setHours({ timezone_id: e.target.value })} disabled={!canEdit}>
                {timeZones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
            {DAYS.map((day) => {
              const slots = slotsFor(day);
              return (
                <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ width: 40, fontSize: '0.82rem', fontWeight: 600 }}>{DAY_LABEL[day]}</span>
                  {slots.length === 0 && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Closed</span>}
                  {slots.map((s, i) => (
                    <span key={`${day}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <input type="time" className="form-input" style={{ width: 110 }} value={toInput(s.open_time)} disabled={!canEdit}
                        onChange={(e) => setSlots(day, slots.map((x, j) => (j === i ? { ...x, open_time: fromInput(e.target.value) } : x)))} />
                      –
                      <input type="time" className="form-input" style={{ width: 110 }} value={toInput(s.close_time)} disabled={!canEdit}
                        onChange={(e) => setSlots(day, slots.map((x, j) => (j === i ? { ...x, close_time: fromInput(e.target.value) } : x)))} />
                      {canEdit && <button type="button" className="btn btn-secondary btn-sm" title="Remove" onClick={() => setSlots(day, slots.filter((_, j) => j !== i))}><Trash2 size={12} /></button>}
                    </span>
                  ))}
                  {canEdit && slots.length < 2 && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSlots(day, [...slots, { open_time: '0900', close_time: '1800' }])}><Plus size={12} /> Hours</button>
                  )}
                </div>
              );
            })}
            {canEdit && <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={copyWeekdays}>Copy Monday to Tue–Fri</button>}

            <div style={{ marginTop: 6 }}>
              <span style={label}>Holidays and exceptions (closed, up to 20)</span>
              {(hours.holiday_schedule || []).map((h, i) => (
                <div key={`hol-${i}`} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                  <input type="date" className="form-input" style={{ width: 160 }} value={h.date} disabled={!canEdit}
                    onChange={(e) => setHours({ holiday_schedule: hours.holiday_schedule.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })} />
                  <input type="time" className="form-input" style={{ width: 110 }} value={toInput(h.start_time)} disabled={!canEdit}
                    onChange={(e) => setHours({ holiday_schedule: hours.holiday_schedule.map((x, j) => (j === i ? { ...x, start_time: fromInput(e.target.value) } : x)) })} />
                  –
                  <input type="time" className="form-input" style={{ width: 110 }} value={toInput(h.end_time)} disabled={!canEdit}
                    onChange={(e) => setHours({ holiday_schedule: hours.holiday_schedule.map((x, j) => (j === i ? { ...x, end_time: fromInput(e.target.value) } : x)) })} />
                  {canEdit && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setHours({ holiday_schedule: hours.holiday_schedule.filter((_, j) => j !== i) })}><Trash2 size={12} /></button>}
                </div>
              ))}
              {canEdit && (hours.holiday_schedule || []).length < 20 && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setHours({ holiday_schedule: [...(hours.holiday_schedule || []), { date: '', start_time: '0000', end_time: '2359' }] })}>
                  <Plus size={12} /> Add holiday
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Voicemail</div>
          <Toggle checked={vm.status === 'ENABLED'} onChange={(v) => setVm({ status: v ? 'ENABLED' : 'DISABLED' })} disabled={!canEdit} />
        </div>
        <p style={hint}>Plays your greeting and lets the customer leave a voice message in the chat when a call isn't answered or is declined.</p>
        {vm.status === 'ENABLED' && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 16, fontSize: '0.82rem' }}>
              {[['TIMEOUT', 'Not answered'], ['REJECT', 'Declined']].map(([id, text]) => (
                <label key={id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={(vm.triggers || []).includes(id)} disabled={!canEdit}
                    onChange={(e) => setVm({ triggers: e.target.checked ? [...(vm.triggers || []), id] : (vm.triggers || []).filter((t) => t !== id) })} />
                  {text}
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="btn btn-secondary btn-sm" style={{ cursor: canEdit ? 'pointer' : 'not-allowed' }}>
                {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} {vmAudio.announcement_media_id ? 'Replace greeting' : 'Upload greeting (.ogg)'}
                <input type="file" accept=".ogg,audio/ogg" hidden disabled={!canEdit || uploading} onChange={(e) => uploadGreeting(e.target.files?.[0])} />
              </label>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {vmAudio.announcement_media_id ? `Greeting set (media ${vmAudio.announcement_media_id})` : "No greeting — WhatsApp's default is used"}
              </span>
            </div>
            <div style={{ maxWidth: 260 }}>
              <span style={label}>Ring for (seconds, 0–30) before voicemail</span>
              <input type="number" min={0} max={30} className="form-input" value={vmAudio.timeout_seconds ?? 20} disabled={!canEdit}
                onChange={(e) => setVm({ audio: { default: { ...vmAudio, timeout_seconds: Number(e.target.value) } } })} />
            </div>
            <p style={hint}>Greeting: Opus audio in an .ogg file, under 60 seconds.</p>
          </div>
        )}
      </div>

      <div style={box}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>In this dashboard</div>
        <Row title="Record calls" desc="Answered and placed calls are recorded in the agent's browser and kept privately in the Call Log. Tell customers the call is recorded — this is a legal requirement in many countries.">
          <Toggle checked={Boolean(prefs.recordCalls)} onChange={(v) => setPrefs((p) => ({ ...p, recordCalls: v }))} disabled={!canEdit} />
        </Row>
        <Row title="Reply to missed calls" desc="Sends this WhatsApp message when a customer's call isn't answered (the call opens a 24-hour window, so no template is needed).">
          <Toggle checked={Boolean(prefs.missedCallReplyEnabled)} onChange={(v) => setPrefs((p) => ({ ...p, missedCallReplyEnabled: v }))} disabled={!canEdit} />
        </Row>
        {prefs.missedCallReplyEnabled && (
          <textarea className="form-input w-full" rows={3} style={{ marginTop: 10 }} maxLength={1000} value={prefs.missedCallReply || ''} disabled={!canEdit}
            onChange={(e) => setPrefs((p) => ({ ...p, missedCallReply: e.target.value }))} />
        )}
      </div>

      <details style={box}>
        <summary style={{ fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>Advanced: audio codecs and SIP</summary>
        <div style={{ marginTop: 10 }}>
          <Row title="Also allow G.711 audio (PCMA / PCMU)" desc="Only needed for SIP phone systems that can't use Opus.">
            <Toggle checked={(calling.audio?.additional_codecs || []).length > 0} onChange={(v) => set({ audio: { additional_codecs: v ? ['PCMA', 'PCMU'] : [] } })} disabled={!canEdit} />
          </Row>
          <Row title="Send calls to my SIP phone system" desc="Calls go to your SIP server (e.g. Asterisk) instead of this dashboard. While on, calls don't ring here and the Inbox call button stops working.">
            <Toggle checked={sip.status === 'ENABLED'} onChange={(v) => set({ sip: { ...sip, status: v ? 'ENABLED' : 'DISABLED' } })} disabled={!canEdit} />
          </Row>
          {sip.status === 'ENABLED' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input className="form-input" style={{ flex: 1 }} placeholder="sip.yourcompany.com" value={sip.servers?.[0]?.hostname || ''} disabled={!canEdit}
                onChange={(e) => set({ sip: { ...sip, servers: [{ ...(sip.servers?.[0] || {}), hostname: e.target.value }] } })} />
              <input className="form-input" style={{ width: 100 }} type="number" placeholder="5061" value={sip.servers?.[0]?.port || ''} disabled={!canEdit}
                onChange={(e) => set({ sip: { ...sip, servers: [{ ...(sip.servers?.[0] || {}), port: Number(e.target.value) }] } })} />
            </div>
          )}
        </div>
      </details>

      {canEdit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save call settings
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Call buttons & links ────────────────────────────────────────────────────
function Links({ account }) {
  const [payload, setPayload] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');

  const make = async () => {
    setError('');
    try {
      const res = await whatsappCallAPI.getCallLink(account.id, payload.trim());
      setLink(res.data.link);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not build the link');
    }
  };
  useEffect(() => {
    make();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); notify.success('Link copied'); } catch { notify.error('Copy failed'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={box}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', gap: 6, alignItems: 'center' }}><Link2 size={15} /> Call link</div>
        <p style={hint}>Put it on your website, emails, ads or a QR code — tapping it starts a WhatsApp call to this number. The tag shows in the Call Log so you know where the call came from.</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input className="form-input" style={{ flex: '1 1 220px' }} placeholder="Tag (optional), e.g. website-contact-page" value={payload} maxLength={512} onChange={(e) => setPayload(e.target.value)} />
          <button type="button" className="btn btn-secondary" onClick={make}>Update link</button>
        </div>
        {error && <p style={{ ...hint, color: '#dc2626' }}>{error}</p>}
        {link && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <code style={{ flex: 1, fontSize: '0.8rem', padding: '8px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, overflowX: 'auto', whiteSpace: 'nowrap' }}>{link}</code>
            <button type="button" className="btn btn-secondary" onClick={copy}><Copy size={14} /></button>
          </div>
        )}
      </div>
      <div style={box}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', display: 'flex', gap: 6, alignItems: 'center' }}><Phone size={15} /> Call button in a chat</div>
        <p style={hint}>
          Send a "Call on WhatsApp" button to one customer from the Inbox: open their chat → Send Menu → <strong>Call button</strong>.
          The button can expire (1 minute to 30 days). For many customers at once, create a Message Template with a
          "Call on WhatsApp" button in Message Templates and send it as a broadcast.
        </p>
      </div>
    </div>
  );
}

export default function WhatsAppCallingTab({ account, canEdit = true }) {
  const [section, setSection] = useUrlState('ctab', 'overview', { allowed: SECTIONS.map(([id]) => id) });
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(() => {
    if (!account?.id) return;
    setLoading(true);
    whatsappCallAPI.getSettings(account.id)
      .then((res) => setSettings(res.data))
      .catch((err) => setSettings({ metaError: err.response?.data?.message || 'Could not load the call settings' }))
      .finally(() => setLoading(false));
  }, [account?.id]);
  useEffect(() => { loadSettings(); }, [loadSettings]);

  if (!account || (account.platform || '').toUpperCase() !== 'WHATSAPP') {
    return <div className="empty-state"><div className="empty-title">Pick a WhatsApp number</div><div className="empty-desc">WhatsApp Calling works on WhatsApp numbers only.</div></div>;
  }

  return (
    <div className="bm-content-card">
      <div className="bm-card-header">
        <h3 className="bm-card-title">WhatsApp Calling</h3>
        <p className="bm-card-sub">Voice calls with customers on {account.name || 'this number'}{settings?.phoneNumber ? ` (${settings.phoneNumber})` : ''} — incoming calls ring in this dashboard.</p>
      </div>
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', marginBottom: 16, flexWrap: 'wrap' }}>
        {SECTIONS.map(([id, text]) => (
          <button key={id} type="button" onClick={() => setSection(id)}
            style={{ padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600,
              color: section === id ? 'var(--primary)' : 'var(--text-secondary)', borderBottom: section === id ? '2px solid var(--primary)' : '2px solid transparent', marginBottom: -1 }}>
            {text}
          </button>
        ))}
      </div>
      {loading && section !== 'log' ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" size={22} /></div>
      ) : (
        <>
          {section === 'overview' && <Overview account={account} settings={settings} onGo={setSection} />}
          {section === 'log' && <CallLog account={account} />}
          {section === 'settings' && <Settings key={account.id} account={account} settings={settings} onSaved={loadSettings} canEdit={canEdit} />}
          {section === 'links' && <Links account={account} />}
        </>
      )}
    </div>
  );
}
