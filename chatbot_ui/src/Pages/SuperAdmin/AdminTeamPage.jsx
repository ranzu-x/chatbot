import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { adminAPI, roleAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import { Plus, Trash2, ShieldCheck } from 'lucide-react';

const EMPTY_FORM = { name: '', email: '', password: '', roleSlug: '' };

export default function AdminTeamPage() {
  const [team, setTeam] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([adminAPI.getTeam(), roleAPI.getAll()])
      .then(([teamRes, rolesRes]) => {
        setTeam(teamRes.data?.team || []);
        setRoles(rolesRes.data?.roles || []);
      })
      .catch(() => notify.error('Failed to load team'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openModal = () => {
    setForm({ ...EMPTY_FORM, roleSlug: roles.find((r) => r.slug !== 'super_admin')?.slug || '' });
    setError('');
    setShowModal(true);
  };

  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleCreate = (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    adminAPI.createTeamMember(form)
      .then(() => { notify.success('Team member added'); setShowModal(false); load(); })
      .catch((err) => setError(err?.response?.data?.message || 'Failed to create team member'))
      .finally(() => setSaving(false));
  };

  const handleRemove = (member) => {
    if (!window.confirm(`Remove ${member.name} from the internal team?`)) return;
    adminAPI.removeTeamMember(member.id)
      .then(() => { notify.success('Removed'); load(); })
      .catch((err) => notify.error(err?.response?.data?.message || 'Failed to remove'));
  };

  return (
    <AppLayout>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">Platform Team</h1>
          <p className="page-subtitle">Your own internal Support/Sales/Finance/Technical Admin staff — separate from any customer's team members.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openModal} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> Add Team Member
        </button>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-overlay"><div className="loading-spinner" /></div>
        ) : team.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No internal team members yet.</div>
        ) : (
          <div className="grid-3">
            {team.map((m) => (
              <div key={m.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.email}</div>
                  </div>
                  <button className="bs-action-btn delete" onClick={() => handleRemove(m)} title="Remove">
                    <Trash2 size={13} color="#ef4444" />
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--primary)' }}>
                  <ShieldCheck size={13} /> {m.roleName}
                </div>
                <div style={{ fontSize: 11, color: m.is_active ? 'var(--success)' : 'var(--danger)' }}>
                  {m.is_active ? 'Active' : 'Inactive'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 440, maxWidth: '92vw', background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 0 }}>Add Platform Team Member</h3>
            {error && <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Full name</label>
                <input name="name" required className="form-input w-full" value={form.name} onChange={handleChange} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Email</label>
                <input name="email" type="email" required className="form-input w-full" value={form.email} onChange={handleChange} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Password</label>
                <input name="password" type="password" required className="form-input w-full" value={form.password} onChange={handleChange} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Role</label>
                <select name="roleSlug" required className="form-input w-full" value={form.roleSlug} onChange={handleChange}>
                  {roles.map((r) => <option key={r.id} value={r.slug}>{r.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
