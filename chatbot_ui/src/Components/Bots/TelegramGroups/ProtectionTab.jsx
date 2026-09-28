import { Link2, Forward, Ban, Zap, Bot, Megaphone, AlertTriangle, BellRing } from 'lucide-react';
import { Section, Field, Select, NumberInput, SaveBar } from './ui';
import { useSettingsDraft, PENALTY_OPTIONS, hint } from './groupUi';

/** Anti-spam filters and the warnings ladder. Admins are never moderated. */
export default function ProtectionTab({ settings, onSave }) {
  const { draft, patch, dirty, saving, save, reset } = useSettingsDraft(
    settings,
    ['antiLink', 'antiForward', 'bannedWords', 'antiFlood', 'blockBots', 'blockChannelSenders', 'warnings', 'notices'],
    onSave,
  );
  const { antiLink, antiForward, bannedWords, antiFlood, blockBots, blockChannelSenders, warnings, notices } = draft;
  const listText = (v) => (Array.isArray(v) ? v.join(', ') : v || '');

  return (
    <div>
      <p style={{ ...hint, marginBottom: 12 }}>Group admins (and admins posting anonymously) are never moderated. The bot must be an admin with <b>Delete messages</b> (and <b>Ban users</b> to mute, remove or ban).</p>

      <Section icon={Link2} title="Links" description="Messages with links (incl. hidden links and t.me invites)." enabled={antiLink.enabled} onToggle={(v) => patch('antiLink', { enabled: v })}>
        <Field label="What happens"><Select value={antiLink.action} onChange={(v) => patch('antiLink', { action: v })} options={PENALTY_OPTIONS} /></Field>
        <Field label="Allowed domains" help="Comma separated — sub-domains are allowed too, e.g. youtube.com, yourshop.com">
          <input className="form-input w-full" value={listText(antiLink.allowDomains)} onChange={(e) => patch('antiLink', { allowDomains: e.target.value })} placeholder="yourshop.com, youtube.com" />
        </Field>
      </Section>

      <Section icon={Forward} title="Forwarded messages" description="Messages forwarded from other chats or channels (the group's own linked channel is fine)." enabled={antiForward.enabled} onToggle={(v) => patch('antiForward', { enabled: v })}>
        <Field label="What happens"><Select value={antiForward.action} onChange={(v) => patch('antiForward', { action: v })} options={PENALTY_OPTIONS} /></Field>
      </Section>

      <Section icon={Ban} title="Banned words" description="Whole words, any case (a symbol or phrase is matched anywhere)." enabled={bannedWords.enabled} onToggle={(v) => patch('bannedWords', { enabled: v })}>
        <Field label="Words" help="Comma or new line separated, up to 200.">
          <textarea className="form-input w-full" rows={3} value={listText(bannedWords.words)} onChange={(e) => patch('bannedWords', { words: e.target.value })} placeholder="scam, crypto giveaway, …" />
        </Field>
        <Field label="What happens"><Select value={bannedWords.action} onChange={(v) => patch('bannedWords', { action: v })} options={PENALTY_OPTIONS} /></Field>
      </Section>

      <Section icon={Zap} title="Flood control" description="Someone sending too many messages in a short time." enabled={antiFlood.enabled} onToggle={(v) => patch('antiFlood', { enabled: v })}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="More than"><NumberInput value={antiFlood.messages} min={3} max={50} onChange={(v) => patch('antiFlood', { messages: v })} suffix="messages" /></Field>
          <Field label="Within"><NumberInput value={antiFlood.seconds} min={3} max={120} onChange={(v) => patch('antiFlood', { seconds: v })} suffix="seconds" /></Field>
          <Field label="What happens"><Select value={antiFlood.action} onChange={(v) => patch('antiFlood', { action: v })} options={PENALTY_OPTIONS.filter((o) => o.value !== 'DELETE')} /></Field>
          {antiFlood.action === 'MUTE' && <Field label="Mute for"><NumberInput value={antiFlood.muteMinutes} min={1} max={10080} onChange={(v) => patch('antiFlood', { muteMinutes: v })} suffix="minutes" /></Field>}
        </div>
      </Section>

      <Section icon={Megaphone} title="Posting as a channel" description="Delete messages people send in the name of their own channel." enabled={blockChannelSenders.enabled} onToggle={(v) => patch('blockChannelSenders', { enabled: v })} />
      <Section icon={Bot} title="Other bots" description="Remove bots added by anyone who isn't a group admin." enabled={blockBots.enabled} onToggle={(v) => patch('blockBots', { enabled: v })} />

      <Section icon={AlertTriangle} title="Warnings" description="When a rule's action is 'warn' (or an admin uses /warn), warnings add up. At the limit this happens, and the count starts over.">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Field label="Warnings allowed"><NumberInput value={warnings.limit} min={1} max={20} onChange={(v) => patch('warnings', { limit: v })} /></Field>
          <Field label="Then">
            <Select value={warnings.action} onChange={(v) => patch('warnings', { action: v })} options={[{ value: 'MUTE', label: 'Mute' }, { value: 'KICK', label: 'Remove (can rejoin)' }, { value: 'BAN', label: 'Ban' }]} />
          </Field>
          {warnings.action === 'MUTE' && <Field label="Mute for"><NumberInput value={warnings.muteMinutes} min={1} max={525600} onChange={(v) => patch('warnings', { muteMinutes: v })} suffix="minutes" /></Field>}
        </div>
      </Section>

      <Section icon={BellRing} title="Notices in the group" description={'Short notes like "⚠️ Ann, links aren\'t allowed here. Warning 1/3."'} enabled={notices.enabled} onToggle={(v) => patch('notices', { enabled: v })}>
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
          Delete them after <NumberInput value={notices.deleteAfterSeconds} min={0} max={3600} onChange={(v) => patch('notices', { deleteAfterSeconds: v })} suffix="seconds (0 = keep)" />
        </span>
      </Section>

      <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={reset} />
    </div>
  );
}

