import { useState, useEffect } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { apiKeyAPI } from '../../services/api';
import { notify, showAlert } from '../../utils/alerts';
import { Key, Plus, Trash2, Copy, Check, Loader2 } from 'lucide-react';

export default function ApiKeysPage() {
  const [keys, setKeys] = useState([]);
  const [scopes, setScopes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [label, setLabel] = useState('');
  const [selectedScopes, setSelectedScopes] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = () => {
    setLoading(true);
    apiKeyAPI.getAll()
      .then((res) => {
        setKeys(res.data?.apiKeys || []);
        setScopes(res.data?.availableScopes || []);
      })
      .catch(() => notify.error('Failed to load API keys'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setLabel('');
    setSelectedScopes(scopes);
    setNewKey(null);
    setShowModal(true);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!label.trim()) { notify.error('Label is required'); return; }
    setCreating(true);
    try {
      const res = await apiKeyAPI.create({ label: label.trim(), scopes: selectedScopes });
      setNewKey(res.data?.apiKey);
      load();
    } catch (err) {
      notify.error(err.response?.data?.message || 'Failed to create API key');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id) => {
    const ok = await showAlert.confirm({ title: 'Revoke this API key?', text: 'Any integration using it will stop working immediately.', confirmButtonText: 'Yes, Revoke' });
    if (!ok) return;
    try {
      await apiKeyAPI.revoke(id);
      notify.success('API key revoked');
      load();
    } catch {
      notify.error('Failed to revoke key');
    }
  };

  const copyKey = () => {
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AppLayout>
      <div className="page-header flex items-center justify-between">
        <div>
          <h1 className="page-title">API Keys</h1>
          <p className="page-subtitle">Let external tools read your contacts and send messages via the API.</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> Create API Key</button>
      </div>

      <div className="page-body">
        {loading ? (
          <div className="loading-overlay"><div className="loading-spinner" /></div>
        ) : keys.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Key size={28} /></div>
            <div className="empty-title">No API keys yet</div>
            <div className="empty-desc">Create one to let an external tool call the API on your behalf.</div>
          </div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Label</th><th>Key</th><th>Scopes</th><th>Last Used</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id}>
                    <td className="font-medium">{k.label}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b' }}>{k.key_prefix}…</td>
                    <td style={{ fontSize: '0.78rem', color: '#64748b' }}>{(Array.isArray(k.scopes) ? k.scopes : JSON.parse(k.scopes || '[]')).join(', ')}</td>
                    <td style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'Never'}</td>
                    <td><span className={`badge ${k.is_active ? 'badge-success' : 'badge-muted'}`}>{k.is_active ? 'Active' : 'Revoked'}</span></td>
                    <td>
                      {k.is_active === 1 && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleRevoke(k.id)}><Trash2 size={12} /> Revoke</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Key size={17} /> {newKey ? 'API Key Created' : 'Create API Key'}</div>

            {newKey ? (
              <>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                  Copy this key now — for security, it will never be shown again.
                </p>
                <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, fontFamily: 'monospace', fontSize: '0.82rem', wordBreak: 'break-all' }}>
                  {newKey}
                </div>
                <div className="modal-actions">
                  <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Close</button>
                  <button className="btn btn-primary" onClick={copyKey}>
                    {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Key</>}
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Label *</label>
                  <input className="form-input" placeholder="e.g. Zapier Integration" value={label} onChange={(e) => setLabel(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Scopes</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {scopes.map((s) => (
                      <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={selectedScopes.includes(s)}
                          onChange={(e) => setSelectedScopes((prev) => e.target.checked ? [...prev, s] : prev.filter((x) => x !== s))}
                        />
                        {s}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={creating}>
                    {creating ? <Loader2 size={14} className="animate-spin" /> : 'Create Key'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
