import { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Save, RefreshCw } from 'lucide-react';
import { botProfileAPI } from '../../services/api';
import { notify, showAlert } from '../../utils/alerts';

/**
 * Bot Manager → Engagement → Ice Breakers & Welcome, for a TikTok account
 * (chatbot_api/utils/tiktokBusiness.js). TikTok's own automatic messages —
 * welcome message, suggested questions, chat prompts — plus the
 * Comment-to-Message switch. Everything is read from and saved straight to
 * TikTok; nothing is kept here.
 */
const SECTIONS = [
  { type: 'SUGGESTED_QUESTION', title: 'Suggested questions', hint: 'Questions people can tap; TikTok answers with your preset answer.', fields: [['question', 'Question', 'q'], ['answer', 'Answer', 'a']] },
  { type: 'CHAT_PROMPT', title: 'Chat prompts', hint: 'Topic buttons that start a conversation — tapping one sends its message for the person.', fields: [['title', 'Button title', null], ['content', 'Message it sends', null]] },
];

export default function TikTokAutoMessagesPanel({ account }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [welcome, setWelcome] = useState('');
  const [drafts, setDrafts] = useState({});

  const load = () => {
    setError('');
    botProfileAPI.getTikTok(account.id)
      .then((res) => {
        setData(res.data);
        setWelcome(res.data.autoMessages.WELCOME_MESSAGE.items[0]?.welcome_message?.content || '');
      })
      .catch((err) => setError(err.response?.data?.message || 'Could not load the settings from TikTok'));
  };
  useEffect(load, [account.id]);

  const run = async (key, fn, okMsg) => {
    setBusy(key);
    try {
      const res = await fn();
      notify.success(okMsg || res.data?.message || 'Saved');
      load();
      return true;
    } catch (err) {
      notify.error(err.response?.data?.message || 'TikTok refused the change');
      return false;
    } finally {
      setBusy('');
    }
  };

  const toggle = (type, enabled) => run(`status-${type}`, () => botProfileAPI.setTikTokStatus(account.id, { type, enabled }));

  const box = { background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 14 };
  const hint = { fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 10px' };
  const Switch = ({ type, on }) => (
    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.82rem', fontWeight: 600 }}>
      <input type="checkbox" checked={on} disabled={busy === `status-${type}`} onChange={(e) => toggle(type, e.target.checked)} /> {on ? 'On' : 'Off'}
    </label>
  );

  if (error) {
    return (
      <div className="bm-content-card">
        <div className="bm-card-header"><h3 className="bm-card-title">TikTok automatic messages</h3></div>
        <div style={{ ...box, borderColor: '#f59e0b', fontSize: '0.85rem' }}>{error}</div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={14} /> Try again</button>
      </div>
    );
  }
  if (!data) return <div className="bm-content-card"><div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" size={22} /></div></div>;

  const limits = data.limits;
  const welcomeItem = data.autoMessages.WELCOME_MESSAGE.items[0];

  return (
    <div className="bm-content-card">
      <div className="bm-card-header">
        <h3 className="bm-card-title">TikTok automatic messages</h3>
        <p className="bm-card-sub">What people see when they open a chat with {account.name || 'this account'} on TikTok. Saved straight to TikTok — TikTok may review a message before it shows.</p>
      </div>

      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: '0.9rem' }}>Welcome message</strong>
          <Switch type="WELCOME_MESSAGE" on={data.autoMessages.WELCOME_MESSAGE.enabled} />
        </div>
        <p style={hint}>Sent when someone starts a chat.{welcomeItem?.audit_status ? ` TikTok review: ${welcomeItem.audit_status}.` : ''}</p>
        <textarea className="form-input w-full" rows={3} maxLength={limits.welcome} value={welcome} onChange={(e) => setWelcome(e.target.value)} placeholder="Hi! Thanks for reaching out — how can we help?" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{welcome.length}/{limits.welcome}</span>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy === 'welcome' || !welcome.trim()}
            onClick={() => run('welcome', () => botProfileAPI.saveTikTokAutoMessage(account.id, { type: 'WELCOME_MESSAGE', autoMessageId: welcomeItem?.auto_message_id, content: welcome }))}>
            {busy === 'welcome' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
          </button>
        </div>
      </div>

      {SECTIONS.map((sec) => {
        const state = data.autoMessages[sec.type];
        const draft = drafts[sec.type] || {};
        const setDraft = (patch) => setDrafts((d) => ({ ...d, [sec.type]: { ...draft, ...patch } }));
        const key = sec.type === 'SUGGESTED_QUESTION' ? 'suggested_question' : 'chat_prompt';
        return (
          <div key={sec.type} style={box}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '0.9rem' }}>{sec.title}</strong>
              <Switch type={sec.type} on={state.enabled} />
            </div>
            <p style={hint}>{sec.hint}</p>
            {state.items.map((item) => {
              const v = item[key] || {};
              return (
                <div key={item.auto_message_id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6, background: 'var(--bg-surface, #fff)' }}>
                  <div style={{ flex: 1, fontSize: '0.84rem' }}>
                    <div style={{ fontWeight: 700 }}>{v[sec.fields[0][0]]}</div>
                    <div style={{ color: 'var(--text-muted)' }}>{v[sec.fields[1][0]]}</div>
                    {item.audit_status && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>TikTok review: {item.audit_status}</div>}
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" aria-label="Delete" disabled={busy === item.auto_message_id}
                    onClick={async () => {
                      if (!(await showAlert.confirm('Delete this?', 'It is removed from TikTok straight away.', 'Delete'))) return;
                      run(item.auto_message_id, () => botProfileAPI.deleteTikTokAutoMessage(account.id, sec.type, item.auto_message_id), 'Deleted');
                    }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              {sec.fields.map(([field, label, limitKey]) => (
                <input key={field} className="form-input w-full" placeholder={label} maxLength={limitKey === 'q' ? limits.question : limitKey === 'a' ? limits.answer : undefined}
                  value={draft[field] || ''} onChange={(e) => setDraft({ [field]: e.target.value })} />
              ))}
              <div>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy === `add-${sec.type}` || sec.fields.some(([f]) => !(draft[f] || '').trim())}
                  onClick={async () => {
                    const ok = await run(`add-${sec.type}`, () => botProfileAPI.saveTikTokAutoMessage(account.id, { type: sec.type, ...draft }), 'Added on TikTok');
                    if (ok) setDrafts((d) => ({ ...d, [sec.type]: {} }));
                  }}>
                  {busy === `add-${sec.type}` ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add
                </button>
              </div>
            </div>
          </div>
        );
      })}

      <div style={box}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: '0.9rem' }}>Comment-to-Message</strong>
          <Switch type="COMMENT_TO_MESSAGE" on={data.commentToMessage} />
        </div>
        <p style={{ ...hint, marginBottom: 0 }}>TikTok's setting that lets this account send a private message to people who comment on its videos.</p>
      </div>
    </div>
  );
}
