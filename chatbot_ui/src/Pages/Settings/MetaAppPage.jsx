import { useState, useEffect, useMemo } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { metaAppAPI } from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';

const BACKEND_URL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:5000';

export default function MetaAppPage() {
  const { user } = useAuth();
  const agencyId = user?.agencyId || '{agencyId}';

  // Dynamic URLs — always read from current browser address bar
  const siteOrigin = useMemo(() => window.location.origin, []);
  const webhookCallbackUrl = `${BACKEND_URL}/api/v1/webhook/${agencyId}`;
  const oauthRedirectUrls = useMemo(() => [
    `${siteOrigin}/auth/facebook/callback`,
    `${siteOrigin}/auth/facebook/re-link`,
    `${siteOrigin}/auth/facebook/manual-renew`,
  ], [siteOrigin]);

  const [form, setForm] = useState({
    appName: '',
    appId: '',
    appSecret: '',
    verifyToken: '',
    siteUrl: window.location.origin,
    privacyUrl: `${window.location.origin}/privacy-policy`,
    tosUrl: `${window.location.origin}/terms-of-service`,
    isActive: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [toast, setToast] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState('');

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await metaAppAPI.get();
      if (res.data.settings) {
        const s = res.data.settings;
        setForm(f => ({
          ...f,
          appName:    s.app_name    || '',
          appId:      s.app_id      || '',
          appSecret:  s.app_secret  || '',
          verifyToken: s.verify_token || '',
          siteUrl:    s.site_url    || window.location.origin,
          privacyUrl: s.privacy_url || `${window.location.origin}/privacy-policy`,
          tosUrl:     s.tos_url     || `${window.location.origin}/terms-of-service`,
          isActive:   s.is_active   !== 0,
        }));
      }
    } catch { }
    finally { setLoading(false); }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await metaAppAPI.save(form);
      showToast('✅ Meta App settings saved successfully!');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to save', 'error');
    } finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await metaAppAPI.test();
      showToast(`✅ Connection successful! App: ${res.data.appName}`);
    } catch (err) {
      showToast(err.response?.data?.message || 'Connection failed', 'error');
    } finally { setTesting(false); }
  };

  const handleCancel = () => { fetchSettings(); };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(key);
    setTimeout(() => setCopiedUrl(''), 2000);
  };

  const InfoRow = ({ label, value, copiable }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10, fontSize: '0.875rem' }}>
      <span style={{ color: 'var(--text-secondary)', minWidth: 160, flexShrink: 0, fontWeight: 500 }}>{label} :</span>
      <span style={{ color: 'var(--primary)', wordBreak: 'break-all', flex: 1 }}>{value}</span>
      {copiable && (
        <button onClick={() => copyToClipboard(value, label)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-muted)', flexShrink: 0 }}>
          {copiedUrl === label ? '✅' : '📋'}
        </button>
      )}
    </div>
  );

  return (
    <AppLayout>
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type === 'error' ? 'error' : 'success'}`}>{toast.msg}</div>
        </div>
      )}

      <div className="page-header">
        <div className="flex items-center gap-3">
          <span style={{ color: '#1877f2', fontSize: '1.4rem' }}>📘</span>
          <div>
            <h1 className="page-title">Facebook App Settings</h1>
            <p className="page-subtitle">Configure your Meta Developer App credentials and webhook settings</p>
          </div>
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-overlay"><div className="loading-spinner" /></div>
        ) : (
          <form onSubmit={handleSave}>
            {/* ── Section 1: Auto-generated Info ── */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
                {/* Left */}
                <div>
                  <InfoRow label="App domain" value={window.location.hostname} copiable />
                  <InfoRow label="Site url" value={form.siteUrl} copiable />
                  <InfoRow label="Privacy policy url" value={form.privacyUrl} copiable />
                  <InfoRow label="Terms of service url" value={form.tosUrl} copiable />

                  <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 8 }}>Webhook callback url :</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--primary)', fontSize: '0.875rem', wordBreak: 'break-all' }}>{webhookCallbackUrl}</span>
                      <button type="button" onClick={() => copyToClipboard(webhookCallbackUrl, 'webhook')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                        {copiedUrl === 'webhook' ? '✅' : '📋'}
                      </button>
                    </div>
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Webhook verify token :</span>
                      <span style={{ color: 'var(--primary)', fontSize: '0.875rem', fontFamily: 'monospace' }}>{form.verifyToken || '(set below)'}</span>
                      {form.verifyToken && (
                        <button type="button" onClick={() => copyToClipboard(form.verifyToken, 'verify')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                          {copiedUrl === 'verify' ? '✅' : '📋'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right — OAuth Redirect URLs */}
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 10 }}>Valid oauth redirect url :</div>
                  {oauthRedirectUrls.map((url, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ color: 'var(--primary)', fontSize: '0.85rem', wordBreak: 'break-all', flex: 1 }}>{url}</span>
                      <button type="button" onClick={() => copyToClipboard(url, `oauth${i}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                        {copiedUrl === `oauth${i}` ? '✅' : '📋'}
                      </button>
                    </div>
                  ))}

                  <div style={{ marginTop: 20, padding: '12px 14px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    ⚠️ Your Meta App must be in <strong>Live mode</strong> to receive messages from real users. In Development mode, only test users can send messages.
                  </div>
                </div>
              </div>
            </div>

            {/* ── Section 2: App Details ── */}
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '1.1rem' }}>ℹ️</span>
                <span style={{ fontWeight: 700, fontSize: '1rem' }}>App details</span>
              </div>

              {/* App Name */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span>🏷️</span>
                  <label className="form-label" style={{ margin: 0 }}>App name</label>
                </div>
                <input
                  className="form-input"
                  placeholder="e.g. My Business App"
                  value={form.appName}
                  onChange={e => setForm(f => ({ ...f, appName: e.target.value }))}
                />
              </div>

              {/* App ID + App Secret side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span>🔑</span>
                    <label className="form-label" style={{ margin: 0 }}>App id</label>
                  </div>
                  <input
                    className="form-input"
                    placeholder="e.g. 1031458640063807"
                    value={form.appId}
                    onChange={e => setForm(f => ({ ...f, appId: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span>🔒</span>
                    <label className="form-label" style={{ margin: 0 }}>App secret</label>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="form-input"
                      type={showSecret ? 'text' : 'password'}
                      placeholder="••••••••••••••••••••••••••••••••"
                      value={form.appSecret}
                      onChange={e => setForm(f => ({ ...f, appSecret: e.target.value }))}
                      required
                      style={{ paddingRight: 44 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
                    >
                      {showSecret ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Verify Token */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span>🛡️</span>
                  <label className="form-label" style={{ margin: 0 }}>Webhook verify token</label>
                </div>
                <input
                  className="form-input"
                  placeholder="e.g. my_secure_verify_token_2024"
                  value={form.verifyToken}
                  onChange={e => setForm(f => ({ ...f, verifyToken: e.target.value }))}
                  required
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: 4 }}>
                  Paste this same value in Meta App → Webhooks → Verify Token
                </span>
              </div>

              {/* Site, Privacy, ToS URLs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div className="form-group">
                  <label className="form-label">Site URL</label>
                  <input className="form-input" value={form.siteUrl} onChange={e => setForm(f => ({ ...f, siteUrl: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Privacy Policy URL</label>
                  <input className="form-input" value={form.privacyUrl} onChange={e => setForm(f => ({ ...f, privacyUrl: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Terms of Service URL</label>
                  <input className="form-input" value={form.tosUrl} onChange={e => setForm(f => ({ ...f, tosUrl: e.target.value }))} />
                </div>
              </div>

              {/* Active Toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <div
                  className={`toggle-track ${form.isActive ? 'on' : ''}`}
                  onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="toggle-thumb" />
                </div>
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                  {form.isActive ? '✅ Active' : '⏸️ Inactive'}
                </span>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 100 }}>
                  {saving ? <><span className="loading-spinner" style={{ width: 14, height: 14 }} /> Saving…</> : '💾 Save'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleTest} disabled={testing} style={{ minWidth: 140 }}>
                  {testing ? <span className="loading-spinner" style={{ width: 14, height: 14 }} /> : '🔌 Test Connection'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleCancel} style={{ marginLeft: 'auto' }}>
                  ✕ Cancel
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </AppLayout>
  );
}
