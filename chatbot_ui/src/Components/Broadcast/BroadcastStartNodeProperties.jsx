import { useNavigate } from 'react-router';
import AudienceForm from './AudienceForm';
import { useBroadcastCampaignContext } from './useBroadcastCampaign';
import { Megaphone, Loader2, CircleX, Clock, Lock, FileText, MessagesSquare, Send } from 'lucide-react';

const BROADCASTING_PAGE = '/campaigns';

const STATUS_LABEL = {
  DRAFT: 'Draft', SCHEDULED: 'Scheduled', PROCESSING: 'Sending', COMPLETED: 'Sent', FAILED: 'Failed', CANCELLED: 'Cancelled',
};

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

/** Two-option segmented control in the builder's style. */
export function Segmented({ value, options, onChange, ariaLabel, disabled = false }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-base, transparent)' }}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            style={{
              flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 8px',
              borderRadius: 7, border: 'none', fontSize: '0.78rem', fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
              background: active ? 'var(--primary)' : 'transparent', color: active ? '#fff' : 'var(--text-secondary)',
              transition: 'background .15s, color .15s',
            }}
          >
            {o.icon}{o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The Broadcast element (Start node of a BROADCAST flow — opened from the
 * Broadcasting page's "New Broadcast"). Its settings are the campaign's name,
 * sending mode (WhatsApp: Inside 24 hours → a Send Message element, Anytime →
 * a Message Template element, swapped on the canvas) and audience. The bot
 * account is fixed. Campaign state lives in useBroadcastCampaign (shared with
 * the builder's top bar); audience edits save themselves.
 *
 * Saving and sending are NOT here: the builder's Save saves the draft, and
 * its Review & Send button opens the send / schedule dialog. This panel only
 * has the builder's standard Done button.
 */
export default function BroadcastStartNodeProperties({ flowName, onFlowNameChange, platform }) {
  const navigate = useNavigate();
  const bc = useBroadcastCampaignContext();

  if (!bc || bc.loading) {
    return (
      <div className="fb-field" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted, #64748b)' }}>
        <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> Loading campaign…
      </div>
    );
  }

  const { campaign, accountLabel, editable, mode } = bc;
  if (!campaign) {
    return (
      <div className="fb-field">
        <span className="fb-hint">No campaign is linked to this flow — reopen it from the Broadcasting page.</span>
      </div>
    );
  }
  const isFinal = ['PROCESSING', 'COMPLETED', 'CANCELLED'].includes(campaign.status);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="fb-field">
        <label>Campaign Name</label>
        <input value={flowName || ''} onChange={(e) => onFlowNameChange?.(e.target.value)} placeholder="e.g. Weekend Sale Announcement" disabled={!editable} />
      </div>

      {/* Fixed bot account — chosen on the Broadcasting page, never changed here. */}
      <div className="fb-field">
        <label>Sending From</label>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '9px 11px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--bg-hover)', fontSize: '0.82rem', fontWeight: 600,
          }}
        >
          <Lock size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {accountLabel || (campaign.integration_id ? 'Account no longer connected' : 'No account')}
          </span>
        </div>
        <span className="fb-hint">Fixed for this broadcast — chosen when it was created.</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999,
            fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary)',
            background: 'var(--primary-soft)', border: '1px solid var(--primary-ring)',
          }}
        >
          {STATUS_LABEL[campaign.status] || campaign.status}
        </span>
        {campaign.scheduled_at && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #64748b)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Clock size={12} /> {campaign.status === 'SCHEDULED' ? '' : 'Planned: '}{new Date(campaign.scheduled_at).toLocaleString()}
          </span>
        )}
      </div>

      {campaign.error_message && (
        <div style={{ padding: '8px 10px', background: 'rgba(239,68,68,.07)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 8, fontSize: '0.76rem', color: 'var(--danger)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <CircleX size={13} style={{ marginTop: 1, flexShrink: 0 }} /> {campaign.error_message}
        </div>
      )}

      {isFinal && <MetricBars campaign={campaign} />}

      {campaign.status === 'SCHEDULED' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            This broadcast is scheduled. Use Review &amp; Send at the top to reschedule it or send it now, or cancel the schedule to edit it here.
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={bc.cancelSchedule}>Cancel Schedule</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(BROADCASTING_PAGE)}>Open Broadcasting</button>
          </div>
        </div>
      )}

      {editable && (
        <>
          {platform === 'WHATSAPP' && (
            <div className="fb-field">
              <label>Sending Mode</label>
              <Segmented
                ariaLabel="Sending mode"
                value={mode}
                onChange={bc.changeMode}
                disabled={bc.modeBusy}
                options={[
                  { value: 'TEMPLATE', label: 'Anytime', icon: <FileText size={13} /> },
                  { value: 'WINDOW', label: 'Inside 24 Hours', icon: <MessagesSquare size={13} /> },
                ]}
              />
              <span className="fb-hint">
                {mode === 'TEMPLATE'
                  ? 'Reaches subscribers outside the 24-hour window with an approved template — set it in the Message Template element connected to this Broadcast.'
                  : 'Free-form messages to subscribers who wrote in during the last 24 hours — write them in the Send Message element connected to this Broadcast.'}
              </span>
            </div>
          )}

          <AudienceForm platform={platform} integrationId={campaign.integration_id} labels={bc.labels} value={bc.audienceForm} onChange={bc.setAudienceForm} previewCount={bc.previewCount} />

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 10, border: '1px dashed var(--border)' }}>
            <Send size={14} style={{ marginTop: 1, flexShrink: 0, color: 'var(--text-muted)' }} />
            <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary, #64748b)', lineHeight: 1.5 }}>
              <strong>Save</strong> keeps this as a draft — nothing is sent. When it&apos;s ready, click <strong>Review &amp; Send</strong> at the top to send it now or schedule it.
            </span>
          </div>
        </>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 10, background: 'var(--primary-soft)', border: '1px solid var(--primary-ring)' }}>
        <Megaphone size={14} style={{ marginTop: 1, flexShrink: 0, color: 'var(--primary)' }} />
        <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary, #64748b)', lineHeight: 1.5 }}>
          {mode === 'TEMPLATE'
            ? 'Anytime sends only the Message Template element connected right after this Broadcast.'
            : 'Everything connected after this Broadcast, up to the first question, condition or delay, is sent.'}
        </span>
      </div>
    </div>
  );
}
