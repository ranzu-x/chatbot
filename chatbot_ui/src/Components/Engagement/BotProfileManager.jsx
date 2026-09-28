import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Save, Loader2, ArrowUp, ArrowDown, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { botProfileAPI } from '../../services/api';
import { notify } from '../../utils/alerts';

/**
 * Facebook / Instagram "bot profile" (chatbot_api/utils/messengerProfile.js):
 *   mode="welcome" → Get Started button + greeting (Messenger) and ice breakers
 *   mode="menu"    → persistent menu
 * Both modes edit and save the same profile (Meta stores it as one object).
 * Every button runs: a flow of this bot account, a text reply, or (menu) a link.
 */

const ACTION_TYPES = [
  ['flow', 'Start a flow'],
  ['text', 'Send a reply'],
];

export function ActionEditor({ action, onChange, flows, allowUrl }) {
  const a = action || { type: 'flow' };
  const types = allowUrl ? [...ACTION_TYPES, ['url', 'Open a web link']] : ACTION_TYPES;
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      <select className="form-input" style={{ width: 170 }} value={a.type} onChange={(e) => onChange({ type: e.target.value })}>
        {types.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      {a.type === 'flow' && (
        <select className="form-input" style={{ flex: 1, minWidth: 180 }} value={a.flowId || ''} onChange={(e) => onChange({ type: 'flow', flowId: Number(e.target.value) || '' })}>
          <option value="">Choose a flow of this account…</option>
          {flows.map((f) => <option key={f.id} value={f.id}>{f.name}{f.is_active ? '' : ' (inactive)'}</option>)}
        </select>
      )}
      {a.type === 'text' && (
        <textarea className="form-input" style={{ flex: 1, minWidth: 220 }} rows={2} maxLength={1000} placeholder="Reply text — {{contact.name}} works" value={a.text || ''} onChange={(e) => onChange({ type: 'text', text: e.target.value })} />
      )}
      {a.type === 'url' && (
        <input className="form-input" style={{ flex: 1, minWidth: 220 }} placeholder="https://…" value={a.url || ''} onChange={(e) => onChange({ type: 'url', url: e.target.value })} />
      )}
    </div>
  );
}

function ListEditor({ items, setItems, max, labelKey, labelPlaceholder, labelMax, flows, allowUrl, addText }) {
  const update = (i, patch) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const move = (i, d) => {
    const next = [...items];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setItems(next);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((it, i) => (
        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'grid', gap: 8, background: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', width: 18 }}>{i + 1}</span>
            <input className="form-input" style={{ flex: 1 }} maxLength={labelMax} placeholder={labelPlaceholder} value={it[labelKey] || ''} onChange={(e) => update(i, { [labelKey]: e.target.value })} />
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{(it[labelKey] || '').length}/{labelMax}</span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={i === 0} onClick={() => move(i, -1)} title="Move up"><ArrowUp size={12} /></button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={i === items.length - 1} onClick={() => move(i, 1)} title="Move down"><ArrowDown size={12} /></button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setItems(items.filter((_, j) => j !== i))} title="Remove"><Trash2 size={12} /></button>
          </div>
          <div style={{ paddingLeft: 26 }}>
            <ActionEditor action={it.action} onChange={(action) => update(i, { action })} flows={flows} allowUrl={allowUrl} />
          </div>
        </div>
      ))}
      {items.length < max && (
        <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setItems([...items, { [labelKey]: '', action: { type: 'flow' } }])}>
          <Plus size={13} /> {addText} ({items.length}/{max})
        </button>
      )}
    </div>
  );
}

function CommandsEditor({ commands, setCommands, max, flows }) {
  const update = (i, patch) => setCommands(commands.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {commands.map((c, i) => (
        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'grid', gap: 8, background: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>/</span>
            <input className="form-input" style={{ width: 170, fontFamily: 'var(--font-mono)' }} maxLength={32} placeholder="command" value={c.command || ''}
              onChange={(e) => update(i, { command: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} />
            <input className="form-input" style={{ flex: 1, minWidth: 200 }} maxLength={256} placeholder="What it does (shown in the command list)" value={c.description || ''}
              onChange={(e) => update(i, { description: e.target.value })} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCommands(commands.filter((_, j) => j !== i))} title="Remove"><Trash2 size={12} /></button>
          </div>
          <ActionEditor action={c.action} onChange={(action) => update(i, { action })} flows={flows} />
        </div>
      ))}
      {commands.length < max && (
        <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setCommands([...commands, { command: '', description: '', action: { type: 'flow' } }])}>
          <Plus size={13} /> Add command ({commands.length}/{max})
        </button>
      )}
    </div>
  );
}

export default function BotProfileManager({ account, mode }) {
  const [data, setData] = useState(null);
  const [profile, setProfile] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setData(null);
    botProfileAPI.get(account.id)
      .then((res) => { setData(res.data); setProfile(res.data.profile); })
      .catch((err) => notify.error(err.response?.data?.message || 'Could not load the settings'));
  }, [account.id]);
  useEffect(() => { load(); }, [load]);

  const set = (patch) => setProfile((p) => ({ ...p, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await botProfileAPI.save(account.id, profile);
      notify.success(res.data?.message || 'Saved');
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not save');
      if (err.response?.data?.saved) load();
    } finally {
      setSaving(false);
    }
  };

  if (!data || !profile) return <div className="bm-content-card"><div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" size={22} /></div></div>;

  const isInstagram = data.platform === 'INSTAGRAM';
  const isWhatsApp = data.platform === 'WHATSAPP';
  const isTelegram = data.platform === 'TELEGRAM';
  const isChatApp = isWhatsApp || isTelegram;
  const channelName = isWhatsApp ? 'WhatsApp' : isTelegram ? 'Telegram' : isInstagram ? 'Instagram' : 'Messenger';
  const { limits, flows } = data;
  const box = { background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 };
  const hint = { fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 12px' };

  return (
    <div className="bm-content-card">
      <div className="bm-card-header">
        <h3 className="bm-card-title">{mode === 'menu' ? 'Action Buttons & Menus' : 'Ice Breakers & Welcome'}</h3>
        <p className="bm-card-sub">
          {mode === 'menu'
            ? (isChatApp
              ? `Commands people see when they type "/" in the ${channelName} chat with ${account.name || 'this account'}.`
              : `The menu people can open at any time in the ${channelName} chat with ${account.name || 'this account'}.`)
            : `What people see before they write to ${account.name || 'this account'} on ${channelName}.`}
        </p>
      </div>

      {profile.lastError ? (
        <div style={{ ...box, borderColor: '#f59e0b', display: 'flex', gap: 8, fontSize: '0.82rem' }}>
          <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0 }} /> Meta refused the last save: {profile.lastError}
        </div>
      ) : profile.lastSyncedAt && (
        <div style={{ fontSize: '0.76rem', color: '#16a34a', display: 'flex', gap: 6, alignItems: 'center', marginBottom: 12 }}>
          <CheckCircle2 size={13} /> Live on {channelName} since {new Date(profile.lastSyncedAt).toLocaleString()}
        </div>
      )}

      {mode === 'welcome' && isTelegram && (
        <>
          <div style={box}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '0.9rem' }}>/start</strong>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.82rem' }}>
                <input type="checkbox" checked={profile.getStartedEnabled} onChange={(e) => set({ getStartedEnabled: e.target.checked, getStartedAction: profile.getStartedAction || { type: 'flow' } })} /> Custom
              </label>
            </div>
            <p style={hint}>Every new Telegram chat begins with the Start button (/start). Choose what it does — off means your normal flows answer it.</p>
            {profile.getStartedEnabled && <ActionEditor action={profile.getStartedAction} onChange={(getStartedAction) => set({ getStartedAction })} flows={flows} />}
          </div>
          <div style={box}>
            <strong style={{ fontSize: '0.9rem' }}>"What can this bot do?"</strong>
            <p style={hint}>Shown in an empty chat before someone presses Start.</p>
            <textarea className="form-input w-full" rows={3} maxLength={limits.tgDescription} value={profile.description || ''} onChange={(e) => set({ description: e.target.value })} />
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right' }}>{(profile.description || '').length}/{limits.tgDescription}</div>
            <strong style={{ fontSize: '0.9rem', display: 'block', marginTop: 10 }}>Short description</strong>
            <p style={hint}>Shown on the bot's profile and when the bot is shared.</p>
            <input className="form-input w-full" maxLength={limits.tgShortDescription} value={profile.shortDescription || ''} onChange={(e) => set({ shortDescription: e.target.value })} />
          </div>
        </>
      )}

      {mode === 'welcome' && !isTelegram && (
        <>
          {!isInstagram && !isWhatsApp && (
            <div style={box}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '0.9rem' }}>Get Started button</strong>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.82rem' }}>
                  <input type="checkbox" checked={profile.getStartedEnabled} onChange={(e) => set({ getStartedEnabled: e.target.checked, getStartedAction: profile.getStartedAction || { type: 'flow' } })} /> On
                </label>
              </div>
              <p style={hint}>New visitors see a "Get Started" button instead of a text box. What should happen when they tap it?</p>
              {profile.getStartedEnabled && <ActionEditor action={profile.getStartedAction} onChange={(getStartedAction) => set({ getStartedAction })} flows={flows} />}
            </div>
          )}

          {!isInstagram && !isWhatsApp && (
            <div style={box}>
              <strong style={{ fontSize: '0.9rem' }}>Greeting</strong>
              <p style={hint}>Shown on the welcome screen before the first message. {'{{user_first_name}}'} becomes the person's first name.</p>
              <textarea className="form-input w-full" rows={2} maxLength={limits.greeting} placeholder="Hi {{user_first_name}}! Ask us anything." value={profile.greeting} onChange={(e) => set({ greeting: e.target.value })} />
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right' }}>{profile.greeting.length}/{limits.greeting}</div>
            </div>
          )}

          <div style={box}>
            <strong style={{ fontSize: '0.9rem' }}>Ice breakers</strong>
            <p style={hint}>Up to {limits.iceBreakers} questions people can tap to start the conversation{isInstagram ? ' (Instagram shows them on the phone app, not on desktop)' : ''}{isWhatsApp ? ' — shown in a new chat; no emoji' : ''}.</p>
            <ListEditor
              items={profile.iceBreakers}
              setItems={(iceBreakers) => set({ iceBreakers })}
              max={limits.iceBreakers}
              labelKey="question"
              labelPlaceholder="e.g. What are your opening hours?"
              labelMax={limits.question}
              flows={flows}
              addText="Add question"
            />
          </div>
        </>
      )}

      {mode === 'menu' && isChatApp && (
        <div style={box}>
          <strong style={{ fontSize: '0.9rem' }}>Commands</strong>
          <p style={hint}>
            Each command starts a flow or sends a reply. {isWhatsApp ? `Up to ${limits.waCommands}; no emoji.` : `Up to ${limits.tgCommands}; Telegram shows them in the bot's menu button.`}
          </p>
          <CommandsEditor commands={profile.commands || []} setCommands={(commands) => set({ commands })} max={isWhatsApp ? limits.waCommands : limits.tgCommands} flows={flows} />
        </div>
      )}

      {mode === 'menu' && !isChatApp && (
        <div style={box}>
          <strong style={{ fontSize: '0.9rem' }}>Persistent menu</strong>
          <p style={hint}>
            Always available from the chat's menu button. Each item starts a flow, sends a reply or opens a link.
            {!isInstagram && ' Messenger needs a Get Started button for the menu, so one is added automatically.'}
            {' '}Changes can take a while to appear in conversations that are already open.
          </p>
          <ListEditor
            items={profile.persistentMenu}
            setItems={(persistentMenu) => set({ persistentMenu })}
            max={limits.menuItems}
            labelKey="title"
            labelPlaceholder="e.g. Talk to us"
            labelMax={limits.menuTitle}
            flows={flows}
            allowUrl
            addText="Add menu item"
          />
          {profile.persistentMenu.length > 0 && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.82rem', marginTop: 12 }}>
              <input type="checkbox" checked={profile.composerInputDisabled} onChange={(e) => set({ composerInputDisabled: e.target.checked })} />
              Menu only — hide the text box so people can only use the menu
            </label>
          )}
        </div>
      )}

      {flows.length === 0 && (
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>This account has no flows yet — create one in Flows to use "Start a flow".</p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save and publish
        </button>
      </div>
    </div>
  );
}
