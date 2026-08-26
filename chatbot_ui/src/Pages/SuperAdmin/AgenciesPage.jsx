import { useState, useEffect, useMemo } from 'react';
import AppLayout from '../../Layout/AppLayout';
import DataTable from '../../Components/Common/DataTable';
import { adminAPI } from '../../services/api';
import { Building2, Plus, Globe, Mail, User, Trash2, CheckCircle2, Shield } from 'lucide-react';

const EMPTY_FORM = {
  name: '',
  ownerName: '',
  ownerEmail: '',
  ownerPassword: '',
  website: '',
};

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function AgenciesPage() {
  const [agencies, setAgencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());

  const loadAgencies = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getAgencies();
      setAgencies(res.data.agencies || res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgencies();
  }, []);

  const openModal = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setShowModal(true);
  };

  const closeModal = () => setShowModal(false);

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      await adminAPI.createAgency(form);
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
    const id = agency._id || agency.id;
    try {
      await adminAPI.toggleAgency(id);
      setAgencies((prev) =>
        prev.map((a) => ((a._id || a.id) === id ? { ...a, is_active: a.is_active ? 0 : 1, isActive: !a.isActive } : a))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (agency, e) => {
    if (e) e.stopPropagation();
    const id = agency._id || agency.id;
    if (!window.confirm(`Delete agency "${agency.name}"? This cannot be undone.`)) return;
    try {
      await adminAPI.deleteAgency(id);
      setAgencies((prev) => prev.filter((a) => (a._id || a.id) !== id));
    } catch (err) {
      console.error(err);
    }
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

      return matchesSearch && matchesStatus;
    });
  }, [agencies, search, statusFilter]);

  const columns = [
    {
      key: 'name',
      label: 'AGENCY NAME',
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
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.86rem' }}>{row.name}</div>
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
      key: 'agents',
      label: 'AGENTS COUNT',
      render: (row) => (
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          {row.agentCount ?? row.agents_count ?? 1} agent(s)
        </span>
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
          <button
            className="bs-action-btn delete"
            title="Delete Agency"
            onClick={(e) => handleDelete(row, e)}
          >
            <Trash2 size={13} color="#ef4444" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <DataTable
        title="Agencies Management"
        subtitle="Manage and monitor all registered tenant agencies and white-label accounts"
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
            <Plus size={15} /> Add Agency
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
          else setSelectedIds(new Set(filtered.map((a) => a._id || a.id)));
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

      {/* Add Agency Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 460,
              maxWidth: '92vw',
              background: 'var(--bg-card)',
              borderRadius: 14,
              padding: 24,
              boxShadow: 'var(--shadow-md)',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                Add New Agency
              </h3>
              <button
                onClick={closeModal}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-hover)',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {formError && (
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', padding: '8px 12px', borderRadius: 8, fontSize: '0.82rem', marginBottom: 12 }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>
                  Agency Name *
                </label>
                <input
                  name="name"
                  required
                  className="form-input w-full"
                  placeholder="e.g. Apex Marketing Agency"
                  value={form.name}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>
                  Owner Full Name *
                </label>
                <input
                  name="ownerName"
                  required
                  className="form-input w-full"
                  placeholder="e.g. Alex Rivera"
                  value={form.ownerName}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>
                  Owner Email *
                </label>
                <input
                  name="ownerEmail"
                  type="email"
                  required
                  className="form-input w-full"
                  placeholder="owner@agency.com"
                  value={form.ownerEmail}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>
                  Owner Initial Password *
                </label>
                <input
                  name="ownerPassword"
                  type="password"
                  required
                  className="form-input w-full"
                  placeholder="••••••••"
                  value={form.ownerPassword}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>
                  Website URL (Optional)
                </label>
                <input
                  name="website"
                  className="form-input w-full"
                  placeholder="https://agency.com"
                  value={form.website}
                  onChange={handleChange}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-card)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '8px 20px',
                    borderRadius: 8,
                    background: 'var(--primary)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                  }}
                >
                  {saving ? 'Creating…' : 'Create Agency'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
