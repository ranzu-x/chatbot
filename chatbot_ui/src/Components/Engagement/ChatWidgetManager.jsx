import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { channelAPI, integrationAPI } from '../../services/api';
import { notify } from '../../utils/alerts';
import { getBackendOrigin, resolveAssetUrl } from '../../utils/assetUrl';
import {
  getWidgetPlatform, validateWebsiteUrl, createChatWidgetAndFlow,
  createReplyFlowForWidget, confirmAndDeleteWidget,
} from '../../utils/chatWidgetHelpers';
import DeepLinkWidgetEditor from './DeepLinkWidgetEditor';
import {
  MessageCircle, Copy, Check, Info, ExternalLink, Plus, Pencil, Trash2, Code2, Circle,
  Facebook, Instagram, Send as TelegramIcon, Globe, ChevronDown, AlertTriangle, X,
} from 'lucide-react';

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
      <ChatWidgetList selectedAccount={selectedAccount} />

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
  return `<script src="${getBackendOrigin()}/widget.js" data-key="${widgetKey}"></script>`;
}

const CREATE_TYPE_OPTIONS = [
  { type: 'WHATSAPP', label: 'WhatsApp', sub: 'Interactive WhatsApp widget + bot reply flow' },
  { type: 'WEBCHAT', label: 'Webchat', sub: 'Full in-page chat window + bot reply flow' },
  { type: 'FACEBOOK', label: 'Messenger', sub: 'Messenger chat widget + bot reply flow' },
  { type: 'TELEGRAM', label: 'Telegram', sub: 'Telegram bot widget + bot reply flow' },
  { type: 'INSTAGRAM', label: 'Instagram', sub: 'Instagram DM widget + bot reply flow' },
];

function ChatWidgetList({ selectedAccount }) {
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
  const createMenuRef = useRef(null);
  // Website-URL-at-creation flow (Req #3) — selecting a platform from the
  // create menu no longer creates the widget immediately, it first opens
  // this prompt; the widget is only created once a real website URL is
  // validated (see validateWebsiteUrl in utils/chatWidgetHelpers.js).
  const [pendingPlatform, setPendingPlatform] = useState(null);
  const [websiteUrlInput, setWebsiteUrlInput] = useState('');
  const [websiteUrlError, setWebsiteUrlError] = useState('');
  // A widget with no website configured is currently rejected by the
  // backend on every public request (see routes/webchat.js) — this lets an
  // existing widget's website be set/fixed from the list without going
  // through the create flow again.
  const [fixDomainWidget, setFixDomainWidget] = useState(null);
  const [fixDomainInput, setFixDomainInput] = useState('');
  const [fixDomainError, setFixDomainError] = useState('');
  const [fixDomainSaving, setFixDomainSaving] = useState(false);

  // Only ever the platform to filter by, never "webchat vs not webchat" —
  // "All Accounts" (selectedAccount null/'all') means no filter at all,
  // matching the same convention used elsewhere in BotManagerPage.
  const platformFilter = selectedAccount && selectedAccount !== 'all' ? (selectedAccount.platform || '').toUpperCase() : null;

  useEffect(() => { fetchAll(); }, [platformFilter]);

  useEffect(() => {
    if (!showCreateMenu) return;
    const onClickOutside = (e) => { if (createMenuRef.current && !createMenuRef.current.contains(e.target)) setShowCreateMenu(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showCreateMenu]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [wRes, iRes] = await Promise.all([
        channelAPI.getWebchat(platformFilter ? { platform: platformFilter } : undefined),
        integrationAPI.getAll(),
      ]);
      // Server-side filtering already applies — this re-filter is cheap
      // defense-in-depth, matching this file's existing local-filter pattern.
      let list = wRes.data?.widgets || [];
      if (platformFilter) list = list.filter((w) => getWidgetPlatform(w) === platformFilter);
      setWidgets(list);
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

  // Creates the chat widget record + flow record and drops the agent straight
  // into Flow Builder. `websiteHostname` is already validated (see
  // validateWebsiteUrl) by the time this runs — it becomes the widget's
  // allowed_domains, so the widget is server-side domain-restricted from the
  // moment it exists.
  const handleCreateWidget = async (platformType, websiteHostname) => {
    if (creating) return;
    setCreating(true);
    try {
      const isWebchat = platformType === 'WEBCHAT';
      const normPlat = platformType.toUpperCase();
      const firstMatch = integrations.find((i) => (i.platform || '').toUpperCase() === normPlat);
      const integrationId = isWebchat ? null : (firstMatch?.id || null);

      const count = widgets.filter((w) => getWidgetPlatform(w) === normPlat).length + 1;
      const name = `${platformType.charAt(0) + platformType.slice(1).toLowerCase()} Widget ${count}`;
      const platColor = normPlat === 'WHATSAPP' ? '#25D366' : normPlat === 'FACEBOOK' ? '#0084FF' : normPlat === 'TELEGRAM' ? '#26A5E4' : normPlat === 'INSTAGRAM' ? '#E1306C' : '#6366f1';

      const { flowId } = await createChatWidgetAndFlow({
        platformType: normPlat,
        name,
        websiteHostname,
        integrationId,
        extraWidgetFields: {
          primaryColor: platColor,
          buttonBgColor: platColor,
          buttonText: 'Chat with us',
          greetingMessage: `Hello! Thanks for reaching out to us on ${platformType}. How can we help?`,
        },
      });

      // Navigate directly into Flow Builder!
      if (flowId) {
        openInFlowBuilder(flowId);
      } else {
        fetchAll();
      }
    } catch (err) {
      console.error('Failed to create chat widget', err);
      notify.error(err?.response?.data?.message || 'Failed to create chat widget');
    } finally {
      setCreating(false);
    }
  };

  // Edits any widget by opening its linked flow in Flow Builder
  const handleEditWidget = async (widget) => {
    if (widget.flow_id) {
      openInFlowBuilder(widget.flow_id);
      return;
    }
    setBusyId(widget.id);
    try {
      const flowId = await createReplyFlowForWidget(widget);
      if (flowId) openInFlowBuilder(flowId);
    } catch (err) {
      console.error('Failed to set up reply flow', err);
      notify.error('Failed to open Flow Builder for this widget');
    } finally {
      setBusyId(null);
    }
  };

  // Opens the website-URL prompt instead of creating the widget immediately.
  const handleCreateMenuSelect = (opt) => {
    setShowCreateMenu(false);
    setPendingPlatform(opt.type);
    setWebsiteUrlInput('');
    setWebsiteUrlError('');
  };

  const handleWebsiteUrlContinue = () => {
    const result = validateWebsiteUrl(websiteUrlInput);
    if (!result.ok) {
      setWebsiteUrlError(result.error);
      return;
    }
    const platform = pendingPlatform;
    setPendingPlatform(null);
    handleCreateWidget(platform, result.hostname);
  };

  const openFixDomainModal = (widget) => {
    setFixDomainWidget(widget);
    setFixDomainInput('');
    setFixDomainError('');
  };

  const handleFixDomainSave = async () => {
    const result = validateWebsiteUrl(fixDomainInput);
    if (!result.ok) {
      setFixDomainError(result.error);
      return;
    }
    setFixDomainSaving(true);
    try {
      await channelAPI.updateWebchat(fixDomainWidget.id, { allowedDomains: result.hostname });
      setWidgets((prev) => prev.map((w) => (w.id === fixDomainWidget.id ? { ...w, allowed_domains: result.hostname } : w)));
      setFixDomainWidget(null);
      notify.success('Website saved — this widget is now active.');
    } catch (err) {
      console.error('Failed to save widget website', err);
      setFixDomainError(err?.response?.data?.message || 'Failed to save. Please try again.');
    } finally {
      setFixDomainSaving(false);
    }
  };

  const handleDelete = async (widget) => {
    setBusyId(widget.id);
    try {
      const deleted = await confirmAndDeleteWidget(widget);
      if (deleted) setWidgets((prev) => prev.filter((w) => w.id !== widget.id));
    } catch (err) {
      console.error('Failed to delete widget', err);
      notify.error('Failed to delete widget');
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

      {/* Website URL prompt — Req #3: Create -> Enter Website URL -> Flow Builder */}
      {pendingPlatform && (
        <div className="modal-overlay" onClick={() => setPendingPlatform(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              Where will you use this Chat Widget?
              <button type="button" onClick={() => setPendingPlatform(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}>
                <X size={16} />
              </button>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
              This Chat Widget can only be used on the website you specify — including its subdomains. You can add more websites later.
            </p>
            <input
              type="text"
              autoFocus
              placeholder="https://example.com"
              value={websiteUrlInput}
              onChange={(e) => { setWebsiteUrlInput(e.target.value); setWebsiteUrlError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleWebsiteUrlContinue(); }}
              style={{ width: '100%', height: 38, padding: '0 12px', borderRadius: 8, border: `1px solid ${websiteUrlError ? '#fca5a5' : '#e2e8f0'}`, fontSize: '0.86rem', fontFamily: 'monospace', boxSizing: 'border-box' }}
            />
            {websiteUrlError && <p style={{ fontSize: '0.76rem', color: '#dc2626', margin: '6px 0 0' }}>{websiteUrlError}</p>}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setPendingPlatform(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={creating} onClick={handleWebsiteUrlContinue}>
                {creating ? 'Creating…' : 'Continue'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fix-domain prompt — for an existing widget with no website set yet */}
      {fixDomainWidget && (
        <div className="modal-overlay" onClick={() => setFixDomainWidget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <div className="modal-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              Set Website — {fixDomainWidget.name}
              <button type="button" onClick={() => setFixDomainWidget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}>
                <X size={16} />
              </button>
            </div>
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
                      <img
                        src={resolveAssetUrl(w.logo_url)}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }}
                      />
                    ) : null}
                    <meta.icon size={16} color="#fff" style={{ display: w.logo_url ? 'none' : 'flex' }} />
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

                {/* Website (Req #8) — always the widget's own allowed_domains,
                    never localhost/ngrok/this SaaS app's own URL. An unset
                    website means the widget is currently rejected on every
                    public request (see routes/webchat.js), so this state is
                    surfaced as a warning with a direct fix, not left blank. */}
                {w.allowed_domains && w.allowed_domains.trim() ? (
                  <div style={{ fontSize: '0.76rem', color: '#475569', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Globe size={12} color="#94a3b8" />
                    {w.allowed_domains.split(',')[0].trim()}
                    {w.allowed_domains.split(',').length > 1 && (
                      <span style={{ color: '#94a3b8' }}>+{w.allowed_domains.split(',').length - 1} more</span>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openFixDomainModal(w)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.76rem', color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', width: 'fit-content' }}
                  >
                    <AlertTriangle size={12} /> Not configured — disabled until a website is set
                  </button>
                )}

                <div style={{ display: 'flex', gap: 6, marginTop: 'auto' }}>
                  <button
                    type="button"
                    onClick={() => handleEditWidget(w)}
                    disabled={busyId === w.id}
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                  >
                    <Pencil size={12} /> Edit Flow
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
