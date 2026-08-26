import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import { adminAPI } from '../../services/api';
import SubscriberGainChart from '../../Components/Dashboard/SubscriberGainChart';
import {
  Building2,
  Users,
  MessageSquare,
  Send,
  ArrowUpRight,
  Plus,
  ExternalLink,
  CheckCircle2,
  Shield,
  Sparkles,
} from 'lucide-react';

function StatCard({ icon: Icon, label, value, color, bg }) {
  return (
    <div
      className="stat-card"
      style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
      }}
    >
      <div
        className="stat-icon"
        style={{
          width: 38,
          height: 38,
          borderRadius: 9,
          background: bg || 'rgba(37, 99, 235, 0.08)',
          color: color || 'var(--primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={19} />
      </div>
      <div>
        <div className="stat-value" style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
          {value ?? '0'}
        </div>
        <div className="stat-label" style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, marginTop: 2, textTransform: 'uppercase' }}>
          {label}
        </div>
      </div>
    </div>
  );
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [agencies, setAgencies] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(14);

  useEffect(() => {
    (async () => {
      try {
        const [sRes, aRes, anRes] = await Promise.all([
          adminAPI.getStats(),
          adminAPI.getAgencies(),
          adminAPI.getAnalytics(timeRange).catch(() => ({ data: { analytics: {} } })),
        ]);
        setStats(sRes.data);
        setAgencies(aRes.data.agencies || aRes.data || []);
        setAnalytics(anRes.data?.analytics || {});
      } catch (err) {
        console.error('Failed to load dashboard', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [timeRange]);

  return (
    <AppLayout>
      <div style={{ width: '100%', padding: '16px 20px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 9,
                  background: 'rgba(37, 99, 235, 0.08)',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Sparkles size={19} />
              </div>
              <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.3px' }}>
                Super Admin Dashboard
              </h1>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2, marginLeft: 46 }}>
              System-wide platform overview, agencies, subscriber acquisition and message traffic metrics
            </p>
          </div>

          <button
            className="btn btn-primary btn-sm"
            onClick={() => navigate('/admin/agencies')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', fontSize: '0.82rem' }}
          >
            <Plus size={15} /> + Add Agency
          </button>
        </div>

        {loading ? (
          <div className="loading-overlay" style={{ padding: 60 }}>
            <div className="loading-spinner" />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <StatCard
                icon={Building2}
                label="Registered Agencies"
                value={stats?.totalAgencies}
                color="#2563eb"
                bg="rgba(37, 99, 235, 0.08)"
              />
              <StatCard
                icon={Users}
                label="Total Team Agents"
                value={stats?.totalAgents}
                color="#475569"
                bg="rgba(71, 85, 105, 0.08)"
              />
              <StatCard
                icon={MessageSquare}
                label="Total Conversations"
                value={stats?.totalConversations}
                color="#2563eb"
                bg="rgba(37, 99, 235, 0.08)"
              />
              <StatCard
                icon={Send}
                label="Dispatched Messages"
                value={stats?.totalMessages}
                color="#10b981"
                bg="rgba(16, 185, 129, 0.08)"
              />
            </div>

            {/* ── SUBSCRIBER GAIN BAR GRAPH (Full Width) ── */}
            <SubscriberGainChart
              rawData={analytics?.subscriberGain}
              timeRange={timeRange}
              onTimeRangeChange={setTimeRange}
            />

            {/* Agencies table */}
            <div className="card" style={{ padding: 0, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Recent Agencies
                  </h2>
                  <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '2px 0 0 0' }}>
                    Latest onboarded enterprise clients & white-label tenants
                  </p>
                </div>
                <button
                  onClick={() => navigate('/admin/agencies')}
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', height: 30 }}
                >
                  View All Agencies <ArrowUpRight size={13} />
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      <th style={{ padding: '10px 14px', fontWeight: 700 }}>Agency Name</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700 }}>Owner Account</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700 }}>Agents</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                      <th style={{ padding: '10px 14px', fontWeight: 700 }}>Registered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agencies.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>
                          No agencies registered yet.
                        </td>
                      </tr>
                    ) : (
                      agencies.slice(0, 5).map((a) => (
                        <tr
                          key={a.id}
                          style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.12s' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#fafbfe')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                        >
                          <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>
                            {a.name}
                          </td>
                          <td style={{ padding: '10px 14px', color: '#64748b' }}>
                            {a.ownerEmail || a.ownerName || '—'}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ padding: '2px 8px', borderRadius: 10, background: 'rgba(37, 99, 235, 0.08)', color: '#2563eb', fontWeight: 700, fontSize: '0.75rem' }}>
                              {a.agentCount ?? 0} Agents
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', fontWeight: 600, color: a.is_active ? '#10b981' : '#ef4444' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: a.is_active ? '#10b981' : '#ef4444' }} />
                              {a.is_active ? 'Active' : 'Disabled'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '0.78rem' }}>
                            {formatDate(a.created_at)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
