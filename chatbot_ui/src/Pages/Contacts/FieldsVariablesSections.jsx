import { useCallback, useEffect, useState } from 'react';
import { Lock, Edit2, Trash2, Copy, Loader2 } from 'lucide-react';
import { workspaceVariableAPI } from '../../services/api';
import { alert } from '../../lib/alerts';

/**
 * Subscriber Manager → Fields & Variables: the System fields list (read-only,
 * chatbot_api/utils/systemFields.js) and the workspace Variables manager
 * ({{var.key}}, chatbot_api/routes/workspaceVariables.js). Custom fields stay in
 * ManageModal's CustomFieldsTab.
 */

const rowStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 12px',
  borderRadius: 8, background: 'var(--bg-base)', border: '1px solid var(--border)',
};
const iconBtnStyle = {
  padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)',
  color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
};

function copyText(text, showToast) {
  navigator.clipboard?.writeText(text).then(() => showToast(`Copied ${text}`)).catch(() => {});
}

export function SystemFieldsSection({ showToast }) {
  const [fields, setFields] = useState(null);
  useEffect(() => {
    workspaceVariableAPI.systemFields()
      .then((res) => setFields(res.data?.fields || []))
      .catch(() => setFields([]));
  }, []);

  return (
    <>
      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Built-in fields every subscriber has. They can&apos;t be renamed or removed. Use them in messages, or pick them in a
        Question / Collect Input element to save an answer straight into the subscriber&apos;s profile.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {!fields ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /></div>
        ) : fields.map((f) => (
          <div key={f.key} style={rowStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <Lock size={13} color="var(--text-muted)" aria-label="Protected" />
              <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>{f.label}</span>
              <span style={{ fontSize: '0.72rem', padding: '1px 7px', borderRadius: 999, background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                System · {f.type === 'NUMBER' ? 'Number' : 'Text'}
              </span>
            </div>
            <button type="button" style={iconBtnStyle} onClick={() => copyText(f.placeholder, showToast)} title="Copy placeholder">
              <code style={{ fontSize: '0.72rem', marginRight: 6 }}>{f.placeholder}</code><Copy size={11} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

export function VariablesSection({ showToast }) {
  const [variables, setVariables] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ name: '', value: '', description: '' });
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoadError('');
    workspaceVariableAPI.getAll()
      .then((res) => setVariables(res.data?.variables || []))
      .catch((err) => { setVariables([]); setLoadError(err?.response?.data?.message || 'Could not load variables'); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const reset = () => { setForm({ name: '', value: '', description: '' }); setEditing(null); };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) await workspaceVariableAPI.update(editing.id, form);
      else await workspaceVariableAPI.create(form);
      showToast(editing ? 'Variable updated' : 'Variable created');
      reset();
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save variable', 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (v) => {
    if (!(await alert.ask(`Delete the variable {{var.${v.var_key}}}?`))) return;
    try {
      await workspaceVariableAPI.delete(v.id);
      showToast('Variable deleted');
      load();
    } catch (err) {
      if (err.response?.data?.code === 'VARIABLE_IN_USE') {
        if (!(await alert.confirm({
          title: 'Delete anyway?',
          text: `${err.response.data.message}. Those messages will show nothing in its place.`,
          confirm: 'Delete anyway',
        }))) return;
        try {
          await workspaceVariableAPI.delete(v.id, true);
          showToast('Variable deleted');
          load();
        } catch (e2) {
          showToast(e2.response?.data?.message || 'Failed to delete variable', 'error');
        }
        return;
      }
      showToast(err.response?.data?.message || 'Failed to delete variable', 'error');
    }
  };

  return (
    <>
      <form onSubmit={submit} style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
          {editing ? <>Edit <code>{`{{var.${editing.var_key}}}`}</code></> : 'Create a variable'}
          <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> — one value for the whole workspace (support phone, store link…)</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <input
            type="text" required maxLength={100} placeholder="Name, e.g. Support phone" value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="form-input"
            style={{ flex: 1, minWidth: 160, height: 34, fontSize: '0.82rem' }}
          />
          <input
            type="text" maxLength={2000} placeholder="Value" value={form.value}
            onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} className="form-input"
            style={{ flex: 2, minWidth: 180, height: 34, fontSize: '0.82rem' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text" maxLength={255} placeholder="Description (optional)" value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="form-input"
            style={{ flex: 1, height: 34, fontSize: '0.82rem' }}
          />
          <button type="submit" disabled={saving || !form.name.trim()} className="btn btn-primary btn-sm" style={{ height: 34, padding: '0 14px' }}>
            {saving ? 'Saving...' : editing ? 'Update' : 'Add'}
          </button>
          {editing && <button type="button" onClick={reset} className="btn btn-secondary btn-sm" style={{ height: 34 }}>Cancel</button>}
        </div>
      </form>

      {loadError && <div style={{ fontSize: '0.8rem', color: 'var(--danger, #dc2626)', marginBottom: 8 }}>{loadError}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto', maxHeight: 300 }}>
        {!variables ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)' }}><Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} /></div>
        ) : variables.length === 0 ? (
          <div style={{ padding: '22px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>No variables yet — add one above.</div>
        ) : variables.map((v) => (
          <div key={v.id} style={rowStyle}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>{v.name}</div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380 }}>
                <code style={{ fontSize: '0.72rem' }}>{`{{var.${v.var_key}}}`}</code> = {v.value ? `"${v.value}"` : <i>empty</i>}
                {v.description ? ` · ${v.description}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button type="button" onClick={() => copyText(`{{var.${v.var_key}}}`, showToast)} style={iconBtnStyle} title="Copy placeholder"><Copy size={12} /></button>
              <button type="button" onClick={() => { setEditing(v); setForm({ name: v.name, value: v.value || '', description: v.description || '' }); }} style={iconBtnStyle} title="Edit"><Edit2 size={12} /></button>
              <button type="button" onClick={() => remove(v)} style={iconBtnStyle} title="Delete"><Trash2 size={12} /></button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
