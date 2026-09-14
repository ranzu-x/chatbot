import { useState, useEffect, useMemo, useRef } from 'react';
import { Eye, EyeOff, Copy, Check, Info, AlertCircle, RefreshCw, Key, Sparkles, Save, Radio, Sliders } from 'lucide-react';
import AppLayout from '../../Layout/AppLayout';
import { metaAppAPI } from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';
import { showAlert, notify } from '../../utils/alerts';

const EmbeddedWrapper = ({ children }) => <div>{children}</div>;

function CopyButton({ text, copyKey, copiedKey, onCopy, title = 'Copy to clipboard' }) {
  const isCopied = copiedKey === copyKey;
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => onCopy(text, copyKey)}
        title={isCopied ? 'Copied!' : title}
        aria-label={isCopied ? 'Copied' : title}
        style={{
          background: isCopied ? 'rgba(22, 163, 74, 0.08)' : 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 6px',
          borderRadius: 6,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isCopied ? '#16a34a' : 'var(--text-secondary, #64748b)',
          transition: 'all 0.15s ease',
        }}
      >
        {isCopied ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
      </button>

      {isCopied && (
        <span
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            right: 0,
            background: '#0f172a',
            color: '#f8fafc',
            fontSize: '0.7rem',
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: 4,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            pointerEvents: 'none',
            zIndex: 50,
          }}
        >
          Copied!
        </span>
      )}
    </div>
  );
}

function generateRandomToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let random = '';
  for (let i = 0; i < 32; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return random;
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
    whatsappConfigIdCatalog: '',
    verifyToken: generateRandomToken(),
    siteUrl: window.location.origin,
    privacyUrl: `${window.location.origin}/privacy-policy`,
    tosUrl: `${window.location.origin}/terms-of-service`,
    isActive: true,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [fetchingAppName, setFetchingAppName] = useState(false);
  const lastFetchedCreds = useRef('');
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
          if (s.app_id && s.app_secret && s.app_name) {
            lastFetchedCreds.current = `${s.app_id.trim()}:${s.app_secret.trim()}`;
          }
          setForm(f => ({
            ...f,
            appName:          s.app_name           || '',
            appId:            s.app_id             || '',
            appSecret:        s.app_secret         || '',
            systemUserToken:  s.system_user_token  || '',
            whatsappConfigId:        s.whatsapp_config_id         || '',
            whatsappConfigIdCatalog: s.whatsapp_config_id_catalog || '',
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

  const fetchAppNameFromCredentials = async (appId, appSecret, notifyUser = false) => {
    const cleanId = appId?.trim();
    const cleanSecret = appSecret?.trim();
    if (!cleanId || !cleanSecret || cleanId.length < 6 || cleanSecret.length < 10) return;

    const credKey = `${cleanId}:${cleanSecret}`;
    if (lastFetchedCreds.current === credKey) return;

    setFetchingAppName(true);
    try {
      const res = await metaAppAPI.test({ appId: cleanId, appSecret: cleanSecret });
      if (res.data?.appName) {
        lastFetchedCreds.current = credKey;
        setForm(f => ({ ...f, appName: res.data.appName }));
        if (notifyUser) {
          notify.success(`Meta App Name verified: ${res.data.appName}`);
        }
      }
    } catch (err) {
      if (notifyUser) {
        notify.error(err.response?.data?.message || 'Could not verify App ID & Secret');
      }
      console.warn('[MetaApp] Auto-detect app name error:', err?.response?.data?.message || err?.message);
    } finally {
      setFetchingAppName(false);
    }
  };

  useEffect(() => {
    const cleanId = form.appId?.trim();
    const cleanSecret = form.appSecret?.trim();
    if (cleanId && cleanSecret && cleanId.length >= 8 && cleanSecret.length >= 16) {
      const credKey = `${cleanId}:${cleanSecret}`;
      if (lastFetchedCreds.current !== credKey) {
        const timer = setTimeout(() => {
          fetchAppNameFromCredentials(cleanId, cleanSecret, false);
        }, 800);
        return () => clearTimeout(timer);
      }
    }
  }, [form.appId, form.appSecret]);

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
      const cleanId = form.appId?.trim();
      const cleanSecret = form.appSecret?.trim();
      const res = await metaAppAPI.test({ appId: cleanId, appSecret: cleanSecret });
      if (res.data?.appName) {
        setForm(f => ({ ...f, appName: res.data.appName }));
        if (cleanId && cleanSecret) {
          lastFetchedCreds.current = `${cleanId}:${cleanSecret}`;
        }
      }
      showAlert.success('Connection Verified!', `Successfully connected to Meta Graph API. App Name: ${res.data.appName}`);
    } catch (err) {
      showAlert.error('Connection Failed', err.response?.data?.message || 'Could not verify connection. Check App ID & Secret.');
    } finally {
      setTesting(false);
    }
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 2000);
  };

  const isLocalhost = cleanPublicBase.includes('localhost') || cleanPublicBase.includes('127.0.0.1');

  const LayoutWrapper = embedded ? EmbeddedWrapper : AppLayout;

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
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(24, 119, 242, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1877f2' }}>
              <Radio size={20} />
            </div>
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
          <form onSubmit={handleSave} autoComplete="off">
            
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
                <Info size={20} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
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
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck="false"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Section 1: Auto-generated Meta Configuration Card ── */}
            <div className="card" style={{ marginBottom: 24, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sliders size={18} color="var(--primary, #2563eb)" />
                  <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
                    Meta Developer Console Configuration Values
                  </span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 32 }}>
                {/* Left Column: Essential URLs */}
                <div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    
                    {/* App Domain */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 500, minWidth: 150 }}>App domain:</span>
                      <span style={{ color: 'var(--primary)', fontWeight: 600, fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>{appDomain}</span>
                      <CopyButton text={appDomain} copyKey="domain" copiedKey={copiedKey} onCopy={copyToClipboard} />
                    </div>

                    {/* Site URL */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 500, minWidth: 150 }}>Site url:</span>
                      <span style={{ color: 'var(--primary)', flex: 1, wordBreak: 'break-all' }}>{cleanPublicBase}</span>
                      <CopyButton text={cleanPublicBase} copyKey="site" copiedKey={copiedKey} onCopy={copyToClipboard} />
                    </div>

                    {/* Privacy Policy URL */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 500, minWidth: 150 }}>Privacy policy url:</span>
                      <span style={{ color: 'var(--primary)', flex: 1, wordBreak: 'break-all' }}>{dynamicPrivacyUrl}</span>
                      <CopyButton text={dynamicPrivacyUrl} copyKey="privacy" copiedKey={copiedKey} onCopy={copyToClipboard} />
                    </div>

                    {/* Terms of Service URL */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 500, minWidth: 150 }}>Terms of service url:</span>
                      <span style={{ color: 'var(--primary)', flex: 1, wordBreak: 'break-all' }}>{dynamicTosUrl}</span>
                      <CopyButton text={dynamicTosUrl} copyKey="tos" copiedKey={copiedKey} onCopy={copyToClipboard} />
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
                        <CopyButton text={webhookCallbackUrl} copyKey="webhook" copiedKey={copiedKey} onCopy={copyToClipboard} />
                      </div>
                    </div>

                    {/* Webhook Verify Token */}
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: 6, color: 'var(--text-primary)' }}>
                        Webhook verify token :
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-hover)', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <span style={{ color: 'var(--primary)', fontSize: '0.875rem', fontFamily: 'monospace', fontWeight: 700, flex: 1, wordBreak: 'break-all' }}>
                          {form.verifyToken}
                        </span>
                        <CopyButton text={form.verifyToken} copyKey="verifyToken" copiedKey={copiedKey} onCopy={copyToClipboard} />
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
                      <CopyButton text={url} copyKey={`oauth${i}`} copiedKey={copiedKey} onCopy={copyToClipboard} />
                    </div>
                  ))}

                  <div style={{ marginTop: 24, padding: '14px 16px', background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: 10, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <div style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Info size={14} /> Quick Meta Setup Instructions:
                    </div>
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
                <Key size={18} color="var(--primary, #2563eb)" />
                <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>App Credentials & Meta Secrets</span>
              </div>

              {/* App Name */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label className="form-label" style={{ margin: 0 }}>App Name</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {fetchingAppName && (
                      <span style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <RefreshCw size={12} className="animate-spin" /> Fetching App Name from Meta...
                      </span>
                    )}
                    {form.appId?.trim() && form.appSecret?.trim() && !fetchingAppName && (
                      <button
                        type="button"
                        onClick={() => fetchAppNameFromCredentials(form.appId, form.appSecret, true)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#2563eb',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Sparkles size={12} /> Auto-detect Name
                      </button>
                    )}
                  </div>
                </div>
                <input
                  className="form-input"
                  placeholder="e.g. Nexa Chatbot SaaS App"
                  value={form.appName}
                  onChange={e => setForm(f => ({ ...f, appName: e.target.value }))}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck="false"
                />
                <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: 4, display: 'block' }}>
                  Automatically filled from Meta when you enter your App ID &amp; Secret or click &quot;Test Connection&quot;.
                </span>
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
                    onBlur={() => {
                      if (form.appId?.trim() && form.appSecret?.trim()) {
                        fetchAppNameFromCredentials(form.appId, form.appSecret, false);
                      }
                    }}
                    required
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck="false"
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
                      onBlur={() => {
                        if (form.appId?.trim() && form.appSecret?.trim()) {
                          fetchAppNameFromCredentials(form.appId, form.appSecret, true);
                        }
                      }}
                      required
                      style={{ paddingRight: 44 }}
                      autoComplete="new-password"
                      autoCorrect="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-1p-ignore="true"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSecret(!showSecret)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 2 }}
                      title={showSecret ? 'Hide App Secret' : 'Show App Secret'}
                    >
                      {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
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
                    autoComplete="new-password"
                    autoCorrect="off"
                    spellCheck="false"
                    data-lpignore="true"
                    data-1p-ignore="true"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSystemToken(!showSystemToken)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary, #64748b)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 2 }}
                    title={showSystemToken ? 'Hide token' : 'Show token'}
                  >
                    {showSystemToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p style={{ marginTop: 5, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <strong>How to get:</strong> Meta Business Settings &rarr; <strong>System Users</strong> &rarr; <strong>Generate New Token</strong> &rarr; Select your app & check <code style={{ background: 'rgba(0,0,0,0.05)', padding: '1px 4px', borderRadius: 3 }}>whatsapp_business_management</code> & <code style={{ background: 'rgba(0,0,0,0.05)', padding: '1px 4px', borderRadius: 3 }}>whatsapp_business_messaging</code>. Once saved here, all WhatsApp numbers activate seamlessly with only a 6-digit PIN!
                </p>
              </div>

              {/* WhatsApp Embedded Signup Configuration ID(s) */}
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
                <div style={{ marginBottom: 10, padding: '12px 16px', background: 'rgba(220, 38, 38, 0.06)', border: '1px solid rgba(220, 38, 38, 0.25)', borderRadius: 8, fontSize: '0.8rem', color: '#991b1b', lineHeight: 1.55 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <AlertCircle size={15} color="#dc2626" style={{ flexShrink: 0 }} />
                    <strong>If you see &ldquo;This app isn&rsquo;t available &mdash; Embedded signup is only available for BSPs or TPs&rdquo;:</strong>
                  </div>
                  <ul style={{ margin: '6px 0 8px 18px', padding: 0 }}>
                    <li><strong>Missing / Invalid Config ID:</strong> The Configuration ID below is missing, incorrect, or doesn&rsquo;t have WhatsApp messaging permissions enabled.</li>
                    <li><strong>App in Development Mode:</strong> If your Meta App is still in Dev Mode, any user attempting Embedded Signup must first be added under <strong>App Roles &rarr; Roles</strong> as an <em>Admin</em>, <em>Developer</em>, or <em>Tester</em>.</li>
                  </ul>
                  <div style={{ marginTop: 8, color: '#7f1d1d', borderTop: '1px dashed rgba(220,38,38,0.3)', paddingTop: 8 }}>
                    <strong>Where to get your Configuration ID in the new Meta Dashboard:</strong>
                    <ol style={{ margin: '6px 0 0 18px', padding: 0 }}>
                      <li><strong>Primary Method (Facebook Login for Business):</strong> Meta Developer Dashboard &rarr; Left sidebar &rarr; <strong>Facebook Login for Business</strong> &rarr; <strong>Configurations</strong> &rarr; Click <em>Create Configuration</em> &rarr; Add permissions <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: 4 }}>whatsapp_business_management</code> and <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: 4 }}>whatsapp_business_messaging</code> &rarr; Save and copy the <strong>Configuration ID</strong> (a 15&ndash;16 digit numeric ID).</li>
                      <li><strong>Alternate Method:</strong> Left sidebar &rarr; <strong>WhatsApp</strong> (or <strong>Use cases</strong> &rarr; <em>Connect with customers over WhatsApp</em>) &rarr; <strong>Configuration</strong> &rarr; scroll to <strong>Embedded Signup</strong> &rarr; click <em>Manage configuration</em> &rarr; copy the <strong>Configuration ID</strong>.</li>
                    </ol>
                  </div>
                  <div style={{ marginTop: 8, color: '#7f1d1d', borderTop: '1px dashed rgba(220,38,38,0.3)', paddingTop: 8 }}>
                    <strong>Two configs, not one:</strong> Meta recommends a <em>separate</em> Configuration for catalog
                    access rather than adding the Catalogs permission to your main one — customers who don&rsquo;t want
                    catalog features will otherwise hit an unexpected catalog-selection screen and abandon the flow.
                    That&rsquo;s why there are two fields below: create a second Configuration with the extra{' '}
                    <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: 4 }}>catalog_management</code> and{' '}
                    <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 5px', borderRadius: 4 }}>business_management</code> permissions
                    for the &ldquo;With Catalog&rdquo; field, and leave &ldquo;With Catalog&rdquo; blank if you don&rsquo;t offer commerce/catalog signups.
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
                      Without Catalog (standard)
                    </label>
                    <input
                      className="form-input"
                      placeholder="e.g. 1234567890123456 — paste the 15-16 digit Configuration ID"
                      value={form.whatsappConfigId}
                      onChange={e => setForm(f => ({ ...f, whatsappConfigId: e.target.value }))}
                      style={{ borderColor: !form.whatsappConfigId ? 'rgba(220,38,38,0.4)' : undefined }}
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck="false"
                    />
                    <p style={{ marginTop: 5, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Used for customer support / bot-flow signups — no commerce permissions.
                    </p>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
                      With Catalog (commerce) <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>— optional</span>
                    </label>
                    <input
                      className="form-input"
                      placeholder="e.g. 9876543210123456 — separate Configuration ID with catalog permission"
                      value={form.whatsappConfigIdCatalog}
                      onChange={e => setForm(f => ({ ...f, whatsappConfigIdCatalog: e.target.value }))}
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck="false"
                    />
                    <p style={{ marginTop: 5, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Only needed if you offer catalog / product-card signups — leave blank otherwise.
                    </p>
                  </div>
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
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: form.isActive ? '#16a34a' : 'var(--text-secondary)' }}>
                  {form.isActive ? 'App Active (Ready for Webhooks)' : 'Inactive'}
                </span>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ minWidth: 120 }}>
                  {saving ? 'Saving…' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Save size={15} /> Save Settings</span>}
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleTest} disabled={testing} style={{ minWidth: 140 }}>
                  {testing ? 'Verifying…' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><RefreshCw size={15} /> Test Connection</span>}
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