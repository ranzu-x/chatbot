import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { resellerCustomerAPI, agencyPackageAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import { Building2, Plus } from 'lucide-react';

const EMPTY_FORM = { name: '', ownerName: '', ownerEmail: '', ownerPassword: '', agencyPackageId: '' };

export default function ResellerCustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([resellerCustomerAPI.getAll(), agencyPackageAPI.getAll()])
      .then(([cRes, pRes]) => {
        setCustomers(cRes.data?.customers || []);
        setPackages(pRes.data?.packages || []);
      })
      .catch(() => notify.error('Failed to load customers'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openModal = () => { setForm(EMPTY_FORM); setError(''); setShowModal(true); };
  const handleChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleCreate = (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    resellerCustomerAPI.create({ ...form, agencyPackageId: form.agencyPackageId || null })
      .then(() => { notify.success('Customer created'); setShowModal(false); load(); })
      .catch((err) => setError(err?.response?.data?.message || 'Failed to create customer'))
      .finally(() => setSaving(false));
  };

  const handleToggle = (c) => {
    resellerCustomerAPI.toggle(c.id).then(() => load()).catch(() => notify.error('Failed to update'));
  };

  const handlePackageChange = (c, agencyPackageId) => {
    resellerCustomerAPI.assignPackage(c.id, agencyPackageId)
      .then((res) => { notify.success(res.data?.message || 'Plan reassigned'); load(); })
      .catch((err) => notify.error(err?.response?.data?.message || 'Failed to reassign plan'));
  };

  return (
    <AppLayout>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">My Customers</h1>
          <p className="page-subtitle">Accounts you've created — each gets its own workspace, team, bots and subscribers, billed against your shared plan.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={openModal} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> Add Customer
        </button>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-overlay"><div className="loading-spinner" /></div>
        ) : customers.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            No customers yet — create one, or share your white-label signup domain so customers can sign themselves up.
          </div>
        ) : (
          <div className="grid-3">
            {customers.map((c) => (
              <div key={c.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(99,102,241,0.1)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Building2 size={17} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{c.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{c.ownerName} · {c.ownerEmail}</div>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Plan</label>
                  <select className="form-input" style={{ width: '100%' }} value={c.agencyPackageId || ''} onChange={(e) => handlePackageChange(c, e.target.value)}>
                    <option value="">Unassigned (shared pool applies)</option>
                    {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <label className="bs-toggle-switch">
                  <input type="checkbox" checked={Boolean(c.is_active)} onChange={() => handleToggle(c)} />
                  <span className="bs-toggle-slider" />
                </label>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 460, maxWidth: '92vw', background: 'var(--bg-card)', borderRadius: 14, padding: 22, border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 0 }}>Add Customer</h3>
            {error && <div style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Customer / business name</label>
                <input name="name" required className="form-input w-full" value={form.name} onChange={handleChange} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Owner full name</label>
                <input name="ownerName" required className="form-input w-full" value={form.ownerName} onChange={handleChange} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Owner email</label>
                <input name="ownerEmail" type="email" required className="form-input w-full" value={form.ownerEmail} onChange={handleChange} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Owner initial password</label>
                <input name="ownerPassword" type="password" required className="form-input w-full" value={form.ownerPassword} onChange={handleChange} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Plan</label>
                <select name="agencyPackageId" className="form-input w-full" value={form.agencyPackageId} onChange={handleChange}>
                  <option value="">Unassigned (shared pool applies)</option>
                  {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
