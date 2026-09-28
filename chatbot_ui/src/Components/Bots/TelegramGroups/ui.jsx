import { Loader2, Save } from 'lucide-react';
import { box, hint, lbl } from './groupUi';

/* Shared building blocks for Bot Manager → Group Management (Telegram). */


export function Switch({ checked, onChange, label, disabled }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: disabled ? 'default' : 'pointer', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
      <span
        role="switch"
        aria-checked={Boolean(checked)}
        aria-label={typeof label === 'string' ? label : undefined}
        tabIndex={0}
        onKeyDown={(e) => { if (!disabled && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); onChange(!checked); } }}
        onClick={() => !disabled && onChange(!checked)}
        style={{ width: 36, height: 20, borderRadius: 999, position: 'relative', flexShrink: 0, background: checked ? 'var(--primary)' : 'var(--border)', transition: 'background .15s', opacity: disabled ? 0.6 : 1 }}
      >
        <span style={{ position: 'absolute', top: 2, left: checked ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
      </span>
      {label}
    </label>
  );
}

/** A settings section: title + switch in the header, body shown when on (or always, without a switch). */
export function Section({ title, description, enabled, onToggle, children, icon: Icon }) {
  const hasSwitch = typeof onToggle === 'function';
  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0 }}>
          {Icon && <Icon size={17} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }} />}
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: '0.9rem' }}>{title}</strong>
            {description && <p style={hint}>{description}</p>}
          </div>
        </div>
        {hasSwitch && <Switch checked={enabled} onChange={onToggle} label={enabled ? 'On' : 'Off'} />}
      </div>
      {(!hasSwitch || enabled) && children && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  );
}

export function Field({ label, children, help }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <span style={lbl}>{label}</span>}
      {children}
      {help && <p style={hint}>{help}</p>}
    </div>
  );
}

export function Select({ value, onChange, options, style }) {
  return (
    <select className="form-input" value={value} onChange={(e) => onChange(e.target.value)} style={{ minWidth: 150, ...style }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function NumberInput({ value, onChange, min, max, width = 90, suffix }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <input type="number" className="form-input" style={{ width }} min={min} max={max} value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
      {suffix && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{suffix}</span>}
    </span>
  );
}


/** URL buttons under a message (welcome / announcements). */
export function UrlButtonsEditor({ value = [], onChange, max = 6 }) {
  const list = Array.isArray(value) ? value : [];
  const set = (i, patch) => onChange(list.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  return (
    <div>
      {list.map((b, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
          <input className="form-input" style={{ flex: '1 1 140px' }} placeholder="Button text" maxLength={64} value={b.text} onChange={(e) => set(i, { text: e.target.value })} />
          <input className="form-input" style={{ flex: '2 1 200px' }} placeholder="https://…" maxLength={512} value={b.url} onChange={(e) => set(i, { url: e.target.value })} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(list.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      {list.length < max && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange([...list, { text: '', url: '' }])}>+ Add link button</button>
      )}
    </div>
  );
}


export function SaveBar({ dirty, saving, onSave, onReset }) {
  if (!dirty) return null;
  return (
    <div style={{ position: 'sticky', bottom: 0, zIndex: 2, display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 0 4px', background: 'linear-gradient(transparent, var(--bg-surface) 35%)' }}>
      <button type="button" className="btn btn-secondary" onClick={onReset} disabled={saving}>Discard</button>
      <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save changes
      </button>
    </div>
  );
}

