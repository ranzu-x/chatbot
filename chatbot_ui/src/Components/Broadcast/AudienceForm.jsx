import { useState, useEffect } from 'react';
import { contactAPI } from '../../services/api';
import { Check, Plus, X } from 'lucide-react';

// Shared audience-targeting UI — used by both the Broadcasting page
// (CampaignListPage.jsx, for TEMPLATE-mode campaigns and the "Configure &
// Send" step) and the Flow Builder's Broadcast start node (for WINDOW-mode
// campaigns, so the campaign's targeting lives right where the message
// itself is authored).

export function MultiLabelPicker({ labels, selectedIds, onChange }) {
  const toggle = (id) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };
  if (!labels.length) return <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No labels yet.</p>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {labels.map((l) => {
        const active = selectedIds.includes(l.id);
        return (
          <button
            type="button"
            key={l.id}
            onClick={() => toggle(l.id)}
            style={{
              padding: '4px 10px', borderRadius: 999, fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${active ? (l.color || '#2563eb') : 'var(--border)'}`,
              background: active ? (l.color || '#2563eb') : 'var(--bg-surface)',
              color: active ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {l.name}
          </button>
        );
      })}
    </div>
  );
}

export function ContactPicker({ platform, selectedIds, onChange }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await contactAPI.getAll({ platform, search: query, limit: 15 });
        setResults(res.data.contacts || []);
      } catch { /* ignore */ } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [query, platform]);

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

export default function AudienceForm({ platform, labels, value, onChange, previewCount }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>Include — Labels</label>
        <MultiLabelPicker labels={labels} selectedIds={value.includeLabelIds} onChange={(v) => onChange({ ...value, includeLabelIds: v })} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>Include — Specific Subscribers</label>
        <ContactPicker platform={platform} selectedIds={value.includeContacts} onChange={(v) => onChange({ ...value, includeContacts: v })} />
      </div>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>Leave both Include fields empty to target every {platform} subscriber.</p>
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>Exclude — Labels</label>
        <MultiLabelPicker labels={labels} selectedIds={value.excludeLabelIds} onChange={(v) => onChange({ ...value, excludeLabelIds: v })} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 5 }}>Exclude — Specific Subscribers</label>
        <ContactPicker platform={platform} selectedIds={value.excludeContacts} onChange={(v) => onChange({ ...value, excludeContacts: v })} />
      </div>
      <div style={{ padding: '10px 14px', background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600 }}>
        {previewCount === null ? 'Calculating audience…' : `${previewCount} subscriber${previewCount === 1 ? '' : 's'} will be targeted`}
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
