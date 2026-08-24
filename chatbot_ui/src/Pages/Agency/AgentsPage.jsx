import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { agencyAPI } from '../../services/api';

const EMPTY_FORM = { name: '', email: '', password: '' };

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
}

function getInitials(name = '') {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function AgentsPage() {
  const [agents,    setAgents]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState('');

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

  useEffect(() => { loadAgents(); }, []);

  const openModal  = () => { setForm(EMPTY_FORM); setFormError(''); setShowModal(true); };
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

  const handleDelete = async (userId) => {
    if (!window.confirm('Delete this agent?')) return;
    try {
      await agencyAPI.deleteAgent(userId);
      setAgents((prev) => prev.filter((a) => (a.userId || a._id || a.id) !== userId));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Agents</h1>
            <p className="page-subtitle">Manage your support agents</p>
          </div>
          <button className="btn btn-primary" onClick={openModal}>+ Add Agent</button>
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-overlay">
            <div className="loading-spinner" style={{ width: 40, height: 40 }} />
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Online</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {agents.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                      No agents yet. Add your first agent!
                    </td>
                  </tr>
                ) : (
                  agents.map((a) => {
                    const userId = a.userId || a._id || a.id;
                    const isOnline = a.isOnline || false;
                    const isActive = a.isActive !== false;
                    return (
                      <tr key={userId}>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="avatar avatar-sm">{getInitials(a.name)}</div>
                            <span className="font-semibold">{a.name}</span>
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-secondary)' }}>{a.email}</td>
                        <td>
                          <span className={`badge ${isActive ? 'badge-success' : 'badge-danger'}`}>
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
                            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                              {isOnline ? 'Online' : 'Offline'}
                            </span>
                          </div>
                        </td>
                        <td>{formatDate(a.createdAt)}</td>
                        <td>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleDelete(userId)}
                          >
                            🗑 Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal">
            <h2 className="modal-title">Add New Agent</h2>
            {formError && <div className="login-error" style={{ marginBottom: 16 }}>{formError}</div>}
            <form onSubmit={handleCreate}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input name="name" required className="form-input" placeholder="Jane Smith" value={form.name} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input name="email" type="email" required className="form-input" placeholder="agent@example.com" value={form.email} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label className="form-label">Password *</label>
                  <input name="password" type="password" required className="form-input" placeholder="••••••••" value={form.password} onChange={handleChange} />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? (
                    <><div className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Creating…</>
                  ) : 'Create Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
