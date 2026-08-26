import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import { agencyAPI } from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';
import SubscriberGainChart from '../../Components/Dashboard/SubscriberGainChart';
import {
  MessageSquare,
  Users,
  Send,
  Radio,
  Activity,
  TrendingUp,
  Plus,
  ArrowUpRight,
  Bot,
  MessageCircle,
  Facebook,
  Instagram,
  Globe,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

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
        style={{
          background: bg || 'rgba(37, 99, 235, 0.08)',
          color: color || '#2563eb',
          width: 38,
          height: 38,
          borderRadius: 9,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={19} />
      </div>
      <div>
        <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
          {value ?? 0}
        </div>
        <div style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 600, marginTop: 2, textTransform: 'uppercase' }}>
          {label}
        </div>
      </div>
    </div>
  );
}

const PLATFORM_COLORS = {
  WHATSAPP: '#25d366',
  FACEBOOK: '#1877f2',
  INSTAGRAM: '#e1306c',
  TELEGRAM: '#229ed9',
  WEBCHAT: '#2563eb',
};

export default function AgencyDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
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
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
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
                Workspace Dashboard
              </h1>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2, marginLeft: 46 }}>
              Welcome back, {user?.name || 'Manager'}. Here is your live subscriber acquisition and chatbot metrics.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => navigate('/connect-accounts')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', fontSize: '0.82rem' }}
            >
              <Radio size={14} /> Connect Account
            </button>

            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate('/bots')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', fontSize: '0.82rem' }}
            >
              <Plus size={15} /> Bot Manager
            </button>
          </div>
        </div>

        {loading ? (
          <div className="loading-overlay" style={{ padding: 60 }}>
            <div className="loading-spinner" />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Top Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <StatCard
                icon={Users}
                label="Active Subscribers"
                value={stats?.totalContacts || stats?.totalSubscribers || 0}
                color="#2563eb"
                bg="rgba(37, 99, 235, 0.08)"
              />
              <StatCard
                icon={MessageSquare}
                label="Active Conversations"
                value={stats?.totalConversations || stats?.openConversations || 0}
                color="#10b981"
                bg="rgba(16, 185, 129, 0.08)"
              />
              <StatCard
                icon={Send}
                label="Dispatched Messages"
                value={stats?.totalMessages || 0}
                color="#475569"
                bg="rgba(71, 85, 105, 0.08)"
              />
              <StatCard
                icon={Bot}
                label="Automated Bot Flows"
                value={stats?.totalBots || stats?.totalFlows || 0}
                color="#2563eb"
                bg="rgba(37, 99, 235, 0.08)"
              />
            </div>

            {/* ── 1. SUBSCRIBER GAIN BAR GRAPH (Attractive Full-Width Bar Chart) ── */}
            <SubscriberGainChart
              rawData={analytics?.subscriberGain}
              timeRange={timeRange}
              onTimeRangeChange={setTimeRange}
            />

            {/* ── 2. Message Traffic Area Chart & Channel Share ── */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              {/* Daily Message Volume Area Chart */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 18px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div>
                    <h3 style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                      Message Traffic & Bot Activity
                    </h3>
                    <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '2px 0 0 0' }}>
                      Inbound subscriber questions vs Outbound automated bot replies
                    </p>
                  </div>
                  <TrendingUp size={16} color="#2563eb" />
                </div>

                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData.length > 0 ? trendData : [{ date: 'Today', Inbound: 12, Outbound: 24 }]}>
                      <defs>
                        <linearGradient id="inboundGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="outboundGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.78rem', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }} />
                      <Legend wrapperStyle={{ fontSize: '0.76rem', paddingTop: 6 }} />
                      <Area type="monotone" dataKey="Inbound" stroke="#2563eb" strokeWidth={2} fillOpacity={1} fill="url(#inboundGrad)" />
                      <Area type="monotone" dataKey="Outbound" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#outboundGrad)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Platform Distribution Chart */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 18px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <h3 style={{ fontSize: '0.94rem', fontWeight: 800, color: '#0f172a', margin: '0 0 2px 0' }}>
                  Channel Distribution
                </h3>
                <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '0 0 12px 0' }}>
                  Active subscriber share across channels
                </p>

                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={platformData.length > 0 ? platformData : [{ name: 'WhatsApp', value: 65, color: '#25d366' }, { name: 'Facebook', value: 20, color: '#1877f2' }, { name: 'Instagram', value: 15, color: '#e1306c' }]}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {(platformData.length > 0 ? platformData : [{ name: 'WhatsApp', value: 65, color: '#25d366' }, { name: 'Facebook', value: 20, color: '#1877f2' }, { name: 'Instagram', value: 15, color: '#e1306c' }]).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.78rem', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }} />
                      <Legend wrapperStyle={{ fontSize: '0.76rem' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
