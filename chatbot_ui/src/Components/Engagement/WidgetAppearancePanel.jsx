import { useRef, useState } from 'react';
import { X, Upload, Loader2, Palette } from 'lucide-react';
import { uploadAPI } from '../../services/api';

const backendUrl = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api/v1', '') : 'http://localhost:5000';

function resolveAssetUrl(url) {
  if (!url) return '';
  return url.startsWith('http') || url.startsWith('data:') ? url : `${backendUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

// A color swatch + hex text field, built out of Flow Builder's own `.fb-field`
// input styling (no color-picker component exists anywhere else in this
// codebase's Flow Builder to reuse — this is the same visual weight, just a
// fresh control) rather than any external screenshot's look.
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

// The pill/segmented-button pattern already used for label-tagging elsewhere
// in this file (e.g. the labels-list toggle), single-select here instead of
// multi-select.
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

/**
 * Flow Builder → "Widget Appearance" drawer, for a WEBCHAT flow that's a
 * Chat Widget's reply logic (see ChatWidgetManager.jsx / FlowBuilderPage.jsx's
 * `linkedWidget`). Built entirely from Flow Builder's own existing design
 * system — `.fb-props`/`.fb-props-header`/`.fb-props-body`/`.fb-field`
 * (defined in FlowBuilderPage.jsx's injected `builderStyles`, reused here by
 * class name since that `<style>` tag is present document-wide whenever this
 * panel is mounted) — not the reference screenshot's own visual design.
 */
export default function WidgetAppearancePanel({ open, onClose, form, onChange }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  if (!open || !form) return null;

  const set = (field) => (value) => onChange({ ...form, [field]: value });

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
        width: 340,
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
        <div className="fb-field">
          <label>Logo</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {form.logoUrl ? (
              <img src={resolveAssetUrl(form.logoUrl)} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1px solid #e2e8f0' }} />
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

        <span className="fb-hint">Changes here save together with the flow — use the Save button in the top bar.</span>
      </div>
    </div>
  );
}
