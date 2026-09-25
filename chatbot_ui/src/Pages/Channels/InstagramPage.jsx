import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../../Layout/AppLayout';
import ChannelBreadcrumb from '../../Components/Common/ChannelBreadcrumb';
import { channelAPI } from '../../services/api';
import useFacebookSDK from '../../hooks/useFacebookSDK';
import { handleLimitError } from '../../utils/alerts';
import { useAuth } from '../../Provider/AuthContext';
import {
  Users, CheckCircle2, Instagram, Trash2, AlertTriangle, RefreshCw, Zap, Rocket, Pencil, Info,
  ArrowLeft, ArrowRight, Plus, Check,
} from 'lucide-react';

// ─── Instagram Login Button ────────────────────────────────────────
function IGLoginButton({ onClick, loading, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 12,
        padding: '12px 24px', borderRadius: 8, border: 'none',
        background: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)',
        color: '#fff', fontWeight: 700, fontSize: '0.95rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1, transition: 'all 0.2s',
        boxShadow: '0 4px 14px rgba(225,48,108,0.35)',
      }}
    >
      {loading
        ? <span className="loading-spinner" style={{ width: 18, height: 18, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
        : <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
      }
      {loading ? 'Connecting…' : 'Continue with Facebook'}
    </button>
  );
}

// ─── IG Account Card ──────────────────────────────────────────────
function IGAccountCard({ account, selected, onToggle, connected }) {
  return (
    <div
      onClick={() => !connected && onToggle(account)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 16px', borderRadius: 10,
        cursor: connected ? 'default' : 'pointer',
        border: `2px solid ${selected ? '#e1306c' : 'var(--border)'}`,
        background: selected ? 'rgba(225,48,108,0.05)' : 'var(--bg-card)',
        transition: 'all 0.15s', marginBottom: 10,
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 46, height: 46, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
        background: 'linear-gradient(135deg, #833ab4, #fd1d1d)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700, fontSize: '1.1rem',
        border: selected ? '3px solid #e1306c' : '3px solid transparent',
      }}>
        {account.profile_picture_url
          ? <img src={account.profile_picture_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : (account.username?.[0]?.toUpperCase() || 'I')
        }
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>@{account.username}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
          {account.name} • via {account.pageName}
        </div>
        {account.followers_count != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: '#e1306c', marginTop: 2 }}>
            <Users size={11} /> {Number(account.followers_count).toLocaleString()} followers
          </div>
        )}
      </div>
      {connected
        ? <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={12} /> Connected</span>
        : <div style={{
            width: 20, height: 20, borderRadius: '50%',
            border: `2px solid ${selected ? '#e1306c' : 'var(--border)'}`,
            background: selected ? '#e1306c' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {selected && <svg width="12" height="12" viewBox="0 0 12 12" fill="white"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>}
          </div>
      }
    </div>
  );
}

export default function InstagramPage({ embedded = false }) {
  const { user } = useAuth();
  const { fbReady, sdkError, login } = useFacebookSDK('MESSENGER_INSTAGRAM');

  const [connected, setConnected]         = useState([]);
  const [loadingConnected, setLoadingConnected] = useState(true);
  const [step, setStep]                   = useState('idle'); // idle | fetching | selecting | done
  const [fetchedAccounts, setFetchedAccounts] = useState([]);
  const [selected, setSelected]           = useState([]);
  const [importing, setImporting]         = useState(false);
  const [loginLoading, setLoginLoading]   = useState(false);
  const [quickToken, setQuickToken]       = useState('');
  const [quickLoading, setQuickLoading]   = useState(false);
  const [syncingFb, setSyncingFb]         = useState(false);
  const [toast, setToast]                 = useState(null);

  // UI flow: 'list' | 'choose_method' | 'connect'
  const [view, setView] = useState('list');
  const [method, setMethod] = useState(null); // 'sync' | 'token' | 'oauth' | 'manual'

  // Manual connect fallback
  const [manualForm, setManualForm]       = useState({ name: '', igAccountId: '', igUsername: '', accessToken: '', verifyToken: '' });
  const [manualSaving, setManualSaving]   = useState(false);

  const fetchConnected = useCallback(async () => {
    setLoadingConnected(true);
    try { const r = await channelAPI.getInstagram(); setConnected(r.data.accounts || []); }
    catch { showToast('Failed to load accounts', 'error'); }
    finally { setLoadingConnected(false); }
  }, []);

  useEffect(() => { fetchConnected(); }, [fetchConnected]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const goToMethod = (m) => { setMethod(m); setView('connect'); };
  const goBack = () => { setView('list'); setMethod(null); setStep('idle'); };

  // 1-Click Token Quick Connect
  const handleQuickConnect = async () => {
    if (!quickToken.trim()) return;
    setQuickLoading(true);
    try {
      const res = await channelAPI.quickConnectInstagram(quickToken.trim());
      showToast(res.data?.message || 'Instagram connected successfully!');
      setQuickToken('');
      goBack();
      fetchConnected();
    } catch (err) {
      if (!handleLimitError(err, { userRole: user?.role })) {
        showToast(err.response?.data?.message || 'Failed to connect Instagram account', 'error');
      }
    } finally {
      setQuickLoading(false);
    }
  };

  // 1-Click Sync from Connected Facebook Pages
  const handleSyncFromFacebook = async () => {
    setSyncingFb(true);
    try {
      const res = await channelAPI.syncInstagramFromFacebook();
      showToast(res.data?.message || 'Instagram accounts synced successfully!');
      goBack();
      fetchConnected();
    } catch (err) {
      if (!handleLimitError(err, { userRole: user?.role })) {
        showToast(err.response?.data?.message || 'Failed to sync Instagram accounts', 'error');
      }
    } finally {
      setSyncingFb(false);
    }
  };

  // Instagram needs different scopes than Facebook, including content publishing
  const IG_SCOPES = 'pages_show_list,instagram_basic,instagram_manage_messages,pages_read_engagement,pages_messaging,pages_manage_engagement,instagram_manage_comments,instagram_content_publish';

  const handleIGLogin = () => {
    setLoginLoading(true);
    login(IG_SCOPES, async (err, token) => {
      setLoginLoading(false);
      if (err) { showToast(err, 'error'); return; }
      setStep('fetching');
      try {
        const res = await channelAPI.importIGAccounts(token);
        const accounts = res.data.accounts || [];
        if (!accounts.length) {
          showToast('No Instagram Business accounts found. Make sure your Instagram account is Professional and connected to a Facebook Page.', 'error');
          setStep('idle'); return;
        }
        setFetchedAccounts(accounts);
        const notConnected = accounts.filter(a => !connectedIds.has(a.id));
        setSelected(notConnected.length > 0 ? notConnected : accounts);
        setStep('selecting');
      } catch (e) { showToast(e.response?.data?.message || 'Failed to fetch accounts', 'error'); setStep('idle'); }
    });
  };

  const toggleSelect = (acc) => setSelected(prev =>
    prev.find(a => a.id === acc.id) ? prev.filter(a => a.id !== acc.id) : [...prev, acc]
  );

  const handleImport = async () => {
    if (!selected.length) {
      showToast('Please select at least one Instagram account', 'error');
      return;
    }
    setImporting(true);
    try {
      // Whole selection refused up front if its new accounts would go over the plan limit.
      await channelAPI.importCheck('INSTAGRAM', selected.map((a) => a.id));
      for (const acc of selected) {
        await channelAPI.addInstagram({
          name: acc.name || `@${acc.username}`,
          igAccountId: acc.id,
          igUsername: acc.username,
          accessToken: acc.pageAccessToken,
          verifyToken: `ig_${acc.id}`,
          pageId: acc.pageId,
          pageAccessToken: acc.pageAccessToken,
          profilePictureUrl: acc.profile_picture_url || null,
        });
      }
      showToast(`${selected.length} Instagram account(s) connected!`);
      setSelected([]); setFetchedAccounts([]); setStep('done');
      goBack();
      fetchConnected();
    } catch (err) {
      if (!handleLimitError(err, { userRole: user?.role })) {
        showToast(err?.response?.data?.message || 'Import failed', 'error');
      }
    } finally { setImporting(false); }
  };

  const handleManual = async (e) => {
    e.preventDefault(); setManualSaving(true);
    try {
      await channelAPI.addInstagram(manualForm);
      showToast('Account connected!');
      setManualForm({ name: '', igAccountId: '', igUsername: '', accessToken: '', verifyToken: '' });
      goBack();
      fetchConnected();
    } catch (err) {
      if (!handleLimitError(err, { userRole: user?.role })) {
        showToast(err.response?.data?.message || 'Failed', 'error');
      }
    } finally { setManualSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this Instagram account?')) return;
    try { await channelAPI.deleteInstagram(id); showToast('Account removed'); fetchConnected(); }
    catch { showToast('Failed', 'error'); }
  };

  const connectedIds = new Set(connected.map(c => c.ig_account_id));

  // ── VIEW: Account List ──────────────────────────────────────────────────────
  const ListView = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(225,48,108,0.1)', color: '#e1306c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Instagram size={20} />
            </div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Instagram
            </h1>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2, marginLeft: 46 }}>
            Connect Instagram Business accounts to receive and reply to DMs.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchConnected} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', fontSize: '0.82rem' }}>
            <RefreshCw size={13} className={loadingConnected ? 'spin' : ''} /> Refresh
          </button>
          <button
            onClick={() => setView('choose_method')}
            style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 14px', fontSize: '0.84rem', fontWeight: 700, background: 'linear-gradient(135deg, #833ab4, #e1306c)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', boxShadow: '0 2px 8px rgba(225,48,108,0.25)' }}
          >
            <Plus size={15} /> Connect Account
          </button>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Connected Accounts</h2>
            <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '2px 0 0' }}>Instagram Business accounts for this workspace</p>
          </div>
          <span style={{ fontSize: '0.74rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(225,48,108,0.1)', color: '#e1306c' }}>
            {connected.length} Connected
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Account</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Account ID</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingConnected ? (
                <tr>
                  <td colSpan={4} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                    Loading accounts...
                  </td>
                </tr>
              ) : connected.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
                    <Instagram size={40} color="#cbd5e1" style={{ margin: '0 auto 12px', display: 'block' }} />
                    <h3 style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>No Instagram Accounts Connected</h3>
                    <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 16px' }}>Click "Connect Account" to add your first Instagram Business account.</p>
                    <button
                      onClick={() => setView('choose_method')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', fontSize: '0.82rem', fontWeight: 700, background: '#e1306c', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
                    >
                      <Plus size={14} /> Connect Now
                    </button>
                  </td>
                </tr>
              ) : (
                connected.map((a) => (
                  <tr
                    key={a.id}
                    style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.12s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fafbfe')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                  >
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#833ab4,#fd1d1d)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.72rem', flexShrink: 0, overflow: 'hidden' }}>
                          {a.profile_picture_url ? (
                            <img src={a.profile_picture_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
                          ) : (
                            a.ig_username?.[0]?.toUpperCase() || 'I'
                          )}
                        </div>
                        <div>
                          <div>{a.name}</div>
                          <div style={{ fontSize: '0.72rem', color: '#e1306c', fontWeight: 600 }}>@{a.ig_username}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#64748b', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                      {a.ig_account_id}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 700, color: a.is_active ? '#16a34a' : '#64748b', background: a.is_active ? 'rgba(34,197,94,0.1)' : '#f1f5f9', padding: '2px 8px', borderRadius: 10 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: a.is_active ? '#16a34a' : '#94a3b8' }} />
                        {a.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <button
                        onClick={() => handleDelete(a.id)}
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

  // ── VIEW: Choose Method ─────────────────────────────────────────────────────
  const METHODS = [
    {
      id: 'sync', icon: RefreshCw, color: '#1877f2', bg: 'rgba(24,119,242,0.1)', badge: 'Fastest',
      title: 'Auto-Sync from Facebook', desc: 'Already have Facebook Pages connected? Import their linked Instagram Professional accounts instantly with 1 click.',
      features: ['No login required', 'Uses existing Facebook connection', 'Bulk-imports all linked accounts'],
    },
    {
      id: 'oauth', icon: Instagram, color: '#e1306c', bg: 'rgba(225,48,108,0.1)', badge: 'Recommended',
      title: 'Continue with Facebook', desc: 'Login with the Facebook SDK to discover and select Instagram accounts linked to your Pages.',
      features: ['Guided OAuth login', 'Select specific accounts', 'Auto-configured permissions'],
    },
    {
      id: 'token', icon: Zap, color: '#e1306c', bg: 'rgba(225,48,108,0.1)', badge: '1-Click',
      title: '1-Click Token Connect', desc: 'Paste any Meta User Token or Page Token to auto-discover and connect all linked Instagram accounts permanently.',
      features: ['Just paste a token', 'Auto-discovers accounts', 'Good for permanent tokens'],
    },
    {
      id: 'manual', icon: Pencil, color: '#475569', bg: 'rgba(100,116,139,0.1)', badge: 'Manual / API',
      title: 'Manual Entry', desc: 'For developers who already have an Instagram Account ID and Page Access Token from the Meta Graph API.',
      features: ['Direct credential entry', 'Works with existing setup', 'Full control over fields'],
    },
  ];

  const ChooseMethodView = () => (
    <div>
      <button onClick={goBack} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', marginBottom: 20, padding: 0 }}>
        <ArrowLeft size={14} /> Back to Accounts
      </button>

      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>
        Connect Instagram
      </h2>
      <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 16px' }}>
        Choose how you want to connect your Instagram Business account to this workspace.
      </p>

      <div style={{ background: 'rgba(225,48,108,0.06)', border: '1px solid rgba(225,48,108,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: '0.82rem', color: '#475569', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Info size={15} style={{ flexShrink: 0, marginTop: 1 }} color="#e1306c" />
        <span>
          Your Instagram account must be a <strong>Professional (Business)</strong> account and connected to a <strong>Facebook Page</strong>.
          Go to Instagram → Settings → Account → Switch to Professional Account.
        </span>
      </div>

      {sdkError && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: '0.82rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: 6 }}>
          <AlertTriangle size={14} /> {sdkError}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {METHODS.map(m => {
          const Icon = m.icon;
          return (
            <div
              key={m.id}
              onClick={() => goToMethod(m.id)}
              style={{
                border: '2px solid #e2e8f0', borderRadius: 14, padding: '24px 22px',
                cursor: 'pointer', background: '#fff', transition: 'all 0.15s',
                display: 'flex', flexDirection: 'column', gap: 14,
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = m.color; e.currentTarget.style.boxShadow = `0 4px 16px ${m.bg}`; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: m.bg, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={22} />
                </div>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, background: m.bg, color: m.color, padding: '3px 8px', borderRadius: 8, textTransform: 'uppercase' }}>
                  {m.badge}
                </span>
              </div>
              <div>
                <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                  {m.title}
                </h3>
                <p style={{ margin: '0 0 14px', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
                  {m.desc}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {m.features.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: '#475569' }}>
                      <Check size={13} color={m.color} /> {f}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700, color: m.color, marginTop: 'auto' }}>
                Choose this way <ArrowRight size={14} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── VIEW: Connect (per-method) ──────────────────────────────────────────────
  const ConnectHeader = (props) => {
    const Icon = props.icon;
    return (
    <>
      <button onClick={() => setView('choose_method')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', marginBottom: 20, padding: 0 }}>
        <ArrowLeft size={14} /> Back
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ width: 36, height: 36, borderRadius: 9, background: props.bg, color: props.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={18} />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>{props.title}</h2>
          <p style={{ margin: 0, fontSize: '0.74rem', color: '#64748b' }}>{props.desc}</p>
        </div>
      </div>
    </>
    );
  };

  const SyncView = () => (
    <div style={{ maxWidth: 480 }}>
      <ConnectHeader icon={RefreshCw} color="#1877f2" bg="rgba(24,119,242,0.1)" title="Auto-Sync from Facebook" desc="Import Instagram accounts linked to your connected Facebook Pages" />
      <button
        type="button"
        disabled={syncingFb}
        onClick={handleSyncFromFacebook}
        style={{
          width: '100%', padding: '13px 18px', borderRadius: 10,
          background: '#1877f2', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.88rem',
          cursor: syncingFb ? 'not-allowed' : 'pointer', opacity: syncingFb ? 0.7 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {syncingFb ? <span className="loading-spinner" style={{ width: 16, height: 16, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> : <><RefreshCw size={15} /> Sync Now</>}
      </button>
      <p style={{ marginTop: 10, fontSize: '0.76rem', color: '#94a3b8' }}>
        This finds Instagram Professional accounts linked to Facebook Pages already connected in this workspace and adds them automatically.
      </p>
    </div>
  );

  const TokenView = () => (
    <div style={{ maxWidth: 480 }}>
      <ConnectHeader icon={Zap} color="#e1306c" bg="rgba(225,48,108,0.1)" title="1-Click Token Connect" desc="Paste a Meta User or Page Token to auto-discover accounts" />
      <textarea
        className="form-input w-full"
        rows={3}
        placeholder="Paste Access Token (EAAB...)"
        value={quickToken}
        onChange={(e) => setQuickToken(e.target.value)}
        style={{ fontSize: '0.82rem', marginBottom: 14, resize: 'vertical' }}
      />
      <button
        type="button"
        disabled={quickLoading || !quickToken.trim()}
        onClick={handleQuickConnect}
        style={{
          width: '100%', padding: '13px 18px', borderRadius: 10,
          background: 'linear-gradient(135deg, #833ab4, #e1306c)', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.88rem',
          cursor: (quickLoading || !quickToken.trim()) ? 'not-allowed' : 'pointer', opacity: (quickLoading || !quickToken.trim()) ? 0.7 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {quickLoading ? <span className="loading-spinner" style={{ width: 16, height: 16, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> : <><Rocket size={15} /> Connect & Auto-Detect Instagram</>}
      </button>
    </div>
  );

  const OAuthView = () => (
    <div style={{ maxWidth: 480 }}>
      <ConnectHeader icon={Instagram} color="#e1306c" bg="rgba(225,48,108,0.1)" title="Continue with Facebook" desc="Login and select which Instagram accounts to connect" />

      {(step === 'idle' || step === 'done') && (
        <div className="card" style={{ textAlign: 'center' }}>
          <Instagram size={30} color="#e1306c" style={{ marginBottom: 8 }} />
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: 6 }}>Continue with Facebook Login</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
            Login with Facebook SDK to discover Instagram accounts linked to your Pages.
          </div>
          <IGLoginButton onClick={handleIGLogin} loading={loginLoading} disabled={!!sdkError || !fbReady || loginLoading} />
          {!fbReady && !sdkError && <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Loading SDK…</div>}
        </div>
      )}

      {step === 'fetching' && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Fetching Instagram accounts…</div>
        </div>
      )}

      {step === 'selecting' && (
        <div className="card">
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700 }}>Select Accounts</div>
            <span className="badge badge-ig">{fetchedAccounts.length} found</span>
          </div>
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {fetchedAccounts.map(acc => (
              <IGAccountCard
                key={acc.id}
                account={acc}
                selected={!!selected.find(s => s.id === acc.id)}
                onToggle={toggleSelect}
                connected={connectedIds.has(acc.id)}
              />
            ))}
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setStep('idle'); setSelected([]); }}><ArrowLeft size={13} /> Back</button>
            <button
              className="btn btn-primary" style={{ flex: 2, background: 'linear-gradient(135deg,#833ab4,#e1306c)' }}
              onClick={handleImport}
              disabled={!selected.length || importing}
            >
              {importing
                ? <span className="loading-spinner" style={{ width: 16, height: 16, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                : `Connect ${selected.length} Account${selected.length !== 1 ? 's' : ''}`
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const ManualView = () => (
    <div style={{ maxWidth: 480 }}>
      <ConnectHeader icon={Pencil} color="#475569" bg="rgba(100,116,139,0.1)" title="Manual Entry" desc="Enter your Instagram Account ID and Page Access Token" />
      <form onSubmit={handleManual} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>Display Name <span style={{ color: '#dc2626' }}>*</span></label>
          <input className="form-input w-full" value={manualForm.name} onChange={e => setManualForm(f => ({ ...f, name: e.target.value }))} required style={{ height: 36, fontSize: '0.84rem' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>Instagram Account ID <span style={{ color: '#dc2626' }}>*</span></label>
          <input className="form-input w-full" placeholder="From Meta Graph API" value={manualForm.igAccountId} onChange={e => setManualForm(f => ({ ...f, igAccountId: e.target.value }))} required style={{ height: 36, fontSize: '0.84rem', fontFamily: 'monospace' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>Instagram Username</label>
          <input className="form-input w-full" placeholder="@yourbrand" value={manualForm.igUsername} onChange={e => setManualForm(f => ({ ...f, igUsername: e.target.value }))} style={{ height: 36, fontSize: '0.84rem' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>Page Access Token <span style={{ color: '#dc2626' }}>*</span></label>
          <textarea className="form-input w-full" rows={3} value={manualForm.accessToken} onChange={e => setManualForm(f => ({ ...f, accessToken: e.target.value }))} required style={{ resize: 'vertical', fontSize: '0.84rem', fontFamily: 'monospace' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>Verify Token <span style={{ color: '#dc2626' }}>*</span></label>
          <input className="form-input w-full" value={manualForm.verifyToken} onChange={e => setManualForm(f => ({ ...f, verifyToken: e.target.value }))} required style={{ height: 36, fontSize: '0.84rem', fontFamily: 'monospace' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 6, borderTop: '1px solid #f1f5f9' }}>
          <button type="button" onClick={() => setView('choose_method')} className="btn btn-secondary btn-sm">Cancel</button>
          <button type="submit" className="btn btn-primary btn-sm" disabled={manualSaving} style={{ background: '#475569', borderColor: '#475569', fontWeight: 700, minWidth: 100 }}>
            {manualSaving ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </form>
    </div>
  );

  const ConnectView = () => {
    if (method === 'sync') return SyncView();
    if (method === 'token') return TokenView();
    if (method === 'oauth') return OAuthView();
    if (method === 'manual') return ManualView();
    return null;
  };

  const pageContent = (
    <div style={{ width: '100%', padding: embedded ? '0' : '16px 20px' }}>
      {toast && <div className="toast-container"><div className={`toast ${toast.type}`}>{toast.msg}</div></div>}
      {!embedded && <ChannelBreadcrumb current="Instagram Direct" />}
      {view === 'list' && ListView()}
      {view === 'choose_method' && ChooseMethodView()}
      {view === 'connect' && ConnectView()}
    </div>
  );

  if (embedded) return pageContent;
  return <AppLayout>{pageContent}</AppLayout>;
}
