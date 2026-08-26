import { useState, useEffect, useMemo } from 'react';
import AppLayout from '../../Layout/AppLayout';
import DataTable from '../../Components/Common/DataTable';
import { agencyAPI } from '../../services/api';
import { UserCheck, Plus, Trash2, Mail, Shield, CheckCircle2 } from 'lucide-react';

const EMPTY_FORM = { name: '', email: '', password: '' };

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function getInitials(name = '') {
  return name.trim().split(/\s+/).map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

export default function AgentsPage() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());

  const loadAgents = async () => {
    setLoading(true);
    try {
      const res = await agencyAPI.getAgents();
      setAgents(res.data.agents || res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
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
      await agencyAPI.createAgent(form);
      await loadAgents();
      closeModal();
    } catch (err) {
      setFormError(err?.response?.data?.message || 'Failed to create agent.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (agent, e) => {
    if (e) e.stopPropagation();
    const userId = agent.userId || agent._id || agent.id;
    if (!window.confirm(`Delete agent "${agent.name}"?`)) return;
    try {
      await agencyAPI.deleteAgent(userId);
      setAgents((prev) => prev.filter((a) => (a.userId || a._id || a.id) !== userId));
    } catch (err) {
      console.error(err);
    }
  };

  const filtered = useMemo(() => {
    return agents.filter((a) => {
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (a.name && a.name.toLowerCase().includes(q)) ||
        (a.email && a.email.toLowerCase().includes(q));

      const isActive = a.isActive !== false;
      const matchesStatus =
        !statusFilter ||
        (statusFilter === 'active' && isActive) ||
        (statusFilter === 'inactive' && !isActive);

      return matchesSearch && matchesStatus;
    });
  }, [agents, search, statusFilter]);

  const columns = [
    {
      key: 'name',
      label: 'AGENT NAME',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: '#e0e7ff',
              color: '#4f46e5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.85rem',
            }}
          >
            {getInitials(row.name)}
          </div>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.86rem' }}>{row.name}</div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>ID: {row.userId || row.id}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      label: 'EMAIL ADDRESS',
      render: (row) => (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{row.email}</div>
      ),
    },
    {
      key: 'status',
      label: 'ACCOUNT STATUS',
      render: (row) => {
        const active = row.isActive !== false;
        return (
          <span style={{ fontSize: '0.74rem', fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: active ? 'rgba(16,185,129,0.1)' : 'rgba(100,116,139,0.1)', color: active ? '#10b981' : '#64748b' }}>
            ● {active ? 'Active' : 'Inactive'}
          </span>
        );
      },
    },
    {
      key: 'online',
      label: 'ONLINE AVAILABILITY',
      render: (row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.isOnline ? '#10b981' : '#94a3b8' }} />
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            {row.isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      ),
    },
    {
      key: 'created',
      label: 'JOINED DATE',
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
            title="Delete Agent"
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
        title="Support Agents"
        subtitle="Manage assigned support team members and live chat inbox agents"
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
            <Plus size={15} /> Add Agent
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
        onRefresh={loadAgents}
        selectedIds={selectedIds}
        onToggleSelectAll={() => {
          if (selectedIds.size === filtered.length) setSelectedIds(new Set());
          else setSelectedIds(new Set(filtered.map((a) => a.userId || a._id || a.id)));
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

      {/* Add Agent Modal */}
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
              width: 440,
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
                Add New Agent
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
                  Agent Full Name *
                </label>
                <input
                  name="name"
                  required
                  className="form-input w-full"
                  placeholder="e.g. Sarah Jenkins"
                  value={form.name}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>
                  Agent Login Email *
                </label>
                <input
                  name="email"
                  type="email"
                  required
                  className="form-input w-full"
                  placeholder="sarah@agency.com"
                  value={form.email}
                  onChange={handleChange}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: 5 }}>
                  Password *
                </label>
                <input
                  name="password"
                  type="password"
                  required
                  className="form-input w-full"
                  placeholder="••••••••"
                  value={form.password}
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
                  {saving ? 'Creating…' : 'Create Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
