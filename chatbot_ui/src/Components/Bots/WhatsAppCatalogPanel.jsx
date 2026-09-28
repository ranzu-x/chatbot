import { useEffect, useState, useCallback } from 'react';
import { Loader2, RefreshCw, Save, ShoppingBag, UploadCloud } from 'lucide-react';
import { waCatalogAPI } from '../../services/api';
import { notify } from '../../utils/alerts';

const box = { background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 14 };
const hint = { fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0' };

export function CatalogProducts({ integrationId, onPick, picked = [] }) {
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback((query) => {
    setData(null);
    setError('');
    waCatalogAPI.products(integrationId, { q: query }).then((res) => setData(res.data)).catch((err) => setError(err.response?.data?.message || 'Could not load the catalog'));
  }, [integrationId]);
  useEffect(() => { load(''); }, [load]);
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input className="form-input" style={{ flex: 1 }} placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); load(q.trim()); } }} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => load(q.trim())}>Search</button>
      </div>
      {error && <p style={{ ...hint, color: '#b45309' }}>{error}</p>}
      {!data && !error && <div style={{ padding: 16, textAlign: 'center' }}><Loader2 className="animate-spin" size={18} /></div>}
      {data && data.products.length === 0 && <p style={hint}>No products in the catalog.</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
        {data?.products.map((p) => {
          const on = picked.includes(p.retailerId);
          return (
            <button key={p.retailerId} type="button" onClick={() => onPick?.(p)} disabled={!onPick}
              style={{ textAlign: 'left', border: `1.5px solid ${on ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, padding: 6, background: on ? 'rgba(37,99,235,0.06)' : '#fff', cursor: onPick ? 'pointer' : 'default' }}>
              {p.imageUrl && <img src={p.imageUrl} alt="" style={{ width: '100%', height: 90, objectFit: 'cover', borderRadius: 6 }} />}
              <div style={{ fontSize: '0.76rem', fontWeight: 700, marginTop: 4 }}>{p.name}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{p.price} · {p.retailerId}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Bot Manager → Product Catalog Sync / Product Messages (WhatsApp) —
 * chatbot_api/utils/whatsappCatalog.js.
 */
export default function WhatsAppCatalogPanel({ account, mode = 'sync' }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(() => {
    setData(null);
    waCatalogAPI.get(account.id)
      .then((res) => { setData(res.data); const c = res.data.catalog; setForm({ catalogId: c.catalogId || '', connectionId: c.connectionId || '', catalogVisible: c.catalogVisible ?? true, cartEnabled: c.cartEnabled ?? true }); })
      .catch((err) => notify.error(err.response?.data?.message || 'Could not load the catalog'));
  }, [account.id]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try { await waCatalogAPI.save(account.id, form); notify.success('Catalog settings saved'); load(); } catch (err) { notify.error(err.response?.data?.message || 'Could not save'); } finally { setSaving(false); }
  };
  const sync = async () => {
    setSyncing(true);
    try { const res = await waCatalogAPI.sync(account.id, { catalogId: form.catalogId, connectionId: form.connectionId }); notify.success(`${res.data.sent} products sent to the catalog`); load(); } catch (err) { notify.error(err.response?.data?.message || 'Sync failed'); load(); } finally { setSyncing(false); }
  };

  if (!data) return <div className="bm-content-card"><div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" size={22} /></div></div>;
  const c = data.catalog;

  if (mode === 'messages') {
    return (
      <div className="bm-content-card">
        <div className="bm-card-header">
          <h3 className="bm-card-title">Product Messages</h3>
          <p className="bm-card-sub">Send products from your catalog inside a chat: open the chat in the Inbox → Send Menu → <strong>Products</strong> (a single product, a list of up to 30, or the whole catalog). Customers can add to cart and send you the order right in WhatsApp — it shows in the chat as "🛒 Order".</p>
        </div>
        {!c.catalogId ? <p style={hint}>No catalog is connected to this WhatsApp account yet — see Product Catalog Sync.</p> : <CatalogProducts integrationId={account.id} />}
      </div>
    );
  }

  return (
    <div className="bm-content-card">
      <div className="bm-card-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h3 className="bm-card-title">Product Catalog Sync</h3>
          <p className="bm-card-sub">Connect a Meta commerce catalog to this number and keep it filled from your Shopify / WooCommerce store.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={13} /> Refresh</button>
      </div>
      {c.error && <div style={{ ...box, borderColor: '#f59e0b', fontSize: '0.82rem' }}>Meta: {c.error}</div>}

      <div style={box}>
        <strong style={{ fontSize: '0.9rem', display: 'flex', gap: 6, alignItems: 'center' }}><ShoppingBag size={15} /> Catalog</strong>
        <p style={hint}>Catalogs connected to this WhatsApp Business Account (connect one in Commerce Manager → WhatsApp).</p>
        <select className="form-input" style={{ marginTop: 8 }} value={form.catalogId} onChange={(e) => setForm({ ...form, catalogId: e.target.value })}>
          <option value="">— none —</option>
          {c.catalogs.map((cat) => <option key={cat.id} value={cat.id}>{cat.name} ({cat.product_count ?? '?'} products)</option>)}
        </select>
        <div style={{ display: 'flex', gap: 18, marginTop: 10, fontSize: '0.84rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={Boolean(form.catalogVisible)} onChange={(e) => setForm({ ...form, catalogVisible: e.target.checked })} /> Show the catalog on the business profile</label>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={Boolean(form.cartEnabled)} onChange={(e) => setForm({ ...form, cartEnabled: e.target.checked })} /> Let customers add to cart and send orders</label>
        </div>
        <button type="button" className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={save} disabled={saving}>{saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save</button>
      </div>

      <div style={box}>
        <strong style={{ fontSize: '0.9rem', display: 'flex', gap: 6, alignItems: 'center' }}><UploadCloud size={15} /> Fill it from a store</strong>
        <p style={hint}>Sends the store's synced products (Store Connections → Products) into the catalog. Prices and names are updated, new products added.</p>
        <select className="form-input" style={{ marginTop: 8 }} value={form.connectionId} onChange={(e) => setForm({ ...form, connectionId: e.target.value })}>
          <option value="">— pick a store —</option>
          {data.stores.map((s) => <option key={s.id} value={s.id}>{s.name || s.store_domain} ({s.platform === 'SHOPIFY' ? 'Shopify' : 'WooCommerce'}, {s.product_count} products)</option>)}
        </select>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={sync} disabled={syncing || !form.catalogId || !form.connectionId}>{syncing ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />} Sync products now</button>
          {c.lastSyncAt && <span style={{ fontSize: '0.78rem', color: c.lastSyncError ? '#b45309' : 'var(--text-muted)' }}>Last sync {new Date(c.lastSyncAt).toLocaleString()}: {c.lastSyncError || `${c.lastSyncCount} products`}</span>}
        </div>
      </div>

      {c.catalogId && (
        <div style={box}>
          <strong style={{ fontSize: '0.9rem' }}>Products in the catalog</strong>
          <div style={{ marginTop: 10 }}><CatalogProducts integrationId={account.id} /></div>
        </div>
      )}
    </div>
  );
}
