import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { channelAPI } from '../../services/api';
import { Video, Plus, Trash2, CheckCircle2, AlertCircle, ExternalLink, RefreshCw, Key, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';

export default function TikTokPage({ embedded = false }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Manual connect form
  const [form, setForm] = useState({
    name: '',
    tiktokUsername: '',
    tiktokOpenId: '',
    accessToken: '',
    verifyToken: '',
  });

  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const res = await channelAPI.getTikTok();
      setAccounts(res.data.accounts || []);
    } catch {
      showToast('Failed to load TikTok accounts', 'error');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || (!form.tiktokOpenId.trim() && !form.accessToken.trim())) {
      showToast('Please enter account name and Open ID or Access Token', 'error');
      return;
    }
    setSaving(true);
    try {
      await channelAPI.addTikTok(form);
      showToast('✅ TikTok account connected successfully!');
      setForm({ name: '', tiktokUsername: '', tiktokOpenId: '', accessToken: '', verifyToken: '' });
      setShowModal(false);
      fetchAccounts();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to connect TikTok account', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this TikTok account?')) return;
    try {
      await channelAPI.deleteTikTok(id);
      showToast('TikTok account removed');
      fetchAccounts();
    } catch {
      showToast('Failed to delete account', 'error');
    }
  };

  const LayoutWrapper = embedded ? ({ children }) => <div>{children}</div> : AppLayout;

  return (
    <LayoutWrapper>
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>{toast.msg}</div>
        </div>
      )}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🎵</span> TikTok Channel
            </h1>
            <p className="page-subtitle">
              Connect and automate Direct Messages & Comments on TikTok
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link to="/settings/tiktok-app" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.84rem' }}>
              <Key size={14} /> TikTok App Setup
            </Link>
            <button
              onClick={() => setShowModal(true)}
              className="btn btn-primary"
              style={{ background: 'linear-gradient(135deg, #000000, #FE2C55)', border: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Plus size={16} /> Connect TikTok Account
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Connected Accounts Table */}
        <div className="card" style={{ padding: 20, borderRadius: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
              Connected TikTok Accounts ({accounts.length})
            </h3>
            <button
              onClick={fetchAccounts}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem' }}
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading TikTok accounts...</div>
          ) : accounts.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 12, border: '1px dashed #cbd5e1' }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🎵</div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>No TikTok accounts connected yet</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4, marginBottom: 14 }}>
                Add your TikTok account credentials or link via Developer App
              </div>
              <button
                onClick={() => setShowModal(true)}
                className="btn btn-primary btn-sm"
                style={{ background: '#FE2C55', border: 'none' }}
              >
                + Connect TikTok Account
              </button>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Account / Display Name</th>
                    <th>TikTok Username</th>
                    <th>Open ID</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((acc) => (
                    <tr key={acc.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.78rem' }}>
                            TT
                          </div>
                          <span style={{ fontWeight: 700 }}>{acc.name}</span>
                        </div>
                      </td>
                      <td style={{ color: '#FE2C55', fontWeight: 600 }}>
                        {acc.tiktok_username ? `@${acc.tiktok_username}` : '—'}
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#64748b' }}>
                        {acc.tiktok_open_id || '—'}
                      </td>
                      <td>
                        <span className={`badge ${acc.is_active ? 'badge-success' : 'badge-muted'}`}>
                          {acc.is_active ? '✅ Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <button
                          onClick={() => handleDelete(acc.id)}
                          className="btn btn-danger btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          <Trash2 size={12} /> Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Connect Modal */}
        {showModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 480, maxWidth: '92vw', background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>🎵</span> Connect TikTok Account
                </h3>
                <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Account / Brand Name *</label>
                  <input
                    type="text"
                    required
                    className="form-input w-full"
                    placeholder="e.g. My TikTok Brand"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>TikTok Username (@handle)</label>
                  <input
                    type="text"
                    className="form-input w-full"
                    placeholder="e.g. brand_official"
                    value={form.tiktokUsername}
                    onChange={(e) => setForm({ ...form, tiktokUsername: e.target.value.replace(/^@/, '') })}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>TikTok Open ID / User ID *</label>
                  <input
                    type="text"
                    required
                    className="form-input w-full font-mono text-sm"
                    placeholder="e.g. _000xxxx-xxxx-xxxx"
                    value={form.tiktokOpenId}
                    onChange={(e) => setForm({ ...form, tiktokOpenId: e.target.value })}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Access Token / User Token (Optional for messaging)</label>
                  <input
                    type="password"
                    className="form-input w-full font-mono text-sm"
                    placeholder="act.xxxxxxxxxxxxxx"
                    value={form.accessToken}
                    onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                  <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">Cancel</button>
                  <button type="submit" disabled={saving} className="btn btn-primary" style={{ background: '#FE2C55', border: 'none' }}>
                    {saving ? 'Connecting...' : 'Connect TikTok Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </LayoutWrapper>
  );
}
