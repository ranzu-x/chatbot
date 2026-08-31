import { useState, useEffect, useMemo } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { tiktokAppAPI } from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';
import { notify } from '../../utils/alerts';
import { Video, Key, Lock, Copy, Check, ExternalLink, ShieldCheck, Sparkles, RefreshCw, Globe, HelpCircle } from 'lucide-react';

function generateRandomToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let random = '';
  for (let i = 0; i < 24; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `nexa_tiktok_${random}`;
}

export default function TikTokAppPage({ embedded = false }) {
  const { user } = useAuth();
  const [agencyId, setAgencyId] = useState(user?.agencyId || 1);

  const defaultPublicUrl = useMemo(() => {
    return window.location.origin;
  }, []);

  const [publicDomain, setPublicDomain] = useState(defaultPublicUrl);

  const [form, setForm] = useState({
    appName: '',
    clientKey: '',
    clientSecret: '',
    verifyToken: generateRandomToken(),
    redirectUri: `${window.location.origin}/auth/tiktok/callback`,
    isActive: true,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');

  const cleanPublicBase = useMemo(() => {
    let url = publicDomain.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }
    return url.replace(/\/+$/, '');
  }, [publicDomain]);

  const webhookCallbackUrl = useMemo(() => {
    return `${cleanPublicBase}/api/v1/webhook/tiktok/${agencyId}`;
  }, [cleanPublicBase, agencyId]);

  const dynamicRedirectUrl = useMemo(() => {
    return `${cleanPublicBase}/auth/tiktok/callback`;
  }, [cleanPublicBase]);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await tiktokAppAPI.get();
      if (res.data) {
        if (res.data.agencyId) setAgencyId(res.data.agencyId);
        if (res.data.settings) {
          const s = res.data.settings;
          setForm({
            appName: s.app_name || 'My TikTok App',
            clientKey: s.client_key || '',
            clientSecret: s.client_secret || '',
            verifyToken: s.verify_token || res.data.generatedVerifyToken || generateRandomToken(),
            redirectUri: s.redirect_uri || dynamicRedirectUrl,
            isActive: s.is_active !== 0,
          });
        } else if (res.data.generatedVerifyToken) {
          setForm(f => ({ ...f, verifyToken: res.data.generatedVerifyToken }));
        }
      }
    } catch (err) {
      console.error('Failed to load TikTok app settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    notify.success('Copied to clipboard!');
    setTimeout(() => setCopiedKey(''), 2000);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await tiktokAppAPI.save({
        ...form,
        redirectUri: dynamicRedirectUrl,
        customWebhookUrl: webhookCallbackUrl,
      });
      notify.success(res.data?.message || 'TikTok App credentials saved successfully!');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to save TikTok settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await tiktokAppAPI.test();
      notify.success(res.data?.message || 'TikTok App credentials verified!');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const LayoutWrapper = embedded ? ({ children }) => <div>{children}</div> : AppLayout;

  return (
    <LayoutWrapper>
      {!embedded && (
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(15, 23, 42, 0.06)', border: '1px solid rgba(15, 23, 42, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f172a' }}>
                  <Video size={20} />
                </div>
                <div>
                  <h1 className="page-title" style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>TikTok Developer App Setup</h1>
                  <p className="page-subtitle" style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
                    Configure TikTok Developer Portal credentials for direct messaging and automated replies
                  </p>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <a
                href="https://developers.tiktok.com/"
                target="_blank"
                rel="noreferrer"
                className="btn btn-secondary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 600 }}
              >
                <ExternalLink size={13} /> TikTok Developer Portal
              </a>
            </div>
          </div>
        </div>
      )}

      <div className={embedded ? "" : "page-body"}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 20 }}>
          {/* Left Column: Form */}
          <div className="card" style={{ padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Key size={16} color="#0f172a" /> App Credentials
              </h3>
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '3px 8px',
                  borderRadius: 6,
                  background: form.clientKey ? '#f0fdf4' : '#f8fafc',
                  color: form.clientKey ? '#166534' : '#64748b',
                  border: `1px solid ${form.clientKey ? '#bbf7d0' : '#e2e8f0'}`,
                  fontWeight: 600,
                }}
              >
                {form.clientKey ? '● Configured' : '○ Not Configured'}
              </span>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem' }}>App Name *</label>
                <input
                  type="text"
                  required
                  className="form-input w-full"
                  placeholder="e.g. My Chatbot TikTok App"
                  value={form.appName}
                  onChange={(e) => setForm({ ...form, appName: e.target.value })}
                />
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem' }}>Client Key (App ID) *</label>
                <input
                  type="text"
                  required
                  className="form-input w-full font-mono text-sm"
                  placeholder="e.g. awxxxxxxxxxxxxxx"
                  value={form.clientKey}
                  onChange={(e) => setForm({ ...form, clientKey: e.target.value })}
                />
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Found in your TikTok Developer Portal App Overview.</span>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem', margin: 0 }}>Client Secret *</label>
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    {showSecret ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  type={showSecret ? 'text' : 'password'}
                  required
                  className="form-input w-full font-mono text-sm"
                  placeholder="e.g. 1a2b3c4d5e6f7g8h9i0j..."
                  value={form.clientSecret}
                  onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '0.82rem', margin: 0 }}>Webhook Verify Token *</label>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, verifyToken: generateRandomToken() })}
                    style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                  >
                    <RefreshCw size={11} /> Regenerate
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    required
                    readOnly
                    className="form-input w-full font-mono text-sm bg-slate-50"
                    value={form.verifyToken}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleCopy(form.verifyToken, 'verifyToken')}
                  >
                    {copiedKey === 'verifyToken' ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary flex-1"
                  style={{ fontWeight: 600 }}
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
                {form.clientKey && (
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={testing}
                    className="btn btn-secondary"
                    style={{ fontWeight: 600 }}
                  >
                    {testing ? 'Testing...' : 'Test Connection'}
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Right Column: Callback & Webhook Setup */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="card" style={{ padding: 18, borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Globe size={15} color="#0284c7" /> Webhook & OAuth Endpoints
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>
                    Webhook Callback URL:
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      readOnly
                      className="form-input w-full font-mono text-xs bg-slate-50"
                      value={webhookCallbackUrl}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleCopy(webhookCallbackUrl, 'webhook')}
                    >
                      {copiedKey === 'webhook' ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>
                    OAuth Redirect URI:
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      readOnly
                      className="form-input w-full font-mono text-xs bg-slate-50"
                      value={dynamicRedirectUrl}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleCopy(dynamicRedirectUrl, 'redirect')}
                    >
                      {copiedKey === 'redirect' ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Setup Instructions */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <HelpCircle size={14} color="#64748b" /> Developer Portal Instructions:
              </div>
              <ol style={{ paddingLeft: 16, fontSize: '0.76rem', color: '#475569', lineHeight: 1.6, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <li>Log in to <strong>developers.tiktok.com</strong> and click <strong>Manage apps</strong></li>
                <li>Create an App or select your existing TikTok App</li>
                <li>Copy the <strong>Client Key</strong> & <strong>Client Secret</strong> and paste them here</li>
                <li>Add the <strong>OAuth Redirect URI</strong> to your app settings</li>
                <li>In Webhooks, paste the <strong>Webhook Callback URL</strong> and <strong>Verify Token</strong></li>
                <li>Click <strong>Save Settings</strong> to complete setup</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </LayoutWrapper>
  );
}
