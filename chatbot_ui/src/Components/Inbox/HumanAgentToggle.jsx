import { UserCheck } from 'lucide-react';

/**
 * Human Agent switch in the Inbox composer (Messenger + Instagram chats only).
 *
 * Shown only 24 hours – 7 days after the customer's last message. Off every
 * time a chat is opened: while off the reply box is locked; the person
 * switches it on for this chat, and their reply goes out with Meta's
 * HUMAN_AGENT tag (`humanAgent: true` on the send — routes/conversations.js
 * refuses a reply in that range without it). Bots / AI / broadcasts never use
 * the tag. Any team member may switch it; the Meta app still needs the Human
 * Agent feature from App Review, or Meta refuses the send.
 * Unrelated to the per-chat bot pause ("Join chat" / resume bot).
 */
export default function HumanAgentToggle({ enabled, onChange, platformLabel = 'Messenger' }) {
  const on = Boolean(enabled);
  const title = on
    ? `Human Agent on: your reply is sent with Meta's HUMAN_AGENT tag (${platformLabel} allows a person to reply up to 7 days after the customer's last message). Click to switch off.`
    : `Outside the 24-hour window. Switch on Human Agent to type a reply — it is sent with Meta's HUMAN_AGENT tag.`;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Human Agent"
      onClick={() => onChange?.(!on)}
      title={title}
      data-testid="human-agent-toggle"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 8px 0 7px', flexShrink: 0,
        borderRadius: 14, border: `1px solid ${on ? 'var(--primary-light)' : '#e2e8f0'}`,
        background: on ? 'var(--primary-soft)' : '#ffffff', color: on ? 'var(--primary-dark)' : '#64748b',
        fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer',
      }}
    >
      <UserCheck size={13} />
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
