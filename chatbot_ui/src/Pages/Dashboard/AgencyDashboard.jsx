import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { agencyAPI } from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';
import {
  ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, BarChart, Bar
} from 'recharts';

function StatCard({ icon, label, value, color, trend }) {
  return (
    <div className="stat-card" style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 20, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 16 }}>
      <div className="stat-icon" style={{ background: color, width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', color: '#fff', flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div className="stat-value" style={{ fontSize: '1.5rem', fontWeight: 700 }}>{value ?? 0}</div>
        <div className="stat-label" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{label}</div>
      </div>
    </div>
  );
}

const PLATFORM_COLORS = {
  WHATSAPP: '#25d366',
  FACEBOOK: '#1877f2',
  INSTAGRAM: '#e1306c',
  TELEGRAM: '#229ed9',
  WEBCHAT: '#6366f1',
};

const STATUS_COLORS = {
  OPEN: '#f59e0b',
  ASSIGNED: '#6366f1',
  RESOLVED: '#10b981',
  PENDING: '#ec4899',
};

export default function AgencyDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(14);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      agencyAPI.getStats(),
      agencyAPI.getAnalytics(timeRange),
    ])
      .then(([statsRes, analyticsRes]) => {
        setStats(statsRes.data.stats || statsRes.data || {});
        setAnalytics(analyticsRes.data.analytics || {});
      })
      .catch((err) => console.error('Failed to load dashboard data', err))
      .finally(() => setLoading(false));
  }, [timeRange]);

  // Format daily message trend
  const trendData = (analytics?.dailyMessages || []).map((d) => ({
    date: new Date(d.date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
    Inbound: parseInt(d.inbound || 0),
    Outbound: parseInt(d.outbound || 0),
    Total: parseInt(d.total || 0),
  }));

  // Format platform pie data
  const platformData = (analytics?.platformDistribution || []).map((p) => ({
    name: p.platform,
    value: parseInt(p.count || 0),
    color: PLATFORM_COLORS[p.platform] || '#64748b',
  }));

  // Format status bar data
  const statusData = (analytics?.statusBreakdown || []).map((s) => ({
    name: s.status,
    Conversations: parseInt(s.count || 0),
    fill: STATUS_COLORS[s.status] || '#6366f1',
  }));

  return (
    <AppLayout>
      <div className="page-header flex justify-between items-center" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title" style={{ fontSize: '1.75rem', fontWeight: 700 }}>Agency Dashboard</h1>
          <p className="page-subtitle" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Welcome back, {user?.name} 👋 Here is your agency platform overview.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Time Range:</label>
          <select
            className="form-input"
            value={timeRange}
            onChange={(e) => setTimeRange(parseInt(e.target.value))}
            style={{ width: 140, padding: '6px 12px' }}
          >
            <option value={7}>Last 7 Days</option>
            <option value={14}>Last 14 Days</option>
            <option value={30}>Last 30 Days</option>
          </select>
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-overlay" style={{ padding: 100, textAlign: 'center' }}>
            <div className="loading-spinner" style={{ width: 40, height: 40, margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--text-secondary)' }}>Loading analytics…</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Stat Cards Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <StatCard
                icon="👥"
                label="Total Agents"
                value={stats?.totalAgents}
                color="linear-gradient(135deg, #6366f1, #4f46e5)"
              />
              <StatCard
                icon="📇"
                label="Total Contacts"
                value={stats?.totalContacts}
                color="linear-gradient(135deg, #22d3ee, #0891b2)"
              />
              <StatCard
                icon="💬"
                label="Open Conversations"
                value={stats?.openConversations}
                color="linear-gradient(135deg, #f59e0b, #d97706)"
              />
              <StatCard
                icon="✅"
                label="Resolved Conversations"
                value={stats?.resolvedConversations}
                color="linear-gradient(135deg, #10b981, #059669)"
              />
              <StatCard
                icon="📨"
                label="Total Messages"
                value={stats?.totalMessages}
                color="linear-gradient(135deg, #f472b6, #db2777)"
              />
            </div>

            {/* Main Area Chart: Message Volume Trend */}
            <div className="card" style={{ padding: 24 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16 }}>Message Volume Trends</h3>
              {trendData.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                  No message volume data for selected time range.
                </div>
              ) : (
                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorInbound" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorOutbound" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} />
                      <YAxis stroke="var(--text-muted)" fontSize={12} />
                      <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }} />
                      <Legend />
                      <Area type="monotone" dataKey="Inbound" stroke="#22d3ee" fillOpacity={1} fill="url(#colorInbound)" strokeWidth={2} />
                      <Area type="monotone" dataKey="Outbound" stroke="#6366f1" fillOpacity={1} fill="url(#colorOutbound)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Split Charts: Platform Distribution & Conversation Status */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 24 }}>
              {/* Platform Distribution Pie */}
              <div className="card" style={{ padding: 24 }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16 }}>Conversations by Channel</h3>
                {platformData.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    No channel conversation data available.
                  </div>
                ) : (
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={platformData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {platformData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Status Breakdown Bar */}
              <div className="card" style={{ padding: 24 }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16 }}>Conversation Status Overview</h3>
                {statusData.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                    No status data available.
                  </div>
                ) : (
                  <div style={{ width: '100%', height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={statusData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                        <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} />
                        <YAxis stroke="var(--text-muted)" fontSize={12} />
                        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }} />
                        <Bar dataKey="Conversations" radius={[6, 6, 0, 0]}>
                          {statusData.map((entry, index) => (
                            <Cell key={`bar-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
