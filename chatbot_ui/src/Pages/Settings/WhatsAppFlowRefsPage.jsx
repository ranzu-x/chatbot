import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { whatsappFlowRefAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import { Workflow, Plus, Trash2 } from 'lucide-react';

export default function WhatsAppFlowRefsPage() {
  const [flowRefs, setFlowRefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [flowId, setFlowId] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    whatsappFlowRefAPI.getAll()
      .then((res) => setFlowRefs(res.data?.flowRefs || []))
      .catch(() => notify.error('Failed to load WhatsApp Flows'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = (e) => {
    e.preventDefault();
    if (!name.trim() || !flowId.trim()) return;
    setSaving(true);
    whatsappFlowRefAPI.create({ name: name.trim(), flowId: flowId.trim() })
      .then(() => { notify.success('Added'); setName(''); setFlowId(''); load(); })
      .catch((err) => notify.error(err?.response?.data?.message || 'Failed to add'))
      .finally(() => setSaving(false));
  };

  const handleDelete = (f) => {
    if (!window.confirm(`Remove "${f.name}"?`)) return;
    whatsappFlowRefAPI.delete(f.id).then(() => load()).catch(() => notify.error('Failed to remove'));
  };

  return (
    <AppLayout>
      <div className="page-header">
        <h1 className="page-title">WhatsApp Flows</h1>
        <p className="page-subtitle">
          Reference Flows you've already built and published in Meta Business Manager — agents can then send them from the Live Inbox's Send menu. This app doesn't author or publish Flow JSON itself.
        </p>
      </div>

      <div className="page-body">
        <div className="card" style={{ maxWidth: 520, marginBottom: 20 }}>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Display name</label>
              <input className="form-input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Book Appointment" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5 }}>Meta Flow ID</label>
              <input className="form-input w-full" value={flowId} onChange={(e) => setFlowId(e.target.value)} placeholder="e.g. 1234567890123456" />
            </div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !name.trim() || !flowId.trim()} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={13} /> {saving ? 'Adding…' : 'Add Flow'}
            </button>
          </form>
        </div>

        {loading ? (
          <div className="loading-overlay"><div className="loading-spinner" /></div>
        ) : flowRefs.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>No WhatsApp Flows referenced yet.</div>
        ) : (
          <div className="grid-3">
            {flowRefs.map((f) => (
              <div key={f.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Workflow size={16} />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{f.name}</div>
                  </div>
                  <button className="bs-action-btn delete" onClick={() => handleDelete(f)} title="Remove">
                    <Trash2 size={13} color="#ef4444" />
                  </button>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{f.flow_id}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
