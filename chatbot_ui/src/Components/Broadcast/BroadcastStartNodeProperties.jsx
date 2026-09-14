import { useState, useEffect, useCallback } from 'react';
import { broadcastAPI } from '../../services/api';
import AudienceForm from './AudienceForm';
import { Megaphone, Send, Loader2, CircleCheck, CircleX, Clock } from 'lucide-react';

/** Grayscale delivery bar + legend — the same read as the Broadcasting page. */
function MetricBars({ campaign }) {
  const sent = campaign.sent_count || 0;
  const delivered = campaign.delivered_count || 0;
  const read = campaign.read_count || 0;
  const failed = campaign.failed_count || 0;
  const targeted = campaign.total_targeted || 0;
  const denom = Math.max(targeted, sent + failed, 1);
  const pct = (v) => `${Math.min(100, (v / denom) * 100)}%`;
  const inFlight = Math.max(sent - delivered, 0);

  return (
    <div>
      <div style={{ height: 6, borderRadius: 99, background: 'var(--bg-hover)', overflow: 'hidden', display: 'flex' }}>
        <div style={{ width: pct(delivered), background: 'var(--success)' }} />
        <div style={{ width: pct(inFlight), background: 'var(--primary)' }} />
        <div style={{ width: pct(failed), background: 'var(--danger)' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 14px', marginTop: 11 }}>
        {[['Sent', sent, 'var(--primary)'], ['Delivered', delivered, 'var(--success)'], ['Read', read, '#8b5cf6'], ['Failed', failed, 'var(--danger)']].map(([label, value, color]) => (
          <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.76rem' }}>
            <span style={{ width: 7, height: 7, borderRadius: 99, background: color, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
            <strong style={{ fontWeight: 800, marginLeft: 'auto' }}>{value.toLocaleString()}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Replaces the regular Start node's keyword-trigger panel for a
 * BROADCAST-typed flow (Flow Builder opened from the Broadcasting page's
 * "Create" button). A broadcast flow is never keyword-triggered — its Start
 * node instead holds the whole campaign: who it goes to (Include/Exclude
 * labels + subscribers), what label to tag them with on send, WhatsApp's
 * Inside-24h-vs-Anytime choice, and Send Now / Schedule. This is the SAME
 * campaign record routes/broadcasts.js's start-with-flow created — found via
 * GET /broadcasts/by-flow/:flowId, so it works regardless of how this editor
 * session was opened.
 */
export default function BroadcastStartNodeProperties({ flowId, flowName, onFlowNameChange, platform }) {
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [labels, setLabels] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [integrationId, setIntegrationId] = useState('');
  const [audienceForm, setAudienceForm] = useState({ includeLabelIds: [], excludeLabelIds: [], includeContacts: [], excludeContacts: [], tagLabelId: null });
  const [previewCount, setPreviewCount] = useState(null);
  const [waMode, setWaMode] = useState('WINDOW');
  const [templateId, setTemplateId] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);

  const load = useCallback(async () => {
    if (!flowId) return;
    setLoading(true);
    try {
      const [campRes, formRes] = await Promise.allSettled([
        broadcastAPI.getByFlow(flowId),
        broadcastAPI.getFormData(platform),
      ]);
      if (campRes.status === 'fulfilled') {
        const c = campRes.value.data.campaign;
        setCampaign(c);
        const parseIds = (v) => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]'); } catch { return []; } };
        setAudienceForm({
          includeLabelIds: parseIds(c.include_label_ids),
          excludeLabelIds: parseIds(c.exclude_label_ids),
          includeContacts: [],
          excludeContacts: [],
          tagLabelId: c.tag_label_id,
        });
        setWaMode(c.mode === 'TEMPLATE' ? 'TEMPLATE' : 'WINDOW');
        setTemplateId(c.template_id || '');
        setIntegrationId(c.integration_id ? String(c.integration_id) : '');
      }
      if (formRes.status === 'fulfilled') {
        setLabels(formRes.value.data.labels || []);
        setTemplates(formRes.value.data.templates || []);
        const integs = formRes.value.data.integrations || [];
        setIntegrations(integs);
        if (campRes.status === 'fulfilled' && !campRes.value.data.campaign.integration_id && integs.length === 1) {
          setIntegrationId(String(integs[0].id));
        }
      }
    } finally {
      setLoading(false);
    }
  }, [flowId, platform]);

  useEffect(() => { load(); }, [load]);

  // Live audience preview
  useEffect(() => {
    if (!campaign) return;
    setPreviewCount(null);
    const t = setTimeout(async () => {
      try {
        const res = await broadcastAPI.audiencePreview({
          platform,
          includeLabelIds: audienceForm.includeLabelIds,
          excludeLabelIds: audienceForm.excludeLabelIds,
          includeContactIds: audienceForm.includeContacts.map((c) => c.id),
          excludeContactIds: audienceForm.excludeContacts.map((c) => c.id),
        });
        setPreviewCount(res.data.count);
      } catch { setPreviewCount(null); }
    }, 350);
    return () => clearTimeout(t);
  }, [campaign, audienceForm, platform]);

  const persist = async () => {
    if (!campaign) return;
    setSaving(true);
    try {
      await broadcastAPI.update(campaign.id, {
        name: flowName,
        integrationId: integrationId || undefined,
        includeLabelIds: audienceForm.includeLabelIds,
        excludeLabelIds: audienceForm.excludeLabelIds,
        includeContactIds: audienceForm.includeContacts.map((c) => c.id),
        excludeContactIds: audienceForm.excludeContacts.map((c) => c.id),
        tagLabelId: audienceForm.tagLabelId,
        templateId: platform === 'WHATSAPP' && waMode === 'TEMPLATE' ? templateId : undefined,
      });
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  const handleSendNow = async () => {
    await persist();
    await broadcastAPI.sendNow(campaign.id);
    load();
  };

  const handleSchedule = async () => {
    if (!scheduleAt) return;
    await persist();
    await broadcastAPI.schedule(campaign.id, new Date(scheduleAt).toISOString());
    load();
  };

  const handleCancelSchedule = async () => {
    await broadcastAPI.cancelSchedule(campaign.id);
    load();
  };

  if (loading) {
    return (
      <div className="fb-field" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted, #64748b)' }}>
        <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Loading campaign…
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="fb-field">
        <span className="fb-hint">No campaign is linked to this flow — reopen it from the Broadcasting page.</span>
      </div>
    );
  }

  const canSend = !loading && !saving && previewCount && !!integrationId && ['DRAFT', 'SCHEDULED', 'FAILED'].includes(campaign.status);
  const isFinal = ['PROCESSING', 'COMPLETED'].includes(campaign.status);
  const integrationLabel = (i) => i.wa_display_phone || i.fb_page_name || i.name || `Account #${i.id}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="fb-field">
        <label>Campaign Name</label>
        <input value={flowName || ''} onChange={(e) => onFlowNameChange?.(e.target.value)} placeholder="e.g. Weekend Sale Announcement" />
      </div>

      <div className="fb-field">
        <label>Send From</label>
        {isFinal ? (
          <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>
            {integrations.find((i) => String(i.id) === String(integrationId))
              ? integrationLabel(integrations.find((i) => String(i.id) === String(integrationId)))
              : 'Account no longer connected'}
          </span>
        ) : integrations.length === 0 ? (
          <span className="fb-hint" style={{ color: 'var(--danger)', fontWeight: 600 }}>No active {platform} account connected — connect one on the Channels page first.</span>
        ) : (
          <>
            <select className="form-input w-full" value={integrationId} onChange={(e) => setIntegrationId(e.target.value)}>
              <option value="">— Select an account —</option>
              {integrations.map((i) => <option key={i.id} value={i.id}>{integrationLabel(i)}</option>)}
            </select>
            {!integrationId && <span className="fb-hint" style={{ color: 'var(--danger)', fontWeight: 600 }}>Required — pick which connected account this campaign sends from.</span>}
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999,
            fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)',
            background: 'var(--primary-soft)', border: '1px solid var(--primary-ring)',
          }}
        >
          {campaign.status}
        </span>
        {campaign.scheduled_at && campaign.status === 'SCHEDULED' && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Clock size={12} /> {new Date(campaign.scheduled_at).toLocaleString()}
          </span>
        )}
      </div>

      {campaign.error_message && (
        <div style={{ padding: '8px 10px', background: 'rgba(239,68,68,.07)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 8, fontSize: '0.76rem', color: 'var(--danger)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <CircleX size={13} style={{ marginTop: 1, flexShrink: 0 }} /> {campaign.error_message}
        </div>
      )}

      {isFinal ? (
        <MetricBars campaign={campaign} />
      ) : (
        <>
          {platform === 'WHATSAPP' && (
            <div className="fb-field">
              <label>Sending Mode</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setWaMode('WINDOW')}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', background: waMode === 'WINDOW' ? 'var(--primary)' : 'transparent', color: waMode === 'WINDOW' ? '#fff' : 'var(--text-secondary)' }}
                >
                  Inside 24 Hours
                </button>
                <button
                  type="button"
                  onClick={() => setWaMode('TEMPLATE')}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', border: '1px solid var(--border)', background: waMode === 'TEMPLATE' ? 'var(--primary)' : 'transparent', color: waMode === 'TEMPLATE' ? '#fff' : 'var(--text-secondary)' }}
                >
                  Anytime (Template)
                </button>
              </div>
              {waMode === 'TEMPLATE' && (
                <>
                  <span className="fb-hint">Anytime mode sends an approved Template instead of this flow's message nodes — Meta requires a pre-approved Template outside the 24-hour window.</span>
                  <select className="form-input w-full" value={templateId} onChange={(e) => setTemplateId(e.target.value)} style={{ marginTop: 8 }}>
                    <option value="">— Select an approved template —</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.template_name} ({t.language})</option>)}
                  </select>
                </>
              )}
            </div>
          )}

          <AudienceForm platform={platform} labels={labels} value={audienceForm} onChange={setAudienceForm} previewCount={previewCount} />

          <div className="fb-field">
            <label>When to send</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={handleSendNow}
                disabled={!canSend}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 14px',
                  borderRadius: 8, border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: canSend ? 'pointer' : 'not-allowed',
                  background: canSend ? 'var(--primary)' : 'var(--border-light)', color: '#fff',
                }}
              >
                <Send size={14} /> Send Now
              </button>
              <div style={{ display: 'flex', gap: 6 }}>
                <input type="datetime-local" className="form-input" style={{ flex: 1 }} value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
                <button
                  type="button"
                  onClick={handleSchedule}
                  disabled={!canSend || !scheduleAt}
                  className="btn btn-secondary btn-sm"
                >
                  Schedule
                </button>
              </div>
              {campaign.status === 'SCHEDULED' && (
                <button type="button" onClick={handleCancelSchedule} className="btn btn-secondary btn-sm">Cancel Schedule</button>
              )}
              {!previewCount && <span className="fb-hint" style={{ color: 'var(--danger)', fontWeight: 600 }}>No subscribers match this targeting yet.</span>}
            </div>
          </div>

          <button type="button" onClick={persist} disabled={saving} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {savedTick ? <><CircleCheck size={13} /> Saved</> : saving ? 'Saving…' : 'Save Draft'}
          </button>
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'var(--primary-soft)', border: '1px solid var(--primary-ring)' }}>
        <Megaphone size={14} style={{ marginTop: 1, flexShrink: 0, color: 'var(--primary)' }} />
        <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary, #64748b)', lineHeight: 1.5 }}>
          Add message nodes after this Start node for what gets sent{waMode === 'TEMPLATE' ? ' (skipped in Anytime mode — the Template above is sent instead)' : ''}.
        </span>
      </div>
    </div>
  );
}
