import { useState, useEffect, useCallback } from 'react';
import { commerceAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import { RefreshCw, ExternalLink } from 'lucide-react';

const VIEWS = [
  { id: 'messages', label: 'Messages' },
  { id: 'cod', label: 'COD orders' },
  { id: 'carts', label: 'Abandoned carts' },
];

const SEND_BADGE = {
  SENT: 'badge-success',
  FAILED: 'badge-danger',
  SKIPPED: 'badge-muted',
  SCHEDULED: 'badge-warning',
  SENDING: 'badge-warning',
};
const COD_BADGE = { CONFIRMED: 'badge-success', CANCELLED: 'badge-danger', PENDING: 'badge-warning' };
const CART_BADGE = { OPEN: 'badge-warning', RECOVERED: 'badge-success', CLOSED: 'badge-muted' };

const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');
const money = (v, c) => (v === null || v === undefined ? '—' : `${c ? `${c} ` : ''}${Number(v).toFixed(2)}`);

/** Automation → Commerce → Activity: what the campaigns sent, COD answers, carts. */
export default function CommerceActivity({ selectedAccount, integrationId }) {
  const [view, setView] = useState('messages');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0, pageSize: 25 });
  const [loading, setLoading] = useState(true);

  const targetIntegrationId = integrationId || (selectedAccount?.id && selectedAccount.id !== 'all' ? selectedAccount.id : null);

  const load = useCallback(() => {
    setLoading(true);
    const params = { page, pageSize: 25, ...(targetIntegrationId ? { integrationId: targetIntegrationId } : {}) };
    const req = view === 'messages'
      ? commerceAPI.getActivity({ ...params, status: status || undefined }).then((r) => ({ rows: r.data.activity, total: r.data.total, pageSize: r.data.pageSize }))
      : view === 'cod'
        ? commerceAPI.getOrders({ ...params, cod: 1 }).then((r) => ({ rows: r.data.orders, total: r.data.total, pageSize: r.data.pageSize }))
        : commerceAPI.getCarts({ ...params, status: status || undefined }).then((r) => ({ rows: r.data.carts, total: r.data.total, pageSize: r.data.pageSize }));
    req.then(setData).catch(() => notify.error('Failed to load activity')).finally(() => setLoading(false));
  }, [view, status, page, targetIntegrationId]);

  useEffect(() => { load(); }, [load]);

  const switchView = (id) => { setView(id); setStatus(''); setPage(1); };
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const statusOptions = view === 'messages' ? ['SENT', 'FAILED', 'SCHEDULED', 'SKIPPED'] : view === 'carts' ? ['OPEN', 'RECOVERED'] : [];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {VIEWS.map((v) => (
            <button key={v.id} className={`btn btn-sm ${view === v.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => switchView(v.id)}>{v.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {statusOptions.length > 0 && (
            <select className="form-input" style={{ height: 32, fontSize: '0.8rem' }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              {statusOptions.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
            </select>
          )}
          <button className="btn btn-secondary btn-sm" onClick={load} title="Refresh"><RefreshCw size={13} /></button>
        </div>
      </div>

      {loading ? (
        <div className="loading-overlay"><div className="loading-spinner" /></div>
      ) : data.rows.length === 0 ? (
        <div className="empty-state"><div className="empty-title">Nothing here yet</div></div>
      ) : (
        <div className="table-wrapper">
          <table>
            {view === 'messages' && (
              <>
                <thead><tr><th>When</th><th>Campaign</th><th>Customer</th><th>Status</th></tr></thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{fmt(r.sent_at || r.send_at)}</td>
                      <td style={{ fontSize: '0.8rem' }}>{r.campaign_name}</td>
                      <td style={{ fontSize: '0.8rem' }}>
                        {r.order_customer || r.cart_customer || '—'}
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{r.order_number || (r.cart_total !== null ? `Cart ${money(r.cart_total, r.cart_currency)}` : '')} {r.phone ? `· ${r.phone}` : ''}</div>
                      </td>
                      <td>
                        <span className={`badge ${SEND_BADGE[r.status] || 'badge-muted'}`}>{r.status === 'SCHEDULED' ? 'Waiting' : r.status.charAt(0) + r.status.slice(1).toLowerCase()}</span>
                        {r.cod_status && r.cod_status !== 'PENDING' && <span className={`badge ${COD_BADGE[r.cod_status]}`} style={{ marginLeft: 4 }}>COD {r.cod_status.toLowerCase()}</span>}
                        {r.error && <div style={{ fontSize: '0.72rem', color: r.status === 'FAILED' ? 'var(--danger)' : 'var(--text-muted)', marginTop: 3, maxWidth: 360 }}>{r.error}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
            {view === 'cod' && (
              <>
                <thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Answer</th></tr></thead>
                <tbody>
                  {data.rows.map((o) => (
                    <tr key={o.id}>
                      <td style={{ fontSize: '0.8rem' }}>
                        {o.order_number || o.external_order_id}
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{o.store_label} · {fmt(o.external_created_at)}</div>
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>{o.customer_name || '—'}<div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{o.customer_phone || 'no phone'}</div></td>
                      <td style={{ fontSize: '0.8rem' }}>{money(o.total, o.currency)}</td>
                      <td>
                        <span className={`badge ${COD_BADGE[o.cod_status] || 'badge-muted'}`}>{o.cod_status ? (o.cod_status === 'PENDING' ? 'Waiting' : o.cod_status.charAt(0) + o.cod_status.slice(1).toLowerCase()) : '—'}</span>
                        {o.cod_responded_at && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{fmt(o.cod_responded_at)}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
            {view === 'carts' && (
              <>
                <thead><tr><th>Last activity</th><th>Customer</th><th>Cart</th><th>Status</th></tr></thead>
                <tbody>
                  {data.rows.map((k) => (
                    <tr key={k.id}>
                      <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{fmt(k.external_updated_at)}<div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{k.store_label}</div></td>
                      <td style={{ fontSize: '0.8rem' }}>{k.customer_name || '—'}<div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{k.customer_phone || 'no phone — cannot be messaged'}</div></td>
                      <td style={{ fontSize: '0.8rem', maxWidth: 320 }}>
                        {money(k.total, k.currency)}
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{k.items_summary}</div>
                      </td>
                      <td>
                        <span className={`badge ${CART_BADGE[k.status]}`}>{k.status.charAt(0) + k.status.slice(1).toLowerCase()}</span>
                        {k.recovery_url && (
                          <a href={k.recovery_url} target="_blank" rel="noreferrer" style={{ marginLeft: 6, fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <ExternalLink size={11} /> Checkout
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </table>
        </div>
      )}

      {pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 10, fontSize: '0.8rem' }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
          Page {page} of {pages}
          <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </>
  );
}
