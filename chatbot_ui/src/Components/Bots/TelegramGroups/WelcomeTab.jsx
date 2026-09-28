import { Hand, LogOut, ShieldCheck, UserPlus, Sparkles } from 'lucide-react';
import { Section, Field, Select, NumberInput, Switch, UrlButtonsEditor, SaveBar } from './ui';
import { useSettingsDraft, TEMPLATE_HELP, hint } from './groupUi';

/** Welcome, goodbye, captcha, join requests and join/leave message cleanup. */
export default function WelcomeTab({ settings, onSave }) {
  const { draft, patch, dirty, saving, save, reset } = useSettingsDraft(settings, ['welcome', 'goodbye', 'captcha', 'joinRequests', 'cleanService'], onSave);
  const { welcome, goodbye, captcha, joinRequests, cleanService } = draft;

  return (
    <div>
      <Section icon={Hand} title="Welcome message" description="Greets every new member in the group." enabled={welcome.enabled} onToggle={(v) => patch('welcome', { enabled: v })}>
        <Field label="Message" help={TEMPLATE_HELP}>
          <textarea className="form-input w-full" rows={4} maxLength={2000} value={welcome.text} onChange={(e) => patch('welcome', { text: e.target.value })} />
        </Field>
        <Field label="Link buttons (optional)">
          <UrlButtonsEditor value={welcome.buttons} onChange={(buttons) => patch('welcome', { buttons })} />
        </Field>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <Switch checked={welcome.deletePrevious} onChange={(v) => patch('welcome', { deletePrevious: v })} label="Delete the previous welcome" />
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            Delete after <NumberInput value={welcome.deleteAfterMinutes} min={0} max={1440} onChange={(v) => patch('welcome', { deleteAfterMinutes: v })} suffix="minutes (0 = keep)" />
          </span>
        </div>
      </Section>

      <Section icon={ShieldCheck} title="Captcha for new members" description="New members can't post until they tap a button — stops spam bots. Needs the bot to be an admin with Ban users; in a basic group their messages are deleted instead." enabled={captcha.enabled} onToggle={(v) => patch('captcha', { enabled: v })}>
        <Field label="Message" help={`${TEMPLATE_HELP} {minutes} = the time limit.`}>
          <textarea className="form-input w-full" rows={3} maxLength={1000} value={captcha.text} onChange={(e) => patch('captcha', { text: e.target.value })} />
        </Field>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Field label="Button text">
            <input className="form-input" maxLength={40} value={captcha.buttonText} onChange={(e) => patch('captcha', { buttonText: e.target.value })} />
          </Field>
          <Field label="Time limit">
            <NumberInput value={captcha.timeoutMinutes} min={1} max={60} onChange={(v) => patch('captcha', { timeoutMinutes: v })} suffix="minutes" />
          </Field>
          <Field label="If they don't tap in time">
            <Select value={captcha.onFail} onChange={(v) => patch('captcha', { onFail: v })} options={[{ value: 'KICK', label: 'Remove them (they can rejoin)' }, { value: 'MUTE', label: 'Keep them muted' }]} />
          </Field>
        </div>
        <p style={hint}>People an admin adds, and approved join requests, skip the captcha. The welcome message is sent once they pass.</p>
      </Section>

      <Section icon={UserPlus} title="Join requests" description="For groups (or invite links) where joining needs approval. Requests show up in the Join Requests tab.">
        <Field label="What to do with a new request">
          <Select value={joinRequests.mode} onChange={(v) => patch('joinRequests', { mode: v })} options={[{ value: 'MANUAL', label: 'Wait for me to approve' }, { value: 'AUTO_APPROVE', label: 'Approve automatically' }]} />
        </Field>
        {joinRequests.mode === 'MANUAL' && (
          <Field label="Private message to the person asking (optional)" help="Sent by the bot right after the request (Telegram allows this for 5 minutes). Empty = no message.">
            <textarea className="form-input w-full" rows={2} maxLength={1000} value={joinRequests.dmText} placeholder="Thanks for your request to join {group_title}! An admin will review it soon." onChange={(e) => patch('joinRequests', { dmText: e.target.value })} />
          </Field>
        )}
      </Section>

      <Section icon={LogOut} title="Goodbye message" description="Posted when someone leaves on their own (not when removed)." enabled={goodbye.enabled} onToggle={(v) => patch('goodbye', { enabled: v })}>
        <Field label="Message" help={TEMPLATE_HELP}>
          <textarea className="form-input w-full" rows={2} maxLength={1000} value={goodbye.text} onChange={(e) => patch('goodbye', { text: e.target.value })} />
        </Field>
      </Section>

      <Section icon={Sparkles} title="Clean service messages" description={`Delete Telegram's own "X joined the group" / "X left the group" lines to keep the chat tidy.`}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Switch checked={cleanService.joins} onChange={(v) => patch('cleanService', { joins: v })} label='Delete "joined" messages' />
          <Switch checked={cleanService.leaves} onChange={(v) => patch('cleanService', { leaves: v })} label='Delete "left" messages' />
        </div>
      </Section>

      <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={reset} />
    </div>
  );
}
