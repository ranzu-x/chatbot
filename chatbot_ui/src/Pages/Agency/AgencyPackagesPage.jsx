import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { agencyPackageAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import { Package, Plus, Trash2, Pencil, Star } from 'lucide-react';

const EMPTY_FORM = { name: '', description: '', price: 0, billingCycle: 'monthly', maxBotAccounts: '', maxSubscribers: '', maxTeamMembers: '', maxMonthlyMessages: '', isDefault: false, isActive: true };

/**
 * Every agency's own "Packages & Modules" — the plans IT defines and sells
 * to its own end customers (as opposed to /agency's Billing tab under My
 * Account, which shows the plan the Super Admin assigned to this agency
 * itself). Used to be reseller-only (`/reseller/packages`, backend gated to
 * account_type='RESELLER') — opened up to every agency since "Reseller" is
 * now just a capability flag, not a separate privilege tier (see
 * chatbot_api/routes/agencyPackages.js /
 * chatbot_api/migrate_agency_packages_permission.js). Mirrors the Super
 * Admin's own Packages & Modules page (chatbot_ui/src/Pages/SuperAdmin/PackagesPage.jsx)
 * in spirit — create, edit, and list — scoped to this agency's own plans.
 */
export default function AgencyPackagesPage() {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    agencyPackageAPI.getAll()
      .then((res) => setPackages(res.data?.packages || []))
      .catch(() => notify.error('Failed to load plans'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreateModal = () => { setEditingId(null); setForm(EMPTY_FORM); setShowModal(true); };
  const openEditModal = (p) => {
    setEditingId(p.id);
    setForm({
      name: p.name || '',
      description: p.description || '',
      price: p.price ?? 0,
      billingCycle: p.billing_cycle || 'monthly',
      maxBotAccounts: p.max_bot_accounts ?? '',
      maxSubscribers: p.max_subscribers ?? '',
      maxTeamMembers: p.max_team_members ?? '',
      maxMonthlyMessages: p.max_monthly_messages ?? '',
      isDefault: Boolean(p.is_default),
      isActive: p.is_active === undefined ? true : Boolean(p.is_active),
    });
    setShowModal(true);
  };
  const handleChange = (e) => {
    const { name, type, value, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const toNullableInt = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

  const handleSave = (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      price: Number(form.price) || 0,
      maxBotAccounts: toNullableInt(form.maxBotAccounts),
      maxSubscribers: toNullableInt(form.maxSubscribers),
      maxTeamMembers: toNullableInt(form.maxTeamMembers),
      maxMonthlyMessages: toNullableInt(form.maxMonthlyMessages),
    };
    const req = editingId ? agencyPackageAPI.update(editingId, payload) : agencyPackageAPI.create(payload);
    req
      .then(() => { notify.success(editingId ? 'Plan updated' : 'Plan created'); setShowModal(false); load(); })
      .catch((err) => notify.error(err?.response?.data?.message || 'Failed to save plan'))
      .finally(() => setSaving(false));
  };

  const handleDelete = (pkg) => {
    if (!window.confirm(`Delete plan "${pkg.name}"?`)) return;
    agencyPackageAPI.delete(pkg.id)
      .then(() => { notify.success('Deleted'); load(); })
      .catch((err) => notify.error(err?.response?.data?.message || 'Failed to delete'));
  };

  const handleToggleActive = (pkg) => {
    agencyPackageAPI.update(pkg.id, { isActive: !pkg.is_active })
      .then(() => setPackages((prev) => prev.map((p) => (p.id === pkg.id ? { ...p, is_active: pkg.is_active ? 0 : 1 } : p))))
      .catch(() => notify.error('Failed to update'));
  };

  const limitLabel = (v) => (v === null || v === undefined ? 'Unlimited' : v);

  return (
    <AppLayout>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">Packages & Modules</h1>
          <p className="page-subtitle">
            The plans you define for your own customers — these are individual per-customer ceilings. Actual
            enforcement also checks your combined real usage across every customer against your own plan's pool.
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openCreateModal} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> New Plan
        </button>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-overlay"><div className="loading-spinner" /></div>
        ) : packages.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            No plans yet — create one to start selling to your own customers.
          </div>
        ) : (
          <div className="grid-3">
            {packages.map((p) => (
              <div key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: p.is_active ? 1 : 0.6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Package size={17} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{p.name}</span>
                        {Boolean(p.is_default) && (
                          <span title="Default plan" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: '0.62rem', fontWeight: 800, color: '#d97706', background: 'rgba(217,119,6,0.1)', padding: '1px 6px', borderRadius: 999 }}>
                            <Star size={9} fill="currentColor" /> Default
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>${Number(p.price).toFixed(2)} / {p.billing_cycle}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="bs-action-btn" onClick={() => openEditModal(p)} title="Edit">
                      <Pencil size={13} />
                    </button>
                    <button className="bs-action-btn delete" onClick={() => handleDelete(p)} title="Delete">
                      <Trash2 size={13} color="#ef4444" />
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <div>Bots: {limitLabel(p.max_bot_accounts)}</div>
                  <div>Subscribers: {limitLabel(p.max_subscribers)}</div>
                  <div>Team: {limitLabel(p.max_team_members)}</div>
                  <div>Msgs/mo: {limitLabel(p.max_monthly_messages)}</div>
                </div>
                <label className="bs-toggle-switch" style={{ alignSelf: 'flex-end' }} title={p.is_active ? 'Active' : 'Inactive'}>
                  <input type="checkbox" checked={Boolean(p.is_active)} onChange={() => handleToggleActive(p)} />
                  <span className="bs-toggle-slider" />
                </label>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 460, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 0 }}>{editingId ? 'Edit Plan' : 'New Plan'}</h3>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Name</label>
                <input name="name" required className="form-input w-full" value={form.name} onChange={handleChange} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Description</label>
                <textarea name="description" rows={2} className="form-input w-full" value={form.description} onChange={handleChange} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Price</label>
                  <input name="price" type="number" min="0" step="0.01" className="form-input w-full" value={form.price} onChange={handleChange} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Billing cycle</label>
                  <select name="billingCycle" className="form-input w-full" value={form.billingCycle} onChange={handleChange}>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                    <option value="lifetime">Lifetime</option>
                    <option value="free">Free</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Max bot accounts</label>
                  <input name="maxBotAccounts" type="number" min="0" className="form-input w-full" placeholder="Unlimited" value={form.maxBotAccounts} onChange={handleChange} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Max subscribers</label>
                  <input name="maxSubscribers" type="number" min="0" className="form-input w-full" placeholder="Unlimited" value={form.maxSubscribers} onChange={handleChange} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Max team members</label>
                  <input name="maxTeamMembers" type="number" min="0" className="form-input w-full" placeholder="Unlimited" value={form.maxTeamMembers} onChange={handleChange} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Max messages/mo</label>
                  <input name="maxMonthlyMessages" type="number" min="0" className="form-input w-full" placeholder="Unlimited" value={form.maxMonthlyMessages} onChange={handleChange} />
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
                <input type="checkbox" name="isDefault" checked={form.isDefault} onChange={handleChange} />
                Set as default plan for new customer signups
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Saving…' : editingId ? 'Save Changes' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
