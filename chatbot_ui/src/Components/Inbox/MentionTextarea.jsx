import { useState, useRef } from 'react';

/**
 * Textarea with @mentions of teammates. Typing "@" shows the team; picking
 * someone inserts "@Name " and remembers their user id. `onMentionsChange`
 * gets the ids still present in the text (chatbot_api/routes/contacts.js
 * notifies them when the note is saved).
 */
export default function MentionTextarea({ value, onChange, people, onMentionsChange, ...rest }) {
  const [query, setQuery] = useState(null); // text after "@" while picking
  const [picked, setPicked] = useState([]); // [{ id, name }]
  const ref = useRef(null);

  const report = (text, list) => onMentionsChange?.(list.filter((p) => text.includes(`@${p.name}`)).map((p) => p.id));

  const handleChange = (e) => {
    const text = e.target.value;
    onChange(text);
    const upto = text.slice(0, e.target.selectionStart);
    const m = upto.match(/@([^\s@]{0,30})$/);
    setQuery(m ? m[1].toLowerCase() : null);
    report(text, picked);
  };

  const choose = (person) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@[^\s@]{0,30}$/, `@${person.name} `);
    const text = before + value.slice(caret);
    const list = picked.some((p) => p.id === person.id) ? picked : [...picked, { id: person.id, name: person.name }];
    setPicked(list);
    setQuery(null);
    onChange(text);
    report(text, list);
    setTimeout(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); }, 0);
  };

  const matches = query === null ? [] : (people || []).filter((p) => p.name && p.name.toLowerCase().includes(query)).slice(0, 6);

  return (
    <div style={{ position: 'relative' }}>
      <textarea ref={ref} value={value} onChange={handleChange} onBlur={() => setTimeout(() => setQuery(null), 150)} {...rest} />
      {matches.length > 0 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 6px 18px rgba(15,23,42,0.12)', marginTop: 2 }}>
          {matches.map((p) => (
            <button key={p.id} type="button" onMouseDown={(e) => { e.preventDefault(); choose(p); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>
              @{p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
