import { Fragment, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { userInputFlowAPI, integrationAPI } from '../../services/api';
import PlatformIcon, { getPlatformMeta } from '../Common/PlatformIcon';
import { ChevronDown, ChevronRight, RefreshCw, Plus, Pencil, Trash2, ExternalLink } from 'lucide-react';
import Swal from 'sweetalert2';

const PLATFORM_OPTIONS = ['WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'TIKTOK', 'WEBCHAT'];

function fmtDateTime(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

const iconBtn = {
  width: 26, height: 26, borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff',
  color: '#64748b', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
};

/** One form's expandable "Reports" panel — its recent submitted answers, fetched lazily. */
function ResponseRows({ flowId }) {
  const [responses, setResponses] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    userInputFlowAPI.getResponses(flowId)
      .then((res) => { if (!cancelled) setResponses(res.data?.responses || []); })
      .catch(() => { if (!cancelled) setResponses([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [flowId]);

  if (loading) {
    return <div style={{ padding: '14px 18px', fontSize: '0.8rem', color: '#94a3b8' }}>Loading submissions...</div>;
  }
  if (!responses || responses.length === 0) {
    return <div style={{ padding: '14px 18px', fontSize: '0.8rem', color: '#94a3b8' }}>No submissions yet.</div>;
  }

  return (
    <div style={{ padding: '4px 18px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {responses.map((r) => {
        let answers = r.answers;
        if (typeof answers === 'string') { try { answers = JSON.parse(answers); } catch { answers = []; } }
        return (
          <div key={r.id} style={{ border: '1px solid #f1f5f9', borderRadius: 8, padding: '10px 12px', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>{r.contact_name || `Contact #${r.contact_id}`}</span>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{fmtDateTime(r.created_at)}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
              {(Array.isArray(answers) ? answers : []).map((a, i) => (
                <div key={i} style={{ fontSize: '0.76rem' }}>
                  <span style={{ color: '#94a3b8' }}>{a.label || a.message}: </span>
                  <span style={{ color: '#334155', fontWeight: 600 }}>{a.value ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * User Input Flows — full list management (create / open / rename / delete)
 * plus a "Reports" drill-down per form showing recent submitted answers.
 * Lives inside Bot Manager → Automation now — no longer a separate page
 * reached from the main sidebar.
 */
export default function UserInputFlowManagerList({ integrationId = null }) {
  const navigate = useNavigate();
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPlatform, setNewPlatform] = useState('WHATSAPP');
  const [creating, setCreating] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  const [integrations, setIntegrations] = useState([]);
  const [createIntegrationId, setCreateIntegrationId] = useState('');
  useEffect(() => { integrationAPI.getAll().then((res) => setIntegrations(res.data?.integrations || [])).catch(() => {}); }, []);

  // Opened from one bot account → only that bot's forms, and new forms belong to it.
  const lockedIntegration = integrationId ? integrations.find((i) => String(i.id) === String(integrationId)) || null : null;
  useEffect(() => {
    if (lockedIntegration) { setNewPlatform(lockedIntegration.platform); setCreateIntegrationId(String(lockedIntegration.id)); }
  }, [lockedIntegration]);
  const accountsForNewPlatform = integrations.filter((i) => i.platform === newPlatform && i.is_active);
  const accountLabel = (i) => i.name || i.wa_display_phone || i.fb_page_name || i.ig_username || `Account #${i.id}`;

  const load = useCallback(() => {
    setLoading(true);
    userInputFlowAPI.getAll(integrationId ? { integrationId } : undefined)
      .then((res) => setFlows(res.data?.userInputFlows || []))
      .catch(() => setFlows([]))
      .finally(() => setLoading(false));
  }, [integrationId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    if (!createIntegrationId) {
      Swal.fire({ icon: 'info', title: 'Choose a bot account', text: 'A form belongs to one bot account and can only be used by that bot.' });
      return;
    }
    try {
      setCreating(true);
      const res = await userInputFlowAPI.create({ name: newName.trim(), platform: newPlatform, integrationId: createIntegrationId, nodesJson: [], edgesJson: [] });
      const id = res.data?.userInputFlowId;
      setShowCreate(false);
      setNewName('');
      if (id) navigate(`/user-input-flows/${id}/edit`, { state: { from: '/bots', label: 'Bot Manager' } });
      else load();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Could not create form', text: err?.response?.data?.message || 'Please try again.' });
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (flow) => {
    const name = renameValue.trim();
    if (!name || name === flow.name) { setRenamingId(null); return; }
    try {
      await userInputFlowAPI.update(flow.id, { name });
      setFlows((prev) => prev.map((f) => (f.id === flow.id ? { ...f, name } : f)));
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Could not rename', text: err?.response?.data?.message || 'Please try again.' });
    } finally {
      setRenamingId(null);
    }
  };

  const handleDelete = async (flow) => {
    const ok = await Swal.fire({
      title: `Delete "${flow.name}"?`,
      text: 'Any saved responses for this form are removed too. This cannot be undone.',
      icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Delete',
    });
    if (!ok.isConfirmed) return;
    try {
      await userInputFlowAPI.delete(flow.id);
      setFlows((prev) => prev.filter((f) => f.id !== flow.id));
    } catch (err) {
      // Refused while a bot Flow's "Run User Input Flow" node still points here.
      Swal.fire({ icon: 'info', title: 'Still in use', text: err?.response?.data?.message || 'Could not delete this form.' });
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Loading forms...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 14 }}>
        <button
          onClick={load}
          title="Refresh"
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
        >
          <RefreshCw size={13} /> Refresh
        </button>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: 'none',
            background: '#0f172a',
            color: '#fff', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
          }}
        >
          <Plus size={14} /> New Form
        </button>
      </div>

      {flows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#5c5c80' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>📋</div>
          <p style={{ fontSize: '0.86rem', maxWidth: 430, margin: '0 auto 18px', lineHeight: 1.6 }}>
            Build a form once — name, email, phone, anything — with per-answer validation, and have
            every completed submission saved to the subscriber and exported to your webhook or Google Sheet.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e4e4f0', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', background: '#f8fafc', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '10px 14px' }}></th>
                <th style={{ padding: '10px 14px' }}>Form</th>
                <th style={{ padding: '10px 14px' }}>Channel</th>
                <th style={{ padding: '10px 14px' }}>Steps</th>
                <th style={{ padding: '10px 14px' }}>Responses</th>
                <th style={{ padding: '10px 14px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {flows.map((f) => {
                const meta = getPlatformMeta(f.platform);
                const isOpen = expandedId === f.id;
                const isRenaming = renamingId === f.id;
                const questions = Number(f.nodeCount || 0);
                const responses = Number(f.responseCount || 0);
                return (
                  <Fragment key={f.id}>
                    <tr style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 14px', color: '#94a3b8', cursor: 'pointer' }} onClick={() => setExpandedId(isOpen ? null : f.id)}>
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>
                        {isRenaming ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(f); if (e.key === 'Escape') setRenamingId(null); }}
                            onBlur={() => handleRename(f)}
                            style={{ padding: '4px 8px', fontSize: '0.82rem', fontWeight: 700, borderRadius: 6, border: '1px solid #cbd5e1', width: 180 }}
                          />
                        ) : (
                          <span style={{ cursor: 'pointer' }} onClick={() => setExpandedId(isOpen ? null : f.id)}>{f.name}</span>
                        )}
                        {!f.integration_id && (
                          <div style={{ marginTop: 4, fontWeight: 500 }}>
                            <select
                              defaultValue=""
                              onChange={async (e) => {
                                if (!e.target.value) return;
                                try { await userInputFlowAPI.update(f.id, { integrationId: e.target.value }); load(); }
                                catch (err) { Swal.fire({ icon: 'error', title: 'Could not assign', text: err?.response?.data?.message || 'Please try again.' }); }
                              }}
                              title="No bot account yet — no bot can use this form until you assign one. This can't be changed later."
                              style={{ fontSize: '0.72rem', padding: '3px 6px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626' }}
                            >
                              <option value="">Not assigned — choose bot account…</option>
                              {integrations.filter((i) => i.platform === f.platform && i.is_active).map((i) => <option key={i.id} value={i.id}>{accountLabel(i)}</option>)}
                            </select>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: `${meta.color}14`, color: meta.color, fontSize: '0.7rem', fontWeight: 700 }}>
                          <PlatformIcon platform={f.platform} size={11} /> {meta.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#334155' }}>{questions === 0 ? 'Not built yet' : questions}</td>
                      <td style={{ padding: '10px 14px', color: '#334155' }}>{responses}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button type="button" title="Open" style={iconBtn} onClick={() => navigate(`/user-input-flows/${f.id}/edit`, { state: { from: '/bots', label: 'Bot Manager' } })}>
                            <ExternalLink size={13} />
                          </button>
                          <button type="button" title="Rename" style={iconBtn} onClick={() => { setRenamingId(f.id); setRenameValue(f.name); }}>
                            <Pencil size={13} />
                          </button>
                          <button type="button" title="Reports" style={iconBtn} onClick={() => setExpandedId(isOpen ? null : f.id)}>
                            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          </button>
                          <button type="button" title="Delete" style={{ ...iconBtn, color: '#ef4444' }} onClick={() => handleDelete(f)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={6} style={{ padding: 0, background: '#fafbfc' }}>
                          <ResponseRows flowId={f.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div
          onClick={() => setShowCreate(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>
            <h2 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>New User Input Flow</h2>
            <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
              Pick the channel this form belongs to — it can only be reused by automations on that
              same channel, and this can't be changed later.
            </p>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 5 }}>Form Name</label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. Lead Capture Form"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #e2e8f0', fontSize: '0.86rem', boxSizing: 'border-box' }}
            />
            {lockedIntegration ? (
              <div style={{ margin: '14px 0 0', padding: '10px 12px', borderRadius: 9, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '0.8rem', color: '#334155' }}>
                <strong>Belongs to:</strong> {accountLabel(lockedIntegration)}
                <div style={{ color: '#94a3b8', marginTop: 2 }}>Only this bot account can use it. This can't be changed later.</div>
              </div>
            ) : (
              <>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', margin: '14px 0 5px' }}>Channel</label>
            <select value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #e2e8f0', fontSize: '0.86rem', boxSizing: 'border-box' }}>
              {PLATFORM_OPTIONS.map((p) => <option key={p} value={p}>{getPlatformMeta(p).label}</option>)}
            </select>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', margin: '14px 0 5px' }}>Bot account</label>
                {accountsForNewPlatform.length === 0 ? (
                  <div style={{ padding: '9px 12px', borderRadius: 9, background: '#fef3c7', color: '#92400e', fontSize: '0.78rem' }}>No connected, active {getPlatformMeta(newPlatform).label} account. Connect one first.</div>
                ) : (
                  <select value={createIntegrationId} onChange={(e) => setCreateIntegrationId(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #e2e8f0', fontSize: '0.86rem', boxSizing: 'border-box' }}>
                    <option value="">Choose an account…</option>
                    {accountsForNewPlatform.map((i) => <option key={i.id} value={i.id}>{accountLabel(i)}</option>)}
                  </select>
                )}
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22 }}>
              <button type="button" onClick={() => setShowCreate(false)} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer', background: '#f1f5f9', color: '#475569' }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!newName.trim() || creating}
                style={{
                  padding: '9px 18px', borderRadius: 9, border: 'none', fontSize: '0.84rem', fontWeight: 700,
                  cursor: !newName.trim() || creating ? 'not-allowed' : 'pointer',
                  background: !newName.trim() || creating ? '#94a3b8' : '#0f172a',
                  color: '#fff',
                }}
              >
                {creating ? 'Creating...' : 'Create & Build'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
