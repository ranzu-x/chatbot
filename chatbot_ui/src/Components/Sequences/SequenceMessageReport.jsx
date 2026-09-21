import { Fragment, useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { sequenceAPI, integrationAPI } from '../../services/api';
import PlatformIcon, { getPlatformMeta } from '../Common/PlatformIcon';
import { ChevronDown, ChevronRight, RefreshCw, Plus, Pencil, Trash2, ExternalLink, Send } from 'lucide-react';
import Swal from 'sweetalert2';

function integrationLabel(i) {
  return i.wa_display_phone || i.fb_page_name || i.name || `Account #${i.id}`;
}

const PLATFORM_OPTIONS = ['WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'TELEGRAM', 'TIKTOK', 'WEBCHAT'];

function fmtDateTime(v) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

const STATUS_META = {
  SENT: { label: 'Sent', color: '#16a34a', bg: '#dcfce7' },
  SKIPPED_WINDOW: { label: 'Skipped (window)', color: '#b45309', bg: '#fef3c7' },
  FAILED: { label: 'Failed', color: '#dc2626', bg: '#fee2e2' },
};

const iconBtn = {
  width: 26, height: 26, borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff',
  color: '#64748b', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0,
};

/** One sequence's expandable delivery log ("Reports") — fetched lazily, only when opened. */
function SequenceLogRows({ sequenceId }) {
  const [log, setLog] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    sequenceAPI.getLog(sequenceId)
      .then((res) => { if (!cancelled) setLog(res.data?.log || []); })
      .catch(() => { if (!cancelled) setLog([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sequenceId]);

  if (loading) {
    return <div style={{ padding: '14px 18px', fontSize: '0.8rem', color: '#94a3b8' }}>Loading recent activity...</div>;
  }
  if (!log || log.length === 0) {
    return <div style={{ padding: '14px 18px', fontSize: '0.8rem', color: '#94a3b8' }}>No delivery attempts yet.</div>;
  }

  return (
    <div style={{ padding: '4px 18px 14px', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: '#94a3b8', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <th style={{ padding: '6px 10px' }}>Subscriber</th>
            <th style={{ padding: '6px 10px' }}>Step</th>
            <th style={{ padding: '6px 10px' }}>Status</th>
            <th style={{ padding: '6px 10px' }}>Detail</th>
            <th style={{ padding: '6px 10px' }}>When</th>
          </tr>
        </thead>
        <tbody>
          {log.map((row) => {
            const meta = STATUS_META[row.status] || { label: row.status, color: '#64748b', bg: '#f1f5f9' };
            return (
              <tr key={row.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: '7px 10px', color: '#0f172a', fontWeight: 600 }}>{row.contact_name || row.phone || row.email || `Contact #${row.contact_id}`}</td>
                <td style={{ padding: '7px 10px', color: '#475569' }}>{row.node_label}</td>
                <td style={{ padding: '7px 10px' }}>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: meta.bg, color: meta.color, fontWeight: 700, fontSize: '0.7rem' }}>
                    {meta.label}
                  </span>
                </td>
                <td style={{ padding: '7px 10px', color: '#94a3b8', maxWidth: 280 }}>{row.detail || '—'}</td>
                <td style={{ padding: '7px 10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDateTime(row.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Sequence Messages — full list management (create / open / rename / delete)
 * PLUS per-sequence delivery stats (sent / skipped by a channel's
 * messaging-window rules / failed) with an expandable log so a skip or
 * failure is self-diagnosable right here instead of needing a database
 * query. Lives inside Bot Manager → Automation now — no longer a separate
 * page reached from the main sidebar.
 */
export default function SequenceMessageReport({ integrationId = null }) {
  const navigate = useNavigate();
  const [sequences, setSequences] = useState([]);
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
  const [accountPickerFor, setAccountPickerFor] = useState(null);
  const [accountPickerValue, setAccountPickerValue] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    sequenceAPI.getAll(integrationId ? { integrationId } : undefined)
      .then((res) => setSequences(res.data?.sequences || []))
      .catch(() => setSequences([]))
      .finally(() => setLoading(false));
  }, [integrationId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { integrationAPI.getAll().then((res) => setIntegrations(res.data?.integrations || [])).catch(() => {}); }, []);

  const integrationsForNewPlatform = useMemo(
    () => integrations.filter((i) => i.platform === newPlatform && i.is_active),
    [integrations, newPlatform]
  );
  useEffect(() => {
    setCreateIntegrationId(integrationsForNewPlatform.length === 1 ? String(integrationsForNewPlatform[0].id) : '');
  }, [integrationsForNewPlatform]);

  // Opened from one bot account → new sequences belong to THAT account, fixed.
  const lockedIntegration = useMemo(
    () => (integrationId ? integrations.find((i) => String(i.id) === String(integrationId)) || null : null),
    [integrationId, integrations]
  );
  useEffect(() => {
    if (lockedIntegration) {
      setNewPlatform(lockedIntegration.platform);
      setCreateIntegrationId(String(lockedIntegration.id));
    }
  }, [lockedIntegration]);

  const integrationsForPickerPlatform = useMemo(
    () => integrations.filter((i) => i.platform === accountPickerFor?.platform && i.is_active),
    [integrations, accountPickerFor]
  );

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    if (!createIntegrationId) {
      Swal.fire({ icon: 'info', title: 'Choose an account', text: `Pick which connected ${getPlatformMeta(newPlatform).label} account this sequence sends from.` });
      return;
    }
    try {
      setCreating(true);
      const res = await sequenceAPI.create({ name: newName.trim(), platform: newPlatform, integrationId: createIntegrationId });
      const id = res.data?.sequence?.id;
      setShowCreate(false);
      setNewName('');
      if (id) navigate(`/sequences/${id}/edit`, { state: { from: '/bots', label: 'Bot Manager' } });
      else load();
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Could not create sequence', text: err?.response?.data?.message || 'Please try again.' });
    } finally {
      setCreating(false);
    }
  };

  const openAccountPicker = (seq) => {
    setAccountPickerFor(seq);
    setAccountPickerValue(seq.integration_id ? String(seq.integration_id) : '');
  };

  const handleSaveAccount = async () => {
    if (!accountPickerFor || !accountPickerValue || savingAccount) return;
    try {
      setSavingAccount(true);
      await sequenceAPI.update(accountPickerFor.id, { integrationId: accountPickerValue });
      load();
      setAccountPickerFor(null);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Could not change account', text: err?.response?.data?.message || 'Please try again.' });
    } finally {
      setSavingAccount(false);
    }
  };

  const handleRename = async (seq) => {
    const name = renameValue.trim();
    if (!name || name === seq.name) { setRenamingId(null); return; }
    try {
      await sequenceAPI.update(seq.id, { name });
      setSequences((prev) => prev.map((s) => (s.id === seq.id ? { ...s, name } : s)));
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Could not rename', text: err?.response?.data?.message || 'Please try again.' });
    } finally {
      setRenamingId(null);
    }
  };

  const handleDelete = async (seq) => {
    const ok = await Swal.fire({
      title: `Delete "${seq.name}"?`,
      text: 'Enrolled subscribers stop receiving further messages. This cannot be undone.',
      icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'Delete',
    });
    if (!ok.isConfirmed) return;
    try {
      await sequenceAPI.delete(seq.id);
      setSequences((prev) => prev.filter((s) => s.id !== seq.id));
    } catch (err) {
      // Refused while a bot Flow's Start/Stop Sequence node still points here.
      Swal.fire({ icon: 'info', title: 'Still in use', text: err?.response?.data?.message || 'Could not delete this sequence.' });
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Loading sequences...</div>;
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
          <Plus size={14} /> New Sequence
        </button>
      </div>

      {sequences.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#5c5c80' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>📨</div>
          <p style={{ fontSize: '0.86rem', maxWidth: 430, margin: '0 auto 18px', lineHeight: 1.6 }}>
            Build a welcome message now, a follow-up in 30 minutes, another tomorrow — each channel's
            own messaging-window rules are respected automatically.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #e4e4f0', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', background: '#f8fafc', color: '#64748b', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '10px 14px' }}></th>
                <th style={{ padding: '10px 14px' }}>Sequence</th>
                <th style={{ padding: '10px 14px' }}>Channel</th>
                <th style={{ padding: '10px 14px' }}>Sends From</th>
                <th style={{ padding: '10px 14px' }}>Active</th>
                <th style={{ padding: '10px 14px' }}>Completed</th>
                <th style={{ padding: '10px 14px', color: '#16a34a' }}>Sent</th>
                <th style={{ padding: '10px 14px', color: '#b45309' }}>Skipped</th>
                <th style={{ padding: '10px 14px', color: '#dc2626' }}>Failed</th>
                <th style={{ padding: '10px 14px' }}>Last Activity</th>
                <th style={{ padding: '10px 14px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sequences.map((s) => {
                const meta = getPlatformMeta(s.platform);
                const isOpen = expandedId === s.id;
                const hasSkippedOrFailed = Number(s.skipped_count || 0) > 0 || Number(s.failed_count || 0) > 0;
                const isRenaming = renamingId === s.id;
                return (
                  <Fragment key={s.id}>
                    <tr style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px 14px', color: '#94a3b8', cursor: 'pointer' }} onClick={() => setExpandedId(isOpen ? null : s.id)}>
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>
                        {isRenaming ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(s); if (e.key === 'Escape') setRenamingId(null); }}
                            onBlur={() => handleRename(s)}
                            style={{ padding: '4px 8px', fontSize: '0.82rem', fontWeight: 700, borderRadius: 6, border: '1px solid #cbd5e1', width: 180 }}
                          />
                        ) : (
                          <span style={{ cursor: 'pointer' }} onClick={() => setExpandedId(isOpen ? null : s.id)}>
                            {s.name}
                            {hasSkippedOrFailed && (
                              <span style={{ marginLeft: 8, display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#f59e0b' }} title="Has skipped or failed sends" />
                            )}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: `${meta.color}14`, color: meta.color, fontSize: '0.7rem', fontWeight: 700 }}>
                          <PlatformIcon platform={s.platform} size={11} /> {meta.label}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <button
                          type="button"
                          onClick={() => { if (!s.integration_id) openAccountPicker(s); }}
                          title={s.integration_id ? 'This sequence belongs to this bot account and can\'t be moved' : 'Assign a bot account'}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999,
                            border: s.integration_id ? '1px solid transparent' : '1px solid #fca5a5',
                            background: s.integration_id ? '#f1f5f9' : '#fef2f2',
                            color: s.integration_id ? '#334155' : '#dc2626',
                            fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          <Send size={11} />
                          {s.wa_display_phone || s.integration_name || 'Choose account'}
                        </button>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#334155' }}>{s.active_count || 0}</td>
                      <td style={{ padding: '10px 14px', color: '#334155' }}>{s.completed_count || 0}</td>
                      <td style={{ padding: '10px 14px', color: '#16a34a', fontWeight: 700 }}>{s.sent_count || 0}</td>
                      <td style={{ padding: '10px 14px', color: '#b45309', fontWeight: 700 }}>{s.skipped_count || 0}</td>
                      <td style={{ padding: '10px 14px', color: '#dc2626', fontWeight: 700 }}>{s.failed_count || 0}</td>
                      <td style={{ padding: '10px 14px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDateTime(s.last_activity_at)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button type="button" title="Open" style={iconBtn} onClick={() => navigate(`/sequences/${s.id}/edit`, { state: { from: '/bots', label: 'Bot Manager' } })}>
                            <ExternalLink size={13} />
                          </button>
                          <button type="button" title="Rename" style={iconBtn} onClick={() => { setRenamingId(s.id); setRenameValue(s.name); }}>
                            <Pencil size={13} />
                          </button>
                          <button type="button" title="Reports" style={iconBtn} onClick={() => setExpandedId(isOpen ? null : s.id)}>
                            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          </button>
                          <button type="button" title="Delete" style={{ ...iconBtn, color: '#ef4444' }} onClick={() => handleDelete(s)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={11} style={{ padding: 0, background: '#fafbfc' }}>
                          <SequenceLogRows sequenceId={s.id} />
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
            <h2 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>New Sequence</h2>
            <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
              Pick the channel — it can only enroll contacts on that same channel, and this can't be changed later.
            </p>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: 5 }}>Sequence Name</label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="e.g. Welcome Series"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #e2e8f0', fontSize: '0.86rem', boxSizing: 'border-box' }}
            />
            {lockedIntegration ? (
              <div style={{ margin: '14px 0 0', padding: '10px 12px', borderRadius: 9, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '0.8rem', color: '#334155' }}>
                <strong>Belongs to:</strong> {integrationLabel(lockedIntegration)}
                <div style={{ color: '#94a3b8', marginTop: 2 }}>Only this bot account can use it. This can't be changed later.</div>
              </div>
            ) : (
              <>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', margin: '14px 0 5px' }}>Channel</label>
            <select value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #e2e8f0', fontSize: '0.86rem', boxSizing: 'border-box' }}>
              {PLATFORM_OPTIONS.map((p) => <option key={p} value={p}>{getPlatformMeta(p).label}</option>)}
            </select>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', margin: '14px 0 5px' }}>Sends From</label>
            {integrationsForNewPlatform.length === 0 ? (
              <div style={{ padding: '9px 12px', borderRadius: 9, background: '#fef3c7', color: '#92400e', fontSize: '0.78rem' }}>
                No connected, active {getPlatformMeta(newPlatform).label} account. Connect one first.
              </div>
            ) : (
              <select value={createIntegrationId} onChange={(e) => setCreateIntegrationId(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #e2e8f0', fontSize: '0.86rem', boxSizing: 'border-box' }}>
                <option value="">Choose an account…</option>
                {integrationsForNewPlatform.map((i) => <option key={i.id} value={i.id}>{integrationLabel(i)}</option>)}
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
                disabled={!newName.trim() || !createIntegrationId || creating}
                style={{
                  padding: '9px 18px', borderRadius: 9, border: 'none', fontSize: '0.84rem', fontWeight: 700,
                  cursor: !newName.trim() || !createIntegrationId || creating ? 'not-allowed' : 'pointer',
                  background: !newName.trim() || !createIntegrationId || creating ? '#94a3b8' : '#0f172a',
                  color: '#fff',
                }}
              >
                {creating ? 'Creating...' : 'Create & Build'}
              </button>
            </div>
          </div>
        </div>
      )}

      {accountPickerFor && (
        <div
          onClick={() => setAccountPickerFor(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.25)' }}>
            <h2 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>Sends From</h2>
            <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
              Which connected {getPlatformMeta(accountPickerFor.platform).label} account should "{accountPickerFor.name}" send from?
            </p>
            {integrationsForPickerPlatform.length === 0 ? (
              <div style={{ padding: '9px 12px', borderRadius: 9, background: '#fef3c7', color: '#92400e', fontSize: '0.78rem' }}>
                No connected, active {getPlatformMeta(accountPickerFor.platform).label} account. Connect one first.
              </div>
            ) : (
              <select value={accountPickerValue} onChange={(e) => setAccountPickerValue(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid #e2e8f0', fontSize: '0.86rem', boxSizing: 'border-box' }}>
                <option value="">Choose an account…</option>
                {integrationsForPickerPlatform.map((i) => <option key={i.id} value={i.id}>{integrationLabel(i)}</option>)}
              </select>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22 }}>
              <button type="button" onClick={() => setAccountPickerFor(null)} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', fontSize: '0.84rem', fontWeight: 700, cursor: 'pointer', background: '#f1f5f9', color: '#475569' }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAccount}
                disabled={!accountPickerValue || savingAccount}
                style={{
                  padding: '9px 18px', borderRadius: 9, border: 'none', fontSize: '0.84rem', fontWeight: 700,
                  cursor: !accountPickerValue || savingAccount ? 'not-allowed' : 'pointer',
                  background: !accountPickerValue || savingAccount ? '#94a3b8' : '#0f172a',
                  color: '#fff',
                }}
              >
                {savingAccount ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
