import { useState, useEffect } from 'react';
import { commerceAPI } from '../../services/api';
import { notify, showAlert } from '../../utils/alerts';
import { useAuth } from '../../Provider/AuthContext';
import {
  ShoppingBag, RefreshCw, Trash2, Plus, Loader2, Pause, Play, KeyRound, AlertTriangle, ChevronDown, ChevronUp, Radar,
} from 'lucide-react';

const AUTH_LABELS = {
  ACCESS_TOKEN: 'Admin API token',
  CLIENT_CREDENTIALS: 'Client ID + secret',
  WOO_KEYS: 'REST API keys',
};

const EMPTY_FORM = {
  platform: 'SHOPIFY',
  name: '',
  storeDomain: '',
  shopifyMethod: 'ACCESS_TOKEN',
  accessToken: '',
  clientId: '',
  clientSecret: '',
  storeUrl: '',
  consumerKey: '',
  consumerSecret: '',
};

const secretInputProps = { autoComplete: 'new-password', autoCorrect: 'off', spellCheck: 'false', 'data-lpignore': 'true', 'data-1p-ignore': 'true' };

function timeAgo(value) {
  if (!value) return 'never';
  const s = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(value).toLocaleDateString();
}

function SetupSteps({ platform, method }) {
  const [open, setOpen] = useState(false);
  const steps = platform === 'WOOCOMMERCE'
    ? [
        'In WordPress admin open WooCommerce → Settings → Advanced → REST API and click "Add key".',
        'Give it a description, pick the user, and set Permissions to Read/Write (needed to add order notes and cancel COD orders).',
        'Click "Generate API key" and paste the Consumer key and Consumer secret here.',
        'Your site must be on HTTPS. Abandoned carts are read from draft (block checkout), pending and failed orders.',
      ]
    : method === 'CLIENT_CREDENTIALS'
      ? [
          'Open the Shopify Dev Dashboard (dev.shopify.com) of the organization that owns the store and create an app.',
          'In the app version, add the Admin API scopes read_orders, write_orders and read_products, then release it and install the app on the store.',
          'Copy the app\'s Client ID and Client secret from its Settings and paste them here. We exchange them for a 24-hour access token and renew it automatically.',
        ]
      : [
          'In Shopify admin open Settings → Apps and sales channels → Develop apps, and create an app.',
          'Configure Admin API scopes: read_orders, write_orders and read_products, then install the app.',
          'Reveal the Admin API access token (starts with shpat_) once and paste it here.',
        ];
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-hover)' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}
      >
        Where do I find these?
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <ol style={{ margin: 0, padding: '0 12px 10px 30px', fontSize: '0.76rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
      )}
    </div>
  );
}

/**
 * Shopify / WooCommerce store connections — shared by Settings → App
 * Integrations → Store API and Automation → Commerce → Store Connections.
 * Layout chrome lives in the host page, so this renders only the content.
 * Connecting / disconnecting is owner-only (the API enforces it too).
 */
export default function StoreConnectionsManager() {
  const { user } = useAuth();
  const canManage = user?.role !== 'USER';
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(null); // `${id}:${action}`

  const load = () => {
    setLoading(true);
    commerceAPI.getConnections()
      .then((res) => setConnections(res.data?.connections || []))
      .catch(() => notify.error('Failed to load store connections'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const openConnect = (preset = {}) => {
    setForm({ ...EMPTY_FORM, ...preset });
    setModalOpen(true);
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    const payload = form.platform === 'SHOPIFY'
      ? {
          platform: 'SHOPIFY',
          name: form.name,
          storeDomain: form.storeDomain,
          ...(form.shopifyMethod === 'ACCESS_TOKEN'
            ? { accessToken: form.accessToken }
            : { clientId: form.clientId, clientSecret: form.clientSecret }),
        }
      : { platform: 'WOOCOMMERCE', name: form.name, storeUrl: form.storeUrl, consumerKey: form.consumerKey, consumerSecret: form.consumerSecret };
    setConnecting(true);
    try {
      const res = await commerceAPI.connect(payload);
      notify.success(res.data?.message || 'Store connected');
      setModalOpen(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to connect the store');
    } finally {
      setConnecting(false);
    }
  };

  const run = async (id, action, fn) => {
    setBusy(`${id}:${action}`);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  const handlePoll = (c) => run(c.id, 'poll', async () => {
    try {
      const res = await commerceAPI.pollConnection(c.id);
      notify.success(res.data?.message || 'Checked');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not reach the store');
    }
    load();
  });

  const handleSync = (c) => run(c.id, 'sync', async () => {
    try {
      const res = await commerceAPI.syncConnection(c.id);
      notify.success(`Synced ${res.data?.productsCount ?? 0} products`);
    } catch (err) {
      notify.error(err.response?.data?.message || 'Product sync failed');
    }
    load();
  });

  const handleToggle = (c) => run(c.id, 'toggle', async () => {
    try {
      await commerceAPI.updateConnection(c.id, { isActive: !c.is_active });
      notify.success(c.is_active ? 'Store paused — no new messages will be sent' : 'Store resumed');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to update the store');
    }
    load();
  });

  const handleDisconnect = async (c) => {
    const ok = await showAlert.confirm({
      title: `Disconnect ${c.name || c.store_domain}?`,
      text: 'Its automation campaigns, order history and queued messages are deleted too. The store itself is not changed.',
      confirmButtonText: 'Yes, disconnect',
    });
    if (!ok) return;
    run(c.id, 'delete', async () => {
      try {
        await commerceAPI.disconnect(c.id);
        notify.success('Store disconnected');
      } catch (err) {
        notify.error(err.response?.data?.message || 'Failed to disconnect');
      }
      load();
    });
  };

  const isBusy = (id, action) => busy === `${id}:${action}`;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: 560 }}>
          New orders and checkouts are read from your store about once a minute and trigger your Commerce automation campaigns.
          Orders placed before you connected are never messaged.
        </p>
        {canManage && (
          <button className="btn btn-primary" onClick={() => openConnect()}>
            <Plus size={15} /> Connect Store
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading-overlay"><div className="loading-spinner" /></div>
      ) : connections.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><ShoppingBag size={28} /></div>
          <div className="empty-title">No stores connected</div>
          <div className="empty-desc">
            {canManage ? 'Connect a Shopify or WooCommerce store to send order notifications, COD verification and abandoned-cart messages on WhatsApp.' : 'Ask the account owner to connect a store.'}
          </div>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Store</th>
                <th>Connected with</th>
                <th>Status</th>
                <th>Activity</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => {
                const error = c.last_poll_error;
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="font-medium">{c.name || c.store_name || c.store_domain}</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                        {c.platform === 'SHOPIFY' ? 'Shopify' : 'WooCommerce'} · {c.store_domain}{c.currency ? ` · ${c.currency}` : ''}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>{AUTH_LABELS[c.auth_mode] || '—'}</td>
                    <td>
                      {!c.is_active ? (
                        <span className="badge badge-muted">Paused</span>
                      ) : error ? (
                        <span className="badge badge-danger" title={error} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <AlertTriangle size={11} /> Error
                        </span>
                      ) : (
                        <span className="badge badge-success">Active</span>
                      )}
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3 }}>Checked {timeAgo(c.last_polled_at)}</div>
                      {error && c.is_active && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--danger, #dc2626)', marginTop: 2, maxWidth: 260 }}>{error}</div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {c.orderCount} orders · {c.openCartCount} open carts
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.activeCampaignCount} active campaigns · {c.productCount} products</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary btn-sm" title="Read new orders & checkouts now" onClick={() => handlePoll(c)} disabled={isBusy(c.id, 'poll')}>
                          {isBusy(c.id, 'poll') ? <Loader2 size={12} className="animate-spin" /> : <Radar size={12} />} Check now
                        </button>
                        <button className="btn btn-secondary btn-sm" title="Sync product catalog" onClick={() => handleSync(c)} disabled={isBusy(c.id, 'sync')}>
                          {isBusy(c.id, 'sync') ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Products
                        </button>
                        {canManage && (
                          <>
                            <button className="btn btn-secondary btn-sm" title={c.is_active ? 'Pause' : 'Resume'} onClick={() => handleToggle(c)} disabled={isBusy(c.id, 'toggle')}>
                              {c.is_active ? <Pause size={12} /> : <Play size={12} />}
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              title="Update credentials"
                              onClick={() => openConnect(c.platform === 'SHOPIFY'
                                ? { platform: 'SHOPIFY', name: c.name || '', storeDomain: c.store_domain.replace(/\.myshopify\.com$/, ''), shopifyMethod: c.auth_mode === 'CLIENT_CREDENTIALS' ? 'CLIENT_CREDENTIALS' : 'ACCESS_TOKEN' }
                                : { platform: 'WOOCOMMERCE', name: c.name || '', storeUrl: c.store_domain })}
                            >
                              <KeyRound size={12} />
                            </button>
                            <button className="btn btn-danger btn-sm" title="Disconnect" onClick={() => handleDisconnect(c)} disabled={isBusy(c.id, 'delete')}>
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={() => !connecting && setModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 520, width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ShoppingBag size={17} /> Connect Store</div>
            <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[['SHOPIFY', 'Shopify'], ['WOOCOMMERCE', 'WooCommerce']].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => set({ platform: id })}
                    className={`btn ${form.platform === id ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ justifyContent: 'center' }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="form-group">
                <label className="form-label">Profile name</label>
                <input className="form-input" placeholder="e.g. Main store" value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} />
              </div>

              {form.platform === 'SHOPIFY' ? (
                <>
                  <div className="form-group">
                    <label className="form-label">Store subdomain *</label>
                    <div style={{ display: 'flex', alignItems: 'stretch' }}>
                      <input
                        className="form-input"
                        style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0, flex: 1, minWidth: 0 }}
                        placeholder="your-store"
                        value={form.storeDomain}
                        onChange={(e) => set({ storeDomain: e.target.value })}
                        required
                        autoComplete="off"
                        spellCheck="false"
                      />
                      <span style={{ display: 'flex', alignItems: 'center', padding: '0 10px', border: '1px solid var(--border)', borderLeft: 'none', borderRadius: '0 8px 8px 0', fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--bg-hover)' }}>
                        .myshopify.com
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.8rem' }}>
                    {[['ACCESS_TOKEN', 'Admin API access token'], ['CLIENT_CREDENTIALS', 'Client ID & secret']].map(([id, label]) => (
                      <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="radio" name="shopifyMethod" checked={form.shopifyMethod === id} onChange={() => set({ shopifyMethod: id })} />
                        {label}
                      </label>
                    ))}
                  </div>

                  {form.shopifyMethod === 'ACCESS_TOKEN' ? (
                    <div className="form-group">
                      <label className="form-label">Admin API access token *</label>
                      <input className="form-input" style={{ fontFamily: 'var(--font-mono)' }} type="password" placeholder="shpat_…" value={form.accessToken} onChange={(e) => set({ accessToken: e.target.value })} required {...secretInputProps} />
                    </div>
                  ) : (
                    <>
                      <div className="form-group">
                        <label className="form-label">Client ID *</label>
                        <input className="form-input" style={{ fontFamily: 'var(--font-mono)' }} value={form.clientId} onChange={(e) => set({ clientId: e.target.value })} required autoComplete="off" spellCheck="false" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Client secret *</label>
                        <input className="form-input" style={{ fontFamily: 'var(--font-mono)' }} type="password" value={form.clientSecret} onChange={(e) => set({ clientSecret: e.target.value })} required {...secretInputProps} />
                      </div>
                    </>
                  )}
                </>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label">Store URL *</label>
                    <input className="form-input" placeholder="https://yourstore.com" value={form.storeUrl} onChange={(e) => set({ storeUrl: e.target.value })} required autoComplete="off" spellCheck="false" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Consumer key *</label>
                    <input className="form-input" style={{ fontFamily: 'var(--font-mono)' }} placeholder="ck_…" value={form.consumerKey} onChange={(e) => set({ consumerKey: e.target.value })} required autoComplete="off" spellCheck="false" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Consumer secret *</label>
                    <input className="form-input" style={{ fontFamily: 'var(--font-mono)' }} type="password" placeholder="cs_…" value={form.consumerSecret} onChange={(e) => set({ consumerSecret: e.target.value })} required {...secretInputProps} />
                  </div>
                </>
              )}

              <SetupSteps platform={form.platform} method={form.shopifyMethod} />

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)} disabled={connecting}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={connecting}>
                  {connecting ? <><Loader2 size={14} className="animate-spin" /> Verifying…</> : 'Connect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
