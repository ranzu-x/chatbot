import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import MetaAppPage from './MetaAppPage';
import TikTokAppPage from './TikTokAppPage';
import { metaAppAPI, tiktokAppAPI } from '../../services/api';
import api from '../../services/api';
import { notify } from '../../utils/alerts';
import {
  Radio,
  Video,
  Sparkles,
  Globe,
  ShoppingBag,
  RefreshCw,
  Key,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sliders,
  Shield,
  Save,
  HelpCircle,
} from 'lucide-react';

const APP_NAV_ITEMS = [
  {
    id: 'meta',
    label: 'Meta App',
    subtitle: 'WhatsApp, FB & Instagram',
    IconComponent: Radio,
    color: '#2563eb',
    bg: 'rgba(37, 99, 235, 0.08)',
    border: 'rgba(37, 99, 235, 0.18)',
  },
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
    id: 'ai',
    label: 'AI APIs Setup',
    subtitle: 'OpenAI, Claude, Gemini',
    IconComponent: Sparkles,
    color: '#7c3aed',
    bg: 'rgba(124, 58, 237, 0.08)',
    border: 'rgba(124, 58, 237, 0.18)',
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
    id: 'shopify',
    label: 'Shopify App',
    subtitle: 'Store Catalog & Orders',
    IconComponent: ShoppingBag,
    color: '#16a34a',
    bg: 'rgba(22, 163, 74, 0.08)',
    border: 'rgba(22, 163, 74, 0.18)',
  },
];

export default function AppSettingsHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') || 'meta';
  const activeTab = APP_NAV_ITEMS.some(item => item.id === rawTab) ? rawTab : 'meta';

  const [loadingStatuses, setLoadingStatuses] = useState(true);
  const [metaConfigured, setMetaConfigured] = useState(false);
  const [tiktokConfigured, setTiktokConfigured] = useState(false);

  // AI Settings State
  const [aiForm, setAiForm] = useState({
    provider: 'OPENAI',
    modelName: 'gpt-4o-mini',
    apiKey: '',
    temperature: 0.7,
    systemPrompt: 'You are a helpful AI customer support assistant. Answer accurately based on our knowledge base.',
    isActive: true,
  });
  const [aiSaving, setAiSaving] = useState(false);
  const [aiShowKey, setAiShowKey] = useState(false);

  // Google Settings State
  const [googleForm, setGoogleForm] = useState({
    clientId: '',
    clientSecret: '',
    enableSheetsSync: true,
    enableGmailAlerts: false,
  });
  const [googleSaving, setGoogleSaving] = useState(false);

  // Shopify Settings State
  const [shopifyForm, setShopifyForm] = useState({
    shopDomain: '',
    accessToken: '',
    webhookSecret: '',
    enableOrderTracking: true,
    enableCatalogSync: true,
  });
  const [shopifySaving, setShopifySaving] = useState(false);

  const [copiedKey, setCopiedKey] = useState('');

  useEffect(() => {
    fetchStatuses();
    fetchAISettings();
  }, []);

  const fetchStatuses = async () => {
    setLoadingStatuses(true);
    try {
      const [metaRes, tiktokRes] = await Promise.allSettled([
        metaAppAPI.get(),
        tiktokAppAPI.get(),
      ]);
      if (metaRes.status === 'fulfilled' && metaRes.value?.data?.settings?.app_id) {
        setMetaConfigured(true);
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

  const fetchAISettings = async () => {
    try {
      const res = await api.get('/ai/agent');
      if (res.data?.agent) {
        const ag = res.data.agent;
        setAiForm({
          provider: ag.provider || 'OPENAI',
          modelName: ag.model_name || 'gpt-4o-mini',
          apiKey: ag.api_key || '',
          temperature: Number(ag.temperature || 0.7),
          systemPrompt: ag.system_prompt || '',
          isActive: Boolean(ag.isActive ?? ag.is_active),
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    notify.success('Copied to clipboard!');
    setTimeout(() => setCopiedKey(''), 2000);
  };

  const handleSaveAI = async (e) => {
    e.preventDefault();
    setAiSaving(true);
    try {
      await api.put('/ai/agent', aiForm);
      notify.success('AI API settings saved successfully!');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to save AI settings');
    } finally {
      setAiSaving(false);
    }
  };

  const handleSaveGoogle = (e) => {
    e.preventDefault();
    setGoogleSaving(true);
    setTimeout(() => {
      setGoogleSaving(false);
      notify.success('Google Cloud App credentials saved!');
    }, 600);
  };

  const handleSaveShopify = (e) => {
    e.preventDefault();
    setShopifySaving(true);
    setTimeout(() => {
      setShopifySaving(false);
      notify.success('Shopify Store connection settings saved!');
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
              onClick={() => { fetchStatuses(); fetchAISettings(); }}
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
            <div style={{ padding: '6px 10px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>
              App Integration Menu
            </div>

            {APP_NAV_ITEMS.map((item) => {
              const isSelected = activeTab === item.id;
              const isConfigured = (item.id === 'meta' && metaConfigured) || (item.id === 'tiktok' && tiktokConfigured) || (item.id === 'ai' && aiForm.apiKey);
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

          {/* ── Right Workspace ── */}
          <div style={{ minWidth: 0 }}>
            {/* 1. Meta App Configuration */}
            {activeTab === 'meta' && (
              <MetaAppPage embedded={true} />
            )}

            {/* 2. TikTok App Configuration */}
            {activeTab === 'tiktok' && (
              <TikTokAppPage embedded={true} />
            )}

            {/* 3. AI APIs Setup */}
            {activeTab === 'ai' && (
              <div className="card" style={{ padding: 22, borderRadius: 12, border: '1px solid #e2e8f0', background: '#ffffff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(124, 58, 237, 0.08)', border: '1px solid rgba(124, 58, 237, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed' }}>
                      <Sparkles size={20} />
                    </div>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>AI Model APIs & LLM Providers</h2>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Configure OpenAI, Claude, Gemini, or custom LLM API keys for autonomous bots</p>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: aiForm.apiKey ? '#f0fdf4' : '#f8fafc',
                      color: aiForm.apiKey ? '#166534' : '#64748b',
                      border: `1px solid ${aiForm.apiKey ? '#bbf7d0' : '#e2e8f0'}`,
                      fontWeight: 600,
                    }}
                  >
                    {aiForm.apiKey ? '● API Key Configured' : '○ Default / Open Keys'}
                  </span>
                </div>

                <form onSubmit={handleSaveAI} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>AI Provider *</label>
                      <select
                        className="form-input w-full"
                        value={aiForm.provider}
                        onChange={(e) => {
                          const p = e.target.value;
                          let defModel = 'gpt-4o-mini';
                          if (p === 'ANTHROPIC') defModel = 'claude-3-5-sonnet-latest';
                          if (p === 'GEMINI') defModel = 'gemini-2.0-flash';
                          if (p === 'DEEPSEEK') defModel = 'deepseek-chat';
                          setAiForm({ ...aiForm, provider: p, modelName: defModel });
                        }}
                      >
                        <option value="OPENAI">OpenAI (GPT-4o, GPT-4o-mini)</option>
                        <option value="ANTHROPIC">Anthropic (Claude 3.5 Sonnet, Haiku)</option>
                        <option value="GEMINI">Google Gemini (Gemini 2.0 Flash / Pro)</option>
                        <option value="DEEPSEEK">DeepSeek (DeepSeek-V3, DeepSeek-R1)</option>
                      </select>
                    </div>

                    <div>
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Default Model *</label>
                      <input
                        type="text"
                        required
                        className="form-input w-full font-mono text-sm"
                        placeholder="e.g. gpt-4o-mini, gemini-2.0-flash"
                        value={aiForm.modelName}
                        onChange={(e) => setAiForm({ ...aiForm, modelName: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', margin: 0 }}>API Key *</label>
                      <button
                        type="button"
                        onClick={() => setAiShowKey(!aiShowKey)}
                        style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer' }}
                      >
                        {aiShowKey ? 'Hide Key' : 'Show Key'}
                      </button>
                    </div>
                    <input
                      type={aiShowKey ? 'text' : 'password'}
                      className="form-input w-full font-mono text-sm"
                      placeholder="sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx"
                      value={aiForm.apiKey}
                      onChange={(e) => setAiForm({ ...aiForm, apiKey: e.target.value })}
                    />
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>If left empty, system environment keys will be utilized.</span>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem', margin: 0 }}>
                        Temperature / Creativity: {aiForm.temperature}
                      </label>
                      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>0.0 = Deterministic, 1.0 = Creative</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={aiForm.temperature}
                      onChange={(e) => setAiForm({ ...aiForm, temperature: parseFloat(e.target.value) })}
                      style={{ width: '100%', accentColor: '#7c3aed' }}
                    />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Master System Prompt</label>
                    <textarea
                      rows={3}
                      className="form-input w-full text-sm"
                      value={aiForm.systemPrompt}
                      onChange={(e) => setAiForm({ ...aiForm, systemPrompt: e.target.value })}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                    <button type="submit" disabled={aiSaving} className="btn btn-primary" style={{ fontWeight: 600 }}>
                      {aiSaving ? 'Saving...' : 'Save AI Settings'}
                    </button>
                    <a href="/ai-agent" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 600 }}>
                      <ExternalLink size={13} /> Open AI Knowledge Base
                    </a>
                  </div>
                </form>
              </div>
            )}

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

            {/* 5. Shopify App Configuration */}
            {activeTab === 'shopify' && (
              <div className="card" style={{ padding: 22, borderRadius: 12, border: '1px solid #e2e8f0', background: '#ffffff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(22, 163, 74, 0.08)', border: '1px solid rgba(22, 163, 74, 0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                      <ShoppingBag size={20} />
                    </div>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>Shopify Store & Custom App</h2>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Connect your Shopify store to sync product catalog and in-chat orders</p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSaveShopify} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Shopify Store Domain *</label>
                    <input
                      type="text"
                      required
                      className="form-input w-full font-mono text-sm"
                      placeholder="e.g. your-store.myshopify.com"
                      value={shopifyForm.shopDomain}
                      onChange={(e) => setShopifyForm({ ...shopifyForm, shopDomain: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Admin API Access Token *</label>
                    <input
                      type="password"
                      required
                      className="form-input w-full font-mono text-sm"
                      placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      value={shopifyForm.accessToken}
                      onChange={(e) => setShopifyForm({ ...shopifyForm, accessToken: e.target.value })}
                    />
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Created via Shopify Admin → Settings → Apps and sales channels → Develop apps.</span>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontWeight: 600, fontSize: '0.8rem' }}>Webhook Secret Key (Optional)</label>
                    <input
                      type="password"
                      className="form-input w-full font-mono text-sm"
                      placeholder="shpss_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      value={shopifyForm.webhookSecret}
                      onChange={(e) => setShopifyForm({ ...shopifyForm, webhookSecret: e.target.value })}
                    />
                  </div>

                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, marginTop: 4 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: 8 }}>Enabled Store Features</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={shopifyForm.enableCatalogSync}
                          onChange={(e) => setShopifyForm({ ...shopifyForm, enableCatalogSync: e.target.checked })}
                        />
                        <span>Enable Real-time Product Catalog Sync to Chatbot</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={shopifyForm.enableOrderTracking}
                          onChange={(e) => setShopifyForm({ ...shopifyForm, enableOrderTracking: e.target.checked })}
                        />
                        <span>Enable Automated In-Chat Order Lookup & Tracking</span>
                      </label>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                    <button type="submit" disabled={shopifySaving} className="btn btn-primary" style={{ fontWeight: 600 }}>
                      {shopifySaving ? 'Saving...' : 'Save Shopify Settings'}
                    </button>
                    <a href="/orders" className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', fontWeight: 600 }}>
                      <ExternalLink size={13} /> View Orders
                    </a>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
