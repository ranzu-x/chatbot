import React, { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { packageAPI, adminAPI } from '../../services/api';
import {
  PACKAGE_FEATURE_ROWS,
  PACKAGE_CHANNEL_BLOCKS,
  RESELLER_MODULE,
  WHITELABEL_MODULE,
} from './packageFeatureConfig';
import {
  Package,
  Plus,
  Copy,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Users,
  Layers,
  Sliders,
  Search,
  RefreshCw,
  X,
  Save,
  Percent,
  Radio,
  Building2,
} from 'lucide-react';

// Every module the editor renders in a dedicated place; anything else in the
// registry falls into "Other modules" at the end.
const PLACED_MODULES = new Set([
  ...PACKAGE_FEATURE_ROWS.map((r) => r.module),
  ...PACKAGE_CHANNEL_BLOCKS.map((c) => c.module),
  RESELLER_MODULE,
  WHITELABEL_MODULE,
]);

const FALLBACK_TIMEZONES = ['UTC', 'Asia/Dhaka', 'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles'];
const TIMEZONES = (() => {
  try {
    return typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : FALLBACK_TIMEZONES;
  } catch {
    return FALLBACK_TIMEZONES;
  }
})();

const labelStyle = { display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#334155', marginBottom: 4 };
const sectionStyle = { background: '#f8fafc', padding: 18, borderRadius: 10, border: '1px solid #e2e8f0' };
const sectionTitleStyle = { fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', margin: '0 0 14px 0', display: 'flex', alignItems: 'center', gap: 6 };

function Switch({ checked, onChange, danger = false }) {
  return (
    <label style={{ position: 'relative', display: 'inline-block', width: 38, height: 20, cursor: 'pointer', flexShrink: 0 }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{ position: 'absolute', inset: 0, background: checked ? (danger ? '#dc2626' : '#0f172a') : '#cbd5e1', borderRadius: 20, transition: '0.2s' }}>
        <span style={{ position: 'absolute', height: 14, width: 14, left: checked ? 20 : 3, bottom: 3, background: '#ffffff', borderRadius: '50%', transition: '0.2s' }} />
      </span>
    </label>
  );
}

// A labelled switch in a bordered tile (Public, Highlight, Pay/use, Disable X...)
function SwitchTile({ label, hint, checked, onChange, danger }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#ffffff' }}>
      <Switch checked={checked} onChange={onChange} danger={danger} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>{label}</div>
        {hint && <div style={{ fontSize: '0.66rem', color: '#94a3b8' }}>{hint}</div>}
      </div>
    </div>
  );
}

function NotEnforcedTag({ children = 'Saved only — not enforced yet' }) {
  return (
    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

const EMPTY_DISCOUNT = {
  discountPercent: '',
  discountTerms: '',
  discountStartsAt: '',
  discountEndsAt: '',
  discountTimezone: 'UTC',
  discountIsActive: false,
  applyDiscountMode: 'NONE', // 'NONE' | 'ALL' | 'SELECTED' — UI only, sent as applyDiscountTo
  applyDiscountIds: [],
};

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
    isPublic: true,
    isHighlighted: false,
    payPerUse: false,
    isDefaultPayPerUse: false,
    maxBotAccounts: '',
    maxSubscribers: '',
    maxTeamMembers: '',
    maxMonthlyMessages: '',
    ...EMPTY_DISCOUNT,
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
        isPublic: data.is_public === undefined ? true : Boolean(data.is_public),
        isHighlighted: Boolean(data.is_highlighted),
        payPerUse: Boolean(data.pay_per_use),
        isDefaultPayPerUse: Boolean(data.is_default_pay_per_use),
        discountPercent: data.discount_percent === null || data.discount_percent === undefined ? '' : String(Number(data.discount_percent)),
        discountTerms: data.discount_terms || '',
        discountStartsAt: data.discount_starts_local || '',
        discountEndsAt: data.discount_ends_local || '',
        discountTimezone: data.discount_timezone || 'UTC',
        discountIsActive: Boolean(data.discount_is_active),
        applyDiscountMode: 'NONE',
        applyDiscountIds: [],
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
      isPublic: true,
      isHighlighted: false,
      payPerUse: false,
      isDefaultPayPerUse: false,
      maxBotAccounts: '5',
      maxSubscribers: '5000',
      maxTeamMembers: '3',
      maxMonthlyMessages: '',
      ...EMPTY_DISCOUNT,
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
      if (form.applyDiscountMode === 'SELECTED' && !form.applyDiscountIds.length) {
        showToast('Pick the packages to copy the discount to', 'error');
        setSaving(false);
        return;
      }
      const { applyDiscountMode, applyDiscountIds, ...fields } = form;
      const payload = {
        ...fields,
        applyDiscountTo: applyDiscountMode === 'ALL' ? 'ALL' : applyDiscountMode === 'SELECTED' ? applyDiscountIds : null,
        price: Number(form.price) || 0,
        maxBotAccounts: form.maxBotAccounts === '' ? null : Number(form.maxBotAccounts),
        maxSubscribers: form.maxSubscribers === '' ? null : Number(form.maxSubscribers),
        maxTeamMembers: form.maxTeamMembers === '' ? null : Number(form.maxTeamMembers),
        maxMonthlyMessages: form.maxMonthlyMessages === '' ? null : Number(form.maxMonthlyMessages),
      };

      if (form.id) {
        const res = await packageAPI.update(form.id, payload);
        showToast(res.data?.message || `Package "${form.name}" updated successfully!`);
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

  const getModule = (key) => form.modules.find((m) => m.key === key) || { key, isEnabled: false, limits: {} };

  const setModule = (key, patch) => {
    setForm((prev) => {
      const exists = prev.modules.some((m) => m.key === key);
      const modules = exists
        ? prev.modules.map((m) => (m.key === key ? { ...m, ...patch } : m))
        : [...prev.modules, { key, isEnabled: false, limits: {}, ...patch }];
      return { ...prev, modules };
    });
  };

  const toggleModule = (key) => setModule(key, { isEnabled: !getModule(key).isEnabled });

  const setModuleLimit = (key, field, val) =>
    setModule(key, { limits: { ...getModule(key).limits, [field]: val === '' ? null : Number(val) } });

  // A row's limit lives either on the packages row (packageField) or in the
  // module's limits_json (field) — see packageFeatureConfig.js.
  const getRowLimit = (row) =>
    row.limit.packageField ? form[row.limit.packageField] : (getModule(row.module).limits?.[row.limit.field] ?? '');

  const setRowLimit = (row, val) =>
    row.limit.packageField
      ? setForm((prev) => ({ ...prev, [row.limit.packageField]: val }))
      : setModuleLimit(row.module, row.limit.field, val);

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

  const registryKeys = new Set(modulesRegistry.map((m) => m.key));
  const featureRows = PACKAGE_FEATURE_ROWS.filter((r) => registryKeys.has(r.module));
  const channelBlocks = PACKAGE_CHANNEL_BLOCKS.filter((c) => registryKeys.has(c.module));
  const otherModules = modulesRegistry.filter((m) => !PLACED_MODULES.has(m.key));
  const resellerOn = getModule(RESELLER_MODULE).isEnabled;
  const otherPackages = packages.filter((p) => p.id !== form.id);

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
              <Package size={20} color="#334155" />
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Packages
              </h2>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '3px 0 0 0' }}>
              Configure pricing, quotas, and which features each package includes.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => loadData(selectedPkgId)}
              disabled={loading}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#ffffff', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 600 }}
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <button
              type="button"
              onClick={handleCreateNewPackage}
              style={{ padding: '8px 16px', borderRadius: 8, background: '#0f172a', color: '#ffffff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 700 }}
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
                    borderRadius: 6,
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    border: '1px solid',
                    borderColor: filterType === f.id ? '#0f172a' : '#e2e8f0',
                    cursor: 'pointer',
                    background: filterType === f.id ? '#0f172a' : '#ffffff',
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
                        borderRadius: 8,
                        border: isSelected ? '1px solid #0f172a' : '1px solid #e2e8f0',
                        background: isSelected ? '#f8fafc' : '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#f1f5f9', color: '#475569' }}>
                              {pkg.type}
                            </span>
                            {pkg.is_default === 1 && (
                              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b' }}>
                                Default
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a' }}>
                            {pkg.name}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                            {pkg.price > 0 ? `$${pkg.price}` : 'Free'}
                          </span>
                          <span style={{ fontSize: '0.68rem', color: '#94a3b8', display: 'block' }}>
                            /{pkg.billing_cycle}
                          </span>
                        </div>
                      </div>

                      {/* Quick Limits Tags */}
                      <div style={{ display: 'flex', gap: 10, fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>
                        <span>{pkg.max_bot_accounts === null ? '∞' : pkg.max_bot_accounts} bots</span>
                        <span>{pkg.max_subscribers === null ? '∞' : Number(pkg.max_subscribers).toLocaleString()} subs</span>
                        <span>{pkg.max_team_members === null ? '∞' : pkg.max_team_members} seats</span>
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
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#f1f5f9', color: '#475569' }}>
                    {form.type}
                  </span>
                  <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                    {form.id ? `#${form.id}` : 'Draft'}
                  </span>
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  {form.name || 'Untitled Package'}
                </h3>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {form.id && (
                  <>
                    <button
                      type="button"
                      onClick={handleOpenAssignModal}
                      style={{ padding: '7px 12px', borderRadius: 8, background: '#ffffff', border: '1px solid #e2e8f0', fontSize: '0.78rem', fontWeight: 600, color: '#334155', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <Users size={13} /> Assign to Agency
                    </button>

                    <button
                      type="button"
                      onClick={() => handleClone(form.id)}
                      title="Clone Package"
                      style={{ padding: '7px 10px', borderRadius: 8, background: '#ffffff', border: '1px solid #e2e8f0', fontSize: '0.78rem', color: '#64748b', cursor: 'pointer' }}
                    >
                      <Copy size={13} /> Clone
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(form.id, form.isDefault)}
                      title="Delete Package"
                      style={{ padding: '7px 10px', borderRadius: 8, background: '#ffffff', border: '1px solid #e2e8f0', fontSize: '0.78rem', color: '#b91c1c', cursor: 'pointer' }}
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
                    background: '#0f172a',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: saving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Save size={14} />
                  {saving ? 'Saving...' : 'Save Package'}
                </button>
              </div>
            </div>

            {/* ── Section 1: Information ── */}
            <div style={sectionStyle}>
              <h4 style={sectionTitleStyle}>
                <Sliders size={15} color="#64748b" /> Information
              </h4>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Package Name *</label>
                  <input
                    type="text"
                    required
                    className="form-input w-full"
                    placeholder="e.g. Premium 500 Yearly"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Package Type *</label>
                  <select className="form-input w-full" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                    <option value="AGENCY">Agency Package</option>
                    <option value="END_USER">Premium End-User</option>
                    <option value="TEAM_MEMBER">Team Member</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Price (USD) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="form-input w-full"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Validity *</label>
                  <select className="form-input w-full" value={form.billingCycle} onChange={(e) => setForm({ ...form, billingCycle: e.target.value })}>
                    <option value="monthly">1 Month</option>
                    <option value="quarterly">3 Months</option>
                    <option value="yearly">1 Year</option>
                    <option value="lifetime">Lifetime</option>
                    <option value="free">Free</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                <SwitchTile
                  label="Public"
                  hint="Listed on the pricing page and buyable"
                  checked={form.isPublic}
                  onChange={() => setForm({ ...form, isPublic: !form.isPublic })}
                />
                <SwitchTile
                  label="Highlight"
                  hint="Pre-selected with a Recommended tag"
                  checked={form.isHighlighted}
                  onChange={() => setForm({ ...form, isHighlighted: !form.isHighlighted })}
                />
                <SwitchTile
                  label="Default billing package"
                  hint={`Given to new ${form.type} signups`}
                  checked={form.isDefault}
                  onChange={() => setForm({ ...form, isDefault: !form.isDefault })}
                />
                <SwitchTile
                  label="Pay / use"
                  hint={<NotEnforcedTag>Saved only — pay-per-use billing not built</NotEnforcedTag>}
                  checked={form.payPerUse}
                  onChange={() => setForm({ ...form, payPerUse: !form.payPerUse })}
                />
                <SwitchTile
                  label="Default pay / use"
                  hint={<NotEnforcedTag>Saved only</NotEnforcedTag>}
                  checked={form.isDefaultPayPerUse}
                  onChange={() => setForm({ ...form, isDefaultPayPerUse: !form.isDefaultPayPerUse })}
                />
              </div>
            </div>

            {/* ── Section 2: Reseller (Agency) ── */}
            {registryKeys.has(RESELLER_MODULE) && (
              <div style={sectionStyle}>
                <h4 style={sectionTitleStyle}>
                  <Building2 size={15} color="#64748b" /> Reseller (Agency)
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, alignItems: 'end' }}>
                  <SwitchTile
                    label="Agency"
                    hint="Can create and charge its own users"
                    checked={resellerOn}
                    onChange={() => toggleModule(RESELLER_MODULE)}
                  />
                  {resellerOn && registryKeys.has(WHITELABEL_MODULE) && (
                    <SwitchTile
                      label="Whitelabel"
                      hint={<NotEnforcedTag>Saved only</NotEnforcedTag>}
                      checked={getModule(WHITELABEL_MODULE).isEnabled}
                      onChange={() => toggleModule(WHITELABEL_MODULE)}
                    />
                  )}
                  {resellerOn && (
                    <div>
                      <label style={labelStyle}>User limit (blank = unlimited)</label>
                      <input
                        type="number"
                        min="0"
                        className="form-input w-full"
                        placeholder="Unlimited"
                        value={getModule(RESELLER_MODULE).limits?.maxResellerCustomers ?? ''}
                        onChange={(e) => setModuleLimit(RESELLER_MODULE, 'maxResellerCustomers', e.target.value)}
                      />
                    </div>
                  )}
                  {resellerOn && (
                    <div>
                      <label style={{ ...labelStyle, display: 'flex', gap: 6, alignItems: 'center' }}>
                        Subscriber limit <NotEnforcedTag>Saved only</NotEnforcedTag>
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="form-input w-full"
                        placeholder="Unlimited"
                        value={getModule(RESELLER_MODULE).limits?.maxResellerSubscribers ?? ''}
                        onChange={(e) => setModuleLimit(RESELLER_MODULE, 'maxResellerSubscribers', e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Section 3: Channels ── */}
            {channelBlocks.length > 0 && (
              <div style={sectionStyle}>
                <h4 style={sectionTitleStyle}>
                  <Radio size={15} color="#64748b" /> Channels
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                  {channelBlocks.map((c) => (
                    <SwitchTile
                      key={c.module}
                      label={c.label}
                      danger
                      checked={!getModule(c.module).isEnabled}
                      onChange={() => toggleModule(c.module)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ── Section 4: Features & limits ── */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Layers size={16} color="#64748b" /> Features & Limits
                  </h4>
                  <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '2px 0 0 0' }}>
                    Blank limit = unlimited. Disabled features are blocked by the API where marked as enforced.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, modules: prev.modules.map((m) => ({ ...m, isEnabled: true })) }))}
                    style={{ padding: '4px 10px', borderRadius: 6, background: '#ffffff', border: '1px solid #e2e8f0', color: '#475569', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Enable All
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, modules: prev.modules.map((m) => ({ ...m, isEnabled: false })) }))}
                    style={{ padding: '4px 10px', borderRadius: 6, background: '#ffffff', border: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Disable All
                  </button>
                </div>
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                {[...featureRows, ...otherModules.map((m) => ({ module: m.key, label: m.display_name, enforced: null }))].map((row, idx) => {
                  const mod = getModule(row.module);
                  const enforced = row.enforced;
                  return (
                    <div
                      key={row.module}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                        padding: '9px 14px',
                        background: idx % 2 ? '#fcfcfd' : '#ffffff',
                        borderTop: idx ? '1px solid #f1f5f9' : 'none',
                      }}
                    >
                      <Switch checked={mod.isEnabled} onChange={() => toggleModule(row.module)} />
                      <div style={{ flex: '1 1 220px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: mod.isEnabled ? '#0f172a' : '#94a3b8' }}>{row.label}</span>
                        {enforced && !enforced.toggle && !(row.limit && enforced.limit) && <NotEnforcedTag />}
                      </div>
                      {row.limit && mod.isEnabled && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {enforced && !enforced.limit && enforced.toggle && <NotEnforcedTag>Limit not enforced yet</NotEnforcedTag>}
                          <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', background: '#ffffff' }}>
                            <span style={{ padding: '0 8px', display: 'flex', alignItems: 'center', fontSize: '0.7rem', color: '#64748b', background: '#f8fafc', borderRight: '1px solid #e2e8f0' }}>
                              Limit
                            </span>
                            <input
                              type="number"
                              min="0"
                              placeholder="Unlimited"
                              value={getRowLimit(row) ?? ''}
                              onChange={(e) => setRowLimit(row, e.target.value)}
                              style={{ width: 100, height: 30, border: 'none', outline: 'none', padding: '0 8px', fontSize: '0.76rem' }}
                            />
                            <span style={{ padding: '0 8px', display: 'flex', alignItems: 'center', fontSize: '0.7rem', color: '#64748b', background: '#f8fafc', borderLeft: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                              {row.limit.period}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Section 5: Discount ── */}
            <div style={sectionStyle}>
              <h4 style={{ ...sectionTitleStyle, flexWrap: 'wrap' }}>
                <Percent size={15} color="#64748b" /> Discount
                <NotEnforcedTag>Saved only — not applied at checkout yet</NotEnforcedTag>
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Discount %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    className="form-input w-full"
                    placeholder="e.g. 20"
                    value={form.discountPercent}
                    onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Discount terms</label>
                  <input
                    type="text"
                    maxLength={255}
                    className="form-input w-full"
                    placeholder="e.g. New customers only"
                    value={form.discountTerms}
                    onChange={(e) => setForm({ ...form, discountTerms: e.target.value })}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Discount start</label>
                  <input
                    type="datetime-local"
                    className="form-input w-full"
                    value={form.discountStartsAt}
                    onChange={(e) => setForm({ ...form, discountStartsAt: e.target.value })}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Discount end</label>
                  <input
                    type="datetime-local"
                    className="form-input w-full"
                    value={form.discountEndsAt}
                    min={form.discountStartsAt || undefined}
                    onChange={(e) => setForm({ ...form, discountEndsAt: e.target.value })}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Discount timezone</label>
                  <select className="form-input w-full" value={form.discountTimezone} onChange={(e) => setForm({ ...form, discountTimezone: e.target.value })}>
                    {(TIMEZONES.includes(form.discountTimezone) ? TIMEZONES : [form.discountTimezone, ...TIMEZONES]).map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Discount status</label>
                  <SwitchTile
                    label={form.discountIsActive ? 'Active' : 'Inactive'}
                    checked={form.discountIsActive}
                    onChange={() => setForm({ ...form, discountIsActive: !form.discountIsActive })}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Apply to other packages (on save)</label>
                  <select
                    className="form-input w-full"
                    value={form.applyDiscountMode}
                    onChange={(e) => setForm({ ...form, applyDiscountMode: e.target.value, applyDiscountIds: [] })}
                  >
                    <option value="NONE">Do not apply</option>
                    <option value="ALL">All other packages</option>
                    <option value="SELECTED">Selected packages…</option>
                  </select>
                </div>
              </div>

              {form.applyDiscountMode === 'SELECTED' && (
                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                  {otherPackages.map((p) => (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: '#334155', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={form.applyDiscountIds.includes(p.id)}
                        onChange={() =>
                          setForm((prev) => ({
                            ...prev,
                            applyDiscountIds: prev.applyDiscountIds.includes(p.id)
                              ? prev.applyDiscountIds.filter((x) => x !== p.id)
                              : [...prev.applyDiscountIds, p.id],
                          }))
                        }
                      />
                      {p.name}
                    </label>
                  ))}
                </div>
              )}
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
                  background: '#0f172a',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Save size={15} />
                {saving ? 'Saving Changes...' : 'Save Package'}
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
                  <Users size={16} color="#64748b" />
                  <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
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
                    style={{ padding: '8px 18px', borderRadius: 8, background: '#0f172a', color: '#ffffff', border: 'none', fontSize: '0.8rem', fontWeight: 700, cursor: assigning ? 'not-allowed' : 'pointer' }}
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
