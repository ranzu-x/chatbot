import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { adminAPI } from '../../services/api';

function StatCard({ icon, label, value, gradient }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: gradient }}>
        {icon}
      </div>
      <div>
        <div className="stat-value">{value ?? '—'}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AdminDashboard() {
  const [stats,     setStats]     = useState(null);
  const [agencies,  setAgencies]  = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [sRes, aRes] = await Promise.all([
          adminAPI.getStats(),
          adminAPI.getAgencies(),
        ]);
        setStats(sRes.data);
        setAgencies(aRes.data.agencies || aRes.data || []);
      } catch (err) {
        console.error('Failed to load dashboard', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <AppLayout>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Admin Dashboard</h1>
        <p className="page-subtitle">Platform overview — all agencies and usage</p>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-overlay">
            <div className="loading-spinner" style={{ width: 40, height: 40 }} />
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid-4" style={{ marginBottom: 32 }}>
              <StatCard
                icon="🏢"
                label="Total Agencies"
                value={stats?.totalAgencies}
                gradient="linear-gradient(135deg, #6366f1, #4f46e5)"
              />
              <StatCard
                icon="👥"
                label="Total Agents"
                value={stats?.totalAgents}
                gradient="linear-gradient(135deg, #22d3ee, #0891b2)"
              />
              <StatCard
                icon="💬"
                label="Total Conversations"
                value={stats?.totalConversations}
                gradient="linear-gradient(135deg, #f472b6, #db2777)"
              />
              <StatCard
                icon="📨"
                label="Total Messages"
                value={stats?.totalMessages}
                gradient="linear-gradient(135deg, #10b981, #059669)"
              />
            </div>

            {/* Agencies table */}
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <h2 className="font-semibold" style={{ fontSize: '0.95rem' }}>Recent Agencies</h2>
              </div>
              <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Agency</th>
                      <th>Owner</th>
                      <th>Agents</th>
                      <th>Status</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agencies.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                          No agencies yet
                        </td>
                      </tr>
                    ) : (
                      agencies.slice(0, 10).map((a) => (
                        <tr key={a._id || a.id}>
                          <td>
                            <div className="font-semibold">{a.name}</div>
                            {a.website && (
                              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{a.website}</div>
                            )}
                          </td>
                          <td>
                            <div>{a.owner?.name || a.ownerName || '—'}</div>
                            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{a.owner?.email || a.ownerEmail}</div>
                          </td>
                          <td>{a.agentCount ?? '—'}</td>
                          <td>
                            <span className={`badge ${a.isActive !== false ? 'badge-success' : 'badge-danger'}`}>
                              {a.isActive !== false ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>{formatDate(a.createdAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
