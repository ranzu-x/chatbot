import { useState, useEffect } from 'react';
import { conversationAPI, teamAPI } from '../../services/api';
import { UserCheck, X, Edit3 } from 'lucide-react';

/**
 * Live Inbox "Join Chat" — a modal (rather than an instant action) so the
 * agent can choose whether to include their own signature message before
 * taking over. Pauses Bot/AI and assigns the conversation to the caller
 * (POST /conversations/:id/join, already built), then — if requested —
 * sends the signature as a normal outbound message through the existing
 * composer send pipeline (POST /conversations/:id/messages), so it gets
 * the same delivery/tick-mark handling as anything else typed by hand.
 */
export default function JoinChatModal({ open, onClose, conversationId, onJoined }) {
  const [signature, setSignature] = useState('');
  const [loadingSignature, setLoadingSignature] = useState(true);
  const [includeSignature, setIncludeSignature] = useState(true);
  const [editingSignature, setEditingSignature] = useState(false);
  const [draftSignature, setDraftSignature] = useState('');
  const [savingSignature, setSavingSignature] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingSignature(true);
    setEditingSignature(false);
    teamAPI.getMySignature()
      .then((res) => {
        const sig = res.data?.signature || '';
        setSignature(sig);
        setDraftSignature(sig);
        setIncludeSignature(Boolean(sig));
      })
      .catch(() => setSignature(''))
      .finally(() => setLoadingSignature(false));
  }, [open]);

  const handleSaveSignature = async () => {
    setSavingSignature(true);
    try {
      const res = await teamAPI.updateMySignature(draftSignature.trim());
      const sig = res.data?.signature || '';
      setSignature(sig);
      setIncludeSignature(Boolean(sig));
      setEditingSignature(false);
    } catch (err) {
      console.error('Failed to save signature', err);
    } finally {
      setSavingSignature(false);
    }
  };

  const handleJoinNow = async () => {
    if (!conversationId || joining) return;
    setJoining(true);
    try {
      const joinRes = await conversationAPI.join(conversationId);
      let sentMessage = null;
      if (includeSignature && signature.trim()) {
        const sendRes = await conversationAPI.sendMessage(conversationId, { body: signature.trim() });
        sentMessage = sendRes.data?.message || null;
      }
      onJoined?.({ ...joinRes.data, sentMessage });
      onClose?.();
    } catch (err) {
      console.error('Failed to join chat', err);
      alert(err?.response?.data?.message || 'Failed to join chat');
    } finally {
      setJoining(false);
    }
  };

  if (!open) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 420, maxWidth: '96vw', background: '#fff', borderRadius: 16, boxShadow: '0 20px 50px rgba(0,0,0,0.2)', overflow: 'hidden' }}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserCheck size={19} color="#2563eb" /> Join Chat
          </h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>
            This pauses Bot/AI for this conversation and assigns it to you. Only a human agent will be able to reply until it's resumed.
          </p>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: signature.trim() ? 'pointer' : 'default' }}>
              <input
                type="checkbox"
                checked={includeSignature}
                disabled={!signature.trim()}
                onChange={(e) => setIncludeSignature(e.target.checked)}
              />
              <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>Include my signature message</span>
            </label>

            {loadingSignature ? (
              <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 8 }}>Loading…</div>
            ) : editingSignature ? (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <textarea
                  rows={3}
                  value={draftSignature}
                  onChange={(e) => setDraftSignature(e.target.value)}
                  placeholder="e.g. Hi, this is Alex from support — happy to help!"
                  className="form-input"
                  style={{ fontSize: '0.82rem', resize: 'none' }}
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => { setEditingSignature(false); setDraftSignature(signature); }} className="btn btn-secondary btn-sm">Cancel</button>
                  <button type="button" onClick={handleSaveSignature} disabled={savingSignature} className="btn btn-primary btn-sm">
                    {savingSignature ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: '0.8rem', color: signature.trim() ? '#475569' : '#94a3b8', lineHeight: 1.4, flex: 1 }}>
                  {signature.trim() || "You haven't set a signature yet — every team member configures their own."}
                </div>
                <button
                  type="button"
                  onClick={() => setEditingSignature(true)}
                  title="Edit your signature"
                  style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.76rem', fontWeight: 700, flexShrink: 0 }}
                >
                  <Edit3 size={12} /> {signature.trim() ? 'Edit' : 'Set signature'}
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
            <button type="button" onClick={handleJoinNow} disabled={joining} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <UserCheck size={14} /> {joining ? 'Joining…' : 'Join Now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
