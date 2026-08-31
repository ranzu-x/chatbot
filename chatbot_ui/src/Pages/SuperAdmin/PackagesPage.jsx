import React, { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { packageAPI, adminAPI } from '../../services/api';
import {
  Package,
  Plus,
  Edit3,
  Copy,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Users,
  Building2,
  Shield,
  Layers,
  Sparkles,
  Sliders,
  DollarSign,
  Search,
  RefreshCw,
  X,
  Check,
  Zap,
  Radio,
  ArrowRight,
  Info,
  ChevronRight,
  Lock,
  Save,
  MessageSquare,
  Facebook,
  Instagram,
  Send,
  Globe,
  Video,
  Clock,
} from 'lucide-react';

export default function PackagesPage() {
  const [packages, setPackages] = useState([]);
  const [modulesRegistry, setModulesRegistry] = useState([]);
  const [agencies, setAgencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL'); // 'ALL' | 'AGENCY' | 'END_USER' | 'TEAM_MEMBER'
  const [selectedPkgId, setSelectedPkgId] = useState(null);
  const [toast, setToast] = useState(null);

  // Active Editor Form State
  const [form, setForm] = useState({
    id: null,
    name: '',
    slug: '',
    type: 'AGENCY',
    description: '',
    price: 0,
    billingCycle: 'monthly',
    isActive: true,
    isDefault: false,
    maxBotAccounts: '',
    maxSubscribers: '',
    maxTeamMembers: '',
    maxMonthlyMessages: '',
    modules: [], // { key, isEnabled, limits }
  });

  // Assign Modal State
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTargetType, setAssignTargetType] = useState('AGENCY');
  const [selectedAgencyId, setSelectedAgencyId] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [assigning, setAssigning] = useState(false);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (preferredId = null) => {
    setLoading(true);
    try {
      const [pkgRes, regRes, agRes] = await Promise.all([
        packageAPI.getAll(),
        packageAPI.getRegistry(),
        adminAPI.getAgencies().catch(() => ({ data: { agencies: [] } })),
      ]);

      const pkgList = pkgRes.data?.packages || [];
      const regList = regRes.data?.modules || [];
      setPackages(pkgList);
      setModulesRegistry(regList);
      setAgencies(agRes.data?.agencies || []);

      // Select package
      const targetId = preferredId || selectedPkgId || pkgList[0]?.id;
      if (targetId) {
        loadPackageDetails(targetId, regList);
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to load packages', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadPackageDetails = async (id, registryList = modulesRegistry) => {
    try {
      setSelectedPkgId(id);
      const res = await packageAPI.getOne(id);
      const data = res.data?.package;
      const matrix = res.data?.modulesMatrix || [];

      setForm({
        id: data.id,
        name: data.name || '',
        slug: data.slug || '',
        type: data.type || 'AGENCY',
        description: data.description || '',
        price: data.price || 0,
        billingCycle: data.billing_cycle || 'monthly',
        isActive: Boolean(data.is_active),
        isDefault: Boolean(data.is_default),
        maxBotAccounts: data.max_bot_accounts === null ? '' : String(data.max_bot_accounts),
        maxSubscribers: data.max_subscribers === null ? '' : String(data.max_subscribers),
        maxTeamMembers: data.max_team_members === null ? '' : String(data.max_team_members),
        maxMonthlyMessages: data.max_monthly_messages === null ? '' : String(data.max_monthly_messages),
        modules: matrix.map((m) => ({
          key: m.key,
          isEnabled: Boolean(m.isEnabled),
          limits: m.limits || {},
        })),
      });
    } catch (err) {
      console.error(err);
      showToast('Failed to load package details', 'error');
    }
  };

  const handleSelectPackage = (id) => {
    loadPackageDetails(id);
  };

  const handleCreateNewPackage = () => {
    const tempSlug = `custom-package-${Date.now().toString().slice(-4)}`;
    setForm({
      id: null,
      name: 'New Custom Package',
      slug: tempSlug,
      type: 'AGENCY',
      description: 'Custom subscription package with configurable module limits.',
      price: 49,
      billingCycle: 'monthly',
      isActive: true,
      isDefault: false,
      maxBotAccounts: '5',
      maxSubscribers: '5000',
      maxTeamMembers: '3',
      maxMonthlyMessages: '',
      modules: modulesRegistry.map((m) => ({
        key: m.key,
        isEnabled: true,
        limits: {},
      })),
    });
    setSelectedPkgId(null);
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    if (!form.name.trim()) {
      showToast('Package name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        price: Number(form.price) || 0,
        maxBotAccounts: form.maxBotAccounts === '' ? null : Number(form.maxBotAccounts),
        maxSubscribers: form.maxSubscribers === '' ? null : Number(form.maxSubscribers),
        maxTeamMembers: form.maxTeamMembers === '' ? null : Number(form.maxTeamMembers),
        maxMonthlyMessages: form.maxMonthlyMessages === '' ? null : Number(form.maxMonthlyMessages),
      };

      if (form.id) {
        await packageAPI.update(form.id, payload);
        showToast(`Package "${form.name}" updated successfully!`);
        loadData(form.id);
      } else {
        const res = await packageAPI.create(payload);
        showToast(`New package "${form.name}" created!`);
        loadData(res.data?.packageId);
      }
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.message || 'Failed to save package', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleClone = async (id) => {
    try {
      const res = await packageAPI.clone(id);
      showToast(res.data?.message || 'Package cloned');
      loadData(res.data?.packageId);
    } catch (err) {
      console.error(err);
      showToast('Failed to clone package', 'error');
    }
  };

  const handleDelete = async (id, isDefault) => {
    if (isDefault) {
      showToast('Cannot delete the default package', 'error');
      return;
    }
    if (!window.confirm('Are you sure you want to delete this package?')) return;
    try {
      const res = await packageAPI.delete(id);
      showToast(res.data?.message || 'Package deleted');
      loadData();
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.message || 'Failed to delete package', 'error');
    }
  };

  const handleModuleToggle = (key) => {
    setForm((prev) => ({
      ...prev,
      modules: prev.modules.map((m) =>
        m.key === key ? { ...m, isEnabled: !m.isEnabled } : m
      ),
    }));
  };

  const handleModuleLimitChange = (key, field, val) => {
    setForm((prev) => ({
      ...prev,
      modules: prev.modules.map((m) => {
        if (m.key !== key) return m;
        return {
          ...m,
          limits: {
            ...m.limits,
            [field]: val === '' ? null : Number(val),
          },
        };
      }),
    }));
  };

  const handleOpenAssignModal = () => {
    setSelectedAgencyId(agencies[0]?.id || '');
    setAssignNotes(`Assigned ${form.name}`);
    setAssignOpen(true);
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!form.id) return;
    setAssigning(true);
    try {
      await packageAPI.assign({
        packageId: form.id,
        agencyId: assignTargetType === 'AGENCY' ? selectedAgencyId : null,
        notes: assignNotes,
      });
      showToast(`Package "${form.name}" assigned successfully!`);
      setAssignOpen(false);
      loadData(form.id);
    } catch (err) {
      console.error(err);
      showToast(err.response?.data?.message || 'Failed to assign package', 'error');
    } finally {
      setAssigning(false);
    }
  };

  const filteredPackages = packages.filter((p) => {
    const matchesFilter = filterType === 'ALL' || p.type === filterType;
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const channelsModules = modulesRegistry.filter((m) => m.module_type === 'channel');
  const featureModules = modulesRegistry.filter((m) => m.module_type === 'feature');

  return (
    <AppLayout>
      <div className="packages-master-detail-page" style={{ width: '100%', padding: '12px 16px' }}>
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

        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Package size={20} />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                Package & Module Management System
              </h2>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '3px 0 0 0' }}>
              Select a package from the list to configure its details, subscriber limits, connect account quotas, and modular features.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => loadData(selectedPkgId)}
              disabled={loading}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 700 }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button
              type="button"
              onClick={handleCreateNewPackage}
              style={{ padding: '8px 16px', borderRadius: 8, background: '#2563eb', color: '#ffffff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 800, boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)' }}
            >
              <Plus size={15} /> Create Package
            </button>
          </div>
        </div>

        {/* ── Master-Detail 2-Column Layout ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '330px 1fr', gap: 14, alignItems: 'start' }}>
          {/* ════════════════════════════════════════════════════════════════
              LEFT PANEL: PACKAGES LIST
              ════════════════════════════════════════════════════════════════ */}
          <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Search Box */}
            <div style={{ position: 'relative' }}>
              <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                className="form-input w-full"
                placeholder="Search packages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ paddingLeft: 32, fontSize: '0.78rem', height: 36 }}
              />
            </div>

            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 4 }}>
              {[
                { id: 'ALL', label: 'All' },
                { id: 'AGENCY', label: 'Agency' },
                { id: 'END_USER', label: 'End User' },
                { id: 'TEAM_MEMBER', label: 'Team' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilterType(f.id)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 14,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    background: filterType === f.id ? '#0f172a' : '#f1f5f9',
                    color: filterType === f.id ? '#ffffff' : '#64748b',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* List of Package Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 'calc(100vh - 240px)', overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>
                  Loading packages...
                </div>
              ) : filteredPackages.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>
                  No packages match filter.
                </div>
              ) : (
                filteredPackages.map((pkg) => {
                  const isSelected = (selectedPkgId === pkg.id && form.id === pkg.id);

                  return (
                    <div
                      key={pkg.id}
                      onClick={() => handleSelectPackage(pkg.id)}
                      style={{
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                        background: isSelected ? '#eff6ff' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        boxShadow: isSelected ? '0 2px 8px rgba(37, 99, 235, 0.12)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '2px 6px', borderRadius: 6, background: pkg.type === 'AGENCY' ? '#dbeafe' : (pkg.type === 'END_USER' ? '#dcfce7' : '#f3e8ff'), color: pkg.type === 'AGENCY' ? '#1d4ed8' : (pkg.type === 'END_USER' ? '#15803d' : '#7e22ce') }}>
                              {pkg.type}
                            </span>
                            {pkg.is_default === 1 && (
                              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#059669' }}>
                                ★ Default
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0f172a' }}>
                            {pkg.name}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#0f172a' }}>
                            {pkg.price > 0 ? `$${pkg.price}` : 'Free'}
                          </span>
                          <span style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block' }}>
                            /{pkg.billing_cycle}
                          </span>
                        </div>
                      </div>

                      {/* Quick Limits Tags */}
                      <div style={{ display: 'flex', gap: 8, fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>
                        <span>🤖 {pkg.max_bot_accounts === null ? '∞' : pkg.max_bot_accounts} Bots</span>
                        <span>👥 {pkg.max_subscribers === null ? '∞' : Number(pkg.max_subscribers).toLocaleString()} Subs</span>
                        <span>🧑‍💼 {pkg.max_team_members === null ? '∞' : pkg.max_team_members} Seats</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════════
              RIGHT PANEL: SELECTED PACKAGE DETAILS & MODULE MATRIX
              ════════════════════════════════════════════════════════════════ */}
          <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #e2e8f0', padding: 22, boxShadow: '0 1px 3px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Header with Title & Action Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, paddingBottom: 16, borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: '#eff6ff', color: '#2563eb' }}>
                    {form.type} PACKAGE
                  </span>
                  <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                    {form.id ? `ID: #${form.id}` : 'Draft / New'}
                  </span>
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  {form.name || 'Untitled Package'}
                </h3>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {form.id && (
                  <>
                    <button
                      type="button"
                      onClick={handleOpenAssignModal}
                      style={{ padding: '7px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #cbd5e1', fontSize: '0.78rem', fontWeight: 700, color: '#1e293b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <Users size={13} /> Assign to Agency
                    </button>

                    <button
                      type="button"
                      onClick={() => handleClone(form.id)}
                      title="Clone Package"
                      style={{ padding: '7px 10px', borderRadius: 8, background: '#f8fafc', border: '1px solid #cbd5e1', fontSize: '0.78rem', color: '#64748b', cursor: 'pointer' }}
                    >
                      <Copy size={13} /> Clone
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(form.id, form.isDefault)}
                      title="Delete Package"
                      style={{ padding: '7px 10px', borderRadius: 8, background: '#fee2e2', border: '1px solid #fecaca', fontSize: '0.78rem', color: '#dc2626', cursor: 'pointer' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 8,
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                  }}
                >
                  <Save size={14} />
                  {saving ? 'Saving...' : 'Save Package & Limits'}
                </button>
              </div>
            </div>

            {/* ── Section 1: General Info & Default Numeric Limits ── */}
            <div style={{ background: '#f8fafc', padding: 18, borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Sliders size={15} color="#2563eb" /> 1. Package Information & Numeric Limits
              </h4>

              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Package Name *
                  </label>
                  <input
                    type="text"
                    required
                    className="form-input w-full"
                    placeholder="e.g. Agency Pro"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Package Type *
                  </label>
                  <select
                    className="form-input w-full"
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                  >
                    <option value="AGENCY">Agency Package</option>
                    <option value="END_USER">Premium End-User</option>
                    <option value="TEAM_MEMBER">Team Member</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    Price ($) & Cycle
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-input"
                      style={{ width: 80 }}
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                    />
                    <select
                      className="form-input"
                      style={{ flex: 1 }}
                      value={form.billingCycle}
                      onChange={(e) => setForm({ ...form, billingCycle: e.target.value })}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="yearly">Yearly</option>
                      <option value="lifetime">Lifetime</option>
                      <option value="free">Free</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Numeric Quotas Row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    🤖 Connect Accounts Limit (blank = unlimited)
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="form-input w-full"
                    placeholder="Unlimited"
                    value={form.maxBotAccounts}
                    onChange={(e) => setForm({ ...form, maxBotAccounts: e.target.value })}
                  />
                  <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Max connected bot channels</span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    👥 Subscribers Limit (blank = unlimited)
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="form-input w-full"
                    placeholder="Unlimited"
                    value={form.maxSubscribers}
                    onChange={(e) => setForm({ ...form, maxSubscribers: e.target.value })}
                  />
                  <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Max CRM contacts stored</span>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                    🧑‍💼 Team Members / Seats (blank = unlimited)
                  </label>
                  <input
                    type="number"
                    min="0"
                    className="form-input w-full"
                    placeholder="Unlimited"
                    value={form.maxTeamMembers}
                    onChange={(e) => setForm({ ...form, maxTeamMembers: e.target.value })}
                  />
                  <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Max agent accounts</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                  />
                  Set as Default Package for new {form.type} signups
                </label>
              </div>
            </div>

            {/* ── Section 2: Modules Management (Enable/Disable & Custom Numeric Limits) ── */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <h4 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Layers size={16} color="#2563eb" /> 2. Modules & Feature Availability Matrix
                  </h4>
                  <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '2px 0 0 0' }}>
                    Enable/disable any module for this package. Disabled modules are automatically hidden in menus and blocked by the API.
                  </p>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, modules: prev.modules.map((m) => ({ ...m, isEnabled: true })) }))}
                    style={{ padding: '4px 10px', borderRadius: 6, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Enable All
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, modules: prev.modules.map((m) => ({ ...m, isEnabled: false })) }))}
                    style={{ padding: '4px 10px', borderRadius: 6, background: '#f8fafc', border: '1px solid #cbd5e1', color: '#64748b', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Disable All
                  </button>
                </div>
              </div>

              {/* 📡 2A. Messaging Channels */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8', marginBottom: 10 }}>
                  📡 Messaging Channels ({channelsModules.length})
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
                  {channelsModules.map((mod) => {
                    const pkgMod = form.modules.find((m) => m.key === mod.key);
                    const isEnabled = pkgMod ? pkgMod.isEnabled : true;
                    const customBotLimit = pkgMod?.limits?.max_bot_accounts ?? '';

                    return (
                      <div
                        key={mod.key}
                        style={{
                          padding: '14px',
                          borderRadius: 12,
                          border: `1px solid ${isEnabled ? '#93c5fd' : '#e2e8f0'}`,
                          background: isEnabled ? '#ffffff' : '#fafafa',
                          boxShadow: isEnabled ? '0 1px 4px rgba(37, 99, 235, 0.06)' : 'none',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                        }}
                      >
                        {/* Module Top Row */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 34, height: 34, borderRadius: 8, background: isEnabled ? '#2563eb' : '#cbd5e1', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Radio size={16} />
                            </div>
                            <div>
                              <div style={{ fontSize: '0.84rem', fontWeight: 800, color: isEnabled ? '#0f172a' : '#94a3b8' }}>
                                {mod.display_name}
                              </div>
                              <span style={{ fontSize: '0.68rem', color: isEnabled ? '#059669' : '#94a3b8', fontWeight: 700 }}>
                                {isEnabled ? '🟢 Active Module' : '⚪ Disabled'}
                              </span>
                            </div>
                          </div>

                          {/* Toggle Switch */}
                          <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              onChange={() => handleModuleToggle(mod.key)}
                              style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            <span
                              style={{
                                position: 'absolute',
                                inset: 0,
                                background: isEnabled ? '#2563eb' : '#cbd5e1',
                                borderRadius: 20,
                                transition: '0.2s',
                              }}
                            >
                              <span
                                style={{
                                  position: 'absolute',
                                  height: 16,
                                  width: 16,
                                  left: isEnabled ? 20 : 3,
                                  bottom: 3,
                                  background: '#ffffff',
                                  borderRadius: '50%',
                                  transition: '0.2s',
                                }}
                              />
                            </span>
                          </label>
                        </div>

                        {/* Per-Module Channel Limit Inputs */}
                        {isEnabled && (
                          <div style={{ background: '#f8fafc', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontSize: '0.72rem', color: '#475569', fontWeight: 600 }}>
                              Max Accounts for this channel:
                            </span>
                            <input
                              type="number"
                              min="0"
                              className="form-input"
                              placeholder="Default (Package limit)"
                              value={customBotLimit}
                              onChange={(e) => handleModuleLimitChange(mod.key, 'max_bot_accounts', e.target.value)}
                              style={{ width: 130, height: 28, fontSize: '0.72rem', background: '#ffffff' }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ⚡ 2B. Platform Features & Automations */}
              <div>
                <div style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#94a3b8', marginBottom: 10 }}>
                  ⚡ Platform Features & Automations ({featureModules.length})
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
                  {featureModules.map((mod) => {
                    const pkgMod = form.modules.find((m) => m.key === mod.key);
                    const isEnabled = pkgMod ? pkgMod.isEnabled : true;

                    return (
                      <div
                        key={mod.key}
                        style={{
                          padding: '14px',
                          borderRadius: 12,
                          border: `1px solid ${isEnabled ? '#93c5fd' : '#e2e8f0'}`,
                          background: isEnabled ? '#ffffff' : '#fafafa',
                          boxShadow: isEnabled ? '0 1px 4px rgba(37, 99, 235, 0.06)' : 'none',
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <div style={{ width: 34, height: 34, borderRadius: 8, background: isEnabled ? '#2563eb' : '#cbd5e1', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                            <Sparkles size={16} />
                          </div>
                          <div>
                            <div style={{ fontSize: '0.84rem', fontWeight: 800, color: isEnabled ? '#0f172a' : '#94a3b8' }}>
                              {mod.display_name}
                            </div>
                            <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '2px 0 0 0', lineHeight: 1.3 }}>
                              {mod.description}
                            </p>
                          </div>
                        </div>

                        {/* Toggle Switch */}
                        <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer', flexShrink: 0 }}>
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={() => handleModuleToggle(mod.key)}
                            style={{ opacity: 0, width: 0, height: 0 }}
                          />
                          <span
                            style={{
                              position: 'absolute',
                              inset: 0,
                              background: isEnabled ? '#2563eb' : '#cbd5e1',
                              borderRadius: 20,
                              transition: '0.2s',
                            }}
                          >
                            <span
                              style={{
                                position: 'absolute',
                                height: 16,
                                width: 16,
                                left: isEnabled ? 20 : 3,
                                bottom: 3,
                                background: '#ffffff',
                                borderRadius: '50%',
                                transition: '0.2s',
                              }}
                            />
                          </span>
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Bottom Save Bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '9px 24px',
                  borderRadius: 8,
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '0.84rem',
                  fontWeight: 800,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)',
                }}
              >
                <Save size={15} />
                {saving ? 'Saving Changes...' : 'Save Package & Modules Matrix'}
              </button>
            </div>
          </div>
        </div>

        {/* ─── MODAL: ASSIGN PACKAGE TO AGENCY ─── */}
        {assignOpen && form.id && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: '#ffffff', borderRadius: 14, width: '100%', maxWidth: 480, overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Users size={16} color="#2563eb" />
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Assign Package: {form.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setAssignOpen(false)}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAssignSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                    Select Target Agency Workspace
                  </label>
                  <select
                    className="form-input w-full"
                    value={selectedAgencyId}
                    onChange={(e) => setSelectedAgencyId(e.target.value)}
                    required
                  >
                    {agencies.map((ag) => (
                      <option key={ag.id} value={ag.id}>
                        {ag.name} (ID: {ag.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: 4 }}>
                    Assignment / Internal Notes
                  </label>
                  <input
                    type="text"
                    className="form-input w-full"
                    placeholder="e.g. Upgraded tier"
                    value={assignNotes}
                    onChange={(e) => setAssignNotes(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => setAssignOpen(false)}
                    style={{ padding: '8px 14px', borderRadius: 8, background: '#ffffff', border: '1px solid #cbd5e1', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={assigning}
                    style={{ padding: '8px 18px', borderRadius: 8, background: '#2563eb', color: '#ffffff', border: 'none', fontSize: '0.8rem', fontWeight: 800, cursor: assigning ? 'not-allowed' : 'pointer' }}
                  >
                    {assigning ? 'Assigning...' : 'Confirm Assignment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
