import { useState, useRef, useEffect } from 'react';
import { X, Upload, Loader2, MessageCircle, Facebook, Instagram, Send as TelegramIcon } from 'lucide-react';
import { channelAPI, uploadAPI } from '../../services/api';
import { resolveAssetUrl } from '../../utils/assetUrl';

const PLATFORM_META = {
  WHATSAPP: { label: 'WhatsApp', color: '#25D366', icon: MessageCircle },
  FACEBOOK: { label: 'Messenger', color: '#0084FF', icon: Facebook },
  TELEGRAM: { label: 'Telegram', color: '#26A5E4', icon: TelegramIcon },
  INSTAGRAM: { label: 'Instagram', color: '#E1306C', icon: Instagram },
};

function accountLabel(integ) {
  const extra = integ.wa_display_phone || integ.fb_page_id || integ.ig_username || integ.tg_bot_username;
  return `${integ.name || integ.platform}${extra ? ` (${extra})` : ''}`;
}


// Same visual recipe as the Flow Builder's own field styling (rounded,
// #f8fafc background, subtle border, dark focus ring) — reimplemented here
// with plain inline styles rather than the `.fb-field` class name itself,
// since this editor renders outside the Flow Builder's component tree and
// has no reason to depend on its injected stylesheet being mounted. Same
// concept, deliberately not the reference screenshot's look.
const fieldLabelStyle = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: '#475569', marginBottom: 6 };
const fieldInputStyle = { width: '100%', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '9px 12px', fontSize: 13, color: '#0f172a', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };

function Field({ label, hint, children }) {
  return (
    <div>
      <label style={fieldLabelStyle}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <Field label={label}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="color" value={value || '#6366f1'} onChange={(e) => onChange(e.target.value)} style={{ width: 36, height: 34, padding: 2, borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', flexShrink: 0 }} />
        <input type="text" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="#6366f1" style={{ ...fieldInputStyle, flex: 1 }} />
      </div>
    </Field>
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
            style={{ padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 11.5, fontWeight: 700, border: `1.5px solid ${on ? '#0f172a' : '#e2e8f0'}`, background: on ? '#0f172a' : '#fff', color: on ? '#fff' : '#64748b' }}
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

function buildPreviewLink(integ, prefillMessage) {
  if (!integ) return '';
  const platform = (integ.platform || '').toUpperCase();
  if (platform === 'WHATSAPP') {
    const phone = (integ.wa_display_phone || '').replace(/[^\d]/g, '');
    if (!phone) return '';
    return `https://wa.me/${phone}${prefillMessage ? `?text=${encodeURIComponent(prefillMessage)}` : ''}`;
  }
  if (platform === 'FACEBOOK') {
    if (!integ.fb_page_id) return '';
    return `https://m.me/${integ.fb_page_id}${prefillMessage ? `?text=${encodeURIComponent(prefillMessage)}` : ''}`;
  }
  if (platform === 'TELEGRAM') {
    if (!integ.tg_bot_username) return '';
    const payload = (prefillMessage || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    return `https://t.me/${integ.tg_bot_username}${payload ? `?start=${payload}` : ''}`;
  }
  if (platform === 'INSTAGRAM') {
    if (!integ.ig_username) return '';
    return `https://ig.me/m/${integ.ig_username}`;
  }
  return '';
}

/**
 * Bot Manager → Engagement → Chat Widget → a WhatsApp / Messenger / Telegram
 * / Instagram "deep-link" widget: a customizable floating button + preview
 * popup, embedded the same way as a Webchat widget (JS snippet), that hands
 * off to the platform's own app (wa.me/m.me/t.me/ig.me) instead of running an
 * in-page conversation — so unlike a Webchat widget, it needs no reply flow.
 *
 * Instagram gets this too (ig.me links are still live per Meta's own docs),
 * just without a pre-fillable message — ig.me has no text parameter today.
 * Facebook's own embeddable Messenger plugin (the "Customer Chat Plugin")
 * was discontinued by Meta in May 2024, so a self-built m.me-based button
 * like this one is the only embeddable Messenger entry point left at all.
 */
export default function DeepLinkWidgetEditor({ open, onClose, widget, integrations, onSaved }) {
  const isNew = !widget?.id;
  const eligibleIntegrations = (integrations || []).filter((i) => ['WHATSAPP', 'FACEBOOK', 'TELEGRAM', 'INSTAGRAM'].includes((i.platform || '').toUpperCase()));

  const [form, setForm] = useState(() => ({
    integrationId: widget?.integration_id || '',
    name: widget?.name || '',
    logoUrl: widget?.logo_url || '',
    displayName: widget?.display_name || '',
    headerBgColor: widget?.header_bg_color || '#111827',
    headerTextColor: widget?.header_text_color || '#ffffff',
    greetingMessage: widget?.greeting_message || 'Hi there! How can we help?',
    prefillMessage: widget?.prefill_message || '',
    position: widget?.position || 'BOTTOM_RIGHT',
    openOnStartup: Boolean(widget?.open_on_startup),
    offsetX: widget?.offset_x ?? 20,
    offsetY: widget?.offset_y ?? 20,
    buttonText: widget?.button_text || 'Chat with us',
    buttonBgColor: widget?.button_bg_color || '#25D366',
    buttonTextColor: widget?.button_text_color || '#ffffff',
    buttonSize: widget?.button_size || 'MEDIUM',
    allowedDomains: widget?.allowed_domains || '',
  }));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      integrationId: widget?.integration_id || (eligibleIntegrations[0]?.id ?? ''),
      name: widget?.name || '',
      logoUrl: widget?.logo_url || '',
      displayName: widget?.display_name || '',
      headerBgColor: widget?.header_bg_color || '#111827',
      headerTextColor: widget?.header_text_color || '#ffffff',
      greetingMessage: widget?.greeting_message || 'Hi there! How can we help?',
      prefillMessage: widget?.prefill_message || '',
      position: widget?.position || 'BOTTOM_RIGHT',
      openOnStartup: Boolean(widget?.open_on_startup),
      offsetX: widget?.offset_x ?? 20,
      offsetY: widget?.offset_y ?? 20,
      buttonText: widget?.button_text || 'Chat with us',
      buttonBgColor: widget?.button_bg_color || '#25D366',
      buttonTextColor: widget?.button_text_color || '#ffffff',
      buttonSize: widget?.button_size || 'MEDIUM',
      allowedDomains: widget?.allowed_domains || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, widget?.id]);

  if (!open) return null;

  const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));
  const selectedIntegration = eligibleIntegrations.find((i) => String(i.id) === String(form.integrationId));
  const selectedPlatform = (selectedIntegration?.platform || '').toUpperCase();
  const meta = PLATFORM_META[selectedPlatform];
  const supportsPrefill = ['WHATSAPP', 'FACEBOOK'].includes(selectedPlatform);
  const isTelegram = selectedPlatform === 'TELEGRAM';
  const isInstagram = selectedPlatform === 'INSTAGRAM';
  const previewLink = buildPreviewLink(selectedIntegration, form.prefillMessage);

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

  const handleSave = async () => {
    if (!form.integrationId) {
      alert('Select which connected account this widget links to');
      return;
    }
    setSaving(true);
    try {
      const name = form.name || `${meta?.label || 'Chat'} Widget`;
      const payload = {
        name,
        integrationId: Number(form.integrationId),
        widgetType: 'DEEPLINK',
        logoUrl: form.logoUrl,
        displayName: form.displayName || name,
        headerBgColor: form.headerBgColor,
        headerTextColor: form.headerTextColor,
        greetingMessage: form.greetingMessage,
        prefillMessage: isInstagram ? '' : form.prefillMessage,
        position: form.position,
        openOnStartup: form.openOnStartup,
        offsetX: Number(form.offsetX) || 0,
        offsetY: Number(form.offsetY) || 0,
        buttonText: form.buttonText,
        buttonBgColor: form.buttonBgColor,
        buttonTextColor: form.buttonTextColor,
        buttonSize: form.buttonSize,
        allowedDomains: form.allowedDomains,
      };
      if (isNew) {
        await channelAPI.addWebchat(payload);
      } else {
        await channelAPI.updateWebchat(widget.id, payload);
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      console.error('Failed to save widget', err);
      alert(err?.response?.data?.message || 'Failed to save widget');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <style>{'@keyframes dlw-spin { to { transform: rotate(360deg); } } .dlw-spin { animation: dlw-spin 0.8s linear infinite; }'}</style>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 880, maxHeight: '90vh', background: '#fff', borderRadius: 16, boxShadow: '0 24px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {meta && <meta.icon size={18} color={meta.color} />}
            <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
              {isNew ? `New ${meta?.label || 'Chat'} Widget` : `Edit "${widget.name}"`}
            </h3>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 300px' }}>
          {/* Form */}
          <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16, borderRight: '1px solid #f1f5f9' }}>
            <Field label="Widget Name (internal)">
              <input type="text" value={form.name} onChange={(e) => set('name')(e.target.value)} placeholder={`e.g. ${meta?.label || 'Chat'} — Pricing Page`} style={fieldInputStyle} />
            </Field>

            <Field label="Connected Account">
              <select value={form.integrationId} onChange={(e) => set('integrationId')(e.target.value)} style={fieldInputStyle}>
                <option value="">Select an account…</option>
                {['WHATSAPP', 'FACEBOOK', 'TELEGRAM', 'INSTAGRAM'].map((plat) => {
                  const group = eligibleIntegrations.filter((i) => (i.platform || '').toUpperCase() === plat);
                  if (!group.length) return null;
                  return (
                    <optgroup key={plat} label={PLATFORM_META[plat].label}>
                      {group.map((i) => <option key={i.id} value={i.id}>{accountLabel(i)}</option>)}
                    </optgroup>
                  );
                })}
              </select>
              {!eligibleIntegrations.length && (
                <div style={{ fontSize: 11, color: '#d97706', marginTop: 4 }}>
                  No WhatsApp, Messenger, Telegram, or Instagram accounts connected yet — connect one under Channels first.
                </div>
              )}
            </Field>

            <Field label="Logo">
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
                <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {uploading ? <Loader2 size={12} className="dlw-spin" /> : <Upload size={12} />} {form.logoUrl ? 'Change' : 'Upload'}
                </button>
                {form.logoUrl && <button type="button" onClick={() => set('logoUrl')('')} style={{ border: 'none', background: 'none', color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}>Remove</button>}
              </div>
            </Field>

            <Field label="Display Name">
              <input type="text" value={form.displayName} onChange={(e) => set('displayName')(e.target.value)} placeholder={`${meta?.label || 'Chat'} Chat`} style={fieldInputStyle} />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <ColorField label="Header Background" value={form.headerBgColor} onChange={set('headerBgColor')} />
              <ColorField label="Header Text Color" value={form.headerTextColor} onChange={set('headerTextColor')} />
            </div>

            <Field label="Welcome Message">
              <textarea rows={3} value={form.greetingMessage} onChange={(e) => set('greetingMessage')(e.target.value)} style={{ ...fieldInputStyle, resize: 'vertical' }} />
            </Field>

            {isInstagram ? (
              <Field label="Pre-fill Message" hint="Instagram's ig.me links don't support a pre-filled message today — the visitor will type their own first message.">
                <input type="text" value="" disabled placeholder="Not supported on Instagram" style={{ ...fieldInputStyle, color: '#94a3b8', cursor: 'not-allowed' }} />
              </Field>
            ) : (
              <Field
                label={isTelegram ? 'Start Payload' : 'Pre-fill Message'}
                hint={isTelegram
                  ? 'A short tracking token (letters/numbers/_/- only) your bot receives as /start <payload> — not visitor-editable text.'
                  : 'Automatically fills the visitor\'s message box so they can send it with one tap.'}
              >
                <input
                  type="text"
                  value={form.prefillMessage}
                  onChange={(e) => set('prefillMessage')(isTelegram ? e.target.value.replace(/[^A-Za-z0-9_-]/g, '') : e.target.value)}
                  placeholder={isTelegram ? 'website_widget' : "Hi, I'd like to know more…"}
                  style={fieldInputStyle}
                />
              </Field>
            )}

            <Field label="Chatbox Position">
              <PillGroup options={POSITION_OPTIONS} value={form.position} onChange={set('position')} />
            </Field>

            <Field label="Open on Page Load">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.openOnStartup} onChange={(e) => set('openOnStartup')(e.target.checked)} />
                <span style={{ fontSize: 12, color: '#475569' }}>{form.openOnStartup ? 'Stay open' : 'Stay closed'}</span>
              </label>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Offset X (px)"><input type="number" value={form.offsetX} onChange={(e) => set('offsetX')(e.target.value)} style={fieldInputStyle} /></Field>
              <Field label="Offset Y (px)"><input type="number" value={form.offsetY} onChange={(e) => set('offsetY')(e.target.value)} style={fieldInputStyle} /></Field>
            </div>

            <Field label="Button Text">
              <input type="text" value={form.buttonText} onChange={(e) => set('buttonText')(e.target.value)} style={fieldInputStyle} />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <ColorField label="Button Background" value={form.buttonBgColor} onChange={set('buttonBgColor')} />
              <ColorField label="Button Text Color" value={form.buttonTextColor} onChange={set('buttonTextColor')} />
            </div>

            <Field label="Button Size">
              <PillGroup options={SIZE_OPTIONS} value={form.buttonSize} onChange={set('buttonSize')} />
            </Field>

            <Field label="Allowed Domains (optional)" hint="Comma-separated — restricts which websites can load this widget. Leave blank to allow any site.">
              <input type="text" value={form.allowedDomains} onChange={(e) => set('allowedDomains')(e.target.value)} placeholder="example.com, shop.example.com" style={fieldInputStyle} />
            </Field>
          </div>

          {/* Live preview */}
          <div style={{ padding: 22, background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.6 }}>Live Preview</div>

            <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 14px rgba(0,0,0,0.06)' }}>
              <div style={{ padding: 14, background: form.headerBgColor, color: form.headerTextColor, display: 'flex', alignItems: 'center', gap: 8 }}>
                {form.logoUrl ? (
                  <img
                    src={resolveAssetUrl(form.logoUrl)}
                    alt=""
                    style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }}
                    onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                  />
                ) : meta ? <meta.icon size={18} /> : null}
                <span style={{ fontWeight: 700, fontSize: 13 }}>{form.displayName || meta?.label || 'Chat'}</span>
              </div>
              <div style={{ padding: 14, fontSize: 12.5, color: '#334155', lineHeight: 1.5 }}>{form.greetingMessage}</div>
              {!isInstagram && !isTelegram && (
                <div style={{ padding: '0 14px 14px 14px' }}>
                  <div style={{ background: '#f1f5f9', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: form.prefillMessage ? '#0f172a' : '#94a3b8' }}>
                    {form.prefillMessage || 'Type a message…'}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              disabled
              style={{
                alignSelf: form.position?.endsWith('LEFT') ? 'flex-start' : 'flex-end',
                display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, border: 'none', cursor: 'default',
                background: form.buttonBgColor, color: form.buttonTextColor,
                padding: form.buttonSize === 'XLARGE' ? '14px 22px' : form.buttonSize === 'LARGE' ? '12px 20px' : '10px 16px',
                fontWeight: 700, fontSize: form.buttonSize === 'XLARGE' ? 14 : form.buttonSize === 'LARGE' ? 13 : 12,
              }}
            >
              {meta && <meta.icon size={16} />} {form.buttonText || 'Chat with us'}
            </button>

            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Opens</div>
              <div style={{ fontSize: 11.5, fontFamily: 'monospace', color: previewLink ? '#2563eb' : '#cbd5e1', wordBreak: 'break-all' }}>
                {previewLink || 'Select a connected account above'}
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#f8fafc' }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            {saving ? 'Saving…' : 'Save Widget'}
          </button>
        </div>
      </div>
    </div>
  );
}
