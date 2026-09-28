import { ScrollText, Terminal, MessageSquareReply, Trash2 } from 'lucide-react';
import { Section, Field, Select, SaveBar } from './ui';
import { useSettingsDraft, TEMPLATE_HELP, hint } from './groupUi';

/** /rules text, commands on/off, keyword auto-replies. */
export default function CommandsTab({ settings, onSave, commands = [] }) {
  const { draft, patch, dirty, saving, save, reset } = useSettingsDraft(settings, ['rules', 'commands', 'autoReplies'], onSave);
  const replies = draft.autoReplies || [];
  const setReply = (i, p) => patch('autoReplies', replies.map((r, j) => (j === i ? { ...r, ...p } : r)));

  return (
    <div>
      <Section icon={ScrollText} title="Group rules" description="Shown when anyone sends /rules in the group.">
        <Field help={TEMPLATE_HELP}>
          <textarea className="form-input w-full" rows={6} maxLength={3000} value={draft.rules.text} onChange={(e) => patch('rules', { text: e.target.value })} placeholder={'1. Be respectful\n2. No spam or ads\n3. Stay on topic'} />
        </Field>
      </Section>

      <Section icon={Terminal} title="Commands" description="Admin commands (/warn, /mute 2h, /kick, /ban, /unban, /del, /pin, /unpin) plus /rules and /report for everyone. A member's use of an admin command is simply deleted." enabled={draft.commands.enabled} onToggle={(v) => patch('commands', { enabled: v })}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px', fontSize: '0.8rem' }}>
          {commands.map((c) => (
            <div key={c.command} style={{ display: 'contents' }}>
              <code style={{ fontWeight: 700 }}>/{c.command}</code>
              <span style={{ color: 'var(--text-muted)' }}>{c.description}{c.admin ? ' (admins)' : ' (everyone)'}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section icon={MessageSquareReply} title="Keyword auto-replies" description="The bot replies in the group when a message contains (or is exactly) a keyword.">
        {replies.length === 0 && <p style={{ ...hint, marginTop: 0, marginBottom: 10 }}>No auto-replies yet.</p>}
        {replies.map((r, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) 130px minmax(180px, 2fr) auto', gap: 8, marginBottom: 8, alignItems: 'start' }} className="tg-reply-row">
            <input className="form-input" placeholder="Keyword" maxLength={64} value={r.keyword} onChange={(e) => setReply(i, { keyword: e.target.value })} />
            <Select value={r.match || 'contains'} onChange={(v) => setReply(i, { match: v })} options={[{ value: 'contains', label: 'Contains' }, { value: 'exact', label: 'Is exactly' }]} style={{ minWidth: 0 }} />
            <textarea className="form-input" rows={2} placeholder="Reply" maxLength={2000} value={r.reply} onChange={(e) => setReply(i, { reply: e.target.value })} />
            <button type="button" className="btn btn-secondary btn-sm" aria-label="Remove auto-reply" onClick={() => patch('autoReplies', replies.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
          </div>
        ))}
        {replies.length < 50 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => patch('autoReplies', [...replies, { keyword: '', reply: '', match: 'contains' }])}>+ Add auto-reply</button>
        )}
        <p style={hint}>Rows without a keyword or reply are dropped when you save. {TEMPLATE_HELP}</p>
      </Section>

      <SaveBar dirty={dirty} saving={saving} onSave={save} onReset={reset} />
      <style>{'@media (max-width: 640px) { .tg-reply-row { grid-template-columns: 1fr !important; } }'}</style>
    </div>
  );
}
