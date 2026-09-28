import { useEffect, useState } from 'react';
import { FlaskConical, Clock } from 'lucide-react';
import { flowAPI } from '../../services/api';

/**
 * Broadcast element → "A/B test" (normal-message campaigns: variant B = another
 * flow of the same bot account) and "When to send" (now, or each subscriber's
 * usual hour — chatbot_api utils/broadcastRunner.js bestHoursFor).
 * Template campaigns keep their A/B test on the Broadcasting page.
 */
const WINDOWED = new Set(['WHATSAPP', 'FACEBOOK', 'INSTAGRAM']);

export default function BroadcastExtras({ bc, platform }) {
  const { campaign, editable, mode, updateSettings } = bc;
  const [flows, setFlows] = useState([]);
  const [split, setSplit] = useState(campaign?.ab_split_percent ?? 50);
  const abOn = Boolean(campaign?.variant_b_flow_id);
  const bestHourAllowed = !(mode === 'WINDOW' && WINDOWED.has(String(platform || '').toUpperCase()));

  useEffect(() => {
    if (mode !== 'WINDOW' || !campaign?.integration_id) return;
    flowAPI.getAll({ integrationId: campaign.integration_id })
      .then((res) => setFlows((res.data?.flows || res.data || []).filter((f) => f.id !== campaign.flow_id)))
      .catch(() => setFlows([]));
  }, [mode, campaign?.integration_id, campaign?.flow_id]);

  useEffect(() => { setSplit(campaign?.ab_split_percent ?? 50); }, [campaign?.ab_split_percent]);

  if (!campaign) return null;
  const box = { padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 };
  const hint = { fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.45 };

  return (
    <>
      {mode === 'WINDOW' && (
        <div style={box}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 700 }}>
            <FlaskConical size={14} /> A/B test
          </label>
          <span style={hint}>Send another flow's opening messages to part of the audience and compare which one gets more replies.</span>
          <select
            value={campaign.variant_b_flow_id || ''}
            disabled={!editable}
            onChange={(e) => updateSettings({ variantBFlowId: e.target.value ? Number(e.target.value) : null, abSplitPercent: split })}
          >
            <option value="">No A/B test</option>
            {flows.map((f) => <option key={f.id} value={f.id}>Variant B: {f.name}</option>)}
          </select>
          {abOn && (
            <>
              <label style={{ fontSize: '0.76rem' }}>Split: {split}% this flow (A) / {100 - split}% variant B</label>
              <input type="range" min={10} max={90} step={5} value={split} disabled={!editable}
                onChange={(e) => setSplit(Number(e.target.value))}
                onMouseUp={() => updateSettings({ abSplitPercent: split })}
                onTouchEnd={() => updateSettings({ abSplitPercent: split })} />
              <span style={hint}>Results (sent, read and replied per variant) show on the campaign in Broadcasting.</span>
            </>
          )}
        </div>
      )}

      <div style={box}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', fontWeight: 700 }}>
          <Clock size={14} /> When each subscriber gets it
        </label>
        <select
          value={bestHourAllowed ? (campaign.send_time_mode || 'NOW') : 'NOW'}
          disabled={!editable || !bestHourAllowed}
          onChange={(e) => updateSettings({ sendTimeMode: e.target.value })}
        >
          <option value="NOW">All at once (when you send or at the scheduled time)</option>
          <option value="BEST_HOUR">At each subscriber's usual hour (over 24 hours)</option>
        </select>
        <span style={hint}>
          {bestHourAllowed
            ? "Usual hour = the hour of day they wrote to this bot most in the last 90 days. People with no history get it straight away; anyone left after 23 hours gets it then."
            : 'Not available for "Inside 24 hours" on this channel — waiting could push people outside their 24-hour window. Use a template (Anytime) for it.'}
        </span>
      </div>
    </>
  );
}
