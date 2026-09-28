import { useCallback, useEffect, useState } from 'react';
import {
  Loader2, MessageCircleQuestion, Headset, Bot, BellOff, BellRing, Pencil, RotateCcw, Info, X, Plus, ArrowRight,
} from 'lucide-react';
import { quickActionAPI } from '../../services/api';
import { notify, showAlert } from '../../utils/alerts';

/**
 * Bot Manager → Bot Manager → Quick Actions (chatbot_api/utils/quickActions.js).
 * Every bot account has its own "action bots": No match reply, Chat with
 * human, Chat with robot, Unsubscribe, Resubscribe. Each reply is a flow
 * edited in the Flow Builder; the defaults carry the opposite action as a
 * button. The same actions are available on flow buttons and in the Actions
 * element.
 */
const FREQUENCY_LABELS = { EVERY_TIME: 'Every time', DAILY: 'Once a day', WEEKLY: 'Once a week', MONTHLY: 'Once a month' };

const META = {
  NO_MATCH:    { Icon: MessageCircleQuestion, color: '#64748b', trigger: 'Runs when no flow, keyword reply or AI agent answered a message.' },
  CHAT_HUMAN:  { Icon: Headset,  color: '#2563eb', trigger: 'Pauses the bot and hands the chat to your team (shows as Human takeover in the Inbox).' },
  CHAT_ROBOT:  { Icon: Bot,      color: '#059669', trigger: 'Turns the bot back on for this chat — works even while a person has the chat.' },
  UNSUBSCRIBE: { Icon: BellOff,  color: '#dc2626', trigger: 'Stops broadcasts and running sequences for the subscriber.' },
  RESUBSCRIBE: { Icon: BellRing, color: '#d97706', trigger: 'Subscribes them again to broadcasts and sequences.' },
};

const box = { background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 };
const hint = { fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.45 };

function Switch({ checked, onChange, disabled, label }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: disabled ? 'default' : 'pointer', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
      <span
        role="switch"
        aria-checked={checked}
        aria-label={label}
        tabIndex={0}
        onKeyDown={(e) => { if (!disabled && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); onChange(!checked); } }}
        onClick={() => !disabled && onChange(!checked)}
        style={{
          width: 36, height: 20, borderRadius: 999, position: 'relative', flexShrink: 0,
          background: checked ? 'var(--primary)' : 'var(--border)', transition: 'background .15s', opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
      </span>
      {label}
    </label>
  );
}

function KeywordEditor({ value, onSave, saving, example }) {
  const [list, setList] = useState(value);
  const [draft, setDraft] = useState('');
  useEffect(() => { setList(value); }, [value]);
  const dirty = list.join('|') !== value.join('|');
  const add = () => {
    const words = draft.split(',').map((w) => w.trim().toUpperCase()).filter(Boolean);
    if (!words.length) return;
    setList((l) => [...new Set([...l, ...words])].slice(0, 20));
    setDraft('');
  };
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>Keywords (exact message, any case)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {list.length === 0 && <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>No keywords — only buttons and the Actions element run it.</span>}
        {list.map((k) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, background: 'var(--bg-surface)', border: '1px solid var(--border)', fontSize: '0.74rem', fontWeight: 600 }}>
            {k}
            <button type="button" aria-label={`Remove ${k}`} onClick={() => setList((l) => l.filter((x) => x !== k))} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="form-input"
          style={{ flex: 1, minWidth: 0 }}
          value={draft}
          maxLength={120}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={`Add a keyword, e.g. ${example}`}
        />
        <button type="button" className="btn btn-secondary btn-sm" onClick={add} disabled={!draft.trim()}><Plus size={13} /> Add</button>
        {dirty && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => onSave(list)} disabled={saving}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : 'Save'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function QuickActionsPanel({ account, onOpenFlow, onOpenTab }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(() => {
    setData(null);
    quickActionAPI.list(account.id)
      .then((res) => setData(res.data))
      .catch((err) => { notify.error(err.response?.data?.message || 'Could not load Quick Actions'); setData({ supported: true, actions: [] }); });
  }, [account.id]);
  useEffect(() => { load(); }, [load]);

  const replace = (action) => setData((d) => ({ ...d, actions: d.actions.map((a) => (a.action === action.action ? action : a)) }));

  const update = async (key, patch, okMsg) => {
    setBusy(`${key}:${Object.keys(patch)[0]}`);
    try {
      const res = await quickActionAPI.update(account.id, key, patch);
      replace(res.data.action);
      if (okMsg) notify.success(okMsg);
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not save');
    } finally {
      setBusy(null);
    }
  };

  const reset = async (a) => {
    const ok = await showAlert.confirm({ title: `Reset "${a.title}"?`, text: 'Its reply goes back to the default message and button. Your edits to this reply are lost.', confirmButtonText: 'Reset reply' });
    if (!ok) return;
    setBusy(`${a.action}:reset`);
    try {
      const res = await quickActionAPI.reset(account.id, a.action);
      replace(res.data.action);
      notify.success('Reply reset to the default');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not reset');
    } finally {
      setBusy(null);
    }
  };

  if (!data) return <div className="bm-content-card"><div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" size={22} /></div></div>;

  return (
    <div className="bm-content-card">
      <div className="bm-card-header">
        <h3 className="bm-card-title">Quick Actions</h3>
        <p className="bm-card-sub">
          Ready-made action bots for this account. Each reply is a normal flow — open it in the Flow Builder to change the message, add buttons, images or more steps.
        </p>
      </div>

      {!data.supported ? (
        <div style={{ ...box, textAlign: 'center', padding: 30, color: 'var(--text-muted)', fontSize: '0.86rem' }}>
          Quick Actions need the Flow Builder, which isn't available for this channel yet.
        </div>
      ) : (
        <>
          <div style={{ ...box, display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16, background: 'var(--bg-surface)' }}>
            <Info size={16} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
            <p style={{ ...hint, margin: 0 }}>
              Use these actions anywhere in your flows: set a button's <b>When pressed</b> to <i>Chat with human</i>, <i>Chat with robot</i>, <i>Unsubscribe</i> or <i>Resubscribe</i>, or add them in the <b>Actions</b> element.
              Turning a reply off keeps the action working — only the confirmation message is skipped.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: 14 }}>
            {data.actions.map((a) => {
              const meta = META[a.action] || META.NO_MATCH;
              const { Icon } = meta;
              return (
                <div key={a.action} style={{ ...box, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: `${meta.color}18`, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon size={19} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '0.92rem' }}>{a.title}</strong>
                        <Switch
                          label={a.replyEnabled ? 'Reply on' : 'Reply off'}
                          checked={a.replyEnabled}
                          disabled={busy === `${a.action}:replyEnabled`}
                          onChange={(v) => update(a.action, { replyEnabled: v }, v ? 'Reply switched on' : 'Reply switched off')}
                        />
                      </div>
                      <p style={hint}>{meta.trigger}</p>
                    </div>
                  </div>

                  {a.supportsFrequency && a.replyEnabled && (
                    <p style={{ ...hint, marginTop: 12 }}>
                      Sent to the same subscriber: <b>{FREQUENCY_LABELS[a.frequency] || 'Every time'}</b> — change it in Bot Settings.
                    </p>
                  )}
                  {a.supportsKeywords && (
                    <KeywordEditor
                      value={a.keywords}
                      example={a.action === 'CHAT_HUMAN' ? 'SUPPORT' : 'MENU'}
                      saving={busy === `${a.action}:keywords`}
                      onSave={(list) => update(a.action, { keywords: list }, 'Keywords saved')}
                    />
                  )}
                  {(a.action === 'UNSUBSCRIBE' || a.action === 'RESUBSCRIBE') && (
                    <p style={{ ...hint, marginTop: 12 }}>
                      Keywords come from{' '}
                      <button type="button" onClick={() => onOpenTab?.('optOut')} style={{ border: 'none', background: 'none', padding: 0, color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', fontSize: 'inherit' }}>
                        Opt-out Keywords
                      </button>{' '}
                      ({a.action === 'UNSUBSCRIBE' ? 'STOP' : 'START'} by default) — this reply is sent for them while it's on.
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 14, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpenFlow?.(a.flowId)} disabled={!a.flowId}>
                      <Pencil size={13} /> Edit reply <ArrowRight size={13} />
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => reset(a)} disabled={busy === `${a.action}:reset`}>
                      {busy === `${a.action}:reset` ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Reset
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
