import { useState } from 'react';
import { X, AlertTriangle, ListChecks, Zap } from 'lucide-react';

function ModalShell({ children, onClose, width = 420 }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(2px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width, maxWidth: '92vw', background: 'var(--bg-surface)', borderRadius: 14, padding: 22,
          boxShadow: 'var(--shadow-md)', border: '1px solid var(--border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

const selectStyle = { height: 38, fontSize: '0.84rem', width: '100%' };

// ─── ADD TO / REMOVE FROM LIST ────────────────────────────────────────────
export function BulkListModal({ mode, count, lists, onClose, onConfirm }) {
  const [listId, setListId] = useState('');
  const [busy, setBusy] = useState(false);
  const isAdd = mode === 'add';

  const submit = async () => {
    if (!listId) return;
    setBusy(true);
    try { await onConfirm(listId); } finally { setBusy(false); }
  };

  return (
    <ModalShell onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: '1.02rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ListChecks size={16} /> {isAdd ? 'Add to List' : 'Remove from List'}
        </h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={16} /></button>
      </div>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
        {isAdd ? 'Add' : 'Remove'} <strong>{count}</strong> subscriber(s) {isAdd ? 'to' : 'from'} which list?
      </p>
      {lists.length === 0 ? (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-base)', border: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          No lists yet — create one from Manage → Lists first.
        </div>
      ) : (
        <select value={listId} onChange={(e) => setListId(e.target.value)} className="form-input" style={selectStyle}>
          <option value="">-- Choose a list --</option>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.memberCount || 0})</option>)}
        </select>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
        <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
        <button type="button" disabled={!listId || busy} onClick={submit} className="btn btn-primary">
          {busy ? 'Working...' : isAdd ? 'Add' : 'Remove'}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── ASSIGN SEQUENCE ───────────────────────────────────────────────────────
export function BulkSequenceModal({ count, sequences, onClose, onConfirm }) {
  const [sequenceId, setSequenceId] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!sequenceId) return;
    setBusy(true);
    try { await onConfirm(sequenceId); } finally { setBusy(false); }
  };

  return (
    <ModalShell onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ fontSize: '1.02rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={16} /> Assign Sequence
        </h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={16} /></button>
      </div>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
        Enroll <strong>{count}</strong> subscriber(s) into which sequence? Only subscribers on that sequence's own channel are enrolled — the rest are skipped.
      </p>
      {sequences.length === 0 ? (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-base)', border: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          No sequences yet — build one from Bot Manager → Automation → Sequences.
        </div>
      ) : (
        <select value={sequenceId} onChange={(e) => setSequenceId(e.target.value)} className="form-input" style={selectStyle}>
          <option value="">-- Choose a sequence --</option>
          {sequences.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.platform})</option>)}
        </select>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
        <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
        <button type="button" disabled={!sequenceId || busy} onClick={submit} className="btn btn-primary">
          {busy ? 'Enrolling...' : 'Assign'}
        </button>
      </div>
    </ModalShell>
  );
}

// ─── DELETE CONFIRMATION (explicit warning) ───────────────────────────────
export function DeleteConfirmModal({ count, singleName, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const needsTyped = count >= 5;
  const canDelete = needsTyped ? confirmText.trim().toUpperCase() === 'DELETE' : true;

  const submit = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };

  return (
    <ModalShell onClose={onClose} width={440}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#b91c1c',
        }}>
          <AlertTriangle size={18} />
        </div>
        <div>
          <h3 style={{ fontSize: '1.02rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Delete {count > 1 ? `${count} subscribers` : (singleName || 'this subscriber')}?
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '6px 0 0', lineHeight: 1.5 }}>
            This permanently deletes {count > 1 ? 'their' : 'their'} conversation history, messages, sequence
            enrollments, notes, and custom field values. <strong>This cannot be undone.</strong>
          </p>
        </div>
      </div>

      {needsTyped && (
        <div style={{ marginBottom: 6 }}>
          <label style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-muted)', marginBottom: 5 }}>
            Type <strong>DELETE</strong> to confirm removing {count} subscribers:
          </label>
          <input
            autoFocus type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
            className="form-input" style={{ width: '100%', height: 36, fontSize: '0.84rem' }}
          />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
        <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
        <button
          type="button" disabled={busy || !canDelete} onClick={submit}
          style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(220,38,38,0.3)',
            background: canDelete ? 'rgba(220,38,38,0.08)' : 'var(--bg-hover)', color: '#b91c1c',
            fontWeight: 700, fontSize: '0.84rem', cursor: canDelete ? 'pointer' : 'not-allowed', opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </ModalShell>
  );
}
