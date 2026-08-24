import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { channelAPI } from '../../services/api';

const BACKEND_URL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:5000';

export default function WebchatPage() {
  const [widgets, setWidgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [embedModal, setEmbedModal] = useState(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ name: '', primaryColor: '#6366f1', greetingMessage: 'Hello! How can we help you today?', placeholderText: 'Type a message…', allowedDomains: '' });

  useEffect(() => { fetchWidgets(); }, []);

  const fetchWidgets = async () => {
    setLoading(true);
    try { const res = await channelAPI.getWebchat(); setWidgets(res.data.widgets || []); }
    catch { showToast('Failed to load', 'error'); } finally { setLoading(false); }
  };

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  const handleCreate = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await channelAPI.addWebchat(form);
      showToast('Widget created!');
      setShowModal(false);
      setForm({ name: '', primaryColor: '#6366f1', greetingMessage: 'Hello! How can we help you today?', placeholderText: 'Type a message…', allowedDomains: '' });
      fetchWidgets();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this widget?')) return;
    try { await channelAPI.deleteWebchat(id); showToast('Widget deleted'); fetchWidgets(); }
    catch { showToast('Failed', 'error'); }
  };

  const getEmbedCode = (key) => `<script src="${BACKEND_URL}/widget.js" data-key="${key}"></script>`;

  const copyEmbed = (key) => {
    navigator.clipboard.writeText(getEmbedCode(key));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AppLayout>
      {toast && <div className="toast-container"><div className={`toast ${toast.type}`}>{toast.type === 'success' ? '✅' : '❌'} {toast.msg}</div></div>}

      {/* Embed Modal */}
      {embedModal && (
        <div className="modal-overlay" onClick={() => setEmbedModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🌐 Embed Code — {embedModal.name}</div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
              Paste this snippet before the closing <code>&lt;/body&gt;</code> tag of your website:
            </p>
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all', position: 'relative' }}>
              {getEmbedCode(embedModal.widget_key)}
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setEmbedModal(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => copyEmbed(embedModal.widget_key)}>
                {copied ? '✅ Copied!' : '📋 Copy Code'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🌐 Create Webchat Widget</div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group"><label className="form-label">Widget Name *</label><input className="form-input" placeholder="e.g. My Website Chat" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
              <div className="form-group">
                <label className="form-label">Primary Color</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))} style={{ width: 48, height: 36, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
                  <input className="form-input" value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))} style={{ flex: 1 }} />
                </div>
              </div>
              <div className="form-group"><label className="form-label">Greeting Message</label><textarea className="form-input" rows={2} value={form.greetingMessage} onChange={e => setForm(f => ({ ...f, greetingMessage: e.target.value }))} style={{ resize: 'vertical' }} /></div>
              <div className="form-group"><label className="form-label">Placeholder Text</label><input className="form-input" value={form.placeholderText} onChange={e => setForm(f => ({ ...f, placeholderText: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Allowed Domains</label><input className="form-input" placeholder="e.g. mysite.com (empty = allow all)" value={form.allowedDomains} onChange={e => setForm(f => ({ ...f, allowedDomains: e.target.value }))} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : '✅ Create Widget'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="page-header">
        <div className="flex items-center justify-between">
          <div><h1 className="page-title">🌐 Webchat</h1><p className="page-subtitle">Add a live chat widget to any website</p></div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>➕ Create Widget</button>
        </div>
      </div>

      <div className="page-body">
        {loading ? <div className="loading-overlay"><div className="loading-spinner" /></div>
          : widgets.length === 0 ? (
            <div className="empty-state" style={{ paddingTop: 80 }}>
              <div className="empty-icon">🌐</div>
              <div className="empty-title">No webchat widgets yet</div>
              <div className="empty-desc">Create your first widget to add live chat to your website</div>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowModal(true)}>➕ Create Widget</button>
            </div>
          ) : (
            <div className="grid-3">
              {widgets.map(w => (
                <div key={w.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-10">
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: w.primary_color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>🌐</div>
                      <span className="font-semibold">{w.name}</span>
                    </div>
                    <span className={`badge ${w.is_active ? 'badge-success' : 'badge-muted'}`}>{w.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>"{w.greeting_message}"</div>
                  <div style={{ background: 'var(--bg-hover)', borderRadius: 6, padding: '6px 10px', fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                    Key: {w.widget_key}
                  </div>
                  <div className="flex gap-2" style={{ marginTop: 'auto' }}>
                    <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setEmbedModal(w)}>📋 Embed Code</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(w.id)}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </AppLayout>
  );
}
