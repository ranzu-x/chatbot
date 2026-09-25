import { useState, useEffect, useRef, useId } from 'react';
import { contactAPI } from '../../services/api';
import { Check, Plus, X, ChevronDown, Search } from 'lucide-react';

// Shared audience-targeting UI — used by both the Broadcasting page
// (CampaignListPage.jsx, for TEMPLATE-mode campaigns and the "Configure &
// Send" step) and the Flow Builder's Broadcast start node (for WINDOW-mode
// campaigns, so the campaign's targeting lives right where the message
// itself is authored).

/**
 * Multi-select dropdown for labels: the chosen labels show as removable chips
 * inside the field; the list (with a search box) only opens on click, so a
 * workspace with many labels doesn't flood the panel.
 */
export function MultiLabelPicker({ labels, selectedIds, onChange, placeholder = 'Select labels…', ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const toggle = (id) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };
  const selected = selectedIds.map((id) => labels.find((l) => l.id === id)).filter(Boolean);
  const q = query.trim().toLowerCase();
  const visible = q ? labels.filter((l) => l.name.toLowerCase().includes(q)) : labels;

  if (!labels.length) return <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>No labels yet.</p>;

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <div
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-label={ariaLabel || placeholder}
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } }}
        style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5, minHeight: 38, padding: '5px 30px 5px 8px',
          border: `1px solid ${open ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 10, background: 'var(--bg-input, var(--bg-surface))',
          cursor: 'pointer', position: 'relative', boxShadow: open ? '0 0 0 3px var(--primary-ring)' : 'none',
        }}
      >
        {selected.length === 0 && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '0 2px' }}>{placeholder}</span>}
        {selected.map((l) => (
          <span
            key={l.id}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 4px 2px 8px', borderRadius: 999,
              fontSize: '0.74rem', fontWeight: 600, color: '#fff', background: l.color || 'var(--primary)',
            }}
          >
            {l.name}
            <button
              type="button"
              aria-label={`Remove ${l.name}`}
              onClick={(e) => { e.stopPropagation(); toggle(l.id); }}
              style={{ background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: 999, width: 16, height: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', padding: 0 }}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <ChevronDown size={15} style={{ position: 'absolute', right: 9, top: '50%', transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`, color: 'var(--text-muted)', transition: 'transform .15s' }} />
      </div>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: 'var(--bg-card, var(--bg-surface))',
            border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 10px 28px rgba(0,0,0,0.12)', overflow: 'hidden',
          }}
        >
          {labels.length > 6 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderBottom: '1px solid var(--border)' }}>
              <Search size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search labels"
                aria-label="Search labels"
                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '0.8rem', width: '100%', padding: 0, boxShadow: 'none' }}
              />
            </div>
          )}
          <div id={listId} role="listbox" aria-multiselectable="true" style={{ maxHeight: 220, overflowY: 'auto', padding: 4 }}>
            {visible.length === 0 && <div style={{ padding: '8px 10px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>No matching labels</div>}
            {visible.map((l) => {
              const active = selectedIds.includes(l.id);
              return (
                <div
                  key={l.id}
                  role="option"
                  aria-selected={active}
                  tabIndex={0}
                  onClick={() => toggle(l.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(l.id); } }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 7, cursor: 'pointer',
                    fontSize: '0.8rem', background: active ? 'var(--primary-soft)' : 'transparent',
                  }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: 99, background: l.color || 'var(--primary)', flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
                  {active && <Check size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function ContactPicker({ platform, integrationId, selectedIds, onChange }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await contactAPI.getAll({ platform, search: query, limit: 15, ...(integrationId ? { integrationId } : {}) });
        setResults(res.data.contacts || []);
      } catch { /* ignore */ } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query, platform, integrationId]);

  const toggle = (c) => {
    onChange(selectedIds.some((x) => x.id === c.id) ? selectedIds.filter((x) => x.id !== c.id) : [...selectedIds, { id: c.id, name: c.name || c.phone || c.external_id }]);
  };

  return (
    <div>
      <input
        className="form-input w-full"
        placeholder="Search subscribers by name, phone, email…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      {searching && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>Searching…</div>}
      {results.length > 0 && (
        <div style={{ marginTop: 6, maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          {results.map((c) => (
            <div
              key={c.id}
              onClick={() => toggle(c)}
              style={{ padding: '6px 10px', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', background: selectedIds.some((x) => x.id === c.id) ? 'rgba(37,99,235,0.08)' : 'transparent' }}
            >
              <span>{c.name || c.phone || c.external_id}</span>
              {selectedIds.some((x) => x.id === c.id) ? <Check size={14} /> : <Plus size={14} />}
            </div>
          ))}
        </div>
      )}
      {selectedIds.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {selectedIds.map((c) => (
            <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, background: 'var(--bg-surface)', border: '1px solid var(--border)', fontSize: '0.75rem' }}>
              {c.name}
              <button type="button" onClick={() => onChange(selectedIds.filter((x) => x.id !== c.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', padding: 0 }}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AudienceForm({ platform, integrationId = null, labels, value, onChange, previewCount }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>Include — Labels</label>
        <MultiLabelPicker labels={labels} selectedIds={value.includeLabelIds} onChange={(v) => onChange({ ...value, includeLabelIds: v })} placeholder="Select labels to include…" ariaLabel="Include labels" />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>Include — Specific Subscribers</label>
        <ContactPicker platform={platform} integrationId={integrationId} selectedIds={value.includeContacts} onChange={(v) => onChange({ ...value, includeContacts: v })} />
      </div>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>Leave both Include fields empty to target every eligible subscriber of this bot account.</p>
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>Exclude — Labels</label>
        <MultiLabelPicker labels={labels} selectedIds={value.excludeLabelIds} onChange={(v) => onChange({ ...value, excludeLabelIds: v })} placeholder="Select labels to exclude…" ariaLabel="Exclude labels" />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>Exclude — Specific Subscribers</label>
        <ContactPicker platform={platform} integrationId={integrationId} selectedIds={value.excludeContacts} onChange={(v) => onChange({ ...value, excludeContacts: v })} />
      </div>
      <div aria-live="polite" style={{ padding: '10px 14px', background: 'var(--primary-soft)', border: '1px solid var(--primary-ring)', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600 }}>
        {previewCount === null ? 'Calculating audience…' : `${Number(previewCount).toLocaleString()} subscriber${previewCount === 1 ? '' : 's'} will be targeted`}
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>Attach a label when sent (optional)</label>
        <select className="form-input w-full" value={value.tagLabelId || ''} onChange={(e) => onChange({ ...value, tagLabelId: e.target.value || null })}>
          <option value="">— No label —</option>
          {labels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>Every subscriber this broadcast successfully sends to gets tagged with this label — useful for excluding them from the next campaign.</p>
      </div>
    </div>
  );
}
