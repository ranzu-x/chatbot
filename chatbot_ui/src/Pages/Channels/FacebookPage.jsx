import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { channelAPI } from '../../services/api';
import useFacebookSDK from '../../hooks/useFacebookSDK';

// ─── Facebook Login Button ─────────────────────────────────────────
function FBLoginButton({ onClick, loading, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 12,
        padding: '12px 24px', borderRadius: 8, border: 'none',
        background: '#1877f2', color: '#fff', fontWeight: 700,
        fontSize: '0.95rem', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1, transition: 'all 0.2s',
        boxShadow: '0 4px 14px rgba(24,119,242,0.35)',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = '#0f65d4'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#1877f2'; }}
    >
      {loading
        ? <span className="loading-spinner" style={{ width: 18, height: 18, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
        : <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
      }
      {loading ? 'Connecting…' : 'Continue with Facebook'}
    </button>
  );
}

// ─── Page Card ────────────────────────────────────────────────────
function PageCard({ page, selected, onToggle, connected }) {
  return (
    <div
      onClick={() => !connected && onToggle(page)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 16px', borderRadius: 10, cursor: connected ? 'default' : 'pointer',
        border: `2px solid ${selected ? '#1877f2' : 'var(--border)'}`,
        background: selected ? 'rgba(24,119,242,0.06)' : 'var(--bg-card)',
        transition: 'all 0.15s', marginBottom: 10,
      }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: 8, flexShrink: 0,
        background: '#1877f2', display: 'flex', alignItems: 'center',
        justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '1.1rem',
      }}>
        {page.name?.[0]?.toUpperCase() || 'P'}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{page.name}</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>ID: {page.id}</div>
      </div>
      {connected
        ? <span className="badge badge-success">✅ Connected</span>
        : <div style={{
            width: 20, height: 20, borderRadius: 4, border: `2px solid ${selected ? '#1877f2' : 'var(--border)'}`,
            background: selected ? '#1877f2' : 'transparent', display: 'flex',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {selected && <svg width="12" height="12" viewBox="0 0 12 12" fill="white"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/></svg>}
          </div>
      }
    </div>
  );
}

export default function FacebookPage() {
  const { fbReady, sdkError, login } = useFacebookSDK();

  const [connected, setConnected]         = useState([]);
  const [loadingConnected, setLoadingConnected] = useState(true);
  const [step, setStep]                   = useState('idle'); // idle | fetching | selecting | done
  const [fetchedPages, setFetchedPages]   = useState([]);
  const [selected, setSelected]           = useState([]);
  const [importing, setImporting]         = useState(false);
  const [loginLoading, setLoginLoading]   = useState(false);
  const [toast, setToast]                 = useState(null);

  // Manual connect fallback
  const [showManual, setShowManual]       = useState(false);
  const [manualForm, setManualForm]       = useState({ name: '', fbPageId: '', fbPageName: '', accessToken: '', verifyToken: '' });
  const [manualSaving, setManualSaving]   = useState(false);

  useEffect(() => { fetchConnected(); }, []);

  const fetchConnected = async () => {
    setLoadingConnected(true);
    try { const r = await channelAPI.getFacebook(); setConnected(r.data.pages || []); }
    catch { showToast('Failed to load connected pages', 'error'); }
    finally { setLoadingConnected(false); }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleFBLogin = () => {
    setLoginLoading(true);
    login('pages_show_list,pages_messaging,pages_read_engagement,pages_manage_metadata', async (err, token) => {
      setLoginLoading(false);
      if (err) { showToast(err, 'error'); return; }
      setStep('fetching');
      try {
        const res = await channelAPI.importFBPages(token);
        const pages = res.data.pages || [];
        if (!pages.length) { showToast('No Facebook Pages found for this account.', 'error'); setStep('idle'); return; }
        setFetchedPages(pages);
        setStep('selecting');
      } catch (e) { showToast(e.response?.data?.message || 'Failed to fetch pages', 'error'); setStep('idle'); }
    });
  };

  const toggleSelect = (page) => setSelected(prev =>
    prev.find(p => p.id === page.id) ? prev.filter(p => p.id !== page.id) : [...prev, page]
  );

  const handleImport = async () => {
    setImporting(true);
    try {
      for (const p of selected) {
        await channelAPI.addFacebook({
          name: p.name, fbPageId: p.id, fbPageName: p.name,
          accessToken: p.access_token, verifyToken: `fb_${p.id}`,
        });
      }
      showToast(`✅ ${selected.length} page(s) connected successfully!`);
      setSelected([]); setFetchedPages([]); setStep('done');
      fetchConnected();
    } catch { showToast('Import failed', 'error'); }
    finally { setImporting(false); }
  };

  const handleManual = async (e) => {
    e.preventDefault(); setManualSaving(true);
    try {
      await channelAPI.addFacebook(manualForm);
      showToast('Page connected!');
      setManualForm({ name: '', fbPageId: '', fbPageName: '', accessToken: '', verifyToken: '' });
      setShowManual(false);
      fetchConnected();
    } catch (err) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setManualSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this Facebook Page?')) return;
    try { await channelAPI.deleteFacebook(id); showToast('Page removed'); fetchConnected(); }
    catch { showToast('Failed', 'error'); }
  };

  const connectedIds = new Set(connected.map(c => c.fb_page_id));

  return (
    <AppLayout>
      {toast && <div className="toast-container"><div className={`toast ${toast.type}`}>{toast.msg}</div></div>}

      {/* Manual Connect Modal */}
      {showManual && (
        <div className="modal-overlay" onClick={() => setShowManual(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">📘 Manual Page Connect</div>
            <form onSubmit={handleManual} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group"><label className="form-label">Display Name *</label><input className="form-input" value={manualForm.name} onChange={e => setManualForm(f => ({ ...f, name: e.target.value }))} required /></div>
              <div className="form-group"><label className="form-label">Page ID *</label><input className="form-input" value={manualForm.fbPageId} onChange={e => setManualForm(f => ({ ...f, fbPageId: e.target.value }))} required /></div>
              <div className="form-group"><label className="form-label">Page Name</label><input className="form-input" value={manualForm.fbPageName} onChange={e => setManualForm(f => ({ ...f, fbPageName: e.target.value }))} /></div>
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
          <span style={{ fontSize: '1.8rem' }}>📘</span>
          <div>
            <h1 className="page-title">Facebook Messenger</h1>
            <p className="page-subtitle">Connect your Facebook Pages to receive and reply to Messenger conversations</p>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 24, alignItems: 'start' }}>

          {/* Left — Connected Pages */}
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Connected Pages</h2>
              <span className="badge badge-primary">{connected.length} page{connected.length !== 1 ? 's' : ''}</span>
            </div>

            {loadingConnected ? <div className="loading-overlay"><div className="loading-spinner" /></div>
              : connected.length === 0
                ? <div className="empty-state"><div className="empty-icon">📘</div><div className="empty-title">No pages connected yet</div><div className="empty-desc">Use the Login with Facebook button to connect your pages</div></div>
                : (
                  <div className="table-wrapper">
                    <table>
                      <thead><tr><th>Page</th><th>Page ID</th><th>Status</th><th></th></tr></thead>
                      <tbody>
                        {connected.map(p => (
                          <tr key={p.id}>
                            <td>
                              <div className="flex items-center gap-3">
                                <div style={{ width: 34, height: 34, borderRadius: 8, background: '#1877f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.9rem', flexShrink: 0 }}>
                                  {p.name?.[0]?.toUpperCase()}
                                </div>
                                <span className="font-medium">{p.name}</span>
                              </div>
                            </td>
                            <td><code style={{ fontSize: '0.78rem', background: 'var(--bg-hover)', padding: '2px 8px', borderRadius: 4 }}>{p.fb_page_id}</code></td>
                            <td><span className={`badge ${p.is_active ? 'badge-success' : 'badge-muted'}`}>{p.is_active ? 'Active' : 'Inactive'}</span></td>
                            <td><button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>🗑</button></td>
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

            {/* SDK Error */}
            {sdkError && (
              <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '16px 18px', fontSize: '0.85rem', color: 'var(--warning)' }}>
                ⚠️ {sdkError}
                <div style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
                  Set up your <strong>Meta App ID</strong> in <em>Settings → Meta App Setup</em> first.
                </div>
              </div>
            )}

            {/* Login Step */}
            {(step === 'idle' || step === 'done') && (
              <div className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📘</div>
                <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>Connect Facebook Pages</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
                  Login with your Facebook account to see all Pages you manage and select which ones to connect.
                </div>
                <FBLoginButton onClick={handleFBLogin} loading={loginLoading || !fbReady} disabled={!!sdkError || !fbReady} />
                {!fbReady && !sdkError && <div style={{ marginTop: 10, fontSize: '0.78rem', color: 'var(--text-muted)' }}>Loading Facebook SDK…</div>}
                <div style={{ marginTop: 16, fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Required permissions: <code>pages_show_list</code>, <code>pages_messaging</code>
                </div>
              </div>
            )}

            {/* Fetching */}
            {step === 'fetching' && (
              <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Fetching your Facebook Pages…</div>
              </div>
            )}

            {/* Page Selection */}
            {step === 'selecting' && (
              <div className="card">
                <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700 }}>Select Pages to Connect</div>
                  <span className="badge badge-primary">{fetchedPages.length} found</span>
                </div>
                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                  {fetchedPages.map(page => (
                    <PageCard
                      key={page.id}
                      page={page}
                      selected={!!selected.find(s => s.id === page.id)}
                      onToggle={toggleSelect}
                      connected={connectedIds.has(page.id)}
                    />
                  ))}
                </div>
                <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setStep('idle'); setSelected([]); }}>← Back</button>
                  <button
                    className="btn btn-primary" style={{ flex: 2, background: '#1877f2' }}
                    onClick={handleImport}
                    disabled={!selected.length || importing}
                  >
                    {importing
                      ? <span className="loading-spinner" style={{ width: 16, height: 16, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                      : `Connect ${selected.length} Page${selected.length !== 1 ? 's' : ''}`
                    }
                  </button>
                </div>
              </div>
            )}

            {/* Manual Fallback */}
            <button
              className="btn btn-secondary w-full"
              onClick={() => setShowManual(true)}
              style={{ fontSize: '0.8rem' }}
            >
              ✏️ Connect manually with Page Token
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
