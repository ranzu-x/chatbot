import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../../Layout/AppLayout';
import { flowAPI } from '../../services/api';
import { useNavigate, useLocation } from 'react-router';

/* ─── constants ─── */
const PLATFORMS = {
  WHATSAPP:  { label: 'WhatsApp',  emoji: '💬', color: '#25d366' },
  FACEBOOK:  { label: 'Facebook',  emoji: '👤', color: '#1877f2' },
  INSTAGRAM: { label: 'Instagram', emoji: '📸', color: '#e1306c' },
  TELEGRAM:  { label: 'Telegram',  emoji: '✈️', color: '#229ed9' },
  WEBCHAT:   { label: 'Webchat',   emoji: '🌐', color: '#6366f1' },
};

const TRIGGER_TYPES = [
  { value: 'KEYWORD',       label: 'Keyword' },
  { value: 'ANY',           label: 'Any Message' },
  { value: 'FIRST_CONTACT', label: 'First Contact' },
  { value: 'POSTBACK',      label: 'Postback' },
];

const TRIGGER_EMOJI = {
  KEYWORD: '🔑',
  ANY: '💬',
  FIRST_CONTACT: '👋',
  POSTBACK: '🔗',
};

/* ─── keyframes injected once ─── */
const STYLE_ID = '__flow-list-keyframes';
function injectKeyframes() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes flFadeUp   { from { opacity:0; transform:translateY(24px) } to { opacity:1; transform:translateY(0) } }
    @keyframes flOverlay  { from { opacity:0 } to { opacity:1 } }
    @keyframes flSlideUp  { from { opacity:0; transform:translate(-50%,-50%) scale(.92) } to { opacity:1; transform:translate(-50%,-50%) scale(1) } }
    @keyframes flPulse    { 0%,100%{ box-shadow:0 0 0 0 rgba(99,102,241,.45) } 70%{ box-shadow:0 0 0 10px rgba(99,102,241,0) } }
    @keyframes flSpin     { to { transform:rotate(360deg) } }
    @keyframes flToastIn  { from { transform:translateX(120%); opacity:0 } to { transform:translateX(0); opacity:1 } }
    @keyframes flToastOut { from { transform:translateX(0); opacity:1 } to { transform:translateX(120%); opacity:0 } }
    @keyframes flShimmer  { 0%{ background-position:-200% 0 } 100%{ background-position:200% 0 } }
    @keyframes flBounce   { 0%,100%{ transform:translateY(0) } 50%{ transform:translateY(-6px) } }
  `;
  document.head.appendChild(style);
}

/* ─── Toast system ─── */
function Toast({ toasts, onRemove }) {
  return (
    <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 10000, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {toasts.map(t => (
        <div
          key={t.id}
          style={{
            minWidth: 280,
            padding: '14px 20px',
            borderRadius: 'var(--radius, 12px)',
            color: '#fff',
            fontSize: 14,
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: t.type === 'success'
              ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
              : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            boxShadow: '0 8px 32px rgba(0,0,0,.25)',
            animation: t.leaving ? 'flToastOut .3s ease forwards' : 'flToastIn .35s cubic-bezier(.22,1,.36,1)',
            cursor: 'pointer',
            backdropFilter: 'blur(12px)',
          }}
          onClick={() => onRemove(t.id)}
        >
          <span style={{ fontSize: 18 }}>{t.type === 'success' ? '✅' : '❌'}</span>
          <span style={{ flex: 1 }}>{t.message}</span>
          <span style={{ opacity: .7, fontSize: 18, lineHeight: 1 }}>×</span>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, leaving: false }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t));
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 350);
    }, 3500);
  }, []);
  const remove = useCallback(id => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 350);
  }, []);
  return { toasts, push, remove };
}

/* ─── Delete confirmation modal ─── */
function DeleteModal({ flow, onConfirm, onCancel }) {
  if (!flow) return null;
  return (
    <>
      <div onClick={onCancel} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(6px)',
        zIndex: 9000, animation: 'flOverlay .2s ease',
      }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 9001, width: 420, maxWidth: '92vw',
        background: 'var(--bg-card, #1e1e2e)', border: '1px solid var(--border, rgba(255,255,255,.08))',
        borderRadius: 'var(--radius, 12px)', padding: 32,
        boxShadow: '0 24px 64px rgba(0,0,0,.4)',
        animation: 'flSlideUp .3s cubic-bezier(.22,1,.36,1)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 48 }}>🗑️</span>
          <h3 style={{ color: 'var(--text-primary, #fff)', fontSize: 20, fontWeight: 700, margin: '12px 0 8px' }}>
            Delete Flow
          </h3>
          <p style={{ color: 'var(--text-secondary, #a1a1aa)', fontSize: 14, lineHeight: 1.6 }}>
            Are you sure you want to delete <strong style={{ color: '#ef4444' }}>"{flow.name}"</strong>?
            This action cannot be undone.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '12px 0', borderRadius: 'var(--radius, 12px)',
            border: '1px solid var(--border, rgba(255,255,255,.12))',
            background: 'transparent', color: 'var(--text-primary, #fff)',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            transition: 'all .2s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.06)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >Cancel</button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: '12px 0', borderRadius: 'var(--radius, 12px)',
            border: 'none',
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            transition: 'all .2s',
          }}
            onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.1)'}
            onMouseLeave={e => e.currentTarget.style.filter = 'none'}
          >Delete Flow</button>
        </div>
      </div>
    </>
  );
}

/* ─── Create flow modal ─── */
function CreateModal({ open, onClose, onCreate, creating }) {
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('WHATSAPP');
  const [triggerType, setTriggerType] = useState('KEYWORD');
  const [triggerKeyword, setTriggerKeyword] = useState('');

  if (!open) return null;

  const canSubmit = name.trim() && (triggerType !== 'KEYWORD' || triggerKeyword.trim());

  const handleSubmit = e => {
    e.preventDefault();
    if (!canSubmit || creating) return;
    onCreate({
      name: name.trim(),
      platform,
      trigger_type: triggerType,
      trigger_keyword: triggerType === 'KEYWORD' ? triggerKeyword.trim() : '',
    });
  };

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: 'var(--radius, 12px)',
    border: '1px solid var(--border, rgba(255,255,255,.12))',
    background: 'var(--bg-surface, rgba(255,255,255,.04))',
    color: 'var(--text-primary, #fff)',
    fontSize: 14,
    outline: 'none',
    transition: 'border-color .2s, box-shadow .2s',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block', marginBottom: 6,
    color: 'var(--text-secondary, #a1a1aa)', fontSize: 13, fontWeight: 600,
    letterSpacing: '.3px',
  };

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(6px)',
        zIndex: 9000, animation: 'flOverlay .2s ease',
      }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 9001, width: 480, maxWidth: '94vw',
        background: 'var(--bg-card, #1e1e2e)', border: '1px solid var(--border, rgba(255,255,255,.08))',
        borderRadius: 'var(--radius, 12px)', padding: 0,
        boxShadow: '0 24px 64px rgba(0,0,0,.45)',
        animation: 'flSlideUp .3s cubic-bezier(.22,1,.36,1)',
        overflow: 'hidden',
      }}>
        {/* header */}
        <div style={{
          padding: '24px 28px 20px',
          background: 'linear-gradient(135deg, rgba(99,102,241,.15) 0%, rgba(99,102,241,.05) 100%)',
          borderBottom: '1px solid var(--border, rgba(255,255,255,.08))',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{ color: 'var(--text-primary, #fff)', fontSize: 20, fontWeight: 700, margin: 0 }}>
              ✨ Create New Flow
            </h3>
            <p style={{ color: 'var(--text-secondary, #a1a1aa)', fontSize: 13, margin: '4px 0 0' }}>
              Set up your chatbot automation
            </p>
          </div>
          <button onClick={onClose} style={{
            width: 36, height: 36, borderRadius: '50%', border: 'none',
            background: 'rgba(255,255,255,.06)', color: 'var(--text-secondary, #a1a1aa)',
            fontSize: 20, cursor: 'pointer', display: 'grid', placeItems: 'center',
            transition: 'all .2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.12)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,.06)'; e.currentTarget.style.color = 'var(--text-secondary, #a1a1aa)'; }}
          >×</button>
        </div>

        {/* body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px 28px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* name */}
          <div>
            <label style={labelStyle}>Flow Name</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Welcome Flow"
              style={inputStyle}
              autoFocus
              onFocus={e => { e.target.style.borderColor = 'var(--primary, #6366f1)'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,.18)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--border, rgba(255,255,255,.12))'; e.target.style.boxShadow = 'none'; }}
            />
          </div>

          {/* platform */}
          <div>
            <label style={labelStyle}>Platform</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {Object.entries(PLATFORMS).map(([key, p]) => (
                <button type="button" key={key} onClick={() => setPlatform(key)} style={{
                  padding: '10px 4px', borderRadius: 'var(--radius, 12px)',
                  border: platform === key ? `2px solid ${p.color}` : '1px solid var(--border, rgba(255,255,255,.12))',
                  background: platform === key ? `${p.color}18` : 'transparent',
                  color: platform === key ? p.color : 'var(--text-secondary, #a1a1aa)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  transition: 'all .2s',
                }}>
                  <span style={{ fontSize: 20 }}>{p.emoji}</span>
                  <span>{p.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* trigger type */}
          <div>
            <label style={labelStyle}>Trigger Type</label>
            <select
              value={triggerType} onChange={e => setTriggerType(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer', appearance: 'auto' }}
              onFocus={e => { e.target.style.borderColor = 'var(--primary, #6366f1)'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,.18)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--border, rgba(255,255,255,.12))'; e.target.style.boxShadow = 'none'; }}
            >
              {TRIGGER_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* keyword */}
          {triggerType === 'KEYWORD' && (
            <div style={{ animation: 'flFadeUp .25s ease' }}>
              <label style={labelStyle}>Trigger Keyword</label>
              <input
                value={triggerKeyword} onChange={e => setTriggerKeyword(e.target.value)}
                placeholder="e.g. /start"
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = 'var(--primary, #6366f1)'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,.18)'; }}
                onBlur={e => { e.target.style.borderColor = 'var(--border, rgba(255,255,255,.12))'; e.target.style.boxShadow = 'none'; }}
              />
            </div>
          )}

          {/* submit */}
          <button type="submit" disabled={!canSubmit || creating} style={{
            padding: '14px 0', borderRadius: 'var(--radius, 12px)', border: 'none',
            background: canSubmit && !creating
              ? 'linear-gradient(135deg, var(--primary, #6366f1) 0%, #818cf8 100%)'
              : 'rgba(99,102,241,.25)',
            color: '#fff', fontSize: 15, fontWeight: 700, cursor: canSubmit && !creating ? 'pointer' : 'not-allowed',
            transition: 'all .2s', letterSpacing: '.3px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
            onMouseEnter={e => { if (canSubmit && !creating) e.currentTarget.style.filter = 'brightness(1.1)'; }}
            onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
          >
            {creating ? (
              <>
                <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'flSpin .6s linear infinite', display: 'inline-block' }} />
                Creating…
              </>
            ) : (
              <>🚀 Create Flow</>
            )}
          </button>
        </form>
      </div>
    </>
  );
}

/* ─── Flow card ─── */
function FlowCard({ flow, index, onEdit, onToggle, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const [toggling, setToggling] = useState(false);
  const p = PLATFORMS[flow.platform] || PLATFORMS.WEBCHAT;

  const handleToggle = async () => {
    setToggling(true);
    await onToggle(flow);
    setToggling(false);
  };

  const formattedDate = flow.updated_at
    ? new Date(flow.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        background: 'var(--bg-card, #1e1e2e)',
        border: `1px solid ${hovered ? `${p.color}55` : 'var(--border, rgba(255,255,255,.08))'}`,
        borderRadius: 'var(--radius, 12px)',
        padding: 0,
        overflow: 'hidden',
        transition: 'all .3s cubic-bezier(.22,1,.36,1)',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        boxShadow: hovered
          ? `0 16px 48px rgba(0,0,0,.3), 0 0 0 1px ${p.color}22`
          : 'var(--shadow, 0 2px 8px rgba(0,0,0,.15))',
        animation: `flFadeUp .45s cubic-bezier(.22,1,.36,1) ${index * 0.06}s both`,
        cursor: 'default',
      }}
    >
      {/* top color accent */}
      <div style={{
        height: 4,
        background: `linear-gradient(90deg, ${p.color}, ${p.color}88)`,
        opacity: flow.is_active ? 1 : .3,
        transition: 'opacity .3s',
      }} />

      <div style={{ padding: '20px 22px 18px' }}>
        {/* row 1: name + status */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{
              color: 'var(--text-primary, #fff)', fontSize: 17, fontWeight: 700,
              margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{flow.name}</h3>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              marginTop: 8, padding: '4px 10px', borderRadius: 20,
              background: `${p.color}18`, color: p.color,
              fontSize: 12, fontWeight: 600, letterSpacing: '.3px',
            }}>
              {p.emoji} {p.label}
            </span>
          </div>

          {/* toggle */}
          <button
            onClick={handleToggle}
            disabled={toggling}
            title={flow.is_active ? 'Deactivate' : 'Activate'}
            style={{
              position: 'relative', width: 46, height: 26, borderRadius: 13, border: 'none',
              background: flow.is_active
                ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                : 'rgba(255,255,255,.1)',
              cursor: toggling ? 'wait' : 'pointer',
              transition: 'background .25s',
              flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: flow.is_active ? 23 : 3,
              width: 20, height: 20, borderRadius: '50%', background: '#fff',
              transition: 'left .25s cubic-bezier(.22,1,.36,1)',
              boxShadow: '0 1px 4px rgba(0,0,0,.2)',
            }} />
          </button>
        </div>

        {/* info row */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '8px 16px',
          marginBottom: 16, fontSize: 13, color: 'var(--text-secondary, #a1a1aa)',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {TRIGGER_EMOJI[flow.trigger_type] || '🔑'} {flow.trigger_type === 'KEYWORD' ? `"${flow.trigger_keyword}"` : (TRIGGER_TYPES.find(t => t.value === flow.trigger_type)?.label || flow.trigger_type)}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            🧩 {flow.nodeCount ?? 0} node{(flow.nodeCount ?? 0) !== 1 ? 's' : ''}
          </span>
          {flow.botName && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              🤖 {flow.botName}
            </span>
          )}
        </div>

        {/* footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 14,
          borderTop: '1px solid var(--border, rgba(255,255,255,.06))',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary, #a1a1aa)', opacity: .7 }}>
            Updated {formattedDate}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onEdit(flow)} style={{
              padding: '7px 16px', borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, var(--primary, #6366f1) 0%, #818cf8 100%)',
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              transition: 'all .2s', display: 'flex', alignItems: 'center', gap: 5,
            }}
              onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.15)'}
              onMouseLeave={e => e.currentTarget.style.filter = 'none'}
            >✏️ Edit</button>
            <button onClick={() => onDelete(flow)} style={{
              padding: '7px 14px', borderRadius: 8,
              border: '1px solid rgba(239,68,68,.25)',
              background: 'rgba(239,68,68,.08)',
              color: '#ef4444', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              transition: 'all .2s', display: 'flex', alignItems: 'center', gap: 5,
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,.18)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,.08)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,.25)'; }}
            >🗑️</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Empty state ─── */
function EmptyState({ onCreate }) {
  return (
    <div style={{
      gridColumn: '1 / -1',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '80px 20px',
      animation: 'flFadeUp .5s ease',
    }}>
      <div style={{ fontSize: 64, marginBottom: 8, animation: 'flBounce 2s ease-in-out infinite' }}>
        🤖
      </div>
      <div style={{ fontSize: 40, marginBottom: 20, letterSpacing: 8 }}>
        💬 ✨ 🔗
      </div>
      <h3 style={{
        color: 'var(--text-primary, #fff)', fontSize: 24, fontWeight: 700,
        margin: '0 0 8px', textAlign: 'center',
      }}>No Flows Yet</h3>
      <p style={{
        color: 'var(--text-secondary, #a1a1aa)', fontSize: 15,
        margin: '0 0 28px', textAlign: 'center', maxWidth: 420, lineHeight: 1.6,
      }}>
        Create your first chatbot flow to automate conversations across platforms.
        Build once, deploy everywhere.
      </p>
      <button onClick={onCreate} style={{
        padding: '14px 32px', borderRadius: 'var(--radius, 12px)', border: 'none',
        background: 'linear-gradient(135deg, var(--primary, #6366f1) 0%, #818cf8 100%)',
        color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
        transition: 'all .2s', animation: 'flPulse 2s infinite',
        display: 'flex', alignItems: 'center', gap: 8,
      }}
        onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.15)'}
        onMouseLeave={e => e.currentTarget.style.filter = 'none'}
      >
        ✨ Create Your First Flow
      </button>
    </div>
  );
}

/* ─── Loading skeleton ─── */
function SkeletonCard({ index }) {
  return (
    <div style={{
      background: 'var(--bg-card, #1e1e2e)',
      border: '1px solid var(--border, rgba(255,255,255,.08))',
      borderRadius: 'var(--radius, 12px)',
      overflow: 'hidden',
      animation: `flFadeUp .4s ease ${index * 0.08}s both`,
    }}>
      <div style={{ height: 4, background: 'rgba(255,255,255,.06)' }} />
      <div style={{ padding: '20px 22px 18px' }}>
        {[100, 60, 140].map((w, i) => (
          <div key={i} style={{
            height: i === 0 ? 20 : 14, width: `${w}%`, maxWidth: w,
            borderRadius: 6, marginBottom: i < 2 ? 12 : 0,
            background: 'linear-gradient(90deg, rgba(255,255,255,.04) 25%, rgba(255,255,255,.08) 50%, rgba(255,255,255,.04) 75%)',
            backgroundSize: '200% 100%',
            animation: 'flShimmer 1.5s ease infinite',
          }} />
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */
export default function FlowListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toasts, push: toast, remove: removeToast } = useToast();

  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [searchTerm, setSearchTerm] = useState(() => location.state?.searchTerm || '');
  const [filterPlatform, setFilterPlatform] = useState(() => location.state?.filterPlatform || 'ALL');

  /* inject keyframes */
  useEffect(() => { injectKeyframes(); }, []);

  /* fetch flows */
  const fetchFlows = useCallback(async () => {
    try {
      setLoading(true);
      const res = await flowAPI.getAll();
      if (res.data?.success) {
        setFlows(res.data.flows || []);
      }
    } catch (err) {
      toast('Failed to load flows', 'error');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchFlows(); }, [fetchFlows]);

  /* actions */
  const handleCreate = async (data) => {
    try {
      setCreating(true);
      const res = await flowAPI.create(data);
      if (res.data?.success) {
        toast(`Flow "${data.name}" created!`);
        setShowCreate(false);
        const flowId = res.data?.flowId || res.data?.flow?.id || res.data?.id;
        if (flowId) {
          navigate(`/flows/${flowId}/edit`, {
            state: {
              from: location.pathname + location.search,
              label: 'Flows',
              searchTerm,
              filterPlatform,
            },
          });
        } else {
          fetchFlows();
        }
      } else {
        toast(res.data?.message || 'Failed to create flow', 'error');
      }
    } catch (err) {
      toast(err.response?.data?.message || 'Error creating flow', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (flow) => {
    try {
      const res = await flowAPI.toggle(flow.id);
      if (res.data?.success) {
        setFlows(prev => prev.map(f => f.id === flow.id ? { ...f, is_active: !f.is_active } : f));
        toast(`"${flow.name}" ${flow.is_active ? 'deactivated' : 'activated'}`);
      }
    } catch (err) {
      toast('Failed to toggle flow', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await flowAPI.delete(deleteTarget.id);
      if (res.data?.success) {
        setFlows(prev => prev.filter(f => f.id !== deleteTarget.id));
        toast(`"${deleteTarget.name}" deleted`);
      }
    } catch (err) {
      toast('Failed to delete flow', 'error');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleEdit = (flow) => navigate(`/flows/${flow.id}/edit`, {
    state: {
      from: location.pathname + location.search,
      label: 'Flows',
      searchTerm,
      filterPlatform,
    },
  });

  /* filter */
  const filtered = flows.filter(f => {
    const matchesSearch = !searchTerm || f.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPlatform = filterPlatform === 'ALL' || f.platform === filterPlatform;
    return matchesSearch && matchesPlatform;
  });

  /* ─── render ─── */
  return (
    <AppLayout>
      <Toast toasts={toasts} onRemove={removeToast} />
      <DeleteModal flow={deleteTarget} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      <CreateModal open={showCreate} onClose={() => setShowCreate(false)} onCreate={handleCreate} creating={creating} />

      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 28px' }}>

        {/* ── page header ── */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 16, marginBottom: 32,
          animation: 'flFadeUp .4s ease',
        }}>
          <div>
            <h1 style={{
              color: 'var(--text-primary, #fff)', fontSize: 32, fontWeight: 800,
              margin: 0, letterSpacing: '-.5px',
              background: 'linear-gradient(135deg, var(--primary, #6366f1) 0%, #a78bfa 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              🔀 Flow Builder
            </h1>
            <p style={{
              color: 'var(--text-secondary, #a1a1aa)', fontSize: 15, margin: '6px 0 0',
              lineHeight: 1.5,
            }}>
              Design, manage & automate your chatbot conversations
            </p>
          </div>
          <button onClick={() => setShowCreate(true)} style={{
            padding: '12px 28px', borderRadius: 'var(--radius, 12px)', border: 'none',
            background: 'linear-gradient(135deg, var(--primary, #6366f1) 0%, #818cf8 100%)',
            color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            transition: 'all .25s',
            boxShadow: '0 4px 20px rgba(99,102,241,.35)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(99,102,241,.45)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(99,102,241,.35)'; }}
          >
            <span style={{ fontSize: 18 }}>＋</span> New Flow
          </button>
        </div>

        {/* ── filters bar ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          marginBottom: 28, animation: 'flFadeUp .45s ease .05s both',
        }}>
          {/* search */}
          <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 360 }}>
            <span style={{
              position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
              fontSize: 16, pointerEvents: 'none', opacity: .5,
            }}>🔍</span>
            <input
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search flows…"
              style={{
                width: '100%', padding: '11px 14px 11px 40px',
                borderRadius: 'var(--radius, 12px)',
                border: '1px solid var(--border, rgba(255,255,255,.1))',
                background: 'var(--bg-card, rgba(255,255,255,.04))',
                color: 'var(--text-primary, #fff)', fontSize: 14, outline: 'none',
                transition: 'border-color .2s, box-shadow .2s',
                boxSizing: 'border-box',
              }}
              onFocus={e => { e.target.style.borderColor = 'var(--primary, #6366f1)'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,.15)'; }}
              onBlur={e => { e.target.style.borderColor = 'var(--border, rgba(255,255,255,.1))'; e.target.style.boxShadow = 'none'; }}
            />
          </div>

          {/* platform tabs */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[{ key: 'ALL', label: 'All', emoji: '📋' }, ...Object.entries(PLATFORMS).map(([k, v]) => ({ key: k, label: v.label, emoji: v.emoji, color: v.color }))].map(tab => {
              const active = filterPlatform === tab.key;
              return (
                <button key={tab.key} onClick={() => setFilterPlatform(tab.key)} style={{
                  padding: '8px 14px', borderRadius: 20,
                  border: active ? `1.5px solid ${tab.color || 'var(--primary, #6366f1)'}` : '1px solid var(--border, rgba(255,255,255,.08))',
                  background: active ? `${tab.color || 'var(--primary, #6366f1)'}18` : 'transparent',
                  color: active ? (tab.color || 'var(--primary, #6366f1)') : 'var(--text-secondary, #a1a1aa)',
                  fontSize: 13, fontWeight: active ? 600 : 500, cursor: 'pointer',
                  transition: 'all .2s',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  {tab.emoji} {tab.label}
                </button>
              );
            })}
          </div>

          {/* count badge */}
          <span style={{
            marginLeft: 'auto', padding: '6px 14px', borderRadius: 20,
            background: 'rgba(99,102,241,.1)', color: 'var(--primary, #6366f1)',
            fontSize: 13, fontWeight: 600,
          }}>
            {filtered.length} flow{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* ── grid ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340, 1fr))',
          gap: 20,
        }}>
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} index={i} />)
          ) : filtered.length === 0 ? (
            flows.length === 0
              ? <EmptyState onCreate={() => setShowCreate(true)} />
              : (
                <div style={{
                  gridColumn: '1 / -1', textAlign: 'center', padding: '60px 20px',
                  animation: 'flFadeUp .4s ease',
                }}>
                  <span style={{ fontSize: 48 }}>🔍</span>
                  <h3 style={{ color: 'var(--text-primary, #fff)', fontSize: 20, fontWeight: 700, margin: '12px 0 8px' }}>
                    No matching flows
                  </h3>
                  <p style={{ color: 'var(--text-secondary, #a1a1aa)', fontSize: 14 }}>
                    Try a different search term or filter
                  </p>
                </div>
              )
          ) : (
            filtered.map((flow, i) => (
              <FlowCard
                key={flow.id}
                flow={flow}
                index={i}
                onEdit={handleEdit}
                onToggle={handleToggle}
                onDelete={setDeleteTarget}
              />
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}
