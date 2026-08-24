import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Stethoscope, 
  Calendar, 
  DollarSign, 
  UserPlus, 
  ClipboardPlus, 
  FileBarChart,
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router';
import api from '../../services/api';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  AreaChart,
  Area
} from 'recharts';

// --- Reusable Sub-Components ---

const StatCard = ({ title, value, icon: Icon, color, trend }) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 transition-all hover:shadow-md group">
    <div className="flex justify-between items-start">
      <div className={`p-3 rounded-xl ${color} transition-transform group-hover:scale-110`}>
        <Icon className="h-6 w-6" />
      </div>
      {trend && (
        <span className={`text-xs font-bold px-2 py-1 rounded-lg ${trend > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
          {trend > 0 ? '+' : ''}{trend}%
        </span>
      )}
    </div>
    <div className="mt-4">
      <p className="text-slate-500 text-sm font-medium">{title}</p>
      <p className="text-2xl font-bold text-slate-800 mt-1">{value}</p>
    </div>
  </div>
);

const QuickActionButton = ({ to, text, icon: Icon, color }) => (
  <Link
    to={to}
    className="flex flex-col items-center justify-center p-6 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all group" >
    <div className={`p-4 rounded-full ${color} mb-3 transition-transform group-hover:rotate-6`}>
      <Icon className="h-6 w-6" />
    </div>
    <span className="text-sm font-bold text-slate-700">{text}</span>
  </Link>
);

const AppointmentRow = ({ patientName, doctor, time, status }) => {
  const getStatusStyle = (s) => {
    switch (s?.toLowerCase()) {
      case 'confirmed': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'scheduled': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
      case 'pending': return 'bg-amber-50 text-amber-600 border-amber-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  return (
    <tr className="group hover:bg-slate-50/50 transition-colors">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-xs font-bold">
            {patientName.charAt(0)}
          </div>
          <span className="text-sm font-semibold text-slate-700">{patientName}</span>
        </div>
      </td>
      <td className="px-6 py-4 text-sm text-slate-500">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-slate-400" />
          {doctor}
        </div>
      </td>
      <td className="px-6 py-4 text-sm text-slate-500 font-medium">{time}</td>
      <td className="px-6 py-4">
        <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider border rounded-full ${getStatusStyle(status)}`}>
          {status}
        </span>
      </td>
    </tr>
  );
};

// --- Main Dashboard Component ---

const Dashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get('/api/v1/dashboard/stats');
        setData(res.data);
      } catch (err) {
        console.error("Dashboard stats fetch failed:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50/50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50/50 p-6 space-y-8">
      
      {/* Welcome Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Hospital Overview</h1>
          <p className="text-slate-500 text-sm mt-1">Here's what's happening in your facility today.</p>
        </div>
        <div className="hidden sm:block">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest bg-white px-4 py-2 rounded-lg border border-slate-100">
            {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Patients"
          value={data?.stats?.totalPatients?.toLocaleString() || '0'}
          icon={Users}
          color="bg-blue-50 text-blue-600"
          trend={12}
        />
        <StatCard
          title="Doctors on Duty"
          value={data?.stats?.totalDoctors || '0'}
          icon={Stethoscope}
          color="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          title="Today's Appointments"
          value={data?.stats?.todayAppointments || '0'}
          icon={Calendar}
          color="bg-indigo-50 text-indigo-600"
          trend={-5}
        />
        <StatCard
          title="Revenue Today"
          value={`$${parseFloat(data?.stats?.todayRevenue || 0).toFixed(2)}`}
          icon={DollarSign}
          color="bg-amber-50 text-amber-600"
          trend={8}
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Trend Chart */}
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-lg font-bold text-slate-800">Patient Visit Trends</h2>
            <select className="text-xs font-bold text-slate-500 bg-slate-50 border-none rounded-lg focus:ring-0">
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
            </select>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.trends || []}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94a3b8', fontSize: 12}} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#94a3b8', fontSize: 12}}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#6366f1" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorCount)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Distribution Chart */}
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
          <h2 className="text-lg font-bold text-slate-800 mb-8">Service Distribution</h2>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data?.distribution || []}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data?.distribution?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 space-y-3">
            {data?.distribution?.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{backgroundColor: COLORS[idx % COLORS.length]}}></div>
                  <span className="text-xs font-medium text-slate-500 capitalize">{item.name}</span>
                </div>
                <span className="text-xs font-bold text-slate-800">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-bold text-slate-800 mb-6">Operations & Management</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <QuickActionButton
            to='/addpatient'
            text="Admit Patient"
            icon={UserPlus}
            color="bg-indigo-50 text-indigo-600"
          />
          <QuickActionButton
            to="/appointments"
            text="Schedule Visit"
            icon={Calendar}
            color="bg-emerald-50 text-emerald-600"
          />
          <QuickActionButton
            to="/records"
            text="Clinical Record"
            icon={ClipboardPlus}
            color="bg-blue-50 text-blue-600"
          />
          <QuickActionButton
            to="/reports"
            text="Analytics"
            icon={FileBarChart}
            color="bg-rose-50 text-rose-600"
          />
        </div>
      </div>

      {/* Upcoming Appointments Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800">Recent Appointments</h2>
          <Link to="/appointments" className="text-indigo-600 text-xs font-bold flex items-center gap-1 hover:gap-2 transition-all">
            View All <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Patient</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Doctor</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Time</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(data?.recentAppointments || []).map((appt, idx) => (
                <AppointmentRow 
                  key={idx}
                  patientName={appt.patientName}
                  doctor={appt.doctor}
                  time={appt.time}
                  status={appt.status}
                />
              ))}
              {(!data?.recentAppointments || data.recentAppointments.length === 0) && (
                <tr>
                  <td colSpan="4" className="px-6 py-10 text-center text-slate-400 text-sm">
                    No recent appointments found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};

export default Dashboard;