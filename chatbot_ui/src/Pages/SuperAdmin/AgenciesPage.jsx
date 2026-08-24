import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { adminAPI } from '../../services/api';

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
  const [agencies, setAgencies]   = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState('');

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

  useEffect(() => { loadAgencies(); }, []);

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

  const handleToggle = async (id) => {
    try {
      await adminAPI.toggleAgency(id);
      await loadAgencies();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this agency? This cannot be undone.')) return;
    try {
      await adminAPI.deleteAgency(id);
      setAgencies((prev) => prev.filter((a) => (a._id || a.id) !== id));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="page-title">Agencies</h1>
            <p className="page-subtitle">Manage all registered agencies on the platform</p>
          </div>
          <button className="btn btn-primary" onClick={openModal}>
            + Add Agency
          </button>
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
                  <th>Agency</th>
                  <th>Owner</th>
                  <th>Agents</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {agencies.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
                      No agencies yet. Click "Add Agency" to create one.
                    </td>
                  </tr>
                ) : (
                  agencies.map((a) => {
                    const id = a._id || a.id;
                    const active = a.isActive !== false;
                    return (
                      <tr key={id}>
                        <td>
                          <div className="font-semibold">{a.name}</div>
                          {a.website && (
                            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{a.website}</div>
                          )}
                        </td>
                        <td>
                          <div>{a.owner?.name || a.ownerName || '—'}</div>
                          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{a.owner?.email || a.ownerEmail}</div>
                        </td>
                        <td>{a.agentCount ?? '—'}</td>
                        <td>
                          <span className={`badge ${active ? 'badge-success' : 'badge-danger'}`}>
                            {active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td>{formatDate(a.createdAt)}</td>
                        <td>
                          <div className="flex gap-2">
                            <button
                              className={`btn btn-sm ${active ? 'btn-secondary' : 'btn-success'}`}
                              onClick={() => handleToggle(id)}
                            >
                              {active ? '⏸ Disable' : '▶ Enable'}
                            </button>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => handleDelete(id)}
                            >
                              🗑
                            </button>
                          </div>
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
            <h2 className="modal-title">Add New Agency</h2>

            {formError && <div className="login-error" style={{ marginBottom: 16 }}>{formError}</div>}

            <form onSubmit={handleCreate}>
              <div className="flex-col gap-3" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Agency Name *</label>
                  <input name="name" required className="form-input" placeholder="Acme Corp" value={form.name} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label className="form-label">Owner Name *</label>
                  <input name="ownerName" required className="form-input" placeholder="John Doe" value={form.ownerName} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label className="form-label">Owner Email *</label>
                  <input name="ownerEmail" type="email" required className="form-input" placeholder="owner@example.com" value={form.ownerEmail} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label className="form-label">Owner Password *</label>
                  <input name="ownerPassword" type="password" required className="form-input" placeholder="••••••••" value={form.ownerPassword} onChange={handleChange} />
                </div>
                <div className="form-group">
                  <label className="form-label">Website <span style={{ color: 'var(--text-muted)' }}>(optional)</span></label>
                  <input name="website" className="form-input" placeholder="https://example.com" value={form.website} onChange={handleChange} />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? (
                    <><div className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Creating…</>
                  ) : 'Create Agency'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
