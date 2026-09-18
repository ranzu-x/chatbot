import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import { commerceAPI } from '../../services/api';
import { notify, showAlert } from '../../utils/alerts';
import { ShoppingBag, RefreshCw, Trash2, Plus, Loader2, ExternalLink } from 'lucide-react';

export default function CommercePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(null); // 'shopify' | 'woocommerce' | null
  const [shopDomain, setShopDomain] = useState('');
  const [wooForm, setWooForm] = useState({ storeDomain: '', consumerKey: '', consumerSecret: '' });
  const [connecting, setConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState(null);

  const load = () => {
    setLoading(true);
    commerceAPI.getConnections()
      .then((res) => setConnections(res.data?.connections || []))
      .catch(() => notify.error('Failed to load store connections'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const connected = searchParams.get('connected');
    if (connected === '1') {
      notify.success('Store connected!');
      load();
      setSearchParams({}, { replace: true });
    } else if (connected === '0') {
      notify.error(searchParams.get('reason') || 'Failed to connect store');
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleShopifyConnect = async (e) => {
    e.preventDefault();
    if (!shopDomain.trim()) { notify.error('Enter your store domain'); return; }
    setConnecting(true);
    try {
      const res = await commerceAPI.getShopifyAuthUrl(shopDomain.trim());
      window.location.href = res.data.url;
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to start Shopify connection');
      setConnecting(false);
    }
  };

  const handleWooConnect = async (e) => {
    e.preventDefault();
    const { storeDomain, consumerKey, consumerSecret } = wooForm;
    if (!storeDomain.trim() || !consumerKey.trim() || !consumerSecret.trim()) {
      notify.error('All fields are required');
      return;
    }
    setConnecting(true);
    try {
      await commerceAPI.connectWooCommerce(wooForm);
      notify.success('WooCommerce store connected!');
      setShowModal(null);
      setWooForm({ storeDomain: '', consumerKey: '', consumerSecret: '' });
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to connect WooCommerce store');
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async (id) => {
    setSyncingId(id);
    try {
      const res = await commerceAPI.syncConnection(id);
      notify.success(`Synced ${res.data?.productsCount ?? 0} products`);
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Sync failed');
    } finally {
      setSyncingId(null);
    }
  };

  const handleDisconnect = async (id) => {
    const ok = await showAlert.confirm({ title: 'Disconnect this store?', text: 'Synced products will remain until removed manually.', confirmButtonText: 'Yes, Disconnect' });
    if (!ok) return;
    try {
      await commerceAPI.disconnect(id);
      notify.success('Store disconnected');
      load();
    } catch {
      notify.error('Failed to disconnect');
    }
  };

  return (
    <AppLayout>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">Shopify & WooCommerce</h1>
          <p className="page-subtitle">Connect a store to look up products and send them over WhatsApp.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setShowModal('woocommerce')}><Plus size={15} /> Connect WooCommerce</button>
          <button className="btn btn-primary" onClick={() => setShowModal('shopify')}><Plus size={15} /> Connect Shopify</button>
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-overlay"><div className="loading-spinner" /></div>
        ) : connections.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><ShoppingBag size={28} /></div>
            <div className="empty-title">No stores connected</div>
            <div className="empty-desc">Connect Shopify or WooCommerce to start syncing products.</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Platform</th><th>Store</th><th>Products</th><th>Last Synced</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {connections.map((c) => (
                  <tr key={c.id}>
                    <td className="font-medium">{c.platform === 'SHOPIFY' ? 'Shopify' : 'WooCommerce'}</td>
                    <td style={{ fontSize: '0.82rem', color: '#64748b' }}>{c.store_domain}</td>
                    <td>{c.productCount}</td>
                    <td style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{c.last_synced_at ? new Date(c.last_synced_at).toLocaleString() : 'Never'}</td>
                    <td>
                      {c.last_sync_error ? (
                        <span className="badge badge-muted" title={c.last_sync_error}>Sync error</span>
                      ) : (
                        <span className={`badge ${c.is_active ? 'badge-success' : 'badge-muted'}`}>{c.is_active ? 'Active' : 'Inactive'}</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => handleSync(c.id)} disabled={syncingId === c.id}>
                          {syncingId === c.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Sync
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDisconnect(c.id)}><Trash2 size={12} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal === 'shopify' && (
        <div className="modal-overlay" onClick={() => !connecting && setShowModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ShoppingBag size={17} /> Connect Shopify</div>
            <form onSubmit={handleShopifyConnect} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Store Domain *</label>
                <input className="form-input" placeholder="your-store.myshopify.com" value={shopDomain} onChange={(e) => setShopDomain(e.target.value)} required />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>You'll be redirected to Shopify to approve access.</span>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={connecting}>
                  {connecting ? <Loader2 size={14} className="animate-spin" /> : <><ExternalLink size={14} /> Continue to Shopify</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showModal === 'woocommerce' && (
        <div className="modal-overlay" onClick={() => !connecting && setShowModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ShoppingBag size={17} /> Connect WooCommerce</div>
            <form onSubmit={handleWooConnect} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Store URL *</label>
                <input className="form-input" placeholder="https://yourstore.com" value={wooForm.storeDomain} onChange={(e) => setWooForm((f) => ({ ...f, storeDomain: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Consumer Key *</label>
                <input className="form-input" value={wooForm.consumerKey} onChange={(e) => setWooForm((f) => ({ ...f, consumerKey: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Consumer Secret *</label>
                <input className="form-input" type="password" value={wooForm.consumerSecret} onChange={(e) => setWooForm((f) => ({ ...f, consumerSecret: e.target.value }))} required />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Generate these from your WordPress admin under WooCommerce → Settings → Advanced → REST API.</span>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={connecting}>
                  {connecting ? <Loader2 size={14} className="animate-spin" /> : 'Connect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
