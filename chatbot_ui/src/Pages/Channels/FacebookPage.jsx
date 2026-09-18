import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import ChannelBreadcrumb from '../../Components/Common/ChannelBreadcrumb';
import { channelAPI } from '../../services/api';
import useFacebookSDK from '../../hooks/useFacebookSDK';
import { notify, handleLimitError } from '../../utils/alerts';
import { useAuth } from '../../Provider/AuthContext';
import {
  Facebook, MessageSquare, Heart, EyeOff, Plus, CheckCircle2,
  Trash2, Edit2, RefreshCw, Zap, Shield, Sparkles, Key, ExternalLink,
  MessageCircle, Radio, Tag, Filter, Check, Copy, AlertTriangle,
  ClipboardList, XCircle, Circle, Globe, X, ArrowLeft, ArrowRight,
} from 'lucide-react';

// ─── Facebook Login Button ─────────────────────────────────────────
function FBLoginButton({ onClick, loading, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '11px 22px', borderRadius: 8, border: 'none',
        background: '#1877f2', color: '#fff', fontWeight: 700,
        fontSize: '0.9rem', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1, transition: 'all 0.2s',
        boxShadow: '0 4px 14px rgba(24,119,242,0.3)',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = '#0f65d4'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#1877f2'; }}
    >
      {loading ? (
        <span className="loading-spinner" style={{ width: 16, height: 16, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
      ) : (
        <Facebook size={18} />
      )}
      {loading ? 'Connecting…' : 'Continue with Facebook'}
    </button>
  );
}

export default function FacebookPage({ embedded = false }) {
  const { user } = useAuth();
  // Connected Pages State
  const [connected, setConnected] = useState([]);
  const [loadingConnected, setLoadingConnected] = useState(true);
  const [step, setStep] = useState('idle');
  const [fetchedPages, setFetchedPages] = useState([]);
  const [selected, setSelected] = useState([]);
  const [fbUserToken, setFbUserToken] = useState('');
  const [importing, setImporting] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState({ name: '', fbPageId: '', fbPageName: '', accessToken: '' });
  const [manualSaving, setManualSaving] = useState(false);

  // Connect flow: 'list' | 'choose_method' | 'oauth' | 'token'
  const [pagesView, setPagesView] = useState('list');
  const [quickToken, setQuickToken] = useState('');
  const [quickConnecting, setQuickConnecting] = useState(false);

  const { fbReady, sdkError } = useFacebookSDK('MESSENGER_INSTAGRAM');

  const showToast = (msg, type = 'success') => {
    if (type === 'error') notify.error(msg);
    else notify.success(msg);
  };

  // ── Load Connected Pages ──
  const fetchConnected = async () => {
    setLoadingConnected(true);
    try {
      const res = await channelAPI.getFacebook();
      setConnected(res.data.pages || []);
    } catch {
      showToast('Failed to load Facebook pages', 'error');
    } finally {
      setLoadingConnected(false);
    }
  };

  useEffect(() => {
    fetchConnected();
  }, []);

  // ── Facebook SDK Login & Page Fetch ──
  const handleFBLogin = () => {
    if (!window.FB) { showToast('Facebook SDK not loaded yet', 'error'); return; }
    setLoginLoading(true);
    window.FB.login((response) => {
      setLoginLoading(false);
      if (response.authResponse) {
        fetchUserPages(response.authResponse.accessToken);
      } else {
        showToast('Facebook login was cancelled or failed', 'error');
      }
    }, {
      scope: 'pages_show_list,pages_messaging,pages_read_engagement,pages_manage_metadata,pages_manage_engagement,pages_manage_posts,business_management',
      return_scopes: true,
      auth_type: 'rerequest',
    });
  };

  const fetchUserPages = async (userAccessToken) => {
    setFbUserToken(userAccessToken);
    setStep('fetching');

    let pages = [];
    let backendWarning = null;
    try {
      const res = await channelAPI.importFBPages(userAccessToken);
      if (res.data?.pages?.length) {
        pages = res.data.pages;
      }
      if (res.data?.warning) {
        backendWarning = res.data.warning;
      }
    } catch (e) {
      console.warn('Backend import-pages error, falling back to window.FB.api:', e);
    }

    if (!pages.length && window.FB) {
      try {
        await new Promise((resolve) => {
          window.FB.api('/me/accounts', { access_token: userAccessToken, fields: 'id,name,access_token,category,tasks,picture{url}' }, (fbRes) => {
            if (fbRes && !fbRes.error && Array.isArray(fbRes.data)) {
              pages = fbRes.data.map(p => ({
                ...p,
                profile_picture_url: p.picture?.data?.url || (p.id ? `https://graph.facebook.com/v21.0/${p.id}/picture?type=large` : null),
              }));
            }
            resolve();
          });
        });
      } catch (fbErr) {
        console.warn('window.FB.api error:', fbErr);
      }
    }

    // Filter out WhatsApp Business Accounts / WABAs
    pages = pages.filter(p => {
      if (!p || !p.id || !p.name) return false;
      const lower = (p.name || '').toLowerCase();
      if (lower.includes('whatsapp business') || lower.includes('test whatsapp') || lower.includes('waba')) {
        return false;
      }
      return true;
    });

    if (pages.length > 0) {
      setFetchedPages(pages);
      const connectedPageIds = new Set(connected.map(p => p.fb_page_id));
      const unlinked = pages.filter(p => !connectedPageIds.has(p.id));
      setSelected(unlinked.length > 0 ? unlinked : pages);
      setStep('selecting');
    } else {
      showToast(backendWarning || 'No Facebook Pages found. Make sure you granted page permissions in the Facebook dialog.', 'error');
      setStep('idle');
    }
  };

  const handleImport = async () => {
    if (!selected.length) {
      showToast('Please select at least one page to connect', 'error');
      return;
    }
    setImporting(true);
    let successCount = 0;
    try {
      for (const page of selected) {
        await channelAPI.addFacebook({
          name: page.name,
          accessToken: page.access_token,
          userAccessToken: fbUserToken || null,
          fbPageId: page.id,
          fbPageName: page.name,
          profilePictureUrl: page.profile_picture_url || page.picture?.data?.url || null,
        });
        successCount++;
      }
      showToast(`Successfully connected ${successCount} Facebook page(s)!`);
      setStep('done');
      setSelected([]);
      setPagesView('list');
      fetchConnected();
    } catch (err) {
      if (!handleLimitError(err, { userRole: user?.role })) {
        showToast(err.response?.data?.message || 'Failed to connect pages', 'error');
      }
    } finally {
      setImporting(false);
    }
  };

  const handleQuickConnect = async () => {
    if (!quickToken.trim()) {
      showToast('Please paste your Access Token first', 'error');
      return;
    }
    setQuickConnecting(true);
    try {
      const res = await channelAPI.quickConnectFacebook(quickToken.trim());
      showToast(res.data.message || 'Connected with permanent token!');
      setQuickToken('');
      setPagesView('list');
      fetchConnected();
    } catch (err) {
      if (!handleLimitError(err, { userRole: user?.role })) {
        showToast(err.response?.data?.message || 'Failed to connect', 'error');
      }
    } finally {
      setQuickConnecting(false);
    }
  };

  const handleDeletePage = async (id) => {
    if (!window.confirm('Disconnect this Facebook Page?')) return;
    try {
      await channelAPI.deleteFacebook(id);
      showToast('Page disconnected');
      fetchConnected();
    } catch {
      showToast('Failed to disconnect', 'error');
    }
  };

  const pageContent = (
    <div style={{ width: '100%', padding: embedded ? '0' : '16px 20px' }}>
      <style>{`
        .fb-tab-btn {
          padding: 10px 18px;
          font-size: 0.86rem;
          font-weight: 600;
          border: none;
          background: none;
          cursor: pointer;
          color: var(--text-secondary);
          border-bottom: 2px solid transparent;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .fb-tab-btn.active {
          color: #1877f2;
          border-bottom-color: #1877f2;
        }
        .fb-table th {
          padding: 12px 14px;
          font-size: 0.74rem;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: #5c5c80;
          border-bottom: 1px solid #e4e4f0;
          background: #f8f8fc;
          white-space: nowrap;
          text-align: left;
        }
        .fb-table td {
          padding: 13px 14px;
          font-size: 0.83rem;
          border-bottom: 1px solid #e4e4f0;
          vertical-align: middle;
          background: #ffffff;
        }
        .fb-switch {
          position: relative;
          display: inline-block;
          width: 36px;
          height: 20px;
          cursor: pointer;
        }
        .fb-switch input { opacity: 0; width: 0; height: 0; }
        .fb-slider {
          position: absolute;
          cursor: pointer;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: #cbd5e1;
          transition: .22s;
          border-radius: 20px;
        }
        .fb-slider:before {
          position: absolute;
          content: "";
          height: 14px;
          width: 14px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .22s;
          border-radius: 50%;
          box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        input:checked + .fb-slider { background-color: #10b981; }
        input:checked + .fb-slider:before { transform: translateX(16px); }
      `}</style>

      {!embedded && <ChannelBreadcrumb current="Facebook Messenger" />}

      {/* ── Page Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Facebook size={26} color="#1877f2" /> Facebook Messenger
          </h1>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>
            Connect Facebook Pages for Messenger live chat. Comment Automation and Utility Messaging now live under Bot Manager.
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          CONNECTED PAGES
          ═══════════════════════════════════════════════════════════════════ */}
      {pagesView === 'list' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ fontSize: '0.96rem', fontWeight: 700, margin: 0, color: '#1a1a2e' }}>
                Connected Pages & Messenger Integrations
              </h2>
              <div style={{ fontSize: '0.78rem', color: '#5c5c80', marginTop: 2 }}>
                Pages connected to receive incoming messages & comments
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={fetchConnected}
                className="btn btn-secondary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', fontSize: '0.82rem' }}
              >
                <RefreshCw size={13} className={loadingConnected ? 'spin' : ''} /> Refresh
              </button>
              <button
                onClick={() => setPagesView('choose_method')}
                style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 14px', fontSize: '0.84rem', fontWeight: 700, background: '#1877f2', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', boxShadow: '0 2px 8px rgba(24,119,242,0.25)' }}
              >
                <Plus size={15} /> Connect Page
              </button>
            </div>
          </div>

          <div style={{ background: '#ffffff', border: '1px solid #e4e4f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="fb-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th>PAGE NAME</th>
                    <th>PAGE ID</th>
                    <th>STATUS</th>
                    <th>WEBHOOK SYNC</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingConnected ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 40, textAlign: 'center' }}>
                        <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                        <p style={{ color: '#5c5c80', fontSize: '0.82rem' }}>Loading connected pages...</p>
                      </td>
                    </tr>
                  ) : connected.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 48, textAlign: 'center' }}>
                        <Facebook size={40} color="#cbd5e1" style={{ margin: '0 auto 12px', display: 'block' }} />
                        <h4 style={{ fontSize: '0.94rem', fontWeight: 700, margin: '0 0 4px 0', color: '#1a1a2e' }}>
                          No Facebook Pages Connected
                        </h4>
                        <p style={{ color: '#5c5c80', fontSize: '0.78rem', margin: '0 0 16px' }}>
                          Click "Connect Page" to link your first Facebook Page.
                        </p>
                        <button
                          onClick={() => setPagesView('choose_method')}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', fontSize: '0.82rem', fontWeight: 700, background: '#1877f2', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
                        >
                          <Plus size={14} /> Connect Now
                        </button>
                      </td>
                    </tr>
                  ) : (
                    connected.map((page) => (
                      <tr key={page.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#1877f2', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, overflow: 'hidden', flexShrink: 0, border: '1px solid #e4e4f0' }}>
                              {page.profile_picture_url ? (
                                <img src={page.profile_picture_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
                              ) : (
                                page.name?.[0]?.toUpperCase() || 'P'
                              )}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: '#1a1a2e' }}>{page.name}</div>
                              <div style={{ fontSize: '0.72rem', color: '#5c5c80' }}>DB ID: {page.id}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <code style={{ fontSize: '0.78rem', background: '#f8f8fc', padding: '2px 6px', borderRadius: 4 }}>
                            {page.fb_page_id || '—'}
                          </code>
                        </td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.74rem', fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} /> Active
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <CheckCircle2 size={13} /> Subscribed
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => handleDeletePage(page.id)}
                            style={{
                              padding: '5px 10px',
                              borderRadius: 6,
                              border: '1px solid rgba(239,68,68,0.2)',
                              background: 'rgba(239,68,68,0.06)',
                              color: '#ef4444',
                              fontSize: '0.78rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <Trash2 size={13} /> Disconnect
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
      )}

      {/* ── Choose Connect Method ── */}
      {pagesView === 'choose_method' && (
        <div>
          <button onClick={() => setPagesView('list')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', marginBottom: 20, padding: 0 }}>
            <ArrowLeft size={14} /> Back to Pages
          </button>

          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
            Connect Facebook Page
          </h2>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 20px' }}>
            Choose how you want to connect your Facebook Page to this workspace.
          </p>

          {sdkError && (
            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: '0.82rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={14} /> {sdkError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            <div
              onClick={() => setPagesView('oauth')}
              style={{
                border: '2px solid #bbf7d0', borderRadius: 14, padding: '24px 22px',
                cursor: 'pointer', background: '#fff', transition: 'all 0.15s',
                display: 'flex', flexDirection: 'column', gap: 14,
                boxShadow: '0 2px 8px rgba(24,119,242,0.06)',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#1877f2'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(24,119,242,0.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#bbf7d0'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(24,119,242,0.06)'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(24,119,242,0.1)', color: '#1877f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Facebook size={22} />
                </div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, background: 'rgba(24,119,242,0.1)', color: '#1877f2', padding: '3px 8px', borderRadius: 8, textTransform: 'uppercase' }}>
                  Recommended
                </span>
              </div>
              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                  Continue with Facebook Login
                </h3>
                <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
                  Log in to select and import pages with the right permissions for full DM and comment automation.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {['Guided Meta OAuth login', 'Select specific pages', 'Auto-configured permissions'].map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: '#475569' }}>
                      <Check size={13} color="#1877f2" /> {f}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700, color: '#1877f2', marginTop: 'auto' }}>
                Continue with Facebook <ArrowRight size={14} />
              </div>
            </div>

            <div
              onClick={() => setPagesView('token')}
              style={{
                border: '2px solid #e2e8f0', borderRadius: 14, padding: '24px 22px',
                cursor: 'pointer', background: '#fff', transition: 'all 0.15s',
                display: 'flex', flexDirection: 'column', gap: 14,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#94a3b8'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(99,102,241,0.1)', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={22} />
                </div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#f1f5f9', color: '#64748b', padding: '3px 8px', borderRadius: 8, textTransform: 'uppercase' }}>
                  1-Click
                </span>
              </div>
              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                  1-Click Permanent Token
                </h3>
                <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
                  Paste any token with page permissions — we automatically upgrade it to a permanent never-expiring token.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {['Just paste a token', 'Auto-upgrades to permanent', 'Good for developers'].map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: '#475569' }}>
                      <Check size={13} color="#4f46e5" /> {f}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700, color: '#4f46e5', marginTop: 'auto' }}>
                Use a Token <ArrowRight size={14} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Connect via Facebook OAuth ── */}
      {pagesView === 'oauth' && (
        <div style={{ maxWidth: 560 }}>
          <button onClick={() => setPagesView('choose_method')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', marginBottom: 20, padding: 0 }}>
            <ArrowLeft size={14} /> Back
          </button>

          {sdkError && (
            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '14px 16px', marginBottom: 16, fontSize: '0.82rem', color: '#b45309' }}>
              <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14} /> {sdkError}</div>
              <div style={{ color: '#5c5c80', fontSize: '0.78rem' }}>
                Please ensure your Meta App ID is configured in <em>Settings → Meta App Setup</em>.
              </div>
            </div>
          )}

          {/* State: Fetching pages */}
          {step === 'fetching' && (
            <div style={{ background: '#ffffff', border: '1px solid #e4e4f0', borderRadius: 12, padding: 30, textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <span className="loading-spinner" style={{ width: 28, height: 28, borderColor: 'rgba(24,119,242,0.2)', borderTopColor: '#1877f2', margin: '0 auto 12px', display: 'block' }} />
              <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#1a1a2e', marginBottom: 4 }}>Discovering Facebook Pages…</div>
              <div style={{ fontSize: '0.78rem', color: '#5c5c80' }}>Fetching authorized pages and permissions</div>
            </div>
          )}

          {/* State: Selecting pages to import */}
          {step === 'selecting' && (
            <div style={{ background: '#ffffff', border: '1px solid #e4e4f0', borderRadius: 12, padding: 18, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: '0.94rem', color: '#1a1a2e' }}>Select Facebook Pages</div>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(24,119,242,0.1)', color: '#1877f2' }}>
                  {fetchedPages.length} found
                </span>
              </div>

              <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {fetchedPages.map(page => {
                  const isConnected = connected.some(c => c.fb_page_id === page.id);
                  const isChecked = !!selected.find(s => s.id === page.id);
                  return (
                    <div
                      key={page.id}
                      onClick={() => {
                        if (isConnected) return;
                        setSelected(prev => isChecked ? prev.filter(s => s.id !== page.id) : [...prev, page]);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: `1.5px solid ${isChecked ? '#1877f2' : '#e4e4f0'}`,
                        background: isChecked ? 'rgba(24,119,242,0.04)' : '#fafafa',
                        cursor: isConnected ? 'default' : 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#1877f2', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', overflow: 'hidden', flexShrink: 0 }}>
                          {page.profile_picture_url ? (
                            <img src={page.profile_picture_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
                          ) : (
                            <Facebook size={16} />
                          )}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.84rem', color: '#1a1a2e' }}>{page.name}</div>
                          <div style={{ fontSize: '0.72rem', color: '#8c8ca1' }}>ID: {page.id} {page.category ? `• ${page.category}` : ''}</div>
                        </div>
                      </div>

                      {isConnected ? (
                        <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Check size={13} /> Connected
                        </span>
                      ) : (
                        <div style={{
                          width: 18, height: 18, borderRadius: 4,
                          border: `1.5px solid ${isChecked ? '#1877f2' : '#cbd5e1'}`,
                          background: isChecked ? '#1877f2' : '#ffffff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {isChecked && <Check size={12} color="#fff" strokeWidth={3} />}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => { setStep('idle'); setSelected([]); }}
                  style={{
                    flex: 1, padding: '9px', borderRadius: 8, border: '1px solid #e4e4f0',
                    background: '#fff', color: '#5c5c80', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={!selected.length || importing}
                  style={{
                    flex: 2, padding: '9px', borderRadius: 8, border: 'none',
                    background: '#1877f2', color: '#fff', fontWeight: 700, fontSize: '0.82rem',
                    cursor: !selected.length || importing ? 'not-allowed' : 'pointer',
                    opacity: !selected.length || importing ? 0.6 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {importing ? (
                    <>
                      <span className="loading-spinner" style={{ width: 14, height: 14, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                      Connecting…
                    </>
                  ) : (
                    `Connect ${selected.length} Page${selected.length !== 1 ? 's' : ''}`
                  )}
                </button>
              </div>
            </div>
          )}

          {/* State: Idle / Done (FB Login Button) */}
          {(step === 'idle' || step === 'done') && (
            <div style={{ background: '#ffffff', border: '1px solid #e4e4f0', borderRadius: 12, padding: 20, textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <Facebook size={34} color="#1877f2" style={{ marginBottom: 8 }} />
              <div style={{ fontWeight: 700, fontSize: '0.96rem', marginBottom: 4, color: '#1a1a2e' }}>
                Connect via Facebook Login
              </div>
              <div style={{ fontSize: '0.8rem', color: '#5c5c80', marginBottom: 16, lineHeight: 1.5 }}>
                Log in to select and import pages with <code>pages_show_list</code>, <code>pages_messaging</code>, <code>pages_manage_engagement</code>, and <code>pages_manage_posts</code> permissions for full DM and comment automation.
              </div>
              <FBLoginButton onClick={handleFBLogin} loading={loginLoading} disabled={loginLoading || !fbReady || !!sdkError} />
              {!fbReady && !sdkError && (
                <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#8c8ca1' }}>Initializing Meta SDK…</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Connect via 1-Click Permanent Token ── */}
      {pagesView === 'token' && (
        <div style={{ maxWidth: 480 }}>
          <button onClick={() => setPagesView('choose_method')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', marginBottom: 20, padding: 0 }}>
            <ArrowLeft size={14} /> Back
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(99,102,241,0.1)', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={18} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>1-Click Permanent Token</h2>
              <p style={{ margin: 0, fontSize: '0.74rem', color: '#64748b' }}>Paste a Meta token — we upgrade it to a permanent token automatically</p>
            </div>
          </div>

          <p style={{ fontSize: '0.8rem', color: '#5c5c80', margin: '0 0 12px 0', lineHeight: 1.5 }}>
            Paste any token with <code>pages_manage_engagement, pages_manage_posts, pages_messaging</code>. We automatically upgrade it to a <strong>Permanent Never-Expiring Token</strong>.
          </p>
          <textarea
            rows={3}
            className="form-input w-full"
            placeholder="Paste Access Token here..."
            value={quickToken}
            onChange={e => setQuickToken(e.target.value)}
            style={{ fontSize: '0.82rem', resize: 'vertical', marginBottom: 14 }}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 6, borderTop: '1px solid #f1f5f9' }}>
            <button type="button" onClick={() => setPagesView('choose_method')} className="btn btn-secondary btn-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleQuickConnect}
              disabled={quickConnecting || !quickToken.trim()}
              className="btn btn-primary btn-sm"
              style={{ background: '#6366f1', borderColor: '#6366f1', fontWeight: 700, minWidth: 160 }}
            >
              {quickConnecting ? 'Connecting...' : (<><Zap size={14} /> Connect & Make Permanent</>)}
            </button>
          </div>
        </div>
      )}

    </div>
  );

  if (embedded) return pageContent;
  return <AppLayout>{pageContent}</AppLayout>;
}
