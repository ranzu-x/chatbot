import { useState, useEffect, useCallback } from 'react';
import { businessHoursAPI, flowAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import { Clock, Globe2 } from 'lucide-react';

// A curated subset for the picker — the backend itself accepts any valid IANA
// zone (see utils/businessHours.js's isValidTimezone), this list is just the UX.
const TIMEZONES = [
  'UTC',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo', 'America/Mexico_City', 'America/Toronto',
  'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Madrid', 'Europe/Paris',
  'Europe/Berlin', 'Europe/Rome', 'Europe/Amsterdam', 'Europe/Athens', 'Europe/Moscow',
  'Africa/Cairo', 'Africa/Lagos', 'Africa/Johannesburg', 'Africa/Nairobi',
  'Asia/Istanbul', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka',
  'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Shanghai',
  'Asia/Manila', 'Asia/Tokyo', 'Asia/Seoul',
  'Australia/Sydney', 'Australia/Perth', 'Pacific/Auckland',
];

function Toggle({ on, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 40, height: 23, borderRadius: 999, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        background: on ? 'var(--primary)' : '#cbd5e1', position: 'relative', padding: 0, flexShrink: 0,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{ position: 'absolute', top: 2.5, left: on ? 19 : 2.5, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.25)', transition: 'left 0.15s' }} />
    </button>
  );
}

/**
 * Bot Manager → Bot Settings → Business Hours — per-bot (per-integration)
 * weekly schedule that gates automated replies outside opening hours.
 * See chatbot_api/utils/businessHours.js for the gate this feeds.
 */
export default function BusinessHoursSettings({ integrationId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(null);
  const [days, setDays] = useState([]);
  const [flows, setFlows] = useState([]);

  const load = useCallback(() => {
    if (!integrationId) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      businessHoursAPI.getForIntegration(integrationId),
      flowAPI.getAll({ integrationId }),
    ])
      .then(([bhRes, flowsRes]) => {
        setSettings(bhRes.data?.settings || null);
        setDays(bhRes.data?.days || []);
        setFlows(flowsRes.data?.flows || []);
      })
      .catch(() => notify.error('Failed to load business hours'))
      .finally(() => setLoading(false));
  }, [integrationId]);

  useEffect(() => { load(); }, [load]);

  const patchSettings = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const patchDay = (dayOfWeek, patch) => setDays((ds) => ds.map((d) => (d.dayOfWeek === dayOfWeek ? { ...d, ...patch } : d)));
  // "Same every day": editing the shared time applies it to every day at once — only
  // the individual open/close, never a day's own "Closed" flag.
  const patchAllDayTimes = (patch) => setDays((ds) => ds.map((d) => ({ ...d, ...patch })));

  const save = async () => {
    setSaving(true);
    try {
      await businessHoursAPI.save(integrationId, {
        enabled: !!settings?.enabled,
        timezone: settings?.timezone || 'UTC',
        sameEveryDay: !!settings?.sameEveryDay,
        botRepliesOffHours: !!settings?.botRepliesOffHours,
        aiRepliesOffHours: !!settings?.aiRepliesOffHours,
        offHoursFlowId: settings?.offHoursFlowId || null,
        days: days.map((d) => ({ dayOfWeek: d.dayOfWeek, isOff: !!d.isOff, openTime: d.openTime, closeTime: d.closeTime })),
      });
      notify.success('Business hours saved');
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Failed to save business hours');
    } finally {
      setSaving(false);
    }
  };

  if (!integrationId) {
    return (
      <div style={{ textAlign: 'center', padding: '36px 16px', color: '#5c5c80' }}>
        <Clock size={26} color="#c4b5fd" style={{ marginBottom: 8 }} />
        <p style={{ fontSize: '0.84rem', maxWidth: 340, margin: '0 auto' }}>Select a specific bot account from the list first to configure its business hours.</p>
      </div>
    );
  }
  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Loading...</div>;

  const enabled = !!settings?.enabled;
  const sameEveryDay = !!settings?.sameEveryDay;
  const sharedDay = days.find((d) => !d.isOff) || days[0] || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Master switch */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 2px' }}>
        <Toggle on={enabled} onClick={() => patchSettings({ enabled: !enabled })} disabled={saving} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 800 }}>Business Hours are {enabled ? 'ON' : 'OFF'} for this bot</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {enabled ? 'Automated replies follow the schedule below.' : 'Off — this bot replies the same way at every hour, exactly as before.'}
          </div>
        </div>
      </div>

      {enabled && (
        <>
          {/* Timezone */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Globe2 size={12} /> Timezone</label>
            <select className="form-input" value={settings?.timezone || 'UTC'} onChange={(e) => patchSettings({ timezone: e.target.value })} disabled={saving}>
              {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          {/* Same-every-day toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Toggle
              on={sameEveryDay}
              disabled={saving}
              onClick={() => {
                const next = !sameEveryDay;
                patchSettings({ sameEveryDay: next });
                if (next) patchAllDayTimes({ openTime: sharedDay.openTime || '09:00', closeTime: sharedDay.closeTime || '17:00' });
              }}
            />
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Use the same hours every day</span>
          </div>

          {/* Schedule */}
          <div className="card" style={{ padding: 14 }}>
            {sameEveryDay ? (
              <>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Open</label>
                    <input type="time" className="form-input" style={{ width: 130 }} value={sharedDay.openTime || '09:00'} disabled={saving}
                      onChange={(e) => patchAllDayTimes({ openTime: e.target.value })} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Close</label>
                    <input type="time" className="form-input" style={{ width: 130 }} value={sharedDay.closeTime || '17:00'} disabled={saving}
                      onChange={(e) => patchAllDayTimes({ closeTime: e.target.value })} />
                  </div>
                </div>
                <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>Closed all day on</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {days.map((d) => (
                    <button
                      key={d.dayOfWeek}
                      type="button"
                      disabled={saving}
                      onClick={() => patchDay(d.dayOfWeek, { isOff: !d.isOff })}
                      style={{
                        padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        border: `1.5px solid ${d.isOff ? '#ef4444' : 'var(--border)'}`,
                        background: d.isOff ? '#fef2f2' : '#fff', color: d.isOff ? '#dc2626' : 'var(--text-primary)',
                      }}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {days.map((d) => (
                  <div key={d.dayOfWeek} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
                    <span style={{ width: 40, fontSize: 12.5, fontWeight: 700 }}>{d.label}</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!d.isOff} disabled={saving} onChange={(e) => patchDay(d.dayOfWeek, { isOff: e.target.checked })} />
                      Closed
                    </label>
                    <input type="time" className="form-input" style={{ width: 120 }} value={d.openTime || '09:00'} disabled={saving || d.isOff}
                      onChange={(e) => patchDay(d.dayOfWeek, { openTime: e.target.value })} />
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>to</span>
                    <input type="time" className="form-input" style={{ width: 120 }} value={d.closeTime || '17:00'} disabled={saving || d.isOff}
                      onChange={(e) => patchDay(d.dayOfWeek, { closeTime: e.target.value })} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Off-hours behavior */}
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 12 }}>Outside business hours</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Toggle on={!!settings?.aiRepliesOffHours} disabled={saving} onClick={() => patchSettings({ aiRepliesOffHours: !settings?.aiRepliesOffHours })} />
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>Allow AI Replies</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <Toggle on={!!settings?.botRepliesOffHours} disabled={saving} onClick={() => patchSettings({ botRepliesOffHours: !settings?.botRepliesOffHours })} />
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>Allow Bot/Flow Replies</span>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Off-Hours Automation (optional)</label>
              <select
                className="form-input"
                value={settings?.offHoursFlowId || ''}
                disabled={saving}
                onChange={(e) => patchSettings({ offHoursFlowId: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">None</option>
                {flows.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}{f.is_active === 0 ? ' (inactive)' : ''}</option>
                ))}
              </select>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginTop: 4, lineHeight: 1.45 }}>
                Runs automatically for a new conversation that starts outside business hours — build it as a normal flow (e.g. a "We're closed" message) in the Flow Builder, then pick it here.
                It never interrupts a conversation already in progress, and always runs even if "Allow Bot/Flow Replies" above is off.
              </span>
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? 'Saving...' : 'Save Business Hours'}
        </button>
      </div>
    </div>
  );
}
