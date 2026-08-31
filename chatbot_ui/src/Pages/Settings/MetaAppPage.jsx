import { useState, useEffect, useMemo } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { metaAppAPI } from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';
import { showAlert, notify } from '../../utils/alerts';

function generateRandomToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let random = '';
  for (let i = 0; i < 24; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `nexa_meta_${random}`;
}

export default function MetaAppPage({ embedded = false }) {
  const { user } = useAuth();
  
  // Real numeric agency ID from backend or user context
  const [agencyId, setAgencyId] = useState(user?.agencyId || 1);
  
  // Public domain / host configuration
  const defaultPublicUrl = useMemo(() => {
    // If current location is https (like ngrok or production domain), use origin
    if (window.location.protocol === 'https:') {
      return window.location.origin;
    }
    // If on localhost, default to current origin but allow easy editing for ngrok / custom domain
    return window.location.origin;
  }, []);

  const [publicDomain, setPublicDomain] = useState(defaultPublicUrl);

  const [form, setForm] = useState({
    appName: '',
    appId: '',
    appSecret: '',
    systemUserToken: '',
    whatsappConfigId: '',
    verifyToken: generateRandomToken(),
    siteUrl: window.location.origin,
    privacyUrl: `${window.location.origin}/privacy-policy`,
    tosUrl: `${window.location.origin}/terms-of-service`,
    isActive: true,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showSystemToken, setShowSystemToken] = useState(false);
  const [toast, setToast] = useState(null);
  const [copiedKey, setCopiedKey] = useState('');

  // Derived URLs based on public domain & agency ID
  const cleanPublicBase = useMemo(() => {
    let url = publicDomain.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    return url.replace(/\/+$/, '');
  }, [publicDomain]);

  const appDomain = useMemo(() => {
    try {
      const parsed = new URL(cleanPublicBase);
      return parsed.hostname;
    } catch {
      return cleanPublicBase.replace(/^https?:\/\//, '').split('/')[0];
    }
  }, [cleanPublicBase]);

  const webhookCallbackUrl = useMemo(() => {
    return `${cleanPublicBase}/api/v1/webhook/${agencyId}`;
  }, [cleanPublicBase, agencyId]);

  const dynamicPrivacyUrl = useMemo(() => `${cleanPublicBase}/privacy-policy`, [cleanPublicBase]);
  const dynamicTosUrl     = useMemo(() => `${cleanPublicBase}/terms-of-service`, [cleanPublicBase]);

  const oauthRedirectUrls = useMemo(() => [
    `${cleanPublicBase}/auth/facebook/callback`,
    `${cleanPublicBase}/auth/facebook/re-link`,
    `${cleanPublicBase}/auth/facebook/manual-renew`,
  ], [cleanPublicBase]);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await metaAppAPI.get();
      if (res.data) {
        if (res.data.agencyId) {
          setAgencyId(res.data.agencyId);
        }
        if (res.data.settings) {
          const s = res.data.settings;
          const token = s.verify_token || res.data.generatedVerifyToken || generateRandomToken();
          setForm(f => ({
            ...f,
            appName:          s.app_name           || '',
            appId:            s.app_id             || '',
            appSecret:        s.app_secret         || '',
            systemUserToken:  s.system_user_token  || '',
            whatsappConfigId: s.whatsapp_config_id || '',
            verifyToken:      token,
            siteUrl:          s.site_url           || window.location.origin,
            privacyUrl:       s.privacy_url        || `${window.location.origin}/privacy-policy`,
            tosUrl:           s.tos_url            || `${window.location.origin}/terms-of-service`,
            isActive:         s.is_active          !== 0,
          }));
        } else if (res.data.generatedVerifyToken) {
          setForm(f => ({ ...f, verifyToken: res.data.generatedVerifyToken }));
        }
      }
    } catch (err) {
      console.error('Failed to load Meta settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg, type = 'success') => {
    if (type === 'error') notify.error(msg);
    else notify.success(msg);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await metaAppAPI.save({
        ...form,
        siteUrl: cleanPublicBase,
        privacyUrl: dynamicPrivacyUrl,
        tosUrl: dynamicTosUrl,
        customWebhookUrl: webhookCallbackUrl,
      });
      showAlert.success('Meta App Settings Saved!', 'Your Meta credentials, system user token, and webhook configuration were successfully updated.');
    } catch (err) {
      showAlert.error('Save Failed', err.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await metaAppAPI.test();
      showAlert.success('Connection Verified!', `Successfully connected to Meta Graph API. App Name: ${res.data.appName}`);
    } catch (err) {
      showAlert.error('Connection Failed', err.response?.data?.message || 'Could not verify connection. Check App ID & Secret.');
    } finally {
      setTesting(false);
    }
  };

  const handleRegenerateToken = () => {
    const newToken = generateRandomToken();
    setForm(f => ({ ...f, verifyToken: newToken }));
    showToast('🔄 New secure verify token generated!');
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  const isLocalhost = cleanPublicBase.includes('localhost') || cleanPublicBase.includes('127.0.0.1');

  const LayoutWrapper = embedded ? ({ children }) => <div>{children}</div> : AppLayout;

  return (
    <LayoutWrapper>
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type === 'error' ? 'error' : 'success'}`}>{toast.msg}</div>
        </div>
      )}

      {!embedded && (
        <div className="page-header">
          <div className="flex items-center gap-3">
            <span style={{ color: '#1877f2', fontSize: '1.6rem' }}>📘</span>
            <div>
              <h1 className="page-title">Meta Developer App Setup</h1>
              <p className="page-subtitle">Configure your Meta Developer App credentials, Webhooks, and Domain settings</p>
            </div>
          </div>
        </div>
      )}

      <div className={embedded ? "" : "page-body"}>
        {loading ? (
          <div className="loading-overlay"><div className="loading-spinner" /></div>
        ) : (
          <form onSubmit={handleSave}>
            
            {/* ── Domain / HTTPS Notice Banner ── */}
            {isLocalhost && (
              <div style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: 12,
                padding: '16px 20px',
                marginBottom: 24,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14
              }}>
                <span style={{ fontSize: '1.3rem', flexShrink: 0 }}>💡</span>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  <strong>Meta Webhook Requirement:</strong> Meta Developer Console requires an <strong>HTTPS public domain</strong> (e.g. ngrok tunnel or live domain) for webhook callbacks.
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Set your Public / Ngrok Domain:</span>
                    <input
                      type="text"
                      className="form-input"
                      style={{ width: 340, padding: '6px 12px', fontSize: '0.85rem' }}
                      placeholder="e.g. https://your-tunnel.ngrok-free.app or https://yourdomain.com"
                      value={publicDomain}
                      onChange={e => setPublicDomain(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Section 1: Auto-generated Meta Configuration Card ── */}
            <div className="card" style={{ marginBottom: 24, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.2rem' }}>⚡</span>
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                    Meta Developer Console Configuration Values
                  </span>
                </div>
                <span style={{ fontSize: '0.8rem', background: '#e0e7ff', color: '#4338ca', padding: '4px 10px', borderRadius: 999, fontWeight: 600 }}>
                  Agency ID: {agencyId}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 32 }}>
                {/* Left Column: Essential URLs */}
                <div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    
                    {/* App Domain */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 500, minWidth: 150 }}>App domain:</span>
                      <span style={{ color: 'var(--primary)', fontWeight: 600, fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>{appDomain}</span>
                      <button type="button" onClick={() => copyToClipboard(appDomain, 'domain')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                        {copiedKey === 'domain' ? '✅' : '📋'}
                      </button>
                    </div>

                    {/* Site URL */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 500, minWidth: 150 }}>Site url:</span>
                      <span style={{ color: 'var(--primary)', flex: 1, wordBreak: 'break-all' }}>{cleanPublicBase}</span>
                      <button type="button" onClick={() => copyToClipboard(cleanPublicBase, 'site')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                        {copiedKey === 'site' ? '✅' : '📋'}
                      </button>
                    </div>

                    {/* Privacy Policy URL */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 500, minWidth: 150 }}>Privacy policy url:</span>
                      <span style={{ color: 'var(--primary)', flex: 1, wordBreak: 'break-all' }}>{dynamicPrivacyUrl}</span>
                      <button type="button" onClick={() => copyToClipboard(dynamicPrivacyUrl, 'privacy')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                        {copiedKey === 'privacy' ? '✅' : '📋'}
                      </button>
                    </div>

                    {/* Terms of Service URL */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 500, minWidth: 150 }}>Terms of service url:</span>
                      <span style={{ color: 'var(--primary)', flex: 1, wordBreak: 'break-all' }}>{dynamicTosUrl}</span>
                      <button type="button" onClick={() => copyToClipboard(dynamicTosUrl, 'tos')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                        {copiedKey === 'tos' ? '✅' : '📋'}
                      </button>
                    </div>

                    {/* Webhook Callback URL */}
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 6, color: 'var(--text-primary)' }}>
                        Webhook callback url :
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-hover)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--primary)', fontSize: '0.875rem', fontWeight: 600, wordBreak: 'break-all', flex: 1 }}>
                          {webhookCallbackUrl}
                        </span>
                        <button type="button" onClick={() => copyToClipboard(webhookCallbackUrl, 'webhook')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', flexShrink: 0 }}>
                          {copiedKey === 'webhook' ? '✅' : '📋'}
                        </button>
                      </div>
                    </div>

                    {/* Webhook Verify Token */}
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-primary)' }}>Webhook verify token :</span>
                        <button
                          type="button"
                          onClick={handleRegenerateToken}
                          style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
                        >
                          🔄 Generate New Token
                        </button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-hover)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--primary)', fontSize: '0.875rem', fontFamily: 'monospace', fontWeight: 700, flex: 1, wordBreak: 'break-all' }}>
                          {form.verifyToken}
                        </span>
                        <button type="button" onClick={() => copyToClipboard(form.verifyToken, 'verifyToken')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', flexShrink: 0 }}>
                          {copiedKey === 'verifyToken' ? '✅' : '📋'}
                        </button>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Right Column: OAuth Redirect URIs */}
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 12, color: 'var(--text-primary)' }}>
                    Valid OAuth Redirect URIs :
                  </div>
                  {oauthRedirectUrls.map((url, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, background: 'var(--bg-hover)', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', wordBreak: 'break-all', flex: 1 }}>{url}</span>
                      <button type="button" onClick={() => copyToClipboard(url, `oauth${i}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', flexShrink: 0 }}>
                        {copiedKey === `oauth${i}` ? '✅' : '📋'}
                      </button>
                    </div>
                  ))}

                  <div style={{ marginTop: 24, padding: '14px 16px', background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: 10, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: 4 }}>📌 Quick Meta Setup Instructions:</div>
                    1. In Meta App Dashboard &rarr; <strong>App settings &rarr; Basic</strong>, paste the <strong>App domain</strong>, <strong>Privacy Policy URL</strong>, and <strong>Terms URL</strong>.<br />
                    2. In <strong>WhatsApp / Messenger &rarr; Configuration &rarr; Webhooks</strong>, paste the <strong>Webhook callback url</strong> and <strong>Webhook verify token</strong> above.<br />
                    3. Click <strong>Verify and Save</strong> in Meta, then subscribe to the <code>messages</code> field.
                  </div>
                </div>
              </div>
            </div>

            {/* ── Section 2: App Credentials Form ── */}
            <div className="card" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '1.2rem' }}>🔑</span>
                <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>App Credentials & Meta Secrets</span>
              </div>

              {/* App Name */}
              <div style={{ marginBottom: 20 }}>
                <label className="form-label" style={{ marginBottom: 6 }}>App Name</label>
                <input
                  className="form-input"
                  placeholder="e.g. Nexa Chatbot SaaS App"
                  value={form.appName}
                  onChange={e => setForm(f => ({ ...f, appName: e.target.value }))}
                />
              </div>

              {/* App ID & Secret */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                <div>
                  <label className="form-label" style={{ marginBottom: 6 }}>App ID</label>
                  <input
                    className="form-input"
                    placeholder="e.g. 1031458640063807"
                    value={form.appId}
                    onChange={e => setForm(f => ({ ...f, appId: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="form-label" style={{ marginBottom: 6 }}>App Secret</label>
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

              {/* Permanent System User Access Token */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label className="form-label" style={{ margin: 0 }}>
                    Meta Permanent System User Access Token (WhatsApp Cloud API)
                    <span style={{ marginLeft: 8, fontSize: '0.72rem', fontWeight: 700, color: '#16a34a', background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)', borderRadius: 6, padding: '1px 7px' }}>
                      Recommended
                    </span>
                  </label>
                </div>

                <div style={{ position: 'relative' }}>
                  <input
                    className="form-input"
                    type={showSystemToken ? 'text' : 'password'}
                    placeholder="Paste permanent System User token (starts with EAA...) from Meta Business Settings"
                    value={form.systemUserToken}
                    onChange={e => setForm(f => ({ ...f, systemUserToken: e.target.value }))}
                    style={{ paddingRight: 44, fontFamily: 'monospace', fontSize: '0.82rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSystemToken(!showSystemToken)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
                  >
                    {showSystemToken ? '🙈' : '👁️'}
                  </button>
                </div>
                <p style={{ marginTop: 5, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  💡 <strong>How to get:</strong> Meta Business Settings &rarr; <strong>System Users</strong> &rarr; <strong>Generate New Token</strong> &rarr; Select your app & check <code style={{ background: 'rgba(0,0,0,0.05)', padding: '1px 4px', borderRadius: 3 }}>whatsapp_business_management</code> & <code style={{ background: 'rgba(0,0,0,0.05)', padding: '1px 4px', borderRadius: 3 }}>whatsapp_business_messaging</code>. Once saved here, all WhatsApp numbers activate seamlessly with only a 6-digit PIN!
                </p>
              </div>

              {/* WhatsApp Embedded Signup Configuration ID */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label className="form-label" style={{ margin: 0 }}>
                    WhatsApp Embedded Signup Configuration ID
                    <span style={{ marginLeft: 8, fontSize: '0.72rem', fontWeight: 700, color: '#dc2626', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 6, padding: '1px 7px' }}>
                      Required for Embedded Signup
                    </span>
                  </label>
                </div>

                {/* Warning banner */}
                <div style={{ marginBottom: 10, padding: '10px 14px', background: 'rgba(220, 38, 38, 0.06)', border: '1px solid rgba(220, 38, 38, 0.25)', borderRadius: 8, fontSize: '0.8rem', color: '#991b1b', lineHeight: 1.5 }}>
                  ⚠️ <strong>If you see "This app isn't available — Embedded signup is only available for BSPs or TPs"</strong>, it means this Config ID is missing or wrong. Without it, Meta rejects the login popup entirely.
                  <div style={{ marginTop: 6, color: '#7f1d1d' }}>
                    <strong>Where to find it:</strong> Meta App Dashboard → <strong>WhatsApp</strong> → <strong>Quickstart</strong> (or <strong>Configuration</strong>) → scroll to <strong>Embedded Signup</strong> section → copy the <strong>Configuration ID</strong> (a long numeric string like <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: 4 }}>1234567890123456</code>).
                  </div>
                </div>

                <input
                  className="form-input"
                  placeholder="e.g. 1234567890123456 — paste the numeric Config ID from Meta App → WhatsApp → Embedded Signup"
                  value={form.whatsappConfigId}
                  onChange={e => setForm(f => ({ ...f, whatsappConfigId: e.target.value }))}
                  style={{ borderColor: !form.whatsappConfigId ? 'rgba(220,38,38,0.4)' : undefined }}
                />
                <p style={{ marginTop: 5, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Meta App Dashboard → WhatsApp → Quickstart or Configuration → Embedded Signup → copy <strong>Configuration ID</strong>
                </p>
              </div>

              {/* Verify Token Input with Generator */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label className="form-label" style={{ margin: 0 }}>Webhook Verify Token</label>
                  <button
                    type="button"
                    onClick={handleRegenerateToken}
                    style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
                  >
                    🔄 Generate Random Token
                  </button>
                </div>
                <input
                  className="form-input"
                  placeholder="e.g. nexa_meta_token_secure"
                  value={form.verifyToken}
                  onChange={e => setForm(f => ({ ...f, verifyToken: e.target.value }))}
                  required
                />
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
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                  {form.isActive ? '✅ App Active (Ready for Webhooks)' : '⏸️ Inactive'}
                </span>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 120 }}>
                  {saving ? 'Saving…' : '💾 Save Settings'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleTest} disabled={testing} style={{ minWidth: 140 }}>
                  {testing ? 'Verifying…' : '🔌 Test Connection'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={fetchSettings} style={{ marginLeft: 'auto' }}>
                  Reset
                </button>
              </div>

            </div>
          </form>
        )}
      </div>
    </LayoutWrapper>
  );
}