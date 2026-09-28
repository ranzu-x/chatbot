import { useEffect, useMemo, useState } from 'react';
import { Search, Send, Loader2, BellRing, Image as ImageIcon, AlertTriangle, ChevronLeft } from 'lucide-react';
import { messengerUtilityAPI, conversationAPI, uploadAPI } from '../../services/api';
import { describeMessengerTemplate, missingMessengerParams, fillPreview } from '../Templates/messengerTemplateUtils';

/**
 * Send Menu → Utility Template (Messenger). Lists the conversation's Page's
 * approved Utility templates, fills their variables ({{contact.name}} etc.
 * are filled per subscriber on the server) and sends one — the message a
 * Page may send after the 24-hour window (and after Human Agent's 7 days).
 */
export default function MessengerTemplateSender({ conversationId, integrationId, contactName, onSent, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState(null);
  const [params, setParams] = useState({ header: {}, body: {}, buttons: {}, headerImage: '' });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    messengerUtilityAPI.list(integrationId, 'APPROVED')
      .then((res) => { if (alive) setTemplates(res.data.templates || []); })
      .catch((err) => { if (alive) setLoadError(err?.response?.data?.message || 'Could not load Utility templates'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [integrationId]);

  const meta = picked ? describeMessengerTemplate(picked) : null;
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return templates.filter((t) => !q || t.name.toLowerCase().includes(q) || (t.meta?.bodyText || '').toLowerCase().includes(q));
  }, [templates, search]);

  const pick = (t) => {
    setPicked(t);
    setError('');
    const d = describeMessengerTemplate(t);
    // Pre-fill an obvious name variable with the subscriber's name.
    const body = {};
    d.body.forEach((ph) => { if (/name/i.test(ph)) body[ph] = '{{contact.name}}'; });
    setParams({ header: {}, body, buttons: {}, headerImage: '' });
  };

  const set = (section, key, value) => setParams((p) => ({ ...p, [section]: { ...p[section], [key]: value } }));
  const previewValues = {
    ...Object.fromEntries(Object.entries(params.header).map(([k, v]) => [k, v.replace(/{{\s*contact\.name\s*}}/gi, contactName || 'Customer')])),
    ...Object.fromEntries(Object.entries(params.body).map(([k, v]) => [k, v.replace(/{{\s*contact\.name\s*}}/gi, contactName || 'Customer')])),
  };

  const uploadImage = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await uploadAPI.uploadFile(fd);
      setParams((p) => ({ ...p, headerImage: res.data.url }));
    } catch (err) {
      setError(err?.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    const missing = missingMessengerParams(meta, params);
    if (missing.length) { setError(`Fill in: ${missing.join(', ')}`); return; }
    setBusy(true);
    setError('');
    try {
      const res = await conversationAPI.sendMessage(conversationId, { messengerTemplateId: picked.id, messengerTemplateParams: params });
      onSent?.({ kind: 'template', message: res.data?.message });
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.message || 'Messenger did not accept the template');
    } finally {
      setBusy(false);
    }
  };

  if (picked && meta) {
    const fillable = meta.buttons.filter((b) => b.dynamic && !b.routable);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 14, overflowY: 'auto', flex: 1 }}>
        <button type="button" onClick={() => setPicked(null)} className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}><ChevronLeft size={13} /> All templates</button>
        <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-hover)', fontSize: '0.8rem', lineHeight: 1.5 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>{picked.name} · {picked.language}</div>
          {meta.headerType === 'IMAGE' && <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)' }}>[Image header]</div>}
          {meta.headerText && <div style={{ fontWeight: 700 }}>{fillPreview(meta.headerText, previewValues)}</div>}
          <div style={{ whiteSpace: 'pre-wrap' }}>{fillPreview(meta.bodyText, previewValues)}</div>
          {meta.buttons.length > 0 && <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>{meta.buttons.map((b) => <span key={b.index} className="badge badge-primary">{b.text}</span>)}</div>}
        </div>
        {meta.header.map((ph) => (
          <div key={`h${ph}`} className="form-group"><label className="form-label">Header {`{{${ph}}}`}</label><input className="form-input" value={params.header[ph] || ''} onChange={(e) => set('header', ph, e.target.value)} /></div>
        ))}
        {meta.body.map((ph) => (
          <div key={`b${ph}`} className="form-group"><label className="form-label">Body {`{{${ph}}}`}</label><input className="form-input" value={params.body[ph] || ''} placeholder="Text or {{contact.name}}" onChange={(e) => set('body', ph, e.target.value)} /></div>
        ))}
        {fillable.map((b) => (
          <div key={`btn${b.index}`} className="form-group"><label className="form-label">{b.type === 'URL' ? `"${b.text}" link ending` : `"${b.text}" reply payload`}</label><input className="form-input" value={params.buttons[b.index] || ''} onChange={(e) => set('buttons', b.index, e.target.value)} /></div>
        ))}
        {meta.headerType === 'IMAGE' && (
          <label className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
            {uploading ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <ImageIcon size={13} />}
            {params.headerImage ? 'Image chosen — replace' : meta.hasHeaderSample ? 'Use another header image (optional)' : 'Upload header image'}
            <input type="file" accept="image/jpeg,image/png" hidden onChange={(e) => uploadImage(e.target.files?.[0])} />
          </label>
        )}
        {error && <div style={{ fontSize: '0.78rem', color: 'var(--danger)', display: 'flex', gap: 6 }}><AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} /> {error}</div>}
        <button type="button" className="btn btn-primary" onClick={send} disabled={busy || uploading} style={{ justifyContent: 'center' }}>
          {busy ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Send size={14} />} Send Utility Template
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 9, top: 10, color: 'var(--text-muted)' }} />
          <input autoFocus className="form-input" style={{ paddingLeft: 28 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search Utility templates…" />
        </div>
        <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>Order, account, appointment or event updates only — never promotions.</p>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Loader2 size={18} style={{ animation: 'spin 0.8s linear infinite' }} /></div>
        ) : loadError ? (
          <div style={{ fontSize: '0.8rem', color: 'var(--danger)', padding: 12 }}>{loadError}</div>
        ) : filtered.length === 0 ? (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: 16, textAlign: 'center' }}>No approved Utility templates for this Page. Create them in Bot Manager → Message Templates.</div>
        ) : filtered.map((t) => (
          <button key={t.id} type="button" onClick={() => pick(t)} style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-surface)', cursor: 'pointer', display: 'flex', gap: 10 }}>
            <BellRing size={16} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t.name}</span>
              <span style={{ display: 'block', fontSize: '0.76rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.meta?.bodyText}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
