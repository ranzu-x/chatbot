import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { templateAPI } from '../../services/api';

export default function WhatsAppTemplatesPage() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [toast, setToast] = useState(null);

  // Modals & Preview
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState(null);

  // Form State
  const [form, setForm] = useState({
    templateName: '',
    language: 'en_US',
    category: 'MARKETING',
    headerType: 'NONE',
    headerText: '',
    bodyText: '',
    footerText: '',
    submitToMeta: false,
  });

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await templateAPI.getWATemplates({
        search,
        category: categoryFilter,
        status: statusFilter,
      });
      setTemplates(res.data.templates || []);
    } catch (err) {
      console.error(err);
      showToast('Failed to load WhatsApp templates', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, statusFilter]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Sync from Meta WABA
  const handleSyncFromMeta = async () => {
    setSyncing(true);
    try {
      const res = await templateAPI.syncWATemplates({});
      showToast(res.data.message || 'Synced templates from Meta');
      loadTemplates();
    } catch (err) {
      showToast(err.response?.data?.message || 'Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  // Submit Template
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await templateAPI.createWATemplate(form);
      showToast('Template created successfully');
      setShowCreateModal(false);
      setForm({
        templateName: '',
        language: 'en_US',
        category: 'MARKETING',
        headerType: 'NONE',
        headerText: '',
        bodyText: '',
        footerText: '',
        submitToMeta: false,
      });
      loadTemplates();
    } catch (err) {
      showToast(err.response?.data?.message || 'Creation failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Delete Template
  const handleDelete = async (tpl) => {
    if (!window.confirm(`Are you sure you want to delete template "${tpl.template_name}"?`)) return;
    try {
      await templateAPI.deleteWATemplate(tpl.id);
      showToast('Template deleted');
      loadTemplates();
    } catch (err) {
      showToast('Delete failed', 'error');
    }
  };

  // Variable Tag Insertion Helper
  const insertVariable = (varNum) => {
    setForm(prev => ({
      ...prev,
      bodyText: prev.bodyText + ` {{${varNum}}} `
    }));
  };

  return (
    <AppLayout>
      <div className="page-header flex justify-between items-center" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 700 }}>WhatsApp Message Templates 📱</h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Create and sync Meta WhatsApp approved broadcast templates
          </p>
        </div>

        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={handleSyncFromMeta} disabled={syncing}>
            {syncing ? '🔄 Syncing…' : '🔄 Sync from Meta WABA'}
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            + Create Template
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            padding: '12px 20px', borderRadius: 8,
            background: toast.type === 'error' ? 'var(--danger)' : 'var(--success)',
            color: '#fff', fontWeight: 500, boxShadow: 'var(--shadow-md)'
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Filters Bar */}
      <div className="card" style={{ padding: 16, marginBottom: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <input
            className="form-input w-full"
            placeholder="🔍 Search templates…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <select
            className="form-input"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ width: 150 }}
          >
            <option value="">All Categories</option>
            <option value="MARKETING">Marketing</option>
            <option value="UTILITY">Utility</option>
            <option value="AUTHENTICATION">Authentication</option>
          </select>

          <select
            className="form-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ width: 140 }}
          >
            <option value="">All Statuses</option>
            <option value="APPROVED">Approved</option>
            <option value="PENDING">Pending</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Loading WhatsApp templates…</p>
        </div>
      ) : templates.length === 0 ? (
        <div className="card" style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>📱</div>
          <h3 style={{ fontWeight: 600, marginBottom: 4 }}>No WhatsApp templates found</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: 16 }}>
            Click "Sync from Meta WABA" to import existing templates or create a new template.
          </p>
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            + Create Template
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
          {templates.map((tpl) => {
            const statusColor = tpl.status === 'APPROVED' ? 'var(--success)' : tpl.status === 'REJECTED' ? 'var(--danger)' : 'var(--warning)';
            let buttons = [];
            try {
              buttons = typeof tpl.buttons_json === 'string' ? JSON.parse(tpl.buttons_json) : (tpl.buttons_json || []);
            } catch (e) {
              buttons = [];
            }

            return (
              <div
                key={tpl.id}
                className="card"
                style={{
                  padding: 20, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                  border: '1px solid var(--border)', background: 'var(--bg-card)', borderRadius: 12
                }}
              >
                <div>
                  {/* Top Bar */}
                  <div className="flex justify-between items-center" style={{ marginBottom: 12 }}>
                    <span
                      style={{
                        padding: '2px 8px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 700,
                        color: '#fff', background: statusColor
                      }}
                    >
                      {tpl.status}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {tpl.category} • {tpl.language}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 14, wordBreak: 'break-all' }}>
                    {tpl.template_name}
                  </h3>

                  {/* WhatsApp Preview Bubble */}
                  <div
                    style={{
                      background: '#075e54', borderRadius: 12, padding: 14, color: '#fff',
                      boxShadow: 'inset 0 0 10px rgba(0,0,0,0.2)', marginBottom: 16
                    }}
                  >
                    <div style={{ background: '#e5ddd5', borderRadius: 8, padding: 12, color: '#111b21', fontSize: '0.88rem' }}>
                      {tpl.header_text && (
                        <div style={{ fontWeight: 700, marginBottom: 6, color: '#000' }}>
                          {tpl.header_text}
                        </div>
                      )}
                      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                        {tpl.body_text}
                      </div>
                      {tpl.footer_text && (
                        <div style={{ fontSize: '0.75rem', color: '#667781', marginTop: 8 }}>
                          {tpl.footer_text}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center" style={{ paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {new Date(tpl.created_at).toLocaleDateString()}
                  </span>
                  <button
                    className="btn btn-xs btn-danger"
                    onClick={() => handleDelete(tpl)}
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Template Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 560, maxWidth: '92vw', padding: 24, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 16 }}>Create WhatsApp Template</h3>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Template Name</label>
                <input
                  className="form-input w-full"
                  required
                  placeholder="e.g. order_confirmation_v1"
                  value={form.templateName}
                  onChange={e => setForm({ ...form, templateName: e.target.value })}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Use lowercase letters, numbers, and underscores only.</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Category</label>
                  <select
                    className="form-input w-full"
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                  >
                    <option value="MARKETING">Marketing</option>
                    <option value="UTILITY">Utility</option>
                    <option value="AUTHENTICATION">Authentication</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Language</label>
                  <select
                    className="form-input w-full"
                    value={form.language}
                    onChange={e => setForm({ ...form, language: e.target.value })}
                  >
                    <option value="en_US">English (US)</option>
                    <option value="es_ES">Spanish</option>
                    <option value="pt_BR">Portuguese</option>
                    <option value="fr_FR">French</option>
                    <option value="de_DE">German</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Header Text (Optional)</label>
                <input
                  className="form-input w-full"
                  placeholder="e.g. Special Offer!"
                  value={form.headerText}
                  onChange={e => setForm({ ...form, headerText: e.target.value })}
                />
              </div>

              <div>
                <div className="flex justify-between items-center" style={{ marginBottom: 4 }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Body Text (Required)</label>
                  <div className="flex gap-1">
                    <button type="button" className="btn btn-xs btn-secondary" onClick={() => insertVariable(1)}>+ `{"{{1}}"}`</button>
                    <button type="button" className="btn btn-xs btn-secondary" onClick={() => insertVariable(2)}>+ `{"{{2}}"}`</button>
                  </div>
                </div>
                <textarea
                  className="form-input w-full"
                  required
                  rows={4}
                  placeholder="Hi {{1}}, thank you for your order #{{2}}. We will notify you when it ships!"
                  value={form.bodyText}
                  onChange={e => setForm({ ...form, bodyText: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Footer Text (Optional)</label>
                <input
                  className="form-input w-full"
                  placeholder="e.g. Reply STOP to unsubscribe"
                  value={form.footerText}
                  onChange={e => setForm({ ...form, footerText: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  id="submitToMeta"
                  checked={form.submitToMeta}
                  onChange={e => setForm({ ...form, submitToMeta: e.target.checked })}
                />
                <label htmlFor="submitToMeta" style={{ fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer' }}>
                  Submit directly to Meta WABA for official approval
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Creating…' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
