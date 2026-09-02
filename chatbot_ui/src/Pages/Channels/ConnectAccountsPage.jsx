import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import { integrationAPI, channelAPI, botAPI } from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';
import WhatsAppPage from './WhatsAppPage';
import FacebookPage from './FacebookPage';
import InstagramPage from './InstagramPage';
import TelegramPage from './TelegramPage';
import TikTokPage from './TikTokPage';
import WebchatPage from './WebchatPage';
import {
  Radio,
  MessageCircle,
  Facebook,
  Instagram,
  Send,
  Globe,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Sliders,
  Shield,
  Layers,
  ArrowUpRight,
  Zap,
  Activity,
  X,
  Lock,
  Video,
  ShoppingBag,
} from 'lucide-react';

const CHANNELS = [
  { id: 'all',       label: 'All Connected Accounts', icon: Layers,        color: '#2563eb', bg: 'rgba(37, 99, 235, 0.08)' },
  { id: 'whatsapp',  label: 'WhatsApp',               icon: MessageCircle, color: '#25d366', bg: 'rgba(37, 211, 102, 0.08)' },
  { id: 'facebook',  label: 'Facebook Messenger',     icon: Facebook,      color: '#1877f2', bg: 'rgba(24, 119, 242, 0.08)' },
  { id: 'instagram', label: 'Instagram DM',           icon: Instagram,     color: '#e1306c', bg: 'rgba(225, 48, 108, 0.08)' },
  { id: 'telegram',  label: 'Telegram Bot',           icon: Send,          color: '#229ed9', bg: 'rgba(34, 158, 217, 0.08)' },
  { id: 'tiktok',    label: 'TikTok DM & Comments',   icon: Video,         color: '#FE2C55', bg: 'rgba(254, 44, 85, 0.08)' },
  { id: 'webchat',   label: 'Live Webchat',           icon: Globe,         color: '#6366f1', bg: 'rgba(99, 102, 241, 0.08)' },
];

function getPlatformBadge(platform = '') {
  const p = (platform || '').toUpperCase();
  if (p === 'WHATSAPP')  return { label: 'WhatsApp',  color: '#25d366', bg: 'rgba(37, 211, 102, 0.1)',  icon: MessageCircle };
  if (p === 'FACEBOOK')  return { label: 'Facebook',  color: '#1877f2', bg: 'rgba(24, 119, 242, 0.1)',  icon: Facebook };
  if (p === 'INSTAGRAM') return { label: 'Instagram', color: '#e1306c', bg: 'rgba(225, 48, 108, 0.1)', icon: Instagram };
  if (p === 'TELEGRAM')  return { label: 'Telegram',  color: '#229ed9', bg: 'rgba(34, 158, 217, 0.1)', icon: Send };
  if (p === 'TIKTOK')    return { label: 'TikTok',    color: '#FE2C55', bg: 'rgba(254, 44, 85, 0.1)',   icon: Video };
  if (p === 'WEBCHAT')   return { label: 'Webchat',   color: '#2563eb', bg: 'rgba(37, 99, 235, 0.1)',  icon: Globe };
  return { label: p || 'Channel', color: '#64748b', bg: 'rgba(100, 116, 139, 0.1)', icon: Radio };
}

export default function ConnectAccountsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'all');

  // Synchronize activeTab if URL query params change (e.g. back/forward navigation)
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab') || 'all';
    if (tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('ALL');
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fetchIntegrations = async () => {
    setLoading(true);
    try {
      const res = await integrationAPI.getAll();
      setIntegrations(res.data?.integrations || []);
    } catch (err) {
      console.error('Failed to load integrations', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const setTab = (tabId) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId }, { replace: true });
  };

  const handleCopyWebhook = (id, url) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteIntegration = async (id) => {
    if (!window.confirm('Are you sure you want to disconnect this channel account?')) return;
    setDeletingId(id);
    try {
      await integrationAPI.delete(id);
      setIntegrations((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      console.error('Failed to delete integration', err);
      alert('Failed to disconnect account.');
    } finally {
      setDeletingId(null);
    }
  };

  // Metrics summary
  const metrics = useMemo(() => {
    const counts = { WHATSAPP: 0, FACEBOOK: 0, INSTAGRAM: 0, TELEGRAM: 0, WEBCHAT: 0 };
    integrations.forEach((item) => {
      const p = (item.platform || '').toUpperCase();
      if (counts[p] !== undefined) counts[p]++;
    });
    return counts;
  }, [integrations]);

  const filteredIntegrations = useMemo(() => {
    return integrations.filter((item) => {
      const matchesPlatform = filterPlatform === 'ALL' || (item.platform || '').toUpperCase() === filterPlatform;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        (item.name || '').toLowerCase().includes(q) ||
        (item.wa_phone_number_id || '').toLowerCase().includes(q) ||
        (item.fb_page_name || item.fb_page_id || '').toLowerCase().includes(q) ||
        (item.ig_username || item.ig_account_id || '').toLowerCase().includes(q);
      return matchesPlatform && matchesSearch;
    });
  }, [integrations, filterPlatform, searchQuery]);

  return (
    <AppLayout>
      <div style={{ width: '100%', padding: '16px 20px' }}>
        {/* ── Top Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 9,
                  background: 'rgba(37, 99, 235, 0.08)',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Radio size={19} />
              </div>
              <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.3px' }}>
                Connect Account
              </h1>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2, marginLeft: 46 }}>
              Connect and manage all your messaging channels in one centralized hub
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={fetchIntegrations}
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', height: 34, padding: '0 12px' }}
            >
              <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
            </button>

            <button
              onClick={() => setShowConnectModal(true)}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', height: 34, padding: '0 14px' }}
            >
              <Plus size={15} /> + Connect New Account
            </button>
          </div>
        </div>

        {/* ── Channel Metrics Overview Cards ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div
            onClick={() => setTab('whatsapp')}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.12s',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(37, 211, 102, 0.1)', color: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageCircle size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>WhatsApp</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{metrics.WHATSAPP} Active</div>
              </div>
            </div>
            <ArrowUpRight size={15} color="#94a3b8" />
          </div>

          <div
            onClick={() => setTab('facebook')}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.12s',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(24, 119, 242, 0.1)', color: '#1877f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Facebook size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Facebook</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{metrics.FACEBOOK} Pages</div>
              </div>
            </div>
            <ArrowUpRight size={15} color="#94a3b8" />
          </div>

          <div
            onClick={() => setTab('instagram')}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.12s',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(225, 48, 108, 0.1)', color: '#e1306c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Instagram size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Instagram</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{metrics.INSTAGRAM} Accounts</div>
              </div>
            </div>
            <ArrowUpRight size={15} color="#94a3b8" />
          </div>

          <div
            onClick={() => setTab('telegram')}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.12s',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(34, 158, 217, 0.1)', color: '#229ed9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Send size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Telegram</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{metrics.TELEGRAM} Bots</div>
              </div>
            </div>
            <ArrowUpRight size={15} color="#94a3b8" />
          </div>

          <div
            onClick={() => setTab('webchat')}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.12s',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Globe size={18} />
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Webchat</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{metrics.WEBCHAT} Widgets</div>
              </div>
            </div>
            <ArrowUpRight size={15} color="#94a3b8" />
          </div>
        </div>

        {/* ── Navigation Tab Bar ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: '4px 6px',
            marginBottom: 14,
            overflowX: 'auto',
          }}
        >
          {CHANNELS.map((ch) => {
            const Icon = ch.icon;
            const isSelected = activeTab === ch.id;
            return (
              <button
                key={ch.id}
                onClick={() => setTab(ch.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 14px',
                  borderRadius: 7,
                  fontSize: '0.82rem',
                  fontWeight: isSelected ? 700 : 500,
                  color: isSelected ? '#ffffff' : '#475569',
                  background: isSelected ? '#2563eb' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all 0.12s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon size={15} color={isSelected ? '#ffffff' : ch.color} />
                <span>{ch.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Tab Contents ── */}
        {activeTab === 'all' && (
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            {/* Search & Channel Filter Bar */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {['ALL', 'WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'WEBCHAT'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setFilterPlatform(p)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      border: '1px solid',
                      borderColor: filterPlatform === p ? '#2563eb' : '#e2e8f0',
                      background: filterPlatform === p ? 'rgba(37, 99, 235, 0.08)' : '#ffffff',
                      color: filterPlatform === p ? '#2563eb' : '#64748b',
                      cursor: 'pointer',
                    }}
                  >
                    {p === 'ALL' ? 'All Channels' : p}
                  </button>
                ))}
              </div>

              <div style={{ position: 'relative', width: 240 }}>
                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Search accounts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: 30, height: 32, fontSize: '0.82rem' }}
                />
              </div>
            </div>

            {/* Master Connected Accounts Table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Channel</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Account Name</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Identifier / ID</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Webhook URL</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                    <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                        <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                        Loading connected accounts...
                      </td>
                    </tr>
                  ) : filteredIntegrations.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                        No connected accounts found. Click <strong>"+ Connect New Account"</strong> to get started.
                      </td>
                    </tr>
                  ) : (
                    filteredIntegrations.map((item) => {
                      const badge = getPlatformBadge(item.platform);
                      const BadgeIcon = badge.icon;
                      const identifier =
                        item.wa_display_phone ||
                        item.wa_phone_number_id ||
                        item.fb_page_id ||
                        item.ig_account_id ||
                        item.external_id ||
                        `ID: ${item.id}`;

                      const webhookUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1'}/webhook/${item.agency_id}/${item.id}`;

                      return (
                        <tr
                          key={item.id}
                          style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.12s' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#fafbfe')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                        >
                          <td style={{ padding: '12px 14px' }}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 5,
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: 10,
                                background: badge.bg,
                                color: badge.color,
                              }}
                            >
                              <BadgeIcon size={12} /> {badge.label}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a' }}>
                            {item.account_name || `${badge.label} Integration`}
                          </td>
                          <td style={{ padding: '12px 14px', color: '#64748b', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                            {identifier}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: '0.74rem', color: '#64748b', fontFamily: 'monospace', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {webhookUrl}
                              </span>
                              <button
                                onClick={() => handleCopyWebhook(item.id, webhookUrl)}
                                title="Copy Webhook URL"
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '3px 7px', fontSize: '0.72rem' }}
                              >
                                {copiedId === item.id ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                              </button>
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', fontWeight: 600, color: item.status === 'CONNECTED' ? '#10b981' : '#f59e0b' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: item.status === 'CONNECTED' ? '#10b981' : '#f59e0b' }} />
                              {item.status || 'Active'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                              <button
                                onClick={() => setTab(item.platform?.toLowerCase())}
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              >
                                Configure
                              </button>
                              <button
                                onClick={() => handleDeleteIntegration(item.id)}
                                disabled={deletingId === item.id}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: 6,
                                  border: '1px solid #fee2e2',
                                  background: '#fef2f2',
                                  color: '#ef4444',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                                title="Disconnect Account"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Sub Channel Dedicated Pages ── */}
        {activeTab === 'whatsapp' && (
          <div style={{ marginTop: 10 }}>
            <WhatsAppPage embedded />
          </div>
        )}

        {activeTab === 'facebook' && (
          <div style={{ marginTop: 10 }}>
            <FacebookPage embedded />
          </div>
        )}

        {activeTab === 'instagram' && (
          <div style={{ marginTop: 10 }}>
            <InstagramPage embedded />
          </div>
        )}

        {activeTab === 'telegram' && (
          <div style={{ marginTop: 10 }}>
            <TelegramPage embedded />
          </div>
        )}

        {activeTab === 'tiktok' && (
          <div style={{ marginTop: 10 }}>
            <TikTokPage embedded />
          </div>
        )}

        {activeTab === 'webchat' && (
          <div style={{ marginTop: 10 }}>
            <WebchatPage embedded />
          </div>
        )}
      </div>

      {/* ── "+ Connect New Account" Selection Modal ── */}
      {showConnectModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={() => setShowConnectModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: 16,
              maxWidth: 580,
              width: '100%',
              padding: '24px 26px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Connect a Channel Account
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0' }}>
                  Select the platform you would like to integrate
                </p>
              </div>
              <button
                onClick={() => setShowConnectModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
              {/* WhatsApp Without Catalog */}
              <div
                onClick={() => { setShowConnectModal(false); setTab('whatsapp'); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(37, 211, 102, 0.1)', color: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MessageCircle size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>WhatsApp (Without Catalog)</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Standard messaging, chatbot bot flows & live chat support</div>
                  </div>
                </div>
                <ArrowUpRight size={16} color="#94a3b8" />
              </div>

              {/* WhatsApp With Catalog */}
              <div
                onClick={() => { setShowConnectModal(false); setTab('whatsapp'); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ShoppingBag size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>WhatsApp (With Catalog)</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Meta commerce & product catalog sync for in-chat store sales</div>
                  </div>
                </div>
                <ArrowUpRight size={16} color="#94a3b8" />
              </div>

              <div
                onClick={() => { setShowConnectModal(false); setTab('facebook'); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(24, 119, 242, 0.1)', color: '#1877f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Facebook size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>Facebook Messenger</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Connect Facebook Pages for automated messages & comments</div>
                  </div>
                </div>
                <ArrowUpRight size={16} color="#94a3b8" />
              </div>

              <div
                onClick={() => { setShowConnectModal(false); setTab('instagram'); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(225, 48, 108, 0.1)', color: '#e1306c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Instagram size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>Instagram Direct</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Connect Instagram Business Profiles & handle DMs</div>
                  </div>
                </div>
                <ArrowUpRight size={16} color="#94a3b8" />
              </div>

              <div
                onClick={() => { setShowConnectModal(false); setTab('telegram'); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(34, 158, 217, 0.1)', color: '#229ed9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Send size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>Telegram Bot</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Connect Telegram bots using BotFather API tokens</div>
                  </div>
                </div>
                <ArrowUpRight size={16} color="#94a3b8" />
              </div>

              <div
                onClick={() => { setShowConnectModal(false); setTab('tiktok'); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(254, 44, 85, 0.1)', color: '#FE2C55', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Video size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>TikTok Channel</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Connect TikTok Business accounts for DMs & comment automation</div>
                  </div>
                </div>
                <ArrowUpRight size={16} color="#94a3b8" />
              </div>

              <div
                onClick={() => { setShowConnectModal(false); setTab('webchat'); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderRadius: 10,
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Globe size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a' }}>Live Webchat Widget</div>
                    <div style={{ fontSize: '0.74rem', color: '#64748b' }}>Create embedded website chat widgets with custom styling</div>
                  </div>
                </div>
                <ArrowUpRight size={16} color="#94a3b8" />
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
