import { useState, useRef, useEffect } from 'react';
import {
  Palette, Upload, Loader2, Copy, Check, ExternalLink,
  MessageCircle, Globe, Facebook, Instagram, Send,
  Plus, MessageSquare, Sparkles, Image, Video, Mail, Layers, MousePointerClick
} from 'lucide-react';
import { uploadAPI, integrationAPI } from '../../services/api';
import { getBackendOrigin, resolveAssetUrl } from '../../utils/assetUrl';

function ColorField({ label, value, onChange, defaultValue = '#6366f1' }) {
  return (
    <div className="fb-field">
      <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#475569', marginBottom: 5, display: 'block' }}>
        {label}
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="color"
          value={value || defaultValue}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 34, height: 32, padding: 2, borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', flexShrink: 0 }}
        />
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={defaultValue}
          style={{ flex: 1, height: 32, fontSize: 12, fontFamily: 'monospace' }}
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
              padding: '5px 11px',
              borderRadius: 999,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 700,
              border: `1.5px solid ${on ? '#0f172a' : '#e2e8f0'}`,
              background: on ? '#0f172a' : '#fff',
              color: on ? '#fff' : '#64748b',
              transition: 'all 0.12s ease',
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
  { value: 'BOTTOM_RIGHT', label: 'Bottom-Right' },
  { value: 'BOTTOM_LEFT', label: 'Bottom-Left' },
  { value: 'TOP_RIGHT', label: 'Top-Right' },
  { value: 'TOP_LEFT', label: 'Top-Left' },
];

const SIZE_OPTIONS = [
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LARGE', label: 'Large' },
  { value: 'XLARGE', label: 'Extra Large' },
];

const PLATFORM_ICONS = {
  WHATSAPP: { icon: MessageCircle, color: '#25D366', label: 'WhatsApp' },
  WEBCHAT: { icon: Globe, color: '#6366f1', label: 'Live Webchat' },
  FACEBOOK: { icon: Facebook, color: '#0084FF', label: 'Messenger' },
  TELEGRAM: { icon: Send, color: '#26A5E4', label: 'Telegram' },
  INSTAGRAM: { icon: Instagram, color: '#E1306C', label: 'Instagram' },
};

/**
 * ChatWidgetStartNodeProperties
 * Replaces the regular Start node's keyword-trigger panel when a flow
 * represents a Chat Widget (WhatsApp, Webchat, Messenger, Telegram, Instagram).
 *
 * Provides all widget configuration options (appearance, branding, prefill,
 * offsets, domains, and 1-click embed code), and quick bot-reply add buttons.
 */
export default function ChatWidgetStartNodeProperties({
  form,
  onChange,
  platform = 'WHATSAPP',
  flowName,
  onFlowNameChange,
  widgetKey,
  onAddReplyNode,
}) {
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [integrations, setIntegrations] = useState([]);
  const fileInputRef = useRef(null);

  const currentPlatform = (form?.targetPlatform || platform || 'WHATSAPP').toUpperCase();
  const platformMeta = PLATFORM_ICONS[currentPlatform] || PLATFORM_ICONS.WHATSAPP;
  const PlatformIcon = platformMeta.icon;

  useEffect(() => {
    integrationAPI.getAll().then((res) => {
      const list = res.data?.integrations || [];
      setIntegrations(list.filter((i) => (i.platform || '').toUpperCase() === currentPlatform));
    }).catch(() => {});
  }, [currentPlatform]);

  if (!form) return null;

  const set = (field) => (value) => {
    onChange({ ...form, [field]: value });
  };

  const handleLogoUpload = async (e) => {
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

  const embedSnippet = widgetKey
    ? `<script src="${getBackendOrigin()}/widget.js" data-key="${widgetKey}"></script>`
    : '';

  const copyEmbed = () => {
    if (!embedSnippet) return;
    navigator.clipboard.writeText(embedSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Platform Branding Badge */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8, background: `${platformMeta.color}15`,
            color: platformMeta.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <PlatformIcon size={16} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
              {platformMeta.label} Chat Widget
            </div>
            <div style={{ fontSize: 10.5, color: '#64748b' }}>Website Floating Chat Bubble & Popup</div>
          </div>
        </div>
        <span style={{
          fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
          background: `${platformMeta.color}20`, color: platformMeta.color,
        }}>
          Active
        </span>
      </div>

      {/* Bot Replies Quick Add Section */}
      <div style={{
        padding: '12px 14px', background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
        border: '1px solid #bbf7d0', borderRadius: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
          <Sparkles size={14} color="#16a34a" />
          <span style={{ fontSize: 12, fontWeight: 800, color: '#15803d' }}>Bot Replies Options</span>
        </div>
        <p style={{ fontSize: 11, color: '#166534', margin: '0 0 10px 0', lineHeight: 1.4 }}>
          Connect reply nodes to this start element to automatically respond when visitors start a chat:
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {currentPlatform === 'WHATSAPP' && (
            <button
              type="button"
              onClick={() => onAddReplyNode?.('interactive')}
              className="fb-add-btn"
              style={{ fontSize: 11, padding: '5px 9px', display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fff', borderColor: '#86efac', color: '#15803d' }}
            >
              <Sparkles size={11} /> + Interactive Reply
            </button>
          )}
          <button
            type="button"
            onClick={() => onAddReplyNode?.('buttons')}
            className="fb-add-btn"
            style={{ fontSize: 11, padding: '5px 9px', display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fff', borderColor: '#86efac', color: '#15803d' }}
          >
            <MessageSquare size={11} /> + Text Message
          </button>
          <button
            type="button"
            onClick={() => onAddReplyNode?.('quickReplies')}
            className="fb-add-btn"
            style={{ fontSize: 11, padding: '5px 9px', display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fff', borderColor: '#86efac', color: '#15803d' }}
          >
            <MousePointerClick size={11} /> + Quick Replies
          </button>
          <button
            type="button"
            onClick={() => onAddReplyNode?.('image')}
            className="fb-add-btn"
            style={{ fontSize: 11, padding: '5px 9px', display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fff', borderColor: '#86efac', color: '#15803d' }}
          >
            <Image size={11} /> + Image
          </button>
          <button
            type="button"
            onClick={() => onAddReplyNode?.('collectInput')}
            className="fb-add-btn"
            style={{ fontSize: 11, padding: '5px 9px', display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fff', borderColor: '#86efac', color: '#15803d' }}
          >
            <Mail size={11} /> + Collect Input
          </button>
        </div>
      </div>

      {/* ── 1. General & Account Settings ── */}
      <div className="fb-field">
        <label>Widget Name <span style={{ color: '#ef4444' }}>*</span></label>
        <input
          type="text"
          value={form.name || ''}
          onChange={(e) => {
            set('name')(e.target.value);
            onFlowNameChange?.(e.target.value);
          }}
          placeholder="e.g. Sales Website Widget"
        />
      </div>

      {currentPlatform !== 'WEBCHAT' && integrations.length > 0 && (
        <div className="fb-field">
          <label>Connected Account</label>
          <select
            value={form.integrationId || ''}
            onChange={(e) => set('integrationId')(e.target.value)}
            style={{ width: '100%', height: 34, borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', padding: '0 10px', fontSize: 12.5 }}
          >
            <option value="">Select connected account...</option>
            {integrations.map((acc) => {
              const extra = acc.wa_display_phone || acc.fb_page_id || acc.tg_bot_username || acc.ig_username;
              return (
                <option key={acc.id} value={acc.id}>
                  {acc.name || acc.platform} {extra ? `(${extra})` : ''}
                </option>
              );
            })}
          </select>
          <span className="fb-hint">The specific account or phone number this widget routes conversations to.</span>
        </div>
      )}

      {/* Logo Upload */}
      <div className="fb-field">
        <label>Widget Logo</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {form.logoUrl ? (
            <img
              src={resolveAssetUrl(form.logoUrl)}
              alt=""
              style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: '1px solid #e2e8f0', background: '#fff' }}
              onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }}
            />
          ) : null}
          <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#f1f5f9', display: form.logoUrl ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
            <PlatformIcon size={20} />
          </div>
          <input type="file" ref={fileInputRef} accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
          <button
            type="button"
            className="fb-add-btn"
            style={{ padding: '6px 11px', fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 size={12} className="fb-loading-spinner" /> : <Upload size={12} />}
            {form.logoUrl ? 'Change Logo' : 'Upload Logo'}
          </button>
          {form.logoUrl && (
            <button
              type="button"
              onClick={() => set('logoUrl')('')}
              style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="fb-field">
        <label>Display Name</label>
        <input
          type="text"
          value={form.displayName || ''}
          onChange={(e) => set('displayName')(e.target.value)}
          placeholder="e.g. Support Team"
        />
        <span className="fb-hint">Brand or business name shown in the chat window header.</span>
      </div>

      {/* ── 2. Greeting & Messages ── */}
      <div className="fb-field">
        <label>Welcome Message</label>
        <textarea
          rows={2}
          value={form.greetingMessage || ''}
          onChange={(e) => set('greetingMessage')(e.target.value)}
          placeholder="Hi there! How can we help you today?"
        />
        <span className="fb-hint">Shown as the opening message bubble inside the widget popup.</span>
      </div>

      <div className="fb-field">
        <label>Pre-fill Message</label>
        <input
          type="text"
          value={form.prefillMessage || ''}
          onChange={(e) => set('prefillMessage')(e.target.value)}
          placeholder="e.g. Hello, I want to know more about your service"
        />
        <span className="fb-hint">Pre-fills the visitor's chatbox so they can initiate the conversation with one tap.</span>
      </div>

      <div className="fb-field">
        <label>Input Placeholder</label>
        <input
          type="text"
          value={form.placeholderText || ''}
          onChange={(e) => set('placeholderText')(e.target.value)}
          placeholder="Type a message…"
        />
      </div>

      {/* ── 3. Colors & Header Appearance ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <ColorField label="Header Background" value={form.headerBgColor} onChange={set('headerBgColor')} defaultValue="#111827" />
        <ColorField label="Header Text Color" value={form.headerTextColor} onChange={set('headerTextColor')} defaultValue="#ffffff" />
      </div>

      {/* ── 4. Floating Button & Placement ── */}
      <div className="fb-field">
        <label>Floating Button Text</label>
        <input
          type="text"
          value={form.buttonText || ''}
          onChange={(e) => set('buttonText')(e.target.value)}
          placeholder="Chat with us"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <ColorField label="Button Background" value={form.buttonBgColor} onChange={set('buttonBgColor')} defaultValue={platformMeta.color} />
        <ColorField label="Button Text Color" value={form.buttonTextColor} onChange={set('buttonTextColor')} defaultValue="#ffffff" />
      </div>

      <div className="fb-field">
        <label>Button Size</label>
        <PillGroup options={SIZE_OPTIONS} value={form.buttonSize || 'MEDIUM'} onChange={set('buttonSize')} />
      </div>

      <div className="fb-field">
        <label>Chatbox Position</label>
        <PillGroup options={POSITION_OPTIONS} value={form.position || 'BOTTOM_RIGHT'} onChange={set('position')} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="fb-field">
          <label>Offset X (px)</label>
          <input
            type="number"
            value={form.offsetX ?? 20}
            onChange={(e) => set('offsetX')(parseInt(e.target.value, 10) || 0)}
            min={0}
            max={500}
          />
        </div>
        <div className="fb-field">
          <label>Offset Y (px)</label>
          <input
            type="number"
            value={form.offsetY ?? 20}
            onChange={(e) => set('offsetY')(parseInt(e.target.value, 10) || 0)}
            min={0}
            max={500}
          />
        </div>
      </div>

      <div className="fb-field">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!form.openOnStartup}
            onChange={(e) => set('openOnStartup')(e.target.checked)}
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
            Open automatically on page load
          </span>
        </label>
      </div>

      {/* ── 5. Allowed Domains ── */}
      <div className="fb-field">
        <label>Allowed Domains (optional)</label>
        <input
          type="text"
          value={form.allowedDomains || ''}
          onChange={(e) => set('allowedDomains')(e.target.value)}
          placeholder="e.g. yourwebsite.com, shop.yourwebsite.com"
        />
        <span className="fb-hint">Leave blank to allow embedding on any website.</span>
      </div>

      {/* ── 6. Website Embed Code ── */}
      {embedSnippet && (
        <div style={{
          padding: '12px', background: '#0f172a', borderRadius: 10, color: '#e2e8f0', marginTop: 4,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Website Embed Code
            </span>
            <button
              type="button"
              onClick={copyEmbed}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px',
                borderRadius: 6, background: copied ? '#15803d' : '#334155', color: '#fff',
                fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer',
              }}
            >
              {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <code style={{ fontSize: 11, wordBreak: 'break-all', fontFamily: 'monospace', display: 'block', color: '#38bdf8' }}>
            {embedSnippet}
          </code>
        </div>
      )}
    </div>
  );
}
