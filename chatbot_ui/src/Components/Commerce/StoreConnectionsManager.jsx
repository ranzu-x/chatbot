import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { commerceAPI } from '../../services/api';
import { notify, showAlert } from '../../utils/alerts';
import { useAuth } from '../../Provider/AuthContext';
import {
  ShoppingBag, RefreshCw, Trash2, Plus, Loader2, Pause, Play, KeyRound, AlertTriangle, Radar,
} from 'lucide-react';

const AUTH_LABELS = {
  ACCESS_TOKEN: 'Admin API token',
  CLIENT_CREDENTIALS: 'Client ID + secret',
  WOO_KEYS: 'REST API keys',
};

function timeAgo(value) {
  if (!value) return 'never';
  const s = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(value).toLocaleDateString();
}

/**
 * Turns the two Shopify permission errors a store owner can fix themselves
 * into what to do (the raw error stays visible above). null = no hint.
 */
function shopifyFixHint(errors) {
  const text = errors.filter(Boolean).join(' ');
  if (/not approved to access the \w+ object|protected-customer-data/i.test(text)) {
    return 'Fix in Shopify: this app has no access to protected customer data (names, phone numbers, addresses on orders). '
      + 'Request protected customer data access for the app — Name, Email, Phone and Address — then release the app version '
      + 'and update it on the store. Apps created in Shopify admin (shpat_ token) have this automatically.';
  }
  const scope = text.match(/Access denied for (\w+) field/i);
  if (scope) {
    return `Fix in Shopify: the app is missing a permission for "${scope[1]}". Add the Admin API scopes read_orders, write_orders `
      + 'and read_products to the app version, release it and update the app on the store.';
  }
  return null;
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
  const navigate = useNavigate();
  const location = useLocation();
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // `${id}:${action}`

  const load = () => {
    setLoading(true);
    commerceAPI.getConnections()
      .then((res) => setConnections(res.data?.connections || []))
      .catch(() => notify.error('Failed to load store connections'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // The connect form is its own page (a modal lost everything on a stray click);
  // it comes back here, to this exact tab, when done.
  const openConnect = (id) => {
    const params = new URLSearchParams({ returnTo: `${location.pathname}${location.search}` });
    if (id) params.set('id', id);
    navigate(`/stores/connect?${params}`);
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

  // Store webhooks (chatbot_api/utils/commerceWebhooks.js): orders arrive in seconds instead of ~1 minute.
  const handleInstant = (c) => run(c.id, 'hooks', async () => {
    try {
      const res = await commerceAPI.enableInstantUpdates(c.id);
      notify.success(res.data?.message || 'Instant updates are on');
    } catch (err) {
      notify.error(err.response?.data?.message || 'Could not turn on instant updates');
    }
    load();
  });

  // WooCommerce classic checkout: carts the REST API can't see come from a small plugin (chatbot_api/assets/woo-plugin).
  const handlePlugin = (c) => run(c.id, 'plugin', async () => {
    try {
      const res = await commerceAPI.downloadWooPlugin(c.id);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'chatbot-cart-recovery.zip';
      a.click();
      URL.revokeObjectURL(url);
      notify.success('Downloaded — in WordPress go to Plugins → Add New → Upload Plugin, choose the zip and activate it.');
    } catch (err) {
      let message = 'Could not create the plugin';
      try { message = JSON.parse(await err.response.data.text()).message || message; } catch { /* not JSON */ }
      notify.error(message);
    }
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
                      {c.platform === 'WOOCOMMERCE' && c.last_plugin_event_at && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>Cart plugin: last cart {timeAgo(c.last_plugin_event_at)}</div>
                      )}
                      {c.is_active && (
                        <div style={{ fontSize: '0.7rem', marginTop: 2, color: c.webhook_status === 'ACTIVE' ? 'var(--success, #16a34a)' : 'var(--text-muted)', maxWidth: 280 }} title={c.webhook_error || ''}>
                          {c.webhook_status === 'ACTIVE'
                            ? `⚡ Instant updates on${c.last_webhook_at ? ` · last ${timeAgo(c.last_webhook_at)}` : ''}`
                            : c.webhook_status === 'FAILED'
                              ? `Instant updates failed: ${c.webhook_error || 'unknown error'} — checked every minute`
                              : c.webhook_status === 'UNAVAILABLE'
                                ? c.webhook_error
                                : 'Checked every minute'}
                        </div>
                      )}
                      {error && c.is_active && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--danger, #dc2626)', marginTop: 2, maxWidth: 260 }}>{error}</div>
                      )}
                      {c.is_active && c.last_sync_error && c.last_sync_error !== error && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--danger, #dc2626)', marginTop: 2, maxWidth: 260 }}>Products: {c.last_sync_error}</div>
                      )}
                      {c.is_active && c.platform === 'SHOPIFY' && shopifyFixHint([error, c.last_sync_error]) && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 4, maxWidth: 300, lineHeight: 1.45, padding: '6px 8px', borderRadius: 6, background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
                          {shopifyFixHint([error, c.last_sync_error])}
                        </div>
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
                        {canManage && c.platform === 'WOOCOMMERCE' && (
                          <button className="btn btn-secondary btn-sm" title="Catch carts from the classic checkout too (WordPress plugin)" onClick={() => handlePlugin(c)} disabled={isBusy(c.id, 'plugin')}>
                            {isBusy(c.id, 'plugin') ? <Loader2 size={12} className="animate-spin" /> : '⬇'} Cart plugin
                          </button>
                        )}
                        {canManage && c.is_active && c.webhook_status !== 'ACTIVE' && c.webhook_status !== 'UNAVAILABLE' && (
                          <button className="btn btn-secondary btn-sm" title="Have the store tell us about new orders right away" onClick={() => handleInstant(c)} disabled={isBusy(c.id, 'hooks')}>
                            {isBusy(c.id, 'hooks') ? <Loader2 size={12} className="animate-spin" /> : '⚡'} Instant updates
                          </button>
                        )}
                        {canManage && (
                          <>
                            <button className="btn btn-secondary btn-sm" title={c.is_active ? 'Pause' : 'Resume'} onClick={() => handleToggle(c)} disabled={isBusy(c.id, 'toggle')}>
                              {c.is_active ? <Pause size={12} /> : <Play size={12} />}
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              title="Update credentials"
                              onClick={() => openConnect(c.id)}
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

    </>
  );
}
