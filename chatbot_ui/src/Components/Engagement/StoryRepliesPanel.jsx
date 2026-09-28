import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import { botProfileAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import { ActionEditor } from './BotProfileManager';

/**
 * Bot Manager → Engagement → Story Mentions Reply (Facebook / Instagram) —
 * chatbot_api/utils/storyReplies.js.
 */
export default function StoryRepliesPanel({ account }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setData(null);
    botProfileAPI.getStories(account.id)
      .then((res) => {
        setData(res.data);
        const s = res.data.settings;
        setForm({ mentionOn: Boolean(s.mentionAction), mentionAction: s.mentionAction || { type: 'text', text: 'Thanks for the mention, {{contact.name}}! 💛' }, replyOn: Boolean(s.replyAction), replyAction: s.replyAction || { type: 'flow' }, cooldownHours: s.cooldownHours });
      })
      .catch((err) => notify.error(err.response?.data?.message || 'Could not load the settings'));
  }, [account.id]);

  const save = async () => {
    setSaving(true);
    try {
      await botProfileAPI.saveStories(account.id, {
        mentionAction: form.mentionOn ? form.mentionAction : null,
        replyAction: form.replyOn ? form.replyAction : null,
        cooldownHours: form.cooldownHours,
      });
      notify.success('Story automation saved');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <div className="bm-content-card"><div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" size={22} /></div></div>;
  const box = { background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 14 };
  const hint = { fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 10px' };
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="bm-content-card">
      <div className="bm-card-header">
        <h3 className="bm-card-title">Story Mentions Reply</h3>
        <p className="bm-card-sub">Answer automatically when someone mentions {account.name || 'this account'} in their story or replies to one of your stories. Last 30 days: {data.last30Days.mentions} mentions and {data.last30Days.replies} story replies answered.</p>
      </div>
      <div style={box}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: '0.9rem' }}>
          <input type="checkbox" checked={form.mentionOn} onChange={(e) => set({ mentionOn: e.target.checked })} /> When someone mentions you in their story
        </label>
        <p style={hint}>A thank-you message or a flow (e.g. a discount code for sharing).</p>
        {form.mentionOn && <ActionEditor action={form.mentionAction} onChange={(mentionAction) => set({ mentionAction })} flows={data.flows} />}
      </div>
      <div style={box}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, fontSize: '0.9rem' }}>
          <input type="checkbox" checked={form.replyOn} onChange={(e) => set({ replyOn: e.target.checked })} /> When someone replies to your story
        </label>
        <p style={hint}>Replies still show in the Inbox; this answers them first (only when no person is handling the chat).</p>
        {form.replyOn && <ActionEditor action={form.replyAction} onChange={(replyAction) => set({ replyAction })} flows={data.flows} />}
      </div>
      <div style={{ ...box, display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem' }}>
        Answer the same person at most once every
        <input type="number" min={0} max={720} className="form-input" style={{ width: 80 }} value={form.cooldownHours} onChange={(e) => set({ cooldownHours: Number(e.target.value) })} />
        hours (0 = every time)
      </div>
      <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save</button>
    </div>
  );
}
