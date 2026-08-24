import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { channelAPI } from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';

const BACKEND_URL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:5000';

export default function WhatsAppPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState({ name: '', waPhoneNumberId: '', waBusinessAccId: '', accessToken: '', verifyToken: '' });

  useEffect(() => { fetchAccounts(); }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await channelAPI.getWhatsApp();
      setAccounts(res.data.accounts || []);
    } catch { showToast('Failed to load accounts', 'error'); }
    finally { setLoading(false); }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await channelAPI.addWhatsApp({ name: form.name, waPhoneNumberId: form.waPhoneNumberId, waBusinessAccId: form.waBusinessAccId, accessToken: form.accessToken, verifyToken: form.verifyToken });
      showToast('WhatsApp account connected!');
      setForm({ name: '', waPhoneNumberId: '', waBusinessAccId: '', accessToken: '', verifyToken: '' });
      fetchAccounts();
    } catch (err) { showToast(err.response?.data?.message || 'Failed to connect', 'error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this WhatsApp account?')) return;
    try {
      await channelAPI.deleteWhatsApp(id);
      showToast('Account removed');
      fetchAccounts();
    } catch { showToast('Failed to remove', 'error'); }
  };

  return (
    <AppLayout>
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>
            {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
          </div>
        </div>
      )}

      <div className="page-header">
        <div>
          <h1 className="page-title">📱 WhatsApp</h1>
          <p className="page-subtitle">Connect WhatsApp Business accounts via Meta Cloud API</p>
        </div>
      </div>

      <div className="page-body">
        {/* Webhook Info Banner */}
        <div style={{ background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.25)', borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: '24px' }}>
          <div style={{ fontWeight: 700, color: 'var(--whatsapp)', marginBottom: 6 }}>📋 Webhook Setup</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
            After connecting, paste this Webhook URL in your Meta App → WhatsApp → Configuration → Webhooks:
          </div>
          <code style={{ background: 'var(--bg-hover)', padding: '6px 12px', borderRadius: 6, fontSize: '0.8rem', display: 'block', overflowX: 'auto', color: 'var(--text-primary)' }}>
            {BACKEND_URL}/api/v1/webhook/{'{agencyId}'}/{'{integrationId}'}
          </code>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24 }}>
          {/* Connected Accounts */}
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 16 }}>Connected Accounts</h2>
            {loading ? (
              <div className="loading-overlay"><div className="loading-spinner" /></div>
            ) : accounts.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📱</div>
                <div className="empty-title">No WhatsApp accounts connected</div>
                <div className="empty-desc">Add your first account using the form</div>
              </div>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead><tr><th>Name</th><th>Phone Number ID</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {accounts.map(a => (
                      <tr key={a.id}>
                        <td><div className="flex items-center gap-2"><span style={{ color: 'var(--whatsapp)' }}>📱</span><span className="font-medium">{a.name}</span></div></td>
                        <td><code style={{ fontSize: '0.8rem', background: 'var(--bg-hover)', padding: '2px 8px', borderRadius: 4 }}>{a.wa_phone_number_id}</code></td>
                        <td><span className={`badge ${a.is_active ? 'badge-success' : 'badge-muted'}`}><span className={`status-dot ${a.is_active ? 'online' : 'offline'}`} />{a.is_active ? 'Active' : 'Inactive'}</span></td>
                        <td><button className="btn btn-danger btn-sm" onClick={() => handleDelete(a.id)}>🗑 Remove</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Add Form */}
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 16 }}>➕ Connect Account</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Display Name *</label>
                <input className="form-input" placeholder="e.g. My Business Number" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Phone Number ID *</label>
                <input className="form-input" placeholder="From Meta App Dashboard" value={form.waPhoneNumberId} onChange={e => setForm(f => ({ ...f, waPhoneNumberId: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">WhatsApp Business Account ID</label>
                <input className="form-input" placeholder="Optional" value={form.waBusinessAccId} onChange={e => setForm(f => ({ ...f, waBusinessAccId: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Permanent Access Token *</label>
                <textarea className="form-input" rows={3} placeholder="Paste your System User access token" value={form.accessToken} onChange={e => setForm(f => ({ ...f, accessToken: e.target.value }))} required style={{ resize: 'vertical' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Verify Token *</label>
                <input className="form-input" placeholder="Random secret (e.g. my_verify_token_2024)" value={form.verifyToken} onChange={e => setForm(f => ({ ...f, verifyToken: e.target.value }))} required />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Set this same value in Meta App → Webhooks</span>
              </div>
              <button type="submit" className="btn btn-primary w-full" disabled={saving}>
                {saving ? <span className="loading-spinner" style={{ width: 16, height: 16 }} /> : '📱 Connect WhatsApp'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
