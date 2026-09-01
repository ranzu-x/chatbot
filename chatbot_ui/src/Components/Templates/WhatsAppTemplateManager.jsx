import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Swal from 'sweetalert2';
import { templateAPI } from '../../services/api';
import {
  Sparkles,
  RefreshCw,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  PauseCircle,
  Trash2,
  Copy,
  ExternalLink,
  Eye,
  MessageSquare,
  FileText,
  Image as ImageIcon,
  Video,
  File,
  MapPin,
  Phone,
  Link2,
  Tag,
  ShoppingBag,
  Sliders,
  Layers,
  ChevronRight,
  ChevronLeft,
  Info,
  Check,
  Send,
  HelpCircle,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Globe,
  User,
  LayoutGrid,
  CreditCard,
  ChevronDown,
} from 'lucide-react';

/* ─── WhatsApp Supported Languages ─── */
const WA_LANGUAGES = [
  { code: 'en_US', label: 'English (US)' },
  { code: 'en_GB', label: 'English (UK)' },
  { code: 'bn', label: 'Bengali (bn)' },
  { code: 'ar', label: 'Arabic (ar)' },
  { code: 'es', label: 'Spanish (es)' },
  { code: 'fr', label: 'French (fr)' },
  { code: 'de', label: 'German (de)' },
  { code: 'hi', label: 'Hindi (hi)' },
  { code: 'id', label: 'Indonesian (id)' },
  { code: 'pt_BR', label: 'Portuguese (BR)' },
  { code: 'ur', label: 'Urdu (ur)' },
  { code: 'tr', label: 'Turkish (tr)' },
];

/* ─── Category Details ─── */
const CATEGORIES = [
  {
    id: 'MARKETING',
    label: 'Marketing',
    color: '#2563eb',
    bg: '#eff6ff',
    border: '#bfdbfe',
    desc: 'Promotions, product announcements, discount offers, newsletters, and general brand engagement.',
  },
  {
    id: 'UTILITY',
    label: 'Utility',
    color: '#059669',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    desc: 'Order confirmations, delivery/shipping updates, account alerts, receipts, and booking notifications.',
  },
  {
    id: 'AUTHENTICATION',
    label: 'Authentication',
    color: '#d97706',
    bg: '#fffbeb',
    border: '#fde68a',
    desc: 'One-time passcodes (OTP) and two-factor verification codes for login or account recovery.',
  },
];

/* ─── Status Pill Helpers ─── */
function renderStatusBadge(status) {
  const s = (status || 'PENDING').toUpperCase();
  if (s === 'APPROVED') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 12, background: 'rgba(16, 185, 129, 0.1)', color: '#059669', fontSize: '0.74rem', fontWeight: 700 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981' }} />
        Approved
      </span>
    );
  }
  if (s === 'REJECTED') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 12, background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', fontSize: '0.74rem', fontWeight: 700 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444' }} />
        Rejected
      </span>
    );
  }
  if (s === 'PAUSED' || s === 'DISABLED') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 12, background: 'rgba(100, 116, 139, 0.1)', color: '#475569', fontSize: '0.74rem', fontWeight: 700 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#64748b' }} />
        {s === 'PAUSED' ? 'Paused' : 'Disabled'}
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 12, background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', fontSize: '0.74rem', fontWeight: 700 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f59e0b' }} />
      In Review
    </span>
  );
}

export default function WhatsAppTemplateManager({ selectedAccount, showToast }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  // Modals & Selector
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCarouselModal, setShowCarouselModal] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [saving, setSaving] = useState(false);

  // Standard Template Form State
  const [form, setForm] = useState({
    templateName: '',
    language: 'en_US',
    category: 'MARKETING',
    headerType: 'NONE',
    headerText: '',
    headerMediaUrl: '',
    headerSample: '',
    bodyText: '',
    footerText: '',
    submitToMeta: true,
  });

  const [buttons, setButtons] = useState([]);
  const [variables, setVariables] = useState([]);

  // Carousel Template Form State
  const [carouselForm, setCarouselForm] = useState({
    templateName: '',
    language: 'en_US',
    bodyText: 'Discover our top featured collection below! Swipe to explore more:',
    submitToMeta: true,
  });

  const [carouselCards, setCarouselCards] = useState([
    {
      id: 1,
      headerType: 'IMAGE',
      mediaUrl: '',
      bodyText: 'Special 20% Off on our best-selling items this week.',
      buttons: [{ id: 101, type: 'URL', text: 'Shop Now', url: 'https://example.com/shop', urlType: 'static' }],
    },
    {
      id: 2,
      headerType: 'IMAGE',
      mediaUrl: '',
      bodyText: 'Exclusive new arrivals designed just for you.',
      buttons: [{ id: 102, type: 'URL', text: 'Shop Now', url: 'https://example.com/new', urlType: 'static' }],
    },
  ]);
  const [activeCardIdx, setActiveCardIdx] = useState(0);
  const [previewCardIdx, setPreviewCardIdx] = useState(0);

  /* ─── Load Templates ─── */
  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await templateAPI.getWATemplates({
        integrationId: selectedAccount?.id !== 'all' ? selectedAccount?.id : undefined,
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        templateType: typeFilter !== 'ALL' ? typeFilter : undefined,
        search: search.trim() || undefined,
      });
      setTemplates(res.data?.templates || []);
    } catch (err) {
      console.error('Failed to load WhatsApp templates:', err);
      if (showToast) showToast('Failed to load WhatsApp templates', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, categoryFilter, statusFilter, typeFilter, search, showToast]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  /* ─── Sync with Meta Cloud API ─── */
  const handleSyncFromMeta = async () => {
    setSyncing(true);
    try {
      const res = await templateAPI.syncWATemplates({
        integrationId: selectedAccount?.id !== 'all' ? selectedAccount?.id : undefined,
      });
      if (showToast) showToast(res.data?.message || 'Synced templates from Meta successfully!');
      loadTemplates();
    } catch (err) {
      console.error('Sync failed:', err);
      if (showToast) showToast(err.response?.data?.message || 'Failed to sync templates from Meta', 'error');
    } finally {
      setSyncing(false);
    }
  };

  /* ─── Delete Template ─── */
  const handleDelete = async (tpl) => {
    if (!window.confirm(`Are you sure you want to delete template "${tpl.template_name}"? This will delete it from Meta as well.`)) return;
    try {
      await templateAPI.deleteWATemplate(tpl.id);
      if (showToast) showToast(`Template "${tpl.template_name}" deleted`);
      setTemplates((prev) => prev.filter((t) => t.id !== tpl.id));
      if (previewTemplate?.id === tpl.id) setPreviewTemplate(null);
    } catch (err) {
      console.error('Delete failed:', err);
      if (showToast) showToast(err.response?.data?.message || 'Failed to delete template', 'error');
    }
  };

  const bodyTextareaRef = useRef(null);

  /* ─── Auto-detect & synchronize variables in body ─── */
  const handleBodyChange = (text) => {
    setForm((prev) => ({ ...prev, bodyText: text }));

    // Extract all unique {{n}}
    const matches = text.match(/\{\{(\d+)\}\}/g) || [];
    const unique = Array.from(new Set(matches));

    setVariables((prev) => {
      return unique.map((param, idx) => {
        const existing = prev.find((v) => v.param === param);
        if (existing) return existing;
        return {
          param,
          type: 'contact_field',
          field: idx === 0 ? 'name' : idx === 1 ? 'phone' : 'custom',
          sample: idx === 0 ? 'John Doe' : idx === 1 ? '+1234567890' : 'Value',
        };
      });
    });
  };

  /* ─── Insert Subscriber Field / Variable Helper ─── */
  const insertSubscriberField = (fieldName = 'name', sampleVal = 'John Doe') => {
    const matches = form.bodyText.match(/\{\{(\d+)\}\}/g) || [];
    const nextNum = matches.length + 1;
    const placeholder = `{{${nextNum}}}`;

    let newText = form.bodyText;
    const textarea = bodyTextareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart ?? form.bodyText.length;
      const end = textarea.selectionEnd ?? form.bodyText.length;
      newText = form.bodyText.substring(0, start) + placeholder + form.bodyText.substring(end);
    } else {
      newText = `${form.bodyText}${placeholder}`;
    }

    setForm((prev) => ({ ...prev, bodyText: newText }));

    const allMatches = newText.match(/\{\{(\d+)\}\}/g) || [];
    const unique = Array.from(new Set(allMatches));

    setVariables((prev) => {
      return unique.map((param, idx) => {
        if (param === placeholder) {
          return {
            param,
            type: 'contact_field',
            field: fieldName,
            sample: sampleVal,
          };
        }
        const existing = prev.find((v) => v.param === param);
        if (existing) return existing;
        return {
          param,
          type: 'contact_field',
          field: idx === 0 ? 'name' : idx === 1 ? 'phone' : 'custom',
          sample: idx === 0 ? 'John Doe' : idx === 1 ? '+1234567890' : 'Value',
        };
      });
    });

    if (textarea) {
      setTimeout(() => {
        textarea.focus();
      }, 50);
    }
  };

  /* ─── Text Formatting Helpers ─── */
  const applyFormat = (wrapper) => {
    const textarea = bodyTextareaRef.current;
    if (textarea && textarea.selectionStart !== undefined && textarea.selectionStart !== textarea.selectionEnd) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = form.bodyText.substring(start, end);
      const newText = form.bodyText.substring(0, start) + wrapper + selected + wrapper + form.bodyText.substring(end);
      setForm((prev) => ({ ...prev, bodyText: newText }));
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + wrapper.length, end + wrapper.length);
      }, 50);
    } else {
      setForm((prev) => ({
        ...prev,
        bodyText: `${prev.bodyText}${wrapper}text${wrapper}`,
      }));
    }
  };

  /* ─── Button Type Limit Helpers ─── */
  const countByType = (type) => buttons.filter((b) => b.type === type).length;

  const canAddButton = (type) => {
    if (buttons.length >= 10) return false;
    switch (type) {
      case 'URL':          return countByType('URL') < 2;
      case 'PHONE_NUMBER': return countByType('PHONE_NUMBER') < 1;
      case 'COPY_CODE':    return countByType('COPY_CODE') < 1;
      case 'QUICK_REPLY':  return countByType('QUICK_REPLY') < 10;
      default:             return true;
    }
  };

  const addButtonLimitMsg = (type) => {
    if (buttons.length >= 10) return 'Maximum 10 buttons per template';
    switch (type) {
      case 'URL':          return 'Maximum 2 Website URL buttons per template';
      case 'PHONE_NUMBER': return 'Maximum 1 Phone Call button per template';
      case 'COPY_CODE':    return 'Maximum 1 Copy Code button per template';
      default:             return null;
    }
  };

  /* ─── Add Button to Standard Form ─── */
  const addButton = (type) => {
    if (!canAddButton(type)) {
      const msg = addButtonLimitMsg(type);
      if (showToast && msg) showToast(msg, 'error');
      return;
    }
    const newBtn = {
      id: Date.now(),
      type,
      text: type === 'QUICK_REPLY' ? 'Quick Reply'
          : type === 'PHONE_NUMBER' ? 'Call Us'
          : type === 'URL'          ? 'Visit Website'
          : type === 'COPY_CODE'    ? 'Copy Code'
          : 'Button',
      phoneNumber: '+1234567890',
      url: 'https://example.com',
      urlType: 'static',
      couponCode: 'DISCOUNT20',
    };
    setButtons([...buttons, newBtn]);
  };

  const removeButton = (id) => {
    setButtons(buttons.filter((b) => b.id !== id));
  };

  const updateButton = (id, field, value) => {
    setButtons(buttons.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
  };

  /* ─── Carousel Card Operations ─── */
  const addCarouselCard = () => {
    if (carouselCards.length >= 10) {
      if (showToast) showToast('Carousel templates allow maximum 10 cards.', 'error');
      return;
    }
    const cardNum = carouselCards.length + 1;
    // Mirror button structure of first card for Meta consistency
    const firstCardBtns = carouselCards[0]?.buttons || [];
    const mirroredBtns = firstCardBtns.map((b, i) => ({
      id: Date.now() + i,
      type: b.type,
      text: b.text,
      url: b.url,
      urlType: b.urlType || 'static',
      phoneNumber: b.phoneNumber,
    }));

    const newCard = {
      id: Date.now(),
      headerType: 'IMAGE',
      mediaUrl: '',
      bodyText: `Product/Offer ${cardNum} details`,
      buttons: mirroredBtns.length > 0 ? mirroredBtns : [{ id: Date.now() + 1, type: 'URL', text: 'View Now', url: 'https://example.com', urlType: 'static' }],
    };

    setCarouselCards([...carouselCards, newCard]);
    setActiveCardIdx(carouselCards.length);
  };

  const removeCarouselCard = (index) => {
    if (carouselCards.length <= 2) {
      if (showToast) showToast('Carousel templates require at least 2 cards.', 'error');
      return;
    }
    const updated = carouselCards.filter((_, i) => i !== index);
    setCarouselCards(updated);
    if (activeCardIdx >= updated.length) {
      setActiveCardIdx(updated.length - 1);
    }
  };

  const updateCard = (field, value) => {
    setCarouselCards((prev) =>
      prev.map((c, i) => (i === activeCardIdx ? { ...c, [field]: value } : c))
    );
  };

  const addCardButton = (type) => {
    const currentCard = carouselCards[activeCardIdx];
    if (currentCard.buttons && currentCard.buttons.length >= 2) {
      if (showToast) showToast('Each carousel card can have maximum 2 buttons.', 'error');
      return;
    }
    const newBtn = {
      id: Date.now(),
      type,
      text: type === 'QUICK_REPLY' ? 'Select Option' : type === 'PHONE_NUMBER' ? 'Call' : 'View Link',
      url: 'https://example.com',
      urlType: 'static',
      phoneNumber: '+1234567890',
    };
    updateCard('buttons', [...(currentCard.buttons || []), newBtn]);
  };

  const removeCardButton = (btnId) => {
    const currentCard = carouselCards[activeCardIdx];
    updateCard('buttons', (currentCard.buttons || []).filter((b) => b.id !== btnId));
  };

  const updateCardButton = (btnId, field, value) => {
    const currentCard = carouselCards[activeCardIdx];
    updateCard(
      'buttons',
      (currentCard.buttons || []).map((b) => (b.id === btnId ? { ...b, [field]: value } : b))
    );
  };

  const applyButtonsToAllCards = () => {
    const currentCardBtns = carouselCards[activeCardIdx]?.buttons || [];
    setCarouselCards((prev) =>
      prev.map((card) => ({
        ...card,
        buttons: currentCardBtns.map((b, i) => ({
          ...b,
          id: Date.now() + Math.random() + i,
        })),
      }))
    );
    if (showToast) showToast('Buttons replicated across all cards for Meta uniformity.');
  };

  /* ─── Submit Standard Template ─── */
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!form.templateName.trim()) {
      if (showToast) showToast('Please enter a valid template name', 'error');
      return;
    }
    if (!form.bodyText.trim()) {
      if (showToast) showToast('Body text is required', 'error');
      return;
    }

    // Client-side validation: Duplicate button labels check (Meta rule)
    const buttonTexts = buttons.map((b) => (b.text || '').trim().toLowerCase()).filter(Boolean);
    if (new Set(buttonTexts).size !== buttonTexts.length) {
      Swal.fire({
        icon: 'error',
        title: "Duplicate Button Text",
        text: "You can't enter the same text for multiple buttons. Each button in your template must have a unique label.",
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'OK, I will change it',
      });
      return;
    }

    setSaving(true);
    try {
      const normalizedButtons = buttons.map((b) => {
        if (b.type === 'URL' && b.urlType === 'dynamic') {
          const base = (b.url || '').replace(/\/$/, '');
          return {
            ...b,
            url: `${base}/{{1}}`,
          };
        }
        return b;
      });

      const payload = {
        integrationId: selectedAccount?.id !== 'all' ? selectedAccount?.id : undefined,
        templateName: form.templateName.trim(),
        templateType: 'STANDARD',
        language: form.language,
        category: form.category,
        headerType: form.headerType,
        headerText: form.headerType === 'TEXT' ? form.headerText : undefined,
        headerMediaUrl: ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(form.headerType) ? form.headerMediaUrl : undefined,
        headerSample: form.headerSample,
        bodyText: form.bodyText,
        footerText: form.footerText.trim() || undefined,
        buttons: normalizedButtons,
        variables,
        submitToMeta: form.submitToMeta,
      };

      const res = await templateAPI.createWATemplate(payload);
      if (showToast) showToast(res.data?.message || 'Template created successfully!');
      setShowCreateModal(false);
      // Reset form
      setForm({
        templateName: '',
        language: 'en_US',
        category: 'MARKETING',
        headerType: 'NONE',
        headerText: '',
        headerMediaUrl: '',
        headerSample: '',
        bodyText: '',
        footerText: '',
        submitToMeta: true,
      });
      setButtons([]);
      setVariables([]);
      loadTemplates();
    } catch (err) {
      console.error('Template create error:', err);
      const errData = err.response?.data;
      const metaErr = errData?.errorDetails?.error || errData?.error;
      const title = metaErr?.error_user_title || 'Template Submission Failed';
      const msg = metaErr?.error_user_msg || metaErr?.message || errData?.message || err.message || 'Failed to create WhatsApp template';

      Swal.fire({
        icon: 'error',
        title: title,
        text: msg,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'OK, I will fix it',
      });
    } finally {
      setSaving(false);
    }
  };

  /* ─── Submit Carousel Template ─── */
  const handleCarouselSubmit = async (e) => {
    e.preventDefault();
    if (!carouselForm.templateName.trim()) {
      if (showToast) showToast('Please enter a template reference name', 'error');
      return;
    }
    if (!carouselForm.bodyText.trim()) {
      if (showToast) showToast('Top message body text is required', 'error');
      return;
    }
    if (carouselCards.length < 2) {
      if (showToast) showToast('Carousel templates require at least 2 cards.', 'error');
      return;
    }

    // Client-side validation: Duplicate button labels check per card
    for (let i = 0; i < carouselCards.length; i++) {
      const card = carouselCards[i];
      const cardBtnTexts = (card.buttons || []).map((b) => (b.text || '').trim().toLowerCase()).filter(Boolean);
      if (new Set(cardBtnTexts).size !== cardBtnTexts.length) {
        Swal.fire({
          icon: 'error',
          title: "Duplicate Button Text",
          text: `Card ${i + 1} has duplicate button text. You can't enter the same text for multiple buttons on the same card.`,
          confirmButtonColor: '#ef4444',
          confirmButtonText: 'OK, I will fix it',
        });
        return;
      }
    }

    setSaving(true);
    try {
      const normalizedCards = carouselCards.map((c) => ({
        ...c,
        buttons: (c.buttons || []).map((b) => {
          if (b.type === 'URL' && b.urlType === 'dynamic') {
            const base = (b.url || '').replace(/\/$/, '');
            return { ...b, url: `${base}/{{1}}` };
          }
          return b;
        }),
      }));

      const payload = {
        integrationId: selectedAccount?.id !== 'all' ? selectedAccount?.id : undefined,
        templateName: carouselForm.templateName.trim(),
        templateType: 'CAROUSEL',
        language: carouselForm.language,
        category: 'MARKETING',
        bodyText: carouselForm.bodyText,
        carouselCards: normalizedCards,
        submitToMeta: carouselForm.submitToMeta,
      };

      const res = await templateAPI.createWATemplate(payload);
      if (showToast) showToast(res.data?.message || 'Carousel template created successfully!');
      setShowCarouselModal(false);
      setCarouselForm({
        templateName: '',
        language: 'en_US',
        bodyText: 'Discover our top featured collection below! Swipe to explore more:',
        submitToMeta: true,
      });
      loadTemplates();
    } catch (err) {
      console.error('Carousel template create error:', err);
      const errData = err.response?.data;
      const metaErr = errData?.errorDetails?.error || errData?.error;
      const title = metaErr?.error_user_title || 'Carousel Template Submission Failed';
      const msg = metaErr?.error_user_msg || metaErr?.message || errData?.message || err.message || 'Failed to create carousel template';

      Swal.fire({
        icon: 'error',
        title: title,
        text: msg,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'OK, I will fix it',
      });
    } finally {
      setSaving(false);
    }
  };

  /* ─── Real-time Preview Text Interpolation ─── */
  const previewBodyText = useMemo(() => {
    let text = form.bodyText || 'Your template message body will appear here with dynamic variables preview.';
    variables.forEach((v) => {
      if (v.param) {
        text = text.replaceAll(v.param, `[${v.sample || v.field || v.param}]`);
      }
    });
    return text;
  }, [form.bodyText, variables]);

  const filteredList = useMemo(() => {
    return templates.filter((t) => {
      if (categoryFilter !== 'ALL' && t.category !== categoryFilter) return false;
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (typeFilter !== 'ALL' && (t.template_type || 'STANDARD') !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const mName = t.template_name?.toLowerCase().includes(q);
        const mBody = t.body_text?.toLowerCase().includes(q);
        if (!mName && !mBody) return false;
      }
      return true;
    });
  }, [templates, categoryFilter, statusFilter, typeFilter, search]);

  return (
    <div className="wa-template-manager" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Header Toolbar ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 14,
          padding: '18px 22px',
          background: '#ffffff',
          borderRadius: 14,
          border: '1px solid #e4e4f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1a1a2e', margin: 0 }}>
              WhatsApp Message Templates
            </h3>
            <span style={{ fontSize: '0.74rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(37, 211, 102, 0.12)', color: '#15803d' }}>
              {selectedAccount?.name || 'WhatsApp Channel'}
            </span>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0 0' }}>
            Create, manage, and sync Standard & Carousel templates with interactive CTA buttons, dynamic URLs, and instant preview.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
          <button
            onClick={handleSyncFromMeta}
            disabled={syncing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: syncing ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync from Meta'}
          </button>

          {/* ── Create Template Dropdown Trigger ── */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowTypeMenu(!showTypeMenu)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                borderRadius: 8,
                background: '#25d366',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(37, 211, 102, 0.25)',
              }}
            >
              <Plus size={15} /> Create Message Template <ChevronDown size={14} />
            </button>

            {showTypeMenu && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '115%',
                  width: 280,
                  background: '#ffffff',
                  borderRadius: 12,
                  boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                  border: '1px solid #e2e8f0',
                  padding: 6,
                  zIndex: 100,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <div
                  onClick={() => {
                    setShowTypeMenu(false);
                    setShowCreateModal(true);
                  }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <MessageSquare size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a' }}>Standard / Mixed Template</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>Single message with media header, text & up to 10 mixed buttons.</div>
                  </div>
                </div>

                <div
                  onClick={() => {
                    setShowTypeMenu(false);
                    setShowCarouselModal(true);
                  }}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fdf2f8', color: '#db2777', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <LayoutGrid size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a' }}>Carousel Template 🎴</div>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>Swipeable multi-card marketing deck with image headers & buttons.</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Filters Bar ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        {/* Category Filter Pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', marginRight: 4 }}>Category:</span>
          {['ALL', 'MARKETING', 'UTILITY', 'AUTHENTICATION'].map((cat) => {
            const isSel = categoryFilter === cat;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 20,
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  border: `1px solid ${isSel ? '#25d366' : '#e2e8f0'}`,
                  background: isSel ? '#25d366' : '#ffffff',
                  color: isSel ? '#ffffff' : '#64748b',
                  cursor: 'pointer',
                }}
              >
                {cat === 'ALL' ? 'All Categories' : cat.charAt(0) + cat.slice(1).toLowerCase()}
              </button>
            );
          })}
        </div>

        {/* Type & Status Filter Pills & Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: '0.78rem',
              fontWeight: 600,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#334155',
            }}
          >
            <option value="ALL">All Types</option>
            <option value="STANDARD">📱 Standard Templates</option>
            <option value="CAROUSEL">🎴 Carousel Templates</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              fontSize: '0.78rem',
              fontWeight: 600,
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#334155',
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="APPROVED">🟢 Approved</option>
            <option value="PENDING">🟡 In Review / Pending</option>
            <option value="REJECTED">🔴 Rejected</option>
            <option value="PAUSED">⏸️ Paused</option>
          </select>

          <div style={{ position: 'relative', minWidth: 200 }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Search templates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 30, fontSize: '0.8rem', height: 34 }}
            />
          </div>
        </div>
      </div>

      {/* ── Templates Table ── */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 14,
          border: '1px solid #e4e4f0',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}
      >
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
            <span style={{ fontSize: '0.84rem', color: '#64748b' }}>Loading WhatsApp templates...</span>
          </div>
        ) : filteredList.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <FileText size={42} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
            <h4 style={{ fontSize: '1rem', fontWeight: 800, color: '#1a1a2e', margin: '0 0 6px 0' }}>
              No WhatsApp Templates Found
            </h4>
            <p style={{ fontSize: '0.82rem', color: '#64748b', maxWidth: 420, margin: '0 auto 18px' }}>
              Click "Sync from Meta" to pull templates from your WhatsApp Business Account, or create a new Standard or Carousel template.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
              <button
                onClick={handleSyncFromMeta}
                disabled={syncing}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#ffffff', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
              >
                Sync from Meta
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                style={{ padding: '8px 18px', borderRadius: 8, background: '#25d366', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
              >
                + Create Standard
              </button>
              <button
                onClick={() => setShowCarouselModal(true)}
                style={{ padding: '8px 18px', borderRadius: 8, background: '#db2777', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}
              >
                + Create Carousel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 18px', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Status</th>
                  <th style={{ padding: '12px 18px', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Template Name & Type</th>
                  <th style={{ padding: '12px 18px', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Category</th>
                  <th style={{ padding: '12px 18px', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Language</th>
                  <th style={{ padding: '12px 18px', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Content Overview</th>
                  <th style={{ padding: '12px 18px', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Interactive Elements</th>
                  <th style={{ padding: '12px 18px', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((tpl) => {
                  let buttonsArr = [];
                  let cardsArr = [];
                  try {
                    buttonsArr = typeof tpl.buttons_json === 'string' ? JSON.parse(tpl.buttons_json || '[]') : tpl.buttons_json || [];
                    cardsArr = typeof tpl.carousel_cards_json === 'string' ? JSON.parse(tpl.carousel_cards_json || '[]') : tpl.carousel_cards_json || [];
                  } catch {
                    buttonsArr = [];
                    cardsArr = [];
                  }

                  const isCarousel = (tpl.template_type || '').toUpperCase() === 'CAROUSEL' || cardsArr.length > 0;
                  const catObj = CATEGORIES.find((c) => c.id === tpl.category) || CATEGORIES[0];

                  return (
                    <tr key={tpl.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.12s' }}>
                      <td style={{ padding: '14px 18px', verticalAlign: 'middle' }}>
                        {renderStatusBadge(tpl.status)}
                      </td>
                      <td style={{ padding: '14px 18px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 800, fontSize: '0.86rem', color: '#0f172a' }}>
                            {tpl.template_name}
                          </span>
                          {isCarousel ? (
                            <span style={{ fontSize: '0.66rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: '#fdf2f8', color: '#db2777', border: '1px solid #fbcfe8' }}>
                              🎴 Carousel ({cardsArr.length} Cards)
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.66rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }}>
                              Standard
                            </span>
                          )}
                        </div>
                        {tpl.meta_template_id && (
                          <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>ID: {tpl.meta_template_id}</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px', verticalAlign: 'middle' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: catObj.bg,
                            color: catObj.color,
                            border: `1px solid ${catObj.border}`,
                          }}
                        >
                          {tpl.category}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', verticalAlign: 'middle', fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>
                        {tpl.language || 'en_US'}
                      </td>
                      <td style={{ padding: '14px 18px', verticalAlign: 'middle', maxWidth: 300 }}>
                        {tpl.header_type && tpl.header_type !== 'NONE' && (
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#f1f5f9', color: '#475569', marginRight: 6 }}>
                            [{tpl.header_type}]
                          </span>
                        )}
                        <span style={{ fontSize: '0.8rem', color: '#334155', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {tpl.body_text}
                        </span>
                      </td>
                      <td style={{ padding: '14px 18px', verticalAlign: 'middle' }}>
                        {isCarousel ? (
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#db2777' }}>
                            {cardsArr.length} Swipeable Cards
                          </span>
                        ) : buttonsArr.length === 0 ? (
                          <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>None</span>
                        ) : (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {buttonsArr.map((b, i) => (
                              <span key={i} style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                                {b.text || b.type}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '14px 18px', verticalAlign: 'middle', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            onClick={() => setPreviewTemplate(tpl)}
                            title="Preview Template"
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              border: '1px solid #e2e8f0',
                              background: '#ffffff',
                              color: '#2563eb',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(tpl.template_name);
                              if (showToast) showToast('Template name copied!');
                            }}
                            title="Copy Template Name"
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              border: '1px solid #e2e8f0',
                              background: '#ffffff',
                              color: '#64748b',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <Copy size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(tpl)}
                            title="Delete Template"
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              border: '1px solid #fecaca',
                              background: '#fff5f5',
                              color: '#ef4444',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          1. CREATE STANDARD / MIXED TEMPLATE MODAL
          ═════════════════════════════════════════════════════════════════════ */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 1500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            style={{
              width: 1080,
              maxWidth: '96vw',
              maxHeight: '92vh',
              background: '#ffffff',
              borderRadius: 18,
              boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 24px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#fafafa',
              }}
            >
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={18} color="#25d366" /> New Standard / Mixed Template
                </h3>
                <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                  Target Account: <strong>{selectedAccount?.name || 'Default WhatsApp'}</strong>
                </span>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body: 2 Columns */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Left Column: Form Controls */}
              <form
                onSubmit={handleCreateSubmit}
                style={{
                  flex: 1,
                  padding: '20px 24px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 18,
                  borderRight: '1px solid #e2e8f0',
                }}
              >
                {/* 1. Category Selection */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
                    1. Template Category *
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {CATEGORIES.map((cat) => {
                      const isSel = form.category === cat.id;
                      return (
                        <div
                          key={cat.id}
                          onClick={() => {
                            const newCat = cat.id;
                            setForm({ ...form, category: newCat });
                            if (newCat === 'AUTHENTICATION') {
                              setButtons((prev) => prev.filter((b) => b.type === 'COPY_CODE'));
                            } else if (form.category === 'AUTHENTICATION') {
                              setButtons((prev) => prev.filter((b) => b.type !== 'COPY_CODE'));
                            }
                          }}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 10,
                            border: `2px solid ${isSel ? cat.color : '#e2e8f0'}`,
                            background: isSel ? cat.bg : '#ffffff',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                          }}
                        >
                          <div style={{ fontWeight: 800, fontSize: '0.84rem', color: isSel ? cat.color : '#0f172a', marginBottom: 2 }}>
                            {cat.label}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b', lineHeight: 1.3 }}>
                            {cat.desc}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Template Name & Language */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 4 }}>
                      Template Reference Name *
                    </label>
                    <input
                      required
                      type="text"
                      className="form-input w-full"
                      placeholder="e.g. order_delivery_update"
                      value={form.templateName}
                      onChange={(e) => setForm({ ...form, templateName: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                    />
                    <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Only lowercase letters, numbers, and underscores.</span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 4 }}>
                      Language *
                    </label>
                    <select
                      className="form-input w-full"
                      value={form.language}
                      onChange={(e) => setForm({ ...form, language: e.target.value })}
                    >
                      {WA_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>{l.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 3. Header Section (Zero Friction Media) */}
                <div style={{ padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a' }}>
                      2. Header (Optional)
                    </label>
                    <select
                      value={form.headerType}
                      onChange={(e) => setForm({ ...form, headerType: e.target.value })}
                      style={{ fontSize: '0.76rem', fontWeight: 700, padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                    >
                      <option value="NONE">None</option>
                      <option value="TEXT">Text Headline</option>
                      <option value="IMAGE">Image Header</option>
                      <option value="VIDEO">Video Header</option>
                      <option value="DOCUMENT">Document (PDF)</option>
                      <option value="LOCATION">Location</option>
                    </select>
                  </div>

                  {form.headerType === 'TEXT' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input
                        type="text"
                        maxLength={60}
                        className="form-input w-full"
                        placeholder="e.g. Special Announcement"
                        value={form.headerText}
                        onChange={(e) => setForm({ ...form, headerText: e.target.value })}
                      />
                    </div>
                  )}

                  {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(form.headerType) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <input
                        type="url"
                        placeholder={`Optional sample ${form.headerType.toLowerCase()} URL (auto-sample will be used if blank)`}
                        value={form.headerMediaUrl}
                        onChange={(e) => setForm({ ...form, headerMediaUrl: e.target.value })}
                        style={{ fontSize: '0.78rem', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', width: '100%' }}
                      />
                      <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
                        📸 Actual media asset is uploaded/attached when sending the template in Campaigns or Live Chat.
                      </span>
                    </div>
                  )}
                </div>

                {/* 4. Body Section (Required) */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a' }}>
                      3. Body Message *
                    </label>

                    {/* Text Formatting Toolbar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button type="button" onClick={() => applyFormat('*')} title="Bold" style={{ padding: '3px 7px', borderRadius: 4, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}><Bold size={11} /></button>
                      <button type="button" onClick={() => applyFormat('_')} title="Italic" style={{ padding: '3px 7px', borderRadius: 4, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}><Italic size={11} /></button>
                      <button type="button" onClick={() => applyFormat('~')} title="Strikethrough" style={{ padding: '3px 7px', borderRadius: 4, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}><Strikethrough size={11} /></button>
                      <button type="button" onClick={() => applyFormat('```')} title="Code" style={{ padding: '3px 7px', borderRadius: 4, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}><Code size={11} /></button>
                    </div>
                  </div>

                  {/* ── Quick Insert Subscriber Variables Bar ── */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexWrap: 'wrap',
                    padding: '8px 10px',
                    background: 'linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%)',
                    borderRadius: '8px 8px 0 0',
                    border: '1px solid #cbd5e1',
                    borderBottom: 'none',
                  }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Sparkles size={12} color="#16a34a" /> Insert Subscriber Tag:
                    </span>

                    <button
                      type="button"
                      onClick={() => insertSubscriberField('name', 'John Doe')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '3px 10px',
                        borderRadius: 6,
                        background: '#25d366',
                        color: '#ffffff',
                        border: '1px solid #16a34a',
                        fontSize: '0.73rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      <User size={12} /> + Full Name (&#123;&#123;{variables.length + 1}&#125;&#125;)
                    </button>

                    <button
                      type="button"
                      onClick={() => insertSubscriberField('phone', '+1234567890')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: '#ffffff',
                        color: '#6366f1',
                        border: '1px solid #c7d2fe',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      <Phone size={11} /> + Phone
                    </button>
                  </div>

                  <textarea
                    ref={bodyTextareaRef}
                    required
                    rows={5}
                    maxLength={1024}
                    className="form-input w-full"
                    placeholder="Hi {{1}}, thank you for reaching out! We are preparing your order..."
                    value={form.bodyText}
                    onChange={(e) => handleBodyChange(e.target.value)}
                    style={{
                      fontSize: '0.84rem',
                      lineHeight: 1.5,
                      borderRadius: '0 0 8px 8px',
                      marginTop: 0,
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94a3b8', marginTop: 3 }}>
                    <span>💡 Click <strong>+ Full Name</strong> to greet subscribers automatically.</span>
                    <span>{form.bodyText.length}/1024 chars</span>
                  </div>
                </div>

                {/* 5. Footer Section */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 4 }}>
                    4. Footer (Optional)
                  </label>
                  <input
                    type="text"
                    maxLength={60}
                    className="form-input w-full"
                    placeholder="e.g. Reply STOP to unsubscribe"
                    value={form.footerText}
                    onChange={(e) => setForm({ ...form, footerText: e.target.value })}
                  />
                </div>

                {/* 6. Interactive Buttons */}
                <div style={{ padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a' }}>
                        5. Interactive Buttons ({buttons.length}/10)
                      </label>
                      {form.category === 'AUTHENTICATION' && (
                        <div style={{ fontSize: '0.7rem', color: '#d97706', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Info size={11} /> Authentication templates only support Copy Code / OTP buttons.
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {form.category !== 'AUTHENTICATION' && (() => {
                        const disabled = !canAddButton('QUICK_REPLY');
                        return (
                          <button
                            type="button"
                            onClick={() => addButton('QUICK_REPLY')}
                            disabled={disabled}
                            style={{
                              padding: '3px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
                              background: disabled ? '#f1f5f9' : '#fff',
                              border: `1px solid ${disabled ? '#e2e8f0' : '#cbd5e1'}`,
                              color: disabled ? '#94a3b8' : '#334155',
                              opacity: disabled ? 0.7 : 1,
                            }}
                          >
                            + Quick Reply {countByType('QUICK_REPLY') > 0 && `(${countByType('QUICK_REPLY')}/10)`}
                          </button>
                        );
                      })()}

                      {form.category !== 'AUTHENTICATION' && (() => {
                        const disabled = !canAddButton('URL');
                        return (
                          <button
                            type="button"
                            onClick={() => addButton('URL')}
                            disabled={disabled}
                            style={{
                              padding: '3px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
                              background: disabled ? '#f1f5f9' : '#fff',
                              border: `1px solid ${disabled ? '#e2e8f0' : '#cbd5e1'}`,
                              color: disabled ? '#94a3b8' : '#334155',
                              opacity: disabled ? 0.7 : 1,
                            }}
                          >
                            + Website URL {countByType('URL')}/2
                          </button>
                        );
                      })()}

                      {form.category !== 'AUTHENTICATION' && (() => {
                        const disabled = !canAddButton('PHONE_NUMBER');
                        return (
                          <button
                            type="button"
                            onClick={() => addButton('PHONE_NUMBER')}
                            disabled={disabled}
                            style={{
                              padding: '3px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
                              background: disabled ? '#f1f5f9' : '#fff',
                              border: `1px solid ${disabled ? '#e2e8f0' : '#cbd5e1'}`,
                              color: disabled ? '#94a3b8' : '#334155',
                              opacity: disabled ? 0.7 : 1,
                            }}
                          >
                            + Phone Call {countByType('PHONE_NUMBER') > 0 ? '✓' : '(max 1)'}
                          </button>
                        );
                      })()}

                      {form.category === 'AUTHENTICATION' && (() => {
                        const disabled = !canAddButton('COPY_CODE');
                        return (
                          <button
                            type="button"
                            onClick={() => addButton('COPY_CODE')}
                            disabled={disabled}
                            style={{
                              padding: '3px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
                              background: disabled ? '#fef3c7' : '#fffbeb',
                              border: `1px solid ${disabled ? '#fde68a' : '#fcd34d'}`,
                              color: disabled ? '#b45309' : '#d97706',
                              opacity: disabled ? 0.7 : 1,
                            }}
                          >
                            🔐 + Copy Code / OTP {countByType('COPY_CODE') > 0 ? '✓' : '(max 1)'}
                          </button>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Limits Reference */}
                  {form.category !== 'AUTHENTICATION' && (
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10, padding: '6px 10px', background: '#f0f9ff', borderRadius: 7, border: '1px solid #bae6fd' }}>
                      <span style={{ fontSize: '0.68rem', color: '#0369a1', fontWeight: 600 }}>Quick Reply: up to 10</span>
                      <span style={{ fontSize: '0.68rem', color: '#0369a1', fontWeight: 600 }}>· URL: max 2</span>
                      <span style={{ fontSize: '0.68rem', color: '#0369a1', fontWeight: 600 }}>· Phone: max 1</span>
                      <span style={{ fontSize: '0.68rem', color: '#0369a1', fontWeight: 600 }}>· Total: max 10</span>
                    </div>
                  )}

                  {buttons.length >= 4 && (
                    <div style={{ marginBottom: 10, padding: '7px 10px', background: '#fffbeb', borderRadius: 7, border: '1px solid #fde68a', display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                      <AlertCircle size={14} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: '0.7rem', color: '#92400e', lineHeight: 1.4 }}>
                        <strong>Desktop Note:</strong> On WhatsApp Desktop, templates with 4+ buttons collapse additional buttons under <em>"See all options"</em>.
                      </span>
                    </div>
                  )}

                  {buttons.length === 0 ? (
                    <div style={{ fontSize: '0.74rem', color: '#94a3b8', textAlign: 'center', padding: '10px 0' }}>
                      No buttons added yet. Click one of the buttons above to add quick actions.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {buttons.map((b) => {
                        const isQR = b.type === 'QUICK_REPLY';
                        const isURL = b.type === 'URL';
                        const isPhone = b.type === 'PHONE_NUMBER';
                        const isCode = b.type === 'COPY_CODE';

                        const badgeStyle = isQR
                          ? { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }
                          : isURL
                          ? { background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }
                          : isPhone
                          ? { background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' }
                          : { background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' };

                        return (
                          <div key={b.id} style={{ background: '#fff', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 7px', borderRadius: 4, flexShrink: 0, ...badgeStyle }}>
                                {isQR ? '↩ Quick Reply' : isURL ? '🌐 URL' : isPhone ? '📞 Phone' : '🔐 Copy Code'}
                              </span>

                              <input
                                type="text"
                                required
                                maxLength={isQR ? 20 : 25}
                                placeholder={isQR ? 'Button label (max 20 chars)' : 'Button label (max 25 chars)'}
                                value={b.text}
                                onChange={(e) => updateButton(b.id, 'text', e.target.value)}
                                style={{ flex: 1, fontSize: '0.76rem', padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                              />
                              <span style={{ fontSize: '0.64rem', color: b.text.length >= (isQR ? 20 : 25) ? '#ef4444' : '#94a3b8', flexShrink: 0 }}>
                                {b.text.length}/{isQR ? 20 : 25}
                              </span>

                              <button
                                type="button"
                                onClick={() => removeButton(b.id)}
                                style={{ width: 24, height: 24, borderRadius: '50%', border: 'none', background: '#fee2e2', color: '#ef4444', cursor: 'pointer', flexShrink: 0 }}
                              >
                                ✕
                              </button>
                            </div>

                            {/* Type Specific Fields */}
                            {isPhone && (
                              <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #e2e8f0' }}>
                                <input
                                  type="text"
                                  required
                                  placeholder="Phone number e.g. +1234567890"
                                  value={b.phoneNumber}
                                  onChange={(e) => updateButton(b.id, 'phoneNumber', e.target.value)}
                                  style={{ width: '100%', fontSize: '0.76rem', padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                                />
                              </div>
                            )}

                            {isURL && (
                              <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #e2e8f0', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#334155' }}>URL Type:</span>
                                  {['static', 'dynamic'].map((t) => (
                                    <button
                                      key={t}
                                      type="button"
                                      onClick={() => updateButton(b.id, 'urlType', t)}
                                      style={{
                                        padding: '2px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                                        background: b.urlType === t ? '#2563eb' : '#f1f5f9',
                                        color: b.urlType === t ? '#fff' : '#475569',
                                        border: `1px solid ${b.urlType === t ? '#2563eb' : '#e2e8f0'}`,
                                      }}
                                    >
                                      {t === 'static' ? '🔗 Static' : '⚡ Dynamic'}
                                    </button>
                                  ))}
                                </div>

                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                  <input
                                    type="url"
                                    required
                                    placeholder={b.urlType === 'dynamic' ? 'https://example.com/order/' : 'https://example.com/page'}
                                    value={b.url}
                                    onChange={(e) => updateButton(b.id, 'url', e.target.value)}
                                    style={{ flex: 1, fontSize: '0.76rem', padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                                  />
                                  {b.urlType === 'dynamic' && (
                                    <span style={{ padding: '4px 8px', background: '#ede9fe', color: '#7c3aed', borderRadius: 6, fontSize: '0.72rem', fontWeight: 800, fontFamily: 'monospace', flexShrink: 0 }}>
                                      {'{{1}}'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}

                            {isCode && (
                              <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed #e2e8f0' }}>
                                <input
                                  type="text"
                                  required
                                  placeholder="Coupon / OTP Code e.g. DISCOUNT20"
                                  value={b.couponCode}
                                  onChange={(e) => updateButton(b.id, 'couponCode', e.target.value)}
                                  style={{ width: '100%', fontSize: '0.76rem', padding: '4px 8px', borderRadius: 6, border: '1px solid #fcd34d' }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Submit Controls */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.submitToMeta}
                      onChange={(e) => setForm({ ...form, submitToMeta: e.target.checked })}
                    />
                    Submit to Meta for Official Approval
                  </label>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      disabled={saving}
                      style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      style={{
                        padding: '8px 22px',
                        borderRadius: 8,
                        background: saving ? '#86efac' : '#25d366',
                        color: '#fff',
                        border: 'none',
                        fontSize: '0.84rem',
                        fontWeight: 800,
                        cursor: saving ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        minWidth: 180,
                        justifyContent: 'center',
                      }}
                    >
                      {saving && (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}>
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
                        </svg>
                      )}
                      {saving ? 'Submitting...' : form.submitToMeta ? 'Submit Template to Meta' : 'Save Template'}
                    </button>
                  </div>
                </div>
              </form>

              {/* Right Column: Live iPhone 17 Pro Mockup */}
              <div
                style={{
                  width: 410,
                  background: 'linear-gradient(160deg, #e2e8f0 0%, #cbd5e1 100%)',
                  padding: '24px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflowY: 'auto',
                  gap: 12,
                }}
              >
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Eye size={14} color="#0284c7" /> Live iPhone 17 Preview
                </div>

                {/* iPhone 17 Body with Metallic Side Buttons */}
                <div style={{ position: 'relative', width: 310, filter: 'drop-shadow(0 25px 35px rgba(15,23,42,0.35))' }}>
                  {/* Left Side Buttons: Action Button + Volume Up/Down */}
                  <div style={{ position: 'absolute', left: -4, top: 90, width: 4, height: 26, background: '#64748b', borderRadius: '3px 0 0 3px' }} />
                  <div style={{ position: 'absolute', left: -4, top: 130, width: 4, height: 42, background: '#64748b', borderRadius: '3px 0 0 3px' }} />
                  <div style={{ position: 'absolute', left: -4, top: 182, width: 4, height: 42, background: '#64748b', borderRadius: '3px 0 0 3px' }} />
                  {/* Right Side Button: Power Button */}
                  <div style={{ position: 'absolute', right: -4, top: 140, width: 4, height: 56, background: '#64748b', borderRadius: '0 3px 3px 0' }} />

                  {/* Titanium Phone Chassis */}
                  <div style={{
                    width: '100%',
                    background: 'linear-gradient(145deg, #383b44 0%, #1e2026 50%, #121317 100%)',
                    borderRadius: 48,
                    padding: 5,
                    border: '1px solid rgba(255,255,255,0.18)',
                    boxShadow: 'inset 0 0 4px rgba(255,255,255,0.25), 0 0 0 1px #0f1115',
                  }}>
                    {/* Inner Screen Bezel */}
                    <div style={{ width: '100%', background: '#000000', borderRadius: 43, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

                      {/* ── Dynamic Island & Status Bar ── */}
                      <div style={{
                        background: '#075e54',
                        padding: '12px 18px 4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        position: 'relative',
                        color: '#ffffff',
                      }}>
                        {/* Time */}
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '-0.02em' }}>9:41</span>

                        {/* Dynamic Island Capsule */}
                        <div style={{
                          position: 'absolute',
                          top: 8,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: 86,
                          height: 22,
                          background: '#000000',
                          borderRadius: 20,
                          zIndex: 20,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          paddingRight: 7,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.5)',
                        }}>
                          {/* Camera Lens */}
                          <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#111827', border: '1.5px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#1e3a8a' }} />
                          </div>
                        </div>

                        {/* Status Icons: Signal, 5G, Battery */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
                            <div style={{ width: 2.5, height: 3.5, background: '#fff', borderRadius: 0.5 }} />
                            <div style={{ width: 2.5, height: 5.5, background: '#fff', borderRadius: 0.5 }} />
                            <div style={{ width: 2.5, height: 7.5, background: '#fff', borderRadius: 0.5 }} />
                            <div style={{ width: 2.5, height: 9.5, background: '#fff', borderRadius: 0.5 }} />
                          </div>
                          <span style={{ fontSize: '0.58rem', fontWeight: 800, marginLeft: 2 }}>5G</span>
                          <div style={{ width: 18, height: 9, border: '1px solid rgba(255,255,255,0.8)', borderRadius: 2.5, padding: 1, display: 'flex', alignItems: 'center' }}>
                            <div style={{ width: '85%', height: '100%', background: '#fff', borderRadius: 1.5 }} />
                          </div>
                        </div>
                      </div>

                      {/* ── WhatsApp App Bar ── */}
                      <div style={{
                        background: '#075e54',
                        padding: '6px 14px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        color: '#ffffff',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg,#25d366,#128c7e)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 900,
                            fontSize: '0.68rem',
                            color: '#ffffff',
                            flexShrink: 0,
                            boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                          }}>
                            WA
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {selectedAccount?.name || 'Business Name'}
                            </div>
                            <div style={{ fontSize: '0.54rem', color: '#86efac', marginTop: -1 }}>online</div>
                          </div>
                        </div>

                        {/* Call icons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: 0.9 }}>
                          <Video size={13} color="#ffffff" />
                          <Phone size={12} color="#ffffff" />
                        </div>
                      </div>

                      {/* ── TALL WhatsApp Chat Canvas ── */}
                      <div style={{
                        background: '#efeae2',
                        backgroundImage: `radial-gradient(#d5cdc4 1px, transparent 1px)`,
                        backgroundSize: '12px 12px',
                        padding: '14px 10px 10px',
                        minHeight: 480,
                        maxHeight: 520,
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                      }}>
                        {/* Date Pill */}
                        <div style={{
                          alignSelf: 'center',
                          background: 'rgba(255,255,255,0.9)',
                          padding: '3px 10px',
                          borderRadius: 8,
                          fontSize: '0.52rem',
                          fontWeight: 700,
                          color: '#64748b',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                          marginBottom: 4,
                          textTransform: 'uppercase',
                        }}>
                          Today
                        </div>

                        {/* Message Bubble Container */}
                        <div style={{ alignSelf: 'flex-start', maxWidth: '92%' }}>
                          <div style={{
                            background: '#ffffff',
                            borderRadius: '0 12px 12px 12px',
                            padding: '10px 11px 7px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                            position: 'relative',
                          }}>
                            {/* Speech Bubble Tail */}
                            <div style={{
                              position: 'absolute',
                              top: 0,
                              left: -6,
                              width: 0,
                              height: 0,
                              borderStyle: 'solid',
                              borderWidth: '0 8px 8px 0',
                              borderColor: 'transparent #ffffff transparent transparent',
                            }} />

                            {/* Header Rendering */}
                            {form.headerType === 'TEXT' && form.headerText && (
                              <div style={{ fontWeight: 800, fontSize: '0.78rem', color: '#0f172a', marginBottom: 6 }}>
                                {form.headerText}
                              </div>
                            )}

                            {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(form.headerType) && (
                              <div style={{
                                width: '100%',
                                height: 120,
                                background: form.headerMediaUrl
                                  ? `url("${form.headerMediaUrl}") center/cover no-repeat`
                                  : 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)',
                                borderRadius: 8,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: 8,
                                flexDirection: 'column',
                                gap: 4,
                                border: '1px solid #e2e8f0',
                                overflow: 'hidden',
                              }}>
                                {!form.headerMediaUrl && (
                                  <>
                                    {form.headerType === 'IMAGE' && <ImageIcon size={26} color="#64748b" />}
                                    {form.headerType === 'VIDEO' && <Video size={26} color="#64748b" />}
                                    {form.headerType === 'DOCUMENT' && <File size={26} color="#64748b" />}
                                    <span style={{ fontSize: '0.62rem', color: '#475569', fontWeight: 800 }}>Sample {form.headerType}</span>
                                  </>
                                )}
                              </div>
                            )}

                            {/* Body Message */}
                            <div style={{ fontSize: '0.72rem', color: '#111827', whiteSpace: 'pre-wrap', lineHeight: 1.45, wordBreak: 'break-word' }}>
                              {previewBodyText}
                            </div>

                            {/* Footer text */}
                            {form.footerText && (
                              <div style={{ fontSize: '0.58rem', color: '#94a3b8', marginTop: 6, fontWeight: 500 }}>
                                {form.footerText}
                              </div>
                            )}

                            {/* Timestamp & Double Blue Checkmarks */}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: 3,
                              marginTop: 4,
                              fontSize: '0.5rem',
                              color: '#94a3b8',
                              fontWeight: 600,
                            }}>
                              <span>10:42 AM</span>
                              <svg width="13" height="8" viewBox="0 0 14 8" fill="none">
                                <path d="M1 4l3 3 5-6" stroke="#38bdf8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M5 4l3 3 5-6" stroke="#38bdf8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          {buttons.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                              {buttons.slice(0, 3).map((b, i) => (
                                <div
                                  key={i}
                                  style={{
                                    background: '#ffffff',
                                    color: '#00a884',
                                    fontWeight: 800,
                                    fontSize: '0.68rem',
                                    padding: '7px 10px',
                                    borderRadius: 8,
                                    textAlign: 'center',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 5,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {b.type === 'PHONE_NUMBER' && <Phone size={11} />}
                                  {b.type === 'URL' && <ExternalLink size={11} />}
                                  {b.type === 'COPY_CODE' && <Copy size={11} />}
                                  <span>{b.text || 'Action Button'}</span>
                                  {b.type === 'URL' && b.urlType === 'dynamic' && (
                                    <span style={{ fontSize: '0.55rem', color: '#6366f1', marginLeft: 2 }}>⚡</span>
                                  )}
                                </div>
                              ))}
                              {buttons.length > 3 && (
                                <div style={{
                                  background: '#ffffff',
                                  color: '#64748b',
                                  fontWeight: 800,
                                  fontSize: '0.64rem',
                                  padding: '6px 10px',
                                  borderRadius: 8,
                                  textAlign: 'center',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                                  borderTop: '1px solid #e2e8f0',
                                }}>
                                  See all options ({buttons.length - 3} more)
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ── WhatsApp Bottom Input Bar ── */}
                      <div style={{
                        background: '#f0f2f5',
                        padding: '6px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}>
                        <div style={{
                          flex: 1,
                          background: '#ffffff',
                          borderRadius: 20,
                          padding: '5px 12px',
                          fontSize: '0.62rem',
                          color: '#94a3b8',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                        }}>
                          Message
                        </div>
                        <div style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: '#25d366',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                          flexShrink: 0,
                        }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                          </svg>
                        </div>
                      </div>

                      {/* ── iPhone 17 Home Indicator ── */}
                      <div style={{ background: '#000000', paddingBottom: 10, paddingTop: 4, display: 'flex', justifyContent: 'center' }}>
                        <div style={{ width: 90, height: 4, background: '#4b5563', borderRadius: 3 }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          2. CREATE CAROUSEL TEMPLATE MODAL 🎴
          ═════════════════════════════════════════════════════════════════════ */}
      {showCarouselModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 1500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            style={{
              width: 1150,
              maxWidth: '96vw',
              maxHeight: '92vh',
              background: '#ffffff',
              borderRadius: 18,
              boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 24px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: '#fdf2f8',
              }}
            >
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#831843', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <LayoutGrid size={18} color="#db2777" /> New WhatsApp Carousel Template (2–10 Cards)
                </h3>
                <span style={{ fontSize: '0.74rem', color: '#9d174d' }}>
                  Interactive multi-product/promotion marketing card deck for WhatsApp Business
                </span>
              </div>
              <button
                onClick={() => setShowCarouselModal(false)}
                style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid #fbcfe8', background: '#fff', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Left Column: Form */}
              <form
                onSubmit={handleCarouselSubmit}
                style={{
                  flex: 1,
                  padding: '20px 24px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                  borderRight: '1px solid #e2e8f0',
                }}
              >
                {/* 1. Name & Language */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 4 }}>
                      Template Reference Name *
                    </label>
                    <input
                      required
                      type="text"
                      className="form-input w-full"
                      placeholder="e.g. spring_product_carousel"
                      value={carouselForm.templateName}
                      onChange={(e) => setCarouselForm({ ...carouselForm, templateName: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 4 }}>
                      Language *
                    </label>
                    <select
                      className="form-input w-full"
                      value={carouselForm.language}
                      onChange={(e) => setCarouselForm({ ...carouselForm, language: e.target.value })}
                    >
                      {WA_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>{l.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, marginBottom: 4 }}>
                      Category
                    </label>
                    <div style={{ padding: '7px 12px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe', color: '#2563eb', fontSize: '0.78rem', fontWeight: 800 }}>
                      Marketing (Required by Meta)
                    </div>
                  </div>
                </div>

                {/* 2. Top Message Body */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>
                    Top Intro Message Body *
                  </label>
                  <textarea
                    required
                    rows={2}
                    maxLength={1024}
                    className="form-input w-full"
                    placeholder="Check out our top offers this week! Swipe through the cards below:"
                    value={carouselForm.bodyText}
                    onChange={(e) => setCarouselForm({ ...carouselForm, bodyText: e.target.value })}
                    style={{ fontSize: '0.82rem' }}
                  />
                  <span style={{ fontSize: '0.68rem', color: '#94a3b8' }}>This text appears at the top of the WhatsApp message above the carousel cards.</span>
                </div>

                {/* 3. Carousel Cards Builder */}
                <div style={{ padding: 14, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <label style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <LayoutGrid size={15} color="#db2777" /> Carousel Cards ({carouselCards.length}/10)
                    </label>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={applyButtonsToAllCards}
                        title="Copy active card button format to all cards"
                        style={{ padding: '4px 10px', borderRadius: 6, background: '#fff', border: '1px solid #cbd5e1', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', color: '#475569' }}
                      >
                        ⚡ Sync Buttons to All Cards
                      </button>
                      <button
                        type="button"
                        onClick={addCarouselCard}
                        disabled={carouselCards.length >= 10}
                        style={{ padding: '4px 12px', borderRadius: 6, background: '#db2777', border: 'none', color: '#fff', fontSize: '0.74rem', fontWeight: 700, cursor: carouselCards.length >= 10 ? 'not-allowed' : 'pointer' }}
                      >
                        + Add Card
                      </button>
                    </div>
                  </div>

                  {/* Card Navigation Tabs */}
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 12 }}>
                    {carouselCards.map((card, idx) => {
                      const isAct = idx === activeCardIdx;
                      return (
                        <button
                          key={card.id || idx}
                          type="button"
                          onClick={() => {
                            setActiveCardIdx(idx);
                            setPreviewCardIdx(idx);
                          }}
                          style={{
                            padding: '6px 14px',
                            borderRadius: 8,
                            fontSize: '0.76rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            background: isAct ? '#db2777' : '#ffffff',
                            color: isAct ? '#ffffff' : '#475569',
                            border: `1px solid ${isAct ? '#db2777' : '#cbd5e1'}`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            flexShrink: 0,
                          }}
                        >
                          <span>Card {idx + 1}</span>
                          {carouselCards.length > 2 && (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                removeCarouselCard(idx);
                              }}
                              style={{ color: isAct ? '#fbcfe8' : '#ef4444', fontSize: '0.75rem', fontWeight: 900, marginLeft: 2 }}
                            >
                              ✕
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Card Editor */}
                  {carouselCards[activeCardIdx] && (() => {
                    const card = carouselCards[activeCardIdx];
                    return (
                      <div style={{ background: '#ffffff', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>
                            Editing Card {activeCardIdx + 1} of {carouselCards.length}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            Card Media + Max 160 chars text + Max 2 buttons
                          </span>
                        </div>

                        {/* Card Header Media */}
                        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
                          <select
                            value={card.headerType || 'IMAGE'}
                            onChange={(e) => updateCard('headerType', e.target.value)}
                            style={{ fontSize: '0.76rem', padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontWeight: 700 }}
                          >
                            <option value="IMAGE">📷 Image</option>
                            <option value="VIDEO">🎥 Video</option>
                          </select>
                          <input
                            type="url"
                            placeholder="Optional sample media URL (auto-sample used if blank)"
                            value={card.mediaUrl || ''}
                            onChange={(e) => updateCard('mediaUrl', e.target.value)}
                            style={{ fontSize: '0.76rem', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                          />
                        </div>

                        {/* Card Body */}
                        <div>
                          <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 4 }}>
                            Card Body Text (Max 160 Chars) *
                          </label>
                          <input
                            type="text"
                            required
                            maxLength={160}
                            className="form-input w-full"
                            placeholder="e.g. Special offer on summer sneakers with instant delivery!"
                            value={card.bodyText || ''}
                            onChange={(e) => updateCard('bodyText', e.target.value)}
                            style={{ fontSize: '0.78rem' }}
                          />
                          <div style={{ textAlign: 'right', fontSize: '0.66rem', color: (card.bodyText || '').length >= 160 ? '#ef4444' : '#94a3b8', marginTop: 2 }}>
                            {(card.bodyText || '').length}/160 chars
                          </div>
                        </div>

                        {/* Card Buttons */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <label style={{ fontSize: '0.76rem', fontWeight: 700, color: '#334155' }}>
                              Card Buttons ({(card.buttons || []).length}/2)
                            </label>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => addCardButton('URL')}
                                disabled={(card.buttons || []).length >= 2}
                                style={{ padding: '2px 8px', borderRadius: 6, background: '#fff', border: '1px solid #cbd5e1', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                              >
                                + Website URL
                              </button>
                              <button
                                type="button"
                                onClick={() => addCardButton('QUICK_REPLY')}
                                disabled={(card.buttons || []).length >= 2}
                                style={{ padding: '2px 8px', borderRadius: 6, background: '#fff', border: '1px solid #cbd5e1', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                              >
                                + Quick Reply
                              </button>
                            </div>
                          </div>

                          {(card.buttons || []).map((btn) => (
                            <div key={btn.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                              <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: '#fdf2f8', color: '#db2777', flexShrink: 0 }}>
                                {btn.type}
                              </span>
                              <input
                                type="text"
                                maxLength={25}
                                placeholder="Button label"
                                value={btn.text}
                                onChange={(e) => updateCardButton(btn.id, 'text', e.target.value)}
                                style={{ width: 140, fontSize: '0.74rem', padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                              />
                              {btn.type === 'URL' && (
                                <input
                                  type="url"
                                  placeholder="https://example.com/item"
                                  value={btn.url}
                                  onChange={(e) => updateCardButton(btn.id, 'url', e.target.value)}
                                  style={{ flex: 1, fontSize: '0.74rem', padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => removeCardButton(btn.id)}
                                style={{ width: 22, height: 22, borderRadius: '50%', border: 'none', background: '#fee2e2', color: '#ef4444', cursor: 'pointer' }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Submit Controls */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', fontWeight: 700, color: '#0f172a', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={carouselForm.submitToMeta}
                      onChange={(e) => setCarouselForm({ ...carouselForm, submitToMeta: e.target.checked })}
                    />
                    Submit Carousel to Meta for Approval
                  </label>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setShowCarouselModal(false)}
                      disabled={saving}
                      style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      style={{
                        padding: '8px 22px',
                        borderRadius: 8,
                        background: saving ? '#f472b6' : '#db2777',
                        color: '#fff',
                        border: 'none',
                        fontSize: '0.84rem',
                        fontWeight: 800,
                        cursor: saving ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        minWidth: 190,
                        justifyContent: 'center',
                      }}
                    >
                      {saving ? 'Submitting Carousel...' : carouselForm.submitToMeta ? 'Submit Carousel to Meta' : 'Save Carousel'}
                    </button>
                  </div>
                </div>
              </form>

              {/* Right Column: Live iPhone 17 Carousel Preview */}
              <div
                style={{
                  width: 410,
                  background: 'linear-gradient(160deg, #fce7f3 0%, #ede9fe 100%)',
                  padding: '24px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflowY: 'auto',
                  gap: 12,
                }}
              >
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#831843', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <LayoutGrid size={14} color="#db2777" /> Live iPhone 17 Carousel Preview
                </div>

                {/* iPhone 17 Body with Metallic Side Buttons */}
                <div style={{ position: 'relative', width: 310, filter: 'drop-shadow(0 25px 35px rgba(131,24,67,0.3))' }}>
                  {/* Left Side Buttons */}
                  <div style={{ position: 'absolute', left: -4, top: 90, width: 4, height: 26, background: '#64748b', borderRadius: '3px 0 0 3px' }} />
                  <div style={{ position: 'absolute', left: -4, top: 130, width: 4, height: 42, background: '#64748b', borderRadius: '3px 0 0 3px' }} />
                  <div style={{ position: 'absolute', left: -4, top: 182, width: 4, height: 42, background: '#64748b', borderRadius: '3px 0 0 3px' }} />
                  {/* Right Side Button */}
                  <div style={{ position: 'absolute', right: -4, top: 140, width: 4, height: 56, background: '#64748b', borderRadius: '0 3px 3px 0' }} />

                  {/* Titanium Phone Chassis */}
                  <div style={{
                    width: '100%',
                    background: 'linear-gradient(145deg, #383b44 0%, #1e2026 50%, #121317 100%)',
                    borderRadius: 48,
                    padding: 5,
                    border: '1px solid rgba(255,255,255,0.18)',
                    boxShadow: 'inset 0 0 4px rgba(255,255,255,0.25), 0 0 0 1px #0f1115',
                  }}>
                    {/* Inner Screen Bezel */}
                    <div style={{ width: '100%', background: '#000000', borderRadius: 43, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

                      {/* ── Dynamic Island & Status Bar ── */}
                      <div style={{
                        background: '#075e54',
                        padding: '12px 18px 4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        position: 'relative',
                        color: '#ffffff',
                      }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '-0.02em' }}>9:41</span>

                        {/* Dynamic Island Capsule */}
                        <div style={{
                          position: 'absolute',
                          top: 8,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: 86,
                          height: 22,
                          background: '#000000',
                          borderRadius: 20,
                          zIndex: 20,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          paddingRight: 7,
                        }}>
                          <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#111827', border: '1.5px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ width: 3, height: 3, borderRadius: '50%', background: '#1e3a8a' }} />
                          </div>
                        </div>

                        {/* Status Icons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
                            <div style={{ width: 2.5, height: 3.5, background: '#fff', borderRadius: 0.5 }} />
                            <div style={{ width: 2.5, height: 5.5, background: '#fff', borderRadius: 0.5 }} />
                            <div style={{ width: 2.5, height: 7.5, background: '#fff', borderRadius: 0.5 }} />
                            <div style={{ width: 2.5, height: 9.5, background: '#fff', borderRadius: 0.5 }} />
                          </div>
                          <span style={{ fontSize: '0.58rem', fontWeight: 800, marginLeft: 2 }}>5G</span>
                          <div style={{ width: 18, height: 9, border: '1px solid rgba(255,255,255,0.8)', borderRadius: 2.5, padding: 1, display: 'flex', alignItems: 'center' }}>
                            <div style={{ width: '85%', height: '100%', background: '#fff', borderRadius: 1.5 }} />
                          </div>
                        </div>
                      </div>

                      {/* ── WhatsApp App Bar ── */}
                      <div style={{
                        background: '#075e54',
                        padding: '6px 14px 10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        color: '#ffffff',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg,#db2777,#be185d)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 900,
                            fontSize: '0.68rem',
                            color: '#ffffff',
                            flexShrink: 0,
                          }}>
                            WA
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {selectedAccount?.name || 'Business'}
                            </div>
                            <div style={{ fontSize: '0.54rem', color: '#fbcfe8', marginTop: -1 }}>online</div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, opacity: 0.9 }}>
                          <Video size={13} color="#ffffff" />
                          <Phone size={12} color="#ffffff" />
                        </div>
                      </div>

                      {/* ── TALL WhatsApp Carousel Chat Canvas ── */}
                      <div style={{
                        background: '#efeae2',
                        backgroundImage: `radial-gradient(#d5cdc4 1px, transparent 1px)`,
                        backgroundSize: '12px 12px',
                        padding: '14px 10px 10px',
                        minHeight: 480,
                        maxHeight: 520,
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}>
                        {/* Date Pill */}
                        <div style={{
                          alignSelf: 'center',
                          background: 'rgba(255,255,255,0.9)',
                          padding: '3px 10px',
                          borderRadius: 8,
                          fontSize: '0.52rem',
                          fontWeight: 700,
                          color: '#64748b',
                          marginBottom: 2,
                          textTransform: 'uppercase',
                        }}>
                          Today
                        </div>

                        {/* Top Intro Message Bubble */}
                        <div style={{
                          background: '#ffffff',
                          borderRadius: '0 12px 12px 12px',
                          padding: '10px 12px',
                          fontSize: '0.72rem',
                          color: '#111827',
                          lineHeight: 1.45,
                          alignSelf: 'flex-start',
                          maxWidth: '92%',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                          position: 'relative',
                        }}>
                          <div style={{
                            position: 'absolute',
                            top: 0,
                            left: -6,
                            width: 0,
                            height: 0,
                            borderStyle: 'solid',
                            borderWidth: '0 8px 8px 0',
                            borderColor: 'transparent #ffffff transparent transparent',
                          }} />
                          {carouselForm.bodyText || 'Top carousel introduction message appears here.'}
                        </div>

                        {/* Active Carousel Card */}
                        {carouselCards[previewCardIdx] && (() => {
                          const curCard = carouselCards[previewCardIdx];
                          return (
                            <div style={{
                              width: 220,
                              background: '#ffffff',
                              borderRadius: 12,
                              overflow: 'hidden',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                              margin: '0 auto',
                              display: 'flex',
                              flexDirection: 'column',
                              border: '1px solid #f1f5f9',
                            }}>
                              {/* Card Media Banner */}
                              <div style={{
                                width: '100%',
                                height: 130,
                                background: curCard.mediaUrl
                                  ? `url("${curCard.mediaUrl}") center/cover no-repeat`
                                  : 'linear-gradient(135deg,#fbcfe8 0%, #f472b6 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexDirection: 'column',
                                gap: 3,
                              }}>
                                {!curCard.mediaUrl && (
                                  <>
                                    <ImageIcon size={28} color="#831843" />
                                    <span style={{ fontSize: '0.62rem', color: '#831843', fontWeight: 800 }}>Card {previewCardIdx + 1} Image</span>
                                  </>
                                )}
                              </div>

                              {/* Card Body Text */}
                              <div style={{ padding: '10px 10px 6px', fontSize: '0.7rem', color: '#1f2937', lineHeight: 1.4, minHeight: 45 }}>
                                {curCard.bodyText || 'Card description text...'}
                              </div>

                              {/* Card Buttons */}
                              {(curCard.buttons || []).map((b, bi) => (
                                <div
                                  key={bi}
                                  style={{
                                    padding: '7px 10px',
                                    borderTop: '1px solid #f1f5f9',
                                    color: '#00a884',
                                    fontWeight: 800,
                                    fontSize: '0.66rem',
                                    textAlign: 'center',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 5,
                                    background: '#ffffff',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {b.type === 'URL' && <ExternalLink size={10} />}
                                  {b.type === 'PHONE_NUMBER' && <Phone size={10} />}
                                  <span>{b.text || 'Action Button'}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}

                        {/* Swipe Navigation Dots & Arrows */}
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 4 }}>
                          <button
                            type="button"
                            onClick={() => setPreviewCardIdx((prev) => (prev > 0 ? prev - 1 : carouselCards.length - 1))}
                            style={{ width: 26, height: 26, borderRadius: '50%', background: '#ffffff', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}
                          >
                            <ChevronLeft size={14} color="#475569" />
                          </button>
                          <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#475569', background: 'rgba(255,255,255,0.85)', padding: '2px 8px', borderRadius: 10 }}>
                            Card {previewCardIdx + 1} of {carouselCards.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPreviewCardIdx((prev) => (prev < carouselCards.length - 1 ? prev + 1 : 0))}
                            style={{ width: 26, height: 26, borderRadius: '50%', background: '#ffffff', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }}
                          >
                            <ChevronRight size={14} color="#475569" />
                          </button>
                        </div>
                      </div>

                      {/* ── WhatsApp Bottom Input Bar ── */}
                      <div style={{
                        background: '#f0f2f5',
                        padding: '6px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}>
                        <div style={{
                          flex: 1,
                          background: '#ffffff',
                          borderRadius: 20,
                          padding: '5px 12px',
                          fontSize: '0.62rem',
                          color: '#94a3b8',
                        }}>
                          Message
                        </div>
                        <div style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: '#25d366',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                          flexShrink: 0,
                        }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                          </svg>
                        </div>
                      </div>

                      {/* ── iPhone 17 Home Indicator ── */}
                      <div style={{ background: '#000000', paddingBottom: 10, paddingTop: 4, display: 'flex', justifyContent: 'center' }}>
                        <div style={{ width: 90, height: 4, background: '#4b5563', borderRadius: 3 }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          3. QUICK PREVIEW MODAL (TALL IPHONE 17 PRO MOCKUP)
          ═════════════════════════════════════════════════════════════════════ */}
      {previewTemplate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 1500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(3px)',
          }}
        >
          <div
            style={{
              width: 440,
              maxWidth: '94vw',
              background: '#ffffff',
              borderRadius: 20,
              padding: '18px 20px',
              boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                  {previewTemplate.template_name}
                </h4>
                <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                  {renderStatusBadge(previewTemplate.status)}
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#f1f5f9' }}>
                    {previewTemplate.category}
                  </span>
                  {previewTemplate.template_type === 'CAROUSEL' && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: '#fdf2f8', color: '#db2777' }}>
                      🎴 Carousel
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setPreviewTemplate(null)}
                style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* iPhone 17 Mockup inside Quick Preview */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ position: 'relative', width: 290, filter: 'drop-shadow(0 20px 30px rgba(15,23,42,0.25))' }}>
                {/* Metallic Frame */}
                <div style={{
                  width: '100%',
                  background: 'linear-gradient(145deg, #383b44 0%, #1e2026 100%)',
                  borderRadius: 44,
                  padding: 4,
                  border: '1px solid rgba(255,255,255,0.18)',
                }}>
                  <div style={{ width: '100%', background: '#000', borderRadius: 40, overflow: 'hidden' }}>
                    {/* Status Bar & Dynamic Island */}
                    <div style={{
                      background: '#075e54',
                      padding: '10px 14px 4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      color: '#ffffff',
                      position: 'relative',
                    }}>
                      <span style={{ fontSize: '0.64rem', fontWeight: 800 }}>9:41</span>
                      <div style={{
                        position: 'absolute',
                        top: 6,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 76,
                        height: 20,
                        background: '#000',
                        borderRadius: 16,
                      }} />
                      <span style={{ fontSize: '0.56rem', fontWeight: 800 }}>5G 100%</span>
                    </div>

                    {/* App Bar */}
                    <div style={{ background: '#075e54', padding: '6px 12px 8px', display: 'flex', alignItems: 'center', gap: 7, color: '#fff' }}>
                      <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#25d366,#128c7e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.58rem' }}>WA</div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#fff' }}>{previewTemplate.template_name}</div>
                    </div>

                    {/* Chat Area */}
                    <div style={{
                      background: '#efeae2',
                      backgroundImage: `radial-gradient(#d5cdc4 1px, transparent 1px)`,
                      backgroundSize: '12px 12px',
                      padding: '10px 8px',
                      minHeight: 380,
                      maxHeight: 420,
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}>
                      <div style={{ alignSelf: 'flex-start', maxWidth: '92%' }}>
                        <div style={{
                          background: '#ffffff',
                          borderRadius: '0 10px 10px 10px',
                          padding: '8px 10px 6px',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                          position: 'relative',
                        }}>
                          <div style={{ position: 'absolute', top: 0, left: -5, width: 0, height: 0, borderStyle: 'solid', borderWidth: '0 6px 6px 0', borderColor: 'transparent #ffffff transparent transparent' }} />
                          {previewTemplate.header_text && (
                            <div style={{ fontWeight: 800, fontSize: '0.74rem', color: '#0f172a', marginBottom: 4 }}>
                              {previewTemplate.header_text}
                            </div>
                          )}
                          <div style={{ fontSize: '0.68rem', color: '#111827', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                            {previewTemplate.body_text}
                          </div>
                          {previewTemplate.footer_text && (
                            <div style={{ fontSize: '0.54rem', color: '#9ca3af', marginTop: 4 }}>
                              {previewTemplate.footer_text}
                            </div>
                          )}
                          <div style={{ textAlign: 'right', fontSize: '0.48rem', color: '#9ca3af', marginTop: 3 }}>
                            10:42 AM ✓✓
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Home Indicator */}
                    <div style={{ background: '#000000', paddingBottom: 8, paddingTop: 3, display: 'flex', justifyContent: 'center' }}>
                      <div style={{ width: 80, height: 3, background: '#4b5563', borderRadius: 2 }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setPreviewTemplate(null)}
                style={{ padding: '7px 18px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
