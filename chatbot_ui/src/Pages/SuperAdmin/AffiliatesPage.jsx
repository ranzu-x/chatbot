import React, { useState, useEffect, useMemo } from 'react';
import AppLayout from '../../Layout/AppLayout';
import DataTable from '../../Components/Common/DataTable';
import { adminAffiliateAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import {
  Gift,
  Users,
  DollarSign,
  Wallet,
  CheckCircle2,
  ArrowLeft,
  Building2,
  Ban,
  RotateCcw,
  RefreshCw,
  Banknote,
  Edit2,
  Check,
  X,
  Copy,
} from 'lucide-react';

function money(n) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function StatCard({ label, value, icon, iconBg, iconColor }) {
  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)', padding: '14px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 700 }}>{label}</span>
        <div style={{ width: 26, height: 26, borderRadius: 6, background: iconBg, color: iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
      </div>
      <div style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

/**
 * Super Admin -> Affiliate Management. Every affiliate on the platform
 * (tenants signed up directly under the Super Admin, never a Reseller's
 * own end user), their referrals, commission ledger, and manual payouts.
 */
export default function AffiliatesPage() {
  const [affiliates, setAffiliates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Commission Rate Editing
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState('');
  const [savingRate, setSavingRate] = useState(false);

  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [selectedCommissionIds, setSelectedCommissionIds] = useState(new Set());
  const [payoutNote, setPayoutNote] = useState('');
  const [payoutSaving, setPayoutSaving] = useState(false);

  const [copiedCode, setCopiedCode] = useState(false);

  const loadList = async () => {
    setLoading(true);
    try {
      const res = await adminAffiliateAPI.getAll();
      setAffiliates(res.data?.affiliates || []);
    } catch (err) {
      console.error(err);
      notify.error('Failed to load affiliates.');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id) => {
    setDetailLoading(true);
    try {
      const res = await adminAffiliateAPI.getOne(id);
      setDetail(res.data || null);
      if (res.data?.affiliate) {
        setRateInput(String(res.data.affiliate.commission_rate ?? 25));
      }
    } catch (err) {
      console.error(err);
      notify.error('Failed to load affiliate detail.');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => { loadList(); }, []);
  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
      setEditingRate(false);
    }
  }, [selectedId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return affiliates;
    return affiliates.filter((a) => a.agencyName?.toLowerCase().includes(q) || a.code?.toLowerCase().includes(q));
  }, [affiliates, search]);

  const handleToggleStatus = async (affiliate, e) => {
    if (e) e.stopPropagation();
    try {
      if (affiliate.status === 'ACTIVE') await adminAffiliateAPI.suspend(affiliate.id);
      else await adminAffiliateAPI.reactivate(affiliate.id);
      notify.success(`Affiliate ${affiliate.status === 'ACTIVE' ? 'suspended' : 'reactivated'}.`);
      await loadList();
      if (selectedId === affiliate.id) await loadDetail(affiliate.id);
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Failed to update affiliate status.');
    }
  };

  const handleSaveRate = async () => {
    const rate = parseFloat(rateInput);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      notify.error('Rate must be between 0% and 100%.');
      return;
    }
    setSavingRate(true);
    try {
      await adminAffiliateAPI.updateCommissionRate(detail.affiliate.id, rate);
      notify.success(`Commission rate updated to ${rate}%.`);
      setDetail((prev) => prev ? { ...prev, affiliate: { ...prev.affiliate, commission_rate: rate } } : prev);
      setEditingRate(false);
      await loadList();
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Failed to update commission rate.');
    } finally {
      setSavingRate(false);
    }
  };

  const handleVoidCommission = async (commissionId) => {
    if (!window.confirm('Are you sure you want to VOID this pending commission? This cannot be undone.')) {
      return;
    }
    try {
      await adminAffiliateAPI.voidCommission(detail.affiliate.id, commissionId);
      notify.success('Commission marked as VOID.');
      await loadDetail(detail.affiliate.id);
      await loadList();
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Failed to void commission.');
    }
  };

  const openPayoutModal = () => {
    setSelectedCommissionIds(new Set());
    setPayoutNote('');
    setPayoutModalOpen(true);
  };

  const toggleCommission = (id) => {
    setSelectedCommissionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const pendingCommissions = (detail?.commissions || []).filter((c) => c.status === 'PENDING');
  const payoutTotal = pendingCommissions
    .filter((c) => selectedCommissionIds.has(c.id))
    .reduce((sum, c) => sum + Number(c.commission_amount), 0);

  const submitPayout = async () => {
    if (!selectedCommissionIds.size) {
      notify.error('Select at least one pending commission.');
      return;
    }
    setPayoutSaving(true);
    try {
      await adminAffiliateAPI.recordPayout(detail.affiliate.id, {
        commissionIds: Array.from(selectedCommissionIds),
        note: payoutNote || undefined,
      });
      notify.success('Payout recorded.');
      setPayoutModalOpen(false);
      await loadDetail(detail.affiliate.id);
      await loadList();
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Failed to record payout.');
    } finally {
      setPayoutSaving(false);
    }
  };

  const copyReferralLink = async () => {
    if (!detail?.affiliate?.code) return;
    const link = `${window.location.origin}/pricing?ref=${encodeURIComponent(detail.affiliate.code)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
      notify.success('Affiliate referral link copied!');
    } catch {
      notify.error('Failed to copy link.');
    }
  };

  // ─── Detail view ──────────────────────────────────────────────────
  if (selectedId) {
    const referralColumns = [
      { key: 'name', label: 'WORKSPACE', render: (row) => <span style={{ fontWeight: 700, fontSize: '0.84rem' }}>{row.name}</span> },
      { key: 'account_type', label: 'TYPE', render: (row) => <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{row.account_type}</span> },
      { key: 'created_at', label: 'JOINED', render: (row) => <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{formatDate(row.created_at)}</span> },
      { key: 'totalRevenue', label: 'REVENUE', render: (row) => <span style={{ fontSize: '0.8rem' }}>{money(row.totalRevenue)}</span> },
      { key: 'totalCommission', label: 'COMMISSION', render: (row) => <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#16a34a' }}>{money(row.totalCommission)}</span> },
    ];

    const commissionColumns = [
      { key: 'referredAgencyName', label: 'FROM', render: (row) => <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{row.referredAgencyName}</span> },
      { key: 'revenue_amount', label: 'PAYMENT', render: (row) => <span style={{ fontSize: '0.8rem' }}>{money(row.revenue_amount)}</span> },
      { key: 'commission_amount', label: 'COMMISSION', render: (row) => <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{money(row.commission_amount)}</span> },
      {
        key: 'status',
        label: 'STATUS',
        render: (row) => {
          const colors = { PENDING: ['#fef3c7', '#b45309'], PAID: ['#dcfce7', '#16a34a'], VOID: ['#f1f5f9', '#64748b'] };
          const [bg, fg] = colors[row.status] || colors.PENDING;
          return <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: bg, color: fg }}>{row.status}</span>;
        },
      },
      { key: 'created_at', label: 'DATE', render: (row) => <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{formatDate(row.created_at)}</span> },
      {
        key: 'actions',
        label: 'ACTION',
        render: (row) => (
          row.status === 'PENDING' ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => handleVoidCommission(row.id)}
              style={{ color: '#dc2626', borderColor: '#fca5a5', padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}
              title="Void this commission"
            >
              Void
            </button>
          ) : null
        ),
      },
    ];

    const payoutColumns = [
      { key: 'amount', label: 'AMOUNT', render: (row) => <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>{money(row.amount)}</span> },
      { key: 'note', label: 'NOTE', render: (row) => <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{row.note || '—'}</span> },
      { key: 'created_at', label: 'DATE', render: (row) => <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{formatDate(row.created_at)}</span> },
    ];

    return (
      <AppLayout>
        <div className="page-content" style={{ padding: '14px 18px' }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedId(null); setDetail(null); }} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <ArrowLeft size={13} /> Back to Affiliates
          </button>

          {detailLoading || !detail ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--primary-soft)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Gift size={20} />
                    </div>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>{detail.affiliate.agencyName}</h2>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: detail.affiliate.status === 'ACTIVE' ? '#dcfce7' : '#fee2e2', color: detail.affiliate.status === 'ACTIVE' ? '#16a34a' : '#dc2626' }}>
                      {detail.affiliate.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 6, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <span>
                      Code: <strong style={{ color: 'var(--text-primary)' }}>{detail.affiliate.code}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={copyReferralLink}
                      style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', fontWeight: 700 }}
                    >
                      <Copy size={12} /> {copiedCode ? 'Copied Link!' : 'Copy Link'}
                    </button>
                    <span>·</span>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span>Commission rate:</span>
                      {editingRate ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={rateInput}
                            onChange={(e) => setRateInput(e.target.value)}
                            style={{ width: 64, padding: '2px 6px', fontSize: '0.8rem', borderRadius: 4, border: '1px solid var(--border)' }}
                          />
                          <span>%</span>
                          <button
                            type="button"
                            onClick={handleSaveRate}
                            disabled={savingRate}
                            className="btn btn-primary btn-sm"
                            style={{ padding: '2px 6px', fontSize: '0.72rem' }}
                          >
                            <Check size={12} /> Save
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingRate(false); setRateInput(String(detail.affiliate.commission_rate)); }}
                            className="btn btn-secondary btn-sm"
                            style={{ padding: '2px 6px', fontSize: '0.72rem' }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <strong style={{ color: 'var(--text-primary)' }}>{detail.affiliate.commission_rate}%</strong>
                          <button
                            type="button"
                            onClick={() => setEditingRate(true)}
                            title="Edit commission rate"
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                          >
                            <Edit2 size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => handleToggleStatus(detail.affiliate)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {detail.affiliate.status === 'ACTIVE' ? <><Ban size={13} /> Suspend</> : <><RotateCcw size={13} /> Reactivate</>}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={openPayoutModal} disabled={!pendingCommissions.length} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Banknote size={13} /> Record Payout
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
                <StatCard label="Referred" value={detail.stats.referredCount} icon={<Users size={15} />} iconBg="#eff6ff" iconColor="#2563eb" />
                <StatCard label="Revenue Generated" value={money(detail.stats.totalRevenue)} icon={<DollarSign size={15} />} iconBg="#dcfce7" iconColor="#16a34a" />
                <StatCard label="Pending Balance" value={money(detail.stats.pendingBalance)} icon={<Wallet size={15} />} iconBg="#fef3c7" iconColor="#b45309" />
                <StatCard label="Total Paid Out" value={money(detail.stats.paidTotal)} icon={<CheckCircle2 size={15} />} iconBg="#f5f3ff" iconColor="#7c3aed" />
              </div>

              <div style={{ marginBottom: 18 }}>
                <DataTable title="Referrals" columns={referralColumns} data={detail.referrals} selectable={false} idKey="id" emptyTitle="No referrals yet" />
              </div>
              <div style={{ marginBottom: 18 }}>
                <DataTable title="Commission Ledger" columns={commissionColumns} data={detail.commissions} selectable={false} idKey="id" emptyTitle="No commissions yet" />
              </div>
              <DataTable title="Payout History" columns={payoutColumns} data={detail.payouts} selectable={false} idKey="id" emptyTitle="No payouts recorded yet" />
            </>
          )}

          {payoutModalOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setPayoutModalOpen(false)}>
              <div style={{ background: 'var(--bg-card)', borderRadius: 14, padding: 24, width: 480, maxWidth: '92vw', maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
                <h3 style={{ margin: '0 0 4px', fontSize: '1.05rem' }}>Record Payout</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>Select the pending commissions this payout covers.</p>

                <div style={{ border: '1px solid var(--border)', borderRadius: 10, maxHeight: 220, overflowY: 'auto', marginBottom: 14 }}>
                  {pendingCommissions.map((c) => (
                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.82rem' }}>
                      <input type="checkbox" checked={selectedCommissionIds.has(c.id)} onChange={() => toggleCommission(c.id)} />
                      <span style={{ flex: 1 }}>{c.referredAgencyName} — {formatDate(c.created_at)}</span>
                      <strong>{money(c.commission_amount)}</strong>
                    </label>
                  ))}
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>Note (optional)</label>
                  <input type="text" value={payoutNote} onChange={(e) => setPayoutNote(e.target.value)} placeholder="e.g. Bank transfer ref #1234" style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Total payout</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 900 }}>{money(payoutTotal)}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => setPayoutModalOpen(false)}>Cancel</button>
                  <button className="btn btn-primary btn-sm" onClick={submitPayout} disabled={payoutSaving || !selectedCommissionIds.size}>
                    {payoutSaving ? 'Saving…' : 'Confirm Payout'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </AppLayout>
    );
  }

  // ─── List view ────────────────────────────────────────────────────
  const columns = [
    {
      key: 'agencyName',
      label: 'AFFILIATE',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--primary-soft)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={16} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)' }}>{row.agencyName}</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Code: {row.code} · Rate: {row.commission_rate}%</div>
          </div>
        </div>
      ),
    },
    { key: 'status', label: 'STATUS', render: (row) => (
      <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: row.status === 'ACTIVE' ? '#dcfce7' : '#fee2e2', color: row.status === 'ACTIVE' ? '#16a34a' : '#dc2626' }}>{row.status}</span>
    ) },
    { key: 'referredCount', label: 'REFERRED', render: (row) => <span style={{ fontSize: '0.82rem' }}>{row.referredCount}</span> },
    { key: 'totalRevenue', label: 'REVENUE', render: (row) => <span style={{ fontSize: '0.82rem' }}>{money(row.totalRevenue)}</span> },
    { key: 'pendingBalance', label: 'PENDING', render: (row) => <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#b45309' }}>{money(row.pendingBalance)}</span> },
    { key: 'paidTotal', label: 'PAID OUT', render: (row) => <span style={{ fontSize: '0.82rem' }}>{money(row.paidTotal)}</span> },
    {
      key: 'actions',
      label: '',
      render: (row) => (
        <button className="btn btn-secondary btn-sm" onClick={(e) => handleToggleStatus(row, e)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem' }}>
          {row.status === 'ACTIVE' ? <><Ban size={11} /> Suspend</> : <><RotateCcw size={11} /> Reactivate</>}
        </button>
      ),
    },
  ];

  const totalPending = affiliates.reduce((sum, a) => sum + Number(a.pendingBalance || 0), 0);
  const totalRevenue = affiliates.reduce((sum, a) => sum + Number(a.totalRevenue || 0), 0);

  return (
    <AppLayout>
      <div className="page-content" style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--primary-soft)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Gift size={20} />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Affiliate Management</h2>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '3px 0 0 0' }}>
              Every affiliate referring new customers directly to the platform, and what's owed to them.
            </p>
          </div>
          <button type="button" onClick={loadList} disabled={loading} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700 }}>
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
          <StatCard label="Active Affiliates" value={affiliates.filter((a) => a.status === 'ACTIVE').length} icon={<Users size={15} />} iconBg="#eff6ff" iconColor="#2563eb" />
          <StatCard label="Revenue Referred" value={money(totalRevenue)} icon={<DollarSign size={15} />} iconBg="#dcfce7" iconColor="#16a34a" />
          <StatCard label="Owed to Affiliates" value={money(totalPending)} icon={<Wallet size={15} />} iconBg="#fef3c7" iconColor="#b45309" />
        </div>

        <DataTable
          title="Affiliates"
          columns={columns}
          data={filtered}
          loading={loading}
          search={search}
          onSearch={setSearch}
          searchPlaceholder="Search by workspace or code…"
          selectable={false}
          onRowClick={(row) => setSelectedId(row.id)}
          emptyIcon={<Gift size={40} color="#94a3b8" />}
          emptyTitle="No affiliates yet"
          emptySubtitle="Affiliates appear here once an eligible tenant visits their Affiliate Program page."
          idKey="id"
        />
      </div>
    </AppLayout>
  );
}
