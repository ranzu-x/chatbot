import { useState } from 'react';
import { cannedResponseAPI } from '../../services/api';
import { X, Zap } from 'lucide-react';

export default function CreateCannedModal({ open, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [shortcut, setShortcut] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setError('Title and message body are required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await cannedResponseAPI.create({
        title: title.trim(),
        shortcut: shortcut.trim().replace(/^\//, '') || null,
        body: body.trim(),
      });
      const created = res.data?.cannedResponse || res.data;
      if (onCreated) onCreated(created);
      setTitle('');
      setShortcut('');
      setBody('');
      onClose();
    } catch (err) {
      console.error('Failed to create canned response:', err);
      setError(err?.response?.data?.message || 'Failed to create canned message.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(3px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 480,
          maxWidth: '94vw',
          background: '#ffffff',
          borderRadius: 14,
          padding: 24,
          border: '1px solid #e2e8f0',
          boxShadow: '0 20px 35px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                color: '#2563eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #bfdbfe',
              }}
            >
              <Zap size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.02rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                New Canned Message
              </h3>
              <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '2px 0 0 0' }}>
                Saved reply accessible with a "/" shortcut in the shared inbox
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 6,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              fontSize: '0.78rem',
              marginBottom: 14,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
              Title / Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              required
              className="form-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Greeting & Welcome"
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.84rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
              Shortcut (optional)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#6366f1', fontFamily: 'monospace' }}>/</span>
              <input
                type="text"
                className="form-input"
                value={shortcut}
                onChange={(e) => setShortcut(e.target.value)}
                placeholder="e.g. hello, refund, hours"
                style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.84rem' }}
              />
            </div>
            <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 3, display: 'block' }}>
              Type /shortcut in the composer to quickly insert this reply
            </span>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
              Message Body <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              required
              rows={4}
              className="form-input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type the message text..."
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                fontSize: '0.84rem',
                resize: 'vertical',
                lineHeight: 1.45,
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: '7px 16px',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#475569',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim() || !body.trim()}
              style={{
                padding: '7px 18px',
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                color: '#ffffff',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: saving ? 'default' : 'pointer',
                opacity: saving ? 0.7 : 1,
                boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
              }}
            >
              {saving ? 'Saving...' : 'Save Canned Message'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
