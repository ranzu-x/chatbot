import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import { commerceAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import useUrlState from '../../hooks/useUrlState';
import { ArrowLeft, ShoppingBag, Loader2, BookOpen, KeyRound } from 'lucide-react';

const EMPTY_FORM = {
  name: '',
  storeDomain: '',
  accessToken: '',
  clientId: '',
  clientSecret: '',
  storeUrl: '',
  consumerKey: '',
  consumerSecret: '',
};

const secretInputProps = { autoComplete: 'new-password', autoCorrect: 'off', spellCheck: 'false', 'data-lpignore': 'true', 'data-1p-ignore': 'true' };
const monoStyle = { fontFamily: 'var(--font-mono)' };

// Only same-app paths are followed back (never another site / protocol-relative URL).
function safeReturnTo(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/bots?cat=commerce';
}

function setupSteps(platform, method) {
  if (platform === 'WOOCOMMERCE') {
    return [
      'In WordPress admin open WooCommerce → Settings → Advanced → REST API and click "Add key".',
      'Give it a description, pick the user, and set Permissions to Read/Write (needed to add order notes and cancel COD orders).',
      'Click "Generate API key" and paste the Consumer key and Consumer secret here.',
      'Use the site\'s main address (https://yourstore.com), not a page like /shop. The site must be on HTTPS.',
      'Your web host must let apps reach the WooCommerce REST API. Free hosts such as InfinityFree block it and can\'t be used.',
      'Abandoned carts are read from draft (block checkout), pending and failed orders.',
    ];
  }
  if (method === 'CLIENT_CREDENTIALS') {
    return [
      'Open the Shopify Dev Dashboard (dev.shopify.com) of the organization that owns the store and create an app.',
      'In the app version, add the Admin API scopes read_orders, write_orders and read_products, then release it and install the app on the store.',
      'Request protected customer data access for the app (Name, Email, Phone and Address) — without it Shopify refuses to return orders. See shopify.dev/docs/apps/launch/protected-customer-data.',
      'Copy the app\'s Client ID and Client secret from its Settings and paste them here. We exchange them for a 24-hour access token and renew it automatically.',
    ];
  }
  return [
    'In Shopify admin open Settings → Apps and sales channels → Develop apps, and create an app.',
    'Configure Admin API scopes: read_orders, write_orders and read_products, then install the app.',
    'Reveal the Admin API access token (starts with shpat_) once and paste it here.',
  ];
}

function Card({ icon, title, children }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

/**
 * Connect a Shopify / WooCommerce store, or replace a connected store's
 * credentials (?id=). A full page rather than a modal so a stray click
 * outside the form can't throw away what was typed. `?returnTo=` is where
 * Cancel / Back / a successful connect go (the list it was opened from).
 */
export default function ConnectStorePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get('returnTo'));
  const editId = searchParams.get('id');
  const [platform, setPlatform] = useUrlState('platform', 'SHOPIFY', { allowed: ['SHOPIFY', 'WOOCOMMERCE'] });
  const [shopifyMethod, setShopifyMethod] = useUrlState('method', 'ACCESS_TOKEN', { allowed: ['ACCESS_TOKEN', 'CLIENT_CREDENTIALS'] });
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [loadingEdit, setLoadingEdit] = useState(Boolean(editId));
  const [connecting, setConnecting] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const dirty = Object.keys(EMPTY_FORM).some((k) => form[k] !== EMPTY_FORM[k] && !(editing && ['name', 'storeDomain', 'storeUrl'].includes(k)));

  // Updating credentials: prefill the store's name/address and lock the platform.
  useEffect(() => {
    if (!editId) return;
    commerceAPI.getConnections()
      .then((res) => {
        const c = (res.data?.connections || []).find((x) => String(x.id) === String(editId));
        if (!c) {
          notify.error('That store connection was not found');
          return;
        }
        setEditing(c);
        setPlatform(c.platform);
        if (c.platform === 'SHOPIFY') setShopifyMethod(c.auth_mode === 'CLIENT_CREDENTIALS' ? 'CLIENT_CREDENTIALS' : 'ACCESS_TOKEN');
        setForm({
          ...EMPTY_FORM,
          name: c.name || '',
          storeDomain: c.platform === 'SHOPIFY' ? c.store_domain.replace(/\.myshopify\.com$/, '') : '',
          storeUrl: c.platform === 'WOOCOMMERCE' ? c.store_domain : '',
        });
      })
      .catch(() => notify.error('Failed to load the store connection'))
      .finally(() => setLoadingEdit(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // Closing / reloading the tab with typed keys asks first.
  useEffect(() => {
    if (!dirty || connecting) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, connecting]);

  const goBack = () => navigate(returnTo);

  const handleConnect = async (e) => {
    e.preventDefault();
    const payload = platform === 'SHOPIFY'
      ? {
          platform: 'SHOPIFY',
          name: form.name,
          storeDomain: form.storeDomain,
          ...(shopifyMethod === 'ACCESS_TOKEN'
            ? { accessToken: form.accessToken }
            : { clientId: form.clientId, clientSecret: form.clientSecret }),
        }
      : { platform: 'WOOCOMMERCE', name: form.name, storeUrl: form.storeUrl, consumerKey: form.consumerKey, consumerSecret: form.consumerSecret };
    setConnecting(true);
    try {
      const res = await commerceAPI.connect(payload);
      notify.success(res.data?.message || 'Store connected');
      navigate(returnTo);
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to connect the store');
      setConnecting(false);
    }
  };

  return (
    <AppLayout>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '20px 20px 40px' }}>
        <button type="button" onClick={goBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', padding: 0, marginBottom: 14, color: 'var(--text-tertiary)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
          <ArrowLeft size={14} /> Store Connections
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--bg-hover)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', flexShrink: 0 }}>
            <ShoppingBag size={20} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {editing ? `Update ${editing.name || editing.store_name || editing.store_domain}` : 'Connect Store'}
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              {editing
                ? 'Enter new credentials for this store. They are checked live before they replace the old ones.'
                : 'Connect a Shopify or WooCommerce store to send order notifications, COD verification and abandoned-cart messages.'}
            </p>
          </div>
        </div>

        {loadingEdit ? (
          <div className="loading-overlay"><div className="loading-spinner" /></div>
        ) : (
          <div className="connect-store-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 18, alignItems: 'start' }}>
            <form onSubmit={handleConnect}>
              <Card icon={<KeyRound size={17} />} title="Store details">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[['SHOPIFY', 'Shopify'], ['WOOCOMMERCE', 'WooCommerce']].map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setPlatform(id)}
                        disabled={Boolean(editing) && editing.platform !== id}
                        className={`btn ${platform === id ? 'btn-primary' : 'btn-secondary'}`}
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

                  {platform === 'SHOPIFY' ? (
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
                            readOnly={Boolean(editing)}
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
                            <input type="radio" name="shopifyMethod" checked={shopifyMethod === id} onChange={() => setShopifyMethod(id)} />
                            {label}
                          </label>
                        ))}
                      </div>

                      {shopifyMethod === 'ACCESS_TOKEN' ? (
                        <div className="form-group">
                          <label className="form-label">Admin API access token *</label>
                          <input className="form-input" style={monoStyle} type="password" placeholder="shpat_…" value={form.accessToken} onChange={(e) => set({ accessToken: e.target.value })} required {...secretInputProps} />
                        </div>
                      ) : (
                        <>
                          <div className="form-group">
                            <label className="form-label">Client ID *</label>
                            <input className="form-input" style={monoStyle} value={form.clientId} onChange={(e) => set({ clientId: e.target.value })} required autoComplete="off" spellCheck="false" />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Client secret *</label>
                            <input className="form-input" style={monoStyle} type="password" value={form.clientSecret} onChange={(e) => set({ clientSecret: e.target.value })} required {...secretInputProps} />
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="form-group">
                        <label className="form-label">Store URL *</label>
                        <input className="form-input" placeholder="https://yourstore.com" value={form.storeUrl} onChange={(e) => set({ storeUrl: e.target.value })} required readOnly={Boolean(editing)} autoComplete="off" spellCheck="false" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Consumer key *</label>
                        <input className="form-input" style={monoStyle} placeholder="ck_…" value={form.consumerKey} onChange={(e) => set({ consumerKey: e.target.value })} required autoComplete="off" spellCheck="false" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Consumer secret *</label>
                        <input className="form-input" style={monoStyle} type="password" placeholder="cs_…" value={form.consumerSecret} onChange={(e) => set({ consumerSecret: e.target.value })} required {...secretInputProps} />
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 6, borderTop: '1px solid var(--border)', marginTop: 4 }}>
                    <button type="button" className="btn btn-secondary" onClick={goBack} disabled={connecting}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={connecting}>
                      {connecting ? <><Loader2 size={14} className="animate-spin" /> Verifying…</> : (editing ? 'Update credentials' : 'Connect')}
                    </button>
                  </div>
                </div>
              </Card>
            </form>

            <Card icon={<BookOpen size={17} />} title="Where do I find these?">
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: '0.8rem', lineHeight: 1.55, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {setupSteps(platform, shopifyMethod).map((s) => <li key={s}>{s}</li>)}
              </ol>
              <p style={{ margin: '14px 0 0', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Orders placed before you connect are never messaged.
              </p>
            </Card>
          </div>
        )}
      </div>
      <style>{'@media (max-width: 900px) { .connect-store-grid { grid-template-columns: minmax(0, 1fr) !important; } }'}</style>
    </AppLayout>
  );
}
