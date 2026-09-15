import { useState } from 'react';
import { X, Tag, ListChecks, SlidersHorizontal, Plus, Edit2, Trash2 } from 'lucide-react';

const TABS = [
  { key: 'labels', label: 'Labels', icon: Tag },
  { key: 'lists', label: 'Lists', icon: ListChecks },
  { key: 'fields', label: 'Custom Fields', icon: SlidersHorizontal },
];

const FIELD_TYPES = ['TEXT', 'NUMBER', 'DATE', 'SELECT'];

function ModalShell({ title, subtitle, onClose, children, width = 620 }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(2px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width, maxWidth: '94vw', background: 'var(--bg-surface)', borderRadius: 14, padding: 22,
          boxShadow: 'var(--shadow-md)', border: '1px solid var(--border)', maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <h3 style={{ fontSize: '1.08rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
            {subtitle && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EmptyRow({ children }) {
  return <div style={{ padding: '22px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>{children}</div>;
}

const rowStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px',
  borderRadius: 8, background: 'var(--bg-base)', border: '1px solid var(--border)',
};

const iconBtnStyle = {
  padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)',
  color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
};

// ─── LABELS TAB ───────────────────────────────────────────────────────────
function LabelsTab({ labels, labelAPI, onChanged, showToast }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#64748b');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const reset = () => { setName(''); setColor('#64748b'); setEditing(null); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) await labelAPI.update(editing.id, { name: name.trim(), color });
      else await labelAPI.create({ name: name.trim(), color });
      showToast(editing ? 'Label updated' : 'Label created');
      reset();
      onChanged();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save label', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this label? It will be removed from every subscriber.')) return;
    try {
      await labelAPI.delete(id);
      showToast('Label deleted');
      onChanged();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete label', 'error');
    }
  };

  return (
    <>
      <form onSubmit={handleSave} style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
          {editing ? 'Edit label' : 'Create a label'} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>— what a subscriber IS (VIP, Hot Lead)</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text" required placeholder="e.g. VIP Customer" value={name}
            onChange={(e) => setName(e.target.value)} className="form-input"
            style={{ flex: 1, height: 34, fontSize: '0.82rem' }}
          />
          <input
            type="color" value={color} onChange={(e) => setColor(e.target.value)}
            title="Accent color (used only as a small dot)"
            style={{ width: 34, height: 34, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2, background: 'var(--bg-surface)' }}
          />
          <button type="submit" disabled={saving || !name.trim()} className="btn btn-primary btn-sm" style={{ height: 34, padding: '0 14px' }}>
            {saving ? 'Saving...' : editing ? 'Update' : 'Add'}
          </button>
          {editing && <button type="button" onClick={reset} className="btn btn-secondary btn-sm" style={{ height: 34 }}>Cancel</button>}
        </div>
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', maxHeight: 320 }}>
        {labels.length === 0 ? (
          <EmptyRow>No labels yet — add one above.</EmptyRow>
        ) : labels.map((lbl) => (
          <div key={lbl.id} style={rowStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: lbl.color, flexShrink: 0 }} />
              <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>{lbl.name}</span>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{lbl.subscriberCount || 0} subscriber(s)</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => { setEditing(lbl); setName(lbl.name); setColor(lbl.color || '#64748b'); }} style={iconBtnStyle} title="Edit"><Edit2 size={12} /></button>
              <button type="button" onClick={() => handleDelete(lbl.id)} style={iconBtnStyle} title="Delete"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── LISTS TAB ────────────────────────────────────────────────────────────
function ListsTab({ lists, contactListAPI, onChanged, showToast }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const reset = () => { setName(''); setDescription(''); setEditing(null); };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) await contactListAPI.update(editing.id, { name: name.trim(), description });
      else await contactListAPI.create({ name: name.trim(), description });
      showToast(editing ? 'List updated' : 'List created');
      reset();
      onChanged();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save list', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this list? Subscribers stay — only the grouping is removed.')) return;
    try {
      await contactListAPI.delete(id);
      showToast('List deleted');
      onChanged();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete list', 'error');
    }
  };

  return (
    <>
      <form onSubmit={handleSave} style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
          {editing ? 'Edit list' : 'Create a list'} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>— a group you build (an import batch, a hand-picked audience)</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            type="text" required placeholder="e.g. Webinar Sept Attendees" value={name}
            onChange={(e) => setName(e.target.value)} className="form-input" style={{ height: 34, fontSize: '0.82rem' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text" placeholder="Description (optional)" value={description}
              onChange={(e) => setDescription(e.target.value)} className="form-input" style={{ flex: 1, height: 34, fontSize: '0.82rem' }}
            />
            <button type="submit" disabled={saving || !name.trim()} className="btn btn-primary btn-sm" style={{ height: 34, padding: '0 14px' }}>
              {saving ? 'Saving...' : editing ? 'Update' : 'Add'}
            </button>
            {editing && <button type="button" onClick={reset} className="btn btn-secondary btn-sm" style={{ height: 34 }}>Cancel</button>}
          </div>
        </div>
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', maxHeight: 320 }}>
        {lists.length === 0 ? (
          <EmptyRow>No lists yet — add one above.</EmptyRow>
        ) : lists.map((l) => (
          <div key={l.id} style={rowStyle}>
            <div>
              <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>{l.name}</div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 1 }}>
                {l.memberCount || 0} subscriber(s){l.description ? ` · ${l.description}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => { setEditing(l); setName(l.name); setDescription(l.description || ''); }} style={iconBtnStyle} title="Edit"><Edit2 size={12} /></button>
              <button type="button" onClick={() => handleDelete(l.id)} style={iconBtnStyle} title="Delete"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── CUSTOM FIELDS TAB ────────────────────────────────────────────────────
function CustomFieldsTab({ fields, customFieldAPI, onChanged, showToast }) {
  const [name, setName] = useState('');
  const [fieldType, setFieldType] = useState('TEXT');
  const [optionsText, setOptionsText] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const options = fieldType === 'SELECT' ? optionsText.split(',').map((o) => o.trim()).filter(Boolean) : [];
      await customFieldAPI.create({ name: name.trim(), fieldType, options });
      showToast('Custom field created');
      setName(''); setFieldType('TEXT'); setOptionsText('');
      onChanged();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save custom field', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this custom field? Its saved values stay on each subscriber but the field disappears from forms.')) return;
    try {
      await customFieldAPI.delete(id);
      showToast('Custom field removed');
      onChanged();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to remove custom field', 'error');
    }
  };

  return (
    <>
      <form onSubmit={handleSave} style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
          Create a custom field <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>— extra data collected per subscriber</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: fieldType === 'SELECT' ? 8 : 0 }}>
          <input
            type="text" required placeholder="e.g. Company Size" value={name}
            onChange={(e) => setName(e.target.value)} className="form-input" style={{ flex: 1, height: 34, fontSize: '0.82rem' }}
          />
          <select value={fieldType} onChange={(e) => setFieldType(e.target.value)} className="form-input" style={{ height: 34, fontSize: '0.82rem', width: 130 }}>
            {FIELD_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
          </select>
          <button type="submit" disabled={saving || !name.trim()} className="btn btn-primary btn-sm" style={{ height: 34, padding: '0 14px' }}>
            {saving ? 'Saving...' : 'Add'}
          </button>
        </div>
        {fieldType === 'SELECT' && (
          <input
            type="text" placeholder="Options, comma-separated (e.g. Small, Medium, Large)" value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)} className="form-input" style={{ width: '100%', height: 34, fontSize: '0.82rem' }}
          />
        )}
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', maxHeight: 320 }}>
        {fields.length === 0 ? (
          <EmptyRow>No custom fields yet — add one above.</EmptyRow>
        ) : fields.map((f) => (
          <div key={f.id} style={rowStyle}>
            <div>
              <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>{f.name}</div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 1 }}>
                {f.field_type}{f.field_type === 'SELECT' && Array.isArray(f.options) && f.options.length ? ` · ${f.options.join(', ')}` : ''}
              </div>
            </div>
            <button type="button" onClick={() => handleDelete(f.id)} style={iconBtnStyle} title="Remove"><Trash2 size={12} /></button>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── SHELL: TABBED MANAGE MODAL ───────────────────────────────────────────
export default function ManageModal({ onClose, labels, lists, fields, labelAPI, contactListAPI, customFieldAPI, onChanged, showToast, initialTab = 'labels' }) {
  const [tab, setTab] = useState(initialTab);

  return (
    <ModalShell title="Manage Subscribers" subtitle="Labels, lists, and custom fields are shared across every channel." onClose={onClose}>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', fontSize: '0.82rem',
                fontWeight: active ? 700 : 500, border: 'none', background: 'none', cursor: 'pointer',
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                borderBottom: active ? '2px solid var(--text-primary)' : '2px solid transparent',
              }}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'labels' && <LabelsTab labels={labels} labelAPI={labelAPI} onChanged={onChanged} showToast={showToast} />}
      {tab === 'lists' && <ListsTab lists={lists} contactListAPI={contactListAPI} onChanged={onChanged} showToast={showToast} />}
      {tab === 'fields' && <CustomFieldsTab fields={fields} customFieldAPI={customFieldAPI} onChanged={onChanged} showToast={showToast} />}
    </ModalShell>
  );
}
