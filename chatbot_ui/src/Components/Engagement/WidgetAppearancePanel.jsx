import { useRef, useState } from 'react';
import { X, Upload, Loader2, Palette, Bot, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { uploadAPI } from '../../services/api';
import { resolveAssetUrl } from '../../utils/assetUrl';

function ColorField({ label, value, onChange }) {
  return (
    <div className="fb-field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="color"
          value={value || '#6366f1'}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 36, height: 34, padding: 2, borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', flexShrink: 0 }}
        />
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#6366f1"
          style={{ flex: 1 }}
        />
      </div>
    </div>
  );
}

function PillGroup({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {options.map((opt) => {
        const on = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              cursor: 'pointer',
              fontSize: 11.5,
              fontWeight: 700,
              border: `1.5px solid ${on ? '#0f172a' : '#e2e8f0'}`,
              background: on ? '#0f172a' : '#fff',
              color: on ? '#fff' : '#64748b',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const POSITION_OPTIONS = [
  { value: 'TOP_LEFT', label: 'Top-left' },
  { value: 'BOTTOM_LEFT', label: 'Bottom-left' },
  { value: 'TOP_RIGHT', label: 'Top-right' },
  { value: 'BOTTOM_RIGHT', label: 'Bottom-right' },
];

const SIZE_OPTIONS = [
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LARGE', label: 'Large' },
  { value: 'XLARGE', label: 'Extra Large' },
];

const DEFAULT_CHATBOT_CARDS = [
  { id: 'chatbot-1', title: 'Book a demo', subtitle: 'Schedule a personalized demo', icon: 'calendar', trigger: 'Book a demo' },
  { id: 'chatbot-2', title: 'Product tour', subtitle: 'See how it works', icon: 'play', trigger: 'Product tour' },
  { id: 'chatbot-3', title: 'Documentation', subtitle: 'Browse our guides', icon: 'book', trigger: 'Documentation' },
];

const CARD_ICON_OPTIONS = [
  { value: 'calendar', label: 'Calendar / Demo' },
  { value: 'play', label: 'Play / Tour' },
  { value: 'book', label: 'Book / Docs' },
  { value: 'sparkles', label: 'Sparkles / AI' },
  { value: 'help', label: 'Help / Support' },
  { value: 'shopping', label: 'Shopping / Sales' },
  { value: 'message', label: 'Chat / Support' },
];

/**
 * Flow Builder → "Widget Appearance" drawer, for a WEBCHAT flow that's a
 * Chat Widget's reply logic.
 */
export default function WidgetAppearancePanel({ open, onClose, form, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [expandedCardIdx, setExpandedCardIdx] = useState(0);
  const fileInputRef = useRef(null);

  if (!open || !form) return null;

  const set = (field) => (value) => onChange({ ...form, [field]: value });

  const rawCards = form?.chatbotCards;
  const cardsList = Array.isArray(rawCards) && rawCards.length > 0
    ? rawCards
    : (typeof rawCards === 'string' ? (() => { try { return JSON.parse(rawCards); } catch { return DEFAULT_CHATBOT_CARDS; } })() : DEFAULT_CHATBOT_CARDS);

  const updateCard = (idx, patch) => {
    const updated = cardsList.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    set('chatbotCards')(updated);
  };

  const handleResetDefaultCards = () => {
    set('chatbotCards')(DEFAULT_CHATBOT_CARDS);
  };

  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await uploadAPI.uploadFile(formData);
      if (res.data?.url) set('logoUrl')(res.data.url);
    } catch (err) {
      console.error('Logo upload failed', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div
      className="fb-props"
      style={{
        position: 'fixed',
        top: 56,
        right: 0,
        bottom: 0,
        width: 350,
        zIndex: 40,
      }}
    >
      <div className="fb-props-header">
        <h3><Palette size={15} color="#0f172a" /> Widget Appearance</h3>
        <button type="button" className="fb-props-close" onClick={onClose} title="Close">
          <X size={15} />
        </button>
      </div>

      <div className="fb-props-body">
        {/* ── 3 Chatbots Cards Section ── */}
        <div style={{
          padding: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Bot size={14} color="#4f46e5" />
              <span style={{ fontSize: 12, fontWeight: 800, color: '#1e293b' }}>
                Landing Page 3 Chatbots
              </span>
            </div>
            <button
              type="button"
              onClick={handleResetDefaultCards}
              title="Reset to default 3 bots"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3, background: '#fff',
                border: '1px solid #cbd5e1', borderRadius: 5, padding: '2px 6px', fontSize: 10,
                color: '#64748b', cursor: 'pointer', fontWeight: 600,
              }}
            >
              <RotateCcw size={10} /> Reset
            </button>
          </div>
          <p style={{ fontSize: 10.5, color: '#64748b', margin: '0 0 8px 0', lineHeight: 1.35 }}>
            These 3 cards appear on the widget home screen. Each card connects to its own handle (chatbot-1, chatbot-2, chatbot-3):
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {cardsList.map((card, idx) => {
              const isExpanded = expandedCardIdx === idx;
              const handleId = card.id || `chatbot-${idx + 1}`;
              return (
                <div
                  key={handleId}
                  style={{
                    background: '#ffffff', border: isExpanded ? '1.5px solid #6366f1' : '1px solid #e2e8f0',
                    borderRadius: 8, overflow: 'hidden',
                  }}
                >
                  <div
                    onClick={() => setExpandedCardIdx(isExpanded ? -1 : idx)}
                    style={{
                      padding: '7px 9px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      cursor: 'pointer', background: isExpanded ? '#f5f3ff' : '#ffffff',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{
                        fontSize: 9.5, fontWeight: 800, background: '#6366f1', color: '#fff',
                        padding: '1px 5px', borderRadius: 999, flexShrink: 0,
                      }}>
                        Bot {idx + 1}
                      </span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {card.title || `Chatbot ${idx + 1}`}
                      </span>
                    </div>
                    {isExpanded ? <ChevronUp size={12} color="#6366f1" /> : <ChevronDown size={12} color="#94a3b8" />}
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '8px 10px', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div className="fb-field" style={{ margin: 0 }}>
                        <label style={{ fontSize: 10, fontWeight: 700 }}>Card Title</label>
                        <input
                          type="text"
                          value={card.title || ''}
                          onChange={(e) => updateCard(idx, { title: e.target.value })}
                          placeholder="e.g. Book a demo"
                          style={{ height: 28, fontSize: 11 }}
                        />
                      </div>
                      <div className="fb-field" style={{ margin: 0 }}>
                        <label style={{ fontSize: 10, fontWeight: 700 }}>Card Description</label>
                        <input
                          type="text"
                          value={card.subtitle || ''}
                          onChange={(e) => updateCard(idx, { subtitle: e.target.value })}
                          placeholder="e.g. Schedule a 15-min call"
                          style={{ height: 28, fontSize: 11 }}
                        />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <div className="fb-field" style={{ margin: 0 }}>
                          <label style={{ fontSize: 10, fontWeight: 700 }}>Icon</label>
                          <select
                            value={card.icon || 'calendar'}
                            onChange={(e) => updateCard(idx, { icon: e.target.value })}
                            style={{ height: 28, fontSize: 11, borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', padding: '0 6px' }}
                          >
                            {CARD_ICON_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="fb-field" style={{ margin: 0 }}>
                          <label style={{ fontSize: 10, fontWeight: 700 }}>Trigger</label>
                          <input
                            type="text"
                            value={card.trigger || ''}
                            onChange={(e) => updateCard(idx, { trigger: e.target.value })}
                            placeholder={card.title || 'Keyword'}
                            style={{ height: 28, fontSize: 11 }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Home View Header & Texts */}
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed #cbd5e1' }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, color: '#334155', display: 'block', marginBottom: 5 }}>
              Home Screen Texts
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="fb-field" style={{ margin: 0 }}>
                <label style={{ fontSize: 10, fontWeight: 700 }}>Home Greeting Title</label>
                <input
                  type="text"
                  value={form.homeTitle || ''}
                  onChange={(e) => set('homeTitle')(e.target.value)}
                  placeholder="Hi there 👋"
                  style={{ height: 28, fontSize: 11 }}
                />
              </div>
              <div className="fb-field" style={{ margin: 0 }}>
                <label style={{ fontSize: 10, fontWeight: 700 }}>Home Subtitle</label>
                <input
                  type="text"
                  value={form.homeSubtitle || ''}
                  onChange={(e) => set('homeSubtitle')(e.target.value)}
                  placeholder="How can we help you today?"
                  style={{ height: 28, fontSize: 11 }}
                />
              </div>
              <div className="fb-field" style={{ margin: 0 }}>
                <label style={{ fontSize: 10, fontWeight: 700 }}>Reply Time Badge</label>
                <input
                  type="text"
                  value={form.replyTimeText || ''}
                  onChange={(e) => set('replyTimeText')(e.target.value)}
                  placeholder="We typically reply within a few minutes"
                  style={{ height: 28, fontSize: 11 }}
                />
              </div>
              <div className="fb-field" style={{ margin: 0 }}>
                <label style={{ fontSize: 10, fontWeight: 700 }}>Start Chat Button Text</label>
                <input
                  type="text"
                  value={form.startConversationText || ''}
                  onChange={(e) => set('startConversationText')(e.target.value)}
                  placeholder="Start a conversation"
                  style={{ height: 28, fontSize: 11 }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Logo */}
        <div className="fb-field">
          <label>Logo</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {form.logoUrl ? (
              <img
                src={resolveAssetUrl(form.logoUrl)}
                alt=""
                style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1px solid #e2e8f0' }}
                onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
              />
            ) : (
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#f1f5f9', flexShrink: 0 }} />
            )}
            <input type="file" ref={fileInputRef} accept="image/*" style={{ display: 'none' }} onChange={handleLogoChange} />
            <button
              type="button"
              className="fb-add-btn"
              style={{ padding: '6px 10px', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 size={12} className="fb-loading-spinner" /> : <Upload size={12} />}
              {form.logoUrl ? 'Change' : 'Upload'}
            </button>
            {form.logoUrl && (
              <button type="button" onClick={() => set('logoUrl')('')} style={{ border: 'none', background: 'none', color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}>
                Remove
              </button>
            )}
          </div>
        </div>

        <div className="fb-field">
          <label>Display Name</label>
          <input type="text" value={form.displayName || ''} onChange={(e) => set('displayName')(e.target.value)} placeholder="e.g. Support Chat" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <ColorField label="Header Background" value={form.headerBgColor} onChange={set('headerBgColor')} />
          <ColorField label="Header Text Color" value={form.headerTextColor} onChange={set('headerTextColor')} />
        </div>

        <div className="fb-field">
          <label>Welcome Message</label>
          <textarea value={form.greetingMessage || ''} onChange={(e) => set('greetingMessage')(e.target.value)} placeholder="Hi there! How can we help?" />
        </div>

        <div className="fb-field">
          <label>Pre-fill Message</label>
          <textarea value={form.prefillMessage || ''} onChange={(e) => set('prefillMessage')(e.target.value)} placeholder="A suggested first message shown in the input box" />
          <span className="fb-hint">Optional — pre-fills the visitor's message box so they can send it with one tap.</span>
        </div>

        <div className="fb-field">
          <label>Chatbox Position</label>
          <PillGroup options={POSITION_OPTIONS} value={form.position} onChange={set('position')} />
        </div>

        <div className="fb-field">
          <label>Open on Page Load</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!form.openOnStartup} onChange={(e) => set('openOnStartup')(e.target.checked)} />
            <span style={{ fontSize: 12, color: '#475569' }}>{form.openOnStartup ? 'Stay open' : 'Stay closed'}</span>
          </label>
        </div>

        <div className="fb-field">
          <label>Button Text</label>
          <input type="text" value={form.buttonText || ''} onChange={(e) => set('buttonText')(e.target.value)} placeholder="Chat with us" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <ColorField label="Button Background" value={form.buttonBgColor} onChange={set('buttonBgColor')} />
          <ColorField label="Button Text Color" value={form.buttonTextColor} onChange={set('buttonTextColor')} />
        </div>

        <div className="fb-field">
          <label>Button Size</label>
          <PillGroup options={SIZE_OPTIONS} value={form.buttonSize} onChange={set('buttonSize')} />
        </div>

        <div className="fb-field">
          <label>Website</label>
          <input
            type="text"
            value={form.allowedDomains || ''}
            onChange={(e) => set('allowedDomains')(e.target.value)}
            placeholder="example.com"
          />
          <span className="fb-hint">
            {form.allowedDomains ? 'Comma-separate to allow more than one site. Subdomains are always included.' : '⚠ No website set — this widget is currently disabled everywhere until one is added.'}
          </span>
        </div>

        <span className="fb-hint">Changes here save together with the flow — use the Save button in the top bar.</span>
      </div>
    </div>
  );
}
