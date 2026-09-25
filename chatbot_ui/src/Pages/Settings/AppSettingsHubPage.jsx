import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import MetaAppPage from './MetaAppPage';
import TikTokAppPage from './TikTokAppPage';
import StoreConnectionsManager from '../../Components/Commerce/StoreConnectionsManager';
import { metaAppAPI, tiktokAppAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import {
  Radio,
  Video,
  Globe,
  ShoppingBag,
  RefreshCw,
  Key,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Sliders,
  Shield,
  Save,
  HelpCircle,
  MessageCircle,
} from 'lucide-react';

const APP_NAV_GROUPS = [
  {
    category: 'Meta / Facebook Apps',
    items: [
      {
        id: 'meta_whatsapp',
        label: 'WhatsApp App',
        subtitle: 'Cloud API & Embedded Signup',
        IconComponent: MessageCircle,
        color: '#25d366',
        bg: 'rgba(37, 211, 102, 0.1)',
        border: 'rgba(37, 211, 102, 0.25)',
      },
      {
        id: 'meta_messenger',
        label: 'Facebook & Messenger',
        subtitle: 'Pages, Messenger & Instagram DMs',
        IconComponent: Radio,
        color: '#1877f2',
        bg: 'rgba(24, 119, 242, 0.08)',
        border: 'rgba(24, 119, 242, 0.18)',
      },
    ],
  },
  {
    category: 'Other Platforms',
    items: [
      {
        id: 'tiktok',
        label: 'TikTok App',
        subtitle: 'DMs & Comment Replies',
        IconComponent: Video,
        color: '#0f172a',
        bg: 'rgba(15, 23, 42, 0.06)',
        border: 'rgba(15, 23, 42, 0.15)',
      },
      {
        id: 'google',
        label: 'Google App',
        subtitle: 'OAuth, Sheets & Gmail',
        IconComponent: Globe,
        color: '#0284c7',
        bg: 'rgba(2, 132, 199, 0.08)',
        border: 'rgba(2, 132, 199, 0.18)',
      },
      {
        id: 'store_api',
        label: 'Store API',
        subtitle: 'Shopify & WooCommerce',
        IconComponent: ShoppingBag,
        color: '#16a34a',
        bg: 'rgba(22, 163, 74, 0.08)',
        border: 'rgba(22, 163, 74, 0.18)',
      },
    ],
  },
];

const APP_NAV_ITEMS = APP_NAV_GROUPS.flatMap((g) => g.items);

export default function AppSettingsHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') || 'meta_whatsapp';
  const resolveTab = (t) => {
    if (t === 'meta' || t === 'whatsapp') return 'meta_whatsapp';
    if (t === 'messenger' || t === 'facebook') return 'meta_messenger';
    if (t === 'shopify' || t === 'woocommerce' || t === 'store') return 'store_api';
    return APP_NAV_ITEMS.some(item => item.id === t) ? t : 'meta_whatsapp';
  };
  const activeTab = resolveTab(rawTab);

  const [loadingStatuses, setLoadingStatuses] = useState(true);
  const [whatsappConfigured, setWhatsappConfigured] = useState(false);
  const [messengerConfigured, setMessengerConfigured] = useState(false);
  const [tiktokConfigured, setTiktokConfigured] = useState(false);

  // Google Settings State
  const [googleForm, setGoogleForm] = useState({
    clientId: '',
    clientSecret: '',
    enableSheetsSync: true,
    enableGmailAlerts: false,
  });
  const [googleSaving, setGoogleSaving] = useState(false);

  const [copiedKey, setCopiedKey] = useState('');

  useEffect(() => {
    fetchStatuses();
  }, []);

  const fetchStatuses = async () => {
    setLoadingStatuses(true);
    try {
      const [whatsappRes, messengerRes, tiktokRes] = await Promise.allSettled([
        metaAppAPI.get('WHATSAPP'),
        metaAppAPI.get('MESSENGER_INSTAGRAM'),
        tiktokAppAPI.get(),
      ]);
      if (whatsappRes.status === 'fulfilled' && whatsappRes.value?.data?.settings?.app_id) {
        setWhatsappConfigured(true);
      }
      if (messengerRes.status === 'fulfilled' && messengerRes.value?.data?.settings?.app_id) {
        setMessengerConfigured(true);
      }
      if (tiktokRes.status === 'fulfilled' && tiktokRes.value?.data?.settings?.client_key) {
        setTiktokConfigured(true);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingStatuses(false);
    }
  };

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    notify.success('Copied to clipboard!');
    setTimeout(() => setCopiedKey(''), 2000);
  };

  const handleSaveGoogle = (e) => {
    e.preventDefault();
    setGoogleSaving(true);
    setTimeout(() => {
      setGoogleSaving(false);
      notify.success('Google Cloud App credentials saved!');
    }, 600);
  };

  const setTab = (tab) => {
    setSearchParams({ tab });
  };

  const googleRedirectUri = `${window.location.origin}/auth/google/callback`;

  return (
    <AppLayout>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
          <div>
            <h1 className="page-title" style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>
              App Integrations & Settings
            </h1>
            <p className="page-subtitle" style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
              Configure master developer credentials, third-party messaging platforms, AI engines, and external apps
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => fetchStatuses()}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 600 }}
            >
              <RefreshCw size={12} /> Refresh Status
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Split Screen Layout: Left Sub-Menu & Right Workspace */}
        <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 20, alignItems: 'flex-start' }}>
          {/* ── Left Sub-Menu ── */}
          <div
            className="card"
            style={{
              padding: 10,
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              position: 'sticky',
              top: 20,
            }}
          >
            {APP_NAV_GROUPS.map((group, groupIdx) => (
              <div key={group.category} style={{ marginBottom: groupIdx < APP_NAV_GROUPS.length - 1 ? 12 : 0 }}>
                <div style={{
                  padding: '6px 10px 4px',
                  fontSize: '0.67rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#94a3b8',
                  borderTop: groupIdx > 0 ? '1px solid #f1f5f9' : 'none',
                  marginTop: groupIdx > 0 ? 6 : 0,
                  paddingTop: groupIdx > 0 ? 8 : 4,
                }}>
                  {group.category}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {group.items.map((item) => {
                    const isSelected = activeTab === item.id;
                    const isConfigured =
                      (item.id === 'meta_whatsapp' && whatsappConfigured) ||
                      (item.id === 'meta_messenger' && messengerConfigured) ||
                      (item.id === 'tiktok' && tiktokConfigured);
                    const Icon = item.IconComponent;

                    return (
                      <button
                        key={item.id}
                        onClick={() => setTab(item.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '9px 12px',
                          borderRadius: 8,
                          border: isSelected ? '1px solid #cbd5e1' : '1px solid transparent',
                          background: isSelected ? '#f1f5f9' : 'transparent',
                          color: isSelected ? '#0f172a' : '#475569',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'background 0.15s ease',
                          width: '100%',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.background = '#f8fafc';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              background: item.bg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: isSelected ? '#0f172a' : item.color,
                              flexShrink: 0,
                            }}
                          >
                            <Icon size={16} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: isSelected ? 700 : 600, fontSize: '0.82rem', color: isSelected ? '#0f172a' : '#334155' }}>
                              {item.label}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.subtitle}
                            </div>
                          </div>
                        </div>

                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: isConfigured ? '#16a34a' : isSelected ? '#94a3b8' : '#cbd5e1',
                            flexShrink: 0,
                          }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* ── Right Workspace ── */}
          <div style={{ minWidth: 0 }}>
            {/* 1. WhatsApp Meta App Configuration */}
            {(activeTab === 'meta_whatsapp' || activeTab === 'meta') && (
              <MetaAppPage embedded={true} forcedPlatformGroup="WHATSAPP" />
            )}

            {/* 2. Facebook & Messenger Meta App Configuration */}
            {activeTab === 'meta_messenger' && (
              <MetaAppPage embedded={true} forcedPlatformGroup="MESSENGER_INSTAGRAM" />
            )}

            {/* 3. TikTok App Configuration */}
            {activeTab === 'tiktok' && (
              <TikTokAppPage embedded={true} />
            )}

            {/* 3. AI APIs Setup */}
            {/* AI provider setup now lives at Settings → AI Providers (a dedicated
                page — see Pages/Settings/AIProvidersPage.jsx), and Agents are
                managed inside Bot Manager → AI. */}

            {/* 4. Google App Configuration */}
            {activeTab === 'google' && (
              <div className="card" style={{ padding: 22, borderRadius: 12, border: '1px solid #e2e8f0', background: '#ffffff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(2, 132, 199, 0.08)', border: '1px solid rgba(2, 132, 199, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0284c7' }}>
                      <Globe size={20} />
                    </div>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>Google Cloud & Workspace App</h2>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Configure Google OAuth Client credentials for Google Sheets & Gmail sync</p>
                    </div>
                  </div>
                </div>

                {/* The live Google Sheets connection (used by User Input Flow exports)
                    is a real, working feature on its own page — the credential form
                    below is still a UI placeholder and does not persist anything yet. */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
                  padding: '14px 16px', marginBottom: 18, borderRadius: 10,
                  border: '1px solid rgba(16,185,129,0.25)', background: 'rgba(16,185,129,0.06)',
                }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#065f46' }}>
                      Google Sheets connection
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#047857', marginTop: 2, lineHeight: 1.5 }}>
                      Connect a Google account so User Input Flow responses can be written straight into a spreadsheet.
                    </div>
                  </div>
                  <a
                    href="/settings/google-sheets"
                    style={{
                      padding: '9px 16px', borderRadius: 8, textDecoration: 'none',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: '#fff', fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap',
                    }}
                  >
                    Open Google Sheets setup →
                  </a>
                </div>

                <form onSubmit={handleSaveGoogle} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Google Client ID *</label>
                    <input
                      type="text"
                      required
                      className="form-input w-full font-mono text-sm"
                      placeholder="e.g. 1234567890-xxxxxxxx.apps.googleusercontent.com"
                      value={googleForm.clientId}
                      onChange={(e) => setGoogleForm({ ...googleForm, clientId: e.target.value })}
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck="false"
                    />
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Obtain from Google Cloud Console → APIs & Services → Credentials.</span>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Google Client Secret *</label>
                    <input
                      type="password"
                      required
                      className="form-input w-full font-mono text-sm"
                      placeholder="GOCSPX-xxxxxxxxxxxxxxxx"
                      value={googleForm.clientSecret}
                      onChange={(e) => setGoogleForm({ ...googleForm, clientSecret: e.target.value })}
                      autoComplete="new-password"
                      autoCorrect="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-1p-ignore="true"
                    />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.78rem' }}>Authorized Redirect URI</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="text"
                        readOnly
                        className="form-input w-full font-mono text-xs bg-slate-50"
                        value={googleRedirectUri}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleCopy(googleRedirectUri, 'googleRedirect')}
                      >
                        {copiedKey === 'googleRedirect' ? <Check size={13} color="#16a34a" /> : <Copy size={13} />}
                      </button>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Paste this URI in your Google Cloud Console OAuth 2.0 Client credentials.</span>
                  </div>

                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, marginTop: 4 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: 8 }}>Enabled Integrations</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={googleForm.enableSheetsSync}
                          onChange={(e) => setGoogleForm({ ...googleForm, enableSheetsSync: e.target.checked })}
                        />
                        <span>Enable Real-time Lead Export to <strong>Google Sheets</strong></span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={googleForm.enableGmailAlerts}
                          onChange={(e) => setGoogleForm({ ...googleForm, enableGmailAlerts: e.target.checked })}
                        />
                        <span>Enable Automated Notifications via <strong>Gmail API</strong></span>
                      </label>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                    <button type="submit" disabled={googleSaving} className="btn btn-primary" style={{ fontWeight: 600 }}>
                      {googleSaving ? 'Saving...' : 'Save Google App Settings'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* 5. Store API — Shopify & WooCommerce (utils/commerceService.js) */}
            {activeTab === 'store_api' && (
              <div className="card" style={{ padding: 22, borderRadius: 12, border: '1px solid #e2e8f0', background: '#ffffff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(22, 163, 74, 0.08)', border: '1px solid rgba(22, 163, 74, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                    <ShoppingBag size={20} />
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>Store API Settings</h2>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                      Connect Shopify or WooCommerce stores, then set up order, COD and abandoned-cart messages in Automation → Commerce.
                    </p>
                  </div>
                </div>
                <StoreConnectionsManager />
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
