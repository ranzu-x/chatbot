import { useCallback, useEffect, useState } from 'react';
import { Mail, Loader2, Timer, Headphones, AlertTriangle, Save } from 'lucide-react';
import { botSettingsAPI } from '../../services/api';
import { notify } from '../../utils/alerts';

/**
 * Bot Settings → General (Chat with Human email) and Inbox (session lengths)
 * tabs. One bot account's `bot_settings` row (chatbot_api/utils/botSettings.js);
 * each card saves on its own Save button.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const cardStyle = {
  background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, padding: '16px 20px',
  marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
};

function CardHeader({ icon, title, children, right }) {
  const Icon = icon;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={17} />
      </div>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0f172a' }}>{title}</div>
        <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '2px 0 0', lineHeight: 1.45 }}>{children}</p>
      </div>
      {right}
    </div>
  );
}

function SaveButton({ busy, disabled, onClick }) {
  return (
    <button type="button" className="btn btn-primary btn-sm" disabled={busy || disabled} onClick={onClick} style={{ height: 34, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {busy ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Save size={13} />}
      {busy ? 'Saving…' : 'Save'}
    </button>
  );
}

/** Loads one bot's settings; `save(partial)` sends only what changed. */
function useBotSettings(integrationId) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    if (!integrationId) return;
    setError('');
    botSettingsAPI.get(integrationId)
      .then((res) => setData(res.data))
      .catch((err) => setError(err?.response?.data?.message || 'Could not load the bot settings'));
  }, [integrationId]);
  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (partial, message) => {
    try {
      const res = await botSettingsAPI.save(integrationId, partial);
      setData(res.data);
      notify.success(message || 'Saved');
      return true;
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Could not save');
      return false;
    }
  }, [integrationId]);

  return { data, error, save, reload: load };
}

function LoadState({ error, onRetry }) {
  if (error) {
    return (
      <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 10, color: '#b91c1c', fontSize: '0.82rem' }}>
        <AlertTriangle size={16} /> {error}
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry} style={{ marginLeft: 'auto' }}>Retry</button>
      </div>
    );
  }
  return (
    <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8', fontSize: '0.82rem' }}>
      <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> Loading settings…
    </div>
  );
}

// ── General → Chat with Human email ───────────────────────────────────────
export function ChatHumanEmailCard({ integrationId }) {
  const { data, error, save, reload } = useBotSettings(integrationId);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const saved = data?.settings?.chatHumanEmail || '';
  useEffect(() => { setEmail(saved); }, [saved]);

  if (!data) return <LoadState error={error} onRetry={reload} />;

  const trimmed = email.trim();
  const invalid = trimmed !== '' && !EMAIL_RE.test(trimmed);
  const dirty = trimmed !== saved;

  const submit = async () => {
    if (invalid) return;
    setBusy(true);
    await save({ chatHumanEmail: trimmed || null }, trimmed ? 'Chat with Human email saved' : 'Chat with Human email removed');
    setBusy(false);
  };

  return (
    <div style={cardStyle} data-testid="chat-human-email">
      <CardHeader icon={Mail} title="Chat with Human email">
        When a subscriber taps <b>Chat with Human</b> (or types one of its keywords), we email this address with who they are,
        the channel and their latest messages. The hand-over itself works the same with or without it.
      </CardHeader>
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
        <label htmlFor="chat-human-email" style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 6 }}>
          Notification email
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            id="chat-human-email"
            type="email"
            className="form-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && dirty && !invalid) submit(); }}
            placeholder="support@yourcompany.com — leave empty for no email"
            aria-invalid={invalid}
            style={{ flex: 1, minWidth: 220, height: 34, fontSize: '0.84rem', borderColor: invalid ? '#fca5a5' : undefined }}
          />
          <SaveButton busy={busy} disabled={!dirty || invalid} onClick={submit} />
        </div>
        {invalid && <div style={{ fontSize: '0.74rem', color: '#dc2626', marginTop: 6 }}>Enter a valid email address.</div>}
        {!data.emailConfigured && (
          <div style={{ fontSize: '0.74rem', color: '#b45309', marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
            <AlertTriangle size={13} /> Email sending isn&apos;t set up on this server yet (SMTP), so nothing will be delivered until it is.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inbox → session lengths ───────────────────────────────────────────────
const UNITS = [
  { id: 'minutes', label: 'minutes', factor: 1 },
  { id: 'hours', label: 'hours', factor: 60 },
  { id: 'days', label: 'days', factor: 1440 },
];

/** 90 → { value: 90, unit: 'minutes' }, 120 → { value: 2, unit: 'hours' }. */
function splitMinutes(total) {
  if (!total) return { value: '', unit: 'hours' };
  if (total % 1440 === 0) return { value: String(total / 1440), unit: 'days' };
  if (total % 60 === 0) return { value: String(total / 60), unit: 'hours' };
  return { value: String(total), unit: 'minutes' };
}

function describeMinutes(total) {
  if (!total) return null;
  const { value, unit } = splitMinutes(total);
  return `${value} ${Number(value) === 1 ? unit.replace(/s$/, '') : unit}`;
}

function DurationSetting({ id, icon, title, description, savedMinutes, defaultText, limits, onSave }) {
  const initial = splitMinutes(savedMinutes);
  const [useCustom, setUseCustom] = useState(Boolean(savedMinutes));
  const [value, setValue] = useState(initial.value);
  const [unit, setUnit] = useState(initial.unit);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const next = splitMinutes(savedMinutes);
    setUseCustom(Boolean(savedMinutes));
    setValue(next.value);
    setUnit(next.unit);
  }, [savedMinutes]);

  const factor = UNITS.find((u) => u.id === unit)?.factor || 1;
  const minutes = Number(value) * factor;
  const invalid = useCustom && (!Number.isInteger(minutes) || !Number(value) || minutes < limits.min || minutes > limits.max);
  const dirty = useCustom ? minutes !== (savedMinutes || 0) : Boolean(savedMinutes);

  const submit = async () => {
    if (invalid) return;
    setBusy(true);
    await onSave(useCustom ? minutes : null);
    setBusy(false);
  };

  return (
    <div style={cardStyle} data-testid={id}>
      <CardHeader icon={icon} title={title}>{description}</CardHeader>
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#334155', cursor: 'pointer' }}>
          <input type="radio" name={`${id}-mode`} checked={!useCustom} onChange={() => setUseCustom(false)} />
          Default — {defaultText}
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: '#334155', cursor: 'pointer', flexWrap: 'wrap' }}>
          <input type="radio" name={`${id}-mode`} checked={useCustom} onChange={() => setUseCustom(true)} />
          Custom:
          <input
            type="number"
            min={1}
            step={1}
            className="form-input"
            value={value}
            disabled={!useCustom}
            onChange={(e) => setValue(e.target.value)}
            aria-label={`${title} length`}
            style={{ width: 90, height: 36, fontSize: '0.82rem', borderColor: invalid ? '#fca5a5' : undefined }}
          />
          <select className="form-input" value={unit} disabled={!useCustom} onChange={(e) => setUnit(e.target.value)} aria-label="Unit" style={{ width: 120, height: 36, padding: '0 10px', fontSize: '0.82rem', lineHeight: 'normal' }}>
            {UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        </label>
        {invalid && (
          <div style={{ fontSize: '0.74rem', color: '#dc2626' }}>
            Choose between {describeMinutes(limits.min)} and {describeMinutes(limits.max)}.
          </div>
        )}
        <div><SaveButton busy={busy} disabled={!dirty || invalid} onClick={submit} /></div>
      </div>
    </div>
  );
}

export function InboxSessionSettings({ integrationId }) {
  const { data, error, save, reload } = useBotSettings(integrationId);
  if (!data) return <LoadState error={error} onRetry={reload} />;
  const { settings, defaults, limits } = data;
  const autoResume = defaults.autoResumeMinutes;

  return (
    <>
      <DurationSetting
        id="uif-session"
        icon={Timer}
        title="User Input Flow session"
        description="How long a User Input Flow waits for the subscriber's next answer. After that the form is dropped and their next message is handled like any other message (keywords, AI, No match)."
        savedMinutes={settings.uifSessionMinutes}
        defaultText={describeMinutes(defaults.uifSessionMinutes)}
        limits={limits.uifSessionMinutes}
        onSave={(minutes) => save({ uifSessionMinutes: minutes }, 'User Input Flow session saved')}
      />
      <DurationSetting
        id="chat-human-session"
        icon={Headphones}
        title="Chat with Human session"
        description="When a subscriber asks for a person (Chat with Human), the bot stays paused on that chat for this long, then answers again automatically. Resume Bot/AI in the Inbox, or the subscriber tapping Chat with bot, ends it sooner."
        savedMinutes={settings.chatHumanSessionMinutes}
        defaultText={autoResume ? `same as "Automatic resume after human takeover" (${describeMinutes(autoResume)})` : 'same as "Automatic resume after human takeover" (currently never — stays paused until resumed)'}
        limits={limits.chatHumanSessionMinutes}
        onSave={(minutes) => save({ chatHumanSessionMinutes: minutes }, 'Chat with Human session saved')}
      />
    </>
  );
}
