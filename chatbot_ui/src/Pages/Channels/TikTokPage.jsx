import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../../Layout/AppLayout';
import ChannelBreadcrumb from '../../Components/Common/ChannelBreadcrumb';
import { channelAPI } from '../../services/api';
import { handleLimitError } from '../../utils/alerts';
import { useAuth } from '../../Provider/AuthContext';
import { Plus, Trash2, CheckCircle2, RefreshCw, Key, Music, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';

const EmbeddedWrapper = ({ children }) => <div>{children}</div>;

const DEFAULT_FORM = { name: '', tiktokUsername: '', tiktokOpenId: '', accessToken: '', verifyToken: '' };

export default function TikTokPage({ embedded = false }) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [view, setView] = useState('list'); // 'list' | 'connect'

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await channelAPI.getTikTok();
      setAccounts(res.data.accounts || []);
    } catch {
      showToast('Failed to load TikTok accounts', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

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
      showToast('TikTok account connected successfully!');
      setForm(DEFAULT_FORM);
      setView('list');
      fetchAccounts();
    } catch (err) {
      if (!handleLimitError(err, { userRole: user?.role })) {
        showToast(err.response?.data?.message || 'Failed to connect TikTok account', 'error');
      }
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

  const LayoutWrapper = embedded ? EmbeddedWrapper : AppLayout;

  // ── VIEW: Account List ──────────────────────────────────────────────────────
  const ListView = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(254,44,85,0.1)', color: '#FE2C55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Music size={20} />
            </div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              TikTok
            </h1>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2, marginLeft: 46 }}>
            Connect and automate Direct Messages & Comments on TikTok.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/settings/tiktok-app" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', fontSize: '0.82rem' }}>
            <Key size={13} /> App Setup
          </Link>
          <button onClick={fetchAccounts} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', fontSize: '0.82rem' }}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button
            onClick={() => setView('connect')}
            style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 14px', fontSize: '0.84rem', fontWeight: 700, background: 'linear-gradient(135deg, #000000, #FE2C55)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', boxShadow: '0 2px 8px rgba(254,44,85,0.25)' }}
          >
            <Plus size={15} /> Connect Account
          </button>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Connected TikTok Accounts</h2>
            <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '2px 0 0' }}>TikTok accounts for this workspace</p>
          </div>
          <span style={{ fontSize: '0.74rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(254,44,85,0.1)', color: '#FE2C55' }}>
            {accounts.length} Connected
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Account / Display Name</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>TikTok Username</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Open ID</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                    Loading accounts...
                  </td>
                </tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
                    <Music size={40} color="#cbd5e1" style={{ margin: '0 auto 12px', display: 'block' }} />
                    <h3 style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>No TikTok Accounts Connected</h3>
                    <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 16px' }}>Click "Connect Account" to add your first TikTok account.</p>
                    <button
                      onClick={() => setView('connect')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', fontSize: '0.82rem', fontWeight: 700, background: '#FE2C55', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
                    >
                      <Plus size={14} /> Connect Now
                    </button>
                  </td>
                </tr>
              ) : (
                accounts.map((acc) => (
                  <tr
                    key={acc.id}
                    style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.12s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fafbfe')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                  >
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 28, height: 28, borderRadius: 6, background: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Music size={14} />
                        </span>
                        {acc.name}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#FE2C55', fontWeight: 600 }}>
                      {acc.tiktok_username ? `@${acc.tiktok_username}` : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontSize: '0.78rem', color: '#64748b' }}>
                      {acc.tiktok_open_id || '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 700, color: acc.is_active ? '#16a34a' : '#64748b', background: acc.is_active ? 'rgba(34,197,94,0.1)' : '#f1f5f9', padding: '2px 8px', borderRadius: 10 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: acc.is_active ? '#16a34a' : '#94a3b8' }} />
                        {acc.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <button
                        onClick={() => handleDelete(acc.id)}
                        style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #fee2e2', background: '#fef2f2', color: '#ef4444', cursor: 'pointer' }}
                        title="Remove"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ── VIEW: Connect Account ───────────────────────────────────────────────────
  const ConnectView = () => (
    <div style={{ maxWidth: 560 }}>
      <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', marginBottom: 20, padding: 0 }}>
        <ArrowLeft size={14} /> Back to Accounts
      </button>

      <div style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 14,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        padding: '24px 28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(254,44,85,0.1)', color: '#FE2C55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Music size={18} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>Connect TikTok Account</h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#64748b' }}>Add your TikTok account credentials, or link via your Developer App</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
              Account / Brand Name <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              required
              className="form-input w-full"
              placeholder="e.g. My TikTok Brand"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={{ height: 36, fontSize: '0.84rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>TikTok Username (@handle)</label>
            <input
              className="form-input w-full"
              placeholder="e.g. brand_official"
              value={form.tiktokUsername}
              onChange={(e) => setForm({ ...form, tiktokUsername: e.target.value.replace(/^@/, '') })}
              style={{ height: 36, fontSize: '0.84rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
              TikTok Open ID / User ID <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              required
              className="form-input w-full"
              placeholder="e.g. _000xxxx-xxxx-xxxx"
              value={form.tiktokOpenId}
              onChange={(e) => setForm({ ...form, tiktokOpenId: e.target.value })}
              style={{ height: 36, fontSize: '0.84rem', fontFamily: 'monospace' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>Access Token / User Token (optional for messaging)</label>
            <input
              type="password"
              className="form-input w-full"
              placeholder="act.xxxxxxxxxxxxxx"
              value={form.accessToken}
              onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
              style={{ height: 36, fontSize: '0.84rem', fontFamily: 'monospace' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 6, borderTop: '1px solid #f1f5f9' }}>
            <button type="button" onClick={() => setView('list')} className="btn btn-secondary btn-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary btn-sm"
              style={{ background: '#FE2C55', borderColor: '#FE2C55', fontWeight: 700, minWidth: 160 }}
            >
              {saving ? 'Connecting...' : 'Connect TikTok Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <LayoutWrapper>
      <div style={{ width: '100%', padding: embedded ? '0' : '16px 20px' }}>
        {toast && (
          <div className="toast-container">
            <div className={`toast ${toast.type}`}>{toast.msg}</div>
          </div>
        )}
        {!embedded && <ChannelBreadcrumb current="TikTok" />}
        {view === 'list' ? ListView() : ConnectView()}
      </div>
    </LayoutWrapper>
  );
}
