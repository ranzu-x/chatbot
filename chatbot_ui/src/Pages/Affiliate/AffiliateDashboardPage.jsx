import React, { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../Provider/AuthContext';
import AppLayout from '../../Layout/AppLayout';
import DataTable from '../../Components/Common/DataTable';
import { affiliateAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import {
  Gift,
  Users,
  DollarSign,
  Wallet,
  CheckCircle2,
  Copy,
  RefreshCw,
  Building2,
  ArrowRight,
  Share2,
  Mail,
  Send,
} from 'lucide-react';

const ELIGIBLE_ACCOUNT_TYPES = ['DIRECT_CUSTOMER', 'RESELLER'];

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function StatCard({ label, value, icon, iconBg, iconColor, hint }) {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 700 }}>{label}</span>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)' }}>{value}</div>
      {hint && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{hint}</span>}
    </div>
  );
}

/**
 * Affiliate Program — for tenants signed up directly under the Super
 * Admin (DIRECT_CUSTOMER/RESELLER, never a Reseller's own end user).
 * Shows the tenant's referral link, everyone it has referred, and the
 * recurring commission it has earned on their payments.
 */
export default function AffiliateDashboardPage() {
  const { user } = useAuth();
  const [affiliate, setAffiliate] = useState(null);
  const [stats, setStats] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Pagination for commissions
  const [commPage, setCommPage] = useState(1);
  const [commLimit, setCommLimit] = useState(10);
  const [commTotal, setCommTotal] = useState(0);

  const isSuperAdmin = user?.role === 'ADMIN';
  const eligible = ELIGIBLE_ACCOUNT_TYPES.includes(user?.accountType);

  const load = async () => {
    setLoading(true);
    try {
      const [meRes, referralsRes, commissionsRes] = await Promise.all([
        affiliateAPI.getMe(),
        affiliateAPI.getReferrals(),
        affiliateAPI.getCommissions({ page: 1, limit: commLimit }),
      ]);
      setAffiliate(meRes.data?.affiliate || null);
      setStats(meRes.data?.stats || null);
      setReferrals(referralsRes.data?.referrals || []);
      setCommissions(commissionsRes.data?.commissions || []);
      setCommTotal(commissionsRes.data?.pagination?.total || 0);
      setCommPage(1);
    } catch (err) {
      console.error(err);
      notify.error(err?.response?.data?.message || 'Failed to load your affiliate dashboard.');
    } finally {
      setLoading(false);
    }
  };

  const loadCommissions = async (page, limit) => {
    try {
      const res = await affiliateAPI.getCommissions({ page, limit });
      setCommissions(res.data?.commissions || []);
      setCommTotal(res.data?.pagination?.total || 0);
      setCommPage(page);
    } catch (err) {
      console.error(err);
      notify.error('Failed to load commissions page.');
    }
  };

  useEffect(() => {
    if (eligible) load();
    else setLoading(false);
  }, [eligible]);

  const liveReferralUrl = affiliate?.code
    ? `${window.location.origin}/pricing?ref=${encodeURIComponent(affiliate.code)}`
    : (affiliate?.referralUrl || '');

  const copyLink = async () => {
    if (!liveReferralUrl) return;
    try {
      await navigator.clipboard.writeText(liveReferralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      notify.success('Referral link copied to clipboard!');
    } catch {
      notify.error('Could not copy — copy the link manually.');
    }
  };

  const shareWhatsApp = () => {
    if (!liveReferralUrl) return;
    const text = encodeURIComponent(`Sign up for an account using my referral link: ${liveReferralUrl}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const shareTwitter = () => {
    if (!liveReferralUrl) return;
    const text = encodeURIComponent(`Check out this AI chatbot platform!`);
    const url = encodeURIComponent(liveReferralUrl);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'noopener,noreferrer');
  };

  const shareEmail = () => {
    if (!liveReferralUrl) return;
    const subject = encodeURIComponent('Invitation to AI Chatbot Platform');
    const body = encodeURIComponent(`Hi,\n\nI recommend checking out this AI chatbot platform. Sign up with my referral link:\n${liveReferralUrl}\n\nBest regards!`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  // Super Admin notice
  if (isSuperAdmin) {
    return (
      <AppLayout>
        <div className="page-content" style={{ padding: '14px 18px' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '40px 24px', textAlign: 'center', maxWidth: 560, margin: '40px auto', boxShadow: '0 4px 12px rgba(0,0,0,0.04)' }}>
            <div style={{ width: 54, height: 54, borderRadius: 14, background: 'var(--primary-soft)', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <Gift size={28} />
            </div>
            <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)', fontSize: '1.25rem', fontWeight: 800 }}>Super Admin Notice</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '0 0 24px', lineHeight: 1.5 }}>
              You are logged in as a Super Admin. To view platform-wide affiliates, track all referred revenues, adjust commission rates, and execute payouts, visit the Super Admin Affiliate Management panel.
            </p>
            <Link to="/admin/affiliates" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', fontWeight: 700, textDecoration: 'none' }}>
              Go to Affiliate Management <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!eligible) {
    return (
      <AppLayout>
        <div className="page-content" style={{ padding: '14px 18px' }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 32, textAlign: 'center', maxWidth: 520, margin: '40px auto' }}>
            <Gift size={32} color="var(--text-muted)" style={{ marginBottom: 10 }} />
            <h3 style={{ margin: '0 0 6px', color: 'var(--text-primary)' }}>Affiliate Program not available</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0, lineHeight: 1.5 }}>
              The affiliate program is only available to accounts signed up directly under the platform.
            </p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const referralColumns = [
    {
      key: 'name',
      label: 'REFERRED WORKSPACE',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary-soft)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={16} />
          </div>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.86rem' }}>{row.name}</span>
        </div>
      ),
    },
    { key: 'created_at', label: 'JOINED', render: (row) => <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{formatDate(row.created_at)}</span> },
    { key: 'totalRevenue', label: 'REVENUE PAID', render: (row) => <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{money(row.totalRevenue)}</span> },
    { key: 'totalCommission', label: 'YOU EARNED', render: (row) => <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#16a34a' }}>{money(row.totalCommission)}</span> },
  ];

  const commissionColumns = [
    { key: 'referredAgencyName', label: 'FROM', render: (row) => <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{row.referredAgencyName}</span> },
    { key: 'revenue_amount', label: 'PAYMENT', render: (row) => <span style={{ fontSize: '0.82rem' }}>{money(row.revenue_amount)}</span> },
    {
      key: 'commission_amount',
      label: `COMMISSION (${affiliate?.commissionRate ?? 25}%)`,
      render: (row) => <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#16a34a' }}>{money(row.commission_amount)}</span>,
    },
    {
      key: 'status',
      label: 'STATUS',
      render: (row) => {
        const colors = { PENDING: ['#fef3c7', '#b45309'], PAID: ['#dcfce7', '#16a34a'], VOID: ['#f1f5f9', '#64748b'] };
        const [bg, fg] = colors[row.status] || colors.PENDING;
        return <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: bg, color: fg }}>{row.status}</span>;
      },
    },
    { key: 'created_at', label: 'DATE', render: (row) => <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{formatDate(row.created_at)}</span> },
  ];

  return (
    <AppLayout>
      <div className="page-content" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--primary-soft)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Gift size={20} />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Affiliate Program</h2>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '3px 0 0 0' }}>
              Share your link — earn {affiliate?.commissionRate ?? 25}% of every payment anyone you refer makes.
            </p>
          </div>
          <button type="button" onClick={load} disabled={loading} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700 }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* Referral link & Sharing Bar */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', marginBottom: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>YOUR UNIQUE REFERRAL LINK</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>Referral Code: <strong style={{ color: 'var(--text-primary)' }}>{affiliate?.code || '—'}</strong></div>
            </div>
            {/* Quick Share Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={shareWhatsApp}
                title="Share on WhatsApp"
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #25D366', background: 'rgba(37,211,102,0.1)', color: '#16a34a', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <Send size={13} /> WhatsApp
              </button>
              <button
                type="button"
                onClick={shareTwitter}
                title="Share on X / Twitter"
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-muted, #f8fafc)', color: 'var(--text-primary)', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <Share2 size={13} /> X / Twitter
              </button>
              <button
                type="button"
                onClick={shareEmail}
                title="Share via Email"
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-muted, #f8fafc)', color: 'var(--text-primary)', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <Mail size={13} /> Email
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-muted, #f8fafc)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
            <span style={{ flex: 1, fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all', fontFamily: 'monospace' }}>
              {liveReferralUrl || 'Loading referral link…'}
            </span>
            <button
              type="button"
              onClick={copyLink}
              className="btn btn-primary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', padding: '6px 14px' }}
            >
              {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />} {copied ? 'Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 18 }}>
          <StatCard label="People Referred" value={stats?.referredCount ?? 0} icon={<Users size={16} />} iconBg="#eff6ff" iconColor="#2563eb" />
          <StatCard label="Revenue Generated" value={money(stats?.totalRevenue)} icon={<DollarSign size={16} />} iconBg="#dcfce7" iconColor="#16a34a" hint="Total paid by your referrals" />
          <StatCard label="Pending Balance" value={money(stats?.pendingBalance)} icon={<Wallet size={16} />} iconBg="#fef3c7" iconColor="#b45309" hint="Waiting for payout" />
          <StatCard label="Total Paid Out" value={money(stats?.paidTotal)} icon={<CheckCircle2 size={16} />} iconBg="#f5f3ff" iconColor="#7c3aed" hint="Completed payouts" />
        </div>

        {/* Referrals Table */}
        <div style={{ marginBottom: 18 }}>
          <DataTable
            title="Your Referrals"
            subtitle="Workspaces that signed up through your link."
            columns={referralColumns}
            data={referrals}
            loading={loading}
            selectable={false}
            emptyIcon={<Users size={40} color="#94a3b8" />}
            emptyTitle="No referrals yet"
            emptySubtitle="Share your referral link above to start earning recurring commissions."
            idKey="id"
          />
        </div>

        {/* Commission History Table with Pagination */}
        <DataTable
          title="Commission History"
          subtitle="Every commission earned, one row per payment your referrals made."
          columns={commissionColumns}
          data={commissions}
          loading={loading}
          selectable={false}
          pagination={{
            page: commPage,
            limit: commLimit,
            total: commTotal,
            onPageChange: (newPage) => loadCommissions(newPage, commLimit),
            onLimitChange: (newLimit) => {
              setCommLimit(newLimit);
              loadCommissions(1, newLimit);
            },
          }}
          emptyIcon={<DollarSign size={40} color="#94a3b8" />}
          emptyTitle="No commissions yet"
          emptySubtitle="Commissions appear here automatically once a referred workspace completes a payment."
          idKey="id"
        />
      </div>
    </AppLayout>
  );
}
