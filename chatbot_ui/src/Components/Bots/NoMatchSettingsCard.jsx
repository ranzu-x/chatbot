import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { MessageCircleQuestion, Loader2, ExternalLink } from 'lucide-react';
import { quickActionAPI } from '../../services/api';
import { notify } from '../../utils/alerts';

// Mirrors TRIGGER_FREQUENCIES in chatbot_api/utils/quickActions.js.
const FREQUENCIES = [
  { value: 'EVERY_TIME', label: 'Every time', hint: 'Every message nothing else answers gets the reply.' },
  { value: 'DAILY', label: 'Once a day', hint: 'At most once per subscriber in 24 hours.' },
  { value: 'WEEKLY', label: 'Once a week', hint: 'At most once per subscriber in 7 days.' },
  { value: 'MONTHLY', label: 'Once a month', hint: 'At most once per subscriber in a month.' },
];

/**
 * Bot Settings → No match reply: on/off + how often the SAME subscriber may
 * get it. On/off is the No match Quick Action's "reply on" (one switch, also
 * shown in Bot Manager → Quick Actions); the frequency is tracked per
 * subscriber on the server. Saves as soon as it changes.
 */
export default function NoMatchSettingsCard({ integrationId }) {
  const navigate = useNavigate();
  const [action, setAction] = useState(null); // the NO_MATCH quick action, or false when the channel has none
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!integrationId) return undefined;
    let alive = true;
    setAction(null);
    quickActionAPI.list(integrationId)
      .then((res) => { if (alive) setAction((res.data.actions || []).find((a) => a.action === 'NO_MATCH') || false); })
      .catch(() => { if (alive) setAction(false); });
    return () => { alive = false; };
  }, [integrationId]);

  const save = async (key, data, message) => {
    setBusy(key);
    try {
      const res = await quickActionAPI.update(integrationId, 'NO_MATCH', data);
      setAction(res.data.action);
      notify.success(message);
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Could not save the No match setting');
    } finally {
      setBusy('');
    }
  };

  if (action === false) return null; // channel without a No match reply (TikTok)

  const enabled = Boolean(action?.replyEnabled);
  const frequency = action?.frequency || 'EVERY_TIME';
  const hint = FREQUENCIES.find((f) => f.value === frequency)?.hint;

  return (
    <div
      data-testid="no-match-settings"
      style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 20px', marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <MessageCircleQuestion size={17} />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>No match reply</div>
          <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '2px 0 0', lineHeight: 1.45 }}>
            Sent when a message isn&apos;t answered by any flow, keyword reply or AI agent. Normal bot, AI and flow replies are never affected.
          </p>
        </div>
        {!action ? (
          <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite', color: '#94a3b8' }} />
        ) : (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', fontWeight: 700, color: enabled ? '#2563eb' : '#64748b', cursor: busy ? 'default' : 'pointer' }}>
            {enabled ? 'On' : 'Off'}
            <input
              type="checkbox"
              role="switch"
              aria-label="No match reply"
              checked={enabled}
              disabled={Boolean(busy)}
              onChange={(e) => save('enabled', { replyEnabled: e.target.checked }, e.target.checked ? 'No match reply switched on' : 'No match reply switched off')}
              style={{ width: 16, height: 16, cursor: 'inherit' }}
            />
          </label>
        )}
      </div>

      {action && enabled && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <label htmlFor="no-match-frequency" style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
            Send to the same subscriber
          </label>
          <select
            id="no-match-frequency"
            value={frequency}
            disabled={Boolean(busy)}
            onChange={(e) => save('frequency', { frequency: e.target.value }, 'No match frequency saved')}
            className="form-input"
            style={{ height: 34, fontSize: '0.82rem', width: 170 }}
          >
            {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          {busy === 'frequency' && <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite', color: '#94a3b8' }} />}
          <span style={{ fontSize: '0.76rem', color: '#64748b' }}>{hint}</span>
        </div>
      )}

      {action?.flowId && (
        <button
          type="button"
          onClick={() => navigate(`/flows/${action.flowId}`)}
          style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, color: '#2563eb', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          Edit the reply message in the Flow Builder <ExternalLink size={12} />
        </button>
      )}
    </div>
  );
}
