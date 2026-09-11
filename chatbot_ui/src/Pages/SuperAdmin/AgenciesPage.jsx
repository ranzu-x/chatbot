import { useState, useEffect, useMemo } from 'react';
import AppLayout from '../../Layout/AppLayout';
import DataTable from '../../Components/Common/DataTable';
import { adminAPI, packageAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import { Building2, Plus, Globe, Trash2, Pencil, Users, UserCog, ArrowLeft, Shield } from 'lucide-react';

const EMPTY_FORM = { name: '', ownerName: '', ownerEmail: '', ownerPassword: '', website: '', isReseller: false, packageId: '' };
const EMPTY_EDIT_FORM = { name: '', website: '', packageId: '', ownerName: '', ownerEmail: '', ownerPassword: '', isActive: true, isReseller: false };

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Super Admin → Agencies. Direct Customers and Resellers used to be two
 * separate pages/menu items even though they're the same `agencies` row
 * shape — a Reseller is just an Agency that's also allowed to create its
 * own sub-customers under a shared plan (see routes/admin.js). Merged into
 * one list: "Reseller" is a capability badge/toggle here, not a separate
 * page — create or edit any agency and check "Reseller" to grant it.
 */
export default function AgenciesPage() {
  const [agencies, setAgencies] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editingAgency, setEditingAgency] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [viewingCustomersOf, setViewingCustomersOf] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  const loadAgencies = async () => {
    setLoading(true);
    try {
      const [aRes, pRes] = await Promise.all([
        adminAPI.getAgencies(),
        packageAPI.getAll().catch(() => ({ data: { packages: [] } })),
      ]);
      setAgencies(aRes.data.agencies || aRes.data || []);
      setPackages(pRes.data?.packages || pRes.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAgencies(); }, []);

  const openModal = () => { setForm(EMPTY_FORM); setFormError(''); setShowModal(true); };
  const closeModal = () => setShowModal(false);
  const handleChange = (e) => {
    const { name, type, value, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      await adminAPI.createAgency({ ...form, packageId: form.isReseller ? (form.packageId || null) : null });
      await loadAgencies();
      closeModal();
    } catch (err) {
      setFormError(err?.response?.data?.message || 'Failed to create agency.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (agency, e) => {
    if (e) e.stopPropagation();
    try {
      await adminAPI.toggleAgency(agency.id);
      setAgencies((prev) => prev.map((a) => (a.id === agency.id ? { ...a, is_active: a.is_active ? 0 : 1 } : a)));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (agency, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(`Delete "${agency.name}"? This cannot be undone.`)) return;
    try {
      await adminAPI.deleteAgency(agency.id);
      setAgencies((prev) => prev.filter((a) => a.id !== agency.id));
    } catch (err) {
      notify.error(err?.response?.data?.message || 'Failed to delete reseller');
    }
  };

  // Full edit — name/website/plan/active state/reseller capability, plus the
  // owner's own login (name/email/password), so a Super Admin can fix an
  // agency's account without needing its owner's cooperation. Password is
  // left blank by default and only sent (and only then changed) if the
  // admin types a new one.
  const openEditModal = (agency, e) => {
    if (e) e.stopPropagation();
    setEditingAgency(agency);
    setEditForm({
      name: agency.name || '',
      website: agency.website || '',
      packageId: agency.package_id || '',
      ownerName: agency.ownerName || '',
      ownerEmail: agency.ownerEmail || '',
      ownerPassword: '',
      isActive: Boolean(agency.is_active),
      isReseller: agency.account_type === 'RESELLER',
    });
    setEditError('');
  };
  const handleEditChange = (e) => {
    const { name, type, value, checked } = e.target;
    setEditForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    setEditError('');
    setEditSaving(true);
    const payload = {
      name: editForm.name,
      website: editForm.website,
      packageId: editForm.isReseller ? (editForm.packageId || null) : null,
      ownerName: editForm.ownerName,
      ownerEmail: editForm.ownerEmail,
      isActive: editForm.isActive,
      isReseller: editForm.isReseller,
    };
    if (editForm.ownerPassword.trim()) payload.ownerPassword = editForm.ownerPassword.trim();
    try {
      await adminAPI.updateAgency(editingAgency.id, payload);
      notify.success('Reseller updated');
      setEditingAgency(null);
      loadAgencies();
    } catch (err) {
      setEditError(err?.response?.data?.message || 'Failed to update agency');
    } finally {
      setEditSaving(false);
    }
  };

  const viewCustomers = (agency, e) => {
    if (e) e.stopPropagation();
    setViewingCustomersOf(agency);
    setLoadingCustomers(true);
    adminAPI.getAgencyCustomers(agency.id)
      .then((res) => setCustomers(res.data?.customers || []))
      .catch(() => notify.error('Failed to load customers'))
      .finally(() => setLoadingCustomers(false));
  };

  const filtered = useMemo(() => {
    return agencies.filter((a) => {
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (a.name && a.name.toLowerCase().includes(q)) ||
        (a.ownerName && a.ownerName.toLowerCase().includes(q)) ||
        (a.ownerEmail && a.ownerEmail.toLowerCase().includes(q));

      const isActive = a.is_active !== undefined ? Boolean(a.is_active) : a.isActive !== false;
      const matchesStatus =
        !statusFilter ||
        (statusFilter === 'active' && isActive) ||
        (statusFilter === 'inactive' && !isActive);

      const matchesType = !typeFilter || a.account_type === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [agencies, search, statusFilter, typeFilter]);

  if (viewingCustomersOf) {
    const customerColumns = [
      {
        key: 'name',
        label: 'CUSTOMER',
        render: (row) => (
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{row.name}</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{row.ownerName} · {row.ownerEmail}</div>
          </div>
        ),
      },
      {
        key: 'plan',
        label: 'PLAN',
        render: (row) => (
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {row.agencyPackageName || 'Unassigned (reseller pool applies)'}
          </span>
        ),
      },
      {
        key: 'status',
        label: 'STATUS',
        render: (row) => (
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: row.is_active ? '#10b981' : '#ef4444' }}>
            {row.is_active ? 'Active' : 'Inactive'}
          </span>
        ),
      },
      {
        key: 'created',
        label: 'CREATED',
        render: (row) => <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{formatDate(row.created_at)}</span>,
      },
    ];

    return (
      <AppLayout>
        <button className="btn btn-secondary btn-sm" onClick={() => setViewingCustomersOf(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
          <ArrowLeft size={13} /> Back to Resellers
        </button>
        <DataTable
          title={`${viewingCustomersOf.name}'s Customers`}
          subtitle="These customers belong to this reseller — they never appear anywhere else."
          columns={customerColumns}
          data={customers}
          loading={loadingCustomers}
          selectable={false}
          emptyIcon={<Users size={40} color="#94a3b8" />}
          emptyTitle="No customers yet"
          emptySubtitle="This reseller hasn't created any customers."
          idKey="id"
        />
      </AppLayout>
    );
  }

  const columns = [
    {
      key: 'name',
      label: 'RESELLER NAME',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'rgba(99, 102, 241, 0.1)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
            }}
          >
            <Building2 size={18} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.86rem' }}>{row.name}</span>
              {row.account_type === 'RESELLER' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.66rem', fontWeight: 800, color: '#7c3aed', background: 'rgba(124,58,237,0.1)', padding: '1px 6px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  <Shield size={9} /> Reseller
                </span>
              )}
            </div>
            {row.website && (
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Globe size={11} /> {row.website}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'owner',
      label: 'OWNER & EMAIL',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>{row.owner?.name || row.ownerName || '—'}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.owner?.email || row.ownerEmail}</div>
        </div>
      ),
    },
    {
      key: 'plan',
      label: 'PLAN',
      render: (row) => <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{row.packageName || (row.account_type === 'RESELLER' ? 'Unassigned' : '—')}</span>,
    },
    {
      key: 'users',
      label: 'USERS',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          <UserCog size={13} color="var(--text-muted)" /> {row.userCount || 0}
        </div>
      ),
    },
    {
      key: 'subscribers',
      label: 'SUBSCRIBERS',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          <Users size={13} color="var(--text-muted)" /> {row.subscriberCount || 0}
        </div>
      ),
    },
    {
      key: 'customers',
      label: 'CUSTOMERS',
      render: (row) => (
        row.account_type === 'RESELLER' ? (
          <button className="bs-action-btn" style={{ width: 'auto', padding: '0 10px', height: 26, fontSize: '0.78rem', fontWeight: 600 }} onClick={(e) => viewCustomers(row, e)}>
            {row.customerCount || 0} customer{row.customerCount === 1 ? '' : 's'}
          </button>
        ) : (
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>—</span>
        )
      ),
    },
    {
      key: 'status',
      label: 'STATUS',
      render: (row) => {
        const active = row.is_active !== undefined ? Boolean(row.is_active) : row.isActive !== false;
        return (
          <label className="bs-toggle-switch" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={active} onChange={(e) => handleToggle(row, e)} />
            <span className="bs-toggle-slider" />
          </label>
        );
      },
    },
    {
      key: 'created',
      label: 'CREATED DATE',
      render: (row) => (
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
          {formatDate(row.createdAt || row.created_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'ACTIONS',
      render: (row) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="bs-action-btn" title="Edit Reseller" onClick={(e) => openEditModal(row, e)}>
            <Pencil size={13} />
          </button>
          <button className="bs-action-btn delete" title="Delete Reseller" onClick={(e) => handleDelete(row, e)}>
            <Trash2 size={13} color="#ef4444" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <DataTable
        title="Resellers"
        subtitle="All resellers — check the Reseller box on any of them to let it create and manage its own customers under a shared plan."
        actions={
          <button
            onClick={openModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: '0.84rem',
              fontWeight: 600,
              background: 'var(--primary)',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(99, 102, 241, 0.25)',
            }}
          >
            <Plus size={15} /> Add Reseller
          </button>
        }
        filters={[
          {
            key: 'status',
            placeholder: 'Status',
            options: [
              { label: 'Active', value: 'active' },
              { label: 'Inactive', value: 'inactive' },
            ],
            value: statusFilter,
            onChange: setStatusFilter,
          },
          {
            key: 'type',
            placeholder: 'Type',
            options: [
              { label: 'Direct Customer', value: 'DIRECT_CUSTOMER' },
              { label: 'Reseller', value: 'RESELLER' },
            ],
            value: typeFilter,
            onChange: setTypeFilter,
          },
        ]}
        search={search}
        onSearch={setSearch}
        columns={columns}
        data={filtered}
        loading={loading}
        onRefresh={loadAgencies}
        selectedIds={selectedIds}
        onToggleSelectAll={() => {
          if (selectedIds.size === filtered.length) setSelectedIds(new Set());
          else setSelectedIds(new Set(filtered.map((a) => a.id)));
        }}
        onToggleSelectOne={(id) => {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
          });
        }}
        idKey="id"
      />

      {/* Add Reseller Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 460, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-card)', borderRadius: 14, padding: 24, boxShadow: 'var(--shadow-md)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>Add New Reseller</h3>
              <button onClick={closeModal} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--bg-hover)', cursor: 'pointer' }}>✕</button>
            </div>

            {formError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem', marginBottom: 12 }}>{formError}</div>
            )}

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Reseller Name *</label>
                <input name="name" required className="form-input w-full" placeholder="e.g. Apex Marketing Group" value={form.name} onChange={handleChange} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Owner Full Name *</label>
                <input name="ownerName" required className="form-input w-full" placeholder="e.g. Alex Rivera" value={form.ownerName} onChange={handleChange} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Owner Email *</label>
                <input name="ownerEmail" type="email" required className="form-input w-full" placeholder="owner@reseller.com" value={form.ownerEmail} onChange={handleChange} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Owner Initial Password *</label>
                <input name="ownerPassword" type="password" required className="form-input w-full" placeholder="••••••••" value={form.ownerPassword} onChange={handleChange} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Website URL (Optional)</label>
                <input name="website" className="form-input w-full" placeholder="https://reseller.com" value={form.website} onChange={handleChange} />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600, background: 'rgba(124,58,237,0.06)', padding: '10px 12px', borderRadius: 8 }}>
                <input type="checkbox" name="isReseller" checked={form.isReseller} onChange={handleChange} />
                <Shield size={13} color="#7c3aed" /> Make this a Reseller (can create its own customers under a shared plan)
              </label>

              {form.isReseller && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>Reseller plan (defines their shared usage pool)</label>
                  <select name="packageId" className="form-input w-full" value={form.packageId} onChange={handleChange}>
                    <option value="">— Unassigned —</option>
                    {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button type="button" onClick={closeModal} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
                <button type="submit" disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, background: 'var(--primary)', color: '#ffffff', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 }}>
                  {saving ? 'Creating…' : 'Create Reseller'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Reseller Modal */}
      {editingAgency && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 460, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto', background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 0 }}>Edit Reseller</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -8, marginBottom: 14 }}>{editingAgency.name}</p>
            {editError && <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 10 }}>{editError}</div>}
            <form onSubmit={handleEditSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Reseller name</label>
                <input name="name" required className="form-input w-full" value={editForm.name} onChange={handleEditChange} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Website</label>
                <input name="website" className="form-input w-full" value={editForm.website} onChange={handleEditChange} placeholder="https://…" />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600, background: 'rgba(124,58,237,0.06)', padding: '10px 12px', borderRadius: 8 }}>
                <input
                  type="checkbox"
                  name="isReseller"
                  checked={editForm.isReseller}
                  onChange={handleEditChange}
                  disabled={editingAgency.account_type === 'RESELLER' && editingAgency.customerCount > 0}
                />
                <Shield size={13} color="#7c3aed" /> Reseller (can create its own customers under a shared plan)
              </label>
              {editingAgency.account_type === 'RESELLER' && editingAgency.customerCount > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -6 }}>
                  Can't remove — this reseller still has {editingAgency.customerCount} customer{editingAgency.customerCount === 1 ? '' : 's'}.
                </div>
              )}

              {editForm.isReseller && (
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Plan (shared usage pool)</label>
                  <select name="packageId" className="form-input w-full" value={editForm.packageId} onChange={handleEditChange}>
                    <option value="">— Unassigned —</option>
                    {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 2 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
                  Owner Login
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Owner full name</label>
                    <input name="ownerName" required className="form-input w-full" value={editForm.ownerName} onChange={handleEditChange} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Owner email</label>
                    <input name="ownerEmail" type="email" required className="form-input w-full" value={editForm.ownerEmail} onChange={handleEditChange} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>New password</label>
                    <input name="ownerPassword" type="password" className="form-input w-full" value={editForm.ownerPassword} onChange={handleEditChange} placeholder="Leave blank to keep current password" autoComplete="new-password" />
                  </div>
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 600 }}>
                <input type="checkbox" name="isActive" checked={editForm.isActive} onChange={handleEditChange} />
                Active
              </label>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingAgency(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={editSaving}>{editSaving ? 'Saving…' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
