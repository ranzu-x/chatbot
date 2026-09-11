import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { cannedResponseAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import { MessageSquareText, Plus, Trash2, Edit3 } from 'lucide-react';

const EMPTY_FORM = { title: '', shortcut: '', body: '' };

export default function CannedResponsesPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    cannedResponseAPI.getAll()
      .then((res) => setItems(res.data?.cannedResponses || []))
      .catch(() => notify.error('Failed to load canned responses'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEdit = (item) => { setEditing(item); setForm({ title: item.title, shortcut: item.shortcut || '', body: item.body }); setShowModal(true); };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) return;
    setSaving(true);
    const action = editing ? cannedResponseAPI.update(editing.id, form) : cannedResponseAPI.create(form);
    action
      .then(() => { notify.success(editing ? 'Updated' : 'Created'); setShowModal(false); load(); })
      .catch((err) => notify.error(err?.response?.data?.message || 'Failed to save'))
      .finally(() => setSaving(false));
  };

  const handleDelete = (item) => {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    cannedResponseAPI.delete(item.id).then(() => load()).catch(() => notify.error('Failed to delete'));
  };

  return (
    <AppLayout>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">Canned Responses</h1>
          <p className="page-subtitle">Saved replies agents can insert with a "/" shortcut in the Live Inbox composer — never sent automatically.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> New Canned Response
        </button>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-overlay"><div className="loading-spinner" /></div>
        ) : items.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No canned responses yet.</div>
        ) : (
          <div className="grid-3">
            {items.map((item) => (
              <div key={item.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(37,99,235,0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MessageSquareText size={16} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{item.title}</div>
                      {item.shortcut && <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--primary)' }}>/{item.shortcut}</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="bs-action-btn" onClick={() => openEdit(item)} title="Edit"><Edit3 size={13} /></button>
                    <button className="bs-action-btn delete" onClick={() => handleDelete(item)} title="Delete"><Trash2 size={13} color="#ef4444" /></button>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, maxHeight: 60, overflow: 'hidden' }}>{item.body}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 460, maxWidth: '92vw', background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 0 }}>{editing ? 'Edit' : 'New'} Canned Response</h3>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Name</label>
                <input className="form-input w-full" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Greeting" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Shortcut (optional)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 700 }}>/</span>
                  <input className="form-input w-full" value={form.shortcut} onChange={(e) => setForm((f) => ({ ...f, shortcut: e.target.value }))} placeholder="greeting" />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Message</label>
                <textarea className="form-input w-full" required rows={4} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} style={{ resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
