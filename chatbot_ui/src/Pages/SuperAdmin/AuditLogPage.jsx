import { useState, useEffect, useCallback, Fragment } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { auditLogAPI } from '../../services/api';
import { ScrollText, Search, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function actionLabel(action) {
  return (action || '').replace(/_/g, ' ').replace(/\./g, ' — ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const selectStyle = {
  padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)',
  color: 'var(--text-primary)', fontSize: '0.82rem', cursor: 'pointer', height: 32,
};

function ChangeRow({ field, before, after }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: '0.78rem', padding: '3px 0' }}>
      <span style={{ color: 'var(--text-muted)', minWidth: 110, textTransform: 'capitalize' }}>{field.replace(/_/g, ' ')}</span>
      <span style={{ color: 'var(--text-secondary)', textDecoration: 'line-through' }}>{String(before ?? '—')}</span>
      <span style={{ color: 'var(--text-muted)' }}>→</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{String(after ?? '—')}</span>
    </div>
  );
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, totalPages: 1, total: 0 });
  const [facets, setFacets] = useState({ actions: [], entityTypes: [] });
  const [actionFilter, setActionFilter] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    auditLogAPI.getFacets().then((r) => setFacets({ actions: r.data.actions || [], entityTypes: r.data.entityTypes || [] })).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    auditLogAPI.getAll({
      action: actionFilter, entityType: entityTypeFilter, search,
      page: pagination.page, limit: pagination.limit,
    })
      .then((res) => {
        setEntries(res.data.entries || []);
        if (res.data.pagination) setPagination((p) => ({ ...p, ...res.data.pagination }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [actionFilter, entityTypeFilter, search, pagination.page, pagination.limit]);

  useEffect(() => { load(); }, [load]);

  const totalPages = pagination.totalPages || 1;
  const currentPage = pagination.page || 1;

  return (
    <AppLayout>
      <div style={{ width: '100%', padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ScrollText size={19} />
          </div>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', letterSpacing: '-0.3px' }}>Audit Log</h1>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2, marginBottom: 16, marginLeft: 46 }}>
          Who changed which package, price, role, or account — and when.
        </p>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} style={{ ...selectStyle, minWidth: 180 }}>
            <option value="">All Actions</option>
            {facets.actions.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
          </select>
          <select value={entityTypeFilter} onChange={(e) => { setEntityTypeFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }} style={{ ...selectStyle, minWidth: 150 }}>
            <option value="">All Entity Types</option>
            {facets.entityTypes.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text" placeholder="Search by actor, entity, or description..." value={search}
              onChange={(e) => { setSearch(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
              className="form-input" style={{ paddingLeft: 30, height: 32, fontSize: '0.82rem' }}
            />
          </div>
          <button onClick={load} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', height: 32 }}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>

        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.72rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '10px 14px', width: 30 }}></th>
                  <th style={{ padding: '10px 14px' }}>When</th>
                  <th style={{ padding: '10px 14px' }}>Actor</th>
                  <th style={{ padding: '10px 14px' }}>Action</th>
                  <th style={{ padding: '10px 14px' }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={{ padding: 50, textAlign: 'center', color: 'var(--text-muted)' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto 10px' }} /> Loading activity...
                  </td></tr>
                ) : entries.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: 50, textAlign: 'center', color: 'var(--text-muted)' }}>
                    No activity recorded yet.
                  </td></tr>
                ) : entries.map((e) => {
                  const isOpen = expandedId === e.id;
                  const hasChanges = e.changes && Object.keys(e.changes).length > 0;
                  return (
                    <Fragment key={e.id}>
                      <tr
                        style={{ borderBottom: '1px solid var(--border)', cursor: hasChanges ? 'pointer' : 'default' }}
                        onClick={() => hasChanges && setExpandedId(isOpen ? null : e.id)}
                      >
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>
                          {hasChanges ? (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '0.76rem', whiteSpace: 'nowrap' }}>{fmtDate(e.created_at)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{e.actor_name}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{e.actor_role}</div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '3px 8px', borderRadius: 12, border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                            {actionLabel(e.action)}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{e.summary}</td>
                      </tr>
                      {isOpen && hasChanges && (
                        <tr>
                          <td></td>
                          <td colSpan={4} style={{ padding: '4px 14px 12px', background: 'var(--bg-base)' }}>
                            {Object.entries(e.changes).map(([field, { before, after }]) => (
                              <ChangeRow key={field} field={field} before={before} after={after} />
                            ))}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {pagination.total === 0 ? 0 : (currentPage - 1) * pagination.limit + 1}–{Math.min(currentPage * pagination.limit, pagination.total)} of {pagination.total}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))} disabled={currentPage <= 1} className="btn btn-secondary btn-sm">Previous</button>
              <button onClick={() => setPagination((p) => ({ ...p, page: Math.min(totalPages, p.page + 1) }))} disabled={currentPage >= totalPages} className="btn btn-secondary btn-sm">Next</button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
