import { useState } from 'react';
import { UserCheck, Loader2 } from 'lucide-react';
import { messengerUtilityAPI } from '../../services/api';
import { notify } from '../../utils/alerts';

/**
 * Human Agent switch in the Inbox composer (Messenger + Instagram chats only).
 *
 * Same setting that used to live in Bot Manager → Human Agent: the bot
 * account's `integrations.human_agent_enabled` ("our Meta app has the Human
 * Agent feature from App Review"). On = a person may reply from the Inbox for
 * up to 7 days after the customer's last message, sent with Meta's HUMAN_AGENT
 * tag; bots / AI / broadcasts never use it. It is per bot account, so every
 * chat of that Page / Instagram account shares it. Owner-only on the server
 * (routes/messengerTemplates.js `ownerOnly`); team members see the state.
 * Unrelated to the per-chat bot pause ("Join chat" / resume bot).
 */
export default function HumanAgentToggle({ integrationId, enabled, canEdit, platformLabel = 'this account', onChanged }) {
  const [saving, setSaving] = useState(false);
  const on = Boolean(enabled);

  const toggle = async () => {
    if (!canEdit || saving || !integrationId) return;
    setSaving(true);
    try {
      const res = await messengerUtilityAPI.setHumanAgent(integrationId, !on);
      onChanged?.(Boolean(res.data.humanAgentEnabled));
      notify.success(res.data.message);
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Could not change Human Agent');
    } finally {
      setSaving(false);
    }
  };

  const title = `Human Agent ${on ? 'on' : 'off'} for ${platformLabel}: ${on
    ? 'a person can reply here for up to 7 days after the customer\'s last message (Meta HUMAN_AGENT tag).'
    : 'replies are only possible within 24 hours of the customer\'s last message.'}${canEdit
    ? ' Turn on only if your Meta app is approved for Human Agent. Click to switch.'
    : ' Only the account owner can change this.'}`;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Human Agent"
      onClick={toggle}
      disabled={!canEdit || saving}
      title={title}
      data-testid="human-agent-toggle"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 8px 0 7px', flexShrink: 0,
        borderRadius: 14, border: `1px solid ${on ? 'var(--primary-light)' : '#e2e8f0'}`,
        background: on ? 'var(--primary-soft)' : '#ffffff', color: on ? 'var(--primary-dark)' : '#64748b',
        fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap',
        cursor: canEdit && !saving ? 'pointer' : 'default', opacity: canEdit ? 1 : 0.75,
      }}
    >
      {saving ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <UserCheck size={13} />}
      Human Agent
      <span aria-hidden="true" style={{
        position: 'relative', width: 24, height: 14, borderRadius: 7, flexShrink: 0,
        background: on ? 'var(--primary)' : '#cbd5e1', transition: 'background 0.15s',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 12 : 2, width: 10, height: 10, borderRadius: '50%',
          background: '#fff', transition: 'left 0.15s',
        }} />
      </span>
    </button>
  );
}
