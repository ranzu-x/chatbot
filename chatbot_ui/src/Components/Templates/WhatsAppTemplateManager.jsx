import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

  // Modals & Preview
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form State
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

  /* ─── Load Templates ─── */
  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await templateAPI.getWATemplates({
        integrationId: selectedAccount?.id !== 'all' ? selectedAccount?.id : undefined,
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
        search: search.trim() || undefined,
      });
      setTemplates(res.data?.templates || []);
    } catch (err) {
      console.error('Failed to load WhatsApp templates:', err);
      if (showToast) showToast('Failed to load WhatsApp templates', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedAccount, categoryFilter, statusFilter, search, showToast]);

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

    // Synchronize variables list with new placeholder having the chosen field type
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

  /* ─── Insert Generic Next Variable ─── */
  const insertNextVariable = () => {
    insertSubscriberField(variables.length === 0 ? 'name' : 'custom', variables.length === 0 ? 'John Doe' : 'Value');
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

  /* ─── Add Button to Form ─── */
  const addButton = (type) => {
    if (buttons.length >= 10) {
      if (showToast) showToast('WhatsApp allows up to 10 buttons per template', 'error');
      return;
    }
    const newBtn = {
      id: Date.now(),
      type,
      text: type === 'QUICK_REPLY' ? 'Quick Reply' : type === 'PHONE_NUMBER' ? 'Call Us' : type === 'URL' ? 'Visit Website' : type === 'COPY_CODE' ? 'Copy Code' : type === 'CATALOG' ? 'View Catalog' : 'Open Form',
      phoneNumber: '+1234567890',
      url: 'https://example.com',
      sampleUrl: 'https://example.com/order/123',
      couponCode: 'DISCOUNT20',
      flowId: '',
      flowAction: 'navigate',
      navigateScreen: 'START',
    };
    setButtons([...buttons, newBtn]);
  };

  const removeButton = (id) => {
    setButtons(buttons.filter((b) => b.id !== id));
  };

  const updateButton = (id, field, value) => {
    setButtons(buttons.map((b) => (b.id === id ? { ...b, [field]: value } : b)));
  };

  /* ─── Submit Create Template ─── */
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

    setSaving(true);
    try {
      const payload = {
        integrationId: selectedAccount?.id !== 'all' ? selectedAccount?.id : undefined,
        templateName: form.templateName.trim(),
        language: form.language,
        category: form.category,
        headerType: form.headerType,
        headerText: form.headerType === 'TEXT' ? form.headerText : undefined,
        headerMediaUrl: ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(form.headerType) ? form.headerMediaUrl : undefined,
        headerSample: form.headerSample,
        bodyText: form.bodyText,
        footerText: form.footerText.trim() || undefined,
        buttons,
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
      const errMsg = err.response?.data?.message || 'Failed to create template';
      if (showToast) showToast(errMsg, 'error');
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
      if (search.trim()) {
        const q = search.toLowerCase();
        const mName = t.template_name?.toLowerCase().includes(q);
        const mBody = t.body_text?.toLowerCase().includes(q);
        if (!mName && !mBody) return false;
      }
      return true;
    });
  }, [templates, categoryFilter, statusFilter, search]);

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
            Create, manage, and sync Meta Cloud API approved templates with dynamic variables, custom fields, and interactive buttons.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
            {syncing ? 'Syncing with Meta...' : 'Sync with Meta'}
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
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
            <Plus size={15} /> Create Message Template
          </button>
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

        {/* Status Filter Pills & Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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

          <div style={{ position: 'relative', minWidth: 220 }}>
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

      {/* ── Templates Table / Grid ── */}
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
              Click "Sync with Meta" to pull existing approved templates from your WhatsApp Business Account, or create a new template with variables and interactive buttons.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
              <button
                onClick={handleSyncFromMeta}
                disabled={syncing}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                Sync with Meta
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                style={{
                  padding: '8px 18px',
                  borderRadius: 8,
                  background: '#25d366',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                + Create First Template
              </button>
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 18px', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Status</th>
                  <th style={{ padding: '12px 18px', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Template Name</th>
                  <th style={{ padding: '12px 18px', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Category</th>
                  <th style={{ padding: '12px 18px', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Language</th>
                  <th style={{ padding: '12px 18px', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Content Overview</th>
                  <th style={{ padding: '12px 18px', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Buttons</th>
                  <th style={{ padding: '12px 18px', fontSize: '0.74rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((tpl) => {
                  let buttonsArr = [];
                  try {
                    buttonsArr = typeof tpl.buttons_json === 'string' ? JSON.parse(tpl.buttons_json || '[]') : tpl.buttons_json || [];
                  } catch {
                    buttonsArr = [];
                  }

                  const catObj = CATEGORIES.find((c) => c.id === tpl.category) || CATEGORIES[0];

                  return (
                    <tr key={tpl.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.12s' }}>
                      <td style={{ padding: '14px 18px', verticalAlign: 'middle' }}>
                        {renderStatusBadge(tpl.status)}
                      </td>
                      <td style={{ padding: '14px 18px', verticalAlign: 'middle' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.86rem', color: '#0f172a' }}>
                          {tpl.template_name}
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
                        {buttonsArr.length === 0 ? (
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
          CREATE WHATSAPP TEMPLATE MODAL (DEDICATED FORM + LIVE PHONE PREVIEW)
          ═════════════════════════════════════════════════════════════════════ */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 9999,
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
                  <Sparkles size={18} color="#25d366" /> New WhatsApp Message Template
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
                          onClick={() => setForm({ ...form, category: cat.id })}
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

                {/* 3. Header Section */}
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
                      <option value="TEXT">Text (e.g. Bold Headline)</option>
                      <option value="IMAGE">Image</option>
                      <option value="VIDEO">Video</option>
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
                        placeholder="e.g. Special Offer For You"
                        value={form.headerText}
                        onChange={(e) => setForm({ ...form, headerText: e.target.value })}
                      />
                      {form.headerText.includes('{{1}}') && (
                        <input
                          type="text"
                          className="form-input w-full"
                          placeholder="Header Sample Value (required for review)"
                          value={form.headerSample}
                          onChange={(e) => setForm({ ...form, headerSample: e.target.value })}
                        />
                      )}
                    </div>
                  )}

                  {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(form.headerType) && (
                    <div style={{ fontSize: '0.74rem', color: '#64748b', background: '#fff', padding: 8, borderRadius: 6, border: '1px dashed #cbd5e1' }}>
                      📸 <strong>Sample {form.headerType}:</strong> You will upload/pass the actual media file when sending the template in Campaigns or Live Chat.
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
                      <button type="button" onClick={() => applyFormat('*')} title="Bold (*text*)" style={{ padding: '3px 7px', borderRadius: 4, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}><Bold size={11} /></button>
                      <button type="button" onClick={() => applyFormat('_')} title="Italic (_text_)" style={{ padding: '3px 7px', borderRadius: 4, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}><Italic size={11} /></button>
                      <button type="button" onClick={() => applyFormat('~')} title="Strikethrough (~text~)" style={{ padding: '3px 7px', borderRadius: 4, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}><Strikethrough size={11} /></button>
                      <button type="button" onClick={() => applyFormat('```')} title="Code (```text```)" style={{ padding: '3px 7px', borderRadius: 4, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}><Code size={11} /></button>
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

                    {/* 1-Click Subscriber Full Name */}
                    <button
                      type="button"
                      onClick={() => insertSubscriberField('name', 'John Doe')}
                      title="Insert Subscriber Full Name variable"
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
                        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                      }}
                    >
                      <User size={12} /> + Full Name (&#123;&#123;{variables.length + 1}&#125;&#125;)
                    </button>

                    {/* 1-Click Subscriber Phone */}
                    <button
                      type="button"
                      onClick={() => insertSubscriberField('phone', '+1234567890')}
                      title="Insert Subscriber Phone Number variable"
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

                    {/* Generic Variable */}
                    <button
                      type="button"
                      onClick={insertNextVariable}
                      title="Insert custom variable (e.g. Order ID, Date)"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: '#ffffff',
                        color: '#475569',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <Plus size={11} /> + Custom Var
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
                    <span>💡 Click <strong>+ Full Name</strong> above to greet subscribers by their actual name automatically.</span>
                    <span>{form.bodyText.length}/1024 chars</span>
                  </div>

                  {/* Variables Mapping & Sample Values Table */}
                  {variables.length > 0 && (
                    <div style={{ marginTop: 10, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#334155', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Sliders size={13} color="#2563eb" /> Variable Subscriber Field Mapping & Sample Values (Required by Meta):
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {variables.map((v, i) => (
                          <div key={v.param} style={{ display: 'grid', gridTemplateColumns: '70px 1.4fr 1fr', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.78rem', color: '#2563eb', fontFamily: 'monospace' }}>{v.param}</span>
                            <select
                              value={v.field}
                              onChange={(e) => {
                                const val = e.target.value;
                                const defaultSample =
                                  val === 'name' ? 'John Doe' :
                                  val === 'phone' ? '+1234567890' :
                                  val === 'email' ? 'subscriber@example.com' : 'Value';

                                setVariables(variables.map((item) => (
                                  item.param === v.param
                                    ? { ...item, field: val, sample: (!item.sample || item.sample === 'Value' || item.sample === 'John' || item.sample === 'John Doe') ? defaultSample : item.sample }
                                    : item
                                )));
                              }}
                              style={{ fontSize: '0.74rem', padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontWeight: 600 }}
                            >
                              <option value="name">👤 Subscriber Full Name</option>
                              <option value="phone">📱 Subscriber Phone Number</option>
                              <option value="email">✉️ Subscriber Email</option>
                              <option value="custom">⚙️ Custom / Order Field</option>
                            </select>
                            <input
                              type="text"
                              required
                              placeholder={`Sample for ${v.param} (e.g. John Doe)`}
                              value={v.sample}
                              onChange={(e) => {
                                const val = e.target.value;
                                setVariables(variables.map((item) => (item.param === v.param ? { ...item, sample: val } : item)));
                              }}
                              style={{ fontSize: '0.74rem', padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
                    placeholder="e.g. Reply STOP to opt out"
                    value={form.footerText}
                    onChange={(e) => setForm({ ...form, footerText: e.target.value })}
                  />
                </div>

                {/* 6. Interactive Buttons */}
                <div style={{ padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a' }}>
                      5. Interactive Buttons ({buttons.length}/10)
                    </label>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => addButton('QUICK_REPLY')}
                        style={{ padding: '3px 8px', borderRadius: 6, background: '#fff', border: '1px solid #cbd5e1', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        + Quick Reply
                      </button>
                      <button
                        type="button"
                        onClick={() => addButton('URL')}
                        style={{ padding: '3px 8px', borderRadius: 6, background: '#fff', border: '1px solid #cbd5e1', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        + Website URL
                      </button>
                      <button
                        type="button"
                        onClick={() => addButton('PHONE_NUMBER')}
                        style={{ padding: '3px 8px', borderRadius: 6, background: '#fff', border: '1px solid #cbd5e1', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        + Phone Call
                      </button>
                      <button
                        type="button"
                        onClick={() => addButton('COPY_CODE')}
                        style={{ padding: '3px 8px', borderRadius: 6, background: '#fff', border: '1px solid #cbd5e1', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        + Copy Code
                      </button>
                    </div>
                  </div>

                  {buttons.length === 0 ? (
                    <div style={{ fontSize: '0.74rem', color: '#94a3b8', textAlign: 'center', padding: '10px 0' }}>
                      No buttons added yet. Click one of the buttons above to add quick actions.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {buttons.map((b, idx) => (
                        <div key={b.id} style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#fff', padding: 8, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: '#f1f5f9', color: '#475569' }}>
                            {b.type}
                          </span>

                          <input
                            type="text"
                            required
                            maxLength={25}
                            placeholder="Button label (max 25 chars)"
                            value={b.text}
                            onChange={(e) => updateButton(b.id, 'text', e.target.value)}
                            style={{ flex: 1, fontSize: '0.76rem', padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                          />

                          {b.type === 'PHONE_NUMBER' && (
                            <input
                              type="text"
                              required
                              placeholder="+1234567890"
                              value={b.phoneNumber}
                              onChange={(e) => updateButton(b.id, 'phoneNumber', e.target.value)}
                              style={{ width: 140, fontSize: '0.76rem', padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                            />
                          )}

                          {b.type === 'URL' && (
                            <input
                              type="url"
                              required
                              placeholder="https://mysite.com"
                              value={b.url}
                              onChange={(e) => updateButton(b.id, 'url', e.target.value)}
                              style={{ width: 180, fontSize: '0.76rem', padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                            />
                          )}

                          {b.type === 'COPY_CODE' && (
                            <input
                              type="text"
                              required
                              placeholder="DISCOUNT20"
                              value={b.couponCode}
                              onChange={(e) => updateButton(b.id, 'couponCode', e.target.value)}
                              style={{ width: 120, fontSize: '0.76rem', padding: '4px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                            />
                          )}

                          <button
                            type="button"
                            onClick={() => removeButton(b.id)}
                            style={{ width: 24, height: 24, borderRadius: '50%', border: 'none', background: '#fee2e2', color: '#ef4444', cursor: 'pointer' }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 7. Submit Checkbox & Controls */}
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
                        background: '#25d366',
                        color: '#fff',
                        border: 'none',
                        fontSize: '0.84rem',
                        fontWeight: 800,
                        cursor: saving ? 'not-allowed' : 'pointer',
                        boxShadow: '0 2px 6px rgba(37, 211, 102, 0.3)',
                      }}
                    >
                      {saving ? 'Submitting to Meta...' : form.submitToMeta ? 'Submit Template to Meta' : 'Save Template'}
                    </button>
                  </div>
                </div>
              </form>

              {/* Right Column: Live iPhone 17 Preview */}
              <div
                style={{
                  width: 380,
                  background: 'linear-gradient(160deg, #e8edf5 0%, #dce3ef 100%)',
                  padding: '24px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflowY: 'auto',
                  gap: 12,
                }}
              >
                <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Eye size={14} /> Live WhatsApp Preview
                </div>

                {/* ── iPhone 17 Outer Shell ── */}
                <div style={{ position: 'relative', width: 260 }}>

                  {/* Side Buttons: Volume Up */}
                  <div style={{ position: 'absolute', left: -4, top: 90, width: 3, height: 28, background: '#8a8f9b', borderRadius: '2px 0 0 2px', boxShadow: '-1px 0 2px rgba(0,0,0,0.3)' }} />
                  {/* Side Buttons: Volume Down */}
                  <div style={{ position: 'absolute', left: -4, top: 126, width: 3, height: 28, background: '#8a8f9b', borderRadius: '2px 0 0 2px', boxShadow: '-1px 0 2px rgba(0,0,0,0.3)' }} />
                  {/* Side Buttons: Mute */}
                  <div style={{ position: 'absolute', left: -4, top: 64, width: 3, height: 20, background: '#8a8f9b', borderRadius: '2px 0 0 2px', boxShadow: '-1px 0 2px rgba(0,0,0,0.3)' }} />
                  {/* Power Button */}
                  <div style={{ position: 'absolute', right: -4, top: 98, width: 3, height: 52, background: '#8a8f9b', borderRadius: '0 2px 2px 0', boxShadow: '1px 0 2px rgba(0,0,0,0.3)' }} />

                  {/* Phone Body */}
                  <div style={{
                    width: 260,
                    background: 'linear-gradient(145deg, #2a2d35 0%, #1a1c22 60%, #23262e 100%)',
                    borderRadius: 44,
                    padding: 4,
                    boxShadow: '0 30px 60px rgba(0,0,0,0.55), 0 0 0 0.5px rgba(255,255,255,0.08) inset, 0 1px 0 rgba(255,255,255,0.12) inset',
                  }}>

                    {/* Inner Bezel */}
                    <div style={{
                      width: '100%',
                      background: '#000',
                      borderRadius: 41,
                      overflow: 'hidden',
                      position: 'relative',
                    }}>

                      {/* ── Status Bar ── */}
                      <div style={{
                        background: '#075e54',
                        paddingTop: 14,
                        paddingLeft: 16,
                        paddingRight: 16,
                        paddingBottom: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        position: 'relative',
                      }}>
                        {/* Dynamic Island */}
                        <div style={{
                          position: 'absolute',
                          top: 10,
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: 90,
                          height: 26,
                          background: '#000',
                          borderRadius: 20,
                          zIndex: 10,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          paddingRight: 8,
                          gap: 4,
                        }}>
                          {/* Front camera dot */}
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#1a1a2e', border: '1px solid #333', boxShadow: 'inset 0 0 3px rgba(0,100,255,0.15)' }} />
                        </div>

                        {/* Time */}
                        <span style={{ color: '#fff', fontSize: '0.6rem', fontWeight: 700, letterSpacing: 0.2 }}>9:41</span>
                        {/* Right Status Icons */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {/* Signal bars */}
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 9 }}>
                            {[3, 5, 7, 9].map((h, i) => (
                              <div key={i} style={{ width: 2, height: h, background: '#fff', borderRadius: 1 }} />
                            ))}
                          </div>
                          {/* WiFi */}
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M5 6.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" fill="white"/>
                            <path d="M2.5 4.5C3.2 3.8 4 3.5 5 3.5s1.8.3 2.5 1" stroke="white" strokeWidth="1" strokeLinecap="round" fill="none"/>
                            <path d="M0.5 2.5C1.8 1.2 3.3.5 5 .5s3.2.7 4.5 2" stroke="white" strokeWidth="1" strokeLinecap="round" fill="none"/>
                          </svg>
                          {/* Battery */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <div style={{ width: 18, height: 9, border: '1px solid rgba(255,255,255,0.7)', borderRadius: 2, padding: 1 }}>
                              <div style={{ width: '80%', height: '100%', background: '#fff', borderRadius: 1 }} />
                            </div>
                            <div style={{ width: 2, height: 4, background: 'rgba(255,255,255,0.5)', borderRadius: '0 1px 1px 0' }} />
                          </div>
                        </div>
                      </div>

                      {/* ── WhatsApp App Bar ── */}
                      <div style={{ background: '#075e54', padding: '6px 14px 10px', display: 'flex', alignItems: 'center', gap: 8, color: '#ffffff' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#25d366,#128c7e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.65rem', flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
                          WA
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, lineHeight: 1.2, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {selectedAccount?.name || 'Business Name'}
                          </div>
                          <div style={{ fontSize: '0.55rem', color: '#bbf7d0', marginTop: 1 }}>tap here for contact info</div>
                        </div>
                        {/* Action icons */}
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="12" cy="5" r="1.5" fill="white"/><circle cx="12" cy="12" r="1.5" fill="white"/><circle cx="12" cy="19" r="1.5" fill="white"/></svg>
                        </div>
                      </div>

                      {/* ── Chat Wallpaper ── */}
                      <div style={{
                        background: '#e5ddd5',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23c8bdb5' fill-opacity='0.25'%3E%3Cpath d='M20 20l-4-4 4-4 4 4z'/%3E%3C/g%3E%3C/svg%3E")`,
                        padding: '10px 8px',
                        minHeight: 420,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}>
                        {/* Date chip */}
                        <div style={{ alignSelf: 'center', background: 'rgba(255,255,255,0.75)', borderRadius: 10, fontSize: '0.52rem', color: '#667', padding: '2px 8px', fontWeight: 600, marginBottom: 4 }}>
                          TODAY
                        </div>

                        {/* Chat Bubble */}
                        <div style={{ alignSelf: 'flex-start', maxWidth: '88%' }}>
                          <div style={{
                            background: '#ffffff',
                            borderRadius: '0 10px 10px 10px',
                            padding: '8px 9px 6px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.13)',
                            position: 'relative',
                          }}>
                            {/* Bubble tail */}
                            <div style={{ position: 'absolute', top: 0, left: -6, width: 0, height: 0, borderStyle: 'solid', borderWidth: '0 8px 8px 0', borderColor: 'transparent #ffffff transparent transparent' }} />

                            {/* Header */}
                            {form.headerType === 'TEXT' && form.headerText && (
                              <div style={{ fontWeight: 800, fontSize: '0.72rem', color: '#0f172a', marginBottom: 5 }}>
                                {form.headerText}
                              </div>
                            )}
                            {['IMAGE', 'VIDEO', 'DOCUMENT'].includes(form.headerType) && (
                              <div style={{ width: '100%', height: 90, background: 'linear-gradient(135deg,#e2e8f0,#cbd5e1)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6, flexDirection: 'column', gap: 3 }}>
                                {form.headerType === 'IMAGE' && <ImageIcon size={20} color="#94a3b8" />}
                                {form.headerType === 'VIDEO' && <Video size={20} color="#94a3b8" />}
                                {form.headerType === 'DOCUMENT' && <File size={20} color="#94a3b8" />}
                                <span style={{ fontSize: '0.5rem', color: '#94a3b8', fontWeight: 600 }}>{form.headerType}</span>
                              </div>
                            )}
                            {form.headerType === 'LOCATION' && (
                              <div style={{ width: '100%', height: 70, background: 'linear-gradient(135deg,#d1fae5,#a7f3d0)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6, gap: 4 }}>
                                <MapPin size={16} color="#059669" />
                                <span style={{ fontSize: '0.52rem', color: '#059669', fontWeight: 700 }}>Location</span>
                              </div>
                            )}

                            {/* Body */}
                            <div style={{ fontSize: '0.68rem', color: '#111827', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                              {previewBodyText}
                            </div>

                            {/* Footer */}
                            {form.footerText && (
                              <div style={{ fontSize: '0.56rem', color: '#9ca3af', marginTop: 5, lineHeight: 1.3 }}>
                                {form.footerText}
                              </div>
                            )}

                            {/* Timestamp + ticks */}
                            <div style={{ textAlign: 'right', fontSize: '0.5rem', color: '#9ca3af', marginTop: 3, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2 }}>
                              <span>10:42 AM</span>
                              <svg width="14" height="8" viewBox="0 0 14 8" fill="none">
                                <path d="M1 4l3 3 5-6" stroke="#4fc3f7" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M5 4l3 3 5-6" stroke="#4fc3f7" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </div>
                          </div>

                          {/* Buttons below bubble */}
                          {buttons.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 3 }}>
                              {buttons.map((b, i) => (
                                <div key={i} style={{
                                  background: '#ffffff',
                                  color: '#00a884',
                                  fontWeight: 700,
                                  fontSize: '0.62rem',
                                  padding: '6px 8px',
                                  borderRadius: 8,
                                  textAlign: 'center',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 4,
                                }}>
                                  {b.type === 'PHONE_NUMBER' && <Phone size={10} />}
                                  {b.type === 'URL' && <ExternalLink size={10} />}
                                  {b.type === 'COPY_CODE' && <Copy size={10} />}
                                  {b.type === 'CATALOG' && <ShoppingBag size={10} />}
                                  {b.text || 'Button'}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ── WhatsApp Input Bar ── */}
                      <div style={{ background: '#f0f0f0', padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, background: '#fff', borderRadius: 20, padding: '5px 12px', fontSize: '0.58rem', color: '#9ca3af', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
                          Message
                        </div>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        </div>
                      </div>

                      {/* Home indicator */}
                      <div style={{ background: '#000', paddingBottom: 10, paddingTop: 4, display: 'flex', justifyContent: 'center' }}>
                        <div style={{ width: 80, height: 4, background: '#444', borderRadius: 2 }} />
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
          QUICK PREVIEW MODAL
          ═════════════════════════════════════════════════════════════════════ */}
      {previewTemplate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 480,
              maxWidth: '92vw',
              background: '#ffffff',
              borderRadius: 16,
              padding: 20,
              boxShadow: '0 16px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                  {previewTemplate.template_name}
                </h4>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  {renderStatusBadge(previewTemplate.status)}
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#f1f5f9' }}>
                    {previewTemplate.category}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setPreviewTemplate(null)}
                style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* iPhone 17 Quick Preview */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <div style={{ position: 'relative', width: 230 }}>
                {/* Side buttons */}
                <div style={{ position: 'absolute', left: -3, top: 76, width: 3, height: 22, background: '#8a8f9b', borderRadius: '2px 0 0 2px' }} />
                <div style={{ position: 'absolute', left: -3, top: 106, width: 3, height: 22, background: '#8a8f9b', borderRadius: '2px 0 0 2px' }} />
                <div style={{ position: 'absolute', left: -3, top: 55, width: 3, height: 16, background: '#8a8f9b', borderRadius: '2px 0 0 2px' }} />
                <div style={{ position: 'absolute', right: -3, top: 84, width: 3, height: 42, background: '#8a8f9b', borderRadius: '0 2px 2px 0' }} />

                {/* Phone body */}
                <div style={{ width: 230, background: 'linear-gradient(145deg,#2a2d35,#1a1c22)', borderRadius: 40, padding: 4, boxShadow: '0 24px 50px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.07) inset' }}>
                  <div style={{ borderRadius: 37, overflow: 'hidden', background: '#000' }}>

                    {/* Status Bar */}
                    <div style={{ background: '#075e54', paddingTop: 12, paddingLeft: 14, paddingRight: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                      <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 78, height: 22, background: '#000', borderRadius: 18, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#1a1a2e', border: '1px solid #333' }} />
                      </div>
                      <span style={{ color: '#fff', fontSize: '0.55rem', fontWeight: 700 }}>9:41</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1 }}>
                          {[3, 5, 7, 9].map((h, i) => <div key={i} style={{ width: 2, height: h, background: '#fff', borderRadius: 1 }} />)}
                        </div>
                        <div style={{ width: 16, height: 8, border: '1px solid rgba(255,255,255,0.7)', borderRadius: 2, padding: 1 }}>
                          <div style={{ width: '80%', height: '100%', background: '#fff', borderRadius: 1 }} />
                        </div>
                      </div>
                    </div>

                    {/* WA App Bar */}
                    <div style={{ background: '#075e54', padding: '5px 12px 8px', display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg,#25d366,#128c7e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.55rem', color: '#fff', flexShrink: 0 }}>WA</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.64rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{previewTemplate.template_name}</div>
                        <div style={{ fontSize: '0.48rem', color: '#bbf7d0' }}>tap here for contact info</div>
                      </div>
                    </div>

                    {/* Chat area */}
                    <div style={{ background: '#e5ddd5', padding: '8px 7px', minHeight: 320, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ alignSelf: 'center', background: 'rgba(255,255,255,0.75)', borderRadius: 8, fontSize: '0.46rem', color: '#667', padding: '2px 6px', fontWeight: 600, marginBottom: 3 }}>TODAY</div>

                      <div style={{ alignSelf: 'flex-start', maxWidth: '90%' }}>
                        <div style={{ background: '#fff', borderRadius: '0 9px 9px 9px', padding: '7px 8px 5px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)', position: 'relative' }}>
                          <div style={{ position: 'absolute', top: 0, left: -5, width: 0, height: 0, borderStyle: 'solid', borderWidth: '0 6px 6px 0', borderColor: 'transparent #fff transparent transparent' }} />
                          {previewTemplate.header_text && (
                            <div style={{ fontWeight: 800, fontSize: '0.64rem', color: '#0f172a', marginBottom: 4 }}>{previewTemplate.header_text}</div>
                          )}
                          <div style={{ fontSize: '0.61rem', color: '#111827', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{previewTemplate.body_text}</div>
                          {previewTemplate.footer_text && (
                            <div style={{ fontSize: '0.5rem', color: '#9ca3af', marginTop: 4 }}>{previewTemplate.footer_text}</div>
                          )}
                          <div style={{ textAlign: 'right', fontSize: '0.45rem', color: '#9ca3af', marginTop: 2, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 2 }}>
                            <span>10:42 AM</span>
                            <svg width="12" height="7" viewBox="0 0 14 8" fill="none"><path d="M1 4l3 3 5-6" stroke="#4fc3f7" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M5 4l3 3 5-6" stroke="#4fc3f7" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Input bar */}
                    <div style={{ background: '#f0f0f0', padding: '5px 7px', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ flex: 1, background: '#fff', borderRadius: 18, padding: '4px 10px', fontSize: '0.52rem', color: '#9ca3af' }}>Message</div>
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                      </div>
                    </div>

                    {/* Home indicator */}
                    <div style={{ background: '#000', paddingBottom: 8, paddingTop: 3, display: 'flex', justifyContent: 'center' }}>
                      <div style={{ width: 66, height: 3, background: '#444', borderRadius: 2 }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setPreviewTemplate(null)}
                style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
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
