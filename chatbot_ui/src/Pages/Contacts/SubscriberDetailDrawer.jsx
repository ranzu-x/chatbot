import { useState, useEffect } from 'react';
import {
  Users, MessageSquare, Clock, X, Plus, Bot, Pause, ShieldCheck, ShieldOff,
  Tag, Zap, SlidersHorizontal,
} from 'lucide-react';
import { contactAPI, sequenceAPI, labelAPI, customFieldAPI } from '../../services/api';
import { getPlatform, getInitials, fmtDate, formatSubscriberId } from './subscriberUtils';

const TABS = ['Overview', 'Agent', 'Labels', 'Sequences', 'Custom Fields', 'Notes'];

const chip = {
  fontSize: '0.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: 12,
  border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'var(--bg-base)',
  display: 'inline-flex', alignItems: 'center', gap: 5,
};

export default function SubscriberDetailDrawer({ contact, availableLabels, onClose, onNavigateInbox, onContactPatched }) {
  const [activeTab, setActiveTab] = useState('Overview');
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [sequences, setSequences] = useState([]);
  const [contactLabels, setContactLabels] = useState(contact.labels || []);
  const [addLabelId, setAddLabelId] = useState('');
  const [customFields, setCustomFields] = useState([]);
  const [savingFieldId, setSavingFieldId] = useState(null);
  const pInfo = getPlatform(contact.platform);
  const PlatformIcon = pInfo.icon;
  const subscribed = contact.subscription_status !== 'UNSUBSCRIBED';

  useEffect(() => {
    setActiveTab('Overview');
    setContactLabels(contact.labels || []);
    if (contact?.id) {
      contactAPI.getNotes(contact.id).then((r) => setNotes(r.data.notes || [])).catch(() => {});
      contactAPI.getSequences(contact.id).then((r) => setSequences(r.data.sequences || [])).catch(() => {});
      customFieldAPI.getForContact(contact.id).then((r) => setCustomFields(r.data.fields || [])).catch(() => {});
    }
    // Intentionally keyed only on contact.id — re-reading contact.labels here
    // would refire this effect on every parent re-render (a new array
    // reference each time), not just when the drawer switches subscribers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id]);

  const handleStopSequence = async (seq) => {
    try {
      await sequenceAPI.unsubscribe(seq.sequence_id, { contactId: contact.id });
      setSequences((prev) => prev.map((s) => (s.id === seq.id ? { ...s, status: 'STOPPED' } : s)));
    } catch { /* no-op */ }
  };

  const handleAddNote = async (e) => {
    e?.preventDefault();
    if (!newNote.trim() || savingNote) return;
    setSavingNote(true);
    try {
      await contactAPI.addNote(contact.id, newNote.trim());
      const r = await contactAPI.getNotes(contact.id);
      setNotes(r.data.notes || []);
      setNewNote('');
    } catch (e) {
      console.error(e);
    } finally {
      setSavingNote(false);
    }
  };

  const handleAddLabel = async () => {
    if (!addLabelId) return;
    try {
      const res = await labelAPI.attachToContact(contact.id, { labelId: addLabelId });
      setContactLabels(res.data.labels || []);
      setAddLabelId('');
    } catch { /* no-op */ }
  };

  const handleRemoveLabel = async (labelId) => {
    try {
      const res = await labelAPI.detachFromContact(contact.id, labelId);
      setContactLabels(res.data.labels || []);
    } catch { /* no-op */ }
  };

  const handleToggleSubscription = async () => {
    const nextStatus = subscribed ? 'UNSUBSCRIBED' : 'SUBSCRIBED';
    try {
      await contactAPI.updateSubscription(contact.id, nextStatus);
      onContactPatched?.(contact.id, { subscription_status: nextStatus });
    } catch { /* no-op */ }
  };

  const handleFieldChange = async (field, value) => {
    setCustomFields((prev) => prev.map((f) => (f.field_id === field.field_id ? { ...f, value } : f)));
  };

  const handleFieldSave = async (field) => {
    setSavingFieldId(field.field_id);
    try {
      await customFieldAPI.setValue(contact.id, field.field_id, field.value);
    } catch { /* no-op */ } finally {
      setSavingFieldId(null);
    }
  };

  const unattachedLabels = (availableLabels || []).filter((l) => !contactLabels.some((cl) => cl.id === l.id));

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(3px)',
        zIndex: 99990, display: 'flex', justifyContent: 'flex-end', animation: 'fadeIn 0.15s ease',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 540, maxWidth: '92vw', height: '100%', background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.15)', overflow: 'hidden',
          animation: 'slideInRight 0.22s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-base)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={chip}><PlatformIcon size={13} /> {pInfo.label}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: <strong>{formatSubscriberId(contact.id)}</strong></span>
            </div>
            <button
              onClick={onClose} title="Close"
              style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--bg-hover)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem', flexShrink: 0, border: '1px solid var(--border)' }}>
              {getInitials(contact.name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {contact.name || 'Unnamed Subscriber'}
              </h2>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {contact.phone || contact.external_id || 'No phone / ID'}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {contact.retained && (
                  <span style={chip}>Retained</span>
                )}
                <button onClick={handleToggleSubscription} style={{ ...chip, cursor: 'pointer' }} title="Click to toggle">
                  {subscribed ? <ShieldCheck size={12} /> : <ShieldOff size={12} />} {subscribed ? 'Subscribed' : 'Unsubscribed'}
                </button>
                <span style={chip}>
                  {contact.bot_paused === 1 ? <Pause size={12} /> : <Bot size={12} />} {contact.bot_paused === 1 ? 'Bot Paused' : 'Bot Active'}
                </span>
              </div>
            </div>
            <button onClick={() => onNavigateInbox?.(contact)} className="btn btn-primary" style={{ padding: '8px 14px', borderRadius: 8, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <MessageSquare size={14} /> Inbox
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid var(--border)', padding: '0 12px', background: 'var(--bg-surface)', flexShrink: 0 }}>
          {TABS.map((tab) => (
            <button
              key={tab} onClick={() => setActiveTab(tab)}
              style={{
                padding: '11px 14px', fontSize: '0.82rem', fontWeight: activeTab === tab ? 700 : 500, whiteSpace: 'nowrap',
                border: 'none', background: 'none', cursor: 'pointer', color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
                borderBottom: activeTab === tab ? '2.5px solid var(--text-primary)' : '2.5px solid transparent',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {activeTab === 'Overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={14} /> About Contact
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Phone:</span>
                    <strong style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>{contact.phone || '—'}</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Email:</span>
                    <span style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>{contact.email || '—'}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>External ID:</span>
                    <code style={{ fontSize: '0.76rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', padding: '2px 6px', borderRadius: 4 }}>
                      {contact.external_id || '—'}
                    </code>
                  </div>
                  {contact.accountLabel && (
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Account:</span>
                      <span style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>{contact.accountLabel}</span>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={14} /> Engagement Info
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Subscribed On:</span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{fmtDate(contact.created_at)}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Last Activity:</span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{fmtDate(contact.lastActivity || contact.updated_at)}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase' }}>Status:</span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                      {contact.retained ? 'Retained · ' : ''}{subscribed ? 'Subscribed' : 'Unsubscribed'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Notes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <form onSubmit={handleAddNote} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea
                  rows={3} className="form-input" placeholder="Write an internal note for this subscriber..."
                  value={newNote} onChange={(e) => setNewNote(e.target.value)} style={{ fontSize: '0.84rem', resize: 'none' }}
                />
                <button type="submit" disabled={savingNote || !newNote.trim()} className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-end' }}>
                  <Plus size={13} /> {savingNote ? 'Saving...' : 'Add Note'}
                </button>
              </form>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {notes.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>No notes recorded yet.</div>
                ) : notes.map((n) => (
                  <div key={n.id} style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                    <div style={{ color: 'var(--text-primary)', fontSize: '0.84rem', lineHeight: 1.45 }}>{n.note}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                      <span>By {n.userName || 'Agent'}</span>
                      <span>{fmtDate(n.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'Labels' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {contactLabels.length === 0 ? (
                  <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>No labels attached yet.</span>
                ) : contactLabels.map((lbl) => (
                  <span key={lbl.id} style={{ ...chip, gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: lbl.color }} />
                    {lbl.name}
                    <button onClick={() => handleRemoveLabel(lbl.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
              {unattachedLabels.length > 0 && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={addLabelId} onChange={(e) => setAddLabelId(e.target.value)} className="form-input" style={{ flex: 1, height: 34, fontSize: '0.82rem' }}>
                    <option value="">-- Attach a label --</option>
                    {unattachedLabels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <button onClick={handleAddLabel} disabled={!addLabelId} className="btn btn-secondary btn-sm" style={{ height: 34 }}>
                    <Tag size={12} /> Attach
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === 'Sequences' && (
            <div>
              {sequences.length === 0 ? (
                <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>No automated sequences enrolled.</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sequences.map((s) => (
                    <div key={s.id} style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Zap size={12} /> {s.sequence_name}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          {s.status === 'ACTIVE' && s.next_run_at ? `Next message: ${fmtDate(s.next_run_at)}` : s.status === 'COMPLETED' ? 'Completed' : 'Stopped'}
                        </div>
                      </div>
                      {s.status === 'ACTIVE' && (
                        <button type="button" onClick={() => handleStopSequence(s)} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>
                          Stop
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'Custom Fields' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {customFields.length === 0 ? (
                <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                  No custom fields defined yet — add one from Manage → Custom Fields.
                </span>
              ) : customFields.map((f) => (
                <div key={f.field_id}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5 }}>
                    <SlidersHorizontal size={11} /> {f.name}
                  </label>
                  {f.field_type === 'SELECT' ? (
                    <select
                      className="form-input" style={{ width: '100%', height: 34, fontSize: '0.82rem' }}
                      value={f.value || ''} onChange={(e) => handleFieldChange(f, e.target.value)} onBlur={() => handleFieldSave(f)}
                    >
                      <option value="">—</option>
                      {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      type={f.field_type === 'NUMBER' ? 'number' : f.field_type === 'DATE' ? 'date' : 'text'}
                      className="form-input" style={{ width: '100%', height: 34, fontSize: '0.82rem' }}
                      value={f.value || ''} onChange={(e) => handleFieldChange(f, e.target.value)} onBlur={() => handleFieldSave(f)}
                      placeholder={savingFieldId === f.field_id ? 'Saving...' : '—'}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'Agent' && (
            <div>
              <span style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>Unassigned to dedicated team agent.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
