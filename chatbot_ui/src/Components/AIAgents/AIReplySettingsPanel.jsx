import { useState, useEffect, useCallback } from 'react';
import { aiReplySettingsAPI, aiAgentAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import { Sparkles, Star } from 'lucide-react';

// Automatic Resume After Human Takeover — utils/botResumeScheduler.js polls
// conversations.auto_resume_at (computed from this at join-time in
// POST /conversations/:id/join). null = "Never".
const AUTO_RESUME_PRESETS = [
  { label: 'Never', value: '' },
  { label: '5 minutes', value: 5 },
  { label: '10 minutes', value: 10 },
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '4 hours', value: 240 },
  { label: '12 hours', value: 720 },
  { label: '24 hours', value: 1440 },
];

const AVATAR_COLORS = ['#2563eb', '#0891b2', '#7c3aed', '#c2410c', '#be185d', '#16a34a'];
function colorFor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function AutoResumeSelect({ value, disabled, onChange }) {
  const isPreset = value === null || value === undefined || AUTO_RESUME_PRESETS.some((p) => p.value === value);
  const [customMode, setCustomMode] = useState(!isPreset);
  const [customValue, setCustomValue] = useState(isPreset ? '' : String(value));

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <select
        className="form-input"
        style={{ maxWidth: 220 }}
        disabled={disabled}
        value={customMode ? '__custom__' : (value ?? '')}
        onChange={(e) => {
          if (e.target.value === '__custom__') { setCustomMode(true); return; }
          setCustomMode(false);
          onChange(e.target.value === '' ? null : Number(e.target.value));
        }}
      >
        {AUTO_RESUME_PRESETS.map((p) => <option key={p.label} value={p.value}>{p.label}</option>)}
        <option value="__custom__">Custom…</option>
      </select>
      {customMode && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="number"
            min={1}
            className="form-input"
            style={{ width: 90 }}
            placeholder="minutes"
            value={customValue}
            disabled={disabled}
            onChange={(e) => setCustomValue(e.target.value)}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={disabled || !customValue || Number(customValue) <= 0}
            onClick={() => onChange(Number(customValue))}
          >
            Save
          </button>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>minutes</span>
        </div>
      )}
    </div>
  );
}

/**
 * Bot Manager → AI → "AI Reply Settings" / "Active Agents" — scoped to
 * whichever bot/integration is currently selected in Bot Manager's own
 * account list. `view` picks which half renders.
 */
export default function AIReplySettingsPanel({ integrationId, view }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agents, setAgents] = useState([]);
  const [settings, setSettings] = useState(null);
  const [activeAgentIds, setActiveAgentIds] = useState([]);

  const load = useCallback(() => {
    if (!integrationId || integrationId === 'all') { setLoading(false); return; }
    setLoading(true);
    Promise.all([aiReplySettingsAPI.getForIntegration(integrationId), aiAgentAPI.getAll()])
      .then(([settingsRes, agentsRes]) => {
        setSettings(settingsRes.data?.settings || null);
        setActiveAgentIds(settingsRes.data?.activeAgentIds || []);
        setAgents(agentsRes.data?.agents || []);
      })
      .catch(() => notify.error('Failed to load AI Reply settings'))
      .finally(() => setLoading(false));
  }, [integrationId]);

  useEffect(() => { load(); }, [load]);

  const saveSettings = async (patch) => {
    setSaving(true);
    try {
      const merged = { ...settings, ...patch };
      await aiReplySettingsAPI.save(integrationId, {
        enabled: merged.enabled,
        triggerMode: merged.trigger_mode,
        defaultAgentId: merged.default_agent_id,
        confidenceThreshold: merged.confidence_threshold,
        autoResumeMinutes: merged.auto_resume_minutes,
      });
      setSettings(merged);
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const toggleAgent = async (agentId, activate) => {
    try {
      if (activate) {
        await aiReplySettingsAPI.activateAgent(integrationId, agentId);
        setActiveAgentIds((prev) => [...prev, agentId]);
      } else {
        await aiReplySettingsAPI.deactivateAgent(integrationId, agentId);
        setActiveAgentIds((prev) => prev.filter((id) => id !== agentId));
      }
    } catch {
      notify.error('Failed to update');
    }
  };

  if (!integrationId || integrationId === 'all') {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px', color: '#5c5c80' }}>
        <Sparkles size={28} color="#c4b5fd" style={{ marginBottom: 10 }} />
        <p style={{ fontSize: '0.86rem', maxWidth: 380, margin: '0 auto' }}>Select a specific bot from the list on the left to configure its AI Replies.</p>
      </div>
    );
  }
  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Loading...</div>;

  if (view === 'settings') {
    const enabled = !!settings?.enabled;
    const triggerMode = settings?.trigger_mode || 'FALLBACK';
    return (
      <div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              type="button"
              onClick={() => saveSettings({ enabled: enabled ? 0 : 1 })}
              disabled={saving}
              style={{ width: 46, height: 26, borderRadius: 999, border: 'none', cursor: 'pointer', background: enabled ? 'var(--primary)' : '#cbd5e1', position: 'relative', padding: 0, flexShrink: 0 }}
            >
              <span style={{ position: 'absolute', top: 3, left: enabled ? 23 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.25)', transition: 'left .15s' }} />
            </button>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>AI Replies are {enabled ? 'ON' : 'OFF'} for this bot</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{activeAgentIds.length} of {agents.length} Agent(s) active here</div>
            </div>
          </div>
        </div>

        <div className="grid-2" style={{ marginBottom: 16 }}>
          <div className="card">
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 12 }}>Trigger mode</div>
            {[
              { id: 'ALWAYS', title: 'Always trigger', desc: 'AI evaluates and can reply to every incoming message, using Agent Routing.' },
              { id: 'FALLBACK', title: 'Only when nothing else matches', desc: 'Bot Flows and Keyword Replies get first chance to respond. AI only steps in when neither matches.' },
            ].map((opt) => (
              <div
                key={opt.id}
                onClick={() => saveSettings({ trigger_mode: opt.id })}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 12px', borderRadius: 10, border: `1.5px solid ${triggerMode === opt.id ? 'var(--primary)' : 'var(--border)'}`, background: triggerMode === opt.id ? 'rgba(37,99,235,0.05)' : 'transparent', marginBottom: 8, cursor: 'pointer' }}
              >
                <div style={{ width: 15, height: 15, borderRadius: '50%', border: `2px solid ${triggerMode === opt.id ? 'var(--primary)' : 'var(--border)'}`, marginTop: 1, flexShrink: 0, position: 'relative' }}>
                  {triggerMode === opt.id && <span style={{ position: 'absolute', inset: 2.5, borderRadius: '50%', background: 'var(--primary)' }} />}
                </div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{opt.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>{opt.desc}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 12 }}>Default Agent &amp; confidence</div>
            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Default Agent (used when routing is unsure)</label>
              <select className="form-input" value={settings?.default_agent_id || ''} onChange={(e) => saveSettings({ default_agent_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">None</option>
                {agents.filter((a) => activeAgentIds.includes(a.id)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Routing confidence threshold ({Math.round((settings?.confidence_threshold ?? 0.68) * 100)}%)</label>
              <input
                type="range" min={0} max={1} step={0.01}
                value={settings?.confidence_threshold ?? 0.68}
                onChange={(e) => setSettings((s) => ({ ...s, confidence_threshold: Number(e.target.value) }))}
                onMouseUp={(e) => saveSettings({ confidence_threshold: Number(e.target.value) })}
                onTouchEnd={(e) => saveSettings({ confidence_threshold: Number(e.target.value) })}
                style={{ width: '100%' }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Below this confidence, a message goes to the Default Agent instead of guessing.</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 12 }}>Automatic resume after human takeover</div>
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
            When an agent uses "Join Chat" in the Live Inbox, Bot/AI pauses for that conversation. This decides whether — and when — it resumes automatically if no one manually resumes it first.
          </p>
          <AutoResumeSelect
            value={settings?.auto_resume_minutes ?? null}
            disabled={saving}
            onChange={(minutes) => saveSettings({ auto_resume_minutes: minutes })}
          />
        </div>
      </div>
    );
  }

  // view === 'activeAgents'
  return (
    <div>
      {agents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#5c5c80', fontSize: '0.85rem' }}>
          No Agents created yet — build one under the "Agents" tab first.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {agents.map((a) => {
            const active = activeAgentIds.includes(a.id);
            return (
              <div key={a.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: colorFor(a.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 12 }}>
                    {initials(a.name)}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleAgent(a.id, !active)}
                    style={{ width: 32, height: 19, borderRadius: 999, border: 'none', cursor: 'pointer', background: active ? 'var(--primary)' : '#cbd5e1', position: 'relative', padding: 0, flexShrink: 0 }}
                  >
                    <span style={{ position: 'absolute', top: 2, left: active ? 15 : 2, width: 15, height: 15, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.2)', transition: 'left .15s' }} />
                  </button>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{a.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, minHeight: 30, overflow: 'hidden' }}>{a.description || 'No description'}</div>
                {a.is_default && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 800, color: 'var(--warning)', width: 'fit-content' }}>
                    <Star size={9} /> Agency Default
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
