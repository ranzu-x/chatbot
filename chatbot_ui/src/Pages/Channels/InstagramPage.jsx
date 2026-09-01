import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { channelAPI } from '../../services/api';
import useFacebookSDK from '../../hooks/useFacebookSDK';

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
          <div style={{ fontSize: '0.75rem', color: '#e1306c', marginTop: 2 }}>
            👥 {Number(account.followers_count).toLocaleString()} followers
          </div>
        )}
      </div>
      {connected
        ? <span className="badge badge-success">✅ Connected</span>
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
  const { fbReady, sdkError, login } = useFacebookSDK();

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

  // Manual connect fallback
  const [showManual, setShowManual]       = useState(false);
  const [manualForm, setManualForm]       = useState({ name: '', igAccountId: '', igUsername: '', accessToken: '', verifyToken: '' });
  const [manualSaving, setManualSaving]   = useState(false);

  useEffect(() => { fetchConnected(); }, []);

  const fetchConnected = async () => {
    setLoadingConnected(true);
    try { const r = await channelAPI.getInstagram(); setConnected(r.data.accounts || []); }
    catch { showToast('Failed to load accounts', 'error'); }
    finally { setLoadingConnected(false); }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // 1-Click Token Quick Connect
  const handleQuickConnect = async () => {
    if (!quickToken.trim()) return;
    setQuickLoading(true);
    try {
      const res = await channelAPI.quickConnectInstagram(quickToken.trim());
      showToast(res.data?.message || 'Instagram connected successfully!');
      setQuickToken('');
      fetchConnected();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to connect Instagram account', 'error');
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
      fetchConnected();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to sync Instagram accounts', 'error');
    } finally {
      setSyncingFb(false);
    }
  };

  // Instagram needs different scopes than Facebook
  const IG_SCOPES = 'pages_show_list,instagram_basic,instagram_manage_messages,pages_read_engagement,pages_messaging,pages_manage_engagement,instagram_manage_comments';

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
        setStep('selecting');
      } catch (e) { showToast(e.response?.data?.message || 'Failed to fetch accounts', 'error'); setStep('idle'); }
    });
  };

  const toggleSelect = (acc) => setSelected(prev =>
    prev.find(a => a.id === acc.id) ? prev.filter(a => a.id !== acc.id) : [...prev, acc]
  );

  const handleImport = async () => {
    setImporting(true);
    try {
      for (const acc of selected) {
        await channelAPI.addInstagram({
          name: acc.name || `@${acc.username}`,
          igAccountId: acc.id,
          igUsername: acc.username,
          accessToken: acc.pageAccessToken,
          verifyToken: `ig_${acc.id}`,
          pageId: acc.pageId,
          pageAccessToken: acc.pageAccessToken,
        });
      }
      showToast(`✅ ${selected.length} Instagram account(s) connected!`);
      setSelected([]); setFetchedAccounts([]); setStep('done');
      fetchConnected();
    } catch { showToast('Import failed', 'error'); }
    finally { setImporting(false); }
  };

  const handleManual = async (e) => {
    e.preventDefault(); setManualSaving(true);
    try {
      await channelAPI.addInstagram(manualForm);
      showToast('Account connected!');
      setManualForm({ name: '', igAccountId: '', igUsername: '', accessToken: '', verifyToken: '' });
      setShowManual(false);
      fetchConnected();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setManualSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this Instagram account?')) return;
    try { await channelAPI.deleteInstagram(id); showToast('Account removed'); fetchConnected(); }
    catch { showToast('Failed', 'error'); }
  };

  const connectedIds = new Set(connected.map(c => c.ig_account_id));

  const LayoutWrapper = embedded ? ({ children }) => <div>{children}</div> : AppLayout;

  return (
    <LayoutWrapper>
      {toast && <div className="toast-container"><div className={`toast ${toast.type}`}>{toast.msg}</div></div>}

      {/* Manual Connect Modal */}
      {showManual && (
        <div className="modal-overlay" onClick={() => setShowManual(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">📷 Manual Account Connect</div>
            <form onSubmit={handleManual} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group"><label className="form-label">Display Name *</label><input className="form-input" value={manualForm.name} onChange={e => setManualForm(f => ({ ...f, name: e.target.value }))} required /></div>
              <div className="form-group"><label className="form-label">Instagram Account ID *</label><input className="form-input" placeholder="From Meta Graph API" value={manualForm.igAccountId} onChange={e => setManualForm(f => ({ ...f, igAccountId: e.target.value }))} required /></div>
              <div className="form-group"><label className="form-label">Instagram Username</label><input className="form-input" placeholder="@yourbrand" value={manualForm.igUsername} onChange={e => setManualForm(f => ({ ...f, igUsername: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Page Access Token *</label><textarea className="form-input" rows={3} value={manualForm.accessToken} onChange={e => setManualForm(f => ({ ...f, accessToken: e.target.value }))} required style={{ resize: 'vertical' }} /></div>
              <div className="form-group"><label className="form-label">Verify Token *</label><input className="form-input" value={manualForm.verifyToken} onChange={e => setManualForm(f => ({ ...f, verifyToken: e.target.value }))} required /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowManual(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={manualSaving}>Connect</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="page-header">
        <div className="flex items-center gap-3">
          <span style={{ fontSize: '1.8rem' }}>📷</span>
          <div>
            <h1 className="page-title">Instagram</h1>
            <p className="page-subtitle">Connect Instagram Business accounts to receive and reply to DMs</p>
          </div>
        </div>
      </div>

      <div className="page-body">
        {/* Prerequisite note */}
        <div style={{ background: 'rgba(225,48,108,0.06)', border: '1px solid rgba(225,48,108,0.2)', borderRadius: 10, padding: '12px 16px', marginBottom: 24, fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: '1rem', flexShrink: 0 }}>ℹ️</span>
          <span>
            Your Instagram account must be a <strong>Professional (Business)</strong> account and connected to a <strong>Facebook Page</strong>.
            Go to Instagram → Settings → Account → Switch to Professional Account.
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 24, alignItems: 'start' }}>

          {/* Left — Connected Accounts */}
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Connected Accounts</h2>
              <span className="badge badge-ig">{connected.length} account{connected.length !== 1 ? 's' : ''}</span>
            </div>
            {loadingConnected ? <div className="loading-overlay"><div className="loading-spinner" /></div>
              : connected.length === 0
                ? <div className="empty-state"><div className="empty-icon">📷</div><div className="empty-title">No Instagram accounts connected</div><div className="empty-desc">Use the button on the right to connect your account</div></div>
                : (
                  <div className="table-wrapper">
                    <table>
                      <thead><tr><th>Account</th><th>Account ID</th><th>Status</th><th></th></tr></thead>
                      <tbody>
                        {connected.map(a => (
                          <tr key={a.id}>
                            <td>
                              <div className="flex items-center gap-3">
                                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#833ab4,#fd1d1d)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0 }}>
                                  {a.ig_username?.[0]?.toUpperCase() || 'I'}
                                </div>
                                <div>
                                  <div className="font-medium">{a.name}</div>
                                  <div style={{ fontSize: '0.78rem', color: '#e1306c' }}>@{a.ig_username}</div>
                                </div>
                              </div>
                            </td>
                            <td><code style={{ fontSize: '0.78rem', background: 'var(--bg-hover)', padding: '2px 8px', borderRadius: 4 }}>{a.ig_account_id}</code></td>
                            <td><span className={`badge ${a.is_active ? 'badge-success' : 'badge-muted'}`}>{a.is_active ? 'Active' : 'Inactive'}</span></td>
                            <td><button className="btn btn-danger btn-sm" onClick={() => handleDelete(a.id)}>🗑</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
            }
          </div>

          {/* Right — Connect Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {sdkError && (
              <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '16px 18px', fontSize: '0.85rem', color: 'var(--warning)' }}>
                ⚠️ {sdkError}
                <div style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
                  Set up your <strong>Meta App ID</strong> in <em>Settings → Meta App Setup</em> first.
                </div>
              </div>
            )}

            {/* Auto-Sync from Connected Facebook Pages */}
            <div className="card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: '1.2rem' }}>🔄</span>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>Auto-Sync from Facebook</div>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 12px 0', lineHeight: 1.5 }}>
                Already have Facebook Pages connected? Import their linked Instagram Professional accounts instantly with 1 click.
              </p>
              <button
                type="button"
                className="btn btn-primary w-full"
                disabled={syncingFb}
                onClick={handleSyncFromFacebook}
                style={{
                  background: '#1877f2',
                  border: 'none',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {syncingFb ? <span className="loading-spinner" style={{ width: 14, height: 14, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> : '🔄 Auto-Sync from Connected Facebook'}
              </button>
            </div>

            {/* 1-Click Permanent Token Connect */}
            <div className="card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: '1.2rem' }}>⚡</span>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>1-Click Token Connect</div>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 12px 0', lineHeight: 1.5 }}>
                Paste any Meta User Token or Page Token to auto-discover and connect all linked Instagram accounts permanently.
              </p>
              <textarea
                className="form-input w-full"
                rows={2}
                placeholder="Paste Access Token (EAAB...)"
                value={quickToken}
                onChange={(e) => setQuickToken(e.target.value)}
                style={{ fontSize: '0.78rem', marginBottom: 10, resize: 'vertical' }}
              />
              <button
                type="button"
                className="btn w-full"
                disabled={quickLoading || !quickToken.trim()}
                onClick={handleQuickConnect}
                style={{
                  background: 'linear-gradient(135deg, #833ab4, #e1306c)',
                  color: '#fff',
                  border: 'none',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                {quickLoading ? <span className="loading-spinner" style={{ width: 14, height: 14, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> : '🚀 Connect & Auto-Detect Instagram'}
              </button>
            </div>

            {(step === 'idle' || step === 'done') && (
              <div className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>📷</div>
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
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setStep('idle'); setSelected([]); }}>← Back</button>
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

            <button className="btn btn-secondary w-full" onClick={() => setShowManual(true)} style={{ fontSize: '0.8rem' }}>
              ✏️ Connect manually with ID & Token
            </button>
          </div>
        </div>
      </div>
    </LayoutWrapper>
  );
}
