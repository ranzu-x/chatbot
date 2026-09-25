import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router';
import AppLayout from '../../Layout/AppLayout';
import { broadcastAPI } from '../../services/api';
import { io } from 'socket.io-client';
import { getSocketUrl, socketAuth } from '../../utils/socketAuth';
import AudienceForm from '../../Components/Broadcast/AudienceForm';
import { resolveContacts } from '../../Components/Broadcast/useBroadcastCampaign';
import { confirmBroadcastAudience, showBroadcastError, canScheduleBroadcast } from '../../Components/Broadcast/broadcastDialogs';
import {
  Megaphone, MessageCircle, Facebook, Send, Video, BarChart3, Trash2, X, ArrowRight,
  Plus, Clock, Tag, Workflow, FileText, CheckCircle2, AlertTriangle, Loader2,
  Phone, CalendarClock, Ban, Search, Inbox, Eye, Zap, SlidersHorizontal,
} from 'lucide-react';

const CHANNELS = [
  { id: 'WHATSAPP', label: 'WhatsApp',  Icon: MessageCircle, hint: '24-hour window + templates' },
  { id: 'FACEBOOK', label: 'Messenger', Icon: Facebook,      hint: 'Inside the 24-hour window' },
  { id: 'TELEGRAM', label: 'Telegram',  Icon: Send,          hint: 'No time limit' },
  { id: 'TIKTOK',   label: 'TikTok',    Icon: Video,         hint: 'Reply-only, 48 hours' },
];

const WINDOW_NOTE = {
  WHATSAPP: 'Two broadcast types, chosen when you create one (and changeable in the Broadcast element): Anytime (an approved template, which reaches subscribers outside the 24-hour window) or Inside 24 hours (free-form messages to anyone who messaged you in the last 24 hours).',
  FACEBOOK: 'Messenger only allows automated sends to subscribers inside their 24-hour window — Meta retired the old outside-window broadcast tools in Feb 2026, and the replacement is not yet open to new integrations.',
  TELEGRAM: 'No time window — reaches anyone who has ever started a chat with your bot.',
  TIKTOK: "TikTok's Business Messaging API is reply-only: a business can never start a conversation, only reply within 48 hours of the subscriber's last message. This is a platform policy, not a limitation of this app.",
};

const STATUS_META = {
  DRAFT:      { label: 'Draft',     badge: 'badge-muted',   Icon: FileText },
  SCHEDULED:  { label: 'Scheduled', badge: 'badge-primary', Icon: CalendarClock },
  PROCESSING: { label: 'Sending',   badge: 'badge-warning', Icon: Loader2 },
  COMPLETED:  { label: 'Sent',      badge: 'badge-success', Icon: CheckCircle2 },
  FAILED:     { label: 'Failed',    badge: 'badge-danger',  Icon: AlertTriangle },
  CANCELLED:  { label: 'Cancelled', badge: 'badge-muted',   Icon: Ban },
};
const STATUS_FILTERS = ['DRAFT', 'SCHEDULED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'];

/* Three hues only — the workspace accent, success and danger — plus one
   violet for "read" so it never collides with "sent". Accent-derived values
   follow Settings → Appearance automatically. */
const M = {
  sent: 'var(--primary)',
  delivered: 'var(--success)',
  read: '#8b5cf6',
  failed: 'var(--danger)',
};

const nf = (v) => (v || 0).toLocaleString();
const pctOf = (v, total) => (total > 0 ? Math.round(((v || 0) / total) * 100) : 0);

/** Date → value for <input type="datetime-local"> in the viewer's local time. */
function toLocalInput(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWhen(value) {
  if (!value) return '';
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const PAGE_CSS = `
.bc-tabs{display:inline-flex;gap:4px;padding:4px;background:var(--bg-hover);border-radius:calc(var(--radius) + 2px);flex-wrap:wrap}
.bc-tab{display:inline-flex;align-items:center;gap:7px;padding:8px 15px;border-radius:var(--radius-sm);border:none;background:transparent;cursor:pointer;font-weight:600;font-size:.85rem;color:var(--text-secondary);transition:background .15s,color .15s,box-shadow .15s}
.bc-tab:hover{color:var(--text-primary)}
.bc-tab.active{background:var(--bg-card);color:var(--primary);box-shadow:var(--shadow-sm)}

.bc-ctx{display:flex;justify-content:space-between;align-items:center;gap:18px;flex-wrap:wrap;padding:14px 16px;border:1px solid var(--border);border-left:3px solid var(--primary);border-radius:var(--radius);background:var(--bg-card)}
.bc-seg{display:inline-flex;gap:3px;padding:3px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-base);flex-shrink:0}
.bc-seg button{display:inline-flex;align-items:center;gap:6px;padding:6px 13px;border-radius:5px;border:none;cursor:pointer;font-weight:600;font-size:.78rem;background:transparent;color:var(--text-secondary);transition:all .15s}
.bc-seg button:hover{color:var(--text-primary)}
.bc-seg button.active{background:var(--primary);color:#fff}

.bc-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:14px 16px;border:1px solid var(--border);border-bottom:none;border-radius:var(--radius) var(--radius) 0 0;background:var(--bg-card)}
.bc-search{position:relative;flex:1;min-width:200px;max-width:340px}
.bc-search svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none}
.bc-search .form-input{padding-left:33px}
.bc-table-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:0 0 var(--radius) var(--radius);background:var(--bg-card)}
.bc-table{width:100%;border-collapse:collapse}
.bc-table th{padding:10px 16px;text-align:left;font-size:.7rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);white-space:nowrap;border-bottom:1px solid var(--border);background:var(--bg-base)}
.bc-table td{padding:14px 16px;font-size:.85rem;border-top:1px solid var(--border);vertical-align:middle}
.bc-table tbody tr{transition:background .12s}
.bc-table tbody tr:hover{background:var(--bg-hover)}
.bc-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:5px;font-size:.72rem;font-weight:500;color:var(--text-secondary);background:var(--bg-hover);white-space:nowrap}
.bc-chip svg{flex-shrink:0;opacity:.75}
.bc-chip.warn{background:rgba(239,68,68,.08);color:var(--danger)}
.bc-iconbtn{width:30px;height:30px;border-radius:var(--radius-sm);display:grid;place-items:center;border:1px solid var(--border);background:var(--bg-surface);color:var(--text-secondary);cursor:pointer;transition:all .15s;flex-shrink:0}
.bc-iconbtn:hover{background:var(--primary-soft);color:var(--primary);border-color:var(--primary-ring)}
.bc-iconbtn.danger:hover{background:rgba(239,68,68,.1);color:var(--danger);border-color:rgba(239,68,68,.3)}
.bc-mini{height:4px;border-radius:99px;background:var(--bg-hover);overflow:hidden;margin-top:5px;min-width:74px}
.bc-empty{padding:66px 24px;text-align:center;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg-card)}
.bc-skel{height:62px;border-top:1px solid var(--border);background:linear-gradient(90deg,var(--bg-hover) 25%,var(--bg-card) 50%,var(--bg-hover) 75%);background-size:200% 100%;animation:bcShimmer 1.4s infinite}

.bc-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(3px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;animation:bcFade .15s ease}
.bc-modal{background:var(--bg-card);border:1px solid var(--border);border-radius:calc(var(--radius) + 4px);max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.25);animation:bcPop .17s cubic-bezier(.2,.9,.3,1.1)}
.bc-modal-head{display:flex;align-items:flex-start;gap:12px;padding:18px 20px;border-bottom:1px solid var(--border);flex-shrink:0}
.bc-modal-body{padding:20px;overflow-y:auto}
.bc-modal-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:14px 20px;border-top:1px solid var(--border);background:var(--bg-base);flex-shrink:0}
.bc-slide{position:fixed;top:0;right:0;bottom:0;width:440px;max-width:94vw;background:var(--bg-card);border-left:1px solid var(--border);z-index:1001;display:flex;flex-direction:column;box-shadow:-12px 0 40px rgba(0,0,0,.16);animation:bcSlide .2s ease}
.bc-toast{position:fixed;bottom:24px;right:24px;z-index:1100;display:flex;align-items:center;gap:9px;padding:12px 16px;border-radius:var(--radius);font-weight:600;font-size:.85rem;color:#fff;box-shadow:var(--shadow-md);animation:bcUp .18s ease}
.bc-sq{border-radius:10px;display:grid;place-items:center;flex-shrink:0}
.bc-types{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media (max-width:520px){.bc-types{grid-template-columns:1fr}}
.bc-type{display:flex;flex-direction:column;gap:6px;padding:12px 13px;border:1.5px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-surface);cursor:pointer;text-align:left;transition:border-color .15s,background .15s;color:var(--text-primary);font:inherit}
.bc-type:hover{border-color:var(--primary-ring)}
.bc-type.active{border-color:var(--primary);background:var(--primary-soft)}
.bc-type-title{display:flex;align-items:center;gap:7px;font-weight:700;font-size:.84rem}
.bc-type-title svg{color:var(--primary);flex-shrink:0}
.bc-type-desc{font-size:.74rem;line-height:1.45;color:var(--text-secondary)}
.bc-spin{animation:bcSpin 1s linear infinite}
@keyframes bcFade{from{opacity:0}to{opacity:1}}
@keyframes bcPop{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}
@keyframes bcSlide{from{transform:translateX(100%)}to{transform:none}}
@keyframes bcUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes bcSpin{to{transform:rotate(360deg)}}
@keyframes bcShimmer{from{background-position:200% 0}to{background-position:-200% 0}}
`;

/* ── Pieces ──────────────────────────────────────────────────────── */

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.DRAFT;
  return (
    <span className={`badge ${meta.badge}`}>
      <meta.Icon size={11} className={status === 'PROCESSING' ? 'bc-spin' : undefined} />
      {meta.label}
    </span>
  );
}

function Chip({ icon, children, warn }) {
  return <span className={`bc-chip${warn ? ' warn' : ''}`}>{icon}{children}</span>;
}

function StatCard({ icon, tint, value, label, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: tint.bg, color: tint.fg }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div className="stat-value">{value}</div>
        <div className="stat-label">
          {label}{sub ? <span style={{ color: 'var(--text-muted)' }}> · {sub}</span> : null}
        </div>
      </div>
    </div>
  );
}

/** One metric column: count, share of the audience, and a hairline bar. */
function MetricCell({ value, total, color }) {
  const pct = pctOf(value, total);
  return (
    <div style={{ minWidth: 96 }} title={total > 0 ? `${nf(value)} of ${nf(total)} (${pct}%)` : undefined}>
      {/* "x / total" — every column counts against the same total (the campaign's targeted subscribers). */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
        <span>
          <span style={{ fontWeight: 700 }}>{nf(value)}</span>
          {total > 0 && <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}> / {nf(total)}</span>}
        </span>
        {total > 0 && <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{pct}%</span>}
      </div>
      <div className="bc-mini">
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width .3s' }} />
      </div>
    </div>
  );
}

function ModalShell({ icon, title, subtitle, onClose, width = 540, children }) {
  return (
    <div className="bc-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bc-modal" style={{ width, maxWidth: '94vw' }} role="dialog" aria-modal="true">
        <div className="bc-modal-head">
          <div className="bc-sq" style={{ width: 38, height: 38, background: 'var(--primary-soft)', color: 'var(--primary)' }}>
            {icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: '1.02rem', fontWeight: 700, lineHeight: 1.3 }}>{title}</h3>
            {subtitle && <p style={{ fontSize: '.8rem', color: 'var(--text-secondary)', marginTop: 2 }}>{subtitle}</p>}
          </div>
          <button type="button" className="bc-iconbtn" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */

export default function CampaignListPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState('WHATSAPP');
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [labels, setLabels] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [integrations, setIntegrations] = useState([]);

  const [statusFilter, setStatusFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [search, setSearch] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createIntegrationId, setCreateIntegrationId] = useState('');
  const [createMode, setCreateMode] = useState('TEMPLATE');

  const [configuring, setConfiguring] = useState(null);
  const [configIntegrationId, setConfigIntegrationId] = useState('');
  const [audienceForm, setAudienceForm] = useState({ includeLabelIds: [], excludeLabelIds: [], includeContacts: [], excludeContacts: [], tagLabelId: null });
  const [abEnabled, setAbEnabled] = useState(false);
  const [variantBTemplateId, setVariantBTemplateId] = useState('');
  const [abSplitPercent, setAbSplitPercent] = useState(50);
  const [previewCount, setPreviewCount] = useState(null);
  const [scheduleAt, setScheduleAt] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [campaignLogs, setCampaignLogs] = useState([]);
  const [variantStats, setVariantStats] = useState(null);
  const [logsLoading, setLogsLoading] = useState(false);

  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500); };

  const channel = CHANNELS.find((c) => c.id === activeTab) || CHANNELS[0];

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await broadcastAPI.getAll(activeTab);
      setCampaigns(res.data.campaigns || []);
    } catch {
      showToast('Failed to load campaigns', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  // Live status + numbers (Sending → Sent / Failed, delivered, read…) pushed
  // by the server as a broadcast runs — see utils/broadcastStats.js. A
  // reconnect reloads the list, in case an update was missed while offline.
  useEffect(() => {
    let socket;
    let connectedOnce = false;
    try {
      socket = io(getSocketUrl(), { auth: socketAuth(), transports: ['websocket', 'polling'] });
      socket.on('connect', () => {
        if (connectedOnce) loadCampaigns();
        connectedOnce = true;
      });
      socket.on('broadcast_update', (update) => {
        if (!update?.id) return;
        const merge = (c) => (c && c.id === update.id ? { ...c, ...update } : c);
        setCampaigns((prev) => prev.map(merge));
        setSelectedCampaign((prev) => merge(prev));
      });
    } catch (err) {
      console.error('[Broadcasting] live updates unavailable:', err);
    }
    return () => { socket?.disconnect(); };
  }, [loadCampaigns]);

  useEffect(() => {
    broadcastAPI.getFormData(activeTab).then((res) => {
      setLabels(res.data.labels || []);
      setTemplates(res.data.templates || []);
      const integs = res.data.integrations || [];
      setIntegrations(integs);
      // Auto-pick when there is only one account for this platform — a
      // picker with one greyed-out option is just friction.
      setCreateIntegrationId(integs.length === 1 ? String(integs[0].id) : '');
    }).catch(() => {});
  }, [activeTab]);

  function integrationLabel(i) {
    return i.wa_display_phone || i.fb_page_name || i.name || `Account #${i.id}`;
  }

  const visible = useMemo(() => campaigns.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (accountFilter && String(c.integration_id || '') !== accountFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = `${c.name || ''} ${c.flow_name || ''} ${c.template_name || ''} ${c.integration_name || ''} ${c.wa_display_phone || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [campaigns, statusFilter, accountFilter, search]);

  // Roll-up across this channel's campaigns for the summary cards.
  const totals = useMemo(() => campaigns.reduce((acc, c) => ({
    targeted: acc.targeted + (c.total_targeted || 0),
    sent: acc.sent + (c.sent_count || 0),
    delivered: acc.delivered + (c.delivered_count || 0),
    read: acc.read + (c.read_count || 0),
    failed: acc.failed + (c.failed_count || 0),
  }), { targeted: 0, sent: 0, delivered: 0, read: 0, failed: 0 }), [campaigns]);

  // Live audience preview while configuring
  useEffect(() => {
    if (!configuring) return;
    setPreviewCount(null);
    const t = setTimeout(async () => {
      try {
        const res = await broadcastAPI.audiencePreview({
          campaignId: configuring.id,
          includeLabelIds: audienceForm.includeLabelIds,
          excludeLabelIds: audienceForm.excludeLabelIds,
          includeContactIds: audienceForm.includeContacts.map((c) => c.id),
          excludeContactIds: audienceForm.excludeContacts.map((c) => c.id),
        });
        setPreviewCount(res.data.count);
      } catch { setPreviewCount(null); }
    }, 350);
    return () => clearTimeout(t);
  }, [configuring, audienceForm]);

  const handleCreateClick = () => {
    setCreateName('');
    setCreateIntegrationId(integrations.length === 1 ? String(integrations[0].id) : '');
    // Most WhatsApp audiences are outside the 24-hour window, so Anytime is the default.
    setCreateMode('TEMPLATE');
    setShowCreateModal(true);
  };

  const openConfigure = (camp) => {
    const parseIds = (v) => { try { return Array.isArray(v) ? v : JSON.parse(v || '[]'); } catch { return []; } };
    setConfiguring(camp);
    setConfigIntegrationId(camp.integration_id ? String(camp.integration_id) : (integrations.length === 1 ? String(integrations[0].id) : ''));
    setAudienceForm({
      includeLabelIds: parseIds(camp.include_label_ids),
      excludeLabelIds: parseIds(camp.exclude_label_ids),
      includeContacts: [],
      excludeContacts: [],
      tagLabelId: camp.tag_label_id || null,
    });
    // Individually picked subscribers are stored as ids — load their names back,
    // or saving here would clear them.
    Promise.all([resolveContacts(parseIds(camp.include_contact_ids)), resolveContacts(parseIds(camp.exclude_contact_ids))])
      .then(([includeContacts, excludeContacts]) => {
        if (includeContacts.length || excludeContacts.length) setAudienceForm((f) => ({ ...f, includeContacts, excludeContacts }));
      })
      .catch(() => {});
    setScheduleAt(toLocalInput(camp.scheduled_at));
    setAbEnabled(!!camp.variant_b_template_id);
    setVariantBTemplateId(camp.variant_b_template_id ? String(camp.variant_b_template_id) : '');
    setAbSplitPercent(camp.ab_split_percent || 50);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createName.trim()) return;
    if (!createIntegrationId) { showToast(`Choose which ${channel.label} account to send from`, 'error'); return; }
    setCreating(true);
    try {
      // Every broadcast is built in the Flow Builder, which opens with the
      // element this type needs already connected to the Broadcast element.
      // Only WhatsApp has the Anytime (template) type.
      const res = await broadcastAPI.startWithFlow({
        name: createName, platform: activeTab, integrationId: createIntegrationId,
        mode: activeTab === 'WHATSAPP' ? createMode : 'WINDOW',
      });
      setShowCreateModal(false);
      navigate(`/flows/${res.data.flowId}/edit`, {
        state: { from: location.pathname, label: 'Broadcasting', broadcastCampaignId: res.data.campaignId },
      });
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to create campaign', 'error');
    } finally {
      setCreating(false);
    }
  };

  // 'draft' saves only. 'now' / 'schedule' save, then confirm the server's
  // audience count (+ no-filter / large-audience warnings) before sending.
  const saveConfigure = async (sendMode) => {
    if (!configIntegrationId) { showToast('Choose which account this campaign sends from', 'error'); return; }
    if (sendMode === 'schedule') {
      if (!scheduleAt) { showToast('Pick a date/time to schedule', 'error'); return; }
      if (new Date(scheduleAt).getTime() < Date.now() + 60 * 1000) { showToast('Pick a time at least a minute from now', 'error'); return; }
    }
    setSavingConfig(true);
    try {
      const saved = await broadcastAPI.update(configuring.id, {
        ...(configuring.integration_id ? {} : { integrationId: configIntegrationId }),
        includeLabelIds: audienceForm.includeLabelIds,
        excludeLabelIds: audienceForm.excludeLabelIds,
        includeContactIds: audienceForm.includeContacts.map((c) => c.id),
        excludeContactIds: audienceForm.excludeContacts.map((c) => c.id),
        tagLabelId: audienceForm.tagLabelId,
        ...(configuring.mode === 'TEMPLATE' ? {
          variantBTemplateId: abEnabled && variantBTemplateId ? variantBTemplateId : null,
          abSplitPercent: abEnabled ? abSplitPercent : null,
        } : {}),
      });
      if (sendMode === 'draft') {
        showToast('Draft saved');
        setConfiguring(null);
        loadCampaigns();
        return;
      }
      if (saved.data.readyErrors?.length) {
        showBroadcastError({ response: { data: { message: saved.data.readyErrors[0], errors: saved.data.readyErrors } } });
        return;
      }
      const whenIso = sendMode === 'schedule' ? new Date(scheduleAt).toISOString() : null;
      const ok = await confirmBroadcastAudience({
        audience: saved.data,
        action: whenIso ? 'schedule' : 'send',
        accountLabel: configuring.wa_display_phone || configuring.integration_name,
        scheduledAt: whenIso,
      });
      if (!ok) return;
      if (whenIso) {
        const res = await broadcastAPI.schedule(configuring.id, whenIso, { confirmAudience: true });
        showToast(res.data.rescheduled ? 'Broadcast rescheduled' : 'Broadcast scheduled');
      } else {
        await broadcastAPI.sendNow(configuring.id, { confirmAudience: true });
        showToast('Broadcast started');
      }
      setConfiguring(null);
      loadCampaigns();
    } catch (err) {
      showBroadcastError(err, 'Failed to save');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleViewLogs = async (camp) => {
    setSelectedCampaign(camp);
    setLogsLoading(true);
    try {
      const res = await broadcastAPI.getOne(camp.id);
      setCampaignLogs(res.data.logs || []);
      setSelectedCampaign(res.data.campaign);
      setVariantStats(res.data.variantStats || null);
    } catch {
      showToast('Failed to load recipient logs', 'error');
    } finally {
      setLogsLoading(false);
    }
  };

  const handleCancelSchedule = async (camp) => {
    try { await broadcastAPI.cancelSchedule(camp.id); showToast('Schedule cancelled — back to Draft'); loadCampaigns(); }
    catch { showToast('Failed to cancel', 'error'); }
  };

  // The row's button for a scheduled broadcast — cancelling puts it back to Draft (nothing is sent).
  const confirmCancelSchedule = async (camp) => {
    if (!window.confirm(`Cancel the schedule of "${camp.name}"? It goes back to Draft and won't be sent.`)) return;
    await handleCancelSchedule(camp);
  };

  const handleDelete = async (camp) => {
    if (!window.confirm(`Delete campaign "${camp.name}"?`)) return;
    try {
      await broadcastAPI.delete(camp.id);
      showToast('Campaign deleted');
      if (selectedCampaign?.id === camp.id) setSelectedCampaign(null);
      loadCampaigns();
    } catch { showToast('Delete failed', 'error'); }
  };

  const contextNote = WINDOW_NOTE[activeTab];
  const filtersActive = Boolean(statusFilter || accountFilter || search.trim());

  return (
    <AppLayout>
      <style>{PAGE_CSS}</style>

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <Megaphone size={20} style={{ color: 'var(--primary)' }} /> Broadcasting
          </h1>
          <p className="page-subtitle">
            Create, schedule and track bulk campaigns across WhatsApp, Messenger, Telegram and TikTok.
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleCreateClick}>
          <Plus size={15} /> New Broadcast
        </button>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Channel switcher */}
        <div className="bc-tabs">
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              className={`bc-tab${activeTab === c.id ? ' active' : ''}`}
              onClick={() => { setActiveTab(c.id); setSelectedCampaign(null); setStatusFilter(''); setAccountFilter(''); setSearch(''); }}
            >
              <c.Icon size={15} /> {c.label}
            </button>
          ))}
        </div>

        {/* Sending rules + WhatsApp mode */}
        <div className="bc-ctx">
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: '.85rem', fontWeight: 700, marginBottom: 3 }}>
              {activeTab === 'WHATSAPP'
                ? 'Inside 24 hours or Anytime (template)'
                : `${channel.label} · ${channel.hint}`}
            </div>
            <p style={{ fontSize: '.8rem', color: 'var(--text-secondary)', lineHeight: 1.55, maxWidth: 680 }}>{contextNote}</p>
          </div>
        </div>

        {/* Summary */}
        {!loading && campaigns.length > 0 && (
          <div className="grid-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
            <StatCard
              icon={<Megaphone size={20} />} tint={{ bg: 'var(--primary-soft)', fg: 'var(--primary)' }}
              value={nf(campaigns.length)} label="Campaigns"
            />
            <StatCard
              icon={<Send size={20} />} tint={{ bg: 'var(--primary-soft)', fg: 'var(--primary)' }}
              value={nf(totals.sent)} label="Messages sent"
            />
            <StatCard
              icon={<CheckCircle2 size={20} />} tint={{ bg: 'rgba(16,185,129,.1)', fg: 'var(--success)' }}
              value={nf(totals.delivered)} label="Delivered" sub={totals.sent ? `${pctOf(totals.delivered, totals.sent)}%` : null}
            />
            <StatCard
              icon={<Eye size={20} />} tint={{ bg: 'rgba(139,92,246,.1)', fg: '#8b5cf6' }}
              value={nf(totals.read)} label="Read" sub={totals.delivered ? `${pctOf(totals.read, totals.delivered)}%` : null}
            />
            <StatCard
              icon={<AlertTriangle size={20} />} tint={{ bg: 'rgba(239,68,68,.1)', fg: 'var(--danger)' }}
              value={nf(totals.failed)} label="Failed" sub={totals.sent + totals.failed ? `${pctOf(totals.failed, totals.sent + totals.failed)}%` : null}
            />
          </div>
        )}

        {/* Toolbar + table */}
        <div>
          <div className="bc-toolbar">
            <SlidersHorizontal size={15} style={{ color: 'var(--text-muted)' }} />
            <select className="form-input" style={{ width: 'auto', minWidth: 150 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {STATUS_FILTERS.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
            </select>
            {integrations.length > 1 && (
              <select className="form-input" style={{ width: 'auto', minWidth: 170 }} value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
                <option value="">All accounts</option>
                {integrations.map((i) => <option key={i.id} value={i.id}>{integrationLabel(i)}</option>)}
              </select>
            )}
            <div className="bc-search">
              <Search size={14} />
              <input className="form-input" placeholder="Search campaigns…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <span style={{ marginLeft: 'auto', fontSize: '.78rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {loading ? 'Loading…' : `${visible.length} of ${campaigns.length} campaign${campaigns.length === 1 ? '' : 's'}`}
            </span>
          </div>

          {loading ? (
            <div className="bc-table-wrap">
              <div className="bc-skel" /><div className="bc-skel" /><div className="bc-skel" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="bc-empty" style={{ borderRadius: '0 0 var(--radius) var(--radius)' }}>
              <div className="bc-sq" style={{ width: 58, height: 58, margin: '0 auto 16px', background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                <channel.Icon size={26} strokeWidth={1.6} />
              </div>
              <h3 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>No {channel.label} broadcasts yet</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '.85rem', maxWidth: 390, margin: '0 auto' }}>
                Create one, design the message in the Flow Builder, then choose who receives it.
              </p>
              <button className="btn btn-primary" onClick={handleCreateClick} style={{ marginTop: 18 }}>
                <Plus size={15} /> New {channel.label} Broadcast
              </button>
            </div>
          ) : visible.length === 0 ? (
            <div className="bc-empty" style={{ borderRadius: '0 0 var(--radius) var(--radius)' }}>
              <Inbox size={26} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
              <h3 style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: 5 }}>No campaigns match these filters</h3>
              <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => { setStatusFilter(''); setAccountFilter(''); setSearch(''); }}>
                Clear filters
              </button>
            </div>
          ) : (
            <div className="bc-table-wrap">
              <table className="bc-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 260 }}>Campaign</th>
                    <th>Status</th>
                    <th>Sent</th>
                    <th>Delivered</th>
                    <th>Read</th>
                    <th>Failed</th>
                    <th>Schedule</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((camp) => {
                    const targeted = camp.total_targeted || 0;
                    const denom = Math.max(targeted, (camp.sent_count || 0) + (camp.failed_count || 0));
                    return (
                      <tr key={camp.id}>
                        <td>
                          <div style={{ fontWeight: 600, marginBottom: 5 }}>{camp.name}</div>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                            {camp.integration_id
                              ? <Chip icon={<Phone size={11} />}>{camp.wa_display_phone || camp.integration_name}</Chip>
                              : <Chip icon={<AlertTriangle size={11} />} warn>No account chosen</Chip>}
                            {camp.flow_name && <Chip icon={<Workflow size={11} />}>{camp.flow_name}</Chip>}
                            {camp.template_name && <Chip icon={<FileText size={11} />}>{camp.template_name}</Chip>}
                            {camp.tag_label_name && <Chip icon={<Tag size={11} />}>{camp.tag_label_name}</Chip>}
                          </div>
                        </td>
                        <td><StatusBadge status={camp.status} /></td>
                        <td><MetricCell value={camp.sent_count} total={denom} color={M.sent} /></td>
                        <td><MetricCell value={camp.delivered_count} total={denom} color={M.delivered} /></td>
                        <td><MetricCell value={camp.read_count} total={denom} color={M.read} /></td>
                        <td><MetricCell value={camp.failed_count} total={denom} color={M.failed} /></td>
                        <td style={{ whiteSpace: 'nowrap', fontSize: '.8rem', color: 'var(--text-secondary)' }}>
                          {camp.status === 'SCHEDULED' && camp.scheduled_at
                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--primary)', fontWeight: 600 }}>
                                <CalendarClock size={13} /> {formatWhen(camp.scheduled_at)}
                              </span>
                            : camp.status === 'DRAFT'
                              ? <span style={{ color: 'var(--text-muted)' }}>{camp.scheduled_at ? `Planned · ${formatWhen(camp.scheduled_at)}` : 'Not scheduled'}</span>
                              : formatWhen(camp.updated_at || camp.created_at)}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                            {camp.status === 'SCHEDULED' ? (
                              <button className="btn btn-sm btn-secondary" onClick={() => confirmCancelSchedule(camp)}>Cancel Schedule</button>
                            ) : ['DRAFT', 'FAILED'].includes(camp.status) && (
                              <button className="btn btn-sm btn-primary" onClick={() => openConfigure(camp)}>Configure &amp; Send</button>
                            )}
                            {camp.flow_id && ['DRAFT', 'FAILED', 'SCHEDULED'].includes(camp.status) && (
                              <button className="bc-iconbtn" title="Edit in Flow Builder" onClick={() => navigate(`/flows/${camp.flow_id}/edit`, { state: { from: location.pathname, label: 'Broadcasting' } })}>
                                <Workflow size={14} />
                              </button>
                            )}
                            <button className="bc-iconbtn" title="Delivery report" onClick={() => handleViewLogs(camp)}>
                              <BarChart3 size={14} />
                            </button>
                            <button className="bc-iconbtn danger" title="Delete campaign" onClick={() => handleDelete(camp)}>
                              <Trash2 size={14} />
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

          {filtersActive && visible.length > 0 && (
            <div style={{ marginTop: 10, fontSize: '.78rem', color: 'var(--text-muted)' }}>
              Filters applied ·{' '}
              <button onClick={() => { setStatusFilter(''); setAccountFilter(''); setSearch(''); }} style={{ color: 'var(--primary)', fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Delivery report slide-over ── */}
      {selectedCampaign && (
        <>
          <div className="bc-overlay" style={{ display: 'block', padding: 0 }} onMouseDown={() => setSelectedCampaign(null)} />
          <aside className="bc-slide">
            <div className="bc-modal-head">
              <div className="bc-sq" style={{ width: 38, height: 38, background: 'var(--primary-soft)', color: 'var(--primary)' }}>
                <BarChart3 size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedCampaign.name}</h3>
                <p style={{ fontSize: '.78rem', color: 'var(--text-secondary)' }}>Delivery report</p>
              </div>
              <button className="bc-iconbtn" onClick={() => setSelectedCampaign(null)} aria-label="Close"><X size={15} /></button>
            </div>

            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {[
                  ['Targeted', selectedCampaign.total_targeted, 'var(--text-primary)'],
                  ['Sent', selectedCampaign.sent_count, M.sent],
                  ['Delivered', selectedCampaign.delivered_count, M.delivered],
                  ['Read', selectedCampaign.read_count, M.read],
                  ['Failed', selectedCampaign.failed_count, M.failed],
                ].map(([label, value, color]) => (
                  <div key={label} style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color }}>{nf(value)}</div>
                    <div style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
                  </div>
                ))}
              </div>
              {selectedCampaign.error_message && (
                <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(239,68,68,.07)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 'var(--radius-sm)', fontSize: '.78rem', color: 'var(--danger)' }}>
                  {selectedCampaign.error_message}
                </div>
              )}

              {selectedCampaign.variant_b_template_id && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', fontWeight: 700, marginBottom: 8 }}>
                    <Zap size={13} /> A/B Results
                  </div>
                  {(!variantStats || variantStats.length === 0) ? (
                    <p style={{ fontSize: '.76rem', color: 'var(--text-muted)', margin: 0 }}>No sends yet for either variant.</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {['A', 'B'].map((v) => {
                        const stat = variantStats.find((s) => s.variant === v) || { targeted: 0, sent: 0, delivered: 0, read_count: 0, failed: 0 };
                        const label = v === 'A' ? selectedCampaign.template_name : selectedCampaign.variant_b_template_name;
                        return (
                          <div key={v} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px' }}>
                            <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                              Variant {v}{label ? ` — ${label}` : ''}
                            </div>
                            <div style={{ display: 'flex', gap: 14, fontSize: '.78rem' }}>
                              <span>Sent <strong>{nf(stat.sent)}</strong></span>
                              <span>Delivered <strong>{nf(stat.delivered)}</strong> ({pctOf(stat.delivered, stat.sent)}%)</span>
                              <span>Read <strong>{nf(stat.read_count)}</strong> ({pctOf(stat.read_count, stat.sent)}%)</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ padding: '14px 20px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '.8rem', fontWeight: 700 }}>Recipients</span>
              <span style={{ fontSize: '.74rem', color: 'var(--text-muted)' }}>{campaignLogs.length} record{campaignLogs.length === 1 ? '' : 's'}</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 20px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {logsLoading ? (
                <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}><Loader2 size={20} className="bc-spin" /></div>
              ) : campaignLogs.length === 0 ? (
                <div style={{ fontSize: '.84rem', color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>No recipient logs yet.</div>
              ) : campaignLogs.map((log) => {
                const c = log.status === 'DELIVERED' ? M.delivered
                  : log.status === 'READ' ? M.read
                  : log.status === 'FAILED' ? M.failed
                  : log.status === 'SENT' ? M.sent : 'var(--text-secondary)';
                return (
                  <div key={log.id} style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.contact_name || log.phone || 'Contact'}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '.72rem', fontWeight: 700, color: c, flexShrink: 0 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 99, background: c }} />
                        {log.status}
                      </span>
                    </div>
                    {log.error_message && <div style={{ color: 'var(--danger)', fontSize: '.72rem', marginTop: 4 }}>{log.error_message}</div>}
                  </div>
                );
              })}
            </div>
          </aside>
        </>
      )}

      {/* ── Create modal ── */}
      {showCreateModal && (
        <ModalShell
          icon={<channel.Icon size={18} />}
          title={`New ${channel.label} Broadcast`}
          subtitle="Name it and pick the account — then design the message and audience in the Flow Builder."
          onClose={() => setShowCreateModal(false)}
        >
          <form onSubmit={handleCreateSubmit}>
            <div className="bc-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Campaign name</label>
                <input className="form-input" required autoFocus placeholder="e.g. Weekend Sale Announcement" value={createName} onChange={(e) => setCreateName(e.target.value)} autoComplete="off" />
              </div>

              <div className="form-group">
                <label className="form-label">Send from</label>
                {integrations.length === 0 ? (
                  <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'rgba(239,68,68,.07)', border: '1px solid rgba(239,68,68,.2)', fontSize: '.79rem', color: 'var(--danger)' }}>
                    <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                    No active {channel.label} account connected — connect one under Connect Account first.
                  </div>
                ) : (
                  <select className="form-input" required value={createIntegrationId} onChange={(e) => setCreateIntegrationId(e.target.value)}>
                    <option value="">— Select an account —</option>
                    {integrations.map((i) => <option key={i.id} value={i.id}>{integrationLabel(i)}</option>)}
                  </select>
                )}
                {integrations.length > 1 && (
                  <p style={{ fontSize: '.73rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    This workspace has more than one {channel.label} account — the campaign only reaches subscribers relative to the one you pick here.
                  </p>
                )}
              </div>

              {activeTab === 'WHATSAPP' && (
                <div className="form-group">
                  <label className="form-label">Broadcast type</label>
                  <div className="bc-types" role="radiogroup" aria-label="Broadcast type">
                    {[
                      { value: 'TEMPLATE', Icon: FileText, title: 'Anytime', desc: 'An approved message template. Reaches subscribers even if they haven’t written in the last 24 hours.' },
                      { value: 'WINDOW', Icon: MessageCircle, title: 'Inside 24 hours', desc: 'Free-form messages, only to subscribers who wrote to you in the last 24 hours.' },
                    ].map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        role="radio"
                        aria-checked={createMode === t.value}
                        className={`bc-type${createMode === t.value ? ' active' : ''}`}
                        onClick={() => setCreateMode(t.value)}
                      >
                        <span className="bc-type-title"><t.Icon size={15} />{t.title}</span>
                        <span className="bc-type-desc">{t.desc}</span>
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: '.73rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    You can still switch it later in the Broadcast element’s settings.
                  </p>
                </div>
              )}

            </div>

            <div className="bc-modal-foot" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={creating || integrations.length === 0}>
                {creating ? <><Loader2 size={14} className="bc-spin" /> Creating…</> : <>Create &amp; open Flow Builder <ArrowRight size={14} /></>}
              </button>
            </div>
          </form>
        </ModalShell>
      )}

      {/* ── Configure audience & send ── */}
      {configuring && (
        <ModalShell icon={<Send size={18} />} title="Configure & Send" subtitle={configuring.name} width={580} onClose={() => setConfiguring(null)}>
          <div className="bc-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="form-group">
              <label className="form-label">Send from</label>
              {configuring.integration_id ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'var(--bg-hover)', fontSize: '.85rem', fontWeight: 600 }}>
                  <Phone size={14} style={{ color: 'var(--text-muted)' }} />
                  {configuring.wa_display_phone || configuring.integration_name || `Account #${configuring.integration_id}`}
                  <span style={{ marginLeft: 'auto', fontSize: '.72rem', fontWeight: 500, color: 'var(--text-muted)' }}>Fixed for this broadcast</span>
                </div>
              ) : (
                <>
                  <select className="form-input" value={configIntegrationId} onChange={(e) => setConfigIntegrationId(e.target.value)}>
                    <option value="">— Select an account —</option>
                    {integrations.map((i) => <option key={i.id} value={i.id}>{integrationLabel(i)}</option>)}
                  </select>
                  {!configIntegrationId && (
                    <p style={{ fontSize: '.73rem', color: 'var(--danger)' }}>Required — a campaign with no account chosen cannot be sent.</p>
                  )}
                </>
              )}
              {configuring.flow_id && (
                <button
                  type="button"
                  onClick={() => navigate(`/flows/${configuring.flow_id}/edit`, { state: { from: location.pathname, label: 'Broadcasting' } })}
                  style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, background: 'none', border: 'none', padding: 0, color: 'var(--primary)', fontWeight: 600, fontSize: '.78rem', cursor: 'pointer' }}
                >
                  <Workflow size={13} /> Edit the message in the Flow Builder
                </button>
              )}
            </div>

            <div style={{ height: 1, background: 'var(--border)' }} />

            <AudienceForm platform={configuring.platform} integrationId={configuring.integration_id || configIntegrationId || null} labels={labels} value={audienceForm} onChange={setAudienceForm} previewCount={previewCount} />

            {configuring.mode === 'TEMPLATE' && (
              <>
                <div style={{ height: 1, background: 'var(--border)' }} />
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: abEnabled ? 10 : 0 }}>
                    <input type="checkbox" checked={abEnabled} onChange={(e) => setAbEnabled(e.target.checked)} />
                    <span className="form-label" style={{ margin: 0 }}>A/B test two message variants</span>
                  </label>
                  {abEnabled && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 24 }}>
                      <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', margin: 0 }}>
                        Variant A is the template chosen when this campaign was created ({configuring.template_name || 'template'}). Pick Variant B and how the audience splits — delivery and read rates are compared per variant once sent.
                      </p>
                      <div className="form-group">
                        <label className="form-label">Variant B template</label>
                        <select className="form-input" value={variantBTemplateId} onChange={(e) => setVariantBTemplateId(e.target.value)}>
                          <option value="">— Select an approved template —</option>
                          {templates.filter((t) => String(t.id) !== String(configuring.template_id)).map((t) => (
                            <option key={t.id} value={t.id}>{t.template_name} ({t.language})</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Split: {abSplitPercent}% Variant A / {100 - abSplitPercent}% Variant B</label>
                        <input
                          type="range" min={1} max={99} value={abSplitPercent}
                          onChange={(e) => setAbSplitPercent(Number(e.target.value))}
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            <div style={{ height: 1, background: 'var(--border)' }} />

            <div>
              <label className="form-label" style={{ display: 'block', marginBottom: 8 }}>{configuring.status === 'SCHEDULED' ? 'Schedule' : 'When to send'}</label>
              {configuring.status === 'SCHEDULED' && configuring.scheduled_at && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', marginBottom: 10, borderRadius: 'var(--radius-sm)', background: 'var(--primary-soft)', border: '1px solid var(--primary-ring)', fontSize: '.82rem' }}>
                  <CalendarClock size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                  <span>Scheduled for <strong>{new Date(configuring.scheduled_at).toLocaleString()}</strong></span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" disabled={savingConfig || !previewCount || !configIntegrationId} onClick={() => saveConfigure('now')}>
                  {savingConfig ? <><Loader2 size={14} className="bc-spin" /> Working…</> : <><Send size={14} /> Send Now</>}
                </button>
                {canScheduleBroadcast(configuring.platform, configuring.mode) && (
                  <>
                    <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>or</span>
                    <input type="datetime-local" aria-label="Send date and time" className="form-input" style={{ flex: 1, minWidth: 190, width: 'auto' }} min={toLocalInput(Date.now() + 60 * 1000)} value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
                    <button className="btn btn-secondary" disabled={savingConfig || !previewCount || !configIntegrationId} onClick={() => saveConfigure('schedule')}>
                      <CalendarClock size={14} /> {configuring.status === 'SCHEDULED' ? 'Reschedule' : 'Schedule'}
                    </button>
                  </>
                )}
              </div>
              {!canScheduleBroadcast(configuring.platform, configuring.mode) && (
                <p style={{ fontSize: '.76rem', color: 'var(--text-muted)', marginTop: 9, lineHeight: 1.5 }}>
                  An Inside 24 hours broadcast can&apos;t be scheduled — who is inside the window changes by the hour. To schedule it, switch it to Anytime (template) in the Flow Builder.
                </p>
              )}
              {!previewCount && (
                <p style={{ fontSize: '.76rem', color: 'var(--danger)', marginTop: 9 }}>
                  No subscribers match this targeting yet — adjust the Include/Exclude rules above.
                </p>
              )}
            </div>
          </div>

          <div className="bc-modal-foot">
            {configuring.status === 'SCHEDULED' ? (
              <button className="btn btn-secondary" onClick={async () => { await handleCancelSchedule(configuring); setConfiguring(null); }} disabled={savingConfig}>
                <Ban size={14} /> Cancel schedule
              </button>
            ) : (
              <button className="btn btn-secondary" onClick={() => saveConfigure('draft')} disabled={savingConfig}>Save as draft</button>
            )}
            <button className="btn btn-secondary" onClick={() => setConfiguring(null)}>Close</button>
          </div>
        </ModalShell>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="bc-toast" style={{ background: toast.type === 'error' ? 'var(--danger)' : 'var(--success)' }}>
          {toast.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          {toast.msg}
        </div>
      )}
    </AppLayout>
  );
}
