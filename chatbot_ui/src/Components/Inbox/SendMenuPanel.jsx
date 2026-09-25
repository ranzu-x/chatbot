import { useState, useEffect, useMemo, useRef } from 'react';
import { flowAPI, templateAPI, whatsappFlowRefAPI, conversationAPI, uploadAPI } from '../../services/api';
import {
  X, Bot, FileText, Workflow, Search, ChevronLeft, Send, Layers, MessageCircle, Plus,
  Upload, Image, Video, File, MapPin, CheckCircle2, AlertTriangle, ExternalLink, Copy, Eye,
  Sparkles, Info, Loader2
} from 'lucide-react';
import { describeTemplateForElement } from '../Templates/messageTemplateUtils';
import CreateCannedModal from './CreateCannedModal';

const BACK_TARGET = {
  flowsTemplates: 'menu',
  flow: 'flowsTemplates',
  template: 'flowsTemplates',
  whatsappFlow: 'flowsTemplates',
  cannedResponse: 'menu',
};

const SECTION_TITLE = {
  menu: 'Send',
  flowsTemplates: 'Flows & Templates',
  flow: 'Bot Flow',
  template: 'Message Template',
  whatsappFlow: 'WhatsApp Flow',
  cannedResponse: 'Canned Response',
};

export default function SendMenuPanel({
  open,
  onClose,
  conversationId,
  integrationId,
  platform,
  contactName = '',
  onSent,
  initialSection = 'menu',
  cannedResponses = [],
  onCannedCreated,
}) {
  const [section, setSection] = useState(initialSection);
  const [search, setSearch] = useState('');
  const [flows, setFlows] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [flowRefs, setFlowRefs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Template configurator state
  const [pendingTemplate, setPendingTemplate] = useState(null); // { tpl, meta }
  const [templateParams, setTemplateParams] = useState({
    header: {},
    body: {},
    buttons: {},
    headerMedia: '',
    documentFilename: '',
    location: { latitude: '', longitude: '', name: '', address: '' },
    cards: [],
  });
  const [activeCardTab, setActiveCardTab] = useState(0);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [configError, setConfigError] = useState('');
  const [showPreview, setShowPreview] = useState(true);

  const [showCreateCanned, setShowCreateCanned] = useState(false);
  const fileInputRef = useRef(null);
  const cardFileInputRef = useRef(null);

  const isWhatsApp = (platform || '').toUpperCase() === 'WHATSAPP';

  useEffect(() => {
    if (open && initialSection) {
      setSection(initialSection);
    }
  }, [open, initialSection]);

  useEffect(() => {
    if (!open) {
      setSection(initialSection || 'menu');
      setSearch('');
      setPendingTemplate(null);
      setConfigError('');
    }
  }, [open, initialSection]);

  useEffect(() => {
    if (!open || section === 'menu' || section === 'flowsTemplates') return;
    setLoading(true);
    if (section === 'flow') {
      flowAPI.getAll({ integrationId })
        .then((res) => setFlows(res.data?.flows || []))
        .catch(() => setFlows([]))
        .finally(() => setLoading(false));
    } else if (section === 'template') {
      templateAPI.getWATemplates({ status: 'APPROVED', integrationId })
        .then((res) => setTemplates(res.data?.templates || []))
        .catch(() => setTemplates([]))
        .finally(() => setLoading(false));
    } else if (section === 'whatsappFlow') {
      whatsappFlowRefAPI.getAll({ integrationId })
        .then((res) => setFlowRefs(res.data?.flowRefs || []))
        .catch(() => setFlowRefs([]))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [open, section, integrationId]);

  const filteredFlows = useMemo(() => {
    const q = search.toLowerCase().trim();
    return flows
      .filter((f) => !f.platform || f.platform === platform || f.platform === 'ALL')
      .filter((f) => !f.integration_id || String(f.integration_id) === String(integrationId))
      .filter((f) => !q || f.name?.toLowerCase().includes(q));
  }, [flows, search, platform, integrationId]);

  const filteredTemplates = useMemo(() => {
    const q = search.toLowerCase().trim();
    return templates.filter((t) => !q || t.template_name?.toLowerCase().includes(q) || t.body_text?.toLowerCase().includes(q));
  }, [templates, search]);

  const filteredFlowRefs = useMemo(() => {
    const q = search.toLowerCase().trim();
    return flowRefs.filter((f) => !q || f.name?.toLowerCase().includes(q));
  }, [flowRefs, search]);

  const filteredCanned = useMemo(() => {
    const q = search.toLowerCase().trim();
    return cannedResponses.filter((c) => !q || c.title?.toLowerCase().includes(q) || c.shortcut?.toLowerCase().includes(q) || c.body?.toLowerCase().includes(q));
  }, [cannedResponses, search]);

  const handlePickFlow = async (flow) => {
    if (busy) return;
    setBusy(true);
    try {
      await conversationAPI.triggerFlow(conversationId, flow.id);
      onSent?.({ kind: 'flow', name: flow.name });
      onClose?.();
    } catch (err) {
      console.error('Failed to trigger flow', err);
    } finally {
      setBusy(false);
    }
  };

  const handlePickTemplate = (tpl) => {
    const meta = describeTemplateForElement(tpl);
    const hasMedia = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(meta.headerType);
    const hasLocation = meta.headerType === 'LOCATION';
    const hasHeaderText = meta.header.length > 0;
    const hasBodyText = meta.body.length > 0;
    const hasDynamicButtons = (meta.buttons || []).some((b) => b.dynamic || b.isCopyCode);
    const isCarousel = meta.isCarousel && meta.cards?.length > 0;

    const needsConfig = hasMedia || hasLocation || hasHeaderText || hasBodyText || hasDynamicButtons || isCarousel;

    if (!needsConfig) {
      // Template has no parameters or media requirements (e.g. hello_world)
      sendTemplate(tpl, {});
      return;
    }

    setPendingTemplate({ tpl, meta });
    setConfigError('');
    setActiveCardTab(0);

    // Initialize params
    const initialBody = {};
    for (const ph of meta.body || []) {
      if (ph === '1' && contactName) initialBody[ph] = contactName;
      else initialBody[ph] = '';
    }

    const initialHeader = {};
    for (const ph of meta.header || []) initialHeader[ph] = '';

    const initialButtons = {};
    for (const b of meta.buttons || []) {
      if (b.dynamic || b.isCopyCode) initialButtons[b.index] = '';
    }

    const initialCards = (meta.cards || []).map((c) => {
      const cardBody = {};
      for (const ph of c.body || []) cardBody[ph] = '';
      const cardButtons = {};
      for (const b of c.buttons || []) {
        if (b.dynamic || b.isCopyCode) cardButtons[b.index] = '';
      }
      return {
        headerMedia: c.headerMediaUrl || '',
        body: cardBody,
        buttons: cardButtons,
      };
    });

    setTemplateParams({
      header: initialHeader,
      body: initialBody,
      buttons: initialButtons,
      headerMedia: meta.hasHeaderSample ? tpl.header_media_url : '',
      documentFilename: '',
      location: { latitude: '', longitude: '', name: '', address: '' },
      cards: initialCards,
    });
  };

  const handleMediaUpload = async (file, target = 'header', cardIndex = 0) => {
    if (!file) return;
    setUploadingMedia(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await uploadAPI.uploadFile(formData);
      const url = res.data?.url;
      if (target === 'header') {
        setTemplateParams((prev) => ({ ...prev, headerMedia: url }));
      } else if (target === 'card') {
        setTemplateParams((prev) => {
          const nextCards = [...(prev.cards || [])];
          nextCards[cardIndex] = { ...(nextCards[cardIndex] || {}), headerMedia: url };
          return { ...prev, cards: nextCards };
        });
      }
    } catch (err) {
      console.error('Failed to upload media', err);
      alert('Failed to upload media file.');
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cardFileInputRef.current) cardFileInputRef.current.value = '';
    }
  };

  const sendTemplate = async (tpl, params) => {
    if (busy) return;
    setConfigError('');

    // Pre-flight validation
    const meta = pendingTemplate?.meta || describeTemplateForElement(tpl);
    const empty = (v) => v === undefined || v === null || String(v).trim() === '';

    for (const ph of meta.header || []) {
      if (empty(params.header?.[ph])) {
        setConfigError(`Header parameter {{${ph}}} is required`);
        return;
      }
    }

    if (meta.headerType === 'LOCATION') {
      if (empty(params.location?.latitude) || empty(params.location?.longitude)) {
        setConfigError('Location header requires both Latitude and Longitude');
        return;
      }
    }

    if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(meta.headerType) && !meta.hasHeaderSample && empty(params.headerMedia)) {
      setConfigError(`Please upload or provide a link for the ${meta.headerType.toLowerCase()} header`);
      return;
    }

    for (const ph of meta.body || []) {
      if (empty(params.body?.[ph])) {
        setConfigError(`Body parameter {{${ph}}} is required`);
        return;
      }
    }

    for (const b of (meta.buttons || [])) {
      if (b.dynamic && empty(params.buttons?.[b.index])) {
        setConfigError(`Button "${b.text}" requires a dynamic URL extension`);
        return;
      }
      if (b.isCopyCode && empty(params.buttons?.[b.index])) {
        setConfigError(`Button "${b.text}" requires a coupon / copy code`);
        return;
      }
    }

    if (meta.isCarousel && meta.cards?.length) {
      for (let i = 0; i < meta.cards.length; i++) {
        const card = meta.cards[i];
        const cp = params.cards?.[i] || {};
        if (['IMAGE', 'VIDEO'].includes(card.headerType) && empty(cp.headerMedia)) {
          setConfigError(`Card ${i + 1} requires an image or video`);
          return;
        }
        for (const ph of card.body || []) {
          if (empty(cp.body?.[ph])) {
            setConfigError(`Card ${i + 1} parameter {{${ph}}} is required`);
            return;
          }
        }
        for (const b of (card.buttons || [])) {
          if (b.dynamic && empty(cp.buttons?.[b.index])) {
            setConfigError(`Card ${i + 1} button "${b.text}" requires a link extension`);
            return;
          }
          if (b.isCopyCode && empty(cp.buttons?.[b.index])) {
            setConfigError(`Card ${i + 1} button "${b.text}" requires a coupon code`);
            return;
          }
        }
      }
    }

    setBusy(true);
    try {
      const res = await conversationAPI.sendMessage(conversationId, {
        templateId: tpl.id,
        templateParams: params,
      });
      onSent?.({ kind: 'template', message: res.data?.message });
      onClose?.();
    } catch (err) {
      console.error('Failed to send template', err);
      setConfigError(err.response?.data?.message || 'Failed to deliver template message.');
    } finally {
      setBusy(false);
    }
  };

  const handlePickFlowRef = async (flowRef) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await conversationAPI.sendMessage(conversationId, { whatsappFlowRefId: flowRef.id });
      onSent?.({ kind: 'whatsappFlow', message: res.data?.message });
      onClose?.();
    } catch (err) {
      console.error('Failed to send WhatsApp Flow', err);
    } finally {
      setBusy(false);
    }
  };

  const handlePickCanned = async (canned) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await conversationAPI.sendMessage(conversationId, { body: canned.body });
      onSent?.({ kind: 'cannedResponse', message: res.data?.message });
      onClose?.();
    } catch (err) {
      console.error('Failed to send canned response', err);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const panelWidth = pendingTemplate ? 440 : 340;
  const panelStyle = {
    position: 'absolute', top: 0, right: 0, bottom: 0, width: panelWidth, maxWidth: '96vw',
    background: '#ffffff', borderLeft: '1px solid #e2e8f0', boxShadow: '-6px 0 20px rgba(0,0,0,0.1)',
    display: 'flex', flexDirection: 'column', zIndex: 50, transition: 'width 0.2s ease',
  };

  // Helper to render preview text with values replaced
  const previewBody = () => {
    if (!pendingTemplate) return '';
    let text = pendingTemplate.tpl.body_text || '';
    for (const [k, v] of Object.entries(templateParams.body || {})) {
      text = text.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), v || `[${k}]`);
    }
    return text;
  };

  const previewHeader = () => {
    if (!pendingTemplate) return '';
    let text = pendingTemplate.tpl.header_text || '';
    for (const [k, v] of Object.entries(templateParams.header || {})) {
      text = text.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), v || `[${k}]`);
    }
    return text;
  };

  return (
    <div style={panelStyle}>
      {/* Header Bar */}
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
        {section !== 'menu' && !pendingTemplate && (
          <button onClick={() => setSection(BACK_TARGET[section] || 'menu')} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}>
            <ChevronLeft size={18} />
          </button>
        )}
        {pendingTemplate && (
          <button onClick={() => setPendingTemplate(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}>
            <ChevronLeft size={18} />
          </button>
        )}
        <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {pendingTemplate ? pendingTemplate.tpl.template_name : SECTION_TITLE[section]}
        </div>
        {pendingTemplate && (
          <button
            type="button"
            onClick={() => setShowPreview((p) => !p)}
            title="Toggle Live Preview"
            style={{
              border: 'none', background: showPreview ? '#eff6ff' : '#f8fafc', color: showPreview ? '#2563eb' : '#64748b',
              cursor: 'pointer', padding: '5px 8px', borderRadius: 6, fontSize: '0.74rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Eye size={13} /> {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
        )}
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}>
          <X size={18} />
        </button>
      </div>

      {/* ── Pending Template Configurator ── */}
      {pendingTemplate ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Meta info tags */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>
                {pendingTemplate.tpl.category || 'MARKETING'}
              </span>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }}>
                {pendingTemplate.tpl.language || 'en_US'}
              </span>
              {pendingTemplate.meta.isCarousel && (
                <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 8px', borderRadius: 4, background: '#fdf2f8', color: '#db2777', border: '1px solid #fbcfe8' }}>
                  🎴 Carousel ({pendingTemplate.meta.cards?.length} cards)
                </span>
              )}
            </div>

            {/* Live WhatsApp Bubble Preview */}
            {showPreview && (
              <div style={{ background: '#f0f2f5', borderRadius: 12, padding: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  WhatsApp Preview
                </div>
                <div style={{ background: '#ffffff', borderRadius: '10px 10px 10px 2px', padding: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', fontSize: '0.82rem', color: '#111827', lineHeight: 1.45 }}>
                  {/* Preview Header */}
                  {['IMAGE', 'VIDEO'].includes(pendingTemplate.meta.headerType) && (
                    <div style={{ height: 120, background: '#e2e8f0', borderRadius: 6, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {templateParams.headerMedia ? (
                        pendingTemplate.meta.headerType === 'VIDEO' ? (
                          <video src={templateParams.headerMedia} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <img src={templateParams.headerMedia} alt="Header" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        )
                      ) : (
                        <span style={{ fontSize: '0.74rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {pendingTemplate.meta.headerType === 'VIDEO' ? <Video size={16} /> : <Image size={16} />} {pendingTemplate.meta.headerType} Header
                        </span>
                      )}
                    </div>
                  )}

                  {pendingTemplate.meta.headerType === 'DOCUMENT' && (
                    <div style={{ padding: '8px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <File size={16} color="#64748b" />
                      <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {templateParams.documentFilename || 'Document attachment'}
                      </span>
                    </div>
                  )}

                  {pendingTemplate.meta.headerType === 'LOCATION' && (
                    <div style={{ padding: '8px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <MapPin size={16} color="#2563eb" />
                      <div style={{ fontSize: '0.74rem' }}>
                        <div style={{ fontWeight: 700, color: '#1e40af' }}>{templateParams.location?.name || 'Location Header'}</div>
                        <div style={{ color: '#3b82f6', fontSize: '0.68rem' }}>{templateParams.location?.latitude || 'Lat'}, {templateParams.location?.longitude || 'Lng'}</div>
                      </div>
                    </div>
                  )}

                  {pendingTemplate.meta.headerType === 'TEXT' && (
                    <div style={{ fontWeight: 800, fontSize: '0.86rem', color: '#0f172a', marginBottom: 4 }}>
                      {previewHeader() || pendingTemplate.tpl.header_text}
                    </div>
                  )}

                  {/* Preview Body */}
                  <div style={{ whiteSpace: 'pre-wrap' }}>
                    {previewBody() || pendingTemplate.tpl.body_text}
                  </div>

                  {/* Preview Footer */}
                  {pendingTemplate.tpl.footer_text && (
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 6 }}>
                      {pendingTemplate.tpl.footer_text}
                    </div>
                  )}
                </div>

                {/* Preview Buttons */}
                {pendingTemplate.meta.buttons?.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                    {pendingTemplate.meta.buttons.map((b) => (
                      <div
                        key={b.index}
                        style={{
                          background: '#ffffff', borderRadius: 8, padding: '7px 10px', textAlign: 'center',
                          fontSize: '0.78rem', fontWeight: 700, color: '#2563eb', border: '1px solid #e2e8f0',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                      >
                        {b.type === 'URL' && <ExternalLink size={12} />}
                        {b.isCopyCode && <Copy size={12} />}
                        <span>{b.text}</span>
                        {b.isCopyCode && templateParams.buttons?.[b.index] && (
                          <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 500 }}>
                            ({templateParams.buttons[b.index]})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 1. Header Media Settings */}
            {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(pendingTemplate.meta.headerType) && (
              <div style={{ padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', background: '#fafafa', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 800, color: '#0f172a' }}>
                  {pendingTemplate.meta.headerType === 'VIDEO' ? <Video size={14} color="#6366f1" /> : pendingTemplate.meta.headerType === 'DOCUMENT' ? <File size={14} color="#6366f1" /> : <Image size={14} color="#6366f1" />}
                  <span>Header {pendingTemplate.meta.headerType}</span>
                </label>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => handleMediaUpload(e.target.files?.[0], 'header')}
                    style={{ display: 'none' }}
                    accept={pendingTemplate.meta.headerType === 'IMAGE' ? 'image/*' : pendingTemplate.meta.headerType === 'VIDEO' ? 'video/*' : 'application/pdf,application/*'}
                  />
                  <button
                    type="button"
                    disabled={uploadingMedia}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
                      border: '1px solid #cbd5e1', background: '#ffffff', fontSize: '0.76rem', fontWeight: 700,
                      color: '#334155', cursor: uploadingMedia ? 'wait' : 'pointer', flexShrink: 0,
                    }}
                  >
                    {uploadingMedia ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Upload size={13} />}
                    {templateParams.headerMedia ? 'Replace File' : 'Upload File'}
                  </button>
                  <input
                    className="form-input"
                    placeholder="or paste public file URL..."
                    style={{ flex: 1, fontSize: '0.78rem', padding: '6px 10px' }}
                    value={templateParams.headerMedia || ''}
                    onChange={(e) => setTemplateParams((prev) => ({ ...prev, headerMedia: e.target.value }))}
                  />
                </div>

                {pendingTemplate.meta.headerType === 'DOCUMENT' && (
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', marginBottom: 2 }}>
                      Document Filename (optional)
                    </label>
                    <input
                      className="form-input"
                      style={{ width: '100%', fontSize: '0.78rem' }}
                      placeholder="e.g. invoice.pdf"
                      value={templateParams.documentFilename || ''}
                      onChange={(e) => setTemplateParams((prev) => ({ ...prev, documentFilename: e.target.value }))}
                    />
                  </div>
                )}
                {pendingTemplate.meta.hasHeaderSample && !templateParams.headerMedia && (
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    Leave empty to send Meta's sample file stored with the template.
                  </span>
                )}
              </div>
            )}

            {/* 2. Location Header Settings */}
            {pendingTemplate.meta.headerType === 'LOCATION' && (
              <div style={{ padding: 12, borderRadius: 10, border: '1px solid #bfdbfe', background: '#eff6ff', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 800, color: '#1e40af' }}>
                  <MapPin size={14} /> Location Header Coordinates
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 2 }}>Latitude *</label>
                    <input
                      className="form-input"
                      style={{ width: '100%', fontSize: '0.78rem' }}
                      placeholder="e.g. 37.483307"
                      value={templateParams.location?.latitude || ''}
                      onChange={(e) => setTemplateParams((prev) => ({ ...prev, location: { ...(prev.location || {}), latitude: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 2 }}>Longitude *</label>
                    <input
                      className="form-input"
                      style={{ width: '100%', fontSize: '0.78rem' }}
                      placeholder="e.g. -122.148331"
                      value={templateParams.location?.longitude || ''}
                      onChange={(e) => setTemplateParams((prev) => ({ ...prev, location: { ...(prev.location || {}), longitude: e.target.value } }))}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 2 }}>Location Name (optional)</label>
                  <input
                    className="form-input"
                    style={{ width: '100%', fontSize: '0.78rem' }}
                    placeholder="e.g. Headquarters"
                    value={templateParams.location?.name || ''}
                    onChange={(e) => setTemplateParams((prev) => ({ ...prev, location: { ...(prev.location || {}), name: e.target.value } }))}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 2 }}>Address (optional)</label>
                  <input
                    className="form-input"
                    style={{ width: '100%', fontSize: '0.78rem' }}
                    placeholder="e.g. 1 Hacker Way, Menlo Park, CA"
                    value={templateParams.location?.address || ''}
                    onChange={(e) => setTemplateParams((prev) => ({ ...prev, location: { ...(prev.location || {}), address: e.target.value } }))}
                  />
                </div>
              </div>
            )}

            {/* 3. Header Text Placeholders */}
            {pendingTemplate.meta.header?.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a' }}>Header Text Parameters</label>
                {pendingTemplate.meta.header.map((ph) => (
                  <div key={`h-${ph}`}>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', marginBottom: 2 }}>
                      Header {{ph}}
                    </label>
                    <input
                      className="form-input"
                      style={{ width: '100%', fontSize: '0.8rem' }}
                      value={templateParams.header?.[ph] || ''}
                      onChange={(e) => setTemplateParams((prev) => ({
                        ...prev,
                        header: { ...(prev.header || {}), [ph]: e.target.value },
                      }))}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* 4. Body Text Placeholders */}
            {pendingTemplate.meta.body?.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a' }}>Body Parameters</label>
                  {contactName && (
                    <button
                      type="button"
                      onClick={() => setTemplateParams((prev) => ({
                        ...prev,
                        body: { ...(prev.body || {}), 1: contactName },
                      }))}
                      style={{ border: 'none', background: 'none', color: '#2563eb', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                    >
                      <Sparkles size={11} /> Fill contact name
                    </button>
                  )}
                </div>
                {pendingTemplate.meta.body.map((ph) => (
                  <div key={`b-${ph}`}>
                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', marginBottom: 2 }}>
                      Body {{ph}}
                    </label>
                    <input
                      className="form-input"
                      style={{ width: '100%', fontSize: '0.8rem' }}
                      placeholder={`Value for {{${ph}}}`}
                      value={templateParams.body?.[ph] || ''}
                      onChange={(e) => setTemplateParams((prev) => ({
                        ...prev,
                        body: { ...(prev.body || {}), [ph]: e.target.value },
                      }))}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* 5. Button Parameters (Dynamic URL or Copy Code) */}
            {pendingTemplate.meta.buttons?.some((b) => b.dynamic || b.isCopyCode) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a' }}>Interactive Button Settings</label>
                {pendingTemplate.meta.buttons.map((b) => {
                  if (b.dynamic) {
                    return (
                      <div key={`btn-${b.index}`}>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', marginBottom: 2 }}>
                          Button "{b.text}" — Link Extension (suffix)
                        </label>
                        <input
                          className="form-input"
                          style={{ width: '100%', fontSize: '0.8rem' }}
                          placeholder="e.g. order-12345"
                          value={templateParams.buttons?.[b.index] || ''}
                          onChange={(e) => setTemplateParams((prev) => ({
                            ...prev,
                            buttons: { ...(prev.buttons || {}), [b.index]: e.target.value },
                          }))}
                        />
                      </div>
                    );
                  }
                  if (b.isCopyCode) {
                    return (
                      <div key={`btn-code-${b.index}`}>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', marginBottom: 2 }}>
                          Button "{b.text}" — Coupon / Copy Code
                        </label>
                        <input
                          className="form-input"
                          style={{ width: '100%', fontSize: '0.8rem' }}
                          placeholder="e.g. DISCOUNT50 or 123456"
                          value={templateParams.buttons?.[b.index] || ''}
                          onChange={(e) => setTemplateParams((prev) => ({
                            ...prev,
                            buttons: { ...(prev.buttons || {}), [b.index]: e.target.value },
                          }))}
                        />
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            )}

            {/* 6. Carousel Cards Configurator */}
            {pendingTemplate.meta.isCarousel && pendingTemplate.meta.cards?.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#fafafa' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    <Layers size={14} color="#db2777" /> Carousel Cards ({pendingTemplate.meta.cards.length})
                  </label>
                </div>

                {/* Card Tabs */}
                <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 4 }}>
                  {pendingTemplate.meta.cards.map((c, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveCardTab(idx)}
                      style={{
                        padding: '5px 12px', borderRadius: 6, fontSize: '0.74rem', fontWeight: 700,
                        border: '1px solid', borderColor: activeCardTab === idx ? '#db2777' : '#e2e8f0',
                        background: activeCardTab === idx ? '#fdf2f8' : '#ffffff',
                        color: activeCardTab === idx ? '#db2777' : '#64748b',
                        cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      Card {idx + 1}
                    </button>
                  ))}
                </div>

                {/* Active Card Editor */}
                {(() => {
                  const card = pendingTemplate.meta.cards[activeCardTab] || {};
                  const cardParam = templateParams.cards?.[activeCardTab] || {};
                  const cardMediaKind = ['IMAGE', 'VIDEO'].includes(card.headerType) ? card.headerType : 'IMAGE';

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: '#ffffff', padding: 10, borderRadius: 8, border: '1px solid #f1f5f9' }}>
                      <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#334155' }}>
                        Card {activeCardTab + 1} Settings ({cardMediaKind})
                      </div>

                      {/* Card Media Header */}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                          Card {cardMediaKind} *
                        </label>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="file"
                            ref={cardFileInputRef}
                            onChange={(e) => handleMediaUpload(e.target.files?.[0], 'card', activeCardTab)}
                            style={{ display: 'none' }}
                            accept={cardMediaKind === 'VIDEO' ? 'video/*' : 'image/*'}
                          />
                          <button
                            type="button"
                            disabled={uploadingMedia}
                            onClick={() => cardFileInputRef.current?.click()}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6,
                              border: '1px solid #cbd5e1', background: '#ffffff', fontSize: '0.74rem', fontWeight: 700,
                              color: '#334155', cursor: uploadingMedia ? 'wait' : 'pointer', flexShrink: 0,
                            }}
                          >
                            <Upload size={12} /> {cardParam.headerMedia ? 'Replace' : 'Upload'}
                          </button>
                          <input
                            className="form-input"
                            placeholder="or paste image URL..."
                            style={{ flex: 1, fontSize: '0.76rem', padding: '5px 8px' }}
                            value={cardParam.headerMedia || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setTemplateParams((prev) => {
                                const nextCards = [...(prev.cards || [])];
                                nextCards[activeCardTab] = { ...(nextCards[activeCardTab] || {}), headerMedia: val };
                                return { ...prev, cards: nextCards };
                              });
                            }}
                          />
                        </div>
                      </div>

                      {/* Card Body Text */}
                      {card.bodyText && (
                        <div style={{ fontSize: '0.74rem', color: '#475569', background: '#f8fafc', padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                          {card.bodyText}
                        </div>
                      )}

                      {/* Card Body Parameters */}
                      {card.body?.map((ph) => (
                        <div key={`card-${activeCardTab}-b-${ph}`}>
                          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', marginBottom: 2 }}>
                            Card {activeCardTab + 1} Body {{ph}}
                          </label>
                          <input
                            className="form-input"
                            style={{ width: '100%', fontSize: '0.78rem' }}
                            value={cardParam.body?.[ph] || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setTemplateParams((prev) => {
                                const nextCards = [...(prev.cards || [])];
                                nextCards[activeCardTab] = {
                                  ...(nextCards[activeCardTab] || {}),
                                  body: { ...(nextCards[activeCardTab]?.body || {}), [ph]: val },
                                };
                                return { ...prev, cards: nextCards };
                              });
                            }}
                          />
                        </div>
                      ))}

                      {/* Card Buttons */}
                      {card.buttons?.map((b) => (
                        <div key={`card-${activeCardTab}-btn-${b.index}`}>
                          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#64748b', marginBottom: 2 }}>
                            Button "{b.text}" {b.dynamic ? '— Link Extension' : b.isCopyCode ? '— Coupon Code' : ''}
                          </label>
                          {(b.dynamic || b.isCopyCode) && (
                            <input
                              className="form-input"
                              style={{ width: '100%', fontSize: '0.78rem' }}
                              value={cardParam.buttons?.[b.index] || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setTemplateParams((prev) => {
                                  const nextCards = [...(prev.cards || [])];
                                  nextCards[activeCardTab] = {
                                    ...(nextCards[activeCardTab] || {}),
                                    buttons: { ...(nextCards[activeCardTab]?.buttons || {}), [b.index]: val },
                                  };
                                  return { ...prev, cards: nextCards };
                                });
                              }}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Error banner */}
            {configError && (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.76rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                <span>{configError}</span>
              </div>
            )}
          </div>

          {/* Send Action Footer */}
          <div style={{ padding: 14, borderTop: '1px solid #e2e8f0', background: '#ffffff', display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setPendingTemplate(null)}
              className="btn btn-secondary"
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || uploadingMedia}
              onClick={() => sendTemplate(pendingTemplate.tpl, templateParams)}
              style={{ flex: 2, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {busy ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Send size={14} />}
              {busy ? 'Sending…' : 'Send Template'}
            </button>
          </div>
        </div>
      ) : section === 'menu' ? (
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={() => setSection('flowsTemplates')} style={menuItemStyle}>
            <Layers size={18} color="#6366f1" /> <span>Flows & Templates</span>
          </button>
          <button onClick={() => setSection('cannedResponse')} style={menuItemStyle}>
            <MessageCircle size={18} color="#0ea5e9" /> <span>Canned Response</span>
          </button>
        </div>
      ) : section === 'flowsTemplates' ? (
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={() => setSection('flow')} style={menuItemStyle}>
            <Bot size={18} color="#6366f1" /> <span>Bot Flow</span>
          </button>
          {isWhatsApp && (
            <button onClick={() => setSection('template')} style={menuItemStyle}>
              <FileText size={18} color="#10b981" /> <span>Message Template</span>
            </button>
          )}
          {isWhatsApp && (
            <button onClick={() => setSection('whatsappFlow')} style={menuItemStyle}>
              <Workflow size={18} color="#f59e0b" /> <span>WhatsApp Flow</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={13} color="#94a3b8" style={{ position: 'absolute', left: 9, top: 9 }} />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                style={{ width: '100%', padding: '7px 10px 7px 28px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.8rem', boxSizing: 'border-box' }}
              />
            </div>
            {section === 'cannedResponse' && (
              <button
                type="button"
                onClick={() => setShowCreateCanned(true)}
                title="Create a new canned response"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                  padding: '7px 10px', borderRadius: 8, border: '1px solid #bfdbfe',
                  background: '#eff6ff', color: '#2563eb', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
                }}
              >
                <Plus size={13} /> Create
              </button>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 24 }}><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
            ) : section === 'flow' ? (
              filteredFlows.length === 0 ? <EmptyState text="No matching bot flows." /> : filteredFlows.map((f) => (
                <ListRow key={f.id} title={f.name} subtitle={f.platform} onClick={() => handlePickFlow(f)} disabled={busy} />
              ))
            ) : section === 'template' ? (
              filteredTemplates.length === 0 ? <EmptyState text="No approved templates for this bot." /> : filteredTemplates.map((t) => {
                const isCar = (t.template_type || '').toUpperCase() === 'CAROUSEL';
                return (
                  <ListRow
                    key={t.id}
                    title={
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{t.template_name}</span>
                        {isCar && <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: 4, background: '#fdf2f8', color: '#db2777' }}>Carousel</span>}
                        {t.header_type && t.header_type !== 'NONE' && t.header_type !== 'TEXT' && (
                          <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: 4, background: '#f1f5f9', color: '#475569' }}>{t.header_type}</span>
                        )}
                      </div>
                    }
                    subtitle={t.body_text}
                    onClick={() => handlePickTemplate(t)}
                    disabled={busy}
                  />
                );
              })
            ) : section === 'whatsappFlow' ? (
              filteredFlowRefs.length === 0 ? <EmptyState text="No WhatsApp Flows configured yet. Add one under Automation → Data Collection → WhatsApp Flows." /> : filteredFlowRefs.map((f) => (
                <ListRow key={f.id} title={f.name} subtitle={f.flow_id} onClick={() => handlePickFlowRef(f)} disabled={busy} />
              ))
            ) : (
              filteredCanned.length === 0 ? <EmptyState text="No canned responses saved yet." /> : filteredCanned.map((c) => (
                <ListRow key={c.id} title={c.title || c.shortcut} subtitle={c.body} onClick={() => handlePickCanned(c)} disabled={busy} />
              ))
            )}
          </div>
        </>
      )}

      <CreateCannedModal
        open={showCreateCanned}
        onClose={() => setShowCreateCanned(false)}
        onCreated={(newCanned) => onCannedCreated?.(newCanned)}
      />
    </div>
  );
}

const menuItemStyle = {
  display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10,
  border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '0.86rem', fontWeight: 700, color: '#0f172a',
};

function ListRow({ title, subtitle, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'block', width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 8,
        border: 'none', background: 'transparent', cursor: disabled ? 'wait' : 'pointer', marginBottom: 2,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>{title}</div>
      {subtitle && <div style={{ fontSize: '0.72rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</div>}
    </button>
  );
}

function EmptyState({ text }) {
  return <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8', fontSize: '0.8rem' }}>{text}</div>;
}
