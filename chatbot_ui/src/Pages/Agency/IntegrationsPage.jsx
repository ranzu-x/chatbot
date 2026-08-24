import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { integrationAPI } from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';

const PLATFORMS = ['WHATSAPP', 'FACEBOOK', 'INSTAGRAM'];

const PLATFORM_META = {
  WHATSAPP:  { icon: '📱', color: 'var(--whatsapp)',   label: 'WhatsApp',  badgeClass: 'badge-wa' },
  FACEBOOK:  { icon: '📘', color: 'var(--facebook)',   label: 'Facebook',  badgeClass: 'badge-fb' },
  INSTAGRAM: { icon: '📸', color: 'var(--instagram)',  label: 'Instagram', badgeClass: 'badge-ig' },
};

const EMPTY_FORM = {
  platform:      'WHATSAPP',
  name:          '',
  accessToken:   '',
  verifyToken:   '',
  // WA
  waPhoneNumberId:   '',
  waBusinessAccId:   '',
  // FB
  fbPageId:      '',
  fbPageName:    '',
  // IG
  igAccountId:   '',
  igUsername:    '',
};

export default function IntegrationsPage() {
  const { user }                  = useAuth();
  const [integrations, setIntegrations] = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState('');

  const loadIntegrations = async () => {
    setLoading(true);
    try {
      const res = await integrationAPI.getAll();
      setIntegrations(res.data.integrations || res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadIntegrations(); }, []);

  const openModal  = () => { setForm(EMPTY_FORM); setFormError(''); setShowModal(true); };
  const closeModal = () => setShowModal(false);

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      await integrationAPI.create(form);
      await loadIntegrations();
      closeModal();
    } catch (err) {
      setFormError(err?.response?.data?.message || 'Failed to create integration.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this integration?')) return;
    try {
      await integrationAPI.delete(id);
      setIntegrations((prev) => prev.filter((i) => (i._id || i.id) !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const agencyId = user?.agencyId || user?.agency?._id || 'AGENCY_ID';

  return (
    <AppLayout>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Integrations</h1>
            <p className="page-subtitle">Connect WhatsApp, Facebook, and Instagram channels</p>
          </div>
          <button className="btn btn-primary" onClick={openModal}>+ Add Integration</button>
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-overlay">
            <div className="loading-spinner" style={{ width: 40, height: 40 }} />
          </div>
        ) : integrations.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔌</div>
            <div className="empty-title">No integrations yet</div>
            <div className="empty-desc">Add a WhatsApp, Facebook, or Instagram channel to get started.</div>
          </div>
        ) : (
          <div className="grid-3">
            {integrations.map((intg) => {
              const id   = intg._id || intg.id;
              const meta = PLATFORM_META[intg.platform] || PLATFORM_META.WHATSAPP;
              const webhookUrl = `POST /api/v1/webhook/${agencyId}/${id}`;
              return (
                <div key={id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Header */}
                  <div className="flex items-center gap-3">
                    <div
                      style={{
                        width: 44, height: 44, borderRadius: 12,
                        background: `${meta.color}22`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.4rem',
                      }}
                    >
                      {meta.icon}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="font-semibold">{intg.name}</div>
                      <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
                    </div>
                    <span className={`badge ${intg.isActive !== false ? 'badge-success' : 'badge-danger'}`}>
                      {intg.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {/* Webhook hint */}
                  <div
                    style={{
                      background: 'var(--bg-input)', borderRadius: 8, padding: '8px 10px',
                      fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace',
                      wordBreak: 'break-all',
                    }}
                  >
                    🔗 {webhookUrl}
                  </div>

                  <button
                    className="btn btn-sm btn-danger"
                    style={{ alignSelf: 'flex-end' }}
                    onClick={() => handleDelete(id)}
                  >
                    🗑 Delete
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" style={{ maxWidth: 540, maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 className="modal-title">Add Integration</h2>
            {formError && <div className="login-error" style={{ marginBottom: 16 }}>{formError}</div>}

            <form onSubmit={handleCreate}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Platform */}
                <div className="form-group">
                  <label className="form-label">Platform *</label>
                  <select name="platform" className="form-input" value={form.platform} onChange={handleChange}>
                    {PLATFORMS.map((p) => (
                      <option key={p} value={p}>{PLATFORM_META[p].label}</option>
                    ))}
                  </select>
                </div>

                {/* Common */}
                <div className="form-group">
                  <label className="form-label">Integration Name *</label>
                  <input name="name" required className="form-input" placeholder="My WhatsApp Channel" value={form.name} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label className="form-label">Access Token *</label>
                  <textarea name="accessToken" required className="form-input" placeholder="EAAxxxxx…" rows={3} style={{ resize: 'vertical' }} value={form.accessToken} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label className="form-label">Verify Token *</label>
                  <input name="verifyToken" required className="form-input" placeholder="my_verify_token" value={form.verifyToken} onChange={handleChange} />
                </div>

                {/* WhatsApp-specific */}
                {form.platform === 'WHATSAPP' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Phone Number ID *</label>
                      <input name="waPhoneNumberId" required className="form-input" placeholder="1234567890" value={form.waPhoneNumberId} onChange={handleChange} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Business Account ID *</label>
                      <input name="waBusinessAccId" required className="form-input" placeholder="0987654321" value={form.waBusinessAccId} onChange={handleChange} />
                    </div>
                  </>
                )}

                {/* Facebook-specific */}
                {form.platform === 'FACEBOOK' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Page ID *</label>
                      <input name="fbPageId" required className="form-input" placeholder="123456789" value={form.fbPageId} onChange={handleChange} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Page Name *</label>
                      <input name="fbPageName" required className="form-input" placeholder="My Business Page" value={form.fbPageName} onChange={handleChange} />
                    </div>
                  </>
                )}

                {/* Instagram-specific */}
                {form.platform === 'INSTAGRAM' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Account ID *</label>
                      <input name="igAccountId" required className="form-input" placeholder="17841xxxxxx" value={form.igAccountId} onChange={handleChange} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Username *</label>
                      <input name="igUsername" required className="form-input" placeholder="@mybusiness" value={form.igUsername} onChange={handleChange} />
                    </div>
                  </>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? (
                    <><div className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Adding…</>
                  ) : 'Add Integration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
