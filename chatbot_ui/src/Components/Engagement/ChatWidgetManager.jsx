import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { channelAPI, flowAPI, integrationAPI } from '../../services/api';
import DeepLinkWidgetEditor from './DeepLinkWidgetEditor';
import {
  MessageCircle, Copy, Check, Info, ExternalLink, Plus, Pencil, Trash2, Code2, Circle,
  Facebook, Instagram, Send as TelegramIcon, Globe, ChevronDown,
} from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:5000';

const PLATFORM_META = {
  WEBCHAT: { label: 'Webchat', color: '#2563eb', icon: Globe },
  WHATSAPP: { label: 'WhatsApp', color: '#25D366', icon: MessageCircle },
  FACEBOOK: { label: 'Messenger', color: '#0084FF', icon: Facebook },
  TELEGRAM: { label: 'Telegram', color: '#26A5E4', icon: TelegramIcon },
  INSTAGRAM: { label: 'Instagram', color: '#E1306C', icon: Instagram },
};

/**
 * Bot Manager → Engagement → Chat Widget.
 *
 * Every embeddable chat entry point an agency can put on their website lives
 * here — one unified widget list, one JS embed snippet format
 * (`<script src=".../widget.js" data-key="...">`) for all of them:
 *
 *   - Webchat: a full in-page chat window whose replies are built as flow
 *     nodes in the Flow Builder (see WidgetAppearancePanel.jsx there).
 *   - WhatsApp / Messenger / Telegram / Instagram: a "deep-link" widget — a
 *     customizable floating button + preview popup that hands off to the
 *     platform's own app (wa.me/m.me/t.me/ig.me) instead of running a
 *     conversation on our side, so it needs no reply flow at all (see
 *     DeepLinkWidgetEditor.jsx). Meta discontinued its own embeddable
 *     Messenger "Customer Chat Plugin" in May 2024, so this is the only
 *     embeddable Messenger entry point left; Instagram's ig.me links are
 *     still live today (confirmed against Meta's current docs) just without
 *     a pre-fillable message, which the editor explains rather than fakes.
 */
function LinkCard({ icon, title, link, note, extra }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18, maxWidth: 520 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
        {icon} {title}
      </div>
      {note && <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 10px 0' }}>{note}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px' }}>
        <a href={link} target="_blank" rel="noreferrer" style={{ flex: 1, fontSize: '0.82rem', fontFamily: 'monospace', color: '#2563eb', textDecoration: 'none', wordBreak: 'break-all' }}>
          {link}
        </a>
        <ExternalLink size={13} color="#94a3b8" />
        <button
          type="button"
          onClick={copy}
          style={{ padding: '5px 10px', borderRadius: 6, background: copied ? '#dcfce7' : '#eff6ff', border: '1px solid ' + (copied ? '#86efac' : '#bfdbfe'), color: copied ? '#16a34a' : '#2563eb', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {extra}
    </div>
  );
}

function MissingField({ label, hint }) {
  return (
    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: 18, maxWidth: 520, display: 'flex', gap: 10 }}>
      <Info size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
      <div>
        <div style={{ fontWeight: 800, color: '#991b1b', fontSize: '0.86rem', marginBottom: 4 }}>Missing {label}</div>
        <p style={{ fontSize: '0.8rem', color: '#991b1b', margin: 0 }}>{hint}</p>
      </div>
    </div>
  );
}

// The plain "just give me the raw link" quick-reference for whichever
// account is currently selected in Bot Manager's account switcher — a
// lighter-weight alternative to building a full widget below, for pasting
// into an email signature, bio link, etc. TikTok has no such link at all
// (no official click-to-chat/deep-link format exists today) so it's shown
// honestly rather than fabricated.
function ChannelEntryPoint({ selectedAccount }) {
  const platform = (selectedAccount?.platform || '').toUpperCase();

  if (!selectedAccount || selectedAccount === 'all' || platform === 'WEBCHAT') return null;

  if (platform === 'WHATSAPP') {
    const phone = (selectedAccount.wa_display_phone || '').replace(/[^\d]/g, '');
    if (!phone) {
      return <MissingField label="a display phone number" hint="Reconnect this WhatsApp account, or set its display phone number under Channels → WhatsApp." />;
    }
    return (
      <LinkCard
        icon={<MessageCircle size={16} color="#25D366" />}
        title="WhatsApp Click-to-Chat Link"
        link={`https://wa.me/${phone}`}
        note="The plain wa.me link — for a fully customizable button widget with logo/colors/pre-filled message, use Create Chat Widget above instead."
      />
    );
  }

  if (platform === 'FACEBOOK') {
    const pageId = selectedAccount.fb_page_id;
    if (!pageId) {
      return <MissingField label="a connected Facebook Page ID" hint="Reconnect this Facebook Page under Channels → Facebook." />;
    }
    return (
      <LinkCard
        icon={<MessageCircle size={16} color="#0084FF" />}
        title="Messenger Chat Link (m.me)"
        link={`https://m.me/${pageId}`}
        note="The plain m.me link. Meta discontinued its own embeddable Messenger plugin in 2024 — use Create Chat Widget above for a self-built button instead."
      />
    );
  }

  if (platform === 'INSTAGRAM') {
    const username = selectedAccount.ig_username;
    if (!username) {
      return <MissingField label="a connected Instagram username" hint="Reconnect this Instagram account under Channels → Instagram." />;
    }
    return (
      <LinkCard
        icon={<MessageCircle size={16} color="#E1306C" />}
        title="Instagram DM Link (ig.me)"
        link={`https://ig.me/m/${username}`}
        note="Meta's official ig.me link feature — still live today, though it doesn't support a pre-filled message."
      />
    );
  }

  if (platform === 'TELEGRAM') {
    const username = selectedAccount.tg_bot_username;
    if (!username) {
      return <MissingField label="a connected Telegram bot username" hint="Reconnect this bot under Channels → Telegram." />;
    }
    return (
      <LinkCard
        icon={<MessageCircle size={16} color="#26A5E4" />}
        title="Telegram Bot Link"
        link={`https://t.me/${username}`}
        note="The plain t.me deep link. Append ?start=<payload> yourself, or use Create Chat Widget above for a configurable button."
      />
    );
  }

  if (platform === 'TIKTOK') {
    return (
      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 12, padding: 18, maxWidth: 520, display: 'flex', gap: 10 }}>
        <Info size={18} color="#c2410c" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontWeight: 800, color: '#9a3412', fontSize: '0.86rem', marginBottom: 4 }}>No public chat-entry link on TikTok yet</div>
          <p style={{ fontSize: '0.8rem', color: '#9a3412', margin: 0, lineHeight: 1.5 }}>
            TikTok's Business Messaging API doesn't currently provide an official click-to-chat / deep-link URL the way WhatsApp, Messenger, Instagram, and Telegram do. Automated replies to messages people send you inside TikTok still work normally; this panel will offer a link the moment TikTok publishes one.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

export default function ChatWidgetManager({ selectedAccount }) {
  const platform = (selectedAccount?.platform || '').toUpperCase();
  const showChannelSection = selectedAccount && selectedAccount !== 'all' && platform !== 'WEBCHAT';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <ChatWidgetList />

      {showChannelSection && (
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 20 }}>
          <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0' }}>
            {selectedAccount.name || platform} — Quick Link
          </h4>
          <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '0 0 12px 0' }}>
            For the currently selected account in the switcher above.
          </p>
          <ChannelEntryPoint selectedAccount={selectedAccount} />
        </div>
      )}
    </div>
  );
}

// ─── Chat Widget list (Webchat + WhatsApp/Messenger/Telegram/Instagram) ──
function getEmbedCode(widgetKey) {
  return `<script src="${BACKEND_URL}/widget.js" data-key="${widgetKey}"></script>`;
}

// Same "Blank Canvas" shape BotManagerPage.jsx's STARTER_TEMPLATES uses for
// a brand-new flow — one Start node feeding one Text reply node — since
// FlowBuilderPage.jsx itself never seeds nodes for a new flow (it only
// fetches an existing one by :id), the caller has to build & POST them.
function buildDefaultWidgetFlowGraph(widgetName) {
  const nodes = [
    { id: 'start_1', type: 'start', position: { x: 80, y: 120 }, data: { label: 'Start Trigger', trigger_type: 'keyword', keywords: [], match_type: 'contains' } },
    { id: 'text_1', type: 'text', position: { x: 440, y: 120 }, data: { label: 'Welcome Reply', message: `Hi! Thanks for reaching out to ${widgetName || 'us'} 👋 How can we help?`, buttons: [] } },
  ];
  const edges = [{ id: 'e1', source: 'start_1', target: 'text_1', type: 'default', animated: false }];
  return { nodes, edges };
}

const CREATE_TYPE_OPTIONS = [
  { type: 'WEBCHAT', label: 'Webchat', sub: 'Full in-page chat window, built with the Flow Builder' },
  { type: 'WHATSAPP', label: 'WhatsApp', sub: 'Button → hands off to wa.me' },
  { type: 'FACEBOOK', label: 'Messenger', sub: 'Button → hands off to m.me' },
  { type: 'TELEGRAM', label: 'Telegram', sub: 'Button → hands off to t.me' },
  { type: 'INSTAGRAM', label: 'Instagram', sub: 'Button → hands off to ig.me' },
];

function ChatWidgetList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [widgets, setWidgets] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [embedModal, setEmbedModal] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [deepLinkEditor, setDeepLinkEditor] = useState(null); // { widget: null | existingWidget }
  const createMenuRef = useRef(null);

  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    if (!showCreateMenu) return;
    const onClickOutside = (e) => { if (createMenuRef.current && !createMenuRef.current.contains(e.target)) setShowCreateMenu(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showCreateMenu]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [wRes, iRes] = await Promise.all([channelAPI.getWebchat(), integrationAPI.getAll()]);
      setWidgets(wRes.data?.widgets || []);
      setIntegrations(iRes.data?.integrations || []);
    } catch (err) {
      console.error('Failed to load chat widgets', err);
    } finally {
      setLoading(false);
    }
  };

  const openInFlowBuilder = (flowId) => {
    navigate(`/flows/${flowId}`, { state: { from: location.pathname + location.search, label: 'Engagement' } });
  };

  // Webchat — creates the widget record (and its own dedicated WEBCHAT
  // integration) and a starter reply flow together, links them, then drops
  // the agent straight into the Flow Builder — where the "Widget Appearance"
  // panel (WidgetAppearancePanel.jsx, opened from the toolbar next to
  // Preview) configures logo/colors/behavior, and the canvas is where the
  // reply node(s) get built. Saving there returns here via the builder's
  // own back button.
  const handleCreateWebchat = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const name = `Webchat Widget ${widgets.filter((w) => w.widget_type !== 'DEEPLINK').length + 1}`;
      const widgetRes = await channelAPI.addWebchat({ name });
      const widgetId = widgetRes.data?.id;
      const integrationId = widgetRes.data?.integrationId;

      const { nodes, edges } = buildDefaultWidgetFlowGraph(name);
      const flowRes = await flowAPI.create({
        name,
        platform: 'WEBCHAT',
        integrationId,
        triggerType: 'ANY',
        nodes_json: JSON.stringify(nodes),
        edges_json: JSON.stringify(edges),
      });
      const flowId = flowRes.data?.flowId || flowRes.data?.flow?.id || flowRes.data?.id;

      if (widgetId && flowId) {
        await channelAPI.updateWebchat(widgetId, { flowId });
      }

      if (flowId) {
        openInFlowBuilder(flowId);
      } else {
        fetchAll();
      }
    } catch (err) {
      console.error('Failed to create chat widget', err);
      alert(err?.response?.data?.message || 'Failed to create chat widget');
    } finally {
      setCreating(false);
    }
  };

  // Webchat widgets created before this redesign (or ones whose flow was
  // deleted) have no flow_id yet — lazily create+link one on first Edit
  // instead of leaving the agent stuck with nowhere to configure replies.
  const handleEditWebchat = async (widget) => {
    if (widget.flow_id) {
      openInFlowBuilder(widget.flow_id);
      return;
    }
    setBusyId(widget.id);
    try {
      const { nodes, edges } = buildDefaultWidgetFlowGraph(widget.name);
      const flowRes = await flowAPI.create({
        name: widget.name,
        platform: 'WEBCHAT',
        integrationId: widget.integration_id,
        triggerType: 'ANY',
        nodes_json: JSON.stringify(nodes),
        edges_json: JSON.stringify(edges),
      });
      const flowId = flowRes.data?.flowId || flowRes.data?.flow?.id || flowRes.data?.id;
      if (flowId) {
        await channelAPI.updateWebchat(widget.id, { flowId });
        openInFlowBuilder(flowId);
      }
    } catch (err) {
      console.error('Failed to set up reply flow', err);
      alert('Failed to set up a reply flow for this widget');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateDeepLink = (platformType) => {
    setShowCreateMenu(false);
    const firstMatch = integrations.find((i) => (i.platform || '').toUpperCase() === platformType);
    setDeepLinkEditor({ widget: firstMatch ? { integration_id: firstMatch.id } : null });
  };

  const handleCreateMenuSelect = (opt) => {
    if (opt.type === 'WEBCHAT') {
      setShowCreateMenu(false);
      handleCreateWebchat();
    } else {
      handleCreateDeepLink(opt.type);
    }
  };

  const handleDelete = async (widget) => {
    if (!window.confirm(`Delete "${widget.name}"? The embed code will stop working immediately.`)) return;
    setBusyId(widget.id);
    try {
      await channelAPI.deleteWebchat(widget.id);
      setWidgets((prev) => prev.filter((w) => w.id !== widget.id));
    } catch (err) {
      console.error('Failed to delete widget', err);
      alert('Failed to delete widget');
    } finally {
      setBusyId(null);
    }
  };

  const copyEmbed = (widgetKey) => {
    navigator.clipboard.writeText(getEmbedCode(widgetKey));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 14, flexWrap: 'wrap' }}>
        <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0, maxWidth: 460 }}>
          A customizable floating chat button for your website — full in-page replies via Webchat, or a one-click hand-off to WhatsApp, Messenger, Telegram, or Instagram.
        </p>
        <div ref={createMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setShowCreateMenu((v) => !v)}
            disabled={creating}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={14} /> {creating ? 'Creating…' : 'Create Chat Widget'} <ChevronDown size={13} />
          </button>
          {showCreateMenu && (
            <div style={{ position: 'absolute', top: '110%', right: 0, width: 280, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 10px 30px rgba(15,23,42,0.15)', zIndex: 30, overflow: 'hidden', padding: 4 }}>
              {CREATE_TYPE_OPTIONS.map((opt) => {
                const meta = PLATFORM_META[opt.type];
                return (
                  <button
                    key={opt.type}
                    type="button"
                    onClick={() => handleCreateMenuSelect(opt)}
                    style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 10px', border: 'none', background: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left' }}
                    onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'none'}
                  >
                    <meta.icon size={16} color={meta.color} style={{ marginTop: 1, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>{meta.label}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{opt.sub}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {deepLinkEditor && (
        <DeepLinkWidgetEditor
          open={Boolean(deepLinkEditor)}
          widget={deepLinkEditor.widget}
          integrations={integrations}
          onClose={() => setDeepLinkEditor(null)}
          onSaved={fetchAll}
        />
      )}

      {embedModal && (
        <div className="modal-overlay" onClick={() => setEmbedModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">🌐 Embed Code — {embedModal.name}</div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
              Paste this snippet before the closing <code>&lt;/body&gt;</code> tag of your website:
            </p>
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}>
              {getEmbedCode(embedModal.widget_key)}
            </div>
            {embedModal.widget_type === 'DEEPLINK' && (
              <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 10 }}>
                Clicking the button hands the visitor straight to {PLATFORM_META[embedModal.target_integration_platform]?.label || 'the connected app'} — no chat runs on this site.
              </p>
            )}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setEmbedModal(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => copyEmbed(embedModal.widget_key)}>
                {copied ? '✅ Copied!' : '📋 Copy Code'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Loading…</div>
      ) : widgets.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', border: '1px dashed #e2e8f0', borderRadius: 12, color: '#64748b' }}>
          <MessageCircle size={32} color="#cbd5e1" style={{ marginBottom: 10 }} />
          <div style={{ fontWeight: 700, color: '#334155', marginBottom: 4 }}>No chat widgets yet</div>
          <div style={{ fontSize: '0.82rem' }}>Create one to get an embeddable chat button for your website.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {widgets.map((w) => {
            const isDeepLink = w.widget_type === 'DEEPLINK';
            const meta = PLATFORM_META[isDeepLink ? w.target_integration_platform : 'WEBCHAT'] || PLATFORM_META.WEBCHAT;
            const targetIdentifier = w.wa_display_phone || w.fb_page_id || w.ig_username || w.tg_bot_username;
            return (
              <div key={w.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: w.button_bg_color || w.primary_color || meta.color, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {w.logo_url ? (
                      <img src={w.logo_url.startsWith('http') ? w.logo_url : `${BACKEND_URL}${w.logo_url}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <meta.icon size={16} color="#fff" />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>
                    <div style={{ fontSize: '0.72rem', color: w.is_active ? '#16a34a' : '#94a3b8', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      <Circle size={7} fill="currentColor" /> {w.is_active ? 'Active' : 'Inactive'}
                      <span style={{ color: '#cbd5e1' }}>·</span>
                      <span style={{ color: meta.color, fontWeight: 700 }}>{meta.label}</span>
                      {isDeepLink && targetIdentifier && <span style={{ color: '#94a3b8' }}>({targetIdentifier})</span>}
                      {!isDeepLink && !w.flow_id && <span style={{ color: '#d97706' }}>· No reply flow yet</span>}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                  <button
                    type="button"
                    onClick={() => (isDeepLink ? setDeepLinkEditor({ widget: w }) : handleEditWebchat(w))}
                    disabled={busyId === w.id}
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                  >
                    <Pencil size={12} /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmbedModal(w)}
                    className="btn btn-secondary btn-sm"
                    title="Embed Code"
                  >
                    <Code2 size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(w)}
                    disabled={busyId === w.id}
                    className="btn btn-danger btn-sm"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
