import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import ChannelBreadcrumb from '../../Components/Common/ChannelBreadcrumb';
import { channelAPI, flowAPI } from '../../services/api';
import { handleLimitError } from '../../utils/alerts';
import { getBackendOrigin } from '../../utils/assetUrl';
import { validateWebsiteUrl, createChatWidgetAndFlow, createReplyFlowForWidget, confirmAndDeleteWidget } from '../../utils/chatWidgetHelpers';
import { useAuth } from '../../Provider/AuthContext';
import { Globe, CheckCircle2, XCircle, ClipboardCopy, Plus, Trash2, RefreshCw, ArrowLeft, GitBranch, AlertTriangle } from 'lucide-react';

const EmbeddedWrapper = ({ children }) => <div>{children}</div>;

const DEFAULT_FORM = { name: '', primaryColor: '#6366f1', greetingMessage: 'Hello! How can we help you today?', placeholderText: 'Type a message…', websiteUrl: '' };

export default function WebchatPage({ embedded = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [widgets, setWidgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [embedModal, setEmbedModal] = useState(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [formError, setFormError] = useState('');
  const [view, setView] = useState('list'); // 'list' | 'connect'
  const [fixDomainWidget, setFixDomainWidget] = useState(null);
  const [fixDomainInput, setFixDomainInput] = useState('');
  const [fixDomainError, setFixDomainError] = useState('');
  const [fixDomainSaving, setFixDomainSaving] = useState(false);

  // This page only ever creates WEBCHAT-type widgets — filter its own list
  // to that channel too, so a DEEPLINK widget created elsewhere (Bot Manager
  // -> Engagement -> Chat Widget) never shows up in this WEBCHAT-only table.
  const fetchWidgets = useCallback(async () => {
    setLoading(true);
    try { const res = await channelAPI.getWebchat({ platform: 'WEBCHAT' }); setWidgets(res.data.widgets || []); }
    catch { showToast('Failed to load', 'error'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchWidgets(); }, [fetchWidgets]);

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  const handleCreate = async (e) => {
    e.preventDefault();
    const urlCheck = validateWebsiteUrl(form.websiteUrl);
    if (!urlCheck.ok) { setFormError(urlCheck.error); return; }
    setFormError('');
    setSaving(true);
    try {
      const { flowId } = await createChatWidgetAndFlow({
        platformType: 'WEBCHAT',
        name: form.name,
        websiteHostname: urlCheck.hostname,
        extraWidgetFields: {
          primaryColor: form.primaryColor,
          buttonBgColor: form.primaryColor,
          greetingMessage: form.greetingMessage,
          placeholderText: form.placeholderText,
        },
      });

      showToast('Widget created! Opening Flow Builder...');
      if (flowId) {
        navigate(`/flows/${flowId}`, { state: { from: location.pathname + location.search, label: 'Webchat' } });
      } else {
        setForm(DEFAULT_FORM);
        setView('list');
        fetchWidgets();
      }
    } catch (err) {
      if (!handleLimitError(err, { userRole: user?.role })) {
        showToast(err.response?.data?.message || 'Failed', 'error');
      }
    } finally { setSaving(false); }
  };

  const handleEditFlow = async (widget) => {
    if (widget.flow_id) {
      try {
        const check = await flowAPI.getOne(widget.flow_id);
        if (check.data?.flow) {
          navigate(`/flows/${widget.flow_id}`, { state: { from: location.pathname + location.search, label: 'Webchat' } });
          return;
        }
      } catch {
        // flow_id is broken/deleted; fall through to recreate it
      }
    }
    try {
      const flowId = await createReplyFlowForWidget(widget);
      if (flowId) navigate(`/flows/${flowId}`, { state: { from: location.pathname + location.search, label: 'Webchat' } });
    } catch (err) {
      console.error('Failed to open Flow Builder for this widget', err);
      showToast('Failed to open Flow Builder', 'error');
    }
  };

  const handleDelete = async (widget) => {
    try {
      const deleted = await confirmAndDeleteWidget(widget);
      if (deleted) { showToast('Widget deleted'); fetchWidgets(); }
    } catch {
      showToast('Failed', 'error');
    }
  };

  const openFixDomainModal = (widget) => {
    setFixDomainWidget(widget);
    setFixDomainInput('');
    setFixDomainError('');
  };

  const handleFixDomainSave = async () => {
    const result = validateWebsiteUrl(fixDomainInput);
    if (!result.ok) { setFixDomainError(result.error); return; }
    setFixDomainSaving(true);
    try {
      await channelAPI.updateWebchat(fixDomainWidget.id, { allowedDomains: result.hostname });
      setWidgets((prev) => prev.map((w) => (w.id === fixDomainWidget.id ? { ...w, allowed_domains: result.hostname } : w)));
      setFixDomainWidget(null);
      showToast('Website saved — this widget is now active.');
    } catch (err) {
      setFixDomainError(err?.response?.data?.message || 'Failed to save. Please try again.');
    } finally {
      setFixDomainSaving(false);
    }
  };

  const getEmbedCode = (key) => `<script src="${getBackendOrigin()}/widget.js" data-key="${key}"></script>`;

  const copyEmbed = (key) => {
    navigator.clipboard.writeText(getEmbedCode(key));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const LayoutWrapper = embedded ? EmbeddedWrapper : AppLayout;

  // ── VIEW: Widget List ───────────────────────────────────────────────────────
  const ListView = () => (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(99,102,241,0.1)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Globe size={20} />
            </div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Live Webchat
            </h1>
          </div>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2, marginLeft: 46 }}>
            Embed customizable live chat widgets on your websites.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchWidgets} className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', fontSize: '0.82rem' }}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button
            onClick={() => setView('connect')}
            style={{ display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 14px', fontSize: '0.84rem', fontWeight: 700, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', boxShadow: '0 2px 8px rgba(99,102,241,0.25)' }}
          >
            <Plus size={15} /> Create Widget
          </button>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Webchat Widgets</h2>
            <p style={{ fontSize: '0.74rem', color: '#64748b', margin: '2px 0 0' }}>Widgets embedded on your websites</p>
          </div>
          <span style={{ fontSize: '0.74rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(99,102,241,0.1)', color: '#6366f1' }}>
            {widgets.length} Created
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Widget</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Website</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Greeting</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Widget Key</th>
                <th style={{ padding: '10px 14px', fontWeight: 700 }}>Status</th>
                <th style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                    <div className="loading-spinner" style={{ margin: '0 auto 8px' }} />
                    Loading widgets...
                  </td>
                </tr>
              ) : widgets.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
                    <Globe size={40} color="#cbd5e1" style={{ margin: '0 auto 12px', display: 'block' }} />
                    <h3 style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>No Webchat Widgets Created</h3>
                    <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 16px' }}>Click "Create Widget" to embed live chat on your website.</p>
                    <button
                      onClick={() => setView('connect')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', fontSize: '0.82rem', fontWeight: 700, background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
                    >
                      <Plus size={14} /> Create Now
                    </button>
                  </td>
                </tr>
              ) : (
                widgets.map((w) => (
                  <tr
                    key={w.id}
                    style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.12s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fafbfe')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                  >
                    <td style={{ padding: '12px 14px', fontWeight: 700, color: '#0f172a' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 28, height: 28, borderRadius: 6, background: w.primary_color || 'rgba(99,102,241,0.1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Globe size={14} />
                        </span>
                        {w.name}
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {w.allowed_domains && w.allowed_domains.trim() ? (
                        <span style={{ color: '#475569', fontSize: '0.8rem' }}>
                          {w.allowed_domains.split(',')[0].trim()}
                          {w.allowed_domains.split(',').length > 1 && (
                            <span style={{ color: '#94a3b8' }}> +{w.allowed_domains.split(',').length - 1} more</span>
                          )}
                        </span>
                      ) : (
                        <button
                          onClick={() => openFixDomainModal(w)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.74rem', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '3px 8px', cursor: 'pointer' }}
                        >
                          <AlertTriangle size={11} /> Not set
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#64748b', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      "{w.greeting_message}"
                    </td>
                    <td style={{ padding: '12px 14px', color: '#64748b', fontFamily: 'monospace', fontSize: '0.76rem' }}>
                      {w.widget_key}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', fontWeight: 700, color: w.is_active ? '#16a34a' : '#64748b', background: w.is_active ? 'rgba(34,197,94,0.1)' : '#f1f5f9', padding: '2px 8px', borderRadius: 10 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: w.is_active ? '#16a34a' : '#94a3b8' }} />
                        {w.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                        <button
                          onClick={() => handleEditFlow(w)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '4px 10px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            borderRadius: 6,
                            border: '1px solid #c7d2fe',
                            background: '#eef2ff',
                            color: '#4f46e5',
                            cursor: 'pointer'
                          }}
                          title="Edit Widget & Bot Replies in Flow Builder"
                        >
                          <GitBranch size={11} /> Edit Flow
                        </button>
                        <button
                          onClick={() => setEmbedModal(w)}
                          className="btn btn-secondary btn-sm"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', fontSize: '0.72rem' }}
                        >
                          <ClipboardCopy size={11} /> Embed Code
                        </button>
                        <button
                          onClick={() => handleDelete(w)}
                          style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #fee2e2', background: '#fef2f2', color: '#ef4444', cursor: 'pointer' }}
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // ── VIEW: Create Widget ─────────────────────────────────────────────────────
  const ConnectView = () => (
    <div style={{ maxWidth: 560 }}>
      <button onClick={() => setView('list')} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', marginBottom: 20, padding: 0 }}>
        <ArrowLeft size={14} /> Back to Widgets
      </button>

      <div style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 14,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        padding: '24px 28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(99,102,241,0.1)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Globe size={18} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>Create Webchat Widget</h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#64748b' }}>Customize the widget, then embed it on your website</p>
          </div>
        </div>

        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
              Widget Name <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              className="form-input w-full"
              placeholder="e.g. Sales Website Widget"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
              style={{ height: 36, fontSize: '0.84rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>Primary Color</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="color" value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))} style={{ width: 44, height: 36, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }} />
              <input className="form-input" value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))} style={{ height: 36, fontSize: '0.84rem', fontFamily: 'monospace' }} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>Greeting Message</label>
            <input className="form-input w-full" value={form.greetingMessage} onChange={e => setForm(f => ({ ...f, greetingMessage: e.target.value }))} style={{ height: 36, fontSize: '0.84rem' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>Input Placeholder</label>
            <input className="form-input w-full" value={form.placeholderText} onChange={e => setForm(f => ({ ...f, placeholderText: e.target.value }))} style={{ height: 36, fontSize: '0.84rem' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#334155', marginBottom: 5 }}>
              Where will you use this widget? <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              className="form-input w-full"
              placeholder="https://example.com"
              value={form.websiteUrl}
              onChange={e => { setForm(f => ({ ...f, websiteUrl: e.target.value })); setFormError(''); }}
              style={{ height: 36, fontSize: '0.84rem', fontFamily: 'monospace', borderColor: formError ? '#fca5a5' : undefined }}
            />
            <p style={{ fontSize: '0.72rem', color: formError ? '#dc2626' : '#94a3b8', margin: '4px 0 0' }}>
              {formError || "This Chat Widget can only be used on the website you specify — including its subdomains."}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 6, borderTop: '1px solid #f1f5f9' }}>
            <button type="button" onClick={() => setView('list')} className="btn btn-secondary btn-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary btn-sm"
              style={{ background: '#6366f1', borderColor: '#6366f1', fontWeight: 700, minWidth: 130 }}
            >
              {saving ? 'Creating...' : (<><Plus size={14} /> Create Widget</>)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <LayoutWrapper>
      <div style={{ width: '100%', padding: embedded ? '0' : '16px 20px' }}>
        {toast && <div className="toast-container"><div className={`toast ${toast.type}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{toast.type === 'success' ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {toast.msg}</div></div>}

        {/* Embed Code Modal */}
        {embedModal && (
          <div className="modal-overlay" onClick={() => setEmbedModal(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Globe size={17} /> Embed Code — {embedModal.name}</div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                Paste this snippet before the closing <code>&lt;/body&gt;</code> tag of your website:
              </p>
              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all', position: 'relative' }}>
                {getEmbedCode(embedModal.widget_key)}
              </div>
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setEmbedModal(null)}>Close</button>
                <button className="btn btn-primary" onClick={() => copyEmbed(embedModal.widget_key)}>
                  {copied ? <><CheckCircle2 size={14} /> Copied!</> : <><ClipboardCopy size={14} /> Copy Code</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Fix-domain modal — for an existing widget with no website set yet */}
        {fixDomainWidget && (
          <div className="modal-overlay" onClick={() => setFixDomainWidget(null)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
              <div className="modal-title">Set Website — {fixDomainWidget.name}</div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                This widget is currently disabled — it has no authorized website yet. Set one to reactivate it.
              </p>
              <input
                type="text"
                autoFocus
                placeholder="https://example.com"
                value={fixDomainInput}
                onChange={(e) => { setFixDomainInput(e.target.value); setFixDomainError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleFixDomainSave(); }}
                style={{ width: '100%', height: 38, padding: '0 12px', borderRadius: 8, border: `1px solid ${fixDomainError ? '#fca5a5' : '#e2e8f0'}`, fontSize: '0.86rem', fontFamily: 'monospace', boxSizing: 'border-box' }}
              />
              {fixDomainError && <p style={{ fontSize: '0.76rem', color: '#dc2626', margin: '6px 0 0' }}>{fixDomainError}</p>}
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setFixDomainWidget(null)}>Cancel</button>
                <button className="btn btn-primary" disabled={fixDomainSaving} onClick={handleFixDomainSave}>
                  {fixDomainSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {!embedded && <ChannelBreadcrumb current="Live Webchat" />}
        {view === 'list' ? ListView() : ConnectView()}
      </div>
    </LayoutWrapper>
  );
}
