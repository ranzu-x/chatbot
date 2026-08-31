import React, { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import api from '../../services/api';
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  ShoppingBag,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  Filter,
  ArrowUpRight,
  ExternalLink,
} from 'lucide-react';

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [metrics, setMetrics] = useState({ totalRevenue: 0, totalOrders: 0, paidOrdersCount: 0, pendingOrdersCount: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await api.get('/payments/orders');
      setOrders(res.data?.orders || []);
      setMetrics(res.data?.metrics || { totalRevenue: 0, totalOrders: 0, paidOrdersCount: 0, pendingOrdersCount: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter((o) => {
    const matchesSearch =
      o.product_name?.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_email?.toLowerCase().includes(search.toLowerCase()) ||
      String(o.id).includes(search);
    const matchesStatus = statusFilter === 'ALL' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const aov = metrics.paidOrdersCount > 0 ? (metrics.totalRevenue / metrics.paidOrdersCount).toFixed(2) : '0.00';

  return (
    <AppLayout>
      <div className="orders-page" style={{ width: '100%', padding: '14px 18px' }}>
        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShoppingBag size={20} />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                In-Chat Orders & Commerce Transactions
              </h2>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '3px 0 0 0' }}>
              Track native purchases, dynamic Stripe checkout links, and payments collected directly across chat channels.
            </p>
          </div>

          <button
            type="button"
            onClick={loadOrders}
            disabled={loading}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700 }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* Top Metrics Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 18 }}>
          <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 700 }}>Total Chat Revenue</span>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DollarSign size={16} />
              </div>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a' }}>
              ${metrics.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span style={{ fontSize: '0.7rem', color: '#16a34a', fontWeight: 700 }}>
              ● Live Collected Revenue
            </span>
          </div>

          <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 700 }}>Paid Orders</span>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={16} />
              </div>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a' }}>
              {metrics.paidOrdersCount}
            </div>
            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
              out of {metrics.totalOrders} total links
            </span>
          </div>

          <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 700 }}>Average Order Value</span>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#f5f3ff', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <TrendingUp size={16} />
              </div>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a' }}>
              ${aov}
            </div>
            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
              per completed checkout
            </span>
          </div>

          <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 700 }}>Pending Checkout Links</span>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={16} />
              </div>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a' }}>
              {metrics.pendingOrdersCount}
            </div>
            <span style={{ fontSize: '0.7rem', color: '#d97706', fontWeight: 700 }}>
              Awaiting Customer Payment
            </span>
          </div>
        </div>

        {/* Orders Table Card */}
        <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          {/* Table Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 360 }}>
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  type="text"
                  className="form-input w-full"
                  placeholder="Search product, customer, order ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ fontSize: '0.8rem', paddingLeft: 32 }}
                />
                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              {['ALL', 'PAID', 'PENDING'].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 8,
                    fontSize: '0.76rem',
                    fontWeight: statusFilter === st ? 800 : 600,
                    border: '1px solid',
                    borderColor: statusFilter === st ? '#10b981' : '#e2e8f0',
                    background: statusFilter === st ? '#ecfdf5' : '#ffffff',
                    color: statusFilter === st ? '#059669' : '#64748b',
                    cursor: 'pointer',
                  }}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          {filteredOrders.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', background: '#f8fafc', borderRadius: 10, border: '1px dashed #cbd5e1' }}>
              <ShoppingBag size={36} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
              <h4 style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0' }}>
                No In-Chat Orders Found
              </h4>
              <p style={{ fontSize: '0.78rem', color: '#64748b', maxWidth: 360, margin: '0 auto' }}>
                Add the "Collect Payment" node in your Bot Flows to start generating native Stripe checkout links inside chat!
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                    <th style={{ padding: '10px 12px' }}>Order ID</th>
                    <th style={{ padding: '10px 12px' }}>Product / Service</th>
                    <th style={{ padding: '10px 12px' }}>Channel</th>
                    <th style={{ padding: '10px 12px' }}>Amount</th>
                    <th style={{ padding: '10px 12px' }}>Status</th>
                    <th style={{ padding: '10px 12px' }}>Created</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Checkout Link</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((ord) => (
                    <tr key={ord.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px', fontWeight: 800, color: '#0f172a' }}>
                        #{ord.id}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <strong style={{ color: '#0f172a', display: 'block' }}>{ord.product_name}</strong>
                        {ord.customer_name && (
                          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            Customer: {ord.customer_name} {ord.customer_phone ? `(${ord.customer_phone})` : ''}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: '#f1f5f9', color: '#475569' }}>
                          {ord.channel}
                        </span>
                      </td>
                      <td style={{ padding: '12px', fontWeight: 800, color: '#0f172a' }}>
                        ${Number(ord.amount).toFixed(2)} {ord.currency}
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: ord.status === 'PAID' ? '#dcfce7' : '#fef3c7', color: ord.status === 'PAID' ? '#15803d' : '#b45309' }}>
                          {ord.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: '#94a3b8' }}>
                        {new Date(ord.created_at).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'right' }}>
                        {ord.payment_url && (
                          <a
                            href={ord.payment_url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ padding: '4px 8px', borderRadius: 6, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', textDecoration: 'none', fontSize: '0.72rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            Open Link <ExternalLink size={11} />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
