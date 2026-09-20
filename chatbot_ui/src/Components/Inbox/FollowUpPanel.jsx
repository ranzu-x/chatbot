import { useCallback, useEffect, useMemo, useState } from 'react';
import { BellRing, Clock, Pencil, Plus, Trash2, Undo2, CheckCircle2, XCircle } from 'lucide-react';
import { followupAPI } from '../../services/api';
import {
  DUE_PRESET_HOURS, SNOOZE_PRESETS, partsInHours, partsToIso, toLocalParts, relativeDue, formatDue,
} from '../../utils/followUps';

const EMPTY_DRAFT = { title: '', note: '', date: '', time: '', assignedToAgentProfileId: '', presetHours: null };

const input = { width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.8rem', boxSizing: 'border-box' };
const label = { fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.3 };
const chip = (active) => ({
  padding: '4px 9px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
  border: `1px solid ${active ? '#2563eb' : '#cbd5e1'}`, background: active ? '#eff6ff' : '#fff', color: active ? '#1d4ed8' : '#475569',
});
const linkBtn = (color) => ({
  display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.72rem', fontWeight: 700, color, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
});
const STATUS = {
  PENDING: { color: '#2563eb', text: 'Pending' },
  OVERDUE: { color: '#ef4444', text: 'Overdue' },
  COMPLETED: { color: '#10b981', text: 'Done' },
  CANCELLED: { color: '#94a3b8', text: 'Cancelled' },
};

/**
 * The "Follow-ups" tab of the subscriber drawer: create, edit, snooze, finish
 * and delete reminders for one subscriber. Due reminders alert live in the
 * inbox (see FollowUpAlerts.jsx); this is where they are managed.
 */
export default function FollowUpPanel({ contactId, conversationId, agentsList = [], refreshKey = 0 }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [snoozeFor, setSnoozeFor] = useState(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(() => {
    if (!contactId) { setItems([]); setLoading(false); return Promise.resolve(); }
    return followupAPI.getAll({ contactId, limit: 100 })
      .then((r) => setItems(r.data?.followUps || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [contactId]);

  useEffect(() => { setLoading(true); load(); }, [load, refreshKey]);
  // Relative labels ("in 2 h") stay honest while the drawer is open.
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  // Switching subscriber abandons any half-filled form.
  useEffect(() => { setFormOpen(false); setEditingId(null); setDraft(EMPTY_DRAFT); setError(''); setSnoozeFor(null); }, [contactId]);

  const sorted = useMemo(() => {
    const active = items.filter((f) => f.status === 'PENDING' || f.status === 'OVERDUE');
    const closed = items.filter((f) => f.status === 'COMPLETED' || f.status === 'CANCELLED');
    active.sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
    closed.sort((a, b) => new Date(b.due_at) - new Date(a.due_at));
    return [...active, ...closed];
  }, [items]);

  const openCreate = () => {
    setEditingId(null);
    // Default to one hour out: most follow-ups are "check back shortly".
    setDraft({ ...EMPTY_DRAFT, ...partsInHours(1), presetHours: 1 });
    setError('');
    setFormOpen(true);
  };

  const openEdit = (f) => {
    setEditingId(f.id);
    setDraft({
      title: f.title || '',
      note: f.note || '',
      ...toLocalParts(f.due_at),
      assignedToAgentProfileId: f.assigned_to_agent_profile_id ? String(f.assigned_to_agent_profile_id) : '',
      presetHours: null,
    });
    setError('');
    setFormOpen(true);
  };

  const closeForm = () => { setFormOpen(false); setEditingId(null); setDraft(EMPTY_DRAFT); setError(''); };

  const pickPreset = (hours) => setDraft((d) => ({ ...d, ...partsInHours(hours), presetHours: hours }));

  const dueIso = partsToIso(draft.date, draft.time);
  const inPast = dueIso && new Date(dueIso).getTime() <= Date.now();
  const canSave = draft.title.trim() && dueIso && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: draft.title.trim(),
        note: draft.note.trim(),
        dueAt: dueIso,
        assignedToAgentProfileId: draft.assignedToAgentProfileId || null,
      };
      if (editingId) await followupAPI.update(editingId, payload);
      else await followupAPI.create({ ...payload, contactId, conversationId: conversationId || null });
      closeForm();
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not save this follow-up.');
    } finally {
      setSaving(false);
    }
  };

  const run = async (fn) => {
    try { await fn(); await load(); } catch (err) { setError(err?.response?.data?.message || 'That did not work. Please try again.'); }
  };
  const snooze = (f, minutes) => { setSnoozeFor(null); run(() => followupAPI.snooze(f.id, minutes)); };
  const setStatus = (f, status) => run(() => followupAPI.setStatus(f.id, status));
  const remove = (f) => { if (window.confirm('Delete this follow-up?')) run(() => followupAPI.delete(f.id)); };

  return (
    <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {!formOpen ? (
        <button onClick={openCreate} className="btn btn-primary w-full btn-sm" style={{ justifyContent: 'center' }} data-testid="followup-new">
          <Plus size={13} /> New Follow-up
        </button>
      ) : (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="followup-form">
          <div>
            <div style={label}>Title</div>
            <input
              value={draft.title}
              maxLength={160}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="e.g. Call back about the quote"
              style={input}
              data-testid="followup-title"
              autoFocus
            />
          </div>
          <div>
            <div style={label}>Description <span style={{ textTransform: 'none', fontWeight: 500 }}>(optional)</span></div>
            <textarea
              value={draft.note}
              maxLength={2000}
              rows={2}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              placeholder="Anything worth remembering when this comes up"
              style={{ ...input, resize: 'vertical' }}
              data-testid="followup-note"
            />
          </div>

          <div>
            <div style={label}>Remind me in</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {DUE_PRESET_HOURS.map((h) => (
                <button key={h} type="button" onClick={() => pickPreset(h)} style={chip(draft.presetHours === h)} data-testid={`followup-preset-${h}`}>
                  {h} {h === 1 ? 'hour' : 'hours'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={label}>Date</div>
              <input type="date" value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value, presetHours: null }))} style={input} data-testid="followup-date" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={label}>Time</div>
              <input type="time" value={draft.time} onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value, presetHours: null }))} style={input} data-testid="followup-time" />
            </div>
          </div>
          {dueIso && (
            <div style={{ fontSize: '0.74rem', color: inPast ? '#b45309' : '#64748b' }}>
              {inPast ? 'This time has already passed, so it will alert straight away.' : `Alerts ${formatDue(dueIso)} (${relativeDue(dueIso, now)}).`}
            </div>
          )}

          <div>
            <div style={label}>Assigned to</div>
            <select
              value={draft.assignedToAgentProfileId}
              onChange={(e) => setDraft((d) => ({ ...d, assignedToAgentProfileId: e.target.value }))}
              style={{ ...input, background: '#fff' }}
            >
              <option value="">Me</option>
              {agentsList.map((a) => {
                const isAdm = a.isAdmin || a.role === 'ADMIN' || a.name === 'Admin';
                const pid = a.profileId || a.agent_profile_id || a.id;
                return <option key={pid} value={pid}>{isAdm ? 'Admin' : (a.name || a.email)}</option>;
              })}
            </select>
          </div>

          {error && <div style={{ fontSize: '0.76rem', color: '#dc2626' }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={closeForm} className="btn btn-secondary btn-sm">Cancel</button>
            <button onClick={save} disabled={!canSave} className="btn btn-primary btn-sm" data-testid="followup-save">
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {!formOpen && error && <div style={{ fontSize: '0.76rem', color: '#dc2626' }}>{error}</div>}

      <div>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
          Follow-ups ({items.length})
        </span>
        {loading ? (
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 8 }}>Loading…</div>
        ) : sorted.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 8 }}>No follow-ups yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {sorted.map((f) => {
              const st = STATUS[f.status] || STATUS.PENDING;
              const active = f.status === 'PENDING' || f.status === 'OVERDUE';
              return (
                <div key={f.id} data-testid="followup-item" style={{ padding: '9px 11px', borderRadius: 8, border: `1px solid ${f.status === 'OVERDUE' ? '#fecaca' : '#e2e8f0'}`, background: f.status === 'OVERDUE' ? '#fef2f2' : '#fff', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', textDecoration: active ? 'none' : 'line-through' }}>{f.title || f.note}</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 800, color: st.color, whiteSpace: 'nowrap' }}>{st.text}</span>
                  </div>
                  {f.title && f.note ? <div style={{ fontSize: '0.78rem', color: '#475569', whiteSpace: 'pre-wrap' }}>{f.note}</div> : null}
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Clock size={11} /> {formatDue(f.due_at)}{active ? ` · ${relativeDue(f.due_at, now)}` : ''}</span>
                    {f.assignedToName ? <span>for {f.assignedToName}</span> : null}
                    {f.snooze_count > 0 ? <span style={{ color: '#b45309' }}>snoozed ×{f.snooze_count}</span> : null}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 3 }}>
                    {active ? (
                      <>
                        <button onClick={() => setSnoozeFor(snoozeFor === f.id ? null : f.id)} style={linkBtn('#b45309')} data-testid="followup-snooze"><BellRing size={12} /> Snooze</button>
                        <button onClick={() => setStatus(f, 'COMPLETED')} style={linkBtn('#10b981')} data-testid="followup-done"><CheckCircle2 size={12} /> Done</button>
                        <button onClick={() => openEdit(f)} style={linkBtn('#2563eb')}><Pencil size={12} /> Edit</button>
                        <button onClick={() => setStatus(f, 'CANCELLED')} style={linkBtn('#94a3b8')}><XCircle size={12} /> Cancel</button>
                      </>
                    ) : (
                      <button onClick={() => setStatus(f, 'PENDING')} style={linkBtn('#2563eb')}><Undo2 size={12} /> Reopen</button>
                    )}
                    <button onClick={() => remove(f)} style={linkBtn('#ef4444')}><Trash2 size={12} /> Delete</button>
                  </div>

                  {snoozeFor === f.id && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }} data-testid="followup-snooze-menu">
                      {SNOOZE_PRESETS.map((p) => (
                        <button key={p.minutes} type="button" onClick={() => snooze(f, p.minutes)} style={chip(false)}>{p.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
