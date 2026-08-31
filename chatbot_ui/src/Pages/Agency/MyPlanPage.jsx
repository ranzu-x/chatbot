import React, { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { packageAPI, billingAPI } from '../../services/api';
import { useAuth } from '../../Provider/AuthContext';
import {
  Package,
  Zap,
  CheckCircle2,
  Lock,
  Users,
  Radio,
  Sparkles,
  Shield,
  Layers,
  ArrowUpRight,
  RefreshCw,
  Info,
  CreditCard,
  Download,
  ExternalLink,
  X,
  Check,
  AlertCircle,
  Clock,
} from 'lucide-react';

export default function MyPlanPage() {
  const { user, refreshEntitlements } = useAuth();
  const [entitlements, setEntitlements] = useState(null);
  const [modulesRegistry, setModulesRegistry] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [availablePlans, setAvailablePlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [subscribingId, setSubscribingId] = useState(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [entRes, regRes, invRes, plansRes] = await Promise.all([
        packageAPI.getMyEntitlements(),
        packageAPI.getRegistry(),
        billingAPI.getInvoices().catch(() => ({ data: { invoices: [] } })),
        billingAPI.getPlans().catch(() => ({ data: { plans: [] } })),
      ]);
      setEntitlements(entRes.data?.entitlements || null);
      setModulesRegistry(regRes.data?.modules || []);
      setInvoices(invRes.data?.invoices || []);
      setAvailablePlans(plansRes.data?.plans || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (plan) => {
    setSubscribingId(plan.id);
    try {
      const res = await billingAPI.createCheckout({
        packageId: plan.id,
        successUrl: window.location.origin + '/billing/success',
        cancelUrl: window.location.href,
      });

      if (res.data?.url) {
        window.location.href = res.data.url;
      } else if (res.data?.isFree || res.data?.isSimulated) {
        showToast(`Successfully switched to ${plan.name}!`);
        setUpgradeModalOpen(false);
        refreshEntitlements();
        loadData();
      }
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.message || 'Failed to initiate checkout', 'error');
    } finally {
      setSubscribingId(null);
    }
  };

  const handleOpenPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await billingAPI.openCustomerPortal({
        returnUrl: window.location.href,
      });
      if (res.data?.url) {
        window.location.href = res.data.url;
      }
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.message || 'No active Stripe billing portal session found.', 'error');
    } finally {
      setPortalLoading(false);
    }
  };

  const pkg = entitlements?.package || { name: 'Free Plan', type: 'AGENCY' };
  const limits = entitlements?.limits || {};
  const usage = entitlements?.usage || {};
  const enabledSet = new Set(entitlements?.enabledModules || []);

  const calcPercent = (used, max) => {
    if (max === null || max === undefined || max === 0) return 0;
    return Math.min(100, Math.round((used / max) * 100));
  };

  return (
    <AppLayout>
      <div className="my-plan-page" style={{ width: '100%', padding: '16px 20px' }}>
        {/* Toast Notification */}
        {toast && (
          <div
            style={{
              position: 'fixed',
              top: 20,
              right: 20,
              zIndex: 99999,
              padding: '12px 20px',
              borderRadius: 10,
              background: toast.type === 'error' ? '#ef4444' : '#10b981',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.84rem',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {toast.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            {toast.msg}
          </div>
        )}

        {/* Page Header */}
        <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={20} />
              </div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                Subscription Plan & Billing Overview
              </h2>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '3px 0 0 0' }}>
              Monitor real-time capacity quotas, manage Stripe billing, and upgrade your tier.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={handleOpenPortal}
              disabled={portalLoading}
              style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', color: '#334155', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700 }}
            >
              <CreditCard size={14} color="#2563eb" /> {portalLoading ? 'Opening Portal...' : 'Manage Billing & Cards'}
            </button>

            <button
              type="button"
              onClick={() => setUpgradeModalOpen(true)}
              style={{ padding: '8px 18px', borderRadius: 8, background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)', color: '#ffffff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 800, boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)' }}
            >
              <ArrowUpRight size={15} /> Upgrade / Change Plan
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', background: '#ffffff', borderRadius: 12 }}>
            <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
            <span style={{ fontSize: '0.84rem', color: '#64748b' }}>Calculating plan usage and billing...</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* ── 1. Plan Hero Card ── */}
            <div
              style={{
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                color: '#ffffff',
                borderRadius: 14,
                padding: '22px 26px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 16,
                boxShadow: '0 4px 20px rgba(15, 23, 42, 0.12)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '3px 10px', borderRadius: 12, background: 'rgba(37, 99, 235, 0.3)', color: '#93c5fd', border: '1px solid rgba(147, 197, 253, 0.3)' }}>
                    {pkg.type} TIER
                  </span>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    Active Plan
                  </span>
                </div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 900, margin: '0 0 4px 0', letterSpacing: '-0.3px' }}>
                  {pkg.name}
                </h1>
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>
                  Billing cycle: <strong style={{ color: '#ffffff' }}>{pkg.billingCycle}</strong>
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#38bdf8' }}>
                    {pkg.price > 0 ? `$${pkg.price}` : 'Free'}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    {pkg.price > 0 ? `per ${pkg.billingCycle}` : 'Included Plan'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setUpgradeModalOpen(true)}
                  style={{ padding: '8px 16px', borderRadius: 8, background: '#38bdf8', color: '#0f172a', border: 'none', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer' }}
                >
                  Change Plan
                </button>
              </div>
            </div>

            {/* ── 2. Real-Time Capacity Usage Meters ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              {/* Bot Channels Usage */}
              <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Radio size={15} color="#2563eb" /> Connected Bot Accounts
                  </span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#2563eb' }}>
                    {usage.usedBotAccounts || 0} / {limits.maxBotAccounts === null ? '∞' : limits.maxBotAccounts}
                  </span>
                </div>

                {limits.maxBotAccounts !== null ? (
                  <div>
                    <div style={{ width: '100%', height: 6, borderRadius: 10, background: '#f1f5f9', overflow: 'hidden', marginBottom: 4 }}>
                      <div
                        style={{
                          width: `${calcPercent(usage.usedBotAccounts, limits.maxBotAccounts)}%`,
                          height: '100%',
                          background: calcPercent(usage.usedBotAccounts, limits.maxBotAccounts) > 85 ? '#ef4444' : '#2563eb',
                          borderRadius: 10,
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                      {calcPercent(usage.usedBotAccounts, limits.maxBotAccounts)}% capacity used
                    </span>
                  </div>
                ) : (
                  <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 700 }}>
                    ✨ Unlimited Bot Channels Included
                  </span>
                )}
              </div>

              {/* Subscribers Usage */}
              <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Users size={15} color="#059669" /> Total Subscribers (Contacts)
                  </span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#059669' }}>
                    {(usage.usedSubscribers || 0).toLocaleString()} / {limits.maxSubscribers === null ? '∞' : limits.maxSubscribers.toLocaleString()}
                  </span>
                </div>

                {limits.maxSubscribers !== null ? (
                  <div>
                    <div style={{ width: '100%', height: 6, borderRadius: 10, background: '#f1f5f9', overflow: 'hidden', marginBottom: 4 }}>
                      <div
                        style={{
                          width: `${calcPercent(usage.usedSubscribers, limits.maxSubscribers)}%`,
                          height: '100%',
                          background: calcPercent(usage.usedSubscribers, limits.maxSubscribers) > 85 ? '#ef4444' : '#059669',
                          borderRadius: 10,
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                      {calcPercent(usage.usedSubscribers, limits.maxSubscribers)}% capacity used
                    </span>
                  </div>
                ) : (
                  <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 700 }}>
                    ✨ Unlimited Subscribers Included
                  </span>
                )}
              </div>

              {/* Team Members Usage */}
              <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Shield size={15} color="#9333ea" /> Team Members / Seats
                  </span>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#9333ea' }}>
                    {usage.usedTeamMembers || 0} / {limits.maxTeamMembers === null ? '∞' : limits.maxTeamMembers}
                  </span>
                </div>

                {limits.maxTeamMembers !== null ? (
                  <div>
                    <div style={{ width: '100%', height: 6, borderRadius: 10, background: '#f1f5f9', overflow: 'hidden', marginBottom: 4 }}>
                      <div
                        style={{
                          width: `${calcPercent(usage.usedTeamMembers, limits.maxTeamMembers)}%`,
                          height: '100%',
                          background: calcPercent(usage.usedTeamMembers, limits.maxTeamMembers) > 85 ? '#ef4444' : '#9333ea',
                          borderRadius: 10,
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                      {calcPercent(usage.usedTeamMembers, limits.maxTeamMembers)}% capacity used
                    </span>
                  </div>
                ) : (
                  <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 700 }}>
                    ✨ Unlimited Seats Included
                  </span>
                )}
              </div>
            </div>

            {/* ── 3. Module Matrix & Included Features ── */}
            <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ marginBottom: 14 }}>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Layers size={16} color="#2563eb" /> Modular Feature Entitlements
                </h3>
                <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '2px 0 0 0' }}>
                  Features unlocked by your current subscription package.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                {modulesRegistry.map((mod) => {
                  const isEnabled = enabledSet.has(mod.key);

                  return (
                    <div
                      key={mod.key}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: `1px solid ${isEnabled ? '#dbeafe' : '#f1f5f9'}`,
                        background: isEnabled ? '#f8fafc' : '#fafafa',
                        opacity: isEnabled ? 1 : 0.65,
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 7,
                          background: isEnabled ? '#2563eb15' : '#f1f5f9',
                          color: isEnabled ? '#2563eb' : '#94a3b8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        {isEnabled ? <CheckCircle2 size={15} color="#059669" /> : <Lock size={14} color="#94a3b8" />}
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: isEnabled ? '#0f172a' : '#64748b' }}>
                            {mod.display_name}
                          </span>
                          <span style={{ fontSize: '0.64rem', fontWeight: 800, padding: '2px 5px', borderRadius: 4, background: isEnabled ? '#10b98115' : '#f1f5f9', color: isEnabled ? '#059669' : '#94a3b8' }}>
                            {isEnabled ? 'INCLUDED' : 'LOCKED'}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.7rem', color: '#64748b', margin: '2px 0 0 0', lineHeight: 1.3 }}>
                          {mod.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── 4. Invoices & Billing History ── */}
            <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CreditCard size={16} color="#2563eb" /> Invoices & Receipts
                </h3>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  {invoices.length} invoices recorded
                </span>
              </div>

              {invoices.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: '0.76rem', background: '#f8fafc', borderRadius: 8 }}>
                  No payment invoices found for this workspace.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                        <th style={{ padding: '8px 12px' }}>Invoice ID</th>
                        <th style={{ padding: '8px 12px' }}>Date</th>
                        <th style={{ padding: '8px 12px' }}>Amount</th>
                        <th style={{ padding: '8px 12px' }}>Status</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right' }}>Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => (
                        <tr key={inv.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a' }}>
                            {inv.stripe_invoice_id || `#INV-${inv.id}`}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#64748b' }}>
                            {new Date(inv.paid_at).toLocaleDateString()}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 800, color: '#0f172a' }}>
                            ${Number(inv.amount_paid).toFixed(2)} {inv.currency}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ fontSize: '0.66rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: '#10b98120', color: '#059669' }}>
                              {inv.status}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                            {inv.invoice_pdf_url || inv.hosted_invoice_url ? (
                              <a
                                href={inv.invoice_pdf_url || inv.hosted_invoice_url}
                                target="_blank"
                                rel="noreferrer"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}
                              >
                                <Download size={13} /> View Receipt
                              </a>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>Processed</span>
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
        )}

        {/* ─── UPGRADE / CHANGE PLAN MODAL ─── */}
        {upgradeModalOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: '#ffffff', borderRadius: 16, width: '100%', maxWidth: 980, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
              {/* Header */}
              <div style={{ padding: '16px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Upgrade / Choose Your Plan
                  </h3>
                  <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                    Select a tier to unlock more bot accounts, subscribers, and advanced features with instant Stripe activation.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setUpgradeModalOpen(false)}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Pricing Cards Grid */}
              <div style={{ padding: 22, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                {availablePlans.map((plan) => {
                  const isCurrent = pkg.id === plan.id;
                  const isSubscribing = subscribingId === plan.id;

                  return (
                    <div
                      key={plan.id}
                      style={{
                        borderRadius: 14,
                        border: isCurrent ? '2px solid #2563eb' : '1px solid #e2e8f0',
                        background: isCurrent ? '#eff6ff30' : '#ffffff',
                        padding: 20,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: isCurrent ? '0 4px 14px rgba(37, 99, 235, 0.1)' : 'none',
                        position: 'relative',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                          <div>
                            <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 10, background: '#eff6ff', color: '#2563eb' }}>
                              {plan.type}
                            </span>
                            <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: '4px 0 0 0' }}>
                              {plan.name}
                            </h4>
                          </div>

                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0f172a' }}>
                              {plan.price > 0 ? `$${plan.price}` : 'Free'}
                            </div>
                            <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>
                              /{plan.billing_cycle}
                            </span>
                          </div>
                        </div>

                        <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '0 0 12px 0', minHeight: 32 }}>
                          {plan.description || 'Full modular capabilities.'}
                        </p>

                        {/* Quotas */}
                        <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8, fontSize: '0.72rem', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                          <div><strong>Bots:</strong> {plan.max_bot_accounts === null ? 'Unlimited' : plan.max_bot_accounts}</div>
                          <div><strong>Subscribers:</strong> {plan.max_subscribers === null ? 'Unlimited' : Number(plan.max_subscribers).toLocaleString()}</div>
                          <div><strong>Team Seats:</strong> {plan.max_team_members === null ? 'Unlimited' : plan.max_team_members}</div>
                        </div>

                        {/* Modules preview */}
                        <div style={{ fontSize: '0.72rem', color: '#334155', marginBottom: 16 }}>
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>Included ({plan.enabledModules?.length || 0} modules):</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {(plan.enabledModules || []).slice(0, 5).map((m) => (
                              <span key={m.key} style={{ fontSize: '0.66rem', padding: '2px 6px', borderRadius: 4, background: '#f1f5f9', color: '#475569' }}>
                                {m.displayName}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Action Button */}
                      <button
                        type="button"
                        disabled={isCurrent || isSubscribing}
                        onClick={() => handleSubscribe(plan)}
                        style={{
                          width: '100%',
                          padding: '9px 0',
                          borderRadius: 8,
                          background: isCurrent ? '#f1f5f9' : '#2563eb',
                          color: isCurrent ? '#94a3b8' : '#ffffff',
                          border: 'none',
                          fontWeight: 800,
                          fontSize: '0.8rem',
                          cursor: isCurrent || isSubscribing ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          boxShadow: isCurrent ? 'none' : '0 4px 12px rgba(37, 99, 235, 0.25)',
                        }}
                      >
                        {isCurrent ? (
                          <>
                            <Check size={14} /> Current Active Plan
                          </>
                        ) : isSubscribing ? (
                          'Redirecting to Stripe...'
                        ) : (
                          <>
                            <ArrowUpRight size={14} /> {plan.price > 0 ? `Subscribe with Stripe` : 'Select Free Plan'}
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
