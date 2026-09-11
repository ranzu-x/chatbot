import { useState, useEffect, useCallback } from 'react';
import { aiAgentAPI } from '../../services/api';
import PlatformIcon from '../Common/PlatformIcon';
import AIAgentEditor from './AIAgentEditor';
import { RefreshCw, Plus, Search, Sparkles, Star, Trash2 } from 'lucide-react';
import Swal from 'sweetalert2';

const AVATAR_COLORS = ['#2563eb', '#0891b2', '#7c3aed', '#c2410c', '#be185d', '#16a34a'];
function colorFor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
function fmtDate(v) {
  if (!v) return '—';
  try { return new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return '—'; }
}

/**
 * AI Agents — reusable, channel-independent AI personalities. Lives inside
 * Bot Manager → AI → Agents. A card grid (not the table UserInputFlows/
 * Sequences use) — matches the approved design canvas, and an Agent's
 * "Open" action switches this component into its editor in place, since
 * (unlike a Flow) there's no drag-and-drop canvas route to navigate to.
 */
export default function AIAgentManagerList() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [openAgentId, setOpenAgentId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    aiAgentAPI.getAll()
      .then((res) => setAgents(res.data?.agents || []))
      .catch(() => setAgents([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    try {
      setCreating(true);
      const res = await aiAgentAPI.create({ name: newName.trim() });
      const id = res.data?.agent?.id;
      setShowCreate(false);
      setNewName('');
      load();
      if (id) setOpenAgentId(id);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Could not create Agent', text: err?.response?.data?.message || 'Please try again.' });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (agent) => {
    const ok = await Swal.fire({
      title: `Delete "${agent.name}"?`,
      text: agent.channels?.length ? `This Agent is active on ${agent.channels.length} bot(s) — it will stop replying there too.` : 'This cannot be undone.',
      icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Delete',
    });
    if (!ok.isConfirmed) return;
    try {
      await aiAgentAPI.delete(agent.id);
      setAgents((prev) => prev.filter((a) => a.id !== agent.id));
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Could not delete', text: err?.response?.data?.message || 'Please try again.' });
    }
  };

  if (openAgentId !== null) {
    return (
      <AIAgentEditor
        agentId={openAgentId}
        onBack={() => { setOpenAgentId(null); load(); }}
        onDeleted={() => { setOpenAgentId(null); load(); }}
      />
    );
  }

  const filtered = agents.filter((a) => !search.trim() || a.name.toLowerCase().includes(search.trim().toLowerCase()));

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Loading Agents...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 12px', maxWidth: 300, flex: 1 }}>
          <Search size={14} color="#94a3b8" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Agents..."
            style={{ border: 'none', outline: 'none', fontSize: '0.82rem', flex: 1 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={load}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
          >
            <RefreshCw size={13} /> Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}
          >
            <Plus size={14} /> New Agent
          </button>
        </div>
      </div>

      {agents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#5c5c80' }}>
          <Sparkles size={30} color="#c4b5fd" style={{ marginBottom: 10 }} />
          <p style={{ fontSize: '0.86rem', maxWidth: 440, margin: '0 auto 4px', lineHeight: 1.6 }}>
            Create your first AI Agent — a reusable personality with its own instructions, that
            you can turn on for any of your bots, on any channel.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {filtered.map((a) => (
            <div key={a.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer' }} onClick={() => setOpenAgentId(a.id)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: colorFor(a.name), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 13 }}>
                  {initials(a.name)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={`badge ${a.is_active ? 'badge-success' : 'badge-muted'}`}>{a.is_active ? 'Active' : 'Draft'}</span>
                  <button
                    type="button"
                    title="Delete Agent"
                    onClick={(e) => { e.stopPropagation(); handleDelete(a); }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2, display: 'flex' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <div>
                {a.is_default ? (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 800, color: 'var(--warning)', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.22)', padding: '2px 7px', borderRadius: 999, marginBottom: 6 }}>
                    <Star size={9} /> Default
                  </div>
                ) : null}
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{a.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 3, minHeight: 34, overflow: 'hidden' }}>
                  {a.description || 'No description yet.'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <div style={{ display: 'flex' }}>
                  {(a.channels || []).length === 0 ? (
                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Not active on any bot yet</span>
                  ) : (
                    a.channels.slice(0, 4).map((c, i) => (
                      <div key={c.integrationId} title={c.name} style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #fff', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: i > 0 ? -6 : 0 }}>
                        <PlatformIcon platform={c.platform} size={10} />
                      </div>
                    ))
                  )}
                </div>
                <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Edited {fmtDate(a.updated_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div
          onClick={() => setShowCreate(false)}
          className="modal-overlay"
        >
          <div onClick={(e) => e.stopPropagation()} className="modal">
            <h2 className="modal-title">New Agent</h2>
            <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
              Give it a name — you'll write its instructions, routing, and knowledge base next.
            </p>
            <label className="form-label" style={{ display: 'block', marginBottom: 5 }}>Agent Name</label>
            <input
              autoFocus
              className="form-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. Sales Agent"
            />
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={!newName.trim() || creating}>
                {creating ? 'Creating...' : 'Create Agent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
