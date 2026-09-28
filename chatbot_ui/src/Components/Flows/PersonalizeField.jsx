import { useEffect, useMemo, useRef, useState } from 'react';
import { Braces, Search, User, SlidersHorizontal, Variable } from 'lucide-react';
import { workspaceVariableAPI } from '../../services/api';
import { charCount } from '../../utils/flowChannelRules';

/**
 * A Flow Builder text field with a "Personalize" menu that inserts subscriber
 * data at the cursor: their name (full / first / last), email, phone, age, any
 * custom field ({{field.<key>}}) and workspace variables ({{var.<key>}}).
 * Filled per subscriber when the message is sent
 * (chatbot_api/utils/personalize.js). An optional "if empty" text becomes a
 * fallback: {{contact.first_name|there}}.
 * Used for message texts, captions, headers and titles — never for buttons.
 */

const SUBSCRIBER_TOKENS = [
  { token: 'contact.name', label: 'Full name' },
  { token: 'contact.first_name', label: 'First name' },
  { token: 'contact.last_name', label: 'Last name' },
  { token: 'contact.email', label: 'Email' },
  { token: 'contact.phone', label: 'Phone' },
  { token: 'contact.age', label: 'Age' },
];

let variablesCache = null; // workspace variables, loaded once per page

function Menu({ fields, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [fallback, setFallback] = useState('');
  const [variables, setVariables] = useState(variablesCache);
  const boxRef = useRef(null);

  useEffect(() => {
    if (variablesCache) return undefined;
    let alive = true;
    workspaceVariableAPI.getAll()
      .then((res) => { variablesCache = res.data?.variables || []; if (alive) setVariables(variablesCache); })
      .catch(() => { if (alive) setVariables([]); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const needle = q.trim().toLowerCase();
  const match = (label, key) => !needle || label.toLowerCase().includes(needle) || String(key).toLowerCase().includes(needle);
  const groups = [
    { title: 'Subscriber', icon: User, items: SUBSCRIBER_TOKENS.filter((t) => match(t.label, t.token)).map((t) => ({ ...t, canFallback: true })) },
    { title: 'Custom fields', icon: SlidersHorizontal, items: (fields || []).filter((f) => match(f.name, f.field_key)).map((f) => ({ token: `field.${f.field_key}`, label: f.name, canFallback: true })) },
    { title: 'Workspace variables', icon: Variable, items: (variables || []).filter((v) => match(v.name, v.var_key)).map((v) => ({ token: `var.${v.var_key}`, label: v.name, canFallback: false })) },
  ];

  const pick = (item) => {
    const fb = fallback.trim().replace(/[{}|]/g, '');
    onPick(`{{${item.token}${item.canFallback && fb ? `|${fb}` : ''}}}`);
  };

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label="Insert subscriber data"
      style={{
        position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50, width: 270, background: '#fff',
        border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 12px 30px rgba(15,23,42,0.16)', overflow: 'hidden',
      }}
    >
      <div style={{ padding: 8, borderBottom: '1px solid #f1f5f9', display: 'grid', gap: 6 }}>
        <div style={{ position: 'relative' }}>
          <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fields…"
            style={{ width: '100%', padding: '5px 8px 5px 24px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, boxSizing: 'border-box' }} />
        </div>
        <input value={fallback} onChange={(e) => setFallback(e.target.value)} maxLength={40} placeholder="If empty, show… (optional, e.g. there)"
          style={{ width: '100%', padding: '5px 8px', fontSize: 11.5, border: '1px solid #e2e8f0', borderRadius: 6, boxSizing: 'border-box' }} />
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto', padding: '4px 0' }}>
        {groups.map((g) => {
          const Icon = g.icon;
          return (
            <div key={g.title}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px 3px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>
                <Icon size={11} /> {g.title}
              </div>
              {g.items.length === 0 ? (
                <div style={{ padding: '3px 10px 6px', fontSize: 11, color: '#cbd5e1' }}>
                  {g.title === 'Workspace variables' && !variables ? 'Loading…' : needle ? 'No match' : g.title === 'Custom fields' ? 'No custom fields yet — create them in Subscribers → Fields & Variables' : 'None yet'}
                </div>
              ) : g.items.map((item) => (
                <button
                  key={item.token}
                  type="button"
                  onClick={() => pick(item)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12, color: '#0f172a' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#eff6ff'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                  <code style={{ fontSize: 10, color: '#64748b', flexShrink: 0 }}>{`{{${item.token}}}`}</code>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PersonalizeField({ as = 'textarea', value, onChange, fields = [], limit = null, ...rest }) {
  const ref = useRef(null);
  const caret = useRef(null);
  const [open, setOpen] = useState(false);
  const Tag = as;
  const text = value || '';
  const count = useMemo(() => charCount(text), [text]);

  const remember = () => {
    const el = ref.current;
    if (el) caret.current = [el.selectionStart ?? text.length, el.selectionEnd ?? text.length];
  };

  const insert = (token) => {
    const [start, end] = caret.current || [text.length, text.length];
    const next = text.slice(0, start) + token + text.slice(end);
    onChange(next);
    setOpen(false);
    const pos = start + token.length;
    caret.current = [pos, pos];
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      try { el.setSelectionRange(pos, pos); } catch { /* inputs of some types don't support it */ }
    });
  };

  return (
    <div style={{ position: 'relative' }}>
      <Tag
        ref={ref}
        value={text}
        onChange={(e) => { onChange(e.target.value); caret.current = [e.target.selectionStart, e.target.selectionEnd]; }}
        onSelect={remember}
        onKeyUp={remember}
        onClick={remember}
        {...rest}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 3, position: 'relative' }}>
        <span style={{ fontSize: 10, color: limit && count > limit ? '#dc2626' : '#94a3b8', fontWeight: limit && count > limit ? 700 : 500 }}>
          {limit ? `${count}/${limit}` : ''}
        </span>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); remember(); }}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="dialog"
          aria-expanded={open}
          title="Insert the subscriber's name, a custom field or a variable"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, cursor: 'pointer' }}
        >
          <Braces size={11} /> Personalize
        </button>
        {open && <Menu fields={fields} onPick={insert} onClose={() => setOpen(false)} />}
      </div>
    </div>
  );
}
